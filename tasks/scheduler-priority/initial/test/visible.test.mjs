import test from 'node:test';
import assert from 'node:assert/strict';
import { Scheduler } from '../src/scheduler.mjs';

test('higher priority due jobs run first', async () => {
  const s = new Scheduler({ now: () => 0 });
  const ran = [];
  s.schedule('low', () => ran.push('low'), { priority: 1 });
  s.schedule('high', () => ran.push('high'), { priority: 9 });
  s.schedule('normal', () => ran.push('normal'));
  await s.tick();
  assert.deepEqual(ran, ['high', 'normal', 'low']);
});
