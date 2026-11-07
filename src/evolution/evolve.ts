import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { currentVersion, HISTORY, saveVersion, setCurrent, type AgentConfig } from "../agent/config.js";
import { loadTasks } from "../benchmark/tasks.js";
import { providerFor, callLLM, parseJsonLoose } from "../providers/index.js";
import { appendJsonl, emit, RESULTS, ROOT, writeJson } from "../trace/recorder.js";
import { evaluateConfig, type EvalResult } from "./evaluate.js";
import { analyzeFailures } from "./analyze.js";
import { applyPatch, generateMutations, type MutationProposal } from "./mutate.js";
import { decide, type Decision } from "./promote.js";
import { renderReport } from "./report.js";

function readTraces(file: string) {
  return readFileSync(file, "utf8").trim().split("\n").map((l) => JSON.parse(l));
}

function mutationHistory() {
  const dir = join(ROOT, "mutations");
  if (!existsSync(dir)) return [];
  return readdirSync(dir).filter((f) => f.endsWith(".json")).map((f) => JSON.parse(readFileSync(join(dir, f), "utf8")))
    .map((m) => ({ proposedChange: m.proposal.proposedChange, target: m.proposal.target, decision: m.decision?.decision, reasons: m.decision?.reasons }));
}

function log(...a: unknown[]) { console.log(...a); emit({ type: "log", msg: a.map(String).join(" ") }); }

export async function evolve(opts: { reps: number; candidates: number; iterations: number }) {
  for (let it = 0; it < opts.iterations; it++) await evolveOnce(opts);
}

