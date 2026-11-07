import test from 'node:test';
import assert from 'node:assert/strict';
import { Pool } from '../src/pool.mjs';
import { Scope } from '../src/scope.mjs';
import { withConnection } from '../src/withConnection.mjs';

function spyPool() {
  const pool = new Pool();
  const releases = [];
  const orig = pool.release.bind(pool);
  pool.release = (c) => { releases.push(c); orig(c); };
  return { pool, releases };
}

test('hidden: success path releases exactly once and returns result', async () => {
  const { pool, releases } = spyPool();
  const r = await withConnection(pool, async (conn) => `ran on ${conn.id}`);
  assert.equal(r, 'ran on 1');
  assert.equal(releases.length, 1);
  assert.equal(pool.stats.active, 0);
});

test('hidden: throw path releases exactly once', async () => {
  const { pool, releases } = spyPool();
  await assert.rejects(withConnection(pool, () => { throw new Error('sync throw'); }), /sync throw/);
  assert.equal(releases.length, 1);
  assert.equal(pool.stats.active, 0);
});

test('hidden: deferred cleanups run LIFO, before release', async () => {
  const order = [];
  const pool = new Pool();
  const orig = pool.release.bind(pool);
  pool.release = (c) => { order.push('release'); orig(c); };
  await withConnection(pool, async (conn, scope) => {
    scope.defer(() => order.push('close cursor A'));
    scope.defer(async () => { order.push('close cursor B'); });
  });
  assert.deepEqual(order, ['close cursor B', 'close cursor A', 'release']);
});

test('hidden: deferred cleanups also run before release when fn throws', async () => {
  const order = [];
  const pool = new Pool();
  const orig = pool.release.bind(pool);
  pool.release = (c) => { order.push('release'); orig(c); };
  await assert.rejects(withConnection(pool, async (conn, scope) => {
    scope.defer(() => order.push('cursor'));
    throw new Error('boom');
  }), /boom/);
  assert.deepEqual(order, ['cursor', 'release']);
  assert.equal(pool.stats.active, 0);
});

test('hidden: fn error wins over cleanup error, and release still happens', async () => {
  const { pool, releases } = spyPool();
  const fnErr = new Error('fn failed');
  await assert.rejects(withConnection(pool, async (conn, scope) => {
    scope.defer(() => { throw new Error('cursor close failed'); });
    throw fnErr;
  }), (e) => e === fnErr);
  assert.equal(releases.length, 1);
  assert.equal(pool.stats.active, 0);
});

test('hidden: cleanup error propagates on success path, release still happens', async () => {
  const { pool, releases } = spyPool();
  await assert.rejects(withConnection(pool, async (conn, scope) => {
    scope.defer(() => { throw new Error('cursor close failed'); });
    return 'ok';
  }), /cursor close failed/);
  assert.equal(releases.length, 1);
  assert.equal(pool.stats.active, 0);
});

test('hidden: acquire failure does not release', async () => {
  const pool = new Pool({ create: async () => { throw new Error('connect refused'); } });
  let released = 0;
  pool.release = () => { released++; };
  let ran = false;
  await assert.rejects(withConnection(pool, async () => { ran = true; }), /connect refused/);
  assert.equal(ran, false);
  assert.equal(released, 0);
});

test('hidden: pool does not drain after many failures', async () => {
  const pool = new Pool({ max: 1 });
  for (let i = 0; i < 5; i++) {
    await assert.rejects(withConnection(pool, async () => { throw new Error('x'); }));
  }
  assert.equal(await withConnection(pool, async (c) => c.id), 1);
  assert.equal(pool.stats.created, 1);
});

test('hidden: Scope.close runs all callbacks LIFO and rejects with the single error', async () => {
  const s = new Scope();
  const order = [];
  const err = new Error('two');
  s.defer(() => order.push(1));
  s.defer(() => { order.push(2); throw err; });
  s.defer(() => order.push(3));
  await assert.rejects(s.close(), (e) => e === err);
  assert.deepEqual(order, [3, 2, 1]);
});

test('hidden: Scope.close aggregates multiple errors in run order', async () => {
  const s = new Scope();
  const e1 = new Error('first registered');
  const e2 = new Error('second registered');
  s.defer(() => { throw e1; });
  s.defer(async () => { throw e2; });
  await assert.rejects(s.close(), (e) => {
    assert.ok(e instanceof AggregateError);
    assert.deepEqual(e.errors, [e2, e1]);
    return true;
  });
});

test('hidden: Scope.close is idempotent', async () => {
  const s = new Scope();
  let n = 0;
  s.defer(() => { n++; });
  await s.close();
  await s.close();
  assert.equal(n, 1);
});
