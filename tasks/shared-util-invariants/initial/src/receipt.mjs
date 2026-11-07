import { formatMoney } from './money.mjs';

/** Renders a plain-text customer receipt. */
export function renderReceipt({ items, currency = 'USD', discountCents = 0 }) {
  const lines = items.map((it) => `${it.name} x${it.qty}  ${formatMoney(it.unitCents * it.qty, currency)}`);
  const subtotal = items.reduce((s, it) => s + it.unitCents * it.qty, 0);
  if (discountCents) lines.push(`Discount  ${formatMoney(-discountCents, currency)}`);
  lines.push(`Total  ${formatMoney(subtotal - discountCents, currency)}`);
  return lines.join('\n');
}
