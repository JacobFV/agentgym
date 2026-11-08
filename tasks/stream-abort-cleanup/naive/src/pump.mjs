export async function pump(source, sink, opts = {}) {
  const { signal } = opts;
  let written = 0;
  try {
    while (true) {
      if (signal?.aborted) throw signal.reason;
      const { done, value } = await source.next();
      if (done) break;
      await sink.write(value);
      written++;
    }
  } catch (err) {
    await source.return();
    await sink.abort(err);
    throw err;
  }
  await sink.close();
  return { written };
}
