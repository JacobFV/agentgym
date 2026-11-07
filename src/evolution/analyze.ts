import type { AgentRunTrace } from "../agent/runner.js";
import type { AgentConfig } from "../agent/config.js";
import type { CodingTask } from "../benchmark/tasks.js";
import type { EvalResult, GradedRun } from "./evaluate.js";
import { snapDecide, type SnapQuestion } from "../providers/subquadratic.js";

export const WEAKNESSES: Record<string, string> = {
  ignored_stated_constraints: "The ticket explicitly stated a requirement/constraint that the final code does not implement",
  broke_existing_behavior: "The change regressed behavior that existing callers or existing code relied on (backward compatibility)",
  missed_error_paths: "Failure, rejection, cancellation, abort, or cleanup paths are not handled correctly",
  missed_edge_cases: "Boundary, empty, duplicate, out-of-order, or type-coercion inputs are mishandled",
  overfit_visible_tests: "The agent stopped as soon as the visible tests passed, without checking the rest of the ticket",
  cross_module_contract: "The agent misread how modules interact, or fixed the problem in the wrong layer",
  output_format_or_tooling: "Malformed response, unparsable edits, or a protocol/tool failure prevented progress",
  environment: "Timeout, sandbox, or harness error unrelated to the agent's reasoning",
};
export const CATEGORIES: Record<string, string> = {
  model_reasoning: "The agent's engineering reasoning was wrong or incomplete",
  tool_failure: "The edit protocol / tool interaction failed",
  environment_error: "Sandbox, timeout, or infrastructure problem",
  task_specific_defect: "A one-off defect peculiar to this task that would not generalize",
};
export const LEVERS: Record<string, string> = {
  plan_invariants_first: "Before editing, make the agent enumerate interfaces, invariants, stated constraints and edge cases (toolPolicy.planFirst)",
  self_review_after_green: "After visible tests pass, force one self-review pass against the full ticket (toolPolicy.selfReview)",
  richer_test_feedback: "Give the agent full test output on retries (toolPolicy.fullTestOutputOnRetry)",
  prompt_methodology: "Rewrite the system prompt with a better engineering methodology",
  skill_checklist: "Add a reusable skill/checklist the agent applies to every task",
};

export interface Diagnosis {
  analyzer: { provider: string; model: string; endpoint: string; inputTokens: number; latencyMs: number; questions: number; stateChars: number };
  perTrace: { traceId: string; taskId: string; passed: boolean; category: string; categoryConf: number; weakness: string; weaknessConf: number; failingTests: string[] }[];
  recurring: { weakness: string; description: string; probabilities: Record<string, number>; confidence: number };
  prevalence: Record<string, number>; // 0..3 expected level
  systemicProbability: number;
  overclaimProbability: number;
  lever: { choice: string; probabilities: Record<string, number> };
  evidenceTraceIds: string[];
  summary: string;
}

function compactTrace(t: AgentRunTrace & { grade: GradedRun }, task: CodingTask) {
  return {
    traceId: t.traceId,
    task: { id: task.id, ticket: task.description, originalSource: Object.fromEntries(Object.entries(task.initialFiles).filter(([p]) => p.startsWith("src/"))) },
    attempts: t.attempts.map((a) => ({
      attempt: a.attempt, phase: a.phase, plan: a.plan?.slice(0, 2000), agentReasoning: a.reasoning.slice(0, 1500),
      filesChanged: a.filesChanged, parseError: a.parseError,
      visibleTests: { passed: a.visibleTests.passed, failing: a.visibleTests.failingTests },
    })),
    finalSource: t.finalFiles,
    agentSelfReportedSuccess: t.selfReportedSuccess,
    independentGrade: { passed: t.grade.passed, failingTests: t.grade.failingTests, graderOutput: t.grade.gradeOutputHead.slice(0, 2500) },
    error: t.error,
  };
}

