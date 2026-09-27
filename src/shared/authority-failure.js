const AUTHORITY_FAILURE_CODES = new Set(['HTTP_401', 'HTTP_403']);

export function authorityFailureCode(error) {
  const seen = new Set();
  let current = error;
  for (let depth = 0; depth < 8 && current && !seen.has(current); depth += 1) {
    if (AUTHORITY_FAILURE_CODES.has(current.code)) return current.code;
    seen.add(current);
    current = current.cause;
  }
  return null;
}
