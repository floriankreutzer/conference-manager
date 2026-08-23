import { language, t, tFor } from '../core/i18n.js';

// Compatibility bridge for existing parity-era import paths. Text ownership and
// localization behavior are canonical in src/core/i18n.js; this module must not
// define messages, fallback rules, persistence, or interpolation behavior.
export function pt(key, values = {}) {
  return t(key, values);
}

export function ptFor(targetLanguage, key, values = {}) {
  return tFor(targetLanguage, key, values);
}

export function parityLocale() {
  return language() === 'en' ? 'en-GB' : 'de-DE';
}
