// Consumer: renders the summary as a text table for the ops dashboard.
export function renderDashboard(summary) {
  const header = `routes over ${Math.round(summary.windowMs / 1000)}s`;
  const rows = summary.routes.map(
    (r) => `${r.route.padEnd(16)}${String(r.count).padStart(6)}${String(r.errors).padStart(6)}${`${r.p95}ms`.padStart(9)}`,
  );
  return [header, ...rows].join('\n');
}
