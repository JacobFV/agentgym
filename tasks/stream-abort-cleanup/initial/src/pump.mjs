// Copies chunks from an async source into a sink.
export async function pump(source, sink, opts = {}) {
  while (true) {
    const { done, value } = await source.next();
    if (done) break;
    await sink.write(value);
  }
  await sink.close();
}
