import "dotenv/config";
import { loadTasks, type Split } from "./benchmark/tasks.js";
import { currentVersion, loadVersion } from "./agent/config.js";
import { describeProviders, providerFor } from "./providers/index.js";
import { evaluateConfig } from "./evolution/evaluate.js";
import { evolve } from "./evolution/evolve.js";
import { printLatest } from "./evolution/report.js";
import { metrics, paired, saveExperiment } from "./evolution/experiment.js";
import { randomMutations, oneShotRedesign } from "./evolution/controls.js";
import { saveVersion } from "./agent/config.js";

function arg(name: string, def?: string) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : def;
}
const cmd = process.argv[2];
const stamp = () => new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19) + "-" + Math.random().toString(36).slice(2, 6);

if (cmd === "providers") {
  console.table(describeProviders());
} else if (cmd === "benchmark") {
  const split = (arg("split", "val") as Split);
  const versions = (arg("versions") ?? arg("version") ?? currentVersion().version).split(",");
  const reps = Number(arg("reps", process.env.REPS || "1"));
  const tasks = loadTasks(split).filter((t) => !arg("task") || t.id === arg("task"));
  const coder = providerFor("coder")!;
  const runId = `bench-${stamp()}`;
  console.log(`benchmark ${runId}: split=${split} tasks=${tasks.length} reps=${reps} coder=${coder.label} [${coder.model}]`);
  for (const v of versions) {
    const r = await evaluateConfig(loadVersion(v), tasks, coder, { reps, split, runId });
    console.log(`\n${v} on ${split}: ${r.totals.runPasses}/${r.totals.runs} runs passed (independent grading), overclaims=${r.totals.selfReportOverclaims}`);
    for (const [id, p] of Object.entries(r.perTask)) console.log(`  ${p.passes === p.reps ? "PASS" : p.passes ? "FLAKY" : "FAIL"} ${id} ${p.passes}/${p.reps}  ${p.runs.flatMap((x) => x.failingTests).slice(0, 3).join(" | ")}`);
    console.log(`  evidence: results/evaluations/${r.evalId}.json`);
  }
} else if (cmd === "evolve") {
  await evolve({
    reps: Number(arg("reps", process.env.REPS || "1")),
    candidates: Number(arg("candidates", "2")),
    iterations: Number(arg("iterations", "1")),
  });
} else if (cmd === "experiment") {
  // Experiment A: fixed coder model, harness is the only independent variable.
  const split = arg("split", "final") as Split;
  const versions = (arg("versions") ?? "v0").split(",");
  const reps = Number(arg("reps", "3"));
  const tasks = loadTasks(split);
  const coder = providerFor("coder")!;
  const runId = `exp-${stamp()}`;
  console.log(`experiment ${runId}: split=${split} tasks=${tasks.length} reps=${reps} coder=${coder.id}:${coder.model} versions=${versions.join(",")}`);
  const evals = await Promise.all(versions.map((v) => evaluateConfig(loadVersion(v), tasks, coder, { reps, split, runId })));
  const m = evals.map(metrics);
  const p = evals.slice(1).map((e) => paired(evals[0], e));
  console.table(m.map(({ perTask, evalId, ...x }) => x));
  console.table(p);
  const path = saveExperiment(arg("name") ?? "fixed-model", {
    question: "same coder model, different harness: does the harness change independently graded outcomes?",
    coder: { provider: coder.id, model: coder.model }, split, taskIds: tasks.map((t) => t.id), reps, versions,
    configs: versions.map((v) => loadVersion(v)), metrics: m, paired: p,
  });
  console.log(`raw record: ${path}`);
} else if (cmd === "controls") {
  // Experiment B (selection phase): build random + one-shot candidates from the same parent, evaluate on the SAME selection split/budget.
  const parent = loadVersion(arg("parent") ?? "v0");
  const n = Number(arg("n", "3"));
  const reps = Number(arg("reps", "3"));
  const split = (arg("split") ?? "dev") as Split;
  const all = loadTasks("all");
  const tasks = loadTasks(split);
  const coder = providerFor("coder")!;
  const mutator = providerFor("mutator")!;
  const runId = `ctl-${stamp()}`;
  const rnd = randomMutations(parent, n, Number(arg("seed", "1")), all);
  const one = await oneShotRedesign(parent, n, mutator, all, { runId, control: "oneshot" });
  const cands = [...rnd.map((c) => ({ ...c, method: "random" })), ...one.map((c) => ({ ...c, method: "oneshot" }))];
  for (const c of cands) { saveVersion(c.cfg); console.log(`${c.method} ${c.cfg.version}: ${c.description}`); }
  const evals = await Promise.all(cands.map((c) => evaluateConfig(c.cfg, tasks, coder, { reps, split, runId })));
  const m = evals.map(metrics);
  console.table(m.map(({ perTask, evalId, ...x }) => x));
  const path = saveExperiment("controls-selection", {
    coder: { provider: coder.id, model: coder.model }, mutator: { provider: mutator.id, model: mutator.model }, parent: parent.version, split, reps,
    candidates: cands.map((c, i) => ({ method: c.method, version: c.cfg.version, description: c.description, patch: c.patch, metrics: m[i] })),
  });
  console.log(`raw record: ${path}`);
} else if (cmd === "demo") {
  printLatest();
} else {
  console.log("usage: tsx src/cli.ts <providers|benchmark|evolve|demo> [--split dev|val|test] [--versions v0,v0.1] [--reps n]");
}
