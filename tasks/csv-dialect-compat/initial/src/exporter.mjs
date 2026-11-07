import { stringify } from './csv.mjs';

/**
 * rows: Array<{ date: string, description: string, amount: number }>
 * Default (en) output is consumed by customers' spreadsheets and our own re-import job.
 */
export function exportReport(rows, { locale = 'en' } = {}) {
  const header = ['date', 'description', 'amount'];
  const body = rows.map((r) => [r.date, r.description, r.amount]);
  return stringify([header, ...body], { dialect: 'excel' });
}
