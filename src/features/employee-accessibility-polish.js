import { language, t } from '../core/i18n.js';
import { KEYS, readJson } from '../core/storage.js';

const COPY = Object.freeze({
  de: Object.freeze({
    brandSubtitle: 'Konferenzservice',
    genericWelcome: 'Willkommen',
    profile: 'Profil',
    profileOpen: 'Profil öffnen',
    profileMissing: 'Nicht hinterlegt',
    firstUseSubtitle: 'Planen Sie Ihre Veranstaltung – Raum, Zusatzleistungen und Bewirtung in einer Anfrage.',
    additionalServices: 'Zusatzleistungen',
    additionalServicesOptional: 'Zusatzleistungen (optional)',
    additionalServicesEdit: 'Zusatzleistungen ändern',
    costGuidance: 'Die angezeigten Raumpreise und Preise für Zusatzleistungen werden einmal je Anfrage angesetzt. Bewirtung wird anhand Ihrer Paket-, Einzeloptionen- und Personenauswahl berechnet.',
    allocationCostCenter: 'Kostenstelle',
    allocationPercent: 'Anteil (%)',
    allocationAmount: 'Betrag',
    packageGroupLabel: 'Bewirtungspaket auswählen',
    packageMode: 'Bewirtungspaket',
    packageExtrasMode: 'Bewirtungspaket + Extras',
    submissionServices: 'Zusatzleistungen',
  }),
  en: Object.freeze({
    brandSubtitle: 'Conference services',
    genericWelcome: 'Welcome',
    profile: 'Profile',
    profileOpen: 'Open profile',
    profileMissing: 'Not provided',
    firstUseSubtitle: 'Plan your event – room, additional services and catering in one request.',
    additionalServices: 'Additional services',
    additionalServicesOptional: 'Additional services (optional)',
    additionalServicesEdit: 'Edit additional services',
    costGuidance: 'The displayed room and additional-service prices are applied once per request. Catering is calculated from your package, item and participant selections.',
    allocationCostCenter: 'Cost center',
    allocationPercent: 'Share (%)',
    allocationAmount: 'Amount',
    packageGroupLabel: 'Select catering package',
    packageMode: 'Catering package',
    packageExtrasMode: 'Catering package + extras',
    submissionServices: 'additional services',
  }),
});

function copy(key) {
  const lang = language() === 'en' ? 'en' : 'de';
  return COPY[lang][key] || COPY.de[key] || key;
}

function setText(node, value) {
  if (node && node.textContent !== value) node.textContent = value;
}

function setAttribute(node, name, value) {
  if (node && node.getAttribute(name) !== String(value)) node.setAttribute(name, String(value));
}

function storedProfile() {
  const profile = readJson(KEYS.profile, null);
  if (!profile || typeof profile !== 'object') return null;
  const firstName = String(profile.firstName || '').trim();
  const lastName = String(profile.lastName || '').trim();
  return firstName || lastName ? profile : null;
}

function enhanceNeutralProfilePresentation() {
  if (storedProfile()) return;

  const profileButton = document.querySelector('#primaryNavigation button[aria-haspopup="dialog"]');
  setText(profileButton, copy('profile'));
  setAttribute(profileButton, 'aria-label', copy('profileOpen'));

  setText(document.getElementById('welcomeHeading'), copy('genericWelcome'));

  const profileValues = [...document.querySelectorAll('.profile-content .details-list dd')];
  if (profileValues.length >= 2) {
    setText(profileValues[0], copy('profileMissing'));
    setText(profileValues[1], copy('profileMissing'));
  }
}

function reorderScheduleDom() {
  const grid = document.querySelector('[data-step-panel="1"] .form-grid.two');
  if (!grid) return;

  const fieldFor = (id) => document.getElementById(id)?.closest('.field') || null;
  const ordered = [
    fieldFor('title'),
    fieldFor('location'),
    fieldFor('date'),
    fieldFor('start'),
    fieldFor('end'),
    fieldFor('internalParticipants'),
    fieldFor('externalParticipants'),
    grid.querySelector('.participant-total'),
  ].filter(Boolean);

  const expectedOrder = ordered.map((node) => node.querySelector?.('input,select,textarea')?.id || (node.classList.contains('participant-total') ? 'participantTotal' : ''));
  const currentOrder = [...grid.children].map((node) => node.querySelector?.('input,select,textarea')?.id || (node.classList.contains('participant-total') ? 'participantTotal' : ''));
  if (currentOrder.length === expectedOrder.length && currentOrder.every((value, index) => value === expectedOrder[index])) {
    setAttribute(grid, 'data-ux-dom-order', 'what-where-when-who');
    return;
  }

  const focused = grid.contains(document.activeElement) ? document.activeElement : null;
  ordered.forEach((node) => grid.appendChild(node));
  setAttribute(grid, 'data-ux-dom-order', 'what-where-when-who');
  if (focused?.isConnected && typeof focused.focus === 'function') focused.focus({ preventScroll: true });
}

