import test from 'node:test';
import assert from 'node:assert/strict';
import { EventProcessor } from '../src/processor.mjs';

test('out-of-order events are applied in seq order', () => {
  const applied = [];
  const p = new EventProcessor((e) => applied.push(e.id));
  p.process({ id: 'b', seq: 2, type: 'x' });
  p.process({ id: 'a', seq: 1, type: 'x' });
  p.process({ id: 'c', seq: 3, type: 'x' });
  assert.deepEqual(applied, ['a', 'b', 'c']);
  assert.equal(p.lastSeq, 3);
});
