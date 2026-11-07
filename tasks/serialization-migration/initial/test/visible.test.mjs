import test from 'node:test';
import assert from 'node:assert/strict';
import { serialize, deserialize } from '../src/serializer.mjs';

test('serialize writes v2 format and round-trips', () => {
  const profile = { name: 'Ada', email: 'ada@example.com', tags: ['admin', 'beta'] };
  const wire = JSON.parse(serialize(profile));
  assert.equal(wire.v, 2);
  assert.deepEqual(wire.contact, { email: 'ada@example.com' });
  assert.deepEqual(wire.tags, ['admin', 'beta']);
  assert.deepEqual(deserialize(serialize(profile)), profile);
});
