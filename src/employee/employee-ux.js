import { t } from '../core/i18n.js';
import { RUNTIME_MODE, runtimeModeFromDocument } from '../core/security-policy.js';
import { requestRepository } from '../core/storage.js';
import { catalogData, localized } from './parity-data.js';
import { uxText } from './employee-ux-i18n.js?v=20260823-02';

const REVIEW_STEP_KEYS = Object.freeze([
  ['review.schedule', 1],
  ['review.room', 2],
  ['review.services', 3],
  ['review.catering', 4],
  ['review.costs', 5],
  ['review.special', 1],
]);

let activeCateringPackageGroup = null;
let serviceSelection = new Map();
let submissionNotice = null;

function wizardButtons() {
  return [...document.querySelectorAll('.stepper .step')];
}

function currentWizardStep() {
  const buttons = wizardButtons();
  const currentIndex = buttons.findIndex((control) => control.getAttribute('aria-current') === 'step' || control.classList.contains('active'));
  return currentIndex >= 0 ? currentIndex + 1 : 0;
}

function blockInvalidFutureStep(event) {
  const control = event.target.closest?.('.stepper .step');
  if (!control) return;
  const buttons = wizardButtons();
  const targetStep = buttons.indexOf(control) + 1;
  const currentStep = currentWizardStep();
  if (targetStep > currentStep + 1) {
    event.preventDefault();
    event.stopImmediatePropagation();
  }
}

document.addEventListener('click', blockInvalidFutureStep, true);

document.addEventListener('click', (event) => {
  const submit = event.target.closest?.('[data-step-panel="6"] .wizard-actions button.primary');
  if (!submit) return;
  submissionNotice = {
    type: submit.textContent.trim() === t('review.resubmit') ? 'resubmitted' : 'submitted',
  };
});

function setViewMarkers() {
  const body = document.body;
  const welcome = document.querySelector('.welcome-hero');
  const request = document.querySelector('.stepper');
  const requests = document.querySelector('.request-list, .calendar-shell');
  body.dataset.uxView = welcome ? 'welcome' : request ? 'request' : requests ? 'requests' : 'other';
}

function enhanceRuntimePresentation() {
  const footer = document.getElementById('sidebarFooter');
  if (footer) footer.hidden = runtimeModeFromDocument() === RUNTIME_MODE.PRODUCTION;

  const subtitle = document.getElementById('brandSubtitle');
  if (subtitle) subtitle.textContent = uxText('brand.internalServices');
}

function enhanceFirstUse() {
  const app = document.getElementById('app');
  const hero = app?.querySelector('.welcome-hero');
  if (!app || !hero) {
    delete document.body.dataset.uxFirstUse;
    return;
  }

  const isFirstUse = requestRepository.all().length === 0;
  document.body.dataset.uxFirstUse = String(isFirstUse);
  if (!isFirstUse) return;

  const dashboard = app.querySelector('.dashboard-grid');
  if (dashboard) dashboard.hidden = true;

  [...app.querySelectorAll(':scope > .card')].forEach((card) => {
    const heading = card.querySelector('h3')?.textContent?.trim();
    if ([t('welcome.next'), t('welcome.notifications')].includes(heading)) card.hidden = true;
  });

  [...hero.querySelectorAll('button')].forEach((control) => {
    if (control.textContent.trim() === t('welcome.bookings')) control.hidden = true;
  });

  const firstUseCopy = uxText('welcome.firstUseSubtitle');
  const heroCopy = hero.querySelector(':scope > p:not(.eyebrow)');
  if (heroCopy) heroCopy.textContent = firstUseCopy;
  const topbarCopy = document.querySelector('.topbar p');
  if (topbarCopy) topbarCopy.textContent = firstUseCopy;
}

function createProgress(step, label) {
  const progress = document.createElement('section');
  progress.className = 'ux-mobile-progress';
  progress.dataset.uxMobileProgress = 'true';
  progress.setAttribute('role', 'group');
  progress.setAttribute('aria-label', uxText('progress.label', { step, label }));

  const text = document.createElement('strong');
  text.textContent = uxText('progress.label', { step, label });
  const dots = document.createElement('span');
  dots.className = 'ux-progress-dots';
  dots.setAttribute('aria-hidden', 'true');

  for (let index = 1; index <= 6; index += 1) {
    const dot = document.createElement('span');
    dot.className = `ux-progress-dot${index < step ? ' done' : index === step ? ' active' : ''}`;
    dots.appendChild(dot);
  }
  progress.append(text, dots);
  return progress;
}

