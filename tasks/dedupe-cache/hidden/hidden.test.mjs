import test from 'node:test';
import assert from 'node:assert/strict';
import { TtlCache } from '../src/cache.mjs';
import { createUserService } from '../src/userService.mjs';

const tick = (ms = 2) => new Promise((r) => setTimeout(r, ms));

test('hidden: concurrent callers share a rejection and it is not cached', async () => {
  const cache = new TtlCache();
  let calls = 0;
  const failing = async () => {
    calls++;
    await tick();
    throw new Error('boom');
  };
  const results = await Promise.allSettled([
    cache.getOrLoad('k', failing),
    cache.getOrLoad('k', failing),
  ]);
  assert.equal(calls, 1, 'rejecting loader should also be shared');
  assert.deepEqual(results.map((r) => r.status), ['rejected', 'rejected']);
  assert.equal(results[0].reason.message, 'boom');
  assert.equal(cache.has('k'), false);
  assert.equal(cache.size, 0);

  const v = await cache.getOrLoad('k', async () => {
    calls++;
    return 'ok';
  });
  assert.equal(v, 'ok');
  assert.equal(calls, 2, 'loader must be retried after a failure');
});

test('hidden: synchronous loader throw is not cached either', async () => {
  const cache = new TtlCache();
  await assert.rejects(cache.getOrLoad('k', () => { throw new Error('sync'); }), /sync/);
  assert.equal(await cache.getOrLoad('k', () => 1), 1);
});

test('hidden: get() never returns a promise, even while a load is in flight', async () => {
  const cache = new TtlCache();
  let release;
  const p = cache.getOrLoad('k', () => new Promise((r) => { release = r; }));
  await tick();
  assert.equal(cache.get('k'), undefined);
  assert.equal(cache.has('k'), false);
  assert.equal(cache.size, 0);
  release('v');
  assert.equal(await p, 'v');
  assert.equal(cache.get('k'), 'v');
  assert.equal(cache.size, 1);
});

test('hidden: different keys load independently and concurrently', async () => {
  const cache = new TtlCache();
  const seen = [];
  const loader = async (key) => {
    seen.push(key);
    await tick();
    return key.toUpperCase();
  };
  const out = await Promise.all([
    cache.getOrLoad('a', loader),
    cache.getOrLoad('b', loader),
    cache.getOrLoad('a', loader),
    cache.getOrLoad('b', loader),
  ]);
  assert.deepEqual(out, ['A', 'B', 'A', 'B']);
  assert.deepEqual(seen.sort(), ['a', 'b']);
});

test('hidden: ttl expiry still triggers a reload', async () => {
  let now = 1000;
  const cache = new TtlCache({ ttlMs: 100, now: () => now });
  let calls = 0;
  const loader = async () => ++calls;
  assert.equal(await cache.getOrLoad('k', loader), 1);
  now += 50;
  assert.equal(await cache.getOrLoad('k', loader), 1);
  now += 60;
  assert.equal(await cache.getOrLoad('k', loader), 2);
  assert.equal(calls, 2);
});

test('hidden: maxSize eviction preserved', async () => {
  const cache = new TtlCache({ maxSize: 2 });
  await cache.getOrLoad('a', () => 1);
  await cache.getOrLoad('b', () => 2);
  await cache.getOrLoad('c', () => 3);
  assert.equal(cache.size, 2);
  assert.equal(cache.get('a'), undefined);
  assert.equal(cache.get('c'), 3);
});

test('hidden: userService dedupes and does not cache API errors', async () => {
  let calls = 0;
  let fail = true;
  const api = {
    async fetchUser(id) {
      calls++;
      await tick();
      if (fail) throw new Error('503');
      return { id, name: 'Ada' };
    },
  };
  const svc = createUserService(api);
  const r = await Promise.allSettled([svc.getUser(1), svc.getUser(1)]);
  assert.equal(calls, 1);
  assert.ok(r.every((x) => x.status === 'rejected'));
  assert.equal(svc.peekUser(1), undefined);
  fail = false;
  const [u1, u2] = await Promise.all([svc.getUser(1), svc.getUser(1)]);
  assert.equal(calls, 2);
  assert.deepEqual(u1, { id: 1, name: 'Ada' });
  assert.equal(u1, u2);
  assert.deepEqual(svc.peekUser(1), { id: 1, name: 'Ada' });
});
