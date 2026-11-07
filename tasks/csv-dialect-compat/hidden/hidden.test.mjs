import test from 'node:test';
import assert from 'node:assert/strict';
import { parse, stringify } from '../src/csv.mjs';
import { DIALECTS } from '../src/dialects.mjs';
import { exportReport } from '../src/exporter.mjs';
import { importBankFile } from '../src/importer.mjs';

const rows = [
  { date: '2024-01-02', description: 'Coffee, large', amount: 3.5 },
  { date: '2024-01-03', description: 'Rent; Jan', amount: -1200 },
  { date: '2024-01-04', description: 'Say "hi"', amount: 1234.56 },
];

test('hidden: en export is byte-identical to before', () => {
  const expected = 'date,description,amount\r\n2024-01-02,"Coffee, large",3.5\r\n2024-01-03,Rent; Jan,-1200\r\n2024-01-04,"Say ""hi""",1234.56\r\n';
  assert.equal(exportReport(rows), expected);
  assert.equal(exportReport(rows, { locale: 'en' }), expected);
});

test('hidden: de export uses excel-eu with decimal comma and minimal quoting', () => {
  assert.equal(
    exportReport(rows, { locale: 'de' }),
    'date;description;amount\r\n2024-01-02;Coffee, large;3,5\r\n2024-01-03;"Rent; Jan";-1200\r\n2024-01-04;"Say ""hi""";1234,56\r\n',
  );
  assert.equal(exportReport(rows, { locale: 'fr' }), exportReport(rows, { locale: 'de' }));
});

test('hidden: stringify quotes by the active delimiter', () => {
  assert.equal(stringify([['a;b', 'c,d', 'e']], { dialect: 'excel-eu' }), '"a;b";c,d;e\r\n');
  assert.equal(stringify([['a\tb', 'c,d']], { dialect: 'unix', delimiter: '\t' }), '"a\tb"\tc,d\n');
});

test('hidden: parse quoted fields with delimiter, doubled quotes and newlines in excel-eu', () => {
  assert.deepEqual(parse('"a;b";"say ""x""";"line1\r\nline2"\r\nc;;d', { dialect: 'excel-eu' }), [
    ['a;b', 'say "x"', 'line1\r\nline2'],
    ['c', '', 'd'],
  ]);
});

test('hidden: parse accepts LF endings in a CRLF dialect and ignores trailing newline', () => {
  assert.deepEqual(parse('x;y\n1;2\n', { dialect: 'excel-eu' }), [['x', 'y'], ['1', '2']]);
  assert.deepEqual(parse('x,y\r\n1,2\r\n'), [['x', 'y'], ['1', '2']]);
  assert.deepEqual(parse('x,y\n1,2'), [['x', 'y'], ['1', '2']]);
});

test('hidden: parse default is still comma, semicolons are data', () => {
  assert.deepEqual(parse('a;b,c\r\n'), [['a;b', 'c']]);
});

test('hidden: round trip in excel-eu', () => {
  const data = [['h1', 'h2'], ['a;b', '1,5'], ['q"q', 'multi\nline']];
  assert.deepEqual(parse(stringify(data, { dialect: 'excel-eu' }), { dialect: 'excel-eu' }), data);
});

test('hidden: unknown dialect message from both functions', () => {
  assert.throws(() => parse('a', { dialect: 'nope' }), { message: 'unknown CSV dialect: nope' });
  assert.throws(() => stringify([['a']], { dialect: 'nope' }), { message: 'unknown CSV dialect: nope' });
});

test('hidden: overrides do not modify shared dialects', () => {
  const before = structuredClone(DIALECTS);
  parse('a|b\n', { dialect: 'excel-eu', delimiter: '|' });
  parse('a|b\n', { dialect: 'excel', delimiter: '|' });
  stringify([['a']], { dialect: 'excel-eu', lineTerminator: '\n' });
  assert.deepEqual(DIALECTS, before);
  assert.deepEqual(DIALECTS['excel-eu'], { delimiter: ';', quote: '"', lineTerminator: '\r\n', decimal: ',' });
});

test('hidden: importer reads excel-eu bank files with decimal comma', () => {
  const text = 'date;description;amount\r\n2024-01-02;"Kaffee; groß";3,50\r\n2024-01-03;Miete;-1200\r\n';
  assert.deepEqual(importBankFile(text, { dialect: 'excel-eu' }), [
    { date: '2024-01-02', description: 'Kaffee; groß', amount: 3.5 },
    { date: '2024-01-03', description: 'Miete', amount: -1200 },
  ]);
});

test('hidden: importer default (excel) unchanged and round-trips en export', () => {
  assert.deepEqual(importBankFile(exportReport(rows)), rows);
});
