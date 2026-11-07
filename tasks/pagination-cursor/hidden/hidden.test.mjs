import test from 'node:test';
import assert from 'node:assert/strict';
import { ItemsDb } from '../src/db.mjs';
import { listItems } from '../src/api.mjs';
import { encodeCursor } from '../src/cursor.mjs';
import { ApiError } from '../src/errors.mjs';

function walk(db, pageSize, between = () => {}) {
  const ids = [];
  let cursor = '';
  for (let guard = 0; guard < 100; guard++) {
    const res = listItems(db, { cursor, pageSize: String(pageSize) });
    assert.deepEqual(Object.keys(res).sort(), ['items', 'nextCursor']);
    ids.push(...res.items.map((i) => i.id));
    if (res.nextCursor === null) return ids;
    cursor = res.nextCursor;
    between();
  }
  throw new Error('pagination did not terminate');
}

test('hidden: equal createdAt across page boundaries neither skips nor repeats', () => {
  const rows = [];
  for (let id = 1; id <= 9; id++) rows.push({ id, createdAt: id <= 7 ? 500 : 900, title: `t${id}` });
  const db = new ItemsDb(rows);
  assert.deepEqual(walk(db, 2), [9, 8, 7, 6, 5, 4, 3, 2, 1]);
  assert.deepEqual(walk(db, 4), [9, 8, 7, 6, 5, 4, 3, 2, 1]);
});

test('hidden: inserts at the top between requests do not shift pages', () => {
  const db = new ItemsDb([1, 2, 3, 4, 5, 6].map((id) => ({ id, createdAt: id * 10, title: '' })));
  let next = 100;
  const ids = walk(db, 2, () => { db.insert({ id: next, createdAt: next * 10, title: 'new' }); next++; });
  assert.deepEqual(ids, [6, 5, 4, 3, 2, 1]);
});

test('hidden: exactly-full last page yields nextCursor null', () => {
  const db = new ItemsDb([1, 2, 3, 4].map((id) => ({ id, createdAt: id, title: '' })));
  const p1 = listItems(db, { cursor: '', pageSize: '2' });
  const p2 = listItems(db, { cursor: p1.nextCursor, pageSize: '2' });
  assert.deepEqual(p2.items.map((i) => i.id), [2, 1]);
  assert.equal(p2.nextCursor, null);
});

test('hidden: empty table in cursor mode', () => {
  assert.deepEqual(listItems(new ItemsDb([]), { cursor: '' }), { items: [], nextCursor: null });
});

test('hidden: legacy offset responses unchanged', () => {
  const db = new ItemsDb([1, 2, 3, 4, 5].map((id) => ({ id, createdAt: id, title: `t${id}` })));
  assert.deepEqual(listItems(db, { page: '2', pageSize: '2' }), {
    items: [{ id: 3, createdAt: 3, title: 't3' }, { id: 2, createdAt: 2, title: 't2' }],
    page: 2, pageSize: 2, total: 5,
  });
  const dflt = listItems(db, {});
  assert.deepEqual(Object.keys(dflt), ['items', 'page', 'pageSize', 'total']);
  assert.equal(dflt.page, 1);
  assert.equal(dflt.pageSize, 20);
  assert.equal(dflt.items.length, 5);
});

const rejectsWith = (fn, status, message) => assert.throws(fn, (e) => {
  assert.ok(e instanceof ApiError, `expected ApiError, got ${e}`);
  assert.equal(e.status, status);
  assert.equal(e.message, message);
  return true;
});

test('hidden: malformed and tampered cursors are 400 invalid cursor', () => {
  const db = new ItemsDb([{ id: 1, createdAt: 1, title: '' }]);
  rejectsWith(() => listItems(db, { cursor: 'not a cursor!!' }), 400, 'invalid cursor');
  rejectsWith(() => listItems(db, { cursor: encodeCursor({ foo: 1 }) }), 400, 'invalid cursor');
  rejectsWith(() => listItems(db, { cursor: encodeCursor({ createdAt: 'x', id: 1 }) }), 400, 'invalid cursor');
  rejectsWith(() => listItems(db, { cursor: 'bnVsbA' }), 400, 'invalid cursor'); // base64url("null")
});

test('hidden: page and cursor together are rejected', () => {
  rejectsWith(() => listItems(new ItemsDb([]), { page: '1', cursor: '' }), 400, 'page and cursor are mutually exclusive');
});

test('hidden: pageSize validation shared by cursor mode', () => {
  const db = new ItemsDb([]);
  rejectsWith(() => listItems(db, { cursor: '', pageSize: '0' }), 400, 'pageSize must be an integer between 1 and 100');
  rejectsWith(() => listItems(db, { cursor: '', pageSize: '101' }), 400, 'pageSize must be an integer between 1 and 100');
  assert.equal(listItems(new ItemsDb([1, 2, 3].map((id) => ({ id, createdAt: id, title: '' }))), { cursor: '' }).items.length, 3);
});

test('hidden: query and rows are not mutated', () => {
  const rows = [1, 2, 3].map((id) => ({ id, createdAt: id, title: '' }));
  const db = new ItemsDb(rows);
  const q = { cursor: '', pageSize: '2' };
  const res = listItems(db, q);
  assert.deepEqual(q, { cursor: '', pageSize: '2' });
  res.items[0].title = 'changed';
  assert.equal(db.listAll()[0].title, '');
});
