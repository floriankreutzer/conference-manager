import { adapterError, immutable, safeId } from './tenant-settings-wire.js';
import {
  cateringOrderSnapshot, orderArray, orderInstant, orderInteger, orderMoney, orderRecord, orderUuid,
} from './catering-order-wire.js';

const ROOT = 'v1/tenant/catering/orders';
const INVALID = 'CATERING_ORDER_RESPONSE_INVALID';
const STATUSES = ['pending_quote','pending_manager_review','released','queued','dispatching','reconciliation_required',
  'transmitted','confirmed','partially_confirmed','rejected','cancelled','failed','withdrawn'];
function invalid() { throw new CateringOrderApiError(INVALID); }
const revision = (value, minimum = 1, maximum = Number.MAX_SAFE_INTEGER - 1) => orderInteger(value, minimum, maximum);
const uuid = orderUuid;
function references(value, maximum = 20, after = null) {
  let previous = after;
  return orderArray(value, maximum).map((entry) => {
    orderRecord(entry, ['orderId','integrationId','orderVersion','stateRevision','status']);
    const orderId = uuid(entry.orderId);
    if ((previous !== null && orderId <= previous) || !STATUSES.includes(entry.status)) invalid();
    previous = orderId;
    return { orderId, integrationId: uuid(entry.integrationId), orderVersion: revision(entry.orderVersion),
      stateRevision: revision(entry.stateRevision), status: entry.status };
  });
}
function view(value, orderId) {
  const extended = value !== null && typeof value === 'object' && Object.hasOwn(value, 'deliveryOperation');
  orderRecord(value, ['schemaVersion','order','providerId','configurationRevision','operation','state','quote','decision',
    ...(extended ? ['deliveryOperation'] : [])]);
  if (value.schemaVersion !== (extended ? 2 : 1) || value.providerId !== 'manual_catering'
    || !['initial','change','cancel','exception'].includes(value.operation)) invalid();
  const order = cateringOrderSnapshot(value.order, orderId);
  if (extended && (value.operation !== 'change' || value.deliveryOperation !== 'initial' || order.orderVersion < 2)) invalid();
  orderRecord(value.state, ['revision','status','updatedAt']);
  if (!STATUSES.includes(value.state.status)) invalid();
  const state = { revision: revision(value.state.revision), status: value.state.status, updatedAt: orderInstant(value.state.updatedAt) };
  let quote = null;
  if (value.quote !== null) {
    orderRecord(value.quote, ['revision','cost','expiresAt','expired']);
    if (typeof value.quote.expired !== 'boolean') invalid();
    quote = { revision: revision(value.quote.revision), cost: orderMoney(value.quote.cost),
      expiresAt: orderInstant(value.quote.expiresAt), expired: value.quote.expired };
  }
  let decision = null;
  if (value.decision !== null) {
    orderRecord(value.decision, ['sequence','decision','quoteRevision','cost']);
    const cost = orderMoney(value.decision.cost);
    if (!quote || value.decision.quoteRevision !== quote.revision || cost.amountMinor !== quote.cost.amountMinor
      || cost.currency !== quote.cost.currency || !['approved','rejected'].includes(value.decision.decision)) invalid();
    decision = { sequence: revision(value.decision.sequence), decision: value.decision.decision, quoteRevision: quote.revision, cost };
  }
  if ((state.status === 'pending_quote' && quote !== null)
    || (state.status === 'pending_manager_review' && (quote === null || decision !== null))
    || (state.status === 'released' && decision?.decision !== 'approved')
    || (state.status === 'rejected' && !decision)) invalid();
  return immutable({ schemaVersion: value.schemaVersion, order, providerId: value.providerId,
    ...(extended ? { deliveryOperation: 'initial' } : {}),
    configurationRevision: revision(value.configurationRevision), operation: value.operation, state, quote, decision });
}

export class CateringOrderApiError extends Error {
  constructor(code, { cause, serverCode = null, currentRevision = null } = {}) {
    super(code, cause === undefined ? undefined : { cause });
    this.name = 'CateringOrderApiError'; this.code = code;
    this.serverCode = serverCode; this.currentRevision = currentRevision;
  }
}

// Public wire contract for scoped consumers that produce non-authoritative
// documents from an already authorized order read. It never grants authority.
export { view as normalizeCateringOrderView };

