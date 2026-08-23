import { REQUEST_STATUS, requestTimeline, totalParticipants } from '../core/domain.js';
import { formatDate, formatDateTime, formatMoney, t } from '../core/i18n.js';
import { button, el } from '../core/ui.js';

function localizedStatus(status) {
  return t(`status.${status}`);
}

export function renderRequestTimeline(request) {
  const section = el('section', { className: 'request-timeline' }, [el('h4', { text: t('timeline.title') })]);
  const list = el('ol');
  const events = requestTimeline(request);
  events.forEach((event) => list.append(el('li', {}, [
    el('strong', { text: t(`timeline.${event.status}`) }),
    el('small', { text: formatDateTime(event.at) }),
    event.note ? el('p', { text: event.note }) : null,
  ])));
  if (![REQUEST_STATUS.CONFIRMED, REQUEST_STATUS.REJECTED, REQUEST_STATUS.CANCELLED, REQUEST_STATUS.CHANGE_REQUESTED].includes(request.status)) {
    list.append(el('li', { attrs: { 'aria-current': 'step' } }, [
      el('strong', { text: t('timeline.pending') }),
      el('small', { text: t('timeline.open') }),
    ]));
  }
  section.appendChild(list);
  return section;
}

export function createRequestCard({
  request,
  manager = false,
  catalog,
  localized,
  onManagerConfirm,
  onManagerReason,
  onDetails,
  onGuestInfo,
  onPrint,
  onEditChange,
  onCancel,
  onRepeat,
}) {
  const room = catalog.rooms.find((entry) => entry.id === request.roomId);
  const card = el('article', { className: `request-card status-${request.status.toLowerCase().replaceAll(' ', '-')}` });
  const header = el('header', { className: 'request-card-header' }, [
    el('div', {}, [
      el('h3', { text: request.title }),
      el('p', { className: 'muted', text: `${request.id} · ${formatDate(request.date)} · ${request.start}–${request.end}` }),
    ]),
    el('span', { className: 'status-badge', text: localizedStatus(request.status) }),
  ]);
  card.appendChild(header);

  const grid = el('dl', { className: 'request-grid' });
  [
    [t('review.room'), localized(room?.name || request.roomId || '')],
    [t('schedule.total'), String(request.participants ?? totalParticipants(request))],
    [t('cost.total'), formatMoney(request.estimatedCost || 0)],
  ].forEach(([term, value]) => grid.append(el('div', {}, [el('dt', { text: term }), el('dd', { text: value })])));
  card.appendChild(grid);

  if (!manager) {
    const guidance = el('aside', {
      className: request.status === REQUEST_STATUS.CHANGE_REQUESTED ? 'state-guidance action-required' : 'state-guidance',
    });
    if ([REQUEST_STATUS.SUBMITTED, REQUEST_STATUS.IN_REVIEW].includes(request.status)) {
      guidance.append(el('strong', { text: t('requests.noAction') }), el('p', { text: t('requests.provisional') }));
    }
    if (request.status === REQUEST_STATUS.CHANGE_REQUESTED) {
      guidance.append(
        el('strong', { text: t('requests.action') }),
        el('p', { text: `${t('requests.changeReason')}: ${request.changeReason || ''}` }),
      );
    }
    if (request.status === REQUEST_STATUS.CONFIRMED) {
      guidance.append(el('strong', { text: localizedStatus(request.status) }), el('p', { text: t('requests.confirmed') }));
    }
    if (request.status === REQUEST_STATUS.REJECTED) {
      guidance.append(
        el('strong', { text: localizedStatus(request.status) }),
        el('p', { text: request.rejectionReason ? `${t('requests.rejectionReason')}: ${request.rejectionReason}` : t('requests.rejectedText') }),
      );
    }
    if (request.status === REQUEST_STATUS.CANCELLED) {
      guidance.append(el('strong', { text: localizedStatus(request.status) }), el('p', { text: t('requests.cancelledText') }));
    }
    if (guidance.childNodes.length) card.appendChild(guidance);
  }

  card.appendChild(renderRequestTimeline(request));
  const actions = el('footer', { className: 'request-actions' });
  if (manager && [REQUEST_STATUS.SUBMITTED, REQUEST_STATUS.IN_REVIEW].includes(request.status)) {
    const confirm = button(t('manager.confirm'), { className: 'primary' });
    confirm.addEventListener('click', () => onManagerConfirm?.(request.id));
    const change = button(t('manager.change'));
    change.addEventListener('click', () => onManagerReason?.(request, 'change'));
    const reject = button(t('manager.reject'), { className: 'danger' });
    reject.addEventListener('click', () => onManagerReason?.(request, 'reject'));
    actions.append(confirm, change, reject);
  }

  if (!manager) {
    const details = button(t('requests.details'));
    details.addEventListener('click', () => onDetails?.(request));
    actions.appendChild(details);
    if (request.status === REQUEST_STATUS.CONFIRMED) {
      const guest = button(t('requests.guest'));
      guest.addEventListener('click', () => onGuestInfo?.(request));
      const pdf = button(t('requests.pdf'));
      pdf.addEventListener('click', () => onPrint?.(request));
      actions.append(guest, pdf);
    }
    if (request.status === REQUEST_STATUS.CHANGE_REQUESTED) {
      const editChange = button(t('requests.editChange'), { className: 'primary' });
      editChange.addEventListener('click', () => onEditChange?.(request));
      actions.appendChild(editChange);
    }
    if ([REQUEST_STATUS.SUBMITTED, REQUEST_STATUS.CONFIRMED, REQUEST_STATUS.CHANGE_REQUESTED].includes(request.status)) {
      const cancel = button(t('requests.cancel'), { className: 'danger' });
      cancel.addEventListener('click', () => onCancel?.(request));
      actions.appendChild(cancel);
    }
    if ([REQUEST_STATUS.REJECTED, REQUEST_STATUS.CANCELLED].includes(request.status)) {
      const repeat = button(
        request.status === REQUEST_STATUS.REJECTED ? t('requests.repeatRejected') : t('requests.repeat'),
        { className: 'primary' },
      );
      repeat.addEventListener('click', () => onRepeat?.(request));
      actions.appendChild(repeat);
    }
  }

  if (actions.childNodes.length) card.appendChild(actions);
  return card;
}
