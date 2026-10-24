import { el, field } from '../core/ui.js';
import { language, setLanguage, t } from '../core/i18n.js';

// Presentation only. Both applications keep their existing authentication and
// business owners; this frame cannot resolve a session or grant a role.
export function mountAuthenticationPage({ content, surface, onLanguageChange = () => {},
  documentRef = globalThis.document, windowRef = globalThis.window } = {}) {
  if (!content || !['customer','platform'].includes(surface) || !documentRef?.body || typeof onLanguageChange !== 'function') {
    throw new TypeError('AUTHENTICATION_PAGE_CONFIGURATION_INVALID');
  }
  const shell = documentRef.querySelector('.app-shell');
  const skip = documentRef.getElementById('skipLink');
  const wasHidden = shell?.hidden ?? false;
  const previousTarget = skip?.getAttribute('href');
  const previousTitle = documentRef.title;
  let entryTitle = t(`authenticationPage.${surface}.documentTitle`);
  documentRef.title = entryTitle;
  if (shell) shell.hidden = true;
  if (skip) { skip.setAttribute('href', '#authenticationContent'); skip.textContent = t('a11y.skip'); }
  const frame = el('div', { className: 'authentication-entry', dataset: { authenticationSurface: surface,
    ...(surface === 'platform' ? { platformAdminRuntime: 'production' } : {}) } });
  const main = el('main', { id: 'authenticationContent', className: 'authentication-entry-login',
    attrs: { 'aria-labelledby': 'authenticationHeading', tabindex: '-1' } }, [
    el('img', { className: 'authentication-entry-brand', attrs: {
      src: '/assets/brand/pavurel-signet.svg', alt: '', width: '80', height: '80', decoding: 'async',
    } }),
    el('p', { className: 'authentication-entry-wordmark', text: t('authenticationPage.brand') }),
    el('h1', { id: 'authenticationHeading', text: t(`authenticationPage.${surface}.title`) }),
    el('p', { className: 'authentication-entry-intro', text: t(`authenticationPage.${surface}.text`) }),
    content,
  ]);
  frame.append(main, el('div', { className: 'authentication-entry-visual', attrs: { 'aria-hidden': 'true' } }, [
    el('img', { attrs: { src: '/assets/brand/pavurel-login-lounge.webp', alt: '',
      width: '900', height: '1350', decoding: 'async' } }),
  ]));
  if (surface === 'platform') {
    const select = el('select', { id: 'authenticationLanguage', className: 'authentication-entry-language' },
      ['de','en'].map(value => el('option', { value, text: t(`customerAuth.language.${value}`) })));
    select.value = language();
    select.addEventListener('change', () => { setLanguage(select.value); select.focus(); });
    main.insertBefore(field({ id: 'authenticationLanguage', label: t('customerAuth.language'), control: select }), content);
  }
  const changed = () => {
    entryTitle = t(`authenticationPage.${surface}.documentTitle`); documentRef.title = entryTitle;
    main.querySelector('#authenticationHeading').textContent = t(`authenticationPage.${surface}.title`);
    main.querySelector('.authentication-entry-intro').textContent = t(`authenticationPage.${surface}.text`);
    const label = main.querySelector('label[for="authenticationLanguage"] .field-label');
    if (label) label.textContent = t('customerAuth.language');
    if (skip) skip.textContent = t('a11y.skip');
    onLanguageChange();
  };
  windowRef?.addEventListener('conference-language-changed', changed);
  documentRef.body.append(frame);
  let disposed = false;
  return Object.freeze({ element: frame, dispose() {
    if (disposed) return; disposed = true;
    windowRef?.removeEventListener('conference-language-changed', changed);
    frame.remove(); if (shell) shell.hidden = wasHidden;
    if (documentRef.title === entryTitle) documentRef.title = previousTitle;
    if (skip) {
      if (previousTarget === null) skip.removeAttribute('href'); else skip.setAttribute('href', previousTarget);
    }
  } });
}
