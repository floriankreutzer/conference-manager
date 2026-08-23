import { formatDate, formatMoney, t } from '../core/i18n.js';
import { KEYS, readJson, readString, writeString } from '../core/storage.js';
import { button, el, openDialog } from '../core/ui.js';
import { catalogData, localized, requestData } from './parity-data.js';
import { requestIdFromCard } from './employee-visuals.js';
import { currentManagerTab } from './manager-tabs.js';

const INTRO_KEY = 'conference_manager_intro_dismissed_v1';
const MANAGER_ACTION_IDS = Object.freeze(['confirm', 'change', 'reject']);
const state = {
  landingHandled: false,
  priorityHandled: false,
  advancedFiltersOpen: false,
};

const totalParticipants = (request) => Number(request.participants ?? (Number(request.internalParticipants || 0) + Number(request.externalParticipants || 0)));

function applyManagerLanding() {
  if (state.landingHandled || readString(KEYS.role, 'employee') !== 'manager') return false;
  const managerNav = document.querySelector('#primaryNavigation button[data-view="manager"]');
  if (!(managerNav instanceof HTMLButtonElement)) return false;
  state.landingHandled = true;
  if (document.querySelector('.manager-tabs')) return false;
  const welcomeNav = document.querySelector('#primaryNavigation button[data-view="welcome"].active');
  if (!welcomeNav) return false;
  managerNav.click();
  return true;
}

function updateManagerHeading(tab) {
  const title = document.getElementById('viewTitle');
  const subtitle = document.getElementById('viewSubtitle');
  if (!title || !subtitle || !tab) return;
  title.textContent = t('manager.experience.title');
  const subtitleKeys = {
    BOOKINGS: 'manager.experience.subtitle.bookings',
    ROOM_PLAN: 'manager.experience.subtitle.roomPlan',
    REPORTS: 'manager.experience.subtitle.reports',
    ADMIN: 'manager.experience.subtitle.admin',
  };
  subtitle.textContent = t(subtitleKeys[tab]);
}

function addFirstUseGuide(section) {
  if (readString(INTRO_KEY, '') === 'true' || section.querySelector('[data-manager-first-use]')) return;
  const guide = el('aside', {
    className: 'manager-first-use-banner',
    dataset: { managerFirstUse: 'true' },
    attrs: { role: 'note' },
  });
  const content = el('div', { className: 'manager-first-use-content' }, [
    el('strong', { text: t('manager.experience.firstUse.title') }),
    el('p', { text: t('manager.experience.firstUse.description') }),
  ]);
  content.appendChild(el('div', { className: 'manager-first-use-steps' }, [
    el('span', { text: t('manager.experience.firstUse.step1') }),
    el('span', { text: t('manager.experience.firstUse.step2') }),
    el('span', { text: t('manager.experience.firstUse.step3') }),
  ]));
  const dismiss = button(t('manager.experience.firstUse.dismiss'));
  dismiss.addEventListener('click', () => {
    writeString(INTRO_KEY, 'true');
    guide.remove();
  });
  guide.append(content, dismiss);
  section.prepend(guide);
}

function wrapAdvancedFilters(section) {
  const filters = section.querySelector('.manager-filters');
  if (!(filters instanceof HTMLFormElement) || filters.closest('[data-manager-advanced-filters]')) return;
  const details = el('details', {
    className: 'manager-advanced-filters',
    dataset: { managerAdvancedFilters: 'true' },
  });
  details.open = state.advancedFiltersOpen;
  const summary = el('summary', {}, [
    el('strong', { text: t('manager.experience.moreFilters') }),
    el('span', { text: t('manager.experience.filterHint') }),
  ]);
  summary.addEventListener('click', () => {
    state.advancedFiltersOpen = !details.open;
  });
  details.appendChild(summary);
  details.addEventListener('toggle', () => { state.advancedFiltersOpen = details.open; });
  filters.before(details);
  details.appendChild(filters);
}

function applyInitialPriorityFilter(section) {
  if (state.priorityHandled) return;
  const actionFilter = section.querySelector('[data-quick-filter="ACTION"]');
  if (!(actionFilter instanceof HTMLButtonElement)) return;
  state.priorityHandled = true;
  if (requestData().some((request) => ['Submitted', 'In Review'].includes(request.status))) actionFilter.click();
}

function detailSection(title, rows) {
  const section = el('section', { className: 'manager-detail-section' }, [el('h3', { text: title })]);
  const list = el('dl', { className: 'manager-detail-list' });
  rows.filter(([, value]) => value !== null && value !== undefined && value !== '').forEach(([label, value]) => {
    list.append(el('div', {}, [el('dt', { text: label }), el('dd', { text: String(value) })]));
  });
  section.appendChild(list);
  return section;
}

