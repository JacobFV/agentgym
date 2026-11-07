import { join } from "node:path";
import { readFileSync } from "node:fs";
import type { AgentConfig } from "./config.js";
import { renderSystemPrompt } from "./config.js";
import type { CodingTask } from "../benchmark/tasks.js";
import { materialize, runTests, type TestResult } from "../benchmark/executor.js";
import { callLLM, parseJsonLoose } from "../providers/index.js";
import type { Provider } from "../providers/types.js";
import { emit } from "../trace/recorder.js";

export interface AttemptTrace {
  attempt: number;
  phase: "edit" | "self_review";
  plan?: string;
  reasoning: string;
  filesChanged: string[];
  rejectedEdits: string[]; // edits outside the permitted scope (src/**) — a policy violation
  diffStat: Record<string, { before: number; after: number }>;
  visibleTests: Omit<TestResult, "output"> & { outputHead: string };
  llm: { provider: string; model: string; latencyMs: number; usage: unknown };
  parseError?: string;
}

export interface AgentRunTrace {
  traceId: string;
  taskId: string;
  configVersion: string;
  rep: number;
  attempts: AttemptTrace[];
  finalFiles: Record<string, string>;
  selfReportedSuccess: boolean;
  policyViolations: string[];
  durationMs: number;
  error?: string;
}

const RESPONSE_FORMAT = `Respond with ONE JSON object:
{"reasoning": "<brief explanation of what you changed and why>",
 "files": {"src/<path>.mjs": "<COMPLETE new file contents>", ...}}
Only include files you change. You may only modify or create files under src/. Test files are read-only.`;

function filesBlock(files: Record<string, string>) {
  return Object.entries(files).map(([p, c]) => `=== ${p} ===\n${c}`).join("\n\n");
}

export async function runAgent(task: CodingTask, config: AgentConfig, coder: Provider, workDir: string, rep = 0): Promise<AgentRunTrace> {
  const t0 = Date.now();
  const traceId = `${task.id}@${config.version}#${rep}`;
  const files: Record<string, string> = { ...task.initialFiles };
  materialize(workDir, files);
  const system = renderSystemPrompt(config) + "\n\n" + RESPONSE_FORMAT;
  const trace: AgentRunTrace = {
    traceId, taskId: task.id, configVersion: config.version, rep, attempts: [], finalFiles: {},
    selfReportedSuccess: false, policyViolations: [], durationMs: 0,
  };
  let plan: string | undefined;
  let lastTest: TestResult | null = null;
  let reviewed = false;
  const ctx = { traceId, taskId: task.id, version: config.version };

  try {
    if (config.toolPolicy.planFirst) {
      const r = await callLLM("coder", coder, {
        system: renderSystemPrompt(config),
        user: `# Ticket\n${task.description}\n\n# Repository\n${filesBlock(files)}\n\nBefore editing, write a concise plan: list the public interfaces involved, the invariants and existing behaviors that must be preserved, every requirement/constraint stated in the ticket, and the edge cases (errors, concurrency, empty/invalid input, ordering, compatibility). Plain text, no code.`,
      }, { ...ctx, step: "plan" });
      plan = r.text;
    }

    const budget = config.toolPolicy.maxAttempts;
    for (let attempt = 1; attempt <= budget + (config.toolPolicy.selfReview ? 1 : 0); attempt++) {
      const isReview = !!lastTest?.passed && config.toolPolicy.selfReview && !reviewed;
      if (attempt > budget && !isReview) break;
      if (lastTest?.passed && !isReview) break;
      let user = `# Ticket\n${task.description}\n\n# Repository (current state)\n${filesBlock(files)}\n`;
      if (plan) user += `\n# Your plan\n${plan}\n`;
      if (isReview) {
        reviewed = true;
        user += `\n# Self-review\nThe visible tests now pass. Visible tests do not cover everything. Re-read the ticket and the code: is every stated requirement, constraint and preserved behavior actually handled? If you find a gap, fix it. If nothing needs changing, return {"reasoning": "...", "files": {}}.\n`;
      } else if (lastTest && !lastTest.passed) {
        const out = config.toolPolicy.fullTestOutputOnRetry ? lastTest.output : lastTest.output.slice(0, 1500);
        user += `\n# Test results from your previous attempt (FAILED)\nfailing tests: ${lastTest.failingTests.join(", ") || "(see output)"}\n${out}\n`;
      }
      emit({ type: "attempt_start", ...ctx, attempt, phase: isReview ? "self_review" : "edit" });
      const r = await callLLM("coder", coder, { system, user, json: true, maxTokens: 12000 }, { ...ctx, step: `attempt-${attempt}` });
      let parsed: { reasoning?: string; files?: Record<string, string> } = {};
      let parseError: string | undefined;
      try { parsed = parseJsonLoose(r.text); } catch (e) { parseError = (e as Error).message; }
      const changed: string[] = [];
      const rejected: string[] = [];
      const diffStat: AttemptTrace["diffStat"] = {};
      for (const [p, c] of Object.entries(parsed.files ?? {})) {
        const norm = p.replace(/^\.?\//, "");
        if (!norm.startsWith("src/") || norm.includes("..") || typeof c !== "string") { rejected.push(norm); continue; }
        diffStat[norm] = { before: (files[norm] ?? "").split("\n").length, after: c.split("\n").length };
        files[norm] = c;
        changed.push(norm);
      }
      if (rejected.length) trace.policyViolations.push(...rejected.map((p) => `attempted edit outside src/: ${p}`));
      materialize(workDir, files);
      lastTest = await runTests(workDir, task.timeoutMs);
      emit({ type: "attempt_end", ...ctx, attempt, visiblePassed: lastTest.passed, failing: lastTest.failingTests });
      trace.attempts.push({
        attempt, phase: isReview ? "self_review" : "edit", plan: attempt === 1 ? plan : undefined,
        reasoning: parsed.reasoning ?? "", filesChanged: changed, rejectedEdits: rejected, diffStat,
        visibleTests: { ...(({ output, ...rest }) => rest)(lastTest), outputHead: lastTest.output.slice(0, 1200) },
        llm: { provider: r.provider, model: r.model, latencyMs: r.latencyMs, usage: r.usage }, parseError,
      });
    }
  } catch (e) {
    trace.error = String(e);
  }
  trace.selfReportedSuccess = !!lastTest?.passed;
  trace.finalFiles = Object.fromEntries(Object.entries(files).filter(([p]) => p.startsWith("src/")));
  trace.durationMs = Date.now() - t0;
  return trace;
}
