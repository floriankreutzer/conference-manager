import { formatDateTime, formatNumber, locale, t } from '../core/i18n.js';
import { button, el, field } from '../core/ui.js';
import { authorityFailureCode } from '../shared/authority-failure.js';
import { cateringMoneyText, cateringQuoteExpiry, cateringQuoteMinorUnits } from './catering-quote-draft.js';
import { createCateringDeliveryPanel } from './catering-delivery-panel.js';
import { createCateringManualPanel } from './catering-manual-panel.js';
import { createCateringVersionPanel } from './catering-version-panel.js';
import { createCateringDocumentActions } from './catering-document-actions.js';

const money = (value) => cateringMoneyText(value, locale());
const shortId = (value) => `${value.slice(0, 8)}…${value.slice(-8)}`;

export async function renderCateringOrders({ root, requests, adapter, assignments, delivery = null, isCurrent, onAuthorityFailure }) {
  const status = el('p', { attrs: { role: 'status', 'aria-live': 'polite' } });
  const choose = el('select');
  choose.appendChild(el('option', { value: '', text: t('cateringOrders.all') }));
  const confirmed = requests.filter((request) => request.status === 'Confirmed');
  for (const request of confirmed) choose.appendChild(el('option', { value: request.id,
    text: request.details?.title || t('production.common.requestId', { id: request.id }) }));
  const reload = button(t('cateringOrders.reload'));
  const prepare = button(t('cateringOrders.prepare'), { className: 'primary' });
  const next = button(t('cateringOrders.next'));
  const first = button(t('cateringOrders.first'));
  const list = el('div', { className: 'form-grid' });
  const detail = el('section', { attrs: { 'aria-label': t('cateringOrders.detail') } });
  root.append(el('h2', { text: t('cateringOrders.title') }), el('p', { text: t('cateringOrders.description') }),
    field({ id: 'catering-order-request', label: t('cateringOrders.request'), control: choose }),
    el('div', { className: 'button-row' }, [reload, prepare, first, next]), status, list, detail);
  let busy = false;
  let uncertain = false;
  let page = null;
  let displayed = null;
  let selectedRequest = '';
  let deliveryPanel = null;
  let manualPanel = null;
  let versionPanel = null;
  function controls(value) {
    busy = value;
    root.setAttribute('aria-busy', String(value));
    for (const control of root.querySelectorAll('button:not([data-delivery-control]):not([data-manual-control]):not([data-version-control]),input:not([data-manual-control]),select:not([data-manual-control]):not([data-version-control])')) control.disabled = value;
    deliveryPanel?.setBusy(value || uncertain);
    manualPanel?.setBusy(value || uncertain);
    versionPanel?.setBusy(value || uncertain);
    next.disabled = value || !page?.nextAfterOrderId;
    prepare.disabled = value || uncertain || !selectedRequest || !assignments || !page || page.orders.length > 0;
    for (const control of detail.querySelectorAll('[data-order-write]:not([data-manual-control])')) control.disabled = value || uncertain;
  }
  function failure(error, writing = false) {
    if (authorityFailureCode(error)) { onAuthorityFailure(error); return; }
    if (!isCurrent()) return;
    uncertain ||= writing;
    status.textContent = t(error?.code === 'CATERING_DOCUMENT_SOURCE_CHANGED' ? 'cateringDocuments.stale'
      : error?.code === 'HTTP_409' ? 'cateringOrders.conflict' : 'cateringOrders.error');
    controls(false);
  }
  function showList() {
    list.replaceChildren();
    for (const order of page.orders) {
      const open = button(t('cateringOrders.open', { reference: shortId(order.orderId) }));
      open.addEventListener('click', () => { void loadDetail(order.orderId); });
      list.appendChild(el('article', { className: 'card' }, [open,
        el('p', { text: t(`cateringOrders.state.${order.status}`) })]));
    }
    if (!page.orders.length) list.appendChild(el('p', { text: t('cateringOrders.empty') }));
  }
  async function loadPage(afterOrderId = null, focus = false) {
    if (busy || !isCurrent()) return;
    controls(true);
    try {
      const loaded = await adapter.listOrders({ requestId: selectedRequest || null, afterOrderId });
      if (!isCurrent()) return;
      page = loaded; displayed = null; uncertain = false;
      deliveryPanel = null; manualPanel = null; versionPanel = null;
      detail.replaceChildren(); showList(); controls(false);
      status.textContent = t('cateringOrders.loaded');
      if (focus) reload.focus();
    } catch (error) { failure(error); }
  }
  function showDetail(view, historical = false) {
    displayed = view;
    deliveryPanel = null; manualPanel = null; versionPanel = null;
    const order = view.order;
    const reviewable = !historical && (['pending_quote','pending_manager_review','released'].includes(view.state.status)
      || (view.state.status === 'rejected' && view.decision?.decision === 'rejected'));
    if (page && !historical) {
      page = { ...page, orders: page.orders.map((reference) => reference.orderId === order.orderId
        ? { ...reference, orderVersion: order.orderVersion, stateRevision: view.state.revision, status: view.state.status }
        : reference) };
      showList();
    }
    detail.replaceChildren(el('h3', { text: order.title, attrs: { tabindex: '-1' } }),
      el('p', { text: t('cateringOrders.reference', { reference: shortId(order.orderId), version: formatNumber(order.orderVersion) }) }),
      el('p', { text: t(`cateringOrders.state.${view.state.status}`) }),
      el('p', { text: t('cateringOrders.conferencePrice', { amount: money(order.conferencePrice) }) }));
    if (historical) {
      const current = button(t('cateringVersions.current'));
      current.addEventListener('click', () => { void loadDetail(order.orderId, null, true); });
      detail.append(el('p', { text: t('cateringVersions.historical') }), current);
    }
    const facts = [
      ['connection', shortId(order.integrationId)], ['room', order.room.name],
      ['start', formatDateTime(order.startsAt)], ['end', formatDateTime(order.endsAt)],
      ['participants', formatNumber(order.participantCount)],
    ];
    detail.appendChild(el('dl', { className: 'details-list' }, facts.flatMap(([key, value]) => [
      el('dt', { text: t(`cateringOrders.${key}`) }), el('dd', { text: value }),
    ])));
    for (const [key, value] of [['dietary', order.dietaryRequirements], ['requirements', order.specialRequirements]]) {
      if (value) detail.appendChild(el('p', { text: t(`cateringOrders.${key}`, { value }) }));
    }
    const positions = el('ul');
    for (const line of order.positions) {
      const item = el('li', { text: t('cateringOrders.position', { name: line.name,
        quantity: formatNumber(line.quantity), amount: money({ amountMinor: line.conferenceLineTotalMinor, currency: line.unitPrice.currency }) }) });
      if (line.packageDetails) item.appendChild(el('details', {}, [
        el('summary', { text: t('cateringOrders.components', { count: formatNumber(line.packageDetails.includedItems.length) }) }),
        el('ul', {}, line.packageDetails.includedItems.map((entry) => el('li', { text: entry.name }))),
      ]));
      positions.appendChild(item);
    }
    detail.appendChild(positions);
    if (view.quote) {
      detail.appendChild(el('p', { text: t('cateringOrders.quote', { revision: formatNumber(view.quote.revision),
        amount: money(view.quote.cost), expires: formatDateTime(view.quote.expiresAt) }) }));
      if (view.quote.expired || Date.parse(view.quote.expiresAt) <= Date.now()) {
        detail.appendChild(el('p', { text: t('cateringOrders.expired') }));
      } else if (reviewable) {
        const actions = el('div', { className: 'button-row' });
        for (const decision of ['approved','rejected']) {
          const control = button(t(`cateringOrders.${decision}`, { amount: money(view.quote.cost) }), {
            className: decision === 'approved' ? 'primary' : 'secondary', dataset: { orderWrite: 'decision' },
          });
          control.addEventListener('click', () => { void write(() => adapter.decideQuote({ orderId: order.orderId,
            expectedOrderVersion: order.orderVersion,
            expectedStateRevision: view.state.revision, expectedQuoteRevision: view.quote.revision, decision })); });
          actions.appendChild(control);
        }
        detail.appendChild(actions);
      }
    } else detail.appendChild(el('p', { text: t('cateringOrders.unknownCost') }));
    if (reviewable) quoteForm(view);
    if (delivery && !historical) {
      if (typeof delivery.loadVersionProposals === 'function') {
        const versions = el('section', { attrs: { 'aria-label': t('cateringVersions.title') } });
        detail.appendChild(versions);
        versionPanel = createCateringVersionPanel({ root: versions, adapter: delivery, view,
          isCurrent: () => isCurrent() && displayed === view && versions.isConnected, onAuthorityFailure,
          onPropose: (command) => { void write(async () => {
            await delivery.proposeVersion(command); return adapter.loadOrder(order.orderId);
          }); }, onOpenVersion: (orderVersion) => { void loadDetail(order.orderId, orderVersion, true); },
        });
      }
      const panel = el('section', { attrs: { 'aria-label': t('cateringDelivery.title') } });
      detail.appendChild(panel);
      deliveryPanel = createCateringDeliveryPanel({ root: panel, adapter: delivery, view,
        isCurrent: () => isCurrent() && displayed === view && panel.isConnected,
        onAuthorityFailure, onEnqueue: () => { void write(async () => {
          await delivery.enqueue({ orderId: order.orderId, expectedOrderVersion: order.orderVersion,
            expectedStateRevision: view.state.revision, expectedQuoteRevision: view.quote.revision });
          return adapter.loadOrder(order.orderId);
        }); },
      });
      const manual = el('section', { attrs: { 'aria-label': t('cateringManual.title') } });
      detail.appendChild(manual);
      manualPanel = createCateringManualPanel({ root: manual, adapter: delivery, view,
        isCurrent: () => isCurrent() && displayed === view && manual.isConnected, onAuthorityFailure,
        onRecord: (command) => { void write(async () => {
          await delivery.recordManualFact(command); return adapter.loadOrder(order.orderId);
        }); },
      });
      const documents = el('section', { attrs: { 'aria-label': t('cateringDocuments.title') } });
      detail.appendChild(documents);
      createCateringDocumentActions({ root: documents, view, adapter,
        isCurrent: () => isCurrent() && displayed === view && documents.isConnected,
        isAvailable: () => !busy && !uncertain, setBusy: controls,
        onFailure: (error) => { failure(error, true); }, onStatus: (text) => { status.textContent = text; },
      });
    }
    controls(false);
  }
  function quoteForm(view) {
    const form = el('form', { className: 'card' });
    const amount = el('input', { type: 'number', attrs: { required: 'required', min: '0', step: '0.01', inputmode: 'decimal' } });
    const currency = el('select', {}, ['CHF','EUR','GBP','USD'].map((value) => el('option', { value, text: value })));
    currency.value = view.quote?.cost.currency || view.order.conferencePrice.currency;
    const expiry = el('input', { type: 'datetime-local', attrs: { required: 'required' } });
    const save = button(t('cateringOrders.saveQuote'), { type: 'submit', className: 'primary', dataset: { orderWrite: 'quote' } });
    form.append(el('h4', { text: t('cateringOrders.manualQuote') }), el('p', { text: t('cateringOrders.quoteWarning') }),
      field({ id: 'catering-quote-amount', label: t('cateringOrders.amount'), control: amount, required: true }),
      field({ id: 'catering-quote-currency', label: t('cateringOrders.currency'), control: currency }),
      field({ id: 'catering-quote-expiry', label: t('cateringOrders.expiry'), control: expiry, required: true }), save);
    form.addEventListener('submit', (event) => {
      event.preventDefault();
      if (busy || uncertain || !isCurrent() || !form.reportValidity()) return;
      let cost; let expiresAt;
      try { cost = { amountMinor: cateringQuoteMinorUnits(amount.value), currency: currency.value }; expiresAt = cateringQuoteExpiry(expiry.value); }
      catch { status.textContent = t('cateringOrders.invalidQuote'); return; }
      void write(() => adapter.recordQuote({ orderId: view.order.orderId, expectedStateRevision: view.state.revision,
        expectedOrderVersion: view.order.orderVersion,
        expectedQuoteRevision: view.quote?.revision ?? 0, cost, expiresAt }));
    });
    detail.appendChild(form);
  }
  async function write(operation) {
    if (busy || uncertain || !isCurrent()) return;
    controls(true);
    try {
      const saved = await operation();
      if (!isCurrent()) return;
      showDetail(saved); status.textContent = t('cateringOrders.saved');
      reload.focus();
    } catch (error) { failure(error, true); }
  }
  async function loadDetail(orderId, orderVersion = null, focus = false) {
    if (busy || !isCurrent()) return;
    controls(true);
    try {
      const loaded = await adapter.loadOrder(orderId, { orderVersion });
      if (!isCurrent()) return;
      if (orderVersion === null) uncertain = false;
      showDetail(loaded, orderVersion !== null); status.textContent = t('cateringOrders.loaded');
      if (focus) detail.querySelector('h3').focus();
    } catch (error) { failure(error); }
  }
  choose.addEventListener('change', () => { selectedRequest = choose.value; void loadPage(); });
  reload.addEventListener('click', () => { void (displayed ? loadDetail(displayed.order.orderId) : loadPage(null, true)); });
  first.addEventListener('click', () => { void loadPage(null, true); });
  next.addEventListener('click', () => { if (page?.nextAfterOrderId) void loadPage(page.nextAfterOrderId, true); });
  prepare.addEventListener('click', async () => {
    if (busy || uncertain || !isCurrent() || prepare.disabled) return;
    const request = confirmed.find((entry) => entry.id === selectedRequest);
    if (!request) return;
    controls(true);
    try {
      const ownership = await assignments.loadAssignments();
      if (!isCurrent()) return;
      if (ownership.stale || ownership.revision === 0
        || ownership.assignedCatalogueRevision !== request.configurationRevisions?.catalogue) throw new Error('CATERING_ORDER_SOURCE_CHANGED');
      await adapter.prepareOrders({ requestId: request.id, commandId: crypto.randomUUID(),
        expectedRequestVersion: request.version, expectedAssignmentRevision: ownership.revision });
      if (!isCurrent()) return;
      controls(false); await loadPage(null, true);
    } catch (error) { failure(error, true); }
  });
  await loadPage();
}
