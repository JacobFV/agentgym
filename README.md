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

## results

See `RESULTS.md` (generated from actual runs) and `results/evolutions/*.md`.

## limitations (honest)

- The benchmark is small (tens of runs), so results are directional, not statistically robust generalization claims.
- The coder model is nondeterministic. We use reps and a strict no-regression gate, but a lucky run is still possible at this sample size.
- Unless a key is configured, the coder and mutator run on the claude-cli dev adapter. Check `results/llm-calls.jsonl` for the provider that actually served each call.

MIT license.
