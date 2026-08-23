import { t } from '../core/i18n.js';
import { KEYS, readJson } from '../core/storage.js';

const EMPLOYEE_PERSONALIZATION_BUILD = '2026.08.23.03';

let capturedIdentity = {
  firstName: '',
  profileButtonText: '',
  profileButtonAria: '',
  profileFirstName: '',
  profileLastName: '',
};

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

function validIdentityValue(value) {
  return /[\p{L}\p{N}]/u.test(String(value || '').trim());
}

function renderedFirstName() {
  const text = String(document.getElementById('welcomeHeading')?.textContent || '').trim();
  const match = text.match(/^(?:Willkommen|Welcome),\s*(.+?)[.!]?$/i);
  const candidate = String(match?.[1] || '').replace(/[.!]+$/u, '').trim();
  return validIdentityValue(candidate) ? candidate : '';
}

export function captureEmployeeIdentityPresentation() {
  const welcomeHeading = document.getElementById('welcomeHeading');
  const profileButton = document.querySelector('#primaryNavigation button[aria-haspopup="dialog"]');
  const profileValues = [...document.querySelectorAll('.profile-content .details-list dd')];
  const profileDialogOpen = profileValues.length >= 2;
  const identityContextVisible = Boolean(welcomeHeading) || profileDialogOpen;
  const firstName = storedFirstName() || renderedFirstName();

  capturedIdentity = {
    firstName: firstName || capturedIdentity.firstName,
    profileButtonText: identityContextVisible
      ? String(profileButton?.textContent || '').trim() || capturedIdentity.profileButtonText
      : capturedIdentity.profileButtonText,
    profileButtonAria: identityContextVisible
      ? String(profileButton?.getAttribute('aria-label') || '').trim() || capturedIdentity.profileButtonAria
      : capturedIdentity.profileButtonAria,
    profileFirstName: profileDialogOpen
      ? String(profileValues[0]?.textContent || '').trim() || capturedIdentity.profileFirstName
      : capturedIdentity.profileFirstName,
    profileLastName: profileDialogOpen
      ? String(profileValues[1]?.textContent || '').trim() || capturedIdentity.profileLastName
      : capturedIdentity.profileLastName,
  };
}

function enhanceWelcomeCopy() {
  const welcomeHeading = document.getElementById('welcomeHeading');
  if (welcomeHeading) setText(document.getElementById('viewTitle'), t('employee.personalization.welcomePageTitle'));
  setText(document.querySelector('#primaryNavigation button[data-view="employee"]'), t('employee.personalization.newRequestNav'));
}

function enhancePersonalizedHero() {
  const welcomeHeading = document.getElementById('welcomeHeading');
  const profileValues = [...document.querySelectorAll('.profile-content .details-list dd')];
  const profileDialogOpen = profileValues.length >= 2;
  if (!welcomeHeading && !profileDialogOpen) return;

  const hasCapturedIdentity = [capturedIdentity.firstName, capturedIdentity.profileFirstName, capturedIdentity.profileLastName]
    .some(validIdentityValue);

  if (welcomeHeading && validIdentityValue(capturedIdentity.firstName)) {
    setText(welcomeHeading, t('welcome.greeting', { name: capturedIdentity.firstName }));
  }

  if (!hasCapturedIdentity) return;

  const profileButton = document.querySelector('#primaryNavigation button[aria-haspopup="dialog"]');
  setText(profileButton, capturedIdentity.profileButtonText);
  setAttribute(profileButton, 'aria-label', capturedIdentity.profileButtonAria);

  if (profileDialogOpen) {
    setText(profileValues[0], capturedIdentity.profileFirstName);
    setText(profileValues[1], capturedIdentity.profileLastName);
  }
}

function enhanceRoomRefreshCopy() {
  const refresh = document.querySelector('[data-step-panel="2"] .section-heading button');
  setText(refresh, t('employee.personalization.roomRefresh'));
  setAttribute(refresh, 'aria-label', t('employee.personalization.roomRefreshAria'));
}

function enhanceAdditionalServicesCopy() {
  const panel = document.querySelector('[data-step-panel="3"]');
  if (!panel) return;

  let none = panel.querySelector('[data-employee-additional-services-none]');
  if (!none) {
    none = document.createElement('p');
    none.className = 'muted';
    none.dataset.employeeAdditionalServicesNone = 'true';
    panel.querySelector('.section-heading')?.after(none);
  }
  setText(none, t('employee.personalization.serviceNone'));
}

function enhanceCateringCopy() {
  const both = document.querySelector('input[name="cateringMode"][value="BOTH"]')?.closest('label')?.querySelector('span');
  setText(both, t('employee.personalization.packageExtras'));
}

export function enhanceEmployeeFirstUsePersonalization() {
  enhanceWelcomeCopy();
  enhancePersonalizedHero();
  enhanceRoomRefreshCopy();
  enhanceAdditionalServicesCopy();
  enhanceCateringCopy();
  document.documentElement.dataset.employeeFirstUsePersonalizationBuild = EMPLOYEE_PERSONALIZATION_BUILD;
}
