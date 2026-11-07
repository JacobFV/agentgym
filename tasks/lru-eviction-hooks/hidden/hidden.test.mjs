import test from 'node:test';
import assert from 'node:assert/strict';
import { LRU } from '../src/lru.mjs';
import { SessionStore } from '../src/sessionStore.mjs';

function recorder(lruRef) {
  const events = [];
  const onEvict = (key, value, reason) => events.push({ key, value, reason, stillPresent: lruRef.lru?.has(key) });
  return { events, onEvict };
}

test('hidden: capacity eviction reports reason and LRU victim', () => {
  const ref = {};
  const { events, onEvict } = recorder(ref);
  const lru = (ref.lru = new LRU({ max: 2, onEvict }));
  lru.set('a', 1).set('b', 2);
  lru.get('a'); // b is now LRU
  lru.set('c', 3);
  assert.deepEqual(events, [{ key: 'b', value: 2, reason: 'capacity', stillPresent: false }]);
  assert.deepEqual(lru.keys(), ['a', 'c']);
});

test('hidden: overwriting a key does not fire the hook', () => {
  const ref = {};
  const { events, onEvict } = recorder(ref);
  const lru = (ref.lru = new LRU({ max: 2, onEvict }));
  lru.set('a', 1).set('a', 2).set('b', 1).set('b', 5);
  assert.deepEqual(events, []);
  assert.equal(lru.peek('a'), 2);
  assert.deepEqual(lru.keys(), ['a', 'b']);
});

test('hidden: delete fires once with reason delete; missing key fires nothing', () => {
  const ref = {};
  const { events, onEvict } = recorder(ref);
  const lru = (ref.lru = new LRU({ max: 5, onEvict }));
  lru.set('a', 1);
  assert.equal(lru.delete('a'), true);
  assert.equal(lru.delete('a'), false);
  assert.equal(lru.delete('zzz'), false);
  assert.deepEqual(events, [{ key: 'a', value: 1, reason: 'delete', stillPresent: false }]);
});

test('hidden: clear fires for each entry oldest first', () => {
  const ref = {};
  const { events, onEvict } = recorder(ref);
  const lru = (ref.lru = new LRU({ max: 5, onEvict }));
  lru.set('a', 1).set('b', 2).set('c', 3);
  lru.get('a');
  lru.clear();
  assert.deepEqual(events.map((e) => [e.key, e.reason, e.stillPresent]), [['b', 'clear', false], ['c', 'clear', false], ['a', 'clear', false]]);
  assert.equal(lru.size, 0);
});

test('hidden: LRU without hook behaves as before', () => {
  const lru = new LRU({ max: 2 });
  lru.set('a', 1).set('b', 2);
  assert.equal(lru.peek('a'), 1);
  lru.set('c', 3); // peek did not refresh a
  assert.deepEqual(lru.keys(), ['b', 'c']);
  lru.get('b');
  lru.get('nope');
  assert.deepEqual(lru.stats(), { size: 2, max: 2, hits: 1, misses: 1 });
});

test('hidden: destroy never persists the session', () => {
  const store = new SessionStore({ maxInMemory: 2 });
  store.create('a', { user: 'ann' });
  store.destroy('a');
  assert.equal(store.backing.has('a'), false);
  assert.equal(store.backing.writes, 0);
  assert.equal(store.get('a'), undefined);
});

test('hidden: destroy removes a previously evicted session from the backing store', () => {
  const store = new SessionStore({ maxInMemory: 1 });
  store.create('a', { user: 'ann' });
  store.create('b', { user: 'bob' }); // a -> backing
  assert.equal(store.backing.has('a'), true);
  store.destroy('a');
  assert.equal(store.backing.has('a'), false);
  assert.equal(store.get('a'), undefined);
});

test('hidden: rehydration moves the session back and evicts the next LRU one', () => {
  const store = new SessionStore({ maxInMemory: 2 });
  store.create('a', { n: 1 });
  store.create('b', { n: 2 });
  store.create('c', { n: 3 }); // a -> backing
  assert.deepEqual(store.get('a'), { id: 'a', data: { n: 1 } }); // b -> backing
  assert.equal(store.backing.has('a'), false);
  assert.equal(store.backing.has('b'), true);
  assert.deepEqual(store.lru.keys(), ['c', 'a']);
  assert.deepEqual(store.update('b', { n: 20 }), { id: 'b', data: { n: 20 } });
  assert.equal(store.get('b').data.n, 20);
});

test('hidden: updating an in-memory session does not write to the backing store', () => {
  const store = new SessionStore({ maxInMemory: 3 });
  store.create('a', { n: 1 });
  store.update('a', { n: 2 });
  store.update('a', { n: 3 });
  assert.equal(store.backing.writes, 0);
});