function serviceText(request, catalog) {
  const names = (request.serviceIds || []).map((id) => {
    const service = (catalog.services || []).find((entry) => entry.id === id);
    return localized(service?.name || id);
  }).filter(Boolean);
  return names.length ? names.join(', ') : t('manager.experience.noServices');
}

function packageText(request, catalog) {
  if (!request.packageSelection) return t('catering.noPackage');
  if (request.packageSelection.packageName) {
    return `${request.packageSelection.packageName}${request.packageSelection.tier ? ` · ${request.packageSelection.tier}` : ''}`;
  }
  const pack = (catalog.cateringPackages || []).find((entry) => entry.id === request.packageSelection.packageId);
  return `${localized(pack?.name || request.packageSelection.packageId || '')}${request.packageSelection.tier ? ` · ${request.packageSelection.tier}` : ''}`.trim();
}

function itemText(request, catalog) {
  const selected = Object.entries(request.quantities || {}).filter(([, quantity]) => Number(quantity) > 0);
  if (!selected.length) return t('catering.noItems');
  return selected.map(([id, quantity]) => {
    const item = (catalog.cateringItems || []).find((entry) => entry.id === id);
    const unit = localized(item?.unit || '');
    return `${localized(item?.name || id)}: ${quantity}${unit ? ` ${unit}` : ''}`;
  }).join(', ');
}

function allocationText(request) {
  const allocations = (request.allocations || []).filter((entry) => entry?.costCenter);
  if (!allocations.length) return t('manager.experience.noCostCenters');
  return allocations.map((entry) => `${entry.costCenter}: ${Number(entry.percent || 0)} %`).join(', ');
}

function requesterInfo(request) {
  if (request.requesterName) return { name: request.requesterName, fallback: false };
  const profile = readJson(KEYS.profile, { firstName: '', lastName: '' });
  const name = `${profile.firstName || ''} ${profile.lastName || ''}`.trim();
  return { name: name || t('manager.experience.notStored'), fallback: Boolean(name) };
}

function buildReviewContent(request) {
  const catalog = catalogData();
  const room = (catalog.rooms || []).find((entry) => entry.id === request.roomId);
  const requester = requesterInfo(request);
  const noInfo = t('manager.experience.noInformation');
  const content = el('section', { className: 'manager-detail-grid', dataset: { managerReviewContent: request.id } });
  const event = detailSection(t('manager.experience.event'), [
    [t('schedule.title'), request.title],
    [t('manager.experience.requester'), requester.name],
    [t('manager.status'), t(`status.${request.status}`)],
  ]);
  if (requester.fallback) event.appendChild(el('small', {
    className: 'manager-detail-note',
    text: t('manager.experience.requesterFallback'),
  }));

  content.append(
    event,
    detailSection(t('manager.experience.scheduleRoom'), [
      [t('schedule.date'), formatDate(request.date)],
      [`${t('schedule.start')} / ${t('schedule.end')}`, `${request.start}–${request.end}`],
      [t('schedule.location'), request.location],
      [t('review.room'), localized(room?.name || request.roomId || '')],
    ]),
    detailSection(t('schedule.total'), [
      [t('schedule.internal'), Number(request.internalParticipants || 0)],
      [t('schedule.external'), Number(request.externalParticipants || 0)],
      [t('schedule.total'), totalParticipants(request)],
    ]),
    detailSection(t('review.services'), [
      [t('review.services'), serviceText(request, catalog)],
    ]),
    detailSection(t('manager.experience.cateringRequirements'), [
      [t('catering.package'), packageText(request, catalog)],
      [t('catering.people'), request.cateringParticipants ? String(request.cateringParticipants) : noInfo],
      [t('catering.items'), itemText(request, catalog)],
      [t('catering.dietary'), request.dietaryRequirements || noInfo],
      [t('schedule.special'), request.specialRequirements || noInfo],
    ]),
    detailSection(t('review.costs'), [
      [t('review.total'), formatMoney(request.estimatedCost || 0)],
      [t('cost.allocations'), allocationText(request)],
    ]),
  );
  return content;
}

function ensureNativeActionIdentity(footer) {
  if (!(footer instanceof HTMLElement)) return;
  const controls = [...footer.children].filter((control) => control instanceof HTMLButtonElement);
  if (controls.length !== MANAGER_ACTION_IDS.length) return;
  controls.forEach((control, index) => {
    if (!control.dataset.managerAction) control.dataset.managerAction = MANAGER_ACTION_IDS[index];
  });
}

function nativeAction(footer, action) {
  if (!(footer instanceof HTMLElement) || !MANAGER_ACTION_IDS.includes(action)) return null;
  ensureNativeActionIdentity(footer);
  const control = footer.querySelector(`button[data-manager-action="${action}"]`);
  return control instanceof HTMLButtonElement ? control : null;
}

