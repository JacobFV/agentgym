import test from 'node:test';
import assert from 'node:assert/strict';
import { summarize } from '../src/metrics.mjs';
import { checkAlerts } from '../src/alerting.mjs';
import { renderDashboard } from '../src/dashboard.mjs';

function fixture() {
  const samples = [];
  for (let i = 1; i <= 20; i++) samples.push({ route: '/api/orders', durationMs: i * 10, status: i <= 2 ? 503 : 200 });
  for (let i = 1; i <= 10; i++) samples.push({ route: '/api/search', durationMs: 700 + i, status: 200 });
  for (let i = 1; i <= 10; i++) samples.push({ route: '/health', durationMs: 1, status: 200 });
  return samples;
}

test('hidden: summarize output contract is unchanged', () => {
  assert.deepEqual(summarize(fixture(), { windowMs: 30_000 }), {
    windowMs: 30_000,
    routes: [
      { route: '/api/orders', count: 20, errors: 2, p95: 190 },
      { route: '/api/search', count: 10, errors: 0, p95: 710 },
      { route: '/health', count: 10, errors: 0, p95: 1 },
    ],
  });
});

test('hidden: error-rate and latency alerts carry real route names in summary order', () => {
  const alerts = checkAlerts(summarize(fixture()), { p95ThresholdMs: 500, maxErrorRate: 0.05 });
  assert.deepEqual(alerts, [
    { route: '/api/orders', kind: 'errors', value: 0.1 },
    { route: '/api/search', kind: 'latency', value: 710 },
  ]);
});

test('hidden: no alerts when within thresholds', () => {
  assert.deepEqual(checkAlerts(summarize(fixture()), { p95ThresholdMs: 1000, maxErrorRate: 0.5 }), []);
});

test('hidden: default thresholds are used', () => {
  const alerts = checkAlerts(summarize(fixture()));
  assert.deepEqual(alerts.map((a) => `${a.route}:${a.kind}`), ['/api/orders:errors', '/api/search:latency']);
});

test('hidden: alerting works on a summary read back from JSON (external contract)', () => {
  const json = JSON.stringify({ windowMs: 60000, routes: [{ route: '/x', count: 4, errors: 4, p95: 2000 }] });
  assert.deepEqual(checkAlerts(JSON.parse(json)), [
    { route: '/x', kind: 'latency', value: 2000 },
    { route: '/x', kind: 'errors', value: 1 },
  ]);
});

test('hidden: zero-count route produces no error alert', () => {
  const alerts = checkAlerts({ windowMs: 1000, routes: [{ route: '/idle', count: 0, errors: 0, p95: 0 }] });
  assert.deepEqual(alerts, []);
});

test('hidden: empty summary', () => {
  assert.deepEqual(checkAlerts(summarize([])), []);
});

test('hidden: dashboard rendering unchanged', () => {
  assert.equal(renderDashboard(summarize(fixture(), { windowMs: 30_000 })), [
    'routes over 30s',
    '/api/orders         20     2    190ms',
    '/api/search         10     0    710ms',
    '/health             10     0      1ms',
  ].join('\n'));
});
