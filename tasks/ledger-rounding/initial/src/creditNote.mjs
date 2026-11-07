import { buildInvoice } from './invoice.mjs';

/** A credit note reverses an invoice: same lines with negated quantities. */
export function buildCreditNote(invoice) {
  const lines = invoice.lines.map((l) => ({ sku: l.sku, qty: -l.qty, unitCents: l.unitCents }));
  return buildInvoice(lines, { taxBps: invoice.taxBps });
}