function openConfirmDialog(request, originalConfirm) {
  const catalog = catalogData();
  const room = (catalog.rooms || []).find((entry) => entry.id === request.roomId);
  const summary = detailSection(t('manager.experience.keyDetails'), [
    [t('schedule.title'), request.title],
    [t('schedule.date'), formatDate(request.date)],
    [`${t('schedule.start')} / ${t('schedule.end')}`, `${request.start}–${request.end}`],
    [t('schedule.location'), request.location],
    [t('review.room'), localized(room?.name || request.roomId || '')],
    [t('schedule.total'), totalParticipants(request)],
    [t('review.total'), formatMoney(request.estimatedCost || 0)],
  ]);
  const cancel = button(t('common.cancel'));
  const confirm = button(t('manager.experience.confirmBinding'), {
    className: 'primary',
    dataset: { managerConfirmFinal: request.id },
  });
  const dialog = openDialog({
    title: t('manager.experience.confirmTitle'),
    description: t('manager.ux.confirmDescription'),
    content: summary,
    actions: [cancel, confirm],
    labelledById: 'managerConfirmTitle',
  });
  dialog.classList.add('manager-confirm-dialog');
  cancel.addEventListener('click', () => dialog.close());
  confirm.addEventListener('click', () => {
    dialog.close();
    requestAnimationFrame(() => originalConfirm?.click());
  });
}

function openReviewDialog(request, originalFooter) {
  const actionable = ['Submitted', 'In Review'].includes(request.status);
  const close = button(t('common.close'));
  const actions = [close];
  const confirmOriginal = nativeAction(originalFooter, 'confirm');
  const changeOriginal = nativeAction(originalFooter, 'change');
  const rejectOriginal = nativeAction(originalFooter, 'reject');
  let dialog;

  if (actionable && changeOriginal) {
    const change = button(t('manager.change'));
    change.addEventListener('click', () => {
      dialog.close();
      requestAnimationFrame(() => changeOriginal.click());
    });
    actions.push(change);
  }
  if (actionable && rejectOriginal) {
    const reject = button(t('manager.reject'), { className: 'danger' });
    reject.addEventListener('click', () => {
      dialog.close();
      requestAnimationFrame(() => rejectOriginal.click());
    });
    actions.push(reject);
  }
  if (actionable && confirmOriginal) {
    const confirm = button(t('manager.confirm'), {
      className: 'primary',
      dataset: { managerConfirmFromReview: request.id },
    });
    confirm.addEventListener('click', () => {
      dialog.close();
      requestAnimationFrame(() => openConfirmDialog(request, confirmOriginal));
    });
    actions.push(confirm);
  }

  dialog = openDialog({
    title: t('manager.experience.reviewTitle', { id: request.id }),
    description: actionable ? t('manager.experience.reviewDescription') : '',
    content: buildReviewContent(request),
    actions,
    labelledById: 'managerReviewTitle',
  });
  dialog.classList.add('manager-review-dialog');
  close.addEventListener('click', () => dialog.close());
}

function decorateManagerCards(section) {
  const requests = new Map(requestData().map((request) => [request.id, request]));
  section.querySelectorAll('.request-card').forEach((card) => {
    const requestId = requestIdFromCard(card);
    const request = requests.get(requestId);
    if (!request) return;
    const originalFooter = card.querySelector('.request-actions:not([data-manager-review-actions])');
    if (originalFooter instanceof HTMLElement) {
      ensureNativeActionIdentity(originalFooter);
      originalFooter.classList.add('manager-native-actions');
      originalFooter.hidden = true;
    }
    if (card.querySelector('[data-manager-review-actions]')) return;
    const actionable = ['Submitted', 'In Review'].includes(request.status);
    const reviewFooter = el('footer', {
      className: 'request-actions manager-review-actions',
      dataset: { managerReviewActions: request.id },
    });
    const review = button(
      actionable ? t('manager.experience.reviewAction') : t('manager.experience.detailsAction'),
      {
        className: actionable ? 'primary' : 'secondary',
        dataset: { managerReview: request.id },
      },
    );
    review.addEventListener('click', () => openReviewDialog(request, originalFooter));
    reviewFooter.appendChild(review);
    card.appendChild(reviewFooter);
  });
}

function enhanceBookings(section) {
  addFirstUseGuide(section);
  wrapAdvancedFilters(section);
  decorateManagerCards(section);
  applyInitialPriorityFilter(section);
}

export function enhanceManagerFirstUse() {
  if (applyManagerLanding()) return;
  const tab = currentManagerTab();
  if (!tab) return;
  updateManagerHeading(tab);
  const section = document.querySelector('.manager-tabs')?.nextElementSibling;
  if (!(section instanceof HTMLElement)) return;
  if (tab === 'BOOKINGS') enhanceBookings(section);
  document.documentElement.dataset.managerFirstUseBuild = '2026.08.23.52';
}
