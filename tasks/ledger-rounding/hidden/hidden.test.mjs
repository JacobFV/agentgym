import test from 'node:test';
import assert from 'node:assert/strict';
import { buildInvoice } from '../src/invoice.mjs';
import { buildCreditNote } from '../src/creditNote.mjs';
import { lateFee, renderStatement } from '../src/statement.mjs';

test('hidden: half rounds to even, both directions', () => {
  const inv = buildInvoice([
    { sku: 'A', qty: 1, unitCents: 125 }, // 2.5 -> 2
    { sku: 'B', qty: 1, unitCents: 175 }, // 3.5 -> 4
    { sku: 'C', qty: 1, unitCents: 130 }, // 2.6 -> 3
    { sku: 'D', qty: 1, unitCents: 120 }, // 2.4 -> 2
  ], { taxBps: 200 });
  assert.deepEqual(inv.lines.map((l) => l.taxCents), [2, 4, 3, 2]);
  assert.equal(inv.taxCents, 11);
});

test('hidden: tax is per line, not on the subtotal', () => {
  // each line 2.5 -> 2, sum 4 (subtotal tax would be 5)
  const inv = buildInvoice([{ sku: 'A', qty: 1, unitCents: 125 }, { sku: 'B', qty: 1, unitCents: 125 }], { taxBps: 200 });
  assert.equal(inv.taxCents, 4);
  assert.equal(inv.totalCents, 254);
});

test('hidden: credit note tax is the exact negation of the invoice tax', () => {
  const inv = buildInvoice([
    { sku: 'A', qty: 1, unitCents: 125 },
    { sku: 'B', qty: 1, unitCents: 175 },
    { sku: 'C', qty: 3, unitCents: 999 },
  ], { taxBps: 200 });
  const cn = buildCreditNote(inv);
  assert.deepEqual(cn.lines.map((l) => l.taxCents), inv.lines.map((l) => -l.taxCents));
  assert.equal(cn.taxCents, -inv.taxCents);
  assert.equal(cn.totalCents, -inv.totalCents);
  assert.deepEqual(cn.lines.map((l) => l.taxCents).slice(0, 2), [-2, -4]);
});

test('hidden: large amounts and typical VAT rates', () => {
  const inv = buildInvoice([{ sku: 'X', qty: 7, unitCents: 1_234_567 }], { taxBps: 1950 });
  // 8641969 * 0.195 = 1685183.955 -> 1685184
  assert.equal(inv.lines[0].taxCents, 1_685_184);
});

test('hidden: input lines are not mutated', () => {
  const lines = [{ sku: 'A', qty: 2, unitCents: 125 }];
  const snapshot = structuredClone(lines);
  const inv = buildInvoice(lines, { taxBps: 200 });
  assert.deepEqual(lines, snapshot);
  assert.notEqual(inv.lines[0], lines[0]);
});

test('hidden: statement late fees stay half-up', () => {
  assert.equal(lateFee(125, 200), 3); // 2.5 -> 3 (half-up, contractual)
  assert.equal(lateFee(225, 200), 5); // 4.5 -> 5
  assert.equal(renderStatement({ customer: 'ACME', balanceCents: 125, feeBps: 200 }), [
    'Statement for ACME',
    'Overdue balance: 1.25',
    'Late fee (2%): 0.03',
    'Amount due: 1.28',
  ].join('\n'));
});
