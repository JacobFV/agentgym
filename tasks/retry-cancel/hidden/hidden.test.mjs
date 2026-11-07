import test from 'node:test';
import assert from 'node:assert/strict';
import { retry } from '../src/retry.mjs';
import { createClient } from '../src/httpClient.mjs';

const fakeSleep = (delays) => async (ms) => { delays.push(ms); };

test('hidden: exact attempt count and no sleep after last failure', async () => {
  const delays = [];
  let attempts = 0;
  const err = new Error('always');
  await assert.rejects(
    retry(async () => { attempts++; throw err; }, { retries: 3, baseDelayMs: 10, factor: 3, sleep: fakeSleep(delays) }),
    (e) => e === err,
  );
  assert.equal(attempts, 4);
  assert.deepEqual(delays, [10, 30, 90]);
});

test('hidden: retries=0 means exactly one attempt', async () => {
  const delays = [];
  let attempts = 0;
  await assert.rejects(
    retry(async () => { attempts++; throw new Error('x'); }, { retries: 0, sleep: fakeSleep(delays) }),
    /x/,
  );
  assert.equal(attempts, 1);
  assert.deepEqual(delays, []);
});

test('hidden: attempt index is passed to fn', async () => {
  const seen = [];
  await retry(async (i) => { seen.push(i); if (i < 2) throw new Error('x'); }, { retries: 5, sleep: async () => {} });
  assert.deepEqual(seen, [0, 1, 2]);
});

test('hidden: non-retryable errors are thrown immediately', async () => {
  const delays = [];
  let attempts = 0;
  const err = Object.assign(new Error('bad request'), { retryable: false });
  await assert.rejects(
    retry(async () => { attempts++; throw err; }, { retries: 5, sleep: fakeSleep(delays) }),
    (e) => e === err,
  );
  assert.equal(attempts, 1);
  assert.deepEqual(delays, []);
});

test('hidden: already-aborted signal rejects with reason without calling fn', async () => {
  const ac = new AbortController();
  const reason = new Error('cancelled');
  ac.abort(reason);
  let attempts = 0;
  await assert.rejects(
    retry(async () => { attempts++; }, { retries: 3, sleep: async () => {}, signal: ac.signal }),
    (e) => e === reason,
  );
  assert.equal(attempts, 0);
});

test('hidden: abort after a failed attempt stops further attempts', async () => {
  const ac = new AbortController();
  const reason = new Error('user cancelled');
  let attempts = 0;
  await assert.rejects(
    retry(async () => { attempts++; ac.abort(reason); throw new Error('flaky'); },
      { retries: 5, sleep: async () => {}, signal: ac.signal }),
    (e) => e === reason,
  );
  assert.equal(attempts, 1);
});

test('hidden: abort during backoff rejects promptly even if sleep ignores the signal', async () => {
  const ac = new AbortController();
  const reason = new Error('timeout');
  let attempts = 0;
  const neverSleep = () => {
    setTimeout(() => ac.abort(reason), 5);
    return new Promise(() => {}); // ignores the signal and never resolves
  };
  await assert.rejects(
    retry(async () => { attempts++; throw new Error('flaky'); }, { retries: 3, sleep: neverSleep, signal: ac.signal }),
    (e) => e === reason,
  );
  assert.equal(attempts, 1);
});

test('hidden: http client does not retry 4xx but retries 5xx', async () => {
  let calls = 0;
  const c404 = createClient({ retries: 3, sleep: async () => {}, transport: async () => { calls++; return { status: 404, body: '' }; } });
  await assert.rejects(c404.getJson('/missing'), (e) => e.status === 404);
  assert.equal(calls, 1);

  calls = 0;
  const flaky = createClient({
    retries: 2,
    sleep: async () => {},
    transport: async () => { calls++; return calls < 3 ? { status: 503, body: '' } : { status: 200, body: '{"ok":true}' }; },
  });
  assert.deepEqual(await flaky.getJson('/x'), { ok: true });
  assert.equal(calls, 3);
});

test('hidden: http client honors abort signal', async () => {
  const ac = new AbortController();
  const reason = new Error('nav away');
  let calls = 0;
  const client = createClient({
    retries: 5,
    sleep: async () => {},
    transport: async () => { calls++; ac.abort(reason); return { status: 503, body: '' }; },
  });
  await assert.rejects(client.getJson('/x', { signal: ac.signal }), (e) => e === reason);
  assert.equal(calls, 1);
});