function ensureAllocationHeader(allocations) {
  if (!allocations || allocations.previousElementSibling?.matches('[data-ux-allocation-labels]')) return;
  const labels = document.createElement('div');
  labels.className = 'ux-allocation-labels';
  labels.dataset.uxAllocationLabels = 'true';
  [copy('allocationCostCenter'), copy('allocationPercent'), copy('allocationAmount')]
    .forEach((text) => {
      const label = document.createElement('span');
      label.textContent = text;
      labels.appendChild(label);
    });
  allocations.before(labels);
}

function ensureMobileAllocationLabel(row, control, key, text) {
  if (!row || !control || row.querySelector(`[data-ux-mobile-allocation-label="${key}"]`)) return;
  const label = document.createElement('span');
  label.className = 'ux-mobile-allocation-label';
  label.dataset.uxMobileAllocationLabel = key;
  label.textContent = text;
  control.before(label);
}

function enhanceCostAllocationLabels() {
  const panel = document.querySelector('[data-step-panel="5"]');
  const allocations = panel?.querySelector('#allocations');
  if (!panel || !allocations) return;

  ensureAllocationHeader(allocations);
  allocations.querySelectorAll('.allocation-row').forEach((row) => {
    const costCenter = row.querySelector('input[id^="allocation-cost-center-"]');
    const percent = row.querySelector('input[id^="allocation-percent-"]');
    const amount = row.querySelector('output');

    ensureMobileAllocationLabel(row, costCenter, 'cost-center', copy('allocationCostCenter'));
    ensureMobileAllocationLabel(row, percent, 'percent', copy('allocationPercent'));
    ensureMobileAllocationLabel(row, amount, 'amount', copy('allocationAmount'));
    setAttribute(amount, 'aria-label', copy('allocationAmount'));
  });
}

function renameReviewServices() {
  const panel = document.querySelector('[data-step-panel="6"]');
  if (!panel) return;
  const serviceCard = [...panel.querySelectorAll('.review-card')].find((card) => {
    const heading = card.querySelector('h3')?.textContent?.trim();
    return heading === t('review.services') || heading === copy('additionalServices');
  });
  if (!serviceCard) return;

  setText(serviceCard.querySelector('h3'), copy('additionalServices'));
  setAttribute(serviceCard.querySelector('.ux-review-edit'), 'aria-label', copy('additionalServicesEdit'));
}

function normalizeEmployeeTerminology() {
  setText(document.getElementById('brandSubtitle'), copy('brandSubtitle'));

  if (document.body.dataset.uxFirstUse === 'true') {
    setText(document.querySelector('.welcome-hero > p:not(.eyebrow)'), copy('firstUseSubtitle'));
    setText(document.querySelector('.topbar p'), copy('firstUseSubtitle'));
  }

  const steps = [...document.querySelectorAll('.stepper .step')];
  if (steps[2]) {
    setText(steps[2], `3. ${copy('additionalServices')}`);
    setAttribute(steps[2], 'aria-label', t('a11y.step', { step: 3, label: copy('additionalServices') }));
  }

  const servicesPanel = document.querySelector('[data-step-panel="3"]');
  setText(servicesPanel?.querySelector('.section-heading h2'), copy('additionalServicesOptional'));

  const mobileProgress = document.querySelector('[data-ux-mobile-progress="true"]');
  if (mobileProgress && document.querySelector('[data-step-panel="3"]')) {
    const progressLabel = copy('additionalServices');
    const progressText = language() === 'en'
      ? `Step 3 of 6: ${progressLabel}`
      : `Schritt 3 von 6: ${progressLabel}`;
    setText(mobileProgress.querySelector('strong'), progressText);
    setAttribute(mobileProgress, 'aria-label', progressText);
  }

  setText(document.querySelector('[data-ux-cost-calculation] p'), copy('costGuidance'));
  setAttribute(document.querySelector('[data-ux-package-groups]'), 'aria-label', copy('packageGroupLabel'));

  const packageMode = document.querySelector('input[name="cateringMode"][value="PACKAGE"]')?.closest('label')?.querySelector('span');
  const packageExtrasMode = document.querySelector('input[name="cateringMode"][value="BOTH"]')?.closest('label')?.querySelector('span');
  setText(packageMode, copy('packageMode'));
  setText(packageExtrasMode, copy('packageExtrasMode'));

  renameReviewServices();

  document.querySelectorAll('.details-grid .detail-card h3').forEach((heading) => {
    if (heading.textContent.trim() === t('review.services')) setText(heading, copy('additionalServices'));
  });

  const submission = document.querySelector('[data-ux-submission-success] p');
  if (submission && language() !== 'en') {
    const normalized = submission.textContent.replace('Services', copy('submissionServices'));
    setText(submission, normalized);
  }
}

export function enhanceEmployeeAccessibilityPolish() {
  enhanceNeutralProfilePresentation();
  reorderScheduleDom();
  enhanceCostAllocationLabels();
  normalizeEmployeeTerminology();
  setAttribute(document.documentElement, 'data-employee-accessibility-build', '2026.08.23.03');
}
