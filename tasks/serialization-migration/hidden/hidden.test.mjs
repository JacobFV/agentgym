import test from 'node:test';
import assert from 'node:assert/strict';
import { serialize, deserialize } from '../src/serializer.mjs';
import { ProfileStore } from '../src/store.mjs';

test('hidden: v1 payloads still deserialize', () => {
  const p = deserialize(JSON.stringify({ v: 1, name: 'Bob', email: 'b@x.io', tags: 'a,b' }));
  assert.deepEqual(p, { name: 'Bob', email: 'b@x.io', tags: ['a', 'b'] });
});

test('hidden: legacy payload without v field is treated as v1', () => {
  const p = deserialize('{"name":"Old","email":"o@x.io","tags":"x"}');
  assert.deepEqual(p, { name: 'Old', email: 'o@x.io', tags: ['x'] });
});

test('hidden: v1 empty tags string means no tags', () => {
  const p = deserialize('{"v":1,"name":"N","email":"n@x.io","tags":""}');
  assert.deepEqual(p.tags, []);
});

test('hidden: v1 record re-serializes to v2 and round-trips', () => {
  const p = deserialize('{"name":"Old","email":"o@x.io","tags":"x,y"}');
  const wire = JSON.parse(serialize(p));
  assert.equal(wire.v, 2);
  assert.equal(wire.email, undefined);
  assert.deepEqual(wire.contact, { email: 'o@x.io' });
  assert.deepEqual(deserialize(serialize(p)), p);
});

test('hidden: v2 empty tags round-trips', () => {
  const p = { name: 'E', email: 'e@x.io', tags: [] };
  assert.deepEqual(deserialize(serialize(p)), p);
  assert.deepEqual(JSON.parse(serialize(p)).tags, []);
});

test('hidden: unknown fields preserved from v2 payload', () => {
  const text = JSON.stringify({ v: 2, name: 'F', contact: { email: 'f@x.io' }, tags: ['t'], avatarUrl: 'https://a/b.png', prefs: { dark: true } });
  const p = deserialize(text);
  assert.equal(p.avatarUrl, 'https://a/b.png');
  assert.deepEqual(p.prefs, { dark: true });
  assert.equal(p.email, 'f@x.io');
  const again = JSON.parse(serialize(p));
  assert.equal(again.avatarUrl, 'https://a/b.png');
  assert.deepEqual(again.prefs, { dark: true });
  assert.equal(again.v, 2);
});

test('hidden: unknown fields preserved from v1 payload', () => {
  const p = deserialize('{"v":1,"name":"G","email":"g@x.io","tags":"","legacyId":42}');
  assert.equal(p.legacyId, 42);
  assert.equal(JSON.parse(serialize(p)).legacyId, 42);
});

test('hidden: future versions are rejected', () => {
  assert.throws(() => deserialize('{"v":3,"name":"Z"}'), /unsupported version/);
});

test('hidden: store loads legacy records and writes v2 on update', () => {
  const backend = new Map([['u1', '{"name":"Legacy","email":"l@x.io","tags":"a","plan":"pro"}']]);
  const store = new ProfileStore(backend);
  assert.deepEqual(store.load('u1'), { plan: 'pro', name: 'Legacy', email: 'l@x.io', tags: ['a'] });
  store.update('u1', (p) => ({ ...p, tags: [...p.tags, 'b'] }));
  const raw = JSON.parse(backend.get('u1'));
  assert.equal(raw.v, 2);
  assert.equal(raw.plan, 'pro');
  assert.deepEqual(raw.tags, ['a', 'b']);
  assert.deepEqual(store.load('u1').tags, ['a', 'b']);
});
