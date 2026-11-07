// Consumer: turns a metrics summary into alerts.
// Alert shape: { route: string, kind: 'latency' | 'errors', value: number }
// Input: the summarize() contract from metrics.mjs - routes is an ARRAY of
// { route, count, errors, p95 } with p95 in milliseconds.

export function checkAlerts(summary, { p95ThresholdMs = 500, maxErrorRate = 0.05 } = {}) {
  const alerts = [];
  for (const r of summary.routes) {
    if (r.p95 > p95ThresholdMs) {
      alerts.push({ route: r.route, kind: 'latency', value: r.p95 });
    }
    if (r.count > 0) {
      const rate = r.errors / r.count;
      if (rate > maxErrorRate) {
        alerts.push({ route: r.route, kind: 'errors', value: rate });
      }
    }
  }
  return alerts;
}
