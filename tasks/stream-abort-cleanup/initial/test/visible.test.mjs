import test from 'node:test';
import assert from 'node:assert/strict';
import { pump } from '../src/pump.mjs';
import { fromArray, collectSink } from '../src/sources.mjs';

test('pump copies all chunks and reports written count', async () => {
  const sink = collectSink();
  const res = await pump(fromArray(['a', 'b', 'c']), sink);
  assert.deepEqual(res, { written: 3 });
  assert.deepEqual(sink.chunks, ['a', 'b', 'c']);
  assert.equal(sink.closed, 1);
  assert.equal(sink.aborted.length, 0);
});

test('pump with a live (non-aborted) signal behaves the same', async () => {
  const sink = collectSink();
  const res = await pump(fromArray([1, 2]), sink, { signal: new AbortController().signal });
  assert.deepEqual(res, { written: 2 });
  assert.equal(sink.closed, 1);
});
