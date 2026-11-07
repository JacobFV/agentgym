import test from 'node:test';
import assert from 'node:assert/strict';
import { TokenBucket } from '../src/tokenBucket.mjs';

test('tokens refill fractionally between polls', () => {
  let now = 0;
  const b = new TokenBucket({ capacity: 5, refillPerSec: 2, now: () => now });
  for (let i = 0; i < 5; i++) assert.equal(b.tryRemove(), true);
  now += 500;
  assert.equal(b.tryRemove(), true, 'half a second at 2/s should give one token');
});
