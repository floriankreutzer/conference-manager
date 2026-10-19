// Decimal text only: nullable supplier evidence and required selling prices share
// exact minor-unit parsing, without currency conversion or pricing authority.
export function parseCateringMoneyInput(value,currency,{ nullable = false,aggregate = false } = {}) {
  if (typeof value !== 'string' || !['CHF','EUR','GBP','USD'].includes(currency)
    || typeof nullable !== 'boolean' || typeof aggregate !== 'boolean') throw new TypeError('CATERING_MONEY_INPUT_INVALID');
  const raw = value.trim();
  if (!raw && nullable) return null;
  if (!/^\d{1,14}(?:[.,]\d{1,2})?$/.test(raw)) throw new TypeError('CATERING_MONEY_INPUT_INVALID');
  const [whole,fraction = ''] = raw.replace(',','.').split('.');
  const minor = BigInt(whole)*100n+BigInt(fraction.padEnd(2,'0'));
  if (minor>(aggregate ? 9007199254740990n : 1000000000n)) throw new TypeError('CATERING_MONEY_INPUT_INVALID');
  return Object.freeze({ amountMinor: Number(minor),currency });
}
