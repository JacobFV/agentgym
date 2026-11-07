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

function abortable(promise, signal) {
  if (!signal) return promise;
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (v) => { signal.removeEventListener('abort', onAbort); resolve(v); },
      (e) => { signal.removeEventListener('abort', onAbort); reject(e); },
    );
  });
}

export async function retry(fn, opts = {}) {
  const { retries = 3, baseDelayMs = 100, factor = 2, sleep = defaultSleep, signal } = opts;
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    signal?.throwIfAborted();
    try {
      return await fn(attempt);
    } catch (err) {
      lastErr = err;
      if (err && err.retryable === false) throw err;
    }
    signal?.throwIfAborted();
    if (attempt < retries) {
      await abortable(Promise.resolve(sleep(baseDelayMs * factor ** attempt, signal)), signal);
    }
  }
  throw lastErr;
}
