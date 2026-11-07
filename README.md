# agentgym

**coding agents improve software. agentgym improves the coding agents.**

agentgym is a closed-loop system in which an LLM coding agent improves its own software-engineering methodology. It runs real maintenance tickets in sandboxes, has an independent grader check the work with private tests, sends every execution trace to **Subquadratic SubQ Snap 1.1** for long-context failure analysis, and asks a mutation engine (**Meta Model API** when keyed) to rewrite the agent's own configuration. Each candidate is then measured on *unseen* validation tasks. A promotion gate the mutator cannot touch either promotes the candidate or rejects it and keeps the parent.

Built at the AIE Code Summit 2026 hackathon (Cerebral Valley), Nov 7 2026. Everything in this repo was written during the hackathon.

```
ticket ─▶ coding agent vN ─▶ sandbox (node permission model, scrubbed env, timeout)
        ─▶ independent grader (fresh dir + private hidden tests; agent self-report ignored)
        ─▶ traces.jsonl ─▶ SubQ Snap 1.1 /v1/systemone  (all dev traces in one long-context call:
                                per-trace failure category + weakness, recurring weakness, prevalence,
                                systemic?, overclaim?, best intervention lever — typed, with probabilities)
        ─▶ mutation engine (Meta Model API) ─▶ typed MutationProposal + guard (mutable fields only,
                                no benchmark identifiers) ─▶ candidate vN.k
        ─▶ validation split (unseen tasks, same model/budget/reps as parent)
        ─▶ promotion gate: strictly better AND zero regressions AND no policy violations
        ─▶ PROMOTE (versions/current.json → vN.k)  |  REJECT (parent preserved, rollback = pointer)
```

## quickstart

```bash
npm install
cp .env.example .env        # add SUBQ_API_KEY, META_API_KEY (optional GEMINI_API_KEY)
npm test                    # validates all benchmark fixtures + harness unit tests
npm run providers           # shows which provider serves each role
npm run benchmark -- --split val --versions v0      # pinned config vs a split
npm run evolve -- --reps 2 --candidates 2           # one full evolution cycle
npm run demo                # replays the latest recorded evolution report (labeled REPLAY)
npm run ui                  # http://localhost:4317 — live "run evolution" + replay
npm run usage               # per-provider call/token audit from results/llm-calls.jsonl
node scripts/results.mjs    # regenerate RESULTS.md from recorded runs

# reproduce evolution run #2 exactly (older Meta coder, newest Meta mutator):
META_CODER_MODEL=muse-spark-1.1 npm run evolve -- --reps 2 --candidates 3
```

Role routing is set in `.env`: `CODER_PROVIDER`, `MUTATOR_PROVIDER`, `VERIFIER_PROVIDER` ∈ `meta | gemini | claude-cli | none`. `claude-cli` is a **local dev adapter** that shells out to the Claude Code CLI. Every log, report and UI panel labels it as such, and it is never presented as a sponsor provider.

## what's real

| component | where | notes |
|---|---|---|
| coding agent | `src/agent/runner.ts` | structured full-file edit protocol, may only write `src/**`, runs visible tests, retries within a frozen budget, optional plan-first / self-review policies |
| sandbox | `src/benchmark/executor.ts` | Node `--permission` (fs scoped to the workspace), env scrubbed to `PATH` only, SIGKILL timeout; `ISOLATION=docker` → `--network none` container |
| independent grader | `src/evolution/evaluate.ts` | copies the agent's `src/` into a fresh dir, restores test files from the benchmark, adds private hidden tests; counts "self-reported success but failed" as overclaims |
| benchmark | `tasks/` | coupled maintenance tickets with visible + hidden tests and reference solutions, split dev / val / test; `tasks/validate-fixtures.mjs` proves each one fails initially and passes with its reference solution |
| failure analysis | `src/evolution/analyze.ts`, `src/providers/subquadratic.ts` | SubQ Snap 1.1 Decisions API, see below |
| mutation | `src/evolution/mutate.ts` | typed `MutationProposal`; guard rejects non-mutable fields, frozen budget, benchmark identifiers (anti-overfitting) |
| promotion | `src/evolution/promote.ts` | fixed gate; unit-tested in `tests/harness.test.ts` |
| versioning | `versions/` | every candidate saved (`v0.1.json` …), `current.json` pointer, append-only `history.jsonl`; all proposals (incl. rejected) in `mutations/` |
| provenance | `results/llm-calls.jsonl` | every model call: role, provider, model id, tokens, latency, prompt hash |

### why SubQ Snap (and how it's used)

