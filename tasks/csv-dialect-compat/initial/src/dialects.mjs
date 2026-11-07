// CSV dialect definitions shared by parse/stringify and the exporters.
export const DIALECTS = {
  excel: { delimiter: ',', quote: '"', lineTerminator: '\r\n', decimal: '.' },
  unix: { delimiter: ',', quote: '"', lineTerminator: '\n', decimal: '.' },
};

/**
 * resolveDialect({ dialect: 'excel', delimiter: '|' }) -> merged dialect object (a fresh copy).
 * `dialect` may be a name or a dialect object.
 */
export function resolveDialect(opts = {}) {
  const { dialect = 'excel', ...overrides } = opts;
  const base = typeof dialect === 'string' ? DIALECTS[dialect] : dialect;
  if (!base) throw new Error(`unknown CSV dialect: ${dialect}`);
  return { ...base, ...overrides };
}
