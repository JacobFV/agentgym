import { stringify } from './csv.mjs';
import { resolveDialect } from './dialects.mjs';

const LOCALE_DIALECT = { de: 'excel-eu', fr: 'excel-eu' };

/**
 * rows: Array<{ date: string, description: string, amount: number }>
 * Default (en) output is consumed by customers' spreadsheets and our own re-import job.
 */
export function exportReport(rows, { locale = 'en' } = {}) {
  const dialect = LOCALE_DIALECT[locale] ?? 'excel';
  const { decimal } = resolveDialect({ dialect });
  const num = (n) => (decimal === '.' ? n : String(n).replace('.', decimal));
  const header = ['date', 'description', 'amount'];
  const body = rows.map((r) => [r.date, r.description, num(r.amount)]);
  return stringify([header, ...body], { dialect });
}
