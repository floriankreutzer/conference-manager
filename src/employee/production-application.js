import { formatMoney, formatNumber, locale, t } from '../core/i18n.js';
import { loadOpenBookingChanges } from '../shared/booking-change-loader.js';
import { canProposeProductionBookingChange } from '../shared/production-booking-change.js';
import { openProductionBookingChangeDialog } from '../shared/production-booking-change-editor.js';
import {
  loadCoherentRequestRoomContext,
  loadMissingRequestRoomContexts,
  productionRequestRoomTimeZone,
} from '../shared/request-room-context-loader.js';
import { button, clear, el, field, openDialog, showToast } from '../core/ui.js';
import {
  formatProductionDateTime,
  isProductionTimeZone,
  productionUtcInstant,
} from '../core/production-time.js';
import {
  repeatRequestProjection,
} from './server-request-projection.js';
import {
  initialServerRequestCalendarMonth,
  projectServerRequestCalendar,
  renderServerRequestCalendar,
} from './server-request-calendar.js';
import { renderServerRequestHistory } from './server-request-history.js';
import { composeServerRequestDraft } from '../shared/production-request-draft.js';
import {
  cateringEditorOptions,
  equipmentEditorOptions,
  normalizeAllocationEditorDraft,
  normalizeCateringEditorDraft,
  roomEditorOptions,
  roomSupportsParticipants,
  serviceEditorOptions,
} from './server-request-editor.js';
import {
  buildServerRequestReview,
  roomAssetPreviewState,
} from './server-request-review.js';
import { renderProductionRequestBusinessDetails } from '../shared/production-request-details.js';
import {
  closeDetachedPrintWindow,
  closeDetachedPrintWindows,
  initializeDetachedPrintDocument,
  openDetachedPrintWindow,
} from '../shared/detached-print-window.js';
import { authorityFailureCode } from '../shared/authority-failure.js';
import { createAuthoritySurfaceRegistry } from '../shared/authority-surface-registry.js';
import { managedRoomMedia } from './room-media.js';
import { createApiClient } from '../core/api-client.js';
import { RUNTIME_MODE, runtimeModeFromDocument } from '../core/security-policy.js';

const CANCELLABLE_STATUSES = new Set(['Submitted', 'In Review', 'Change Requested', 'Confirmed']);
const MAX_PARTICIPANTS = 500;

function safeParticipantCount(value) {
  if (String(value).trim() === '') return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 && parsed <= MAX_PARTICIPANTS ? parsed : null;
}

function errorMessage(error) {
  const causeCode = authorityFailureCode(error) || error?.cause?.code;
  if (causeCode === 'HTTP_401') return t('production.error.session');
  if (causeCode === 'HTTP_403') return t('production.error.forbidden');
  if (causeCode === 'HTTP_409') return t('production.error.conflict');
  return t('production.error.generic');
}

function roomLabel(room) {
  const capacity = Number.isSafeInteger(Number(room.capacity)) ? Number(room.capacity) : null;
  return capacity ? `${room.name} · ${capacity}` : String(room.name || room.id || '');
}

function roomPreviewVisual(path, label, className = '') {
  const image = el('img', {
    className: `room-asset-visual${className ? ` ${className}` : ''}`,
    attrs: { src: path, alt: label, loading: 'lazy', referrerpolicy: 'no-referrer' },
  });
  const status = el('p', { className: 'muted room-asset-note',
    text: t('production.employee.roomAssetLoading') });
  image.addEventListener('load', () => { status.textContent = ''; }, { once: true });
  image.addEventListener('error', () => {
    image.hidden = true;
    status.textContent = t('production.employee.roomAssetLoadError');
  }, { once: true });
  return el('div', { className: 'room-asset-frame' }, [image, status]);
}

function openRoomPreview(room, trigger, previewIndex) {
  const assets = roomAssetPreviewState(room);
  const managed = managedRoomMedia(room);
  const content = el('section', { className: 'room-asset-dialog' });
  if (room.description) {
    content.appendChild(el('p', { text: room.description }));
  }
  if (managed.floorplan) {
    content.appendChild(el('article', { className: 'room-asset-panel' }, [
      el('h3', { text: t('production.employee.roomFloorplanHeading') }),
      roomPreviewVisual(managed.floorplan, t('production.employee.roomFloorplanAlt', { room: room.name }), 'floorplan'),
    ]));
  }
  if (managed.media.length > 0) {
    const media = el('section', { className: 'room-asset-panel' }, [
      el('h3', { text: t('production.employee.roomMediaHeading') }),
    ]);
    const grid = el('div', { className: 'room-media-grid' });
    for (let index = 0; index < managed.media.length; index += 1) {
      grid.appendChild(roomPreviewVisual(managed.media[index], t('production.employee.roomMediaAlt', {
        room: room.name,
        index: formatNumber(index + 1),
        count: formatNumber(managed.media.length),
      }), 'media'));
    }
    media.appendChild(grid);
    content.appendChild(media);
  }
  if (!managed.floorplan && managed.media.length === 0) {
    content.appendChild(el('p', {
      className: 'info-box room-asset-empty',
      text: assets.hasFloorplan || assets.mediaCount
        ? t('production.employee.roomAssetLoadError') : t('production.employee.roomAssetsEmpty'),
    }));
  }
  content.appendChild(el('p', {
    className: 'muted room-asset-note',
    text: t('production.employee.roomAssetsPrivacy'),
  }));
  const close = button(t('common.close'));
  const dialog = openDialog({
    title: t('production.employee.roomPreviewTitle', { room: room.name }),
    content,
    actions: [close],
    labelledById: `productionRoomPreviewTitle-${previewIndex}`,
  });
  close.addEventListener('click', () => dialog.close());
  dialog.addEventListener('close', () => {
    if (trigger.isConnected && document.documentElement.dataset.sessionLocked !== 'true') {
      trigger.focus();
    }
  }, { once: true });
  return dialog;
}

function openEmployeeCancellationConfirmation(request, confirmAction) {
  const dismiss = button(t('common.cancel'));
  const confirm = button(t('requests.cancel'), { className: 'danger' });
  const requestTitle = request.details?.title
    || t('production.common.requestId', { id: request.id });
  const dialog = openDialog({
    title: t('production.employee.cancelTitle'),
    description: t('production.employee.cancelDescription', { title: requestTitle }),
    actions: [dismiss, confirm],
    labelledById: 'productionEmployeeCancelTitle',
  });
  let pending = false;
  dismiss.addEventListener('click', () => dialog.close());
  confirm.addEventListener('click', async () => {
    if (pending || !dialog.isConnected
      || document.documentElement.dataset.sessionLocked === 'true') return;
    pending = true;
    dismiss.disabled = true;
    confirm.disabled = true;
    dialog.close();
    await confirmAction();
  });
  return dialog;
}

function compositionDraft(request, catalog, overrides = {}) {
  return composeServerRequestDraft({
    request,
    catalog,
    overrides,
    defaultTitle: t('production.employee.title'),
  });
}

function requestCard(request, catalog, currentRoomContext, openChange, {
  mutationInFlight = () => false,
  onCancel, onCancelConfirmation, onChange, onGuestInfo, onHistory, onPrint, onRepeat, onResubmit,
}) {
  const room = catalog.rooms.find((entry) => entry.id === request.roomId)
    || (currentRoomContext?.room?.id === request.roomId ? currentRoomContext.room : null);
  const timeZone = productionRequestRoomTimeZone(room, catalog, currentRoomContext);
  const startsAt = formatProductionDateTime(request.startsAt, { locale: locale(), timeZone });
  const endsAt = formatProductionDateTime(request.endsAt, { locale: locale(), timeZone });
  const participants = Number(request.internalParticipants || 0) + Number(request.externalParticipants || 0);
  const article = el('article', {
    className: 'request-card',
    dataset: { productionRequestId: request.id },
    attrs: { tabindex: '-1' },
  }, [
    el('h3', { text: request.details?.title || t('production.common.requestId', { id: request.id }) }),
    request.details?.title
      ? el('p', { className: 'muted', text: t('production.common.requestId', { id: request.id }) })
      : null,
    el('p', { text: room ? roomLabel(room) : request.roomId }),
    el('p', {
      text: startsAt && endsAt ? `${startsAt} – ${endsAt}` : t('production.common.timeUnavailable'),
    }),
    el('p', { text: t('production.common.participants', { count: participants }) }),
    el('p', { text: `${t('production.common.status')}: ${t(`status.${request.status}`)}` }),
  ]);
  const businessDetails = renderProductionRequestBusinessDetails(request);
  if (businessDetails) article.appendChild(businessDetails);
  if (request.statusReason) article.appendChild(el('p', { text: request.statusReason }));
  const mutationControls = [];
  let interactionPending = false;
  const updateMutationControls = () => {
    const disabled = interactionPending || mutationInFlight();
    mutationControls.forEach((control) => { control.disabled = disabled; });
  };
  const registerMutationControl = (control) => {
    mutationControls.push(control);
    updateMutationControls();
    return control;
  };
  const runMutation = async (operation) => {
    if (interactionPending || mutationInFlight()) return;
    interactionPending = true;
    updateMutationControls();
    try {
      await operation();
    } finally {
      interactionPending = false;
      if (article.isConnected) updateMutationControls();
    }
  };
  if (openChange === undefined && request.status === 'Confirmed') {
    article.appendChild(el('p', {
      className: 'error-box',
      text: t('production.bookingChange.unavailable'),
    }));
  } else {
    if (openChange) {
      article.appendChild(el('p', {
        className: 'info-box',
        text: t(`production.bookingChange.status.${openChange.status}`),
      }));
    }
    if (canProposeProductionBookingChange(request.status, openChange)) {
      const change = registerMutationControl(button(t('production.bookingChange.propose')));
      change.addEventListener('click', () => { void runMutation(() => onChange(request)); });
      article.appendChild(change);
    }
  }
  if (CANCELLABLE_STATUSES.has(request.status)) {
    const cancel = registerMutationControl(button(t('requests.cancel'), { className: 'danger' }));
    cancel.addEventListener('click', () => {
      onCancelConfirmation(
        request,
        () => runMutation(() => onCancel(request.id)),
      );
    });
    article.appendChild(cancel);
  }
  const history = button(t('production.manager.historyTab'));
  history.addEventListener('click', () => onHistory(request, history));
  const secondaryActions = [history];
  if (request.status === 'Confirmed') {
    const guest = registerMutationControl(button(t('guest.title')));
    guest.addEventListener('click', () => {
      void runMutation(() => onGuestInfo(request, currentRoomContext));
    });
    const print = registerMutationControl(button(t('guest.print')));
    print.addEventListener('click', () => {
      void runMutation(() => onPrint(request, currentRoomContext));
    });
    secondaryActions.push(guest, print);
  }
  if (['Rejected', 'Cancelled'].includes(request.status)) {
    const repeat = button(t(request.status === 'Rejected' ? 'requests.repeatRejected' : 'requests.repeat'));
    repeat.addEventListener('click', () => onRepeat(request));
    secondaryActions.push(repeat);
  }
  article.appendChild(el('div', { className: 'button-row' }, secondaryActions));
  if (request.status === 'Change Requested') {
    const resubmit = button(t('requests.editChange'), { className: 'primary' });
    resubmit.addEventListener('click', () => onResubmit(request));
    article.appendChild(resubmit);
  }
  return article;
}

