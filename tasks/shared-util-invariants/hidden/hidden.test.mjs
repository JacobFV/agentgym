import test from 'node:test';
import assert from 'node:assert/strict';
import { formatMoney } from '../src/money.mjs';
import { renderReceipt } from '../src/receipt.mjs';
import { renderReport } from '../src/report.mjs';

test('hidden: options form with parens works for every currency placement', () => {
  assert.equal(formatMoney(-123456, { currency: 'EUR', negativeStyle: 'parens' }), '(1.234,56 €)');
  assert.equal(formatMoney(-5, { currency: 'GBP', negativeStyle: 'parens' }), '(£0.05)');
  assert.equal(formatMoney(-100000000, { negativeStyle: 'parens' }), '($1,000,000.00)');
});

test('hidden: parens style leaves non-negative amounts alone', () => {
  assert.equal(formatMoney(500, { negativeStyle: 'parens' }), '$5.00');
  assert.equal(formatMoney(0, { negativeStyle: 'parens' }), '$0.00');
});

test('hidden: options form defaults', () => {
  assert.equal(formatMoney(-123456, {}), '-$1,234.56');
  assert.equal(formatMoney(-123456, { negativeStyle: 'minus' }), '-$1,234.56');
  assert.equal(formatMoney(99, { currency: 'EUR' }), '0,99 €');
});

test('hidden: positional currency form unchanged', () => {
  assert.equal(formatMoney(123456), '$1,234.56');
  assert.equal(formatMoney(-500, 'EUR'), '-5,00 €');
  assert.equal(formatMoney(123456789, 'GBP'), '£1,234,567.89');
  assert.equal(formatMoney(-7), '-$0.07');
  assert.equal(formatMoney(0, 'EUR'), '0,00 €');
});

test('hidden: unknown currency throws RangeError in both forms', () => {
  assert.throws(() => formatMoney(1, 'JPY'), RangeError);
  assert.throws(() => formatMoney(1, { currency: 'JPY' }), RangeError);
  assert.throws(() => formatMoney(1, { currency: 'JPY', negativeStyle: 'parens' }), RangeError);
});

test('hidden: non-integer cents still rejected', () => {
  assert.throws(() => formatMoney(1.5), TypeError);
  assert.throws(() => formatMoney(1.5, { negativeStyle: 'parens' }), TypeError);
});

test('hidden: receipt output is byte-identical', () => {
  const out = renderReceipt({
    currency: 'EUR',
    discountCents: 250,
    items: [{ name: 'Coffee', qty: 2, unitCents: 350 }, { name: 'Cake', qty: 1, unitCents: 120000 }],
  });
  assert.equal(out, 'Coffee x2  7,00 €\nCake x1  1.200,00 €\nDiscount  -2,50 €\nTotal  1.204,50 €');
});

test('hidden: report output is byte-identical', () => {
  const out = renderReport([
    { label: 'Sales', cents: 1234567 },
    { label: 'Refunds', cents: -45000 },
    { label: 'Fees', cents: -1999 },
  ]);
  assert.equal(out, [
    'Sales           $12,345.67',
    'Refunds           -$450.00',
    'Fees               -$19.99',
    'NET             $11,875.68',
  ].join('\n'));
});
