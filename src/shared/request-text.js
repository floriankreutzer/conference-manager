// Presentation-side counterpart of the API's Request composition text contract.
// Only requirements are multiline; titles and all other fields stay single-line.
const UNSAFE_TEXT = /[<>\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/;

export function requestTextResult(value, { maximum, nullable = false, multiline = false }) {
  if (nullable && value === null) return { value: null, error: null };
  if (typeof value !== 'string') return { value: null, error: 'characters' };
  const lines = multiline ? value.replace(/\r\n/g, '\n') : value;
  if (UNSAFE_TEXT.test(multiline ? lines.replace(/\n/g, '') : lines)) {
    return { value: null, error: 'characters' };
  }
  const normalized = lines.trim().normalize('NFC');
  if (normalized.length > maximum) return { value: null, error: 'length' };
  if (normalized.length === 0) {
    return { value: null, error: nullable ? null : 'required' };
  }
  return { value: normalized, error: null };
}
