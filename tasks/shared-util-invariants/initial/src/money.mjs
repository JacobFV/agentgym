// Shared money formatting. Amounts are integer cents.
const CURRENCIES = {
  USD: { symbol: '$', position: 'prefix', group: ',', decimal: '.' },
  GBP: { symbol: '£', position: 'prefix', group: ',', decimal: '.' },
  EUR: { symbol: '€', position: 'suffix', group: '.', decimal: ',' },
};

function groupDigits(intStr, sep) {
  return intStr.replace(/\B(?=(\d{3})+(?!\d))/g, sep);
}

/**
 * formatMoney(123456)        -> "$1,234.56"
 * formatMoney(-500, 'EUR')   -> "-5,00 €"
 */
export function formatMoney(cents, currency = 'USD') {
  const spec = CURRENCIES[currency];
  if (!spec) throw new RangeError(`unknown currency: ${currency}`);
  if (!Number.isInteger(cents)) throw new TypeError('cents must be an integer');
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const whole = groupDigits(String(Math.floor(abs / 100)), spec.group);
  const frac = String(abs % 100).padStart(2, '0');
  const number = `${whole}${spec.decimal}${frac}`;
  const body = spec.position === 'prefix' ? `${spec.symbol}${number}` : `${number} ${spec.symbol}`;
  return negative ? `-${body}` : body;
}
