import test from 'node:test';
import assert from 'node:assert/strict';
import { formatMoney } from '../src/money.mjs';

test('parens negative style', () => {
  assert.equal(formatMoney(-123456, { negativeStyle: 'parens' }), '($1,234.56)');
});
