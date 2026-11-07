import test from 'node:test';
import assert from 'node:assert/strict';
import { SessionStore } from '../src/sessionStore.mjs';

test('sessions evicted for capacity are persisted and can be read back', () => {
  const store = new SessionStore({ maxInMemory: 2 });
  store.create('a', { user: 'ann' });
  store.create('b', { user: 'bob' });
  store.create('c', { user: 'cid' }); // pushes out 'a'
  assert.equal(store.lru.has('a'), false);
  assert.equal(store.backing.has('a'), true);
  assert.deepEqual(store.get('a'), { id: 'a', data: { user: 'ann' } });
});
