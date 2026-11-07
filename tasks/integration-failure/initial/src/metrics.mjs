// Producer: aggregates raw request samples into a per-route summary.
//
// Output contract (consumed by alerting, dashboard, and external services):
//   {
//     windowMs: number,
//     routes: Array<{ route: string, count: number, errors: number, p95: number /* ms */ }>
//   }
// routes are sorted by count descending, ties broken by route name ascending.

function percentile(sortedValues, p) {
  if (sortedValues.length === 0) return 0;
  // nearest-rank method
  const rank = Math.ceil((p / 100) * sortedValues.length);
  return sortedValues[Math.max(0, rank - 1)];
}

/**
 * @param {Array<{ route: string, durationMs: number, status: number }>} samples
 * @param {{ windowMs?: number }} [opts]
 */
export function summarize(samples, { windowMs = 60_000 } = {}) {
  const byRoute = new Map();
  for (const s of samples) {
    let r = byRoute.get(s.route);
    if (!r) byRoute.set(s.route, (r = { route: s.route, durations: [], errors: 0 }));
    r.durations.push(s.durationMs);
    if (s.status >= 500) r.errors++;
  }
  const routes = [...byRoute.values()].map((r) => {
    const sorted = [...r.durations].sort((a, b) => a - b);
    return { route: r.route, count: sorted.length, errors: r.errors, p95: percentile(sorted, 95) };
  });
  routes.sort((a, b) => b.count - a.count || a.route.localeCompare(b.route));
  return { windowMs, routes };
}
