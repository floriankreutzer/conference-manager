import { formatNumber, locale, t } from '../core/i18n.js';
import { el } from '../core/ui.js';
import { formatProductionDateTime } from '../core/production-time.js';

function money(amountMinor, currency) {
  return new Intl.NumberFormat(locale(), {
    style: 'currency',
    currency,
  }).format(Number(amountMinor || 0) / 100);
}

function joined(values, fallback) {
  return values.filter(Boolean).join(' · ') || fallback;
}

export function productionRequestSummaryFacts(request, {
  roomLabel,
  timeZone,
  includeParticipantBreakdown = false,
} = {}) {
  const participants = Number(request.internalParticipants || 0) + Number(request.externalParticipants || 0);
  const formatTime = (value) => formatProductionDateTime(value, { locale: locale(), timeZone })
    || t('production.common.timeUnavailable');
  const changeStatus = ['pending', 'applying', 'applied', 'rejected', 'superseded'].includes(request.status);
  const rows = [
    { key: 'room', term: t('production.employee.room'), value: roomLabel },
    { key: 'start', term: t('production.employee.start'), value: formatTime(request.startsAt) },
    { key: 'end', term: t('production.employee.end'), value: formatTime(request.endsAt) },
    { key: 'participants', term: t('production.employee.scheduleParticipants'),
      value: t(participants === 1 ? 'production.common.participantOne' : 'production.common.participants', {
        count: formatNumber(participants),
      }),
      detail: includeParticipantBreakdown ? t('production.common.participantBreakdown', {
        internal: formatNumber(request.internalParticipants), external: formatNumber(request.externalParticipants),
      }) : null },
    { key: 'status', term: t('production.common.status'),
      value: t(changeStatus ? `production.bookingChange.status.${request.status}` : `status.${request.status}`) },
  ];
  if (request.pricing) rows.push({
    key: 'total', term: t('review.total'), value: money(request.pricing.totalMinor, request.pricing.currency),
  });
  return rows;
}

export function renderProductionRequestSummary(request, options) {
  return el('dl', { className: 'request-summary-facts' }, productionRequestSummaryFacts(request, options)
    .map(({ key, term, value, detail }) => el('div', { dataset: { requestFact: key } }, [
      el('dt', { text: `${term}: ` }),
      el('dd', { className: key === 'total' ? 'request-total' : '' }, [
        el('span', { text: value }),
        detail ? el('small', { className: 'request-participant-breakdown', text: detail }) : null,
      ]),
    ])));
}

export function productionRequestBusinessDetails(request) {
  const details = request?.details;
  const pricing = request?.pricing;
  const allocations = request?.allocations;
  const none = t('common.none');
  if (!details || !pricing || !allocations) return [];

  const services = joined(
    pricing.services.map((entry) => entry.service.name),
    none,
  );
  const selectedPackage = pricing.catering.packageSelection;
  const cateringPackage = selectedPackage
    ? `${selectedPackage.package.name} · ${selectedPackage.variant.name}`
    : t('catering.noPackage');
  const cateringItems = joined(
    pricing.catering.items.map((entry) => `${entry.item.name} × ${formatNumber(entry.quantity)}`),
    t('catering.noItems'),
  );
  const allocationText = joined(allocations.entries.map((entry) => (
    `${entry.code} · ${entry.name}: ${formatNumber(entry.percentageBasisPoints / 10_000, {
      style: 'percent',
      maximumFractionDigits: 2,
    })}`
  )), none);

  return [
    [t('schedule.title'), details.title],
    [t('review.services'), services],
    ...(request.schemaVersion === 3 ? [[t('production.employee.equipmentHeading'), joined(
      pricing.equipment.map((entry) => entry.equipment.name), none,
    )]] : []),
    [t('catering.package'), cateringPackage],
    [t('catering.people'), formatNumber(details.catering.participantCount)],
    [t('catering.items'), cateringItems],
    [t('catering.dietary'), details.dietaryRequirements || t('catering.noDietary')],
    [t('review.special'), details.specialRequirements || none],
    [t('review.total'), money(pricing.totalMinor, pricing.currency)],
    [t('cost.allocations'), allocationText],
  ];
}

export function renderProductionRequestBusinessDetails(request, { expanded = false, onToggle = () => {} } = {}) {
  const rows = productionRequestBusinessDetails(request);
  if (!rows.length) return null;
  const disclosure = el('details', { className: 'request-business-disclosure' });
  disclosure.open = expanded;
  disclosure.append(
    el('summary', { text: t('production.common.requestDetails') }),
    el('p', { className: 'muted', text: t('production.common.requestId', { id: request.id }) }),
    el('dl', { className: 'request-business-details' }, rows.map(([term, value]) => el('div', {}, [
      el('dt', { text: term }),
      el('dd', { className: 'request-detail-text', text: value }),
    ]))),
  );
  disclosure.addEventListener('toggle', () => {
    if (disclosure.isConnected) onToggle(disclosure.open);
  });
  const section = el('section', { className: 'request-business-overview' });
  for (const [key, value] of [
    ['catering.dietary', request.details.dietaryRequirements],
    ['review.special', request.details.specialRequirements],
  ]) {
    if (value) section.appendChild(el('p', { className: 'request-critical-note request-detail-text' }, [
      el('strong', { text: t(key) }), el('span', { text: value }),
    ]));
  }
  section.appendChild(disclosure);
  return section;
}
