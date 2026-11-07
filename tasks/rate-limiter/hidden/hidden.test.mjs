import test from 'node:test';
import assert from 'node:assert/strict';
import { TokenBucket } from '../src/tokenBucket.mjs';
import { RateLimiter } from '../src/limiter.mjs';

const clock = (start = 0) => {
  const c = { t: start, now: () => c.t };
  return c;
};

test('hidden: partial time is not lost across frequent polls', () => {
  const c = clock();
  const b = new TokenBucket({ capacity: 3, refillPerSec: 1, now: c.now });
  b.tryRemove(3);
  for (let i = 0; i < 4; i++) { c.t += 250; b.tokens; }
  assert.ok(Math.abs(b.tokens - 1) < 1e-9);
  assert.equal(b.tryRemove(), true);
});

test('hidden: fractional token counts are exposed', () => {
  const c = clock();
  const b = new TokenBucket({ capacity: 4, refillPerSec: 4, now: c.now });
  b.tryRemove(4);
  c.t += 125;
  assert.ok(Math.abs(b.tokens - 0.5) < 1e-9);
  assert.equal(b.tryRemove(), false);
});

test('hidden: burst capped at capacity after long idle', () => {
  const c = clock();
  const b = new TokenBucket({ capacity: 5, refillPerSec: 10, now: c.now });
  c.t += 3_600_000;
  assert.equal(b.tokens, 5);
  for (let i = 0; i < 5; i++) assert.equal(b.tryRemove(), true);
  assert.equal(b.tryRemove(), false);
});

test('hidden: rejected requests do not consume tokens / go negative', () => {
  const c = clock();
  const b = new TokenBucket({ capacity: 2, refillPerSec: 1, now: c.now });
  assert.equal(b.tryRemove(2), true);
  for (let i = 0; i < 10; i++) assert.equal(b.tryRemove(), false);
  assert.equal(b.tokens, 0);
  c.t += 1000;
  assert.equal(b.tryRemove(), true);
});

test('hidden: request larger than available is rejected without consuming', () => {
  const c = clock();
  const b = new TokenBucket({ capacity: 5, refillPerSec: 1, now: c.now });
  assert.equal(b.tryRemove(6), false);
  assert.equal(b.tokens, 5);
  assert.equal(b.tryRemove(3), true);
  assert.equal(b.tryRemove(3), false);
  assert.equal(b.tokens, 2);
});

test('hidden: clock going backwards does not remove or add tokens', () => {
  const c = clock(10_000);
  const b = new TokenBucket({ capacity: 4, refillPerSec: 1, now: c.now });
  b.tryRemove(4);
  c.t = 5_000;
  assert.equal(b.tokens, 0);
  c.t = 6_000;
  assert.ok(b.tokens >= 0 && b.tokens <= 1);
});

test('hidden: limiter keys are independent', () => {
  const c = clock();
  const rl = new RateLimiter({ capacity: 1, refillPerSec: 1, now: c.now });
  assert.equal(rl.allow('a'), true);
  assert.equal(rl.allow('a'), false);
  assert.equal(rl.allow('b'), true);
});

test('hidden: retryAfterMs with fractional tokens', () => {
  const c = clock();
  const rl = new RateLimiter({ capacity: 2, refillPerSec: 2, now: c.now });
  assert.equal(rl.retryAfterMs('k'), 0);
  rl.allow('k', 2);
  assert.equal(rl.retryAfterMs('k'), 500);
  for (let i = 0; i < 5; i++) rl.allow('k');
  assert.equal(rl.retryAfterMs('k'), 500, 'rejected calls must not push retry time out');
  c.t += 300;
  assert.equal(rl.retryAfterMs('k'), 200);
  c.t += 200;
  assert.equal(rl.retryAfterMs('k'), 0);
  assert.equal(rl.allow('k'), true);
});
