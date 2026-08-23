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
    requestSubtitle: 'Raum, Zusatzleistungen und Bewirtung in einer Anfrage.',
    welcomeServicesStep: 'Zusatzleistungen, Bewirtung und Einzeloptionen ergänzen.',
    additionalServices: 'Zusatzleistungen',
    additionalServicesOptional: 'Zusatzleistungen (optional)',
    additionalServicesEdit: 'Zusatzleistungen ändern',
    additionalServicesSelect: 'Zusatzleistungen auswählen',
    servicesDescription: 'Sie wählen nur die benötigte Leistung aus. Das Conference Management teilt anschließend die passende Person zu.',
    specialRequirementsHint: 'Nutzen Sie dieses Feld für Anforderungen, die nicht durch Raum, Zusatzleistungen oder Bewirtung abgedeckt werden.',
    participantInternal: 'Interne Teilnehmende',
    participantExternal: 'Externe Teilnehmende',
    participantRule: 'Bitte insgesamt mindestens eine Person angeben. Relevant für Raumkapazität und Bewirtung.',
    roomRecommendation: 'Empfohlen – passend für Ihre Teilnehmerzahl',
    cateringPeople: 'Bewirtung für wie viele Personen?',
    cateringSelect: 'Bewirtung auswählen',
    costServices: 'Zusatzleistungen',
    costGuidance: 'Die angezeigten Raumpreise und Preise für Zusatzleistungen werden einmal je Anfrage angesetzt. Bewirtung wird anhand Ihrer Paket-, Einzeloptionen- und Personenauswahl berechnet.',
    allocationCostCenter: 'Kostenstelle',
    allocationPercent: 'Anteil (%)',
    allocationAmount: 'Betrag',
    packageGroupLabel: 'Bewirtungspaket auswählen',
    packageMode: 'Bewirtungspaket',
    packageExtrasMode: 'Bewirtungspaket + Extras',
    reviewCatering: 'Bewirtungsdetails',
    reviewCateringEdit: 'Bewirtungsdetails ändern',
    reviewAfter2: 'Das Conference Management prüft Raum, Zusatzleistungen, Bewirtung und Kosten.',
    submissionServices: 'Zusatzleistungen',
  }),
  en: Object.freeze({
    brandSubtitle: 'Conference services',
    genericWelcome: 'Welcome',
    profile: 'Profile',
    profileOpen: 'Open profile',
    profileMissing: 'Not provided',
    firstUseSubtitle: 'Plan your event – room, additional services and catering in one request.',
    requestSubtitle: 'Room, additional services and catering in one request.',
    welcomeServicesStep: 'Add additional services, catering and individual items.',
    additionalServices: 'Additional services',
    additionalServicesOptional: 'Additional services (optional)',
    additionalServicesEdit: 'Edit additional services',
    additionalServicesSelect: 'Select additional services',
    servicesDescription: 'Select the service you need. Conference Management will then assign the appropriate person.',
    specialRequirementsHint: 'Use this field for requirements that are not covered by the room, additional services or catering.',
    participantInternal: 'Internal participants',
    participantExternal: 'External participants',
    participantRule: 'Enter at least one participant in total. This is used for room capacity and catering.',
    roomRecommendation: 'Recommended – suitable for your participant count',
    cateringPeople: 'Catering for how many people?',
    cateringSelect: 'Select catering',
    costServices: 'Additional services',
    costGuidance: 'The displayed room and additional-service prices are applied once per request. Catering is calculated from your package, item and participant selections.',
    allocationCostCenter: 'Cost center',
    allocationPercent: 'Share (%)',
    allocationAmount: 'Amount',
    packageGroupLabel: 'Select catering package',
    packageMode: 'Catering package',
    packageExtrasMode: 'Catering package + extras',
    reviewCatering: 'Catering details',
    reviewCateringEdit: 'Edit catering details',
    reviewAfter2: 'Conference Management reviews the room, additional services, catering and costs.',
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

function appendDescribedBy(control, id) {
  if (!control || !id) return;
  const ids = new Set(String(control.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
  ids.add(id);
  setAttribute(control, 'aria-describedby', [...ids].join(' '));
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

function participantTotalFromControls() {
  const internal = Number(document.getElementById('internalParticipants')?.value || 0);
  const external = Number(document.getElementById('externalParticipants')?.value || 0);
  return (Number.isFinite(internal) ? internal : 0) + (Number.isFinite(external) ? external : 0);
}

function updateParticipantTotal() {
  const total = document.querySelector('[data-step-panel="1"] .participant-total strong');
  if (!total) return;
  setText(total, String(participantTotalFromControls()));
}

function enhanceParticipantGuidance() {
  const internal = document.getElementById('internalParticipants');
  const external = document.getElementById('externalParticipants');
  const total = document.querySelector('[data-step-panel="1"] .participant-total');
  if (!internal || !external || !total) return;

  internal.required = false;
  internal.removeAttribute('required');
  external.required = false;
  external.removeAttribute('required');
  internal.placeholder = '0';
  external.placeholder = '0';

  setText(internal.closest('.field')?.querySelector('.field-label'), copy('participantInternal'));
  setText(external.closest('.field')?.querySelector('.field-label'), copy('participantExternal'));

  const rule = total.querySelector('small');
  if (rule) {
    rule.id = 'uxParticipantRule';
    setText(rule, copy('participantRule'));
    appendDescribedBy(internal, rule.id);
    appendDescribedBy(external, rule.id);
  }

  updateParticipantTotal();
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

function renameReviewCatering() {
  const panel = document.querySelector('[data-step-panel="6"]');
  if (!panel) return;
  const cateringCard = [...panel.querySelectorAll('.review-card')].find((card) => {
    const heading = card.querySelector('h3')?.textContent?.trim();
    return heading === t('review.catering') || heading === copy('reviewCatering');
  });
  if (!cateringCard) return;

  setText(cateringCard.querySelector('h3'), copy('reviewCatering'));
  setAttribute(cateringCard.querySelector('.ux-review-edit'), 'aria-label', copy('reviewCateringEdit'));
}

function normalizeHelpTerminology() {
  if (language() === 'en') return;
  document.querySelectorAll('.help-card p').forEach((node) => {
    const normalized = node.textContent
      .replaceAll('Services', copy('additionalServices'))
      .replaceAll('Catering', 'Bewirtung');
    setText(node, normalized);
  });
}

function normalizeEmployeeTerminology() {
  setText(document.getElementById('brandSubtitle'), copy('brandSubtitle'));

  if (document.body.dataset.uxFirstUse === 'true') {
    setText(document.querySelector('.welcome-hero > p:not(.eyebrow)'), copy('firstUseSubtitle'));
    setText(document.querySelector('.topbar p'), copy('firstUseSubtitle'));
  }

  setText(document.querySelector('.how-list li:nth-child(2) span'), copy('welcomeServicesStep'));

  const requestView = document.querySelector('.stepper');
  if (requestView) setText(document.querySelector('.topbar p'), copy('requestSubtitle'));

  const steps = [...document.querySelectorAll('.stepper .step')];
  if (steps[2]) {
    setText(steps[2], `3. ${copy('additionalServices')}`);
    setAttribute(steps[2], 'aria-label', t('a11y.step', { step: 3, label: copy('additionalServices') }));
  }

  const servicesPanel = document.querySelector('[data-step-panel="3"]');
  setText(servicesPanel?.querySelector('.section-heading h2'), copy('additionalServicesOptional'));
  setText(servicesPanel?.querySelector('.section-heading p'), copy('servicesDescription'));
  setAttribute(servicesPanel?.querySelector('.selection-grid'), 'aria-label', copy('additionalServicesSelect'));

  const mobileProgress = document.querySelector('[data-ux-mobile-progress="true"]');
  if (mobileProgress && servicesPanel) {
    const progressLabel = copy('additionalServices');
    const progressText = language() === 'en'
      ? `Step 3 of 6: ${progressLabel}`
      : `Schritt 3 von 6: ${progressLabel}`;
    setText(mobileProgress.querySelector('strong'), progressText);
    setAttribute(mobileProgress, 'aria-label', progressText);
  }

  setText(document.getElementById('specialRequirements')?.closest('.field')?.querySelector('.field-hint'), copy('specialRequirementsHint'));
  document.querySelectorAll('[data-step-panel="2"] .recommendation').forEach((node) => setText(node, copy('roomRecommendation')));

  const cateringPanel = document.querySelector('[data-step-panel="4"]');
  setText(document.getElementById('cateringParticipants')?.closest('.field')?.querySelector('.field-label'), copy('cateringPeople'));
  setAttribute(cateringPanel?.querySelector('.mode-selector'), 'aria-label', copy('cateringSelect'));

  setText(document.querySelector('[data-ux-cost-calculation] p'), copy('costGuidance'));
  setAttribute(document.querySelector('[data-ux-package-groups]'), 'aria-label', copy('packageGroupLabel'));

  const costPanel = document.querySelector('[data-step-panel="5"]');
  costPanel?.querySelectorAll('.cost-summary article span').forEach((label) => {
    if (label.textContent.trim() === t('cost.services') || label.textContent.trim() === copy('costServices')) {
      setText(label, copy('costServices'));
    }
  });

  const packageMode = document.querySelector('input[name="cateringMode"][value="PACKAGE"]')?.closest('label')?.querySelector('span');
  const packageExtrasMode = document.querySelector('input[name="cateringMode"][value="BOTH"]')?.closest('label')?.querySelector('span');
  setText(packageMode, copy('packageMode'));
  setText(packageExtrasMode, copy('packageExtrasMode'));

  renameReviewServices();
  renameReviewCatering();

  const reviewAfter = document.querySelector('[data-step-panel="6"] .info-box ol');
  setText(reviewAfter?.querySelector('li:nth-child(2)'), copy('reviewAfter2'));

  document.querySelectorAll('.details-grid .detail-card h3').forEach((heading) => {
    if (heading.textContent.trim() === t('review.services')) setText(heading, copy('additionalServices'));
  });

  const submission = document.querySelector('[data-ux-submission-success] p');
  if (submission && language() !== 'en') {
    const normalized = submission.textContent.replace('Services', copy('submissionServices'));
    setText(submission, normalized);
  }

  normalizeHelpTerminology();
}

document.addEventListener('input', (event) => {
  if (!event.target?.matches?.('#internalParticipants, #externalParticipants')) return;
  updateParticipantTotal();
}, true);

export function enhanceEmployeeAccessibilityPolish() {
  enhanceNeutralProfilePresentation();
  reorderScheduleDom();
  enhanceParticipantGuidance();
  enhanceCostAllocationLabels();
  normalizeEmployeeTerminology();
  setAttribute(document.documentElement, 'data-employee-accessibility-build', '2026.08.23.04');
}