export function createProductionEmployeeApplication({
  appRoot,
  setPageHeading,
  persistence,
  onNavigate = null,
  draftStore = null,
  onAuthorityFailure = null,
} = {}) {
  if (!appRoot || typeof setPageHeading !== 'function') throw new TypeError('PRODUCTION_EMPLOYEE_UI_REQUIRED');
  if (onAuthorityFailure !== null && typeof onAuthorityFailure !== 'function') {
    throw new TypeError('PRODUCTION_EMPLOYEE_AUTHORITY_HANDLER_REQUIRED');
  }
  if (
    !persistence
    || typeof persistence.loadCatalog !== 'function'
    || typeof persistence.checkRoomAvailability !== 'function'
    || typeof persistence.loadBookingChange !== 'function'
    || typeof persistence.loadRequestRoomContext !== 'function'
    || typeof persistence.proposeBookingChange !== 'function'
  ) {
    throw new TypeError('PRODUCTION_PERSISTENCE_REQUIRED');
  }

  let catalog = Object.freeze({ rooms: Object.freeze([]) });
  let demoMedia = new Map();
  const demoRuntime = runtimeModeFromDocument(document) === RUNTIME_MODE.DEMO;

  async function loadDemoMedia() {
    if (!demoRuntime) return new Map();
    const response = await createApiClient().request('v1/demo/media');
    if (!Array.isArray(response?.assets) || response.assets.length > 40) return new Map();
    return new Map(response.assets.filter((entry) =>
      ['catering_package', 'catering_item'].includes(entry?.ownerKind)
      && typeof entry.ownerId === 'string'
      && /^\/api\/v1\/demo\/media\/[0-9a-f-]{36}$/i.test(entry.url)
      && typeof entry.altText === 'string'
    ).map((entry) => [`${entry.ownerKind}:${entry.ownerId}`, entry]));
  }

  function cateringVisual(kind, id) {
    const media = demoMedia.get(`${kind}:${id}`);
    return media ? roomPreviewVisual(media.url, media.altText, 'catering-asset-visual') : null;
  }
  let queuedRequest = null;
  let queuedResubmission = false;
  let submissionNotice = null;
  let editorRenderGeneration = 0;
  let activeRequestsRefresh = null;
  const requestMutations = new Map();
  const authoritySurfaces = createAuthoritySurfaceRegistry();

  function reserveRequestMutation(requestId, kind) {
    if (requestMutations.has(requestId)) return null;
    const tracked = {
      kind, notified: false, reconciled: false, promise: null,
    };
    requestMutations.set(requestId, tracked);
    return tracked;
  }

  function beginRequestMutation(requestId, kind, operation) {
    const tracked = reserveRequestMutation(requestId, kind);
    if (!tracked) return null;
    tracked.promise = Promise.resolve().then(operation);
    return tracked;
  }

  function queueRequest(request, { resubmit = false } = {}) {
    if (resubmit || Date.parse(request.startsAt) > Date.now()) {
      queuedRequest = request;
    } else {
      const room = catalog.rooms.find((entry) => entry.id === request.roomId);
      const timeZone = productionRequestRoomTimeZone(room, catalog);
      queuedRequest = isProductionTimeZone(timeZone)
        ? repeatRequestProjection(request, Date.now(), timeZone)
        : Object.freeze({ ...request, roomId: '', startsAt: '', endsAt: '' });
    }
    queuedResubmission = resubmit;
    if (typeof onNavigate === 'function') onNavigate('employee');
    else void renderRequest();
  }

  function guestPresentationDetails(guest, currentRoomContext) {
    const siteValues = currentRoomContext?.guestPublicValues;
    const roomValues = currentRoomContext?.room?.guestPublicValues;
    const features = [...new Set([
      ...(siteValues?.accessibilityFeatures || []),
      ...(roomValues?.accessibilityFeatures || []),
    ])];
    return [
      [t('room.floor'), roomValues?.floorNumber === null || roomValues?.floorNumber === undefined
        ? '' : String(roomValues.floorNumber)],
      [t('manager.publicTransport'), siteValues
        ? t(`guest.publicAvailability.${siteValues.publicTransport}`) : ''],
      [t('guest.arrival'), siteValues ? t(`guest.publicArrival.${siteValues.arrival}`) : ''],
      [t('manager.parking'), siteValues
        ? t(`guest.publicAvailability.${siteValues.parking}`) : ''],
      [t('manager.accessibility'), features.map((feature) => t(`guest.publicFeature.${feature}`)).join(', ')],
      [t('manager.contact'), guest?.contact
        ? [guest.contact.name, guest.contact.email, guest.contact.phone].filter(Boolean).join(' · ')
        : ''],
      [t('guest.wifi'), t(`guest.wifiPolicy.${guest?.wifiPolicy || 'not_available'}`)],
    ].map(([term, value]) => [term, value || '—']);
  }

  function printRequest(
    request,
    currentRoomContext = null,
    printWindow = openDetachedPrintWindow(),
  ) {
    if (!printWindow) {
      showToast(t('guest.popupBlocked'));
      return false;
    }
    let doc;
    try {
      doc = initializeDetachedPrintDocument(printWindow, {
        lang: locale().split('-')[0],
        title: t('requests.pdf'),
      });
    } catch {
      closeDetachedPrintWindow(printWindow);
      showToast(t('guest.popupBlocked'));
      return false;
    }
    const room = catalog.rooms.find((entry) => entry.id === request.roomId)
      || (currentRoomContext?.room?.id === request.roomId ? currentRoomContext.room : null);
    const site = catalog.sites?.find((entry) => entry.id === room?.siteId)
      || (currentRoomContext?.site?.id === room?.siteId ? currentRoomContext.site : null);
    const guest = currentRoomContext?.guestPresentation;
    const address = guest?.address;
    const formattedAddress = address
      ? [address.line1, address.line2, `${address.postalCode} ${address.city}`, address.countryCode]
        .filter(Boolean).join(', ')
      : t('guest.askOrganizer');
    const heading = doc.createElement('h1');
    heading.textContent = t('guest.welcome', {
      title: request.details?.title || t('guest.title'),
    });
    const list = doc.createElement('dl');
    [
      [t('production.employee.start'), formattedRequestValue(
        request.startsAt, room, catalog, currentRoomContext,
      )],
      [t('production.employee.end'), formattedRequestValue(
        request.endsAt, room, catalog, currentRoomContext,
      )],
      [t('production.employee.room'), room ? roomLabel(room) : t('guest.askOrganizer')],
      [t('guest.address'), formattedAddress],
      ...guestPresentationDetails(guest, currentRoomContext),
    ].forEach(([term, value]) => {
      const dt = doc.createElement('dt');
      const dd = doc.createElement('dd');
      dt.textContent = term;
      dd.textContent = value;
      list.append(dt, dd);
    });
    const route = guest?.routeUrl ? doc.createElement('a') : null;
    if (route) {
      route.href = guest.routeUrl;
      route.target = '_blank';
      route.rel = 'noopener noreferrer';
      route.textContent = t('guest.route');
    }
    const print = doc.createElement('button');
    print.type = 'button';
    print.className = 'print-action';
    print.textContent = t('guest.print');
    print.addEventListener('click', () => printWindow.print());
    doc.body.append(heading, list, ...(route ? [route] : []), print);
    printWindow.focus();
    return true;
  }

  function openGuestInfo(request, currentRoomContext = null) {
    const room = catalog.rooms.find((entry) => entry.id === request.roomId)
      || (currentRoomContext?.room?.id === request.roomId ? currentRoomContext.room : null);
    const guest = currentRoomContext?.guestPresentation;
    const address = guest?.address;
    const formattedAddress = address
      ? [address.line1, address.line2, `${address.postalCode} ${address.city}`, address.countryCode]
        .filter(Boolean).join(', ')
      : t('guest.askOrganizer');
    const close = button(t('common.close'));
    const print = button(t('guest.print'), { className: 'primary' });
    const dialog = openDialog({
      title: t('guest.welcome', {
        title: request.details?.title || t('production.common.requestId', { id: request.id }),
      }),
      description: t('guest.subtitle'),
      content: el('section', {}, [el('dl', { className: 'details-list' }, [
        el('dt', { text: t('production.employee.start') }),
        el('dd', { text: formattedRequestValue(
          request.startsAt, room, catalog, currentRoomContext,
        ) }),
        el('dt', { text: t('production.employee.end') }),
        el('dd', { text: formattedRequestValue(
          request.endsAt, room, catalog, currentRoomContext,
        ) }),
        el('dt', { text: t('production.employee.room') }),
        el('dd', { text: roomLabel(room || { id: request.roomId }) }),
        el('dt', { text: t('guest.address') }),
        el('dd', { text: formattedAddress }),
        ...guestPresentationDetails(guest, currentRoomContext)
          .flatMap(([term, value]) => [el('dt', { text: term }), el('dd', { text: value })]),
      ]), guest?.routeUrl ? el('p', {}, el('a', {
        href: guest.routeUrl,
        target: '_blank',
        rel: 'noopener noreferrer',
        text: t('guest.route'),
      })) : null]),
      actions: [close, print],
      labelledById: `guestInformation-${request.id}`,
    });
    close.addEventListener('click', () => dialog.close());
    print.addEventListener('click', () => printRequest(request, currentRoomContext));
    authoritySurfaces.track(dialog);
    return dialog;
  }

  function localizedGuest(value) {
    return value || '';
  }

  function formattedRequestValue(value, room, requestCatalog, currentRoomContext = null) {
    return formatProductionDateTime(value, {
      locale: locale(),
      timeZone: productionRequestRoomTimeZone(room, requestCatalog, currentRoomContext),
    }) || t('production.common.timeUnavailable');
  }

  function wallValues(timestamp, timeZone) {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
    }).formatToParts(Date.parse(timestamp));
    const values = Object.fromEntries(parts.filter(({ type }) => type !== 'literal')
      .map(({ type, value }) => [type, value]));
    return Object.freeze({ date: `${values.year}-${values.month}-${values.day}`, time: `${values.hour}:${values.minute}` });
  }

  async function renderRequest() {
    const generation = ++editorRenderGeneration;
    activeRequestsRefresh = null;
    clear(appRoot);
    setPageHeading(t('production.employee.title'), t('production.employee.subtitle'));
    const root = el('form', { className: 'card', attrs: { novalidate: 'novalidate' } }, [
      el('p', { className: 'muted', text: t('production.common.loading') }),
    ]);
    root.addEventListener('submit', (event) => event.preventDefault());
    appRoot.appendChild(root);
    let authorityProjectionInvalid = false;
    const isCurrentEditor = () => (
      generation === editorRenderGeneration
      && root.parentNode === appRoot
      && document.documentElement.dataset.sessionLocked !== 'true'
      && !authorityProjectionInvalid
    );
    const invalidateEditorAuthority = (error) => {
      authorityProjectionInvalid = true;
      editorRenderGeneration += 1;
      activeRequestsRefresh = null;
      requestMutations.clear();
      closeDetachedPrintWindows();
      authoritySurfaces.closeAll();
      if (onAuthorityFailure?.(error)) return true;
      if (!root.isConnected) return false;
      clear(root);
      root.removeAttribute('aria-busy');
      const status = el('p', {
        className: 'error-box',
        text: errorMessage(error),
        attrs: { tabindex: '-1', role: 'status' },
      });
      root.appendChild(status);
      requestAnimationFrame(() => {
        if (authorityProjectionInvalid && root.isConnected) status.focus();
      });
      return true;
    };
    let requestCatalog;
    try {
      requestCatalog = await persistence.loadCatalog();
      if (!isCurrentEditor()) return;
      catalog = requestCatalog;
      demoMedia = await loadDemoMedia().catch((error) => {
        if (authorityFailureCode(error)) throw error;
        return new Map();
      });
      if (!isCurrentEditor()) return;
    } catch (error) {
      if (authorityFailureCode(error)) {
        invalidateEditorAuthority(error);
        return;
      }
      if (!isCurrentEditor()) return;
      clear(root);
      root.appendChild(el('p', { className: 'error-box', text: t('production.employee.loadError') }));
      return;
    }
    clear(root);
    let sourceRequest = queuedRequest;
    const isResubmission = queuedResubmission;
    let resubmissionVersionCurrent = true;
    queuedRequest = null;
    queuedResubmission = false;
    const restoredDraft = sourceRequest ? null : draftStore?.load?.() || null;
    const rooms = roomEditorOptions(requestCatalog);
    if (!rooms.length) {
      root.appendChild(el('p', { className: 'info-box', text: t('production.employee.noRooms') }));
      return;
    }

    const room = el('input', { id: 'productionRoom', attrs: { type: 'hidden' } });
    const sourceRoom = rooms.find((entry) => entry.id === sourceRequest?.roomId);
    const restoredRoom = rooms.find((entry) => entry.id === restoredDraft?.roomId);
    const sourceTimeZone = productionRequestRoomTimeZone(sourceRoom, requestCatalog);
    const sourceStart = sourceRequest && isProductionTimeZone(sourceTimeZone)
      ? wallValues(sourceRequest.startsAt, sourceTimeZone) : null;
    const sourceEnd = sourceRequest && isProductionTimeZone(sourceTimeZone)
      ? wallValues(sourceRequest.endsAt, sourceTimeZone) : null;
    if (sourceRoom) room.value = sourceRoom.id;
    else if (restoredRoom) room.value = restoredRoom.id;
    const date = el('input', { attrs: { type: 'date', value: sourceStart?.date || restoredDraft?.startDate || '' } });
    const endDate = el('input', { attrs: { type: 'date', value: sourceEnd?.date || restoredDraft?.endDate || sourceStart?.date || '' } });
    const start = el('input', { attrs: { type: 'time', value: sourceStart?.time || restoredDraft?.startTime || '' } });
    const end = el('input', { attrs: { type: 'time', value: sourceEnd?.time || restoredDraft?.endTime || '' } });
    const internal = el('input', { attrs: { type: 'number', min: '0', max: String(MAX_PARTICIPANTS), value: String(sourceRequest?.internalParticipants ?? restoredDraft?.internalParticipants ?? 1) } });
    const external = el('input', { attrs: { type: 'number', min: '0', max: String(MAX_PARTICIPANTS), value: String(sourceRequest?.externalParticipants ?? restoredDraft?.externalParticipants ?? 0) } });
    const title = el('input', { attrs: { type: 'text', maxlength: '160', value: sourceRequest?.details?.title || restoredDraft?.title || '' } });
    const specialRequirements = el('textarea', { attrs: { maxlength: '2000' }, value: sourceRequest?.details?.specialRequirements || restoredDraft?.specialRequirements || '' });
    const dietaryRequirements = el('textarea', { attrs: { maxlength: '2000' }, value: sourceRequest?.details?.dietaryRequirements || restoredDraft?.dietaryRequirements || '' });
    [title, date, endDate, start, end, internal, external].forEach((control) => {
      control.required = true;
      control.setAttribute('aria-required', 'true');
    });
    const selectedServices = new Set(sourceRequest?.details?.serviceIds || restoredDraft?.serviceIds || []);
    const selectedEquipment = new Set(sourceRequest?.details?.equipmentIds || restoredDraft?.equipmentIds || []);
    let packageSelection = sourceRequest?.details?.catering?.packageSelection
      ? { ...sourceRequest.details.catering.packageSelection }
      : (restoredDraft?.packageSelection ? { ...restoredDraft.packageSelection } : null);
    const itemQuantities = Object.fromEntries(
      sourceRequest?.details?.catering?.itemQuantities
        ? sourceRequest.details.catering.itemQuantities.map((entry) => [entry.itemId, entry.quantity])
        : Object.entries(restoredDraft?.itemQuantities || {}),
    );
    const cateringParticipants = el('input', {
      attrs: {
        type: 'number', min: '0', max: String(MAX_PARTICIPANTS), step: '1',
        value: String(sourceRequest?.details?.catering?.participantCount ?? restoredDraft?.cateringParticipants ?? 0),
      },
    });
    const servicePanel = el('fieldset', { className: 'room-option-fieldset selection-option-fieldset' });
    const equipmentPanel = el('fieldset', { className: 'room-option-fieldset selection-option-fieldset' });
    const renderSelections = (panel, entries, selected, heading) => {
      clear(panel);
      panel.appendChild(el('legend', { className: 'selection-group-legend', text: heading }));
      if (!room.value) {
        panel.appendChild(el('p', { className: 'muted', text: t('schedule.locationPlaceholder') }));
        return;
      }
      const applicableIds = new Set(entries.map((entry) => entry.id));
      [...selected].forEach((id) => { if (!applicableIds.has(id)) selected.delete(id); });
      if (!entries.length) {
        panel.appendChild(el('p', { className: 'muted', text: t('production.employee.noSelections') }));
        return;
      }
      const grid = el('div', { className: 'selection-grid' });
      entries.forEach((entry) => {
        const control = el('input', { attrs: { type: 'checkbox', value: entry.id } });
        control.checked = selected.has(entry.id);
        const card = el('label', { className: `option-card selection-option-card${control.checked ? ' selected' : ''}` }, [
          control,
          el('span', { className: 'selection-option-content' }, [
            el('strong', { className: 'selection-option-name', text: entry.name }),
            entry.description
              ? el('span', { className: 'selection-option-description', text: entry.description })
              : null,
            el('strong', {
              className: 'price',
              dataset: { uxPriceBasis: 'request' },
              text: `${formatMoney(entry.price.amountMinor / 100, entry.price.currency)} · ${t('price.perRequest')}`,
            }),
          ]),
        ]);
        control.addEventListener('change', () => {
          if (control.checked) selected.add(entry.id); else selected.delete(entry.id);
          card.classList.toggle('selected', control.checked);
        });
        grid.appendChild(card);
      });
      panel.appendChild(grid);
    };
    const renderServiceControls = () => {
      renderSelections(servicePanel, serviceEditorOptions(requestCatalog, room.value), selectedServices, t('review.services'));
      renderSelections(equipmentPanel, equipmentEditorOptions(requestCatalog, room.value), selectedEquipment, t('production.employee.equipmentHeading'));
    };
    const roomSelectionGrid = el('div', { className: 'selection-grid' });
    const roomSelectionPanel = el('fieldset', { className: 'room-option-fieldset' }, [
      el('legend', { className: 'sr-only', text: t('production.employee.roomOptions') }),
      roomSelectionGrid,
    ]);
    const renderRoomControls = () => {
      clear(roomSelectionGrid);
      const participants = (safeParticipantCount(internal.value) || 0)
        + (safeParticipantCount(external.value) || 0);
      const selectedRoom = rooms.find((entry) => entry.id === room.value);
      if (selectedRoom && !roomSupportsParticipants(
        selectedRoom,
        participants,
        requestCatalog.bookingPolicy?.rules?.maximumParticipants,
      )) room.value = '';
      rooms.forEach((entry, index) => {
        const assets = roomAssetPreviewState(entry);
        const supported = roomSupportsParticipants(
          entry,
          participants,
          requestCatalog.bookingPolicy?.rules?.maximumParticipants,
        );
        const selected = room.value === entry.id;
        const capacityStatusDescriptionId = `productionRoomCapacityStatus-${index}`;
        const capacityDescriptionId = `productionRoomCapacity-${index}`;
        const roomStateDescriptionId = `productionRoomState-${index}`;
        const roomNameId = `productionRoomName-${index}`;
        const currentKey = availabilityKey(currentAvailabilityWindow());
        const roomAvailabilityState = selected && availabilityStateKey !== null
          && currentKey === availabilityStateKey ? availabilityState : 'unchecked';
        const availabilityMessageKey = {
          available: 'production.employee.roomStateAvailable',
          checking: 'production.employee.roomStateChecking',
          occupied: 'production.employee.roomStateOccupied',
          error: 'production.employee.roomStateError',
          unchecked: 'production.employee.roomStateUnchecked',
        }[roomAvailabilityState];
        const control = el('input', {
          id: `productionRoomOption-${index}`,
          attrs: {
            type: 'radio',
            name: 'productionRoomChoice',
            value: entry.id,
            required: 'required',
            'aria-labelledby': roomNameId,
            'aria-describedby': [
              capacityStatusDescriptionId,
              capacityDescriptionId,
              ...(selected ? [roomStateDescriptionId] : []),
            ].join(' '),
          },
          checked: selected,
          disabled: !supported,
        });
        control.addEventListener('change', () => {
          if (!control.checked) return;
          const focusId = control.id;
          room.value = entry.id;
          room.dispatchEvent(new Event('input', { bubbles: true }));
          room.dispatchEvent(new Event('change', { bubbles: true }));
          requestAnimationFrame(() => document.getElementById(focusId)?.focus());
        });
        const card = el('article', {
          className: `option-card${selected ? ' selected' : ''}${supported ? '' : ' disabled'}`,
          dataset: { roomId: entry.id },
        }, [
          control,
          el('span', {
            id: capacityStatusDescriptionId,
            className: `badge ${supported ? 'success' : 'danger'}`,
            text: supported
              ? t('production.employee.roomCapacitySuitable')
              : t('production.employee.roomCapacityInsufficient'),
          }),
          el('h3', { id: roomNameId }, [
            el('label', { attrs: { for: control.id }, text: entry.name }),
          ]),
          el('p', {
            id: capacityDescriptionId,
            text: t('room.capacity', { capacity: entry.capacity, needed: participants }),
          }),
          selected ? el('p', {
            id: roomStateDescriptionId,
            className: roomAvailabilityState === 'available'
              ? 'validation-ok'
              : (['occupied', 'error'].includes(roomAvailabilityState) ? 'validation-bad' : 'muted'),
            dataset: { roomAvailabilityState },
            text: t(availabilityMessageKey),
          }) : null,
        ]);
        if (entry.price) {
          card.appendChild(el('strong', {
            className: 'price',
            text: `${formatMoney(
              Number(entry.price.amountMinor || 0) / 100,
              entry.price.currency,
            )} · ${t('room.cost')}`,
          }));
        }
        const managed = managedRoomMedia(entry);
        if (managed.floorplan || managed.media.length > 0) {
          card.append(
            roomPreviewVisual(
              managed.floorplan || managed.media[0],
              t('production.employee.roomAssetsAvailable', {
                room: entry.name,
                count: formatNumber(managed.media.length),
              }),
              'room-floorplan-preview',
            ),
            el('p', {
              className: 'muted room-asset-summary',
              text: t('production.employee.roomAssetsSummary', {
                floorplan: managed.floorplan
                  ? t('production.employee.roomAssetAvailable')
                  : t('production.employee.roomAssetUnavailable'),
                count: formatNumber(managed.media.length),
              }),
            }),
          );
        } else {
          card.appendChild(el('p', {
            className: 'muted room-asset-empty',
            text: assets.hasFloorplan || assets.mediaCount
              ? t('production.employee.roomAssetLoadError') : t('production.employee.roomAssetsEmpty'),
          }));
        }
        const preview = button(t('production.employee.roomPreviewAction'), {
          className: 'secondary room-preview-action',
          attrs: { 'aria-haspopup': 'dialog' },
        });
        preview.addEventListener('click', () => {
          authoritySurfaces.track(openRoomPreview(entry, preview, index));
        });
        card.appendChild(preview);
        if (entry.equipment.length) {
          card.appendChild(el('p', {
            className: 'room-equipment',
            text: t('production.employee.roomEquipment', { equipment: entry.equipment.join(', ') }),
          }));
        }
        roomSelectionGrid.appendChild(card);
      });
    };
    let roomSelectionWasCleared = false;
    const refreshRoomsForParticipants = () => {
      const previousRoomId = room.value;
      renderRoomControls();
      if (previousRoomId && !room.value) {
        roomSelectionWasCleared = true;
        renderServiceControls();
        renderCateringControls();
      }
    };
    internal.addEventListener('input', refreshRoomsForParticipants);
    external.addEventListener('input', refreshRoomsForParticipants);
    const cateringPanel = el('section', { attrs: { 'aria-label': t('catering.heading') } });
    const renderCateringControls = () => {
      clear(cateringPanel);
      if (!room.value) {
        cateringPanel.append(
          el('h2', { text: t('catering.heading'), attrs: { tabindex: '-1' } }),
          el('p', { className: 'muted', text: t('schedule.locationPlaceholder') }),
        );
        return;
      }
      const options = cateringEditorOptions(requestCatalog, room.value);
      const applicableItemIds = new Set(options.items.map((entry) => entry.id));
      Object.keys(itemQuantities).forEach((itemId) => {
        if (!applicableItemIds.has(itemId)) delete itemQuantities[itemId];
      });
      const packageOptions = options.packages.flatMap((entry) => (
        [...(entry.variants || [])].filter((variant) => variant.active !== false)
          .sort((left, right) => (left.order - right.order) || left.id.localeCompare(right.id))
          .map((variant) => ({ package: entry, variant }))
      ));
      if (!packageOptions.some((entry) => entry.package.id === packageSelection?.packageId
        && entry.variant.id === packageSelection?.variantId)) packageSelection = null;
      const packageFieldset = el('fieldset', { className: 'catering-option-fieldset' }, [
        el('legend', { className: 'selection-group-legend', text: t('production.employee.cateringPackages') }),
      ]);
      const packageGrid = el('div', { className: 'catering-package-grid' });
      const packageControls = [];
      const syncPackageCards = () => {
        packageControls.forEach(({ control, card }) => card.classList.toggle('selected', control.checked));
      };
      const noPackage = el('input', {
        id: 'productionCateringPackage-none',
        attrs: {
          type: 'radio', name: 'productionCateringPackage', value: '',
          'aria-label': t('catering.noPackage'),
        },
        checked: packageSelection === null,
      });
      const noPackageCard = el('label', {
        className: `option-card catering-variant-card${noPackage.checked ? ' selected' : ''}`,
      }, [
        noPackage,
        el('span', { className: 'catering-card-title', text: t('catering.noPackage') }),
        el('span', {
          className: 'muted catering-card-copy',
          text: t('production.employee.cateringNoPackageDescription'),
        }),
      ]);
      packageControls.push({ control: noPackage, card: noPackageCard });
      noPackage.addEventListener('change', () => {
        if (noPackage.checked) packageSelection = null;
        syncPackageCards();
      });
      packageGrid.appendChild(noPackageCard);
      packageOptions.forEach(({ package: packageEntry, variant }, index) => {
        const selected = packageEntry.id === packageSelection?.packageId
          && variant.id === packageSelection?.variantId;
        const control = el('input', {
          id: `productionCateringPackage-${index}`,
          attrs: {
            type: 'radio', name: 'productionCateringPackage', value: String(index),
            'aria-label': `${packageEntry.name} · ${variant.name}`,
          },
          checked: selected,
        });
        const includedItems = packageEntry.itemIds.map((itemId) => (
          options.items.find((item) => item.id === itemId)?.name
        )).filter(Boolean);
        const card = el('label', {
          className: `option-card catering-variant-card${selected ? ' selected' : ''}`,
        }, [
          control,
          cateringVisual('catering_package', packageEntry.id),
          el('span', {
            className: 'catering-card-title',
            text: `${packageEntry.name} · ${variant.name}`,
          }),
          packageEntry.description
            ? el('span', {
              className: 'catering-package-description catering-card-copy',
              text: packageEntry.description,
            })
            : null,
          variant.description
            ? el('span', { className: 'muted catering-card-copy', text: variant.description })
            : null,
          includedItems.length
            ? el('span', {
              className: 'catering-included-items catering-card-copy',
              text: t('production.employee.cateringIncludedItems', {
                items: includedItems.join(' · '),
              }),
            })
            : null,
          el('strong', {
            className: 'price',
            text: t('production.employee.cateringPricePerPerson', {
              price: formatMoney(variant.price.amountMinor / 100, variant.price.currency),
            }),
          }),
        ]);
        packageControls.push({ control, card });
        control.addEventListener('change', () => {
          if (control.checked) {
            packageSelection = { packageId: packageEntry.id, variantId: variant.id };
          }
          syncPackageCards();
        });
        packageGrid.appendChild(card);
      });
      packageFieldset.appendChild(packageGrid);
      if (!packageOptions.length) {
        packageFieldset.appendChild(el('p', {
          className: 'muted',
          text: t('production.employee.cateringPackagesEmpty'),
        }));
      }
      const itemFieldset = el('fieldset', { className: 'catering-option-fieldset' }, [
        el('legend', { className: 'selection-group-legend', text: t('catering.items') }),
      ]);
      const itemGrid = el('div', { className: 'catering-item-grid' });
      cateringPanel.append(
        el('h2', { text: t('catering.heading'), attrs: { tabindex: '-1' } }),
        el('p', { className: 'muted', text: t('catering.desc') }),
        field({
          id: 'productionCateringParticipants', label: t('catering.people'), control: cateringParticipants,
          hint: t('catering.peopleHint'),
        }),
        packageFieldset,
        itemFieldset,
      );
      if (!options.items.length) {
        itemFieldset.appendChild(el('p', { className: 'muted', text: t('catering.noItems') }));
      }
      options.items.forEach((item, index) => {
        const quantity = el('input', {
          attrs: { type: 'number', min: '0', max: '1000', step: '1', value: String(itemQuantities[item.id] || 0) },
        });
        const card = el('article', {
          className: `option-card catering-item-card${Number(quantity.value) > 0 ? ' selected' : ''}`,
        }, [
          cateringVisual('catering_item', item.id),
          el('h3', { text: item.name }),
          item.description ? el('p', { className: 'muted', text: item.description }) : null,
          el('strong', {
            className: 'price',
            text: t('production.employee.cateringPricePerItem', {
              price: formatMoney(item.price.amountMinor / 100, item.price.currency),
            }),
          }),
          field({
            id: `productionCateringItem-${index}`,
            label: t('production.employee.cateringQuantity', { item: item.name }),
            control: quantity,
          }),
        ]);
        quantity.addEventListener('input', () => {
          itemQuantities[item.id] = quantity.value;
          card.classList.toggle('selected', Number(quantity.value) > 0);
        });
        itemGrid.appendChild(card);
      });
      itemFieldset.appendChild(itemGrid);
    };

    const activeCostCenterIds = new Set(requestCatalog.costCenters
      .filter((entry) => entry.active !== false).map((entry) => entry.id));
    const allocationRows = sourceRequest?.allocations?.entries
      ? sourceRequest.allocations.entries.map((entry) => ({
        costCenterId: entry.costCenterId,
        percentage: (entry.percentageBasisPoints / 100).toFixed(2).replace(/\.00$/, ''),
      }))
      : (restoredDraft?.allocations || [])
        .filter((entry) => activeCostCenterIds.has(entry.costCenterId))
        .map((entry) => ({ ...entry }));
    if (!sourceRequest && !restoredDraft && !allocationRows.length
      && requestCatalog.costAllocation?.allocationRequired && requestCatalog.costCenters.length) {
      allocationRows.push({ costCenterId: requestCatalog.costCenters[0].id, percentage: '100' });
    }
    const allocationPanel = el('section', { attrs: { 'aria-label': t('cost.allocations') } });
    let scheduleDraftSave = () => {};
    const renderAllocationControls = () => {
      clear(allocationPanel);
      allocationPanel.append(
        el('h3', { text: t('cost.allocations') }),
        el('p', { className: 'muted', text: t('cost.allocHint') }),
      );
      const allocationStatus = el('p', {
        attrs: { role: 'status', 'aria-live': 'polite' },
      });
      const updateAllocationStatus = () => {
        const sum = allocationRows.reduce((total, entry) => total + Number(entry.percentage || 0), 0);
        allocationStatus.className = Math.abs(sum - 100) < 0.001
          || (!allocationRows.length && !requestCatalog.costAllocation?.allocationRequired)
          ? 'validation-ok' : 'validation-bad';
        allocationStatus.textContent = t('cost.sum', {
          sum: formatNumber(sum, { maximumFractionDigits: 2 }),
        });
      };
      allocationRows.forEach((allocation, index) => {
        const row = el('article', { className: 'allocation-row' });
        const center = el('select');
        center.appendChild(el('option', { value: '', text: t('cost.costCenter') }));
        requestCatalog.costCenters.filter((entry) => entry.active !== false).forEach((entry) => {
          center.appendChild(el('option', { value: entry.id, text: `${entry.code} · ${entry.name}` }));
        });
        center.value = allocation.costCenterId;
        center.addEventListener('change', () => { allocation.costCenterId = center.value; });
        const percentage = el('input', {
          attrs: { type: 'number', min: '0.01', max: '100', step: '0.01', value: allocation.percentage },
        });
        percentage.addEventListener('input', () => {
          allocation.percentage = percentage.value;
          updateAllocationStatus();
        });
        const remove = button(t('common.delete'));
        remove.addEventListener('click', () => {
          allocationRows.splice(index, 1);
          scheduleDraftSave();
          renderAllocationControls();
        });
        row.append(
          field({ id: `productionAllocationCenter-${index}`, label: t('cost.costCenter'), control: center, required: true }),
          field({ id: `productionAllocationPercent-${index}`, label: t('cost.percent'), control: percentage, required: true }),
          remove,
        );
        allocationPanel.appendChild(row);
      });
      allocationPanel.appendChild(allocationStatus);
      updateAllocationStatus();
      const add = button(t('cost.add'));
      add.disabled = allocationRows.length >= Math.min(100, requestCatalog.costCenters.length);
      add.addEventListener('click', () => {
        const used = new Set(allocationRows.map((entry) => entry.costCenterId));
        const next = requestCatalog.costCenters.find((entry) => entry.active !== false && !used.has(entry.id));
        if (next) {
          allocationRows.push({ costCenterId: next.id, percentage: '0' });
          scheduleDraftSave();
        }
        renderAllocationControls();
      });
      allocationPanel.appendChild(add);
    };
    renderCateringControls();
    renderServiceControls();
    renderAllocationControls();
    const status = el('p', {
      id: 'productionEmployeeStatus',
      className: 'muted',
      attrs: { role: 'status', 'aria-live': 'polite', 'aria-atomic': 'true' },
    });
    const scheduleControls = [title, date, start, endDate, end, internal, external];
    const clearControlValidation = (control) => {
      control.removeAttribute('aria-invalid');
      if (control.getAttribute('aria-describedby') === status.id) {
        control.removeAttribute('aria-describedby');
      }
    };
    const showControlValidation = (control, message = t('production.employee.validation')) => {
      control.setAttribute('aria-invalid', 'true');
      control.setAttribute('aria-describedby', status.id);
      status.className = 'error-box';
      status.textContent = message;
      control.focus();
      return false;
    };
    scheduleControls.forEach((control) => {
      control.addEventListener('input', () => clearControlValidation(control));
    });
    cateringParticipants.addEventListener('input', () => clearControlValidation(cateringParticipants));
    const checkAvailability = button(t('production.employee.checkAvailability'));
    const submit = button(t(isResubmission ? 'review.resubmit' : 'production.employee.submit'), { className: 'primary', disabled: true });
    let verifiedAvailabilityKey = null;
    let availabilityState = 'unchecked';
    let availabilityStateKey = null;
    let availabilityGeneration = 0;

    const currentAvailabilityWindow = () => {
      const selectedRoom = rooms.find((entry) => entry.id === room.value);
      const internalParticipants = safeParticipantCount(internal.value);
      const externalParticipants = safeParticipantCount(external.value);
      const totalParticipants = internalParticipants === null || externalParticipants === null
        ? null : internalParticipants + externalParticipants;
      const timeZone = productionRequestRoomTimeZone(selectedRoom, requestCatalog);
      const startsAt = productionUtcInstant(date.value, start.value, timeZone);
      const endsAt = productionUtcInstant(endDate.value, end.value, timeZone);
      if (!roomSupportsParticipants(
        selectedRoom,
        totalParticipants,
        requestCatalog.bookingPolicy?.rules?.maximumParticipants,
      )
        || !startsAt || !endsAt || Date.parse(endsAt) <= Date.parse(startsAt)) return null;
      return Object.freeze({ roomId: selectedRoom.id, startsAt, endsAt });
    };
    const availabilityKey = (window) => window
      ? `${window.roomId}|${window.startsAt}|${window.endsAt}`
      : null;
    const isAvailabilityVerified = (window = currentAvailabilityWindow()) => {
      const key = availabilityKey(window);
      return verifiedAvailabilityKey !== null && key !== null && key === verifiedAvailabilityKey;
    };
    const invalidateAvailability = () => {
      availabilityGeneration += 1;
      verifiedAvailabilityKey = null;
      availabilityState = 'unchecked';
      availabilityStateKey = availabilityKey(currentAvailabilityWindow());
      checkAvailability.disabled = false;
      submit.disabled = true;
      status.className = 'muted';
      status.textContent = t(roomSelectionWasCleared
        ? 'production.employee.roomSelectionCleared'
        : 'production.employee.availabilityRequired');
      roomSelectionWasCleared = false;
      roomSelectionPanel.removeAttribute('aria-invalid');
      roomSelectionPanel.removeAttribute('aria-describedby');
      renderRoomControls();
      if (actions?.isConnected) renderActiveStep();
    };
    let previousStartDate = date.value;
    date.addEventListener('input', () => {
      if (!endDate.value || endDate.value === previousStartDate) endDate.value = date.value;
      previousStartDate = date.value;
    });
    [room, date, endDate, start, end, internal, external]
      .forEach((control) => control.addEventListener('input', invalidateAvailability));
    room.addEventListener('change', () => {
      renderServiceControls();
      renderCateringControls();
    });

    const stepLabels = [
      'request.step.schedule',
      'request.step.room',
      'request.step.services',
      'request.step.catering',
      'request.step.costs',
      'request.step.review',
    ];
    const participantTotal = el('section', {
      className: 'participant-total',
      attrs: { 'aria-live': 'polite' },
    });
    const updateParticipantTotal = () => {
      const count = (safeParticipantCount(internal.value) || 0)
        + (safeParticipantCount(external.value) || 0);
      clear(participantTotal);
      participantTotal.append(
        el('span', { text: t('schedule.total') }),
        el('strong', { text: String(count) }),
        el('small', { text: t('schedule.totalHint') }),
      );
    };
    internal.addEventListener('input', updateParticipantTotal);
    external.addEventListener('input', updateParticipantTotal);
    updateParticipantTotal();

    const scheduleGrid = el('div', { className: 'form-grid two' }, [
      field({ id: 'productionTitle', label: t('schedule.title'), control: title, required: true }),
      field({ id: 'productionDate', label: t('schedule.date'), control: date, required: true }),
      field({ id: 'productionStart', label: t('production.employee.start'), control: start, required: true }),
      field({ id: 'productionEndDate', label: t('production.employee.endDate'), control: endDate, required: true }),
      field({ id: 'productionEnd', label: t('production.employee.end'), control: end, required: true }),
      field({ id: 'productionInternal', label: t('production.employee.internal'), control: internal, required: true }),
      field({ id: 'productionExternal', label: t('production.employee.external'), control: external, required: true }),
      participantTotal,
    ]);
    const panels = [
      el('section', { className: 'card wizard-card', dataset: { stepPanel: '1' } }, [
        el('div', { className: 'section-heading' }, [
          el('div', {}, [el('h2', { text: t('schedule.heading'), attrs: { tabindex: '-1' } }), el('p', { text: t('schedule.desc') })]),
        ]),
        scheduleGrid,
        field({
          id: 'productionSpecial', label: t('schedule.special'), control: specialRequirements,
          hint: t('schedule.specialHint'), optional: true,
        }),
      ]),
      el('section', { className: 'card wizard-card', dataset: { stepPanel: '2' } }, [
        el('div', { className: 'section-heading' }, [
          el('div', {}, [
            el('h2', {
              text: t('production.employee.roomOptionsHeading'),
              attrs: { tabindex: '-1' },
            }),
            el('p', { text: t('production.employee.roomOptionsDescription') }),
          ]),
        ]),
        room,
        roomSelectionPanel,
        el('aside', {
          className: 'info-box',
          attrs: { role: 'note' },
          text: t('production.employee.roomAvailabilityInstruction'),
        }),
      ]),
      el('section', { className: 'card wizard-card', dataset: { stepPanel: '3' } }, [
        el('div', { className: 'section-heading' }, [
          el('div', {}, [el('h2', { text: t('services.heading'), attrs: { tabindex: '-1' } }), el('p', { text: t('services.desc') })]),
        ]),
        servicePanel,
        equipmentPanel,
      ]),
      el('section', { className: 'card wizard-card', dataset: { stepPanel: '4' } }, [
        cateringPanel,
        field({ id: 'productionDietary', label: t('catering.dietary'), control: dietaryRequirements }),
      ]),
      el('section', { className: 'card wizard-card', dataset: { stepPanel: '5' } }, [
        el('div', { className: 'section-heading' }, [
          el('div', {}, [el('h2', { text: t('cost.heading'), attrs: { tabindex: '-1' } }), el('p', { text: t('cost.desc') })]),
        ]),
        allocationPanel,
      ]),
      el('section', { className: 'card wizard-card', dataset: { stepPanel: '6' } }),
    ];
    const stepper = el('nav', { className: 'stepper', attrs: { 'aria-label': t('a11y.steps') } });
    const stepperList = el('ol');
    const stepControls = stepLabels.map((key, index) => {
      const number = index + 1;
      const control = button(`${number}. ${t(key)}`, {
        className: 'step',
        attrs: { 'aria-label': t('a11y.step', { step: number, label: t(key) }) },
      });
      stepperList.appendChild(el('li', {}, [control]));
      return control;
    });
    stepper.appendChild(stepperList);
    const mobileProgress = el('section', {
      className: 'ux-mobile-progress',
      dataset: { uxMobileProgress: 'true' },
      attrs: { role: 'group' },
    });
    const actionStatus = el('div', {}, [
      status,
      el('span', { id: 'draftStatus', className: 'draft-status', attrs: { role: 'status', 'aria-live': 'polite' } }),
    ]);
    const actions = el('footer', { className: 'wizard-actions' });
    let activeStep = restoredDraft?.activeStep || 1;

    const renderReview = () => {
      const review = panels[5];
      clear(review);
      const selectedRoom = rooms.find((entry) => entry.id === room.value);
      const window = currentAvailabilityWindow();
      const timeZone = productionRequestRoomTimeZone(selectedRoom, requestCatalog);
      const schedule = window ? t('production.employee.reviewSchedule', {
        start: formatProductionDateTime(window.startsAt, { locale: locale(), timeZone }),
        end: formatProductionDateTime(window.endsAt, { locale: locale(), timeZone }),
      }) : '';
      const model = buildServerRequestReview({
        catalog: requestCatalog,
        roomId: room.value,
        internalParticipants: internal.value,
        externalParticipants: external.value,
        serviceIds: [...selectedServices],
        equipmentIds: [...selectedEquipment],
        cateringParticipantCount: cateringParticipants.value,
        packageSelection,
        itemQuantities,
        allocations: allocationRows,
        dietaryRequirements: dietaryRequirements.value,
        specialRequirements: specialRequirements.value,
      });
      const none = t('common.none');
      const joinedNames = (entries) => entries.map((entry) => entry.name).join(' · ') || none;
      const cateringPackage = model.catering.packageSelection
        ? `${model.catering.packageSelection.package.name} · ${model.catering.packageSelection.variant.name}`
        : t('catering.noPackage');
      const cateringItems = model.catering.items.map((entry) => (
        `${entry.item.name} × ${formatNumber(entry.quantity)}${entry.includedByPackage
          ? ` · ${t('production.employee.cateringIncludedByPackage')}` : ''}`
      )).join(' · ') || t('catering.noItems');
      const includedItems = model.catering.packageSelection?.includedItems
        .map((entry) => entry.name).join(' · ') || none;
      const allocationText = model.allocations.map((entry) => (
        `${entry.costCenter.code} · ${entry.costCenter.name}: ${formatNumber(entry.percentage / 100, {
          style: 'percent', maximumFractionDigits: 2,
        })}`
      )).join(' · ') || none;
      const previewMoney = (amountMinor) => formatMoney(
        amountMinor / 100,
        model.price.currency,
      );
      const reviewGrid = el('div', { className: 'review-grid' });
      const reviewCard = (heading, rows, targetStep, section) => {
        const edit = button(t('review.edit'), { className: 'ux-review-edit' });
        edit.setAttribute('aria-label', t('review.editAria', { section: heading }));
        edit.addEventListener('click', () => moveToStep(targetStep));
        return el('article', {
          className: 'review-card',
          dataset: { reviewSection: section },
        }, [
          el('div', { className: 'ux-review-card-header' }, [el('h3', { text: heading }), edit]),
          el('dl', { className: 'details-list review-details' }, rows.flatMap(([term, value]) => [
            el('dt', { text: term }),
            el('dd', { text: value || none }),
          ])),
        ]);
      };
      const priceRows = model.price ? [
        [t('cost.room'), previewMoney(model.price.breakdown.roomMinor)],
        [t('review.services'), previewMoney(model.price.breakdown.servicesMinor)],
        [t('production.employee.equipmentHeading'), previewMoney(model.price.breakdown.equipmentMinor)],
        [t('catering.package'), previewMoney(model.price.breakdown.cateringPackageMinor)],
        [t('catering.items'), previewMoney(model.price.breakdown.cateringItemsMinor)],
        [t('review.total'), previewMoney(model.price.totalMinor)],
      ] : [[t('review.total'), t('production.employee.reviewPriceUnavailable')]];
      reviewGrid.append(
        reviewCard(t('production.employee.reviewEventParticipants'), [
          [t('schedule.title'), title.value.trim()],
          [t('review.schedule'), schedule],
          [t('production.employee.internal'), formatNumber(model.participants.internal)],
          [t('production.employee.external'), formatNumber(model.participants.external)],
          [t('schedule.total'), formatNumber(model.participants.total)],
          [t('review.special'), model.specialRequirements || none],
        ], 1, 'event'),
        reviewCard(t('review.room'), [
          [t('production.employee.room'), roomLabel(model.room || {})],
          [t('production.employee.roomFacilities'), joinedNames(
            (model.room?.equipment || []).map((name) => ({ name })),
          )],
        ], 2, 'room'),
        reviewCard(t('production.employee.reviewServicesEquipment'), [
          [t('review.services'), joinedNames(model.services)],
          [t('production.employee.equipmentHeading'), joinedNames(model.equipment)],
        ], 3, 'services-equipment'),
        reviewCard(t('review.catering'), [
          [t('catering.package'), cateringPackage],
          [t('catering.people'), formatNumber(model.catering.participantCount)],
          [t('production.employee.cateringIncludedItemsLabel'), includedItems],
          [t('catering.items'), cateringItems],
          [t('catering.dietary'), model.dietaryRequirements || t('catering.noDietary')],
        ], 4, 'catering'),
        reviewCard(t('review.costs'), [
          [t('cost.allocations'), allocationText],
        ], 5, 'allocations'),
        reviewCard(t('production.employee.reviewPriceBreakdown'), priceRows, 5, 'price'),
      );
      review.append(
        el('div', { className: 'section-heading' }, [
          el('div', {}, [el('h2', { text: t('review.heading'), attrs: { tabindex: '-1' } }), el('p', { text: t('review.desc') })]),
        ]),
        reviewGrid,
        el('p', { className: 'muted review-price-note', text: t('cost.note') }),
        el('aside', { className: 'tentative-box', attrs: { role: 'note' } }, [
          el('strong', { text: t('review.provisional') }),
          el('p', { text: t('review.provisionalText') }),
        ]),
      );
    };

    const renderActiveStep = () => {
      panels.forEach((panel, index) => { panel.hidden = index + 1 !== activeStep; });
      stepControls.forEach((control, index) => {
        const number = index + 1;
        control.className = `step${number === activeStep ? ' active' : ''}${number < activeStep ? ' done' : ''}`;
        control.disabled = number > activeStep;
        if (number === activeStep) control.setAttribute('aria-current', 'step');
        else control.removeAttribute('aria-current');
      });
      clear(mobileProgress);
      const progressLabel = t('a11y.step', { step: activeStep, label: t(stepLabels[activeStep - 1]) });
      mobileProgress.setAttribute('aria-label', progressLabel);
      mobileProgress.append(
        el('strong', { text: progressLabel }),
        el('span', { className: 'ux-progress-dots' }, stepLabels.map((_, index) => el('span', {
          className: `ux-progress-dot${index + 1 === activeStep ? ' active' : ''}${index + 1 < activeStep ? ' done' : ''}`,
        }))),
      );
      if (activeStep === 6) renderReview();
      clear(actions);
      if (activeStep > 1) {
        const back = button(t('common.back'));
        back.addEventListener('click', () => moveToStep(activeStep - 1));
        actions.appendChild(back);
      }
      actions.appendChild(el('span', { className: 'spacer' }));
      if (activeStep === 2) actions.appendChild(checkAvailability);
      if (activeStep < 6) {
        const next = button(t('common.next'), { className: 'primary' });
        next.disabled = activeStep === 2 && !isAvailabilityVerified();
        next.addEventListener('click', () => moveToStep(activeStep + 1));
        actions.appendChild(next);
      } else actions.appendChild(submit);
    };

    const focusStep = () => requestAnimationFrame(() => {
      panels[activeStep - 1].querySelector('h2, input, select, textarea, button')?.focus();
    });
    const validateStep = (stepNumber) => {
      if (stepNumber === 1) {
        scheduleControls.forEach(clearControlValidation);
        const internalParticipants = safeParticipantCount(internal.value);
        const externalParticipants = safeParticipantCount(external.value);
        const participantCount = internalParticipants === null || externalParticipants === null
          ? null : internalParticipants + externalParticipants;
        const startsAtLocal = `${date.value}T${start.value}`;
        const endsAtLocal = `${endDate.value}T${end.value}`;
        const invalidControl = [title, date, start, endDate, end]
          .find((control) => !control.value || !control.checkValidity())
          || (!title.value.trim() ? title : null)
          || (internalParticipants === null ? internal : null)
          || (externalParticipants === null ? external : null)
          || (participantCount < 1 || participantCount > MAX_PARTICIPANTS ? internal : null)
          || (endsAtLocal <= startsAtLocal ? end : null);
        if (invalidControl) return showControlValidation(invalidControl);
      }
      if (stepNumber === 2 && !isAvailabilityVerified()) {
        roomSelectionPanel.setAttribute('aria-invalid', 'true');
        roomSelectionPanel.setAttribute('aria-describedby', status.id);
        status.className = 'error-box';
        status.textContent = t('production.employee.availabilityRequired');
        checkAvailability.focus();
        return false;
      }
      if (stepNumber === 4) {
        clearControlValidation(cateringParticipants);
        try {
          normalizeCateringEditorDraft({
            participantCount: cateringParticipants.value,
            packageSelection,
            itemQuantities,
            totalParticipants: (safeParticipantCount(internal.value) || 0)
              + (safeParticipantCount(external.value) || 0),
            catalog: requestCatalog,
            roomId: room.value,
          });
        } catch {
          return showControlValidation(cateringParticipants);
        }
      }
      if (stepNumber === 5) {
        try {
          normalizeAllocationEditorDraft({ allocations: allocationRows, catalog: requestCatalog });
        } catch {
          const invalidControl = allocationPanel.querySelector('select, input, button');
          return invalidControl ? showControlValidation(invalidControl) : false;
        }
      }
      return true;
    };
    function moveToStep(targetStep) {
      if (targetStep > activeStep && !validateStep(activeStep)) return;
      activeStep = Math.max(1, Math.min(6, targetStep));
      status.className = 'muted';
      if (activeStep !== 2) status.textContent = '';
      renderActiveStep();
      focusStep();
      scheduleDraftSave({ immediate: true });
    }
    stepControls.forEach((control, index) => {
      control.addEventListener('click', () => moveToStep(index + 1));
    });
    root.append(mobileProgress, stepper, ...panels, actionStatus, actions);
    renderRoomControls();
    renderActiveStep();
    invalidateAvailability();

    if (restoredDraft) showToast(t('draft.restored'));
    let draftTimer = null;
    let draftDirty = false;
    if (!sourceRequest && draftStore) {
      const saveDraft = () => {
        draftTimer = null;
        if (!draftDirty || !isCurrentEditor()) return;
        draftStore.save({
          roomId: room.value,
          startDate: date.value,
          endDate: endDate.value,
          startTime: start.value,
          endTime: end.value,
          title: title.value,
          internalParticipants: internal.value,
          externalParticipants: external.value,
          serviceIds: [...selectedServices].sort(),
          equipmentIds: [...selectedEquipment].sort(),
          cateringParticipants: cateringParticipants.value,
          packageSelection,
          itemQuantities,
          allocations: allocationRows,
          dietaryRequirements: dietaryRequirements.value,
          specialRequirements: specialRequirements.value,
          activeStep,
        });
      };
      scheduleDraftSave = (options = {}) => {
        draftDirty = true;
        if (draftTimer) clearTimeout(draftTimer);
        if (options?.immediate === true) {
          saveDraft();
          return;
        }
        draftTimer = setTimeout(saveDraft, 400);
      };
      root.addEventListener('input', scheduleDraftSave);
      root.addEventListener('change', scheduleDraftSave);
    }

    checkAvailability.addEventListener('click', async () => {
      if (!isCurrentEditor()) return;
      const selectedRoom = rooms.find((entry) => entry.id === room.value);
      if (selectedRoom && !isProductionTimeZone(productionRequestRoomTimeZone(selectedRoom, requestCatalog))) {
        status.className = 'error-box';
        status.textContent = t('production.employee.timeZoneUnavailable');
        return;
      }
      const window = currentAvailabilityWindow();
      if (!window || Date.parse(window.startsAt) <= Date.now()) {
        status.className = 'error-box';
        status.textContent = t('production.employee.validation');
        return;
      }
      const availabilityRequestGeneration = ++availabilityGeneration;
      const key = availabilityKey(window);
      verifiedAvailabilityKey = null;
      availabilityState = 'checking';
      availabilityStateKey = key;
      submit.disabled = true;
      checkAvailability.disabled = true;
      status.className = 'muted';
      status.textContent = t('production.employee.checkingAvailability');
      renderRoomControls();
      try {
        const result = await persistence.checkRoomAvailability(window, isResubmission ? sourceRequest.id : null);
        if (!isCurrentEditor()
          || availabilityRequestGeneration !== availabilityGeneration
          || key !== availabilityKey(currentAvailabilityWindow())) return;
        if (!result.available) {
          availabilityState = 'occupied';
          status.className = 'error-box';
          status.textContent = t('production.employee.availabilityOccupied');
          renderRoomControls();
          return;
        }
        verifiedAvailabilityKey = key;
        availabilityState = 'available';
        submit.disabled = !resubmissionVersionCurrent;
        status.className = 'info-box';
        status.textContent = t('production.employee.availabilityAvailable');
        roomSelectionPanel.removeAttribute('aria-invalid');
        renderRoomControls();
        renderActiveStep();
        requestAnimationFrame(() => checkAvailability.focus());
      } catch (error) {
        if (authorityFailureCode(error)) {
          invalidateEditorAuthority(error);
          return;
        }
        if (!isCurrentEditor() || availabilityRequestGeneration !== availabilityGeneration) return;
        availabilityState = 'error';
        status.className = 'error-box';
        status.textContent = t('production.employee.availabilityError');
        renderRoomControls();
      } finally {
        if (isCurrentEditor() && availabilityRequestGeneration === availabilityGeneration) {
          checkAvailability.disabled = false;
        }
      }
    });

    submit.addEventListener('click', async () => {
      if (!isCurrentEditor()) return;
      const window = currentAvailabilityWindow();
      const internalParticipants = safeParticipantCount(internal.value);
      const externalParticipants = safeParticipantCount(external.value);
      const total = Number(internalParticipants) + Number(externalParticipants);
      const normalizedTitle = title.value.trim();
      const valid = window && isAvailabilityVerified(window) && resubmissionVersionCurrent
        && Date.parse(window.startsAt) > Date.now() && internalParticipants !== null
        && externalParticipants !== null && total >= 1 && total <= MAX_PARTICIPANTS
        && normalizedTitle.length >= 1 && normalizedTitle.length <= 160;
      if (!valid) {
        status.textContent = window && !isAvailabilityVerified()
          ? t('production.employee.availabilityRequired')
          : t('production.employee.validation');
        status.className = 'error-box';
        submit.disabled = true;
        return;
      }
      let catering;
      let allocations;
      try {
        catering = normalizeCateringEditorDraft({
          participantCount: cateringParticipants.value,
          packageSelection,
          itemQuantities,
          totalParticipants: total,
          catalog: requestCatalog,
          roomId: window.roomId,
        });
        allocations = normalizeAllocationEditorDraft({
          allocations: allocationRows,
          catalog: requestCatalog,
        });
      } catch {
        status.className = 'error-box';
        status.textContent = t('production.employee.validation');
        return;
      }
      submit.disabled = true;
      status.className = 'muted';
      status.textContent = t('production.employee.submitting');
      try {
        const overrides = {
          title: normalizedTitle, roomId: window.roomId,
          startsAt: window.startsAt,
          endsAt: window.endsAt,
          internalParticipants,
          externalParticipants,
          serviceIds: [...selectedServices].sort(),
          ...(Array.isArray(requestCatalog.equipment)
            ? { equipmentIds: [...selectedEquipment].sort() } : {}),
          catering,
          dietaryRequirements: dietaryRequirements.value.trim() || null,
          specialRequirements: specialRequirements.value.trim() || null,
          allocations,
        };
        let submittedRequest;
        if (isResubmission) {
          submittedRequest = await persistence.resubmitRequest(
            sourceRequest.id,
            sourceRequest.version,
            compositionDraft(sourceRequest, requestCatalog, overrides),
          );
        } else {
          submittedRequest = await persistence.createRequest(compositionDraft(
            sourceRequest, requestCatalog, overrides,
          ));
        }
        if (!isCurrentEditor()) return;
        submissionNotice = Object.freeze({
          requestId: submittedRequest.id,
          type: isResubmission ? 'resubmitted' : 'sent',
        });
        status.textContent = t('production.employee.submitted');
        showToast(t('production.employee.submitted'));
        if (!sourceRequest && draftStore) {
          draftDirty = false;
          if (draftTimer) clearTimeout(draftTimer);
          draftTimer = null;
          draftStore.clear();
        }
        verifiedAvailabilityKey = null;
        if (typeof onNavigate === 'function') onNavigate('requests');
      } catch (error) {
        if (authorityFailureCode(error)) {
          invalidateEditorAuthority(error);
          return;
        }
        if (!isCurrentEditor()) return;
        invalidateAvailability();
        status.className = 'error-box';
        status.textContent = errorMessage(error);
        if (error?.cause?.code === 'HTTP_409') {
          if (isResubmission) {
            resubmissionVersionCurrent = false;
            try {
              const requests = await persistence.listRequests();
              if (!isCurrentEditor()) return;
              const currentRequest = requests.find((entry) => entry.id === sourceRequest.id);
              if (currentRequest?.status === 'Change Requested'
                  && Number.isSafeInteger(currentRequest.version)
                  && currentRequest.version > sourceRequest.version) {
                sourceRequest = currentRequest;
                resubmissionVersionCurrent = true;
              }
            } catch (refreshError) {
              if (authorityFailureCode(refreshError)) {
                invalidateEditorAuthority(refreshError);
                return;
              }
              if (!isCurrentEditor()) return;
            }
          }
          activeStep = 2;
          renderActiveStep();
          focusStep();
        }
      } finally {
        if (isCurrentEditor()) {
          submit.disabled = !isAvailabilityVerified() || !resubmissionVersionCurrent;
        }
      }
    });
  }

  async function renderRequests() {
    clear(appRoot);
    setPageHeading(t('production.employee.requestsTitle'), t('production.employee.requestsSubtitle'));
    const root = el('section', { className: 'card' }, [
      el('p', { className: 'muted', text: t('production.common.loading') }),
    ]);
    appRoot.appendChild(root);
    let refreshGeneration = 0;
    let hasCommittedProjection = false;
    let committedProjectionGeneration = 0;
    let interactiveProjectionGeneration = 0;
    let authorityProjectionInvalid = false;
    let pendingSubmissionFocusRequestId = null;
    let requestDisplay = 'list';
    let calendarReference = null;
    const isActiveSurface = () => (
      root.isConnected
      && document.documentElement.dataset.sessionLocked !== 'true'
      && !authorityProjectionInvalid
    );
    const isCurrent = (generation) => (
      generation === refreshGeneration
      && isActiveSurface()
    );
    const isInteractiveProjection = (generation) => (
      generation === interactiveProjectionGeneration
      && isActiveSurface()
    );
    const invalidateAuthorityProjection = (error) => {
      authorityProjectionInvalid = true;
      refreshGeneration += 1;
      closeDetachedPrintWindows();
      requestMutations.clear();
      hasCommittedProjection = false;
      committedProjectionGeneration = 0;
      interactiveProjectionGeneration = 0;
      pendingSubmissionFocusRequestId = null;
      authoritySurfaces.closeAll();
      if (onAuthorityFailure?.(error)) return true;
      if (!root.isConnected) return false;
      clear(root);
      root.removeAttribute('aria-busy');
      const status = el('p', {
        className: 'error-box',
        text: errorMessage(error),
        attrs: { tabindex: '-1', role: 'status' },
      });
      root.appendChild(status);
      requestAnimationFrame(() => {
        if (authorityProjectionInvalid && root.isConnected) status.focus();
      });
      return true;
    };
    const restorePendingSubmissionFocus = (generation) => {
      const requestId = pendingSubmissionFocusRequestId;
      if (!requestId) return;
      requestAnimationFrame(() => {
        if (!isCurrent(generation) || pendingSubmissionFocusRequestId !== requestId) return;
        const activeElement = document.activeElement;
        if (activeElement !== document.body && activeElement !== document.documentElement) {
          pendingSubmissionFocusRequestId = null;
          return;
        }
        const target = [...root.querySelectorAll('[data-production-request-id]')]
          .find((card) => card.dataset.productionRequestId === requestId)
          || root.querySelector(':scope > .error-box')
          || document.getElementById('viewTitle');
        pendingSubmissionFocusRequestId = null;
        target?.focus();
      });
    };
    const renderSubmissionNotice = (generation) => {
      const currentNotice = submissionNotice;
      if (!currentNotice) return;
      const notice = el('aside', {
        className: 'ux-submission-success',
        dataset: { uxSubmissionSuccess: 'true' },
        attrs: { role: 'status', tabindex: '-1' },
      });
      const copy = el('div', {}, [
        el('strong', { text: t(currentNotice.type === 'resubmitted'
          ? 'submission.resubmittedTitle' : 'submission.sentTitle') }),
        el('p', { text: t(currentNotice.type === 'resubmitted'
          ? 'submission.resubmittedText' : 'submission.sentText') }),
      ]);
      const close = button(t('common.close'));
      close.addEventListener('click', () => {
        if (submissionNotice === currentNotice) submissionNotice = null;
        notice.remove();
        if (isInteractiveProjection(generation)) {
          [...root.querySelectorAll('[data-production-request-id]')]
            .find((card) => card.dataset.productionRequestId === currentNotice.requestId)
            ?.focus();
        } else if (isCurrent(generation)) {
          root.querySelector('.error-box')?.focus();
        } else if (isActiveSurface() && interactiveProjectionGeneration === 0) {
          pendingSubmissionFocusRequestId = currentNotice.requestId;
        }
      });
      notice.append(copy, close);
      root.prepend(notice);
      requestAnimationFrame(() => {
        if (isCurrent(generation) && notice.isConnected) notice.focus();
      });
    };

    async function refresh(focusRequestId = null) {
      const generation = ++refreshGeneration;
      if (!isCurrent(generation)) return;
      closeDetachedPrintWindows();
      interactiveProjectionGeneration = 0;
      if (hasCommittedProjection) {
        root.setAttribute('aria-busy', 'true');
      } else {
        clear(root);
        root.appendChild(el('p', { className: 'muted', text: t('production.common.loading') }));
      }
      try {
        const [nextCatalog, requests] = await Promise.all([
          persistence.loadCatalog(), persistence.listRequests(),
        ]);
        if (!isCurrent(generation)) return;
        const [changes, roomContexts] = await Promise.all([
          loadOpenBookingChanges(requests, persistence),
          loadMissingRequestRoomContexts(requests, nextCatalog, persistence),
        ]);
        if (!isCurrent(generation)) return;
        catalog = nextCatalog;
        authorityProjectionInvalid = false;
        clear(root);
        root.removeAttribute('aria-busy');
        hasCommittedProjection = true;
        committedProjectionGeneration = generation;
        interactiveProjectionGeneration = generation;
        const refreshButton = button(t('production.common.refresh'));
        refreshButton.addEventListener('click', () => { void refresh(); });
        if (!requests.length) {
          root.appendChild(el('div', { className: 'button-row' }, [refreshButton]));
          root.appendChild(el('p', { className: 'info-box', text: t('requests.none') }));
          renderSubmissionNotice(generation);
          restorePendingSubmissionFocus(generation);
          return;
        }
        if (focusRequestId) requestDisplay = 'list';
        const calendarProjection = projectServerRequestCalendar(
          requests, nextCatalog, roomContexts,
        );
        calendarReference ||= initialServerRequestCalendarMonth(calendarProjection);
        const listButton = button(t('requests.list'), {
          attrs: { 'aria-pressed': String(requestDisplay === 'list') },
        });
        const calendarButton = button(t('requests.calendar'), {
          attrs: { 'aria-pressed': String(requestDisplay === 'calendar') },
        });
        const displayControls = el('div', {
          className: 'segmented',
          attrs: { role: 'group', 'aria-label': t('production.employee.requestDisplay') },
        }, [listButton, calendarButton]);
        root.appendChild(el('section', { className: 'toolbar' }, [refreshButton, displayControls]));
        const listSection = el('section', {
          className: 'request-list',
          attrs: { 'aria-label': t('requests.list') },
        });
        const calendarHost = el('div');
        root.append(listSection, calendarHost);
        const showDisplay = (nextDisplay) => {
          requestDisplay = nextDisplay;
          const showCalendar = requestDisplay === 'calendar';
          listButton.setAttribute('aria-pressed', String(!showCalendar));
          calendarButton.setAttribute('aria-pressed', String(showCalendar));
          listSection.hidden = showCalendar;
          calendarHost.hidden = !showCalendar;
          if (!showCalendar) return;
          calendarHost.replaceChildren(renderServerRequestCalendar({
            projection: calendarProjection,
            reference: calendarReference,
            onReferenceChange: (nextReference) => {
              calendarReference = nextReference;
              showDisplay('calendar');
            },
            onSelect: (target) => {
              showDisplay('list');
              requestAnimationFrame(() => {
                if (!isCurrent(generation)) return;
                [...listSection.querySelectorAll('[data-production-request-id]')]
                  .find((candidate) => candidate.dataset.productionRequestId === target.id)
                  ?.focus();
              });
            },
          }));
        };
        listButton.addEventListener('click', () => showDisplay('list'));
        calendarButton.addEventListener('click', () => showDisplay('calendar'));
        for (const [index, request] of requests.entries()) {
          let card = null;
          const isActiveCard = () => isActiveSurface() && card?.isConnected;
          const isCurrentCard = () => (
            isInteractiveProjection(generation) && card?.isConnected
          );
          const withGuestRoomContext = async (target, action, { onAbort = null } = {}) => {
            try {
              const prepared = await loadCoherentRequestRoomContext(
                target, nextCatalog, persistence, { projection: 'guest' },
              );
              if (!isCurrentCard()) {
                onAbort?.();
                return;
              }
              if (!prepared) {
                onAbort?.();
                showToast(t('production.error.conflict'));
                return;
              }
              action(target, prepared.currentRoomContext);
            } catch (caught) {
              onAbort?.();
              if (authorityFailureCode(caught)) invalidateAuthorityProjection(caught);
              else if (isCurrentCard()) showToast(errorMessage(caught));
            }
          };
          const reconcileMutation = async (tracked, caught = null) => {
            if (authorityFailureCode(caught)) {
              invalidateAuthorityProjection(caught);
              return;
            }
            if (!isActiveSurface() || tracked.reconciled) return;
            tracked.reconciled = true;
            if (requestMutations.get(request.id) === tracked) {
              requestMutations.delete(request.id);
            }
            if (!tracked.notified) {
              tracked.notified = true;
              showToast(caught
                ? errorMessage(caught)
                : t('production.employee.cancelled'));
            }
            await refresh(request.id);
          };
          card = requestCard(request, nextCatalog, roomContexts[index], changes[index], {
            mutationInFlight: () => requestMutations.has(request.id),
            onCancelConfirmation: (target, confirmAction) => {
              authoritySurfaces.track(openEmployeeCancellationConfirmation(target, confirmAction));
            },
            onCancel: async (requestId) => {
              const mutation = beginRequestMutation(requestId, 'cancel', () => (
                persistence.transitionRequest(requestId, { transition: 'cancel' }, request)
              ));
              if (!mutation) return;
              try {
                await mutation.promise;
                await reconcileMutation(mutation);
              } catch (error) {
                await reconcileMutation(mutation, error);
              }
            },
            onChange: async (target) => {
              const interaction = reserveRequestMutation(target.id, 'proposal');
              if (!interaction) return;
              const interactionGeneration = refreshGeneration;
              const isCurrentInteraction = () => (
                interactionGeneration === refreshGeneration && isCurrentCard()
              );
              const releaseProposal = async ({ reconcile = true } = {}) => {
                if (requestMutations.get(target.id) !== interaction) return false;
                requestMutations.delete(target.id);
                if (reconcile && typeof activeRequestsRefresh === 'function') {
                  await activeRequestsRefresh(target.id);
                }
                return true;
              };
              try {
                const prepared = await loadCoherentRequestRoomContext(
                  target, nextCatalog, persistence,
                );
                if (!isCurrentInteraction()) {
                  await releaseProposal();
                  return;
                }
                if (!prepared) {
                  showToast(t('production.error.conflict'));
                  await releaseProposal();
                  return;
                }
                const proposalPersistence = Object.freeze({
                  proposeBookingChange: (...args) => {
                    if (requestMutations.get(target.id) !== interaction) {
                      return Promise.reject(new TypeError('PRODUCTION_REQUEST_MUTATION_STALE'));
                    }
                    interaction.promise = Promise.resolve()
                      .then(() => persistence.proposeBookingChange(...args));
                    return interaction.promise;
                  },
                });
                const dialog = openProductionBookingChangeDialog({
                  request: target,
                  catalog: prepared.catalog,
                  currentRoomContext: prepared.currentRoomContext,
                  persistence: proposalPersistence,
                  refresh: async (requestId) => {
                    if (await releaseProposal({ reconcile: false })
                      && typeof activeRequestsRefresh === 'function') {
                      await activeRequestsRefresh(requestId);
                    }
                  },
                  errorMessage,
                  onAuthorityFailure: invalidateAuthorityProjection,
                });
                if (!dialog) {
                  await releaseProposal();
                  return;
                }
                authoritySurfaces.track(dialog);
                dialog.addEventListener('close', () => {
                  void releaseProposal();
                }, { once: true });
              } catch (caught) {
                const shouldNotify = isCurrentInteraction();
                await releaseProposal({ reconcile: !authorityFailureCode(caught) });
                if (authorityFailureCode(caught)) invalidateAuthorityProjection(caught);
                else if (shouldNotify) showToast(errorMessage(caught));
              }
            },
            onGuestInfo: (target) => withGuestRoomContext(target, openGuestInfo),
            onHistory: async (target, control) => {
              const interactionGeneration = refreshGeneration;
              const isCurrentInteraction = () => (
                interactionGeneration === refreshGeneration && isCurrentCard()
              );
              control.disabled = true;
              try {
                const entries = await persistence.loadRequestHistory(target.id);
                if (!isCurrentInteraction() || !control.isConnected) return;
                const content = renderServerRequestHistory(entries);
                const close = button(t('common.close'));
                const dialog = openDialog({
                  title: t('production.manager.historyTab'), content, actions: [close],
                  labelledById: `employeeHistory-${target.id}`,
                });
                authoritySurfaces.track(dialog);
                dialog.addEventListener('close', () => {
                  if (isCurrentInteraction() && control.isConnected) control.focus();
                }, { once: true });
                close.addEventListener('click', () => dialog.close());
              } catch (error) {
                if (authorityFailureCode(error)) invalidateAuthorityProjection(error);
                else if (isCurrentInteraction()) showToast(errorMessage(error));
              } finally {
                if (isActiveCard() && control.isConnected) control.disabled = false;
              }
            },
            onPrint: (target) => {
              const printWindow = openDetachedPrintWindow();
              if (!printWindow) {
                showToast(t('guest.popupBlocked'));
                return undefined;
              }
              return withGuestRoomContext(
                target,
                (preparedTarget, currentRoomContext) => {
                  printRequest(preparedTarget, currentRoomContext, printWindow);
                },
                { onAbort: () => closeDetachedPrintWindow(printWindow) },
              );
            },
            onRepeat: (target) => queueRequest(target),
            onResubmit: (target) => queueRequest(target, { resubmit: true }),
          });
          listSection.appendChild(card);
          const activeMutation = requestMutations.get(request.id);
          if (activeMutation?.kind === 'cancel' && activeMutation.promise) {
            activeMutation.promise.then(
              () => { void reconcileMutation(activeMutation); },
              (caught) => { void reconcileMutation(activeMutation, caught); },
            );
          }
        }
        showDisplay(requestDisplay);
        renderSubmissionNotice(generation);
        restorePendingSubmissionFocus(generation);
        if (focusRequestId) {
          requestAnimationFrame(() => {
            if (!isCurrent(generation)) return;
            [...root.querySelectorAll('[data-production-request-id]')]
              .find((card) => card.dataset.productionRequestId === focusRequestId)
              ?.focus();
          });
        }
      } catch (error) {
        const authorityFailure = authorityFailureCode(error) !== null;
        if (authorityFailure) {
          invalidateAuthorityProjection(error);
          return;
        }
        if (generation !== refreshGeneration || !root.isConnected) return;
        if (!isCurrent(generation)) return;
        root.removeAttribute('aria-busy');
        if (hasCommittedProjection && focusRequestId === null) {
          interactiveProjectionGeneration = committedProjectionGeneration;
          showToast(t('production.employee.loadError'));
          restorePendingSubmissionFocus(generation);
          return;
        }
        hasCommittedProjection = false;
        committedProjectionGeneration = 0;
        interactiveProjectionGeneration = 0;
        clear(root);
        root.appendChild(el('p', {
          className: 'error-box',
          text: t('production.employee.loadError'),
          attrs: { tabindex: '-1' },
        }));
        renderSubmissionNotice(generation);
        restorePendingSubmissionFocus(generation);
      }
    }

    activeRequestsRefresh = refresh;
    await refresh();
  }

  return Object.freeze({
    renderRequest,
    renderRequests,
    hasDraft: () => Boolean(draftStore?.has?.()),
    restoreDraft: () => {
      if (typeof onNavigate === 'function') onNavigate('employee');
      else void renderRequest();
    },
  });
}
