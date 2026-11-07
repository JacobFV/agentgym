import test from 'node:test';
import assert from 'node:assert/strict';
import { summarize } from '../src/metrics.mjs';
import { checkAlerts } from '../src/alerting.mjs';

test('latency alert fires for a slow route', () => {
  const samples = [];
  for (let i = 0; i < 20; i++) samples.push({ route: '/slow', durationMs: 900, status: 200 });
  for (let i = 0; i < 20; i++) samples.push({ route: '/fast', durationMs: 20, status: 200 });
  const alerts = checkAlerts(summarize(samples), { p95ThresholdMs: 500 });
  assert.deepEqual(alerts, [{ route: '/slow', kind: 'latency', value: 900 }]);
});
