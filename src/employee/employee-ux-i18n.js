import { t } from '../core/i18n.js';

// Compatibility adapter for the existing employee UX module. All translations
// live in the central core i18n catalogue; this module intentionally contains
// no independent language selection or message table.
export function uxText(key, values = {}) {
  return t(key, values);
}
