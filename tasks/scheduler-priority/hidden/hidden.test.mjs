import test from 'node:test';
import assert from 'node:assert/strict';
import { Scheduler } from '../src/scheduler.mjs';
import { formatRunLog } from '../src/report.mjs';

const clock = () => { const c = { t: 0, now: () => c.t }; return c; };

test('hidden: equal priority keeps FIFO order', async () => {
  const s = new Scheduler({ now: () => 0 });
  const ran = [];
  for (let i = 0; i < 12; i++) s.schedule(`j${i}`, () => ran.push(i), { priority: i % 3 === 0 ? 7 : 5 });
  await s.tick();
  assert.deepEqual(ran, [0, 3, 6, 9, 1, 2, 4, 5, 7, 8, 10, 11]);
});

test('hidden: priority 0 is valid and lowest', async () => {
  const s = new Scheduler({ now: () => 0 });
  const ran = [];
  s.schedule('zero', () => ran.push('zero'), { priority: 0 });
  s.schedule('default', () => ran.push('default'));
  await s.tick();
  assert.deepEqual(ran, ['default', 'zero']);
});

test('hidden: a future high-priority job does not block due jobs', async () => {
  const c = clock();
  const s = new Scheduler({ now: c.now });
  const ran = [];
  s.schedule('later-urgent', () => ran.push('later-urgent'), { delayMs: 1000, priority: 9 });
  s.schedule('now-a', () => ran.push('now-a'), { priority: 1 });
  s.schedule('now-b', () => ran.push('now-b'));
  assert.equal(await s.tick(), 2);
  assert.deepEqual(ran, ['now-b', 'now-a']);
  c.t = 1000;
  assert.equal(await s.tick(), 1);
  assert.deepEqual(ran, ['now-b', 'now-a', 'later-urgent']);
});

test('hidden: priority orders only within a tick; earlier ticks are not reordered', async () => {
  const c = clock();
  const s = new Scheduler({ now: c.now });
  const ran = [];
  s.schedule('a', () => ran.push('a'), { delayMs: 10, priority: 2 });
  s.schedule('b', () => ran.push('b'), { delayMs: 20, priority: 9 });
  c.t = 10;
  await s.tick();
  c.t = 20;
  await s.tick();
  assert.deepEqual(ran, ['a', 'b']);
});

test('hidden: invalid priorities throw RangeError and do not schedule', async () => {
  const s = new Scheduler({ now: () => 0 });
  for (const p of [10, -1, 2.5, '5', NaN, null]) {
    assert.throws(() => s.schedule('bad', () => {}, { priority: p }), (e) => {
      assert.ok(e instanceof RangeError, `priority ${String(p)}: ${e}`);
      assert.equal(e.message, 'priority must be an integer between 0 and 9');
      return true;
    });
  }
  assert.equal(await s.tick(), 0);
});

test('hidden: cancel still works with priorities', async () => {
  const s = new Scheduler({ now: () => 0 });
  const ran = [];
  const id = s.schedule('x', () => ran.push('x'), { priority: 9 });
  s.schedule('y', () => ran.push('y'));
  assert.equal(s.cancel(id), true);
  assert.equal(s.cancel(id), false);
  await s.tick();
  assert.deepEqual(ran, ['y']);
});

test('hidden: jobs scheduled during a tick run on the next tick', async () => {
  const s = new Scheduler({ now: () => 0 });
  const ran = [];
  s.schedule('parent', () => { ran.push('parent'); s.schedule('child', () => ran.push('child'), { priority: 9 }); }, { priority: 1 });
  s.schedule('sibling', () => ran.push('sibling'), { priority: 0 });
  assert.equal(await s.tick(), 2);
  assert.deepEqual(ran, ['parent', 'sibling']);
  await s.tick();
  assert.deepEqual(ran, ['parent', 'sibling', 'child']);
});

test('hidden: errors are logged and the log format is unchanged', async () => {
  const s = new Scheduler({ now: () => 42 });
  s.schedule('boom', () => { throw new Error('kaput'); }, { priority: 8 });
  s.schedule('fine', async () => {}, { priority: 3 });
  await s.tick();
  assert.equal(formatRunLog(s.log), 't=42 name="boom" status="error" message="kaput"\nt=42 name="fine" status="ok"');
});
