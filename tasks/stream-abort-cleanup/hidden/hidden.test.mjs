import test from 'node:test';
import assert from 'node:assert/strict';
import { pump } from '../src/pump.mjs';
import { fromArray, collectSink } from '../src/sources.mjs';

function settleWithin(promise, ms = 300) {
  let t;
  const timeout = new Promise((_, rej) => { t = setTimeout(() => rej(new Error(`did not settle within ${ms}ms`)), ms); });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(t));
}
function trackUnhandled() {
  const seen = [];
  const h = (r) => seen.push(r);
  process.on('unhandledRejection', h);
  return { seen, stop: () => process.off('unhandledRejection', h) };
}
const tick = () => new Promise((r) => setTimeout(r, 5));

test('hidden: write failure -> return once, abort once with original error, never close', async () => {
  const src = fromArray([1, 2, 3, 4]);
  const sink = collectSink();
  const boom = new Error('disk full');
  sink.write = async function (c) { if (c === 2) throw boom; this.chunks.push(c); };
  await assert.rejects(settleWithin(pump(src, sink)), (e) => e === boom);
  assert.equal(src.returned, 1);
  assert.deepEqual(sink.aborted, [boom]);
  assert.equal(sink.closed, 0);
});

test('hidden: original error preserved when source.return and sink.abort both throw', async () => {
  const u = trackUnhandled();
  try {
    let returned = 0, aborted = 0;
    const boom = new Error('next failed');
    const src = { async next() { throw boom; }, return() { returned++; throw new Error('return exploded'); } };
    const sink = { async write() {}, async close() { throw new Error('close must not be called'); }, abort() { aborted++; return Promise.reject(new Error('abort exploded')); } };
    await assert.rejects(settleWithin(pump(src, sink)), (e) => e === boom);
    await tick();
    assert.equal(returned, 1);
    assert.equal(aborted, 1);
    assert.deepEqual(u.seen, []);
  } finally { u.stop(); }
});

test('hidden: abort while next() hangs forever rejects promptly with reason and cleans up once', async () => {
  const ac = new AbortController();
  let returned = 0, calls = 0;
  const src = { next() { calls++; return calls === 1 ? Promise.resolve({ done: false, value: 'x' }) : calls > 2 ? Promise.resolve({ done: true }) : new Promise((r) => setTimeout(() => r({ done: false, value: 'late' }), 45)); }, async return() { returned++; return { done: true }; } };
  const sink = collectSink();
  const p = pump(src, sink, { signal: ac.signal });
  await tick();
  const reason = new Error('user cancelled');
  const t0 = Date.now();
  ac.abort(reason);
  await assert.rejects(settleWithin(p), (e) => e === reason);
  assert.ok(Date.now() - t0 < 30, 'abort must not wait for the pending next()');
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(returned, 1);
  assert.deepEqual(sink.aborted, [reason]);
  assert.equal(sink.closed, 0);
  assert.deepEqual(sink.chunks, ['x']);
});

test('hidden: abort during a slow write -> no further writes, reason preserved', async () => {
  const ac = new AbortController();
  const src = fromArray([1, 2, 3]);
  const sink = collectSink();
  let writes = 0;
  sink.write = function (c) { writes++; if (c === 1) { setTimeout(() => ac.abort(new Error('stop')), 1); return new Promise((r) => setTimeout(r, 20)); } this.chunks.push(c); };
  await assert.rejects(settleWithin(pump(src, sink, { signal: ac.signal })), /stop/);
  await new Promise((r) => setTimeout(r, 30));
  assert.equal(writes, 1);
  assert.equal(src.returned, 1);
  assert.equal(sink.aborted.length, 1);
  assert.equal(sink.closed, 0);
});

test('hidden: pre-aborted signal reads and writes nothing', async () => {
  const ac = new AbortController();
  const reason = new Error('already');
  ac.abort(reason);
  let nexts = 0, returned = 0;
  const src = { async next() { nexts++; return nexts > 3 ? { done: true } : { done: false, value: 1 }; }, async return() { returned++; } };
  const sink = collectSink();
  await assert.rejects(settleWithin(pump(src, sink, { signal: ac.signal })), (e) => e === reason);
  assert.equal(nexts, 0);
  assert.equal(returned, 1);
  assert.deepEqual(sink.aborted, [reason]);
  assert.deepEqual(sink.chunks, []);
});

test('hidden: synchronous throw from sink.write is handled like a rejection', async () => {
  const src = fromArray([1]);
  const boom = new Error('sync');
  const sink = collectSink();
  sink.write = () => { throw boom; };
  await assert.rejects(settleWithin(pump(src, sink)), (e) => e === boom);
  assert.equal(src.returned, 1);
  assert.deepEqual(sink.aborted, [boom]);
});
