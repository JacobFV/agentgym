import { roundCents } from './rounding.mjs';

const fmt = (c) => `${c < 0 ? '-' : ''}${Math.floor(Math.abs(c) / 100)}.${String(Math.abs(c) % 100).padStart(2, '0')}`;

/** Late fee on an overdue balance, half-up per the customer agreement. */
export function lateFee(balanceCents, feeBps) {
  return roundCents((balanceCents * feeBps) / 10000);
}

export function renderStatement({ customer, balanceCents, feeBps }) {
  const fee = lateFee(balanceCents, feeBps);
  return [
    `Statement for ${customer}`,
    `Overdue balance: ${fmt(balanceCents)}`,
    `Late fee (${feeBps / 100}%): ${fmt(fee)}`,
    `Amount due: ${fmt(balanceCents + fee)}`,
  ].join('\n');
}
