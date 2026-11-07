// Rounding helpers for integer-cent money math.

/**
 * Round a cent amount half-up (2.5 -> 3, -2.5 -> -2), i.e. Math.round semantics.
 * Used by: statement.mjs (late fees - half-up is written into the customer
 * agreement, do not change for statements).
 */
export function roundCents(x) {
  return Math.round(x);
}

/**
 * Exact integer division num/den rounded half to even (banker's rounding).
 * Symmetric for negative numbers: divHalfEven(-5, 2) === -2.
 */
export function divHalfEven(num, den) {
  if (!Number.isInteger(num) || !Number.isInteger(den) || den === 0) throw new RangeError('integer operands required');
  const sign = (num < 0) !== (den < 0) ? -1 : 1;
  const n = Math.abs(num);
  const d = Math.abs(den);
  let q = Math.floor(n / d);
  const r = n - q * d;
  if (r * 2 > d || (r * 2 === d && q % 2 === 1)) q += 1;
  return sign * q || 0;
}
