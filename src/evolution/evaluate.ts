import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { AgentConfig } from "../agent/config.js";
import { runAgent, type AgentRunTrace } from "../agent/runner.js";
import type { CodingTask } from "../benchmark/tasks.js";
import { materialize, runTests, type TestResult } from "../benchmark/executor.js";
import type { Provider } from "../providers/types.js";
import { appendJsonl, emit, RESULTS, writeJson } from "../trace/recorder.js";

export interface GradedRun {
  traceId: string;
  taskId: string;
  rep: number;
  passed: boolean; // INDEPENDENT verdict: visible + hidden tests on a fresh copy
  selfReportedSuccess: boolean;
  visibleTestsPassed: boolean;
  modelCalls: number;
  inputTokens: number;
  outputTokens: number;
  failingTests: string[];
  pass: number;
  fail: number;
  attempts: number;
  tokens: number;
  agentMs: number;
  policyViolations: string[];
  gradeOutputHead: string;
  error?: string;
}

export interface EvalResult {
  evalId: string;
  version: string;
  split: string;
  reps: number;
  coder: { provider: string; model: string; label: string };
  startedAt: string;
  finishedAt: string;
  taskIds: string[];
  perTask: Record<string, { passes: number; reps: number; runs: GradedRun[] }>;
  totals: { tasksPassedAllReps: number; passRate: number; runPasses: number; runs: number; attempts: number; tokens: number; agentMs: number; selfReportOverclaims: number; policyViolations: number; modelCalls?: number; inputTokens?: number; outputTokens?: number };
  tracesFile: string;
}

/** Grade on a FRESH directory: agent's final src + original visible tests + private hidden tests. Never trusts the agent. */
export async function grade(task: CodingTask, trace: AgentRunTrace, dir: string): Promise<TestResult> {
  const files: Record<string, string> = {};
  for (const [p, c] of Object.entries(task.initialFiles)) files[p] = c;
  for (const [p, c] of Object.entries(trace.finalFiles)) if (p.startsWith("src/")) files[p] = c;
  const hidden = join(task.hiddenDir, "hidden.test.mjs");
  if (!existsSync(hidden)) throw new Error(`task ${task.id} has no hidden test`);
  files["test/hidden.test.mjs"] = readFileSync(hidden, "utf8");
  // test files always restored from the benchmark, never from the agent
  materialize(dir, files);
  return runTests(dir, task.timeoutMs);
}

async function pool<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => {
    while (i < items.length) { const k = i++; out[k] = await fn(items[k]); }
  }));
  return out;
}

export async function evaluateConfig(config: AgentConfig, tasks: CodingTask[], coder: Provider, opts: { reps: number; split: string; runId: string }): Promise<EvalResult> {
  const startedAt = new Date().toISOString();
  const evalId = `${opts.runId}--${config.version}--${opts.split}`;
  const tracesFile = join(RESULTS, "runs", opts.runId, `traces-${config.version}-${opts.split}.jsonl`);
  const jobs = tasks.flatMap((t) => Array.from({ length: opts.reps }, (_, rep) => ({ t, rep })));
  const conc = Number(process.env.CONCURRENCY || 6);
  emit({ type: "eval_start", evalId, version: config.version, split: opts.split, jobs: jobs.length });
  const graded = await pool(jobs, conc, async ({ t, rep }) => {
    const ws = join(RESULTS, "workspaces", opts.runId, config.version, `${t.id}-r${rep}`);
    const trace = await runAgent(t, config, coder, join(ws, "agent"), rep);
    const g = await grade(t, trace, join(ws, "grade"));
    // full accounting: includes planFirst / selfReview calls, not just edit attempts
    const tokens = trace.compute.inputTokens + trace.compute.outputTokens;
    const gr: GradedRun = {
      traceId: trace.traceId, taskId: t.id, rep, passed: g.passed && trace.policyViolations.length === 0,
      selfReportedSuccess: trace.visibleTestsPassed, visibleTestsPassed: trace.visibleTestsPassed,
      modelCalls: trace.compute.modelCalls, inputTokens: trace.compute.inputTokens, outputTokens: trace.compute.outputTokens,
      failingTests: g.failingTests, pass: g.pass, fail: g.fail,
      attempts: trace.attempts.length, tokens, agentMs: trace.durationMs, policyViolations: trace.policyViolations,
      gradeOutputHead: g.output.slice(0, 3000), error: trace.error,
    };
    appendJsonl(tracesFile, { kind: "agent_trace", ...trace, grade: gr });
    emit({ type: "task_graded", evalId, version: config.version, taskId: t.id, rep, passed: gr.passed, selfReported: gr.selfReportedSuccess, failing: gr.failingTests, attempts: gr.attempts });
    return gr;
  });
  const perTask: EvalResult["perTask"] = {};
  for (const t of tasks) {
    const runs = graded.filter((g) => g.taskId === t.id);
    perTask[t.id] = { passes: runs.filter((r) => r.passed).length, reps: runs.length, runs };
  }
  const r: EvalResult = {
    evalId, version: config.version, split: opts.split, reps: opts.reps,
    coder: { provider: coder.id, model: coder.model, label: coder.label },
    startedAt, finishedAt: new Date().toISOString(), taskIds: tasks.map((t) => t.id), perTask,
    totals: {
      tasksPassedAllReps: Object.values(perTask).filter((p) => p.passes === p.reps).length,
      passRate: graded.filter((g) => g.passed).length / Math.max(1, graded.length),
      runPasses: graded.filter((g) => g.passed).length, runs: graded.length,
      attempts: graded.reduce((s, g) => s + g.attempts, 0), tokens: graded.reduce((s, g) => s + g.tokens, 0),
      agentMs: graded.reduce((s, g) => s + g.agentMs, 0),
      selfReportOverclaims: graded.filter((g) => g.selfReportedSuccess && !g.passed).length,
      policyViolations: graded.reduce((s, g) => s + g.policyViolations.length, 0),
      modelCalls: graded.reduce((s, g) => s + g.modelCalls, 0),
      inputTokens: graded.reduce((s, g) => s + g.inputTokens, 0),
      outputTokens: graded.reduce((s, g) => s + g.outputTokens, 0),
    },
    tracesFile,
  };
  writeJson(join(RESULTS, "evaluations", `${evalId}.json`), r);
  emit({ type: "eval_end", evalId, version: config.version, split: opts.split, totals: r.totals });
  return r;
}
