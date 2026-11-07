// Rounding helpers for integer-cent money math.

/**
 * Round a cent amount half-up (2.5 -> 3, -2.5 -> -2), i.e. Math.round semantics.
 * Used by: invoice.mjs (line tax), statement.mjs (late fees - half-up is
 * written into the customer agreement, do not change for statements).
 */
export function roundCents(x) {
  return Math.round(x);
}
