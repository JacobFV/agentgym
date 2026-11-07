import test from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../src/csv.mjs';

test('parse understands the excel-eu dialect', () => {
  assert.deepEqual(parse('name;city\r\nAnna;Berlin\r\n', { dialect: 'excel-eu' }), [
    ['name', 'city'],
    ['Anna', 'Berlin'],
  ]);
});
