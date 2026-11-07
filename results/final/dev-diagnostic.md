## in-distribution diagnostic (NOT used for promotion)

After evolution run `evo-2026-11-07T23-11-20-iup6`, the parent and all three rejected candidates were re-run on the **dev** tickets that SubQ diagnosed (`npm run benchmark -- --split dev --versions v0,v0.5,v0.6,v0.7 --reps 3`, coder Meta muse-spark-1.1, same budget). Source: `results/dev-diagnostic.log`, `results/evaluations/bench-2026-11-07T23-15-35-h6m7--*--dev.json`.

| version | mutation (Meta-generated) | dev pass (18 runs) | overclaims | dedupe-cache | retry-cancel |
|---|---|---|---|---|---|
| v0 | — | 15/18 | 3 | 2/3 | 1/3 |
| v0.5 | post-green self-review + failure-path audit | 14/18 | 4 | 0/3 | 2/3 |
| v0.6 | plan-first: map each boundary to its throw/reject/cancel/cleanup strategy | **17/18** | **1** | 2/3 | **3/3** |
| v0.7 | defensive failure-handling skill | 16/18 | 2 | 1/3 | 3/3 |

Reading: v0.6 fixes the weakness SubQ diagnosed on the tickets it was diagnosed from. This is in-distribution evidence only. On unseen validation tasks it tied the parent at 12/12, because validation is saturated, so the gate did **not** promote it. That's the right call: a dev-set gain is not proof of generalization. With n=18 runs the dev gain (15→17) is also within noise. The next step is a larger, harder validation pool.

## held-out test split (untouched until final)

v0 with muse-spark-1.1, reps 2: 6/6 (`results/final-test-v0.log`). Nothing was promoted, so there is no candidate to compare on test.
