const LANGUAGE_KEY = 'conference_language_v1';
const SUPPORTED_LANGUAGES = new Set(['de', 'en']);

export function readLanguagePreference() {
  try {
    const value = localStorage.getItem(LANGUAGE_KEY);
    return typeof value === 'string' && value.length <= 2 && SUPPORTED_LANGUAGES.has(value)
      ? value
      : null;
  } catch {
    return null;
  }
}

export function writeLanguagePreference(value) {
  if (!SUPPORTED_LANGUAGES.has(value)) return false;
  try {
    localStorage.setItem(LANGUAGE_KEY, value);
    return true;
  } catch {
    return false;
  }
}

export { LANGUAGE_KEY };
