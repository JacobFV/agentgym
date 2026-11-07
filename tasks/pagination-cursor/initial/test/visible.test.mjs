import test from 'node:test';
import assert from 'node:assert/strict';
import { ItemsDb } from '../src/db.mjs';
import { listItems } from '../src/api.mjs';

test('cursor pagination walks through all items', () => {
  const db = new ItemsDb([
    { id: 1, createdAt: 100, title: 'a' },
    { id: 2, createdAt: 200, title: 'b' },
    { id: 3, createdAt: 300, title: 'c' },
  ]);
  const p1 = listItems(db, { cursor: '', pageSize: '2' });
  assert.deepEqual(p1.items.map((i) => i.id), [3, 2]);
  assert.equal(typeof p1.nextCursor, 'string');
  const p2 = listItems(db, { cursor: p1.nextCursor, pageSize: '2' });
  assert.deepEqual(p2.items.map((i) => i.id), [1]);
  assert.equal(p2.nextCursor, null);
});