export function createCateringOrderApi({ apiClient } = {}) {
  if (!apiClient || typeof apiClient.request !== 'function') throw new TypeError('CATERING_API_CLIENT_REQUIRED');
  const invoke = async (operation) => {
    try { return await operation(); }
    catch (error) { throw adapterError(CateringOrderApiError, error, 'CATERING_ORDER_UNAVAILABLE'); }
  };
  return Object.freeze({
    listOrders({ requestId = null, afterOrderId = null, signal } = {}) {
      return invoke(async () => {
        const after = afterOrderId === null ? null : uuid(afterOrderId);
        const request = requestId === null ? null : safeId(requestId, INVALID);
        const query = new URLSearchParams();
        if (after !== null) query.set('afterOrderId', after);
        if (request !== null) query.set('requestId', request);
        const result = await apiClient.request(`${ROOT}${query.size ? `?${query}` : ''}`, { signal });
        orderRecord(result, ['schemaVersion','orders','nextAfterOrderId']);
        if (result.schemaVersion !== 1) invalid();
        const orders = references(result.orders, 20, after);
        const next = result.nextAfterOrderId === null ? null : uuid(result.nextAfterOrderId);
        if (next !== null && (orders.length !== 20 || next !== orders.at(-1).orderId)) invalid();
        return immutable({ schemaVersion: 1, orders, nextAfterOrderId: next });
      });
    },
    loadOrder(orderId, { signal, orderVersion = null } = {}) {
      return invoke(async () => {
        const id = uuid(orderId); const selected = orderVersion === null ? null : revision(orderVersion);
        const saved = view(await apiClient.request(`${ROOT}/${id}${selected === null ? '' : `?orderVersion=${selected}`}`, { signal }), id);
        if (selected !== null && saved.order.orderVersion !== selected) invalid();
        return saved;
      });
    },
    prepareOrders({ requestId, commandId, expectedRequestVersion, expectedAssignmentRevision } = {}) {
      return invoke(async () => {
        const body = { schemaVersion: 1, requestId: safeId(requestId, INVALID), commandId: uuid(commandId),
          expectedRequestVersion: revision(expectedRequestVersion), expectedAssignmentRevision: revision(expectedAssignmentRevision) };
        const result = await apiClient.request(ROOT, { method: 'POST', body });
        orderRecord(result, ['schemaVersion','requestId','requestVersion','assignmentRevision','replayed','orders']);
        if (result.schemaVersion !== 1 || result.requestId !== body.requestId || result.requestVersion !== body.expectedRequestVersion
          || result.assignmentRevision !== body.expectedAssignmentRevision || typeof result.replayed !== 'boolean') invalid();
        const orders = references(result.orders, 101);
        if (!orders.length || new Set(orders.map((entry) => entry.integrationId)).size !== orders.length
          || (!result.replayed && orders.some((entry) => entry.orderVersion !== 1 || entry.stateRevision !== 1
            || entry.status !== 'pending_quote'))) invalid();
        return immutable({ ...result, orders });
      });
    },
    recordQuote({ orderId, expectedOrderVersion = 1, expectedStateRevision, expectedQuoteRevision, cost, expiresAt } = {}) {
      return invoke(async () => {
        const id = uuid(orderId);
        const version = revision(expectedOrderVersion);
        const body = { schemaVersion: 1, expectedStateRevision: revision(expectedStateRevision, 1, Number.MAX_SAFE_INTEGER - 2),
          expectedQuoteRevision: revision(expectedQuoteRevision, 0, Number.MAX_SAFE_INTEGER - 2),
          cost: orderMoney(cost), expiresAt: orderInstant(expiresAt) };
        if (version > 1) body.expectedOrderVersion = version;
        const saved = view(await apiClient.request(`${ROOT}/${id}/quote`, { method: 'PUT', body }), id);
        if (saved.order.orderVersion !== version || saved.state.revision !== body.expectedStateRevision + 1
          || saved.state.status !== 'pending_manager_review'
          || saved.quote?.revision !== body.expectedQuoteRevision + 1 || saved.quote.cost.amountMinor !== body.cost.amountMinor
          || saved.quote.cost.currency !== body.cost.currency || saved.quote.expiresAt !== body.expiresAt || saved.decision !== null) invalid();
        return saved;
      });
    },
    decideQuote({ orderId, expectedOrderVersion = 1, expectedStateRevision, expectedQuoteRevision, decision } = {}) {
      return invoke(async () => {
        const id = uuid(orderId);
        const version = revision(expectedOrderVersion);
        if (!['approved','rejected'].includes(decision)) invalid();
        const body = { schemaVersion: 1, expectedStateRevision: revision(expectedStateRevision, 1, Number.MAX_SAFE_INTEGER - 2),
          expectedQuoteRevision: revision(expectedQuoteRevision), decision };
        if (version > 1) body.expectedOrderVersion = version;
        const saved = view(await apiClient.request(`${ROOT}/${id}/decision`, { method: 'POST', body }), id);
        if (saved.order.orderVersion !== version || saved.state.revision !== body.expectedStateRevision + 1
          || saved.quote?.revision !== body.expectedQuoteRevision
          || saved.decision?.decision !== decision || saved.state.status !== (decision === 'approved' ? 'released' : 'rejected')) invalid();
        return saved;
      });
    },
  });
}
