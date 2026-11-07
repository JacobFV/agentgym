import "dotenv/config";
import { loadTasks, type Split } from "./benchmark/tasks.js";
import { currentVersion, loadVersion } from "./agent/config.js";
import { describeProviders, providerFor } from "./providers/index.js";
import { evaluateConfig } from "./evolution/evaluate.js";
import { evolve } from "./evolution/evolve.js";
import { printLatest } from "./evolution/report.js";

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
} else if (cmd === "demo") {
  printLatest();
} else {
  console.log("usage: tsx src/cli.ts <providers|benchmark|evolve|demo> [--split dev|val|test] [--versions v0,v0.1] [--reps n]");
}
