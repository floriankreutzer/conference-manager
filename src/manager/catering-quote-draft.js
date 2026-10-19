// Native number controls expose standardized decimal values. Keep all arithmetic
// in exact minor units; this is draft validation, never supplier-price authority.
export function cateringQuoteMinorUnits(value) {
  if (typeof value !== 'string' || !/^\d{1,14}(?:\.\d{1,2})?$/.test(value)) throw new TypeError('CATERING_QUOTE_AMOUNT_INVALID');
  const [major, fraction = ''] = value.split('.');
  const minor = BigInt(major) * 100n + BigInt(fraction.padEnd(2, '0'));
  if (minor >= BigInt(Number.MAX_SAFE_INTEGER)) throw new TypeError('CATERING_QUOTE_AMOUNT_INVALID');
  return Number(minor);
}

export function cateringQuoteExpiry(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    throw new TypeError('CATERING_QUOTE_EXPIRY_INVALID');
  }
  const date = new Date(value);
  const parts = [date.getFullYear(), date.getMonth() + 1, date.getDate(), date.getHours(), date.getMinutes()];
  const expected = value.split(/[-T:]/).map(Number);
  if (!Number.isFinite(date.getTime()) || parts.some((part, index) => part !== expected[index])) {
    throw new TypeError('CATERING_QUOTE_EXPIRY_INVALID');
  }
  return date.toISOString();
}

export function cateringMoneyText({ amountMinor, currency }, selectedLocale) {
  if (!Number.isSafeInteger(amountMinor) || amountMinor < 0 || amountMinor >= Number.MAX_SAFE_INTEGER
    || !['CHF','EUR','GBP','USD'].includes(currency)) throw new TypeError('CATERING_QUOTE_AMOUNT_INVALID');
  const amount = BigInt(amountMinor);
  const decimal = `${amount / 100n}.${String(amount % 100n).padStart(2, '0')}`;
  return new Intl.NumberFormat(selectedLocale, { style: 'currency', currency }).format(decimal);
}
