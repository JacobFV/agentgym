import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { RESULTS } from "../trace/recorder.js";

export function renderReport(r: any): string {
  const lines = [
    `AGENT EVOLUTION RUN ${r.runId}`,
    ``,
    `coder:    ${r.coder.label} [${r.coder.model}]`,
    `analyzer: subquadratic ${r.diagnosis.analyzer.model} ${r.diagnosis.analyzer.endpoint} (${r.diagnosis.analyzer.inputTokens} input tokens, ${r.diagnosis.analyzer.questions} typed questions)`,
    `mutator:  ${r.mutator.label} [${r.mutator.model}]`,
    ``,
    `baseline: ${r.parent}`,
    `dev: ${r.devTotals.runPasses}/${r.devTotals.runs} passed independent grading; ${r.devTotals.selfReportOverclaims} overclaimed success`,
    `diagnosis: ${r.diagnosis.summary}`,
    `mutation proposals generated: ${r.proposals.length}`,
    ``,
    `validation (unseen tasks):`,
    `  ${r.parent.padEnd(8)} ${r.parentVal.totals.runPasses}/${r.parentVal.totals.runs}  ${JSON.stringify(r.parentVal.perTask)}`,
    ...r.candidateVals.map((c: any) => `  ${c.version.padEnd(8)} ${c.totals.runPasses}/${c.totals.runs}  ${JSON.stringify(c.perTask)}  tokens=${c.totals.tokens}`),
    ``,
    ...r.decisions.map((d: any, i: number) => `${d.candidate}: ${d.decision}\n  change: ${r.proposals[i]?.proposedChange}\n  why:    ${d.reasons.join("; ")}`),
    ``,
    `result: ${r.promoted ? `PROMOTED ${r.promoted}` : `NO PROMOTION — ${r.parent} preserved`}`,
    ``,
    `evidence:`,
    `  results/evolutions/${r.runId}.json`,
    `  results/runs/${r.runId}/ (traces + diagnosis)`,
    `  mutations/${r.proposals.map((p: any) => p.id).join(".json, mutations/")}.json`,
    `  results/llm-calls.jsonl (every provider call: provider, model, tokens, latency)`,
  ];
  return lines.join("\n");
}

export function printLatest() {
  const p = join(RESULTS, "evolutions", "latest.json");
  if (!existsSync(p)) return console.log("no evolution runs yet — run `npm run evolve`");
  const { runId } = JSON.parse(readFileSync(p, "utf8"));
  console.log(`[REPLAY of recorded run ${runId} — not a fresh execution]\n`);
  console.log(renderReport(JSON.parse(readFileSync(join(RESULTS, "evolutions", `${runId}.json`), "utf8"))));
}