SubQ Snap 1.1 is a *decisions* model, not a chat model. It takes up to 384K tokens of state and up to 128 typed questions (`choice` / `score` / `noul`) and returns calibrated probabilities. agentgym puts **every dev trace in one call**: tickets, original source, each attempt's reasoning and edits, visible results, final source, and the grader's hidden-test failures. It then asks per-trace questions (failure category: model reasoning vs tool vs environment vs task-specific, plus which weakness) and collection-level questions (dominant *recurring* weakness, prevalence of each weakness, is it systemic, does the agent overclaim, which intervention lever). The answers are cross-trace judgments that no single failure would show. Every answer is linked back to trace ids as evidence.

## demo video

[`docs/agentgym-demo.mp4`](docs/agentgym-demo.mp4) is a 60s walkthrough of a real recorded run. Scripts are in [`DEMO.md`](DEMO.md).

## results (actual executions, Nov 7 2026)

Full tables are in [`RESULTS.md`](RESULTS.md), generated from `results/evolutions/*.json`.

| run | coder | dev (parent) | SubQ recurring weakness | validation parent → candidates | decision |
|---|---|---|---|---|---|
| evo-…23-02-26 | Meta muse-spark-1.3 | 10/12 (2 overclaims) | missed_error_paths p=0.79, systemic 0.79 | 12/12 → 12/12, **11/12 (regression)** | REJECT all |
| evo-…23-11-20 | Meta muse-spark-1.1 | 9/12 (3 overclaims) | missed_error_paths p=0.96, systemic 0.98 | 12/12 → 12/12, 12/12, **11/12 (regression)** | REJECT all |

**What we can honestly claim:**
- The loop runs end to end on real sponsor APIs: Meta coder, SubQ Snap analysis, Meta mutation, Gemini review, independent grading, gate and versioning.
- Every failure the grader caught was one the agent had **claimed as a success**, which is what "trust but verify" means here. SubQ put the overclaim probability at 0.99–1.00.
- SubQ's cross-trace diagnosis matched the hidden-test evidence: both failing tickets lacked abort/rejection-path handling.
- The gate rejected two Meta mutations that **regressed** unseen tasks, and rejected ties.
- In-distribution diagnostic (not used for promotion): Meta's v0.6 "plan-first boundary/failure mapping" mutation raised dev 15/18 → 17/18 and cut overclaims 3 → 1. It tied on saturated validation, so it was **not** promoted. See `results/final/dev-diagnostic.md`.

**What we can't claim:** a validated generalizing improvement. Our validation and test splits are saturated by current Meta models (12/12, 6/6), so this benchmark can't yet tell a better methodology from the baseline on unseen tasks. We report that instead of reshaping the tests after seeing results.

## sponsor usage (from `npm run usage`, i.e. `results/llm-calls.jsonl`)

| role | provider · model | calls |
|---|---|---|
| analyzer | Subquadratic · subq-snap-1.1 (Decisions API) | 4 calls, ~95K input tokens, 36 typed questions per evolution |
| coder | Meta · muse-spark-1.1 / 1.2 / 1.3 | 280 calls |
| mutator | Meta · muse-spark-1.3 | 2 calls |
| verifier | Gemini · gemini-3.8-flash | 5 calls (advisory only) |
| dev adapter | claude-cli · claude-haiku-5-5 | 38 calls, early harness development only, labeled in every record |

## what was built here vs pre-existing

Everything in `src/`, `tasks/`, `tests/`, `ui/` and `scripts/`, plus all fixtures, results and docs, was written on Nov 7 2026 during the hackathon. Third-party pieces used as-is: Node.js, npm packages `tsx`, `typescript`, `vitest`, `dotenv`, `@types/node` (dev tooling only, with no runtime deps beyond `dotenv`), the Geist fonts from Google Fonts in the UI, and the sponsor APIs (Subquadratic, Meta Model API, Google Gemini). Design guidance for the UI came from tasteskill.dev. The local `claude` CLI was used only as a labeled dev adapter before sponsor keys arrived.

## not done

- fetch.ai integration: skipped for time.
- Docker isolation (`ISOLATION=docker`) is implemented but was not exercised. All recorded runs used the Node permission-model subprocess sandbox.
- One evolution iteration per run. Multi-iteration lineage is supported (`--iterations n`) but was not run.
- The UI was checked visually at 1440px only (a responsive breakpoint exists but is untested). The live "run evolution" button was not exercised from the UI; all runs were launched from the CLI.

## limitations (honest)

- The benchmark is small (tens of runs), so results are directional, not statistically robust generalization claims.
- The coder model is nondeterministic. We use reps and a strict no-regression gate, but a lucky run is still possible at this sample size.
- Unless a key is configured, the coder and mutator run on the claude-cli dev adapter. Check `results/llm-calls.jsonl` for the provider that actually served each call.

MIT license.
