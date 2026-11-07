// Consumer: turns a metrics summary into alerts.
// Alert shape: { route: string, kind: 'latency' | 'errors', value: number }

export function checkAlerts(summary, { p95ThresholdMs = 500, maxErrorRate = 0.05 } = {}) {
  const alerts = [];
  for (const route of Object.keys(summary.routes)) {
    const r = summary.routes[route];
    if (r.p95Ms > p95ThresholdMs) {
      alerts.push({ route, kind: 'latency', value: r.p95Ms });
    }
    const rate = r.errors / r.count;
    if (rate > maxErrorRate) {
      alerts.push({ route, kind: 'errors', value: rate });
    }
  }
  return alerts;
}