function enhanceStepper() {
  const stepper = document.querySelector('.stepper');
  const buttons = wizardButtons();
  if (!stepper || buttons.length !== 6) return;

  const currentStep = currentWizardStep();
  buttons.forEach((control, index) => {
    const step = index + 1;
    const disabled = step > currentStep + 1;
    control.disabled = disabled;
    if (disabled) {
      control.setAttribute('aria-disabled', 'true');
      control.title = uxText('progress.future');
    } else {
      control.removeAttribute('aria-disabled');
      control.removeAttribute('title');
    }
  });

  const activeButton = buttons[currentStep - 1];
  const label = activeButton?.textContent?.replace(/^\s*\d+\.\s*/, '').trim() || '';
  const previous = document.querySelector('[data-ux-mobile-progress="true"]');
  const progress = createProgress(currentStep, label);
  if (previous) previous.replaceWith(progress);
  else stepper.before(progress);
}

function enhanceScheduleOrder() {
  const order = [
    ['title', 'ux-order-title'],
    ['location', 'ux-order-location'],
    ['date', 'ux-order-date'],
    ['start', 'ux-order-start'],
    ['end', 'ux-order-end'],
    ['internalParticipants', 'ux-order-internal'],
    ['externalParticipants', 'ux-order-external'],
  ];

  order.forEach(([id, className]) => document.getElementById(id)?.closest('.field')?.classList.add(className));
  document.querySelector('[data-step-panel="1"] .participant-total')?.classList.add('ux-order-total');
}

function enhanceRoomAvailability() {
  const panel = document.querySelector('[data-step-panel="2"]');
  const refresh = panel?.querySelector('.section-heading button');
  if (!refresh) return;
  refresh.textContent = uxText('room.refreshAgain');
  refresh.setAttribute('aria-label', uxText('room.refreshAgain'));
}

function markPriceBasis(selector) {
  document.querySelectorAll(selector).forEach((price) => {
    if (price.dataset.uxPriceBasis === 'request') return;
    price.textContent = `${price.textContent.trim()} · ${uxText('price.perRequest')}`;
    price.dataset.uxPriceBasis = 'request';
  });
}

function enhanceSelectionPriceBasis() {
  markPriceBasis('[data-step-panel="2"] .option-card .price');
  markPriceBasis('[data-step-panel="3"] .option-card .price');
}

function appendDescribedBy(control, id) {
  const ids = new Set(String(control.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean));
  ids.add(id);
  control.setAttribute('aria-describedby', [...ids].join(' '));
}

function enhanceCostGuidance() {
  const panel = document.querySelector('[data-step-panel="5"]');
  if (!panel) return;

  const summary = panel.querySelector('.cost-summary');
  if (summary && !panel.querySelector('[data-ux-cost-calculation]')) {
    const note = document.createElement('aside');
    note.className = 'ux-cost-guidance';
    note.dataset.uxCostCalculation = 'true';
    note.setAttribute('role', 'note');
    const title = document.createElement('strong');
    title.textContent = uxText('cost.guidanceTitle');
    const copy = document.createElement('p');
    copy.textContent = uxText('cost.guidance');
    note.append(title, copy);
    summary.after(note);
  }

  const genericHelp = [...panel.querySelectorAll('p.muted')]
    .find((node) => node.textContent.trim() === t('cost.help'));
  genericHelp?.classList.add('ux-superseded-help');

  const allocationHeader = panel.querySelector('.allocation-header');
  let centerHelp = panel.querySelector('[data-ux-cost-center-help]');
  if (allocationHeader && !centerHelp) {
    centerHelp = document.createElement('aside');
    centerHelp.id = 'uxCostCenterHelp';
    centerHelp.className = 'ux-cost-center-help';
    centerHelp.dataset.uxCostCenterHelp = 'true';
    centerHelp.setAttribute('role', 'note');
    const title = document.createElement('strong');
    title.textContent = uxText('cost.centerTitle');
    const copy = document.createElement('p');
    copy.textContent = uxText('cost.centerHelp');
    centerHelp.append(title, copy);
    allocationHeader.after(centerHelp);
  }

  panel.querySelectorAll('input[id^="allocation-cost-center-"]').forEach((control) => {
    control.placeholder = uxText('cost.centerPlaceholder');
    if (centerHelp?.id) appendDescribedBy(control, centerHelp.id);
  });
}

function cardForService(panel, service) {
  const expectedName = localized(service?.name);
  return [...(panel?.querySelectorAll('.option-card') || [])]
    .find((card) => card.querySelector('h3')?.textContent?.trim() === expectedName) || null;
}

