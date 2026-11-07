import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInvoice } from '../src/invoice.mjs';

test('line tax exactly on a half rounds to even', () => {
  // 125 cents at 2% = 2.5 cents -> 2
  const inv = buildInvoice([{ sku: 'A', qty: 1, unitCents: 125 }], { taxBps: 200 });
  assert.equal(inv.lines[0].taxCents, 2);
  assert.equal(inv.taxCents, 2);
  assert.equal(inv.totalCents, 127);
});
