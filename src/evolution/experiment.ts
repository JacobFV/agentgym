import { execSync } from "node:child_process";
import { join } from "node:path";
import type { EvalResult } from "./evaluate.js";
import { RESULTS, ROOT, writeJson } from "../trace/recorder.js";

/** Metrics computed ONLY from independently graded runs. */
export function metrics(e: EvalResult) {
  const runs = e.totals.runs;
  const succ = e.totals.runPasses;
  const perTaskRates = Object.values(e.perTask).map((p) => p.passes / p.reps);
  return {
    version: e.version, split: e.split, tasks: e.taskIds.length, repsPerTask: e.reps, runs,
    heldOutPassRate: succ / runs,
    passAt1: perTaskRates.reduce((a, b) => a + b, 0) / perTaskRates.length, // mean single-attempt success over tasks
    tasksSolvedEveryRep: e.totals.tasksPassedAllReps,
    tokensTotal: e.totals.tokens,
    tokensPerTask: Math.round(e.totals.tokens / runs),
    tokensPerSuccess: succ ? Math.round(e.totals.tokens / succ) : null,
    modelCallsPerTask: +(((e.totals.modelCalls ?? 0) / runs).toFixed(2)),
    latencyPerTaskMs: Math.round(e.totals.agentMs / runs),
    visiblePassHiddenFailRate: e.totals.selfReportOverclaims / runs,
    costPerSuccess: null as null, // no verified per-token pricing for the Meta Model API → not reported
    perTask: Object.fromEntries(Object.entries(e.perTask).map(([k, v]) => [k, `${v.passes}/${v.reps}`])),
    evalId: e.evalId,
  };
}

/** Task-level paired comparison of B vs A (same tasks, independent reps). Bootstrap over tasks for the pass-rate difference. */
export function paired(a: EvalResult, b: EvalResult, iters = 4000) {
  const ids = a.taskIds.filter((t) => b.perTask[t]);
  const diffs = ids.map((t) => b.perTask[t].passes / b.perTask[t].reps - a.perTask[t].passes / a.perTask[t].reps);
  const mean = diffs.reduce((x, y) => x + y, 0) / diffs.length;
  let seed = 12345;
  const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  const boots: number[] = [];
  for (let i = 0; i < iters; i++) {
    let s = 0;
    for (let j = 0; j < diffs.length; j++) s += diffs[Math.floor(rnd() * diffs.length)];
    boots.push(s / diffs.length);
  }
  boots.sort((x, y) => x - y);
  return {
    baseline: a.version, candidate: b.version, tasks: ids.length,
    meanPassRateDiff: +mean.toFixed(3),
    bootstrap95: [+boots[Math.floor(iters * 0.025)].toFixed(3), +boots[Math.floor(iters * 0.975)].toFixed(3)],
    tasksBetter: diffs.filter((d) => d > 0).length, tasksWorse: diffs.filter((d) => d < 0).length, tasksTied: diffs.filter((d) => d === 0).length,
    tokenRatio: +(b.totals.tokens / Math.max(1, a.totals.tokens)).toFixed(2),
    note: `n=${ids.length} tasks x ${a.reps} reps; bootstrap over tasks only; not a significance claim`,
  };
}

export function gitCommit() {
  try { return execSync("git rev-parse --short HEAD", { cwd: ROOT }).toString().trim(); } catch { return "unknown"; }
}

export function saveExperiment(name: string, record: Record<string, unknown>) {
  const id = `${name}-${new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19)}`;
  const path = join(RESULTS, "experiments", `${id}.json`);
  writeJson(path, { id, commit: gitCommit(), createdAt: new Date().toISOString(), ...record });
  return path;
}
