# demo scripts

All numbers come from recorded runs in `results/evolutions/` (see `RESULTS.md`). The UI's replay mode is labeled REPLAY. Live runs cost real API tokens and take ~10–15 min.

## one-minute video

`docs/agentgym-demo.mp4` is 60s and caption-only, built from the live UI rendering a real recorded run. The UI tells one story in three beats: **Caught** (3/3 failures the agent swore were fixed), **Diagnosed** (SubQ, 96% error/cancel paths), **Verified** (0/3 fixes shipped, because none beat the original on unseen tasks and one broke a task). Use `npm run ui` and open `http://localhost:4317/?scale=1.3` on a projector.

Suggested voice-over if recording live:

| time | screen | voice-over |
|---|---|---|
| 0:00–0:10 | title / UI header | "Coding agents repeat the same mistakes, and they say they're done when they aren't. agentgym makes the agent improve its own methodology, and proves it." |
| 0:10–0:25 | left column: dev traces, FAIL rows | "The Meta coding agent works real maintenance tickets in a sandbox. An independent grader runs private tests it never saw. These failures all *claimed* success." |
| 0:25–0:35 | center: SubQ diagnosis, Meta mutation cards | "Subquadratic SubQ Snap reads every trace in one long-context call and finds the recurring weakness: missed error paths, systemic. Meta's model writes typed mutations to the agent's own config." |
| 0:35–0:50 | right: validation table, gate | "Each candidate runs on unseen validation tasks under identical conditions. The gate the mutator can't touch decides. Here it rejected a regression and kept the parent." |
| 0:50–1:00 | version history, terminal `npm run usage` | "Every version, proposal and model call is logged and replayable. Coding agents improve software; agentgym improves the coding agents." |

## three-minute judging script

**0:00 problem (20s).** Coding agents fail in systematic ways: they stop when the visible tests go green, they skip error paths, and they overclaim. Retrying doesn't fix a methodology. agentgym is a closed loop that changes the agent's methodology, and only keeps a change when an independent verifier proves it generalizes.

**0:20 the loop (40s), UI pipeline strip.**
1. The coder (Meta Model API, muse-spark) works coupled maintenance tickets: retry/cancel semantics, dedupe races, config precedence, ledger rounding, cursor pagination. It edits real files in a sandbox: Node permission model, scrubbed env, hard timeouts, and writes allowed only under `src/`.
2. The independent grader copies the agent's code into a fresh directory, restores the tests from the benchmark, and adds private hidden tests. It ignores the agent's self-report and counts overclaims.
3. **Subquadratic SubQ Snap 1.1** gets *all* dev traces in one 384K-context Decisions API call (tickets, source, every attempt, grader output) plus 36 typed questions. It classifies each trace (reasoning vs tool vs environment vs task-specific), picks the recurring weakness, scores prevalence, and judges systemic and overclaim. This is a cross-trace judgment, not a per-failure one.
4. **Meta** turns that diagnosis into typed `MutationProposal`s. A guard allows only the system prompt, skills and three policy flags. The attempt budget is frozen, and any patch mentioning a benchmark identifier is rejected (overfitting guard).
5. **Gemini** reviews each proposal adversarially. It is advisory only.
6. The promotion gate: strictly more passing validation runs, zero regressions, no policy violations, same model and budget. Promote moves the version pointer; reject keeps the parent, and rollback is one pointer write.

**1:00 the result (60s), right column.** Latest run: Meta muse-spark-1.1 coder, dev 9/12, and **all 3 failures had claimed success**. SubQ read 12 traces (42K tokens, 36 questions): missed_error_paths p=0.96, systemic 0.98, overclaim 1.00. Meta proposed 3 mutations. Validation on unseen tasks: v0 12/12; v0.5 12/12, v0.6 12/12 (tie → reject); v0.7 11/12 regressed resource-cleanup → reject. Gemini independently flagged v0.5 as over-indexed on the dev tickets. Re-run on dev, v0.6 went 15/18 → 17/18 with overclaims 3 → 1, but it isn't proven on unseen tasks, so it wasn't promoted.. Make the point: the system is honest. When the validation set can't show an improvement, nothing gets promoted, and a mutation that regresses gets rejected even though it fixes the diagnosed bug.

**2:00 why it matters (40s).** Every coding-agent team tunes prompts by vibes. agentgym turns that into an experiment with a held-out set, a gate and an audit log, where `npm run usage` shows every sponsor call and its tokens. Next steps: bigger task pools, multiple iterations with lineage, and SubQ's long context on whole-repo histories.

**2:40 close (20s).** "Coding agents improve software. agentgym improves the coding agents, and refuses to lie about it."

## anticipated Q&A
- *Why not show a big improvement?* Strong coders saturate small validation sets. We report that instead of tuning tests after seeing results. The gate is the product.
- *Is SubQ just a classifier?* Snap is a decisions model. We use it for what it's best at: calibrated, typed judgments over a huge context (all traces at once). Meta writes the free-text mutation.
- *Could the mutator cheat?* It can only touch whitelisted config fields. Tests, grader, gate and budget are outside its reach, and patches naming benchmark files or tasks are rejected.

## 60-second narrative: "can a frozen model learn a better way to work?" (experiment results)

- **0:00** "Everyone benchmarks models. We benchmark and evolve the harness around a model with frozen weights: Meta muse-spark-1.1."
- **0:10** "agentgym finds recurring failures with Subquadratic SubQ Snap: all 12 traces in one call, error/cancel paths at 96%. Meta then proposes harness changes, and hidden tests the optimizer never sees grade them."
- **0:25** "To check the optimizer actually adds something, we raced it against random search and a one-shot LLM redesign, at the same selection budget of 18 graded runs per candidate."
- **0:40** "On held-out work, the original harness scored 6/6. agentgym's pick scored 5/6 at 1.25× tokens, random 5/6 at 1.7×, and one-shot 6/6 at 2×. Nothing beat the original, and everything cost more."
- **0:52** "That's a real negative result. The benchmark is saturated, so a frozen model has no headroom to improve here. The gate refused to ship the dev-set 'win', and the held-out data proved it right."

### Final slide: did the framework improve outcomes, by how much, at what cost, compared with what?
**No.** Δ pass rate vs the original harness on held-out work: agentgym −1/6, random −1/6, one-shot 0/6. Cost: 1.25×, 1.72× and 2.03× tokens respectively. That's n=1 held-out task × 6 reps: anecdotal, with no significance claimed. Protocol and raw records: `docs/EXPERIMENT.md`, `docs/FINDINGS.md`, `results/experiments/`.
