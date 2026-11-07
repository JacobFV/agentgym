import { formatMoney } from './money.mjs';

/** Fixed-width ledger report (USD). Amount column is right-aligned to 14 chars. */
export function renderReport(entries) {
  const rows = entries.map((e) => `${e.label.padEnd(12)}${formatMoney(e.cents).padStart(14)}`);
  const net = entries.reduce((s, e) => s + e.cents, 0);
  rows.push(`${'NET'.padEnd(12)}${formatMoney(net).padStart(14)}`);
  return rows.join('\n');
}
