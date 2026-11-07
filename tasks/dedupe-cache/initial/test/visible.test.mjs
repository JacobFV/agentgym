import test from 'node:test';
import assert from 'node:assert/strict';
import { TtlCache } from '../src/cache.mjs';

test('concurrent getOrLoad calls for the same key invoke the loader once', async () => {
  const cache = new TtlCache();
  let calls = 0;
  const loader = async (key) => {
    calls++;
    await new Promise((r) => setTimeout(r, 5));
    return `value-of-${key}`;
  };
  const [a, b, c] = await Promise.all([
    cache.getOrLoad('k', loader),
    cache.getOrLoad('k', loader),
    cache.getOrLoad('k', loader),
  ]);
  assert.equal(calls, 1);
  assert.equal(a, 'value-of-k');
  assert.equal(b, 'value-of-k');
  assert.equal(c, 'value-of-k');
});
