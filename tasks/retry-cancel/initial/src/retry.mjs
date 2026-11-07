// Generic async retry helper.
//
// Options:
//   retries      number of retries AFTER the first attempt (default 3)
//   baseDelayMs  delay before the first retry (default 100)
//   factor       exponential backoff multiplier (default 2)
//   sleep        (ms, signal) => Promise, injectable for tests
//   signal       optional AbortSignal; aborting cancels further attempts
//
// fn receives the zero-based attempt index.

export function defaultSleep(ms, signal) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(resolve, ms);
    signal?.addEventListener('abort', () => {
      clearTimeout(t);
      reject(signal.reason);
    }, { once: true });
  });
}

export async function retry(fn, opts = {}) {
  const { retries = 3, baseDelayMs = 100, sleep = defaultSleep } = opts;
  let lastErr;
  for (let attempt = 0; attempt < retries; attempt++) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      await sleep(baseDelayMs);
    }
  }
  throw lastErr;
}
