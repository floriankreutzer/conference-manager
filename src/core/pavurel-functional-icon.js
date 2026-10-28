import { el } from './ui.js';

export const PAVUREL_ICON_NAMES = Object.freeze(["add", "arrow-left", "arrow-right", "audit", "calendar", "catering", "changes", "check", "chevron-down", "chevron-right", "close", "coordination", "customers", "dashboard", "delivery", "diagnostics", "external-link", "filter", "info", "integrations", "lock", "menu", "participants", "recovery", "request", "room-equipment", "search", "settings", "sign-out", "system", "usage", "warning"]);
const variants = Object.freeze(['light','mono','inverse']);

// Decorative only: a localized visible control label owns the meaning. External
// SVG documents isolate their metadata IDs and retain canonical bytes.
export function pavurelFunctionalIcon(name, { variant = 'light' } = {}) {
  if (!PAVUREL_ICON_NAMES.includes(name) || !variants.includes(variant)) throw new TypeError('PAVUREL_ICON_INVALID');
  return el('img', { className: 'pavurel-functional-icon', attrs: {
    src: `/assets/brand/pavurel-icons/v0.1/${variant}/${name}.svg`, alt: '',
    width: '24', height: '24', 'aria-hidden': 'true', decoding: 'async', draggable: 'false',
  } });
}
