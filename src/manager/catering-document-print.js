import { formatDateTime, formatNumber, locale, t } from '../core/i18n.js';
import { closeDetachedPrintWindow, detachedPrintStylesReady, initializeDetachedPrintDocument,
  waitForDetachedPrintDocument } from '../shared/detached-print-window.js';
import { cateringMoneyText } from './catering-quote-draft.js';

export async function presentCateringPrintDocument({ printWindow, value, isCurrent, validateForPrint, onFailure }) {
  await waitForDetachedPrintDocument(printWindow);
  if (!isCurrent()) { closeDetachedPrintWindow(printWindow); return; }
  const doc = initializeDetachedPrintDocument(printWindow, { lang: locale().split('-')[0], title: t('cateringDocuments.title') });
  const node = (tag, text = '', className = '') => {
    const element = doc.createElement(tag); element.textContent = text; element.className = className; return element;
  };
  const list = (facts) => {
    const result = node('dl');
    for (const [key, text] of facts) result.append(node('dt', t(key)), node('dd', text));
    return result;
  };
  const hero = node('header', '', 'guest-print-hero');
  hero.append(node('small', t('app.title')), node('h1', t('cateringDocuments.title')),
    node('p', t('cateringDocuments.notice')));
  const content = node('main', '', 'guest-print-content');
  const context = node('section', '', 'guest-print-card');
  context.append(node('h2', value.title), list([
    ['cateringDocuments.reference', value.orderId], ['cateringDelivery.version', formatNumber(value.orderVersion)],
    ['cateringDocuments.supplierReference', value.integrationId],
    ['cateringDelivery.operation', t(`cateringDelivery.operation.${value.operation}`)],
    ['cateringDocuments.orderStatus', t(`cateringOrders.state.${value.status}`)],
    ['cateringDocuments.generated', formatDateTime(value.generatedAt)],
    ['cateringOrders.room', value.room], ['cateringOrders.start', formatDateTime(value.startsAt)],
    ['cateringOrders.end', formatDateTime(value.endsAt)], ['cateringOrders.participants', formatNumber(value.participantCount)],
  ]));
  for (const [key, text] of [['cateringOrders.dietary',value.dietaryRequirements],
    ['cateringOrders.requirements',value.specialRequirements]]) if (text) context.append(node('p', t(key, { value: text })));
  const quote = node('section', '', 'guest-print-card');
  quote.append(node('h2', t('cateringDocuments.supplierCost')));
  if (value.quote) {
    quote.append(list([
      ['cateringOrders.amount', cateringMoneyText(value.quote.cost, locale())],
      ['cateringDocuments.quoteRevision', formatNumber(value.quote.revision)],
      ['cateringOrders.expiry', formatDateTime(value.quote.expiresAt)],
      ['cateringDocuments.costDecision', t(value.quote.approved ? 'cateringDocuments.approved' : 'cateringDocuments.notApproved')],
    ]));
    if (value.quote.expired) quote.append(node('p', t('cateringDocuments.expired')));
  } else quote.append(node('p', t('cateringOrders.unknownCost')));
  const positions = node('section'); positions.append(node('h2', t('cateringDocuments.positions')));
  for (const position of value.positions) {
    const line = node('article', '', 'guest-print-card'); line.append(node('h3', position.name),
      list([['cateringDocuments.positionReference', position.positionId],
        ['cateringDocuments.quantity', formatNumber(position.quantity)]]));
    if (position.description) line.append(node('p', position.description));
    if (position.variant) line.append(node('p', t('cateringDocuments.variant', { name: position.variant })));
    if (position.components.length) {
      const components = node('ul');
      for (const entry of position.components) {
        const item = node('li', entry.name); if (entry.description) item.append(node('p', entry.description)); components.append(item);
      }
      line.append(node('p', t('cateringDocuments.components')), components);
      for (const selection of position.selections) line.append(node('p', t('cateringDocuments.selection', {
        name: position.components.find((entry) => entry.id === selection.itemId).name, quantity: formatNumber(selection.quantity),
      })));
    }
    positions.append(line);
  }
  content.append(context, quote, positions, node('p', t('cateringDocuments.versionNotice')));
  const print = node('button', t('cateringDocuments.print'), 'print-action'); print.type = 'button'; print.disabled = true;
  let printing = false;
  print.addEventListener('click', async () => {
    if (printing) return;
    if (!isCurrent()) { closeDetachedPrintWindow(printWindow); return; }
    printing = true; print.disabled = true;
    try {
      if (await validateForPrint() && isCurrent() && !printWindow.closed) printWindow.print();
    } catch (error) { closeDetachedPrintWindow(printWindow); onFailure(error); }
    finally { printing = false; if (!printWindow.closed) print.disabled = false; }
  });
  doc.body.append(print, hero, content);
  await detachedPrintStylesReady(printWindow);
  if (!isCurrent() || printWindow.closed) { closeDetachedPrintWindow(printWindow); return; }
  print.disabled = false; printWindow.focus(); print.focus();
}
