import { language } from '../core/i18n.js';
import { KEYS, readJson } from '../core/storage.js';

const EMPLOYEE_PERSONALIZATION_BUILD = '2026.08.23.01';

const COPY = Object.freeze({
  de: Object.freeze({
    welcome: 'Willkommen',
    serviceNone: 'Keine Zusatzleistungen benötigt? Sie können diesen Schritt ohne Auswahl fortsetzen.',
    packageExtras: 'Bewirtungspaket + Einzeloptionen',
    roomRefresh: 'Aktualisieren',
  }),
  en: Object.freeze({
    welcome: 'Welcome',
    serviceNone: 'No additional services needed? You can continue without selecting anything.',
    packageExtras: 'Catering package + individual items',
    roomRefresh: 'Refresh',
  }),
});

let capturedIdentity = {
  firstName: '',
  profileButtonText: '',
  profileButtonAria: '',
  profileFirstName: '',
  profileLastName: '',
};

function copy(key) {
  const lang = language() === 'en' ? 'en' : 'de';
  return COPY[lang][key] || COPY.de[key] || key;
}

function setText(node, value) {
  if (node && value && node.textContent !== value) node.textContent = value;
}

function setAttribute(node, name, value) {
  if (node && value && node.getAttribute(name) !== String(value)) node.setAttribute(name, String(value));
}

function storedFirstName() {
  const profile = readJson(KEYS.profile, null);
  if (!profile || typeof profile !== 'object') return '';
  return String(profile.firstName || '').trim();
}

function renderedFirstName() {
  const text = String(document.getElementById('welcomeHeading')?.textContent || '').trim();
  const match = text.match(/^(?:Willkommen|Welcome),\s*(.+?)[.!]?$/i);
  return String(match?.[1] || '').trim();
}

export function captureEmployeeIdentityPresentation() {
  const firstName = storedFirstName() || renderedFirstName();
  const profileButton = document.querySelector('#primaryNavigation button[aria-haspopup="dialog"]');
  const profileValues = [...document.querySelectorAll('.profile-content .details-list dd')];

  capturedIdentity = {
    firstName: firstName || capturedIdentity.firstName,
    profileButtonText: String(profileButton?.textContent || '').trim() || capturedIdentity.profileButtonText,
    profileButtonAria: String(profileButton?.getAttribute('aria-label') || '').trim() || capturedIdentity.profileButtonAria,
    profileFirstName: String(profileValues[0]?.textContent || '').trim() || capturedIdentity.profileFirstName,
    profileLastName: String(profileValues[1]?.textContent || '').trim() || capturedIdentity.profileLastName,
  };
}

function enhancePersonalizedHero() {
  if (!capturedIdentity.firstName) return;
  setText(document.getElementById('welcomeHeading'), `${copy('welcome')}, ${capturedIdentity.firstName}.`);

  const profileButton = document.querySelector('#primaryNavigation button[aria-haspopup="dialog"]');
  setText(profileButton, capturedIdentity.profileButtonText);
  setAttribute(profileButton, 'aria-label', capturedIdentity.profileButtonAria);

  const profileValues = [...document.querySelectorAll('.profile-content .details-list dd')];
  setText(profileValues[0], capturedIdentity.profileFirstName);
  setText(profileValues[1], capturedIdentity.profileLastName);
}

function enhanceRoomRefreshCopy() {
  const refresh = document.querySelector('[data-step-panel="2"] .section-heading button');
  setText(refresh, copy('roomRefresh'));
  setAttribute(refresh, 'aria-label', copy('roomRefresh'));
}

function enhanceAdditionalServicesCopy() {
  const panel = document.querySelector('[data-step-panel="3"]');
  const none = panel?.querySelector(':scope > p.muted');
  setText(none, copy('serviceNone'));
}

function enhanceCateringCopy() {
  const both = document.querySelector('input[name="cateringMode"][value="BOTH"]')?.closest('label')?.querySelector('span');
  setText(both, copy('packageExtras'));
}

export function enhanceEmployeeFirstUsePersonalization() {
  enhancePersonalizedHero();
  enhanceRoomRefreshCopy();
  enhanceAdditionalServicesCopy();
  enhanceCateringCopy();
  document.documentElement.dataset.employeeFirstUsePersonalizationBuild = EMPLOYEE_PERSONALIZATION_BUILD;
}