async function evolveOnce(opts: { reps: number; candidates: number }) {
  const runId = `evo-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`;
  const parent = currentVersion();
  const coder = providerFor("coder")!;
  const mutator = providerFor("mutator")!;
  const verifier = providerFor("verifier");
  const all = loadTasks("all");
  const dev = all.filter((t) => t.split === "dev");
  const val = all.filter((t) => t.split === "val");
  log(`\n=== AGENTGYM EVOLUTION ${runId} ===`);
  log(`parent ${parent.version} | coder ${coder.label} [${coder.model}] | analyzer subquadratic [${process.env.SUBQ_SNAP_MODEL || "subq-snap-1.1"}] | mutator ${mutator.label} [${mutator.model}]`);
  log(`dev=${dev.map((t) => t.id).join(",")} val=${val.map((t) => t.id).join(",")} reps=${opts.reps} (test split untouched)`);

  // 1. run parent on dev split
  log(`\n[1/5] running ${parent.version} on dev split...`);
  const devEval = await evaluateConfig(parent, dev, coder, { reps: opts.reps, split: "dev", runId });
  log(`      dev: ${devEval.totals.runPasses}/${devEval.totals.runs} passed independent grading (${devEval.totals.selfReportOverclaims} self-reported success but failed)`);

  // 2. subquadratic long-context failure analysis across all dev traces
  log(`\n[2/5] SubQ Snap analyzing ${devEval.totals.runs} dev traces...`);
  const traces = readTraces(devEval.tracesFile).map((t: any) => ({ ...t, grade: t.grade }));
  const history = mutationHistory();
  const diagnosis = await analyzeFailures(traces, dev, parent, history, { runId });
  writeJson(join(RESULTS, "runs", runId, "diagnosis.json"), diagnosis);
  log(`      ${diagnosis.summary}`);
  if (devEval.totals.runPasses === devEval.totals.runs && process.env.FORCE_MUTATE !== "1") {
    log(`\nno dev failures → nothing to learn from; skipping mutation (set FORCE_MUTATE=1 to override). ${parent.version} remains current.`);
    appendJsonl(HISTORY, { t: new Date().toISOString(), event: "no_failures", version: parent.version, runId });
    return null;
  }

  // 3. meta mutation generation
  log(`\n[3/5] ${mutator.label} generating ${opts.candidates} mutations...`);
  const evidence = traces.filter((t: any) => !t.grade.passed).map((t: any) =>
    `## ${t.traceId}\nagent reasoning (last attempt): ${t.attempts.at(-1)?.reasoning?.slice(0, 600)}\nself-reported success: ${t.selfReportedSuccess}\nindependent grader failing tests: ${t.grade.failingTests.join("; ")}`).join("\n\n");
  const proposals = await generateMutations(diagnosis, parent, evidence, opts.candidates, mutator, all, history, { runId });
  for (const p of proposals) log(`      ${p.candidateVersion}: ${p.proposedChange} ${p.guard.ok ? "" : `[GUARD REJECTED: ${p.guard.violations.join("; ")}]`}`);

  // optional advisory verifier (gemini) — never the acceptance authority
  const reviews: Record<string, unknown> = {};
  if (verifier) {
    for (const p of proposals) {
      try {
        const r = await callLLM("verifier", verifier, {
          system: "You are an independent verifier of proposed changes to a coding agent's configuration. Be adversarial.",
          user: `Diagnosis: ${diagnosis.summary}\nProposed patch: ${JSON.stringify(p.patch)}\nReturn JSON {"risk": "low|medium|high", "overfittingConcerns": "...", "overlookedAssumptions": "...", "suggestedAdversarialChecks": ["..."]}`,
          json: true,
        }, { runId, mutation: p.id });
        reviews[p.id] = { provider: r.provider, model: r.model, report: parseJsonLoose(r.text) };
      } catch (e) { reviews[p.id] = { error: String(e) }; }
    }
  }

  // 4. evaluate parent + candidates on validation split, identical conditions
  log(`\n[4/5] validation: ${parent.version} + ${proposals.filter((p) => p.guard.ok).length} candidates on ${val.length} unseen tasks x${opts.reps}...`);
  const candidates: { p: MutationProposal; cfg: AgentConfig }[] = proposals.filter((p) => p.guard.ok).map((p) => ({ p, cfg: applyPatch(parent, p.patch, p.candidateVersion, p.id) }));
  const [parentVal, ...candVals] = await Promise.all([
    evaluateConfig(parent, val, coder, { reps: opts.reps, split: "val", runId }),
    ...candidates.map((c) => evaluateConfig(c.cfg, val, coder, { reps: opts.reps, split: "val", runId })),
  ]);

  // 5. promotion gate
  log(`\n[5/5] promotion gate`);
  const decisions: Decision[] = [];
  for (const p of proposals) {
    const idx = candidates.findIndex((c) => c.p.id === p.id);
    const d: Decision = idx >= 0 ? decide(parentVal, candVals[idx], []) : {
      candidate: p.candidateVersion, parent: parent.version, decision: "REJECT", reasons: p.guard.violations, parentScore: parentVal.totals.runPasses,
      candidateScore: NaN, runs: 0, newlyPassing: [], regressions: [], tokenDelta: 0,
    };
    decisions.push(d);
    if (idx >= 0) saveVersion(candidates[idx].cfg); // every candidate is versioned, promoted or not
    writeJson(join(ROOT, "mutations", `${p.id}.json`), { proposal: p, decision: d, review: reviews[p.id] ?? null, evaluation: idx >= 0 ? candVals[idx].evalId : null });
    log(`      ${d.candidate}: ${d.decision} — ${d.reasons.join("; ")}`);
  }
  const winners = decisions.map((d, i) => ({ d, i })).filter((x) => x.d.decision === "PROMOTE")
    .sort((a, b) => b.d.candidateScore - a.d.candidateScore || a.d.tokenDelta - b.d.tokenDelta);
  const promoted = winners[0]?.d.candidate ?? null;
  if (promoted) setCurrent(promoted, `promoted in ${runId}`);
  else appendJsonl(HISTORY, { t: new Date().toISOString(), event: "rollback_preserved", version: parent.version, runId, reason: "no candidate passed the gate" });
  log(promoted ? `\nPROMOTED ${promoted} (parent ${parent.version} preserved for rollback)` : `\nNO PROMOTION — ${parent.version} remains current`);

  const record = { runId, parent: parent.version, coder: { id: coder.id, model: coder.model, label: coder.label }, mutator: { id: mutator.id, model: mutator.model, label: mutator.label },
    devEval: devEval.evalId, devTotals: devEval.totals, diagnosis, proposals, reviews, parentVal: { evalId: parentVal.evalId, totals: parentVal.totals, perTask: Object.fromEntries(Object.entries(parentVal.perTask).map(([k, v]) => [k, `${v.passes}/${v.reps}`])) },
    candidateVals: candVals.map((c) => ({ version: c.version, evalId: c.evalId, totals: c.totals, perTask: Object.fromEntries(Object.entries(c.perTask).map(([k, v]) => [k, `${v.passes}/${v.reps}`])) })),
    decisions, promoted, finishedAt: new Date().toISOString() };
  writeJson(join(RESULTS, "evolutions", `${runId}.json`), record);
  const md = renderReport(record);
  writeJson(join(RESULTS, "evolutions", "latest.json"), { runId });
  (await import("node:fs")).writeFileSync(join(RESULTS, "evolutions", `${runId}.md`), md);
  console.log("\n" + md);
  emit({ type: "evolution_end", record });
  return record;
}
