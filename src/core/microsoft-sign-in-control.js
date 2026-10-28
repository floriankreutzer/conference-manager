import { el } from './ui.js';

const SYMBOL = new URL('../../assets/brand/microsoft-sign-in/reference-2026-10-27/ms-symbollockup_mssymbol_19.svg', import.meta.url).href;

// Presentation only. Callers retain their own fixed destination, event handling,
// localization and independent Customer/Platform authentication contracts.
export function microsoftSignInControl({ label, href = null, attrs = {}, id } = {}) {
  if (typeof label !== 'string' || !label.trim() || label.length > 160
    || href !== null && typeof href !== 'string') throw new TypeError('MICROSOFT_SIGN_IN_CONTROL_INVALID');
  const control = el(href === null ? 'button' : 'a', {
    ...(href === null ? { type: 'button' } : { href }), id,
    className: 'microsoft-sign-in', attrs,
  }, [
    el('img', { attrs: { src: SYMBOL, alt: '', 'aria-hidden': 'true', width: '21', height: '21' } }),
    el('span', { text: label }),
  ]);
  return control;
}
