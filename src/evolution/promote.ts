import type { EvalResult } from "./evaluate.js";

export interface Decision {
  candidate: string;
  parent: string;
  decision: "PROMOTE" | "REJECT";
  reasons: string[];
  parentScore: number;
  candidateScore: number;
  runs: number;
  newlyPassing: string[];
  regressions: string[];
  tokenDelta: number;
}

/**
 * Promotion gate (fixed; not mutable by the mutation engine):
 *  1. hard: any policy violation (edits outside src/, guard failures) → REJECT
 *  2. require strictly more independently-graded passing runs than the parent on the validation split
 *  3. reject any regression: a task whose pass-rate drops by ≥ 0.5 vs the parent
 *  Both evaluated under identical tasks, reps, attempt budget and coder model.
 */
export function decide(parent: EvalResult, cand: EvalResult, guardViolations: string[]): Decision {
  const reasons: string[] = [];
  const newlyPassing: string[] = [];
  const regressions: string[] = [];
  for (const id of parent.taskIds) {
    const p = parent.perTask[id].passes / parent.perTask[id].reps;
    const c = cand.perTask[id].passes / cand.perTask[id].reps;
    if (c - p >= 0.5) newlyPassing.push(id);
    if (p - c >= 0.5) regressions.push(id);
  }
  const ps = parent.totals.runPasses, cs = cand.totals.runPasses;
  if (guardViolations.length) reasons.push(`guard violations: ${guardViolations.join("; ")}`);
  if (cand.totals.policyViolations) reasons.push(`${cand.totals.policyViolations} sandbox policy violations`);
  if (cs <= ps) reasons.push(`no improvement on validation: ${cs}/${cand.totals.runs} vs parent ${ps}/${parent.totals.runs}`);
  if (regressions.length) reasons.push(`regressions on: ${regressions.join(", ")}`);
  if (parent.coder.model !== cand.coder.model) reasons.push("coder model mismatch — not comparable");
  const decision = reasons.length === 0 ? "PROMOTE" : "REJECT";
  if (decision === "PROMOTE") reasons.push(`validation ${ps}→${cs} of ${cand.totals.runs} runs, newly passing: ${newlyPassing.join(", ") || "(partial)"}, 0 regressions`);
  return { candidate: cand.version, parent: parent.version, decision, reasons, parentScore: ps, candidateScore: cs, runs: cand.totals.runs, newlyPassing, regressions, tokenDelta: cand.totals.tokens - parent.totals.tokens };
}
