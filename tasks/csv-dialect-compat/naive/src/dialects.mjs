export const DIALECTS = {
  excel: { delimiter: ',', quote: '"', lineTerminator: '\r\n', decimal: '.' },
  unix: { delimiter: ',', quote: '"', lineTerminator: '\n', decimal: '.' },
  'excel-eu': { delimiter: ';', quote: '"', lineTerminator: '\r\n', decimal: ',' },
};
export function resolveDialect(opts = {}) {
  const { dialect = 'excel', ...overrides } = opts;
  const base = typeof dialect === 'string' ? DIALECTS[dialect] : dialect;
  if (!base) throw new Error(`unknown CSV dialect: ${dialect}`);
  return Object.assign(base, overrides);
}
