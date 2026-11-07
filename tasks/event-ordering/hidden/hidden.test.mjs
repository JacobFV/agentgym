import test from 'node:test';
import assert from 'node:assert/strict';
import { EventProcessor } from '../src/processor.mjs';
import { createLedger } from '../src/ledger.mjs';

const ev = (id, seq, type = 'x', payload) => ({ id, seq, type, payload });

test('hidden: process returns events applied by this call', () => {
  const p = new EventProcessor(() => {});
  assert.deepEqual(p.process(ev('c', 3)).map((e) => e.id), []);
  assert.deepEqual(p.process(ev('b', 2)).map((e) => e.id), []);
  assert.equal(p.pendingCount, 2);
  assert.deepEqual(p.process(ev('a', 1)).map((e) => e.id), ['a', 'b', 'c']);
  assert.equal(p.pendingCount, 0);
});

test('hidden: duplicate delivery of an applied event is ignored', () => {
  const applied = [];
  const p = new EventProcessor((e) => applied.push(e.id));
  p.process(ev('a', 1));
  p.process(ev('b', 2));
  assert.deepEqual(p.process(ev('a', 1)), []);
  assert.deepEqual(p.process(ev('b', 2)), []);
  assert.deepEqual(applied, ['a', 'b']);
  assert.equal(p.lastSeq, 2);
});

test('hidden: duplicate delivery of a buffered event is ignored', () => {
  const applied = [];
  const p = new EventProcessor((e) => applied.push(e.id));
  p.process(ev('c', 3));
  p.process(ev('c', 3));
  assert.equal(p.pendingCount, 1);
  p.process(ev('a', 1));
  p.process(ev('b', 2));
  assert.deepEqual(applied, ['a', 'b', 'c']);
});

test('hidden: stale seq with a new id is ignored', () => {
  const applied = [];
  const p = new EventProcessor((e) => applied.push(e.id));
  p.process(ev('a', 1));
  p.process(ev('a-prime', 1));
  assert.deepEqual(applied, ['a']);
});

test('hidden: a gap blocks later events until it is filled', () => {
  const applied = [];
  const p = new EventProcessor((e) => applied.push(e.id));
  p.process(ev('a', 1));
  p.process(ev('c', 3));
  p.process(ev('d', 4));
  p.process(ev('f', 6));
  assert.deepEqual(applied, ['a']);
  assert.equal(p.lastSeq, 1);
  assert.equal(p.pendingCount, 3);
  assert.deepEqual(p.process(ev('b', 2)).map((e) => e.id), ['b', 'c', 'd']);
  assert.equal(p.lastSeq, 4);
  assert.equal(p.pendingCount, 1);
  p.process(ev('e', 5));
  assert.deepEqual(applied, ['a', 'b', 'c', 'd', 'e', 'f']);
  assert.equal(p.lastSeq, 6);
});

test('hidden: startSeq is honored', () => {
  const applied = [];
  const p = new EventProcessor((e) => applied.push(e.id), { startSeq: 10 });
  assert.equal(p.lastSeq, 9);
  p.process(ev('k', 11));
  assert.deepEqual(applied, []);
  p.process(ev('j', 10));
  assert.deepEqual(applied, ['j', 'k']);
  p.process(ev('old', 3));
  assert.deepEqual(applied, ['j', 'k']);
});

test('hidden: ledger balance is correct under reordering and redelivery', () => {
  const l = createLedger();
  const events = [
    ev('e1', 1, 'deposit', { amount: 100 }),
    ev('e2', 2, 'withdraw', { amount: 30 }),
    ev('e3', 3, 'reset', {}),
    ev('e4', 4, 'deposit', { amount: 5 }),
  ];
  // delivered: 4, 2, 2, 1, 3, 1, 4
  for (const i of [3, 1, 1, 0, 2, 0, 3]) l.receive(events[i]);
  assert.equal(l.balance, 5);
  assert.deepEqual(l.history, ['e1', 'e2', 'e3', 'e4']);
  assert.equal(l.lastSeq, 4);
  assert.equal(l.pendingCount, 0);
});

test('hidden: ledger does not apply withdraw before an earlier deposit arrives', () => {
  const l = createLedger({ openingBalance: 10 });
  l.receive(ev('w', 2, 'withdraw', { amount: 50 }));
  assert.equal(l.balance, 10);
  l.receive(ev('d', 1, 'deposit', { amount: 100 }));
  assert.equal(l.balance, 60);
});