function enhanceServiceSnapshot() {
  const panel = document.querySelector('[data-step-panel="3"]');
  if (!panel) return;

  const next = new Map();
  (catalogData().services || []).forEach((service) => {
    const card = cardForService(panel, service);
    const control = card?.querySelector('button[aria-pressed]');
    next.set(service.id, control?.getAttribute('aria-pressed') === 'true');
  });
  serviceSelection = next;
}

function packageMeta(card) {
  const heading = card.querySelector('h3');
  if (!heading) return null;
  if (card.dataset.uxPackageGroup) {
    return { group: card.dataset.uxPackageGroup, tier: card.dataset.uxPackageTier || '' };
  }
  const parts = heading.textContent.split(' · ').map((value) => value.trim()).filter(Boolean);
  if (parts.length < 2) return null;
  const tier = parts.pop();
  return { group: parts.join(' · '), tier };
}

function displayPackageGroup(group) {
  return group === 'Lunch' ? uxText('catering.packageLunch') : group;
}

function displayPackageTier(tier) {
  if (tier === 'Basic') return uxText('catering.tierBasic');
  if (tier === 'Standard') return uxText('catering.tierStandard');
  if (tier === 'Deluxe') return uxText('catering.tierDeluxe');
  return tier;
}

function applyPackageGroupState(panel) {
  panel.querySelectorAll('.package-grid .option-card[data-ux-package-group]').forEach((card) => {
    card.classList.toggle('ux-package-group-inactive', card.dataset.uxPackageGroup !== activeCateringPackageGroup);
  });
  panel.querySelectorAll('[data-ux-package-groups] button').forEach((control) => {
    control.setAttribute('aria-pressed', String(control.dataset.packageGroup === activeCateringPackageGroup));
  });
}

function enhanceCateringPackages() {
  const panel = document.querySelector('[data-step-panel="4"]');
  const grid = panel?.querySelector('.package-grid');
  if (!panel || !grid) return;

  const cards = [...grid.querySelectorAll('.option-card')];
  const groups = [];
  cards.forEach((card) => {
    const meta = packageMeta(card);
    if (!meta) return;
    card.dataset.uxPackageGroup = meta.group;
    card.dataset.uxPackageTier = meta.tier;
    if (!groups.includes(meta.group)) groups.push(meta.group);

    const heading = card.querySelector('h3');
    heading.textContent = `${displayPackageGroup(meta.group)} · ${displayPackageTier(meta.tier)}`;

    const select = card.querySelector('button[aria-pressed="false"]');
    if (select) {
      select.textContent = uxText('catering.selectPackage');
      select.setAttribute('aria-label', uxText('catering.selectPackageAria', { package: heading.textContent }));
    }
  });

  const selected = cards.find((card) => card.classList.contains('selected'));
  const selectedGroup = selected?.dataset.uxPackageGroup;
  if (selectedGroup) activeCateringPackageGroup = selectedGroup;
  if (!activeCateringPackageGroup || !groups.includes(activeCateringPackageGroup)) activeCateringPackageGroup = groups[0] || null;

  if (!panel.querySelector('[data-ux-package-groups]') && groups.length > 1) {
    const selector = document.createElement('div');
    selector.className = 'ux-package-groups';
    selector.dataset.uxPackageGroups = 'true';
    selector.setAttribute('role', 'group');
    selector.setAttribute('aria-label', uxText('catering.packageGroupLabel'));
    groups.forEach((group) => {
      const control = document.createElement('button');
      control.type = 'button';
      control.className = 'secondary';
      control.dataset.packageGroup = group;
      control.textContent = displayPackageGroup(group);
      control.setAttribute('aria-pressed', String(group === activeCateringPackageGroup));
      control.addEventListener('click', () => {
        activeCateringPackageGroup = group;
        applyPackageGroupState(panel);
      });
      selector.appendChild(control);
    });
    grid.before(selector);
  }

  applyPackageGroupState(panel);
}

