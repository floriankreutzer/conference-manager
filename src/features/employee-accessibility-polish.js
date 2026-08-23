import { language, t } from '../core/i18n.js';
import { KEYS, readJson } from '../core/storage.js';

const a11yText = (key, values = {}) => t(`employee.accessibility.${key}`, values);

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
  setText(profileButton, a11yText('profile'));
  setAttribute(profileButton, 'aria-label', a11yText('profileOpen'));

  setText(document.getElementById('welcomeHeading'), a11yText('genericWelcome'));

  const profileValues = [...document.querySelectorAll('.profile-content .details-list dd')];
  if (profileValues.length >= 2) {
    setText(profileValues[0], a11yText('profileMissing'));
    setText(profileValues[1], a11yText('profileMissing'));
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

  setText(internal.closest('.field')?.querySelector('.field-label'), a11yText('participantInternal'));
  setText(external.closest('.field')?.querySelector('.field-label'), a11yText('participantExternal'));

  const rule = total.querySelector('small');
  if (rule) {
    rule.id = 'uxParticipantRule';
    setText(rule, a11yText('participantRule'));
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
  [a11yText('allocationCostCenter'), a11yText('allocationPercent'), a11yText('allocationAmount')]
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
    ensureMobileAllocationLabel(row, costCenter, 'cost-center', a11yText('allocationCostCenter'));
    ensureMobileAllocationLabel(row, percent, 'percent', a11yText('allocationPercent'));
    ensureMobileAllocationLabel(row, amount, 'amount', a11yText('allocationAmount'));
    setAttribute(amount, 'aria-label', a11yText('allocationAmount'));
  });
}

function renameReviewServices() {
  const panel = document.querySelector('[data-step-panel="6"]');
  if (!panel) return;
  const serviceCard = [...panel.querySelectorAll('.review-card')].find((card) => {
    const heading = card.querySelector('h3')?.textContent?.trim();
    return heading === t('review.services') || heading === a11yText('additionalServices');
  });
  if (!serviceCard) return;

  setText(serviceCard.querySelector('h3'), a11yText('additionalServices'));
  setAttribute(serviceCard.querySelector('.ux-review-edit'), 'aria-label', a11yText('additionalServicesEdit'));
}

function renameReviewCatering() {
  const panel = document.querySelector('[data-step-panel="6"]');
  if (!panel) return;
  const cateringCard = [...panel.querySelectorAll('.review-card')].find((card) => {
    const heading = card.querySelector('h3')?.textContent?.trim();
    return heading === t('review.catering') || heading === a11yText('reviewCatering');
  });
  if (!cateringCard) return;

  setText(cateringCard.querySelector('h3'), a11yText('reviewCatering'));
  setAttribute(cateringCard.querySelector('.ux-review-edit'), 'aria-label', a11yText('reviewCateringEdit'));
}

function normalizeHelpTerminology() {
  if (language() !== 'de') return;
  document.querySelectorAll('.help-card p').forEach((node) => {
    const normalized = node.textContent
      .replaceAll('Services', a11yText('additionalServices'))
      .replaceAll('Catering', a11yText('cateringTerm'));
    setText(node, normalized);
  });
}

function normalizeEmployeeTerminology() {
  setText(document.getElementById('brandSubtitle'), a11yText('brandSubtitle'));

  if (document.body.dataset.uxFirstUse === 'true') {
    setText(document.querySelector('.welcome-hero > p:not(.eyebrow)'), a11yText('firstUseSubtitle'));
    setText(document.querySelector('.topbar p'), a11yText('firstUseSubtitle'));
  }

  setText(document.querySelector('.how-list li:nth-child(2) span'), a11yText('welcomeServicesStep'));

  const requestView = document.querySelector('.stepper');
  if (requestView) setText(document.querySelector('.topbar p'), a11yText('requestSubtitle'));

  const steps = [...document.querySelectorAll('.stepper .step')];
  if (steps[2]) {
    setText(steps[2], a11yText('stepLabel', { step: 3, label: a11yText('additionalServices') }));
    setAttribute(steps[2], 'aria-label', t('a11y.step', { step: 3, label: a11yText('additionalServices') }));
  }

  const servicesPanel = document.querySelector('[data-step-panel="3"]');
  setText(servicesPanel?.querySelector('.section-heading h2'), a11yText('additionalServicesOptional'));
  setText(servicesPanel?.querySelector('.section-heading p'), a11yText('servicesDescription'));
  setAttribute(servicesPanel?.querySelector('.selection-grid'), 'aria-label', a11yText('additionalServicesSelect'));

  const mobileProgress = document.querySelector('[data-ux-mobile-progress="true"]');
  if (mobileProgress && servicesPanel) {
    const progressText = t('a11y.step', { step: 3, label: a11yText('additionalServices') });
    setText(mobileProgress.querySelector('strong'), progressText);
    setAttribute(mobileProgress, 'aria-label', progressText);
  }

  setText(document.getElementById('specialRequirements')?.closest('.field')?.querySelector('.field-hint'), a11yText('specialRequirementsHint'));
  document.querySelectorAll('[data-step-panel="2"] .recommendation').forEach((node) => setText(node, a11yText('roomRecommendation')));

  const cateringPanel = document.querySelector('[data-step-panel="4"]');
  setText(document.getElementById('cateringParticipants')?.closest('.field')?.querySelector('.field-label'), a11yText('cateringPeople'));
  setAttribute(cateringPanel?.querySelector('.mode-selector'), 'aria-label', a11yText('cateringSelect'));

  setText(document.querySelector('[data-ux-cost-calculation] p'), a11yText('costGuidance'));
  setAttribute(document.querySelector('[data-ux-package-groups]'), 'aria-label', a11yText('packageGroupLabel'));

  const costPanel = document.querySelector('[data-step-panel="5"]');
  costPanel?.querySelectorAll('.cost-summary article span').forEach((label) => {
    if (label.textContent.trim() === t('cost.services') || label.textContent.trim() === a11yText('costServices')) {
      setText(label, a11yText('costServices'));
    }
  });

  const packageMode = document.querySelector('input[name="cateringMode"][value="PACKAGE"]')?.closest('label')?.querySelector('span');
  const packageExtrasMode = document.querySelector('input[name="cateringMode"][value="BOTH"]')?.closest('label')?.querySelector('span');
  setText(packageMode, a11yText('packageMode'));
  setText(packageExtrasMode, a11yText('packageExtrasMode'));

  renameReviewServices();
  renameReviewCatering();

  const reviewAfter = document.querySelector('[data-step-panel="6"] .info-box ol');
  setText(reviewAfter?.querySelector('li:nth-child(2)'), a11yText('reviewAfter2'));

  document.querySelectorAll('.details-grid .detail-card h3').forEach((heading) => {
    if (heading.textContent.trim() === t('review.services')) setText(heading, a11yText('additionalServices'));
  });

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
  setAttribute(document.documentElement, 'data-employee-accessibility-build', '2026.08.23.05');
}
