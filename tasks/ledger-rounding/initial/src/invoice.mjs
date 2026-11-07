import { roundCents } from './rounding.mjs';

/**
 * @param {Array<{ sku: string, qty: number, unitCents: number }>} lines
 * @param {{ taxBps: number }} opts  tax rate in basis points (2000 = 20%)
 */
export function buildInvoice(lines, { taxBps }) {
  if (!Number.isInteger(taxBps) || taxBps < 0) throw new RangeError('taxBps must be a non-negative integer');
  const out = lines.map((l) => {
    const netCents = l.qty * l.unitCents;
    const taxCents = roundCents((netCents * taxBps) / 10000);
    return { sku: l.sku, qty: l.qty, unitCents: l.unitCents, netCents, taxCents };
  });
  const subtotalCents = out.reduce((s, l) => s + l.netCents, 0);
  const taxCents = out.reduce((s, l) => s + l.taxCents, 0);
  return { lines: out, subtotalCents, taxCents, totalCents: subtotalCents + taxCents, taxBps };
}