function enhanceCateringServiceRecommendation() {
  const panel = document.querySelector('[data-step-panel="4"]');
  const mode = panel?.querySelector('input[name="cateringMode"]:checked')?.value;
  if (!panel || !mode || mode === 'NONE' || panel.querySelector('[data-ux-service-recommendation]')) return;

  const service = (catalogData().services || []).find((entry) => entry.id === 'service' && entry.active !== false);
  if (!service || serviceSelection.get(service.id) === true) return;

  const note = document.createElement('aside');
  note.className = 'ux-service-recommendation';
  note.dataset.uxServiceRecommendation = 'true';
  note.setAttribute('role', 'note');

  const copy = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = uxText('catering.serviceTitle');
  const text = document.createElement('p');
  text.textContent = uxText('catering.serviceCopy', { service: localized(service.name) });
  copy.append(title, text);

  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'secondary';
  add.textContent = uxText('catering.serviceAdd');
  add.addEventListener('click', () => {
    wizardButtons()[2]?.click();
    const servicePanel = document.querySelector('[data-step-panel="3"]');
    const serviceCard = cardForService(servicePanel, service);
    const select = serviceCard?.querySelector('button[aria-pressed]');
    if (select?.getAttribute('aria-pressed') !== 'true') select?.click();
    requestAnimationFrame(() => wizardButtons()[3]?.click());
  });

  note.append(copy, add);
  const countField = document.getElementById('cateringParticipants')?.closest('.field');
  (countField || panel.querySelector('.mode-selector'))?.after(note);
}

function localizeReviewCatering() {
  const panel = document.querySelector('[data-step-panel="6"]');
  if (!panel) return;
  const card = [...panel.querySelectorAll('.review-card')]
    .find((entry) => entry.querySelector('h3')?.textContent?.trim() === t('review.catering'));
  if (!card) return;
  card.querySelectorAll('p').forEach((copy) => {
    let value = copy.textContent;
    if (value.startsWith('Lunch ·')) value = `${uxText('catering.packageLunch')}${value.slice('Lunch'.length)}`;
    value = value.replace(/ · Basic$/, ` · ${uxText('catering.tierBasic')}`);
    value = value.replace(/ · Standard$/, ` · ${uxText('catering.tierStandard')}`);
    value = value.replace(/ · Deluxe$/, ` · ${uxText('catering.tierDeluxe')}`);
    copy.textContent = value;
  });
}

function reviewStepMap() {
  return new Map(REVIEW_STEP_KEYS.map(([key, step]) => [t(key), step]));
}

function enhanceReview() {
  const grid = document.querySelector('[data-step-panel="6"] .review-grid');
  if (!grid) return;
  const steps = reviewStepMap();

  grid.querySelectorAll('.review-card').forEach((card) => {
    if (card.querySelector('.ux-review-edit')) return;
    const heading = card.querySelector('h3');
    const section = heading?.textContent?.trim();
    const targetStep = steps.get(section);
    if (!heading || !targetStep) return;

    const edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'secondary ux-review-edit';
    edit.textContent = uxText('review.edit');
    edit.setAttribute('aria-label', uxText('review.editAria', { section }));
    edit.addEventListener('click', () => wizardButtons()[targetStep - 1]?.click());

    const header = document.createElement('header');
    header.className = 'ux-review-card-header';
    heading.replaceWith(header);
    header.append(heading, edit);
  });
}

function enhanceSubmissionSuccess() {
  const app = document.getElementById('app');
  const isRequestsView = document.body.dataset.uxView === 'requests';
  if (!isRequestsView) {
    submissionNotice = null;
    return;
  }
  if (!app || !submissionNotice || app.querySelector('[data-ux-submission-success]')) return;

  const notice = document.createElement('aside');
  notice.className = 'ux-submission-success';
  notice.dataset.uxSubmissionSuccess = 'true';
  notice.setAttribute('role', 'status');

  const copy = document.createElement('div');
  const title = document.createElement('strong');
  title.textContent = uxText(submissionNotice.type === 'resubmitted' ? 'submission.resubmittedTitle' : 'submission.sentTitle');
  const text = document.createElement('p');
  text.textContent = uxText(submissionNotice.type === 'resubmitted' ? 'submission.resubmittedText' : 'submission.sentText');
  copy.append(title, text);

  const close = document.createElement('button');
  close.type = 'button';
  close.className = 'secondary';
  close.textContent = t('common.close');
  close.addEventListener('click', () => {
    submissionNotice = null;
    notice.remove();
  });

  notice.append(copy, close);
  app.prepend(notice);
}

export function enhanceEmployeeUx() {
  setViewMarkers();
  enhanceRuntimePresentation();
  enhanceFirstUse();
  enhanceStepper();
  enhanceScheduleOrder();
  enhanceRoomAvailability();
  enhanceSelectionPriceBasis();
  enhanceServiceSnapshot();
  enhanceCateringPackages();
  enhanceCateringServiceRecommendation();
  enhanceCostGuidance();
  localizeReviewCatering();
  enhanceReview();
  enhanceSubmissionSuccess();
  document.documentElement.dataset.employeeUxBuild = '2026.08.23.02';
}
