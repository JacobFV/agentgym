# experiment: can a frozen model learn a better way to work?

**Framing:** eval-driven harness evolution, i.e. gradient-free optimization over agent execution configurations, with held-out evaluation. Model weights are never updated. The optimizer itself is not modified, so this is **not** recursive self-improvement.

This protocol was written and committed **before** any run on the `final` split (see git history: this file and the `final` tasks land in the same commit, before `results/experiments/fixed-model-*`).

## hypotheses
- **H1 (harness effect).** With the coder model fixed (Meta `muse-spark-1.1`), the agentgym-selected harness achieves a higher independently graded pass rate than v0 on unseen `final` tasks, or an equal pass rate at lower cost.
- **H2 (optimizer effect).** agentgym's selected candidate (diagnosis → mutation → selection) does better on `final` than the best candidate from random search and the best candidate from a one-shot LLM redesign, given the same parent, search space, coder model and selection budget.

## design
- **Coder:** Meta Model API `muse-spark-1.1` for every arm. **Mutator (agentgym and one-shot):** Meta `muse-spark-1.3`. **Analyzer:** Subquadratic `subq-snap-1.1`.
- **Search space:** `systemPrompt`, `skills`, `toolPolicy.{planFirst, selfReview, fullTestOutputOnRetry}`. `maxAttempts` is frozen at 2. The grader, tasks, gate and budget can't be mutated, and the guard blocks benchmark identifiers.
- **Partitions:**
  - `dev`: 6 tasks, used for diagnosis and for selection in every arm.
  - `val`: 6 tasks. Saturated (v0 scores 12/12), so it can't discriminate.
  - `test`: 3 tasks. Saturated.
  - `final`: a NEW hard corpus of fault-injection and lifecycle-invariant tickets, frozen before any arm was evaluated on it. The mutation engine never sees hidden tests, and never sees anything from `final`.
- **Arms (selection on `dev`, reps=3, 18 graded runs per candidate, 3 candidates per method):**
  - **agentgym:** candidates v0.5, v0.6 and v0.7 from evolution run `evo-2026-11-07T23-11-20-iup6` (SubQ diagnosis → Meta mutations). Selected by dev score: **v0.6** (17/18; v0 scored 15/18). This selection was made before `final` existed.
  - **random:** 3 seeded random valid patches (seed=1). The best by dev score is selected (ties → fewer tokens).
  - **one-shot:** one Meta call that redesigns the harness with no traces, diagnosis or feedback, producing 3 candidates. The best by dev score is selected (ties → fewer tokens).
- **Final evaluation:** v0 plus the 3 selected candidates on `final`, reps=3, run concurrently in the same environment.

## metrics (`src/evolution/experiment.ts`)
`heldOutPassRate`, `passAt1` (mean per-task single-run success), `tokensPerSuccess`, `tokensPerTask`, `modelCallsPerTask`, `latencyPerTaskMs` and `visiblePassHiddenFailRate` (visible tests green but the hidden grader failed it; this is an observation, not a model claim). Also a paired task-level difference vs v0 with a bootstrap 95% interval over tasks. `costPerSuccess` is **not reported**, because we have no verified Meta pricing.

**Compute accounting fix:** `planFirst` and `selfReview` calls now count toward model calls and tokens (`trace.compute`). Earlier result files reported edit-attempt tokens only, which undercounted those candidates.

## known limitations (stated in advance)
- The samples are small: 6 final tasks × 3 reps. Intervals will be wide, and no significance is claimed.
- Selection uses `dev`, the same tasks the agentgym diagnosis saw. That is legitimate for selection, but it means dev scores are not transfer evidence. Only `final` is.
- The agentgym arm's dev evaluation was done earlier (`results/dev-diagnostic.log`); the control arms were evaluated later on the same tasks, model and reps. The model is the same, but the runs were not concurrent.
- The diagnosis ablation (SubQ vs a generic summary) and the no-gate simulation were **not run** for lack of time.
