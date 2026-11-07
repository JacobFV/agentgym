import test from 'node:test';
import assert from 'node:assert/strict';
import { retry } from '../src/retry.mjs';

test('retries=2 makes 3 attempts with exponential backoff', async () => {
  const delays = [];
  const sleep = async (ms) => { delays.push(ms); };
  let attempts = 0;
  const result = await retry(async () => {
    attempts++;
    if (attempts < 3) throw new Error('flaky');
    return 'ok';
  }, { retries: 2, baseDelayMs: 100, sleep });
  assert.equal(result, 'ok');
  assert.equal(attempts, 3);
  assert.deepEqual(delays, [100, 200]);
});
