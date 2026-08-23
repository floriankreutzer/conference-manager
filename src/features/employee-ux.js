import { t } from '../core/i18n.js';
import { requestRepository } from '../core/storage.js';
import { uxText } from './employee-ux-i18n.js';

const REVIEW_STEP_KEYS = Object.freeze([
  ['review.schedule', 1],
  ['review.room', 2],
  ['review.services', 3],
  ['review.catering', 4],
  ['review.costs', 5],
  ['review.special', 1],
]);

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

function setViewMarkers() {
  const body = document.body;
  const welcome = document.querySelector('.welcome-hero');
  const request = document.querySelector('.stepper');
  const requests = document.querySelector('.request-list, .calendar-shell');
  body.dataset.uxView = welcome ? 'welcome' : request ? 'request' : requests ? 'requests' : 'other';
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

export function enhanceEmployeeUx() {
  setViewMarkers();
  enhanceFirstUse();
  enhanceStepper();
  enhanceScheduleOrder();
  enhanceRoomAvailability();
  enhanceCostGuidance();
  enhanceReview();
  document.documentElement.dataset.employeeUxBuild = '2026.08.23.01';
}
