# findings: did the framework improve a frozen model?

**Short answer: no, not on this evidence.** On held-out work, no evolved harness beat the original (v0), and every evolved harness cost more tokens. Both hypotheses in `docs/EXPERIMENT.md` (pre-registered at commit `be8899b`; final corpus frozen at `f4680f3`) are **unsupported**. The dominant limitation is benchmark saturation: the coder solves almost everything, so there is too little headroom to measure a harness effect. Every number below comes from `results/experiments/*.json`.

## setup (as run)
- **Coder (all arms):** Meta Model API `muse-spark-1.1`. **Mutator:** Meta `muse-spark-1.3`. **Analyzer:** Subquadratic `subq-snap-1.1`.
- **Parent harness:** `v0`, with `maxAttempts` 2, no plan, no review.
- **Selection:** on `dev` (6 tasks × 3 reps = 18 independently graded runs per candidate).
- **Held-out:** `final` (1 fault-injection lifecycle task, `stream-abort-cleanup`, × 6 reps per arm). The final corpus was planned at 6 tasks, but only 1 passed validation before the time cutoff. The other 5 were never created, and none were dropped after seeing results.

## Experiment B, selection phase on dev (18 runs per candidate)
Sources: `results/experiments/controls-selection-2026-11-08T00-21-47.json`, `results/dev-diagnostic.log`.

| method | candidate | change | dev pass | tokens/task | model calls/task |
|---|---|---|---|---|---|
| — | v0 | original | 15/18 | — ¹ | — ¹ |
| agentgym (SubQ diagnosis → Meta) | **v0.6** | plan-first: map each boundary's throw/reject/cancel/cleanup | **17/18** | — ¹ | — ¹ |
| random (seed 1) | **v0.r1-s1** | selfReview=true | **16/18** | 17,491 | 2.0 |
| random | v0.r2-s1 | selfReview=true | 15/18 | 18,123 | 2.0 |
| random | v0.r3-s1 | planFirst + fullTestOutput + 1 skill | 15/18 | 13,427 | 2.0 |
| one-shot Meta redesign (no feedback) | v0.o1 | minimal general-rule prompt | 15/18 | 6,677 | 1.0 |
| one-shot | v0.o2 | robustness checklist skill | 13/18 | 7,390 | 1.0 |
| one-shot | **v0.o3** | planFirst + selfReview + fullTestOutput | **17/18** | 23,035 | 3.0 |

¹ The agentgym arm's dev runs predate the compute-accounting fix, so their token counts leave out the planFirst call and aren't comparable. Pass counts are comparable: same model, tasks and reps.

## Held-out final (1 task × 6 reps per arm, run concurrently)
Source: `results/experiments/final-optimizer-comparison-2026-11-08T00-29-04.json` (commit `f4680f3` + run).

| arm | harness | final pass | tokens/task | tokens/success | model calls/task | latency/task | visible-pass-hidden-fail |
|---|---|---|---|---|---|---|---|
| original | v0 | **6/6** | **16,797** | **16,797** | 1.5 | **95.5 s** | 0/6 |
| agentgym | v0.6 | 5/6 | 21,071 (1.25×) | 25,285 | 2.17 | 122.0 s | 1/6 |
| random | v0.r1-s1 | 5/6 | 28,942 (1.72×) | 34,730 | 2.33 | 155.6 s | 0/6 |
| one-shot | v0.o3 | 6/6 | 34,076 (2.03×) | 34,076 | 3.33 | 154.2 s | 0/6 |

## What this shows
1. **H1 (same model, better harness): not supported.** The agentgym-selected harness did not beat v0 on held-out work, and it used 25% more tokens. Its dev gain (15→17/18) did **not** transfer. That is consistent with the gate's original decision not to promote it, and with Gemini's advisory flag that the candidate was over-fit to the dev tickets.
2. **H2 (agentgym beats simple optimizers): not supported.** All three selected candidates land within one run of each other on final (5/6 to 6/6). With n=1 task we can't rank the optimizers. One-shot matched v0 at 2× cost; random and agentgym each lost one run.
3. **Cost is the only clear signal.** Every evolved harness added model calls (plan/review) and tokens without a measurable quality gain. Under the "equal correctness at lower cost" criterion, **v0 dominates** the frontier.
4. **The independent verifier is doing its job.** Across the project, every grader-detected failure was a run whose visible tests were green. The hidden tests caught failures the agent would otherwise have shipped.

## Why no improvement? (diagnosis of the negative result)
- **Benchmark saturation (primary).** v0 scored 12/12 on val, 6/6 on test and 6/6 on the new "hard" final task. Current Meta models solve these tickets, so a harness can only add cost.
- **Sampling noise.** Dev differences of 1–2 runs out of 18 are comparable to run-to-run variance: v0 scored 9/12 (75%) on dev in evolution run #2 and 15/18 (83%) in the diagnostic re-run. Selecting on noisy dev scores means selecting noise.
- **Final corpus too small.** 1 task is anecdotal. The planned 6 weren't finished in time.
- **Not the cause:** mutation proposals being invalid (all passed the guard), or accounting errors (compute is now fully counted).

## What was not done
- Diagnosis ablation (SubQ vs a generic summary) and the simulated no-gate policy. Neither was run.
- Matched-budget comparison. Candidates were compared at their natural budgets and reported as a frontier, not equalized.
- Cost in dollars. No verified Meta pricing.

## Bottom line for judges
agentgym is a working, honest harness-evolution loop with an independent verifier. On this benchmark it **did not** find a better way for a frozen Meta model to work, and its own gate correctly refused to ship one. The next step is a benchmark with real headroom: harder fault-injection tasks where v0 scores well below ceiling.
