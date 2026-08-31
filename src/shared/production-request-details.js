import { formatNumber, locale, t } from '../core/i18n.js';
import { el } from '../core/ui.js';

function money(amountMinor, currency) {
  return new Intl.NumberFormat(locale(), {
    style: 'currency',
    currency,
  }).format(Number(amountMinor || 0) / 100);
}

function joined(values, fallback) {
  return values.filter(Boolean).join(' · ') || fallback;
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
    [t('catering.package'), cateringPackage],
    [t('catering.people'), formatNumber(details.catering.participantCount)],
    [t('catering.items'), cateringItems],
    [t('catering.dietary'), details.dietaryRequirements || t('catering.noDietary')],
    [t('review.special'), details.specialRequirements || none],
    [t('review.total'), money(pricing.totalMinor, pricing.currency)],
    [t('cost.allocations'), allocationText],
  ];
}

export function renderProductionRequestBusinessDetails(request) {
  const rows = productionRequestBusinessDetails(request);
  if (!rows.length) return null;
  return el('dl', { className: 'details-list' }, rows.flatMap(([term, value]) => [
    el('dt', { text: term }),
    el('dd', { text: value }),
  ]));
}
