import { parse } from './csv.mjs';
import { resolveDialect } from './dialects.mjs';

/** Bank statement CSV with a header row: date,description,amount */
export function importBankFile(text, { dialect = 'excel' } = {}) {
  const { decimal } = resolveDialect({ dialect });
  const [header, ...rows] = parse(text, { dialect });
  const idx = Object.fromEntries(header.map((h, i) => [h.trim(), i]));
  const amount = (s) => Number(decimal === '.' ? s : s.replace(decimal, '.'));
  return rows.map((r) => ({
    date: r[idx.date],
    description: r[idx.description],
    amount: amount(r[idx.amount]),
  }));
}
