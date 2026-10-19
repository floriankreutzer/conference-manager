// Factual input uses an explicitly labelled UTC clock, including seconds, so
// daylight-saving gaps/duplicate local hours cannot silently change an attestation.
export function cateringManualOccurrence(value, now = Date.now()) {
  if (typeof value !== 'string' || !Number.isFinite(now)) throw new TypeError('CATERING_MANUAL_TIME_INVALID');
  const match = value.match(/^(\d{4}-\d{2}-\d{2}T\d{2}:\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/);
  if (!match) throw new TypeError('CATERING_MANUAL_TIME_INVALID');
  const canonical = `${match[1]}:${match[2] || '00'}.${(match[3] || '').padEnd(3, '0')}Z`;
  const date = new Date(canonical);
  if (!Number.isFinite(date.getTime()) || date.toISOString() !== canonical || date.getTime() > now) {
    throw new TypeError('CATERING_MANUAL_TIME_INVALID');
  }
  return canonical;
}
