// Copies chunks from an async source into a sink.
export async function pump(source, sink, opts = {}) {
  const { signal } = opts;
  let written = 0;
  let failed = false;
  let onAbort;
  const abortP = new Promise((_, reject) => {
    if (!signal) return;
    onAbort = () => reject(signal.reason);
    signal.addEventListener('abort', onAbort, { once: true });
  });
  abortP.catch(() => {});
  const guard = (p) => (signal ? Promise.race([p, abortP]) : p);
  try {
    if (signal?.aborted) throw signal.reason;
    while (true) {
      const { done, value } = await guard(Promise.resolve().then(() => source.next()));
      if (done) break;
      if (signal?.aborted) throw signal.reason;
      await guard(Promise.resolve().then(() => sink.write(value)));
      written++;
      if (signal?.aborted) throw signal.reason;
    }
  } catch (err) {
    failed = true;
    try { await Promise.resolve().then(() => source.return?.()); } catch {}
    try { await Promise.resolve().then(() => sink.abort(err)); } catch {}
    throw err;
  } finally {
    if (signal && onAbort) signal.removeEventListener('abort', onAbort);
  }
  if (!failed) await sink.close();
  return { written };
}
