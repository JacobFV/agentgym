import { parse } from './csv.mjs';

/** Bank statement CSV with a header row: date,description,amount */
export function importBankFile(text, { dialect = 'excel' } = {}) {
  const [header, ...rows] = parse(text);
  const idx = Object.fromEntries(header.map((h, i) => [h.trim(), i]));
  return rows.map((r) => ({
    date: r[idx.date],
    description: r[idx.description],
    amount: Number(r[idx.amount]),
  }));
}