export async function analyzeFailures(
  traces: (AgentRunTrace & { grade: GradedRun })[], tasks: CodingTask[], config: AgentConfig,
  history: unknown[], ctx: Record<string, unknown>,
): Promise<Diagnosis> {
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const state = {
    context:
      "These are execution traces of an LLM coding agent on a development set of software-maintenance tickets. " +
      "Each trace has the ticket, the original source, the agent's attempts (reasoning, edits, visible test results), the final source, " +
      "and the verdict of an INDEPENDENT grader that also runs private tests the agent never saw. We are diagnosing recurring weaknesses in the agent's engineering methodology " +
      "to improve its configuration. Judge across the whole collection, not one trace in isolation.",
    agentConfig: { version: config.version, systemPrompt: config.systemPrompt, skills: config.skills, toolPolicy: config.toolPolicy },
    priorMutations: history,
    traces: traces.map((t) => compactTrace(t, byId.get(t.taskId)!)),
  };
  const q: Record<string, SnapQuestion> = {};
  traces.forEach((t, i) => {
    q[`t${i}_category`] = { type: "choice", instructions: `For trace ${t.traceId}: what kind of failure is it? If it passed independent grading, pick the closest category to any residual issue.`, criteria: CATEGORIES };
    q[`t${i}_weakness`] = { type: "choice", instructions: `For trace ${t.traceId}: which engineering weakness best explains the independent grader's failing tests? Choose 'none' only if it passed.`, criteria: { ...WEAKNESSES, none: "Passed independent grading" } };
  });
  q.recurring = { type: "choice", instructions: "Looking across ALL traces together, which single weakness recurs most and is most likely to recur on unseen tickets?", criteria: WEAKNESSES };
  for (const w of Object.keys(WEAKNESSES)) q[`prev_${w}`] = { type: "score", instructions: `How prevalent is this weakness across all traces: ${WEAKNESSES[w]}`, criteria: ["absent", "rare", "common", "pervasive"] };
  q.systemic = { type: "noul", instructions: "Is the dominant failure pattern systemic to the agent's methodology (likely to recur on different tickets) rather than task-specific?", criteria: { true: "Same methodological gap shows up across different tickets", false: "Failures are unrelated one-off defects" } };
  q.overclaim = { type: "noul", instructions: "Does the agent systematically believe it succeeded (visible tests green) when the independent grader says it failed?" };
  q.lever = { type: "choice", instructions: "Which change to the agent's configuration would most likely fix the recurring weakness on unseen tickets?", criteria: LEVERS };

  const r = await snapDecide(state, q, ctx);
  const A = r.answers as any;
  const perTrace = traces.map((t, i) => ({
    traceId: t.traceId, taskId: t.taskId, passed: t.grade.passed,
    category: A[`t${i}_category`].choice, categoryConf: A[`t${i}_category`].confidence,
    weakness: A[`t${i}_weakness`].choice, weaknessConf: A[`t${i}_weakness`].confidence,
    failingTests: t.grade.failingTests,
  }));
  const recurring = A.recurring.choice as string;
  const prevalence = Object.fromEntries(Object.keys(WEAKNESSES).map((w) => [w, Number(A[`prev_${w}`].score.toFixed(2))]));
  const evidenceTraceIds = perTrace.filter((p) => !p.passed && p.weakness === recurring).map((p) => p.traceId);
  const failed = perTrace.filter((p) => !p.passed);
  const summary =
    `${failed.length}/${perTrace.length} dev traces failed independent grading (${traces.filter((t) => t.selfReportedSuccess && !t.grade.passed).length} of them self-reported success). ` +
    `SubQ's dominant recurring weakness: ${recurring} (p=${A.recurring.probabilities[recurring].toFixed(2)}) — ${WEAKNESSES[recurring]}. ` +
    `Systemic p=${A.systemic.noul.toFixed(2)}; overclaim p=${A.overclaim.noul.toFixed(2)}. Suggested lever: ${A.lever.choice}. ` +
    `Per-trace: ${failed.map((p) => `${p.traceId}→${p.weakness}/${p.category}`).join("; ") || "none failed"}.`;
  return {
    analyzer: { provider: "subquadratic", model: r.model, endpoint: "POST /v1/systemone", inputTokens: r.usage.input_tokens, latencyMs: r.latencyMs, questions: Object.keys(q).length, stateChars: JSON.stringify(state).length },
    perTrace,
    recurring: { weakness: recurring, description: WEAKNESSES[recurring], probabilities: A.recurring.probabilities, confidence: A.recurring.confidence },
    prevalence, systemicProbability: A.systemic.noul, overclaimProbability: A.overclaim.noul,
    lever: { choice: A.lever.choice, probabilities: A.lever.probabilities }, evidenceTraceIds, summary,
  };
}
