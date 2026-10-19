import { adapterError, immutable } from './tenant-settings-wire.js';
import { orderArray, orderInstant, orderInteger, orderRecord, orderUuid } from './catering-order-wire.js';

const INVALID = 'CATERING_MANUAL_RESPONSE_INVALID';
const CHANNELS = ['email','telephone','portal','in_person','other'];
const OUTCOMES = ['pending','confirmed','rejected','substitution_proposed'];
const STATES = ['pending_quote','pending_manager_review','released','queued','dispatching','reconciliation_required',
  'transmitted','confirmed','partially_confirmed','rejected','cancelled','failed'];
const count = (value, minimum = 1) => orderInteger(value, minimum);
function invalid() { throw new CateringManualApiError(INVALID); }
function scope({ orderId, orderVersion, positionIds }) {
  const ids = orderArray(positionIds, 101).map(orderUuid);
  if (ids.length === 0 || new Set(ids).size !== ids.length) invalid();
  return { orderId: orderUuid(orderId), orderVersion: count(orderVersion), positionIds: ids };
}
function receipt(value, expected) {
  orderRecord(value, ['orderId','orderVersion','positions']);
  if (value.orderId !== expected.orderId || value.orderVersion !== expected.orderVersion) invalid();
  const seen = new Set();
  const positions = orderArray(value.positions, 101).map((position) => {
    orderRecord(position, ['positionId','outcome']);
    const positionId = orderUuid(position.positionId);
    if (!expected.positionIds.includes(positionId) || seen.has(positionId) || !OUTCOMES.includes(position.outcome)) invalid();
    seen.add(positionId); return { positionId, outcome: position.outcome };
  });
  if (positions.length !== expected.positionIds.length) invalid();
  return { orderId: expected.orderId, orderVersion: expected.orderVersion, positions };
}
function details(value) {
  if (!['transmitted','receipt'].includes(value.kind) || !CHANNELS.includes(value.channel)
    || typeof value.reference !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9 ._/#-]{0,199}$/.test(value.reference)
    || value.reference !== value.reference.trim()) invalid();
  return { kind: value.kind, channel: value.channel, reference: value.reference, occurredAt: orderInstant(value.occurredAt) };
}
function fact(value, expected) {
  orderRecord(value, ['orderId','orderVersion','sequence','kind','channel','reference','occurredAt','recordedAt',
    'quoteRevision','decisionSequence','operation','status','receipt']);
  if (value.orderId !== expected.orderId || value.orderVersion !== expected.orderVersion
    || !['initial','change','cancel','exception'].includes(value.operation)) invalid();
  const sequence = count(value.sequence); const common = details(value); const recordedAt = orderInstant(value.recordedAt);
  if (recordedAt < common.occurredAt) invalid();
  let normalized = null; let status = 'transmitted';
  if (common.kind === 'transmitted') { if (sequence !== 1 || value.receipt !== null) invalid(); }
  else {
    if (sequence < 2) invalid(); normalized = receipt(value.receipt, expected);
    const confirmed = normalized.positions.filter((position) => position.outcome === 'confirmed').length;
    const rejected = normalized.positions.filter((position) => position.outcome === 'rejected').length;
    status = confirmed === normalized.positions.length ? value.operation === 'cancel' ? 'cancelled' : 'confirmed'
      : confirmed > 0 ? 'partially_confirmed' : rejected === normalized.positions.length ? 'rejected' : 'transmitted';
  }
  if (status !== value.status) invalid();
  return { orderId: expected.orderId, orderVersion: expected.orderVersion, sequence, ...common, recordedAt,
    quoteRevision: count(value.quoteRevision), decisionSequence: count(value.decisionSequence),
    operation: value.operation, status, receipt: normalized };
}
function state(value, version) {
  orderRecord(value, ['orderVersion','revision','status']);
  if (value.orderVersion !== version || !STATES.includes(value.status)) invalid();
  return { orderVersion: version, revision: count(value.revision), status: value.status };
}
export class CateringManualApiError extends Error {
  constructor(code, { cause, serverCode = null } = {}) {
    super(code, cause === undefined ? undefined : { cause }); this.name = 'CateringManualApiError';
    this.code = code; this.serverCode = serverCode;
  }
}
export function createCateringManualApi({ apiClient } = {}) {
  if (typeof apiClient?.request !== 'function') throw new TypeError('CATERING_API_CLIENT_REQUIRED');
  const invoke = async (work) => {
    try { return await work(); }
    catch (error) {
      if (error?.code === 'CATERING_ORDER_RESPONSE_INVALID') throw new CateringManualApiError(INVALID, { cause: error });
      throw adapterError(CateringManualApiError, error, 'CATERING_MANUAL_UNAVAILABLE');
    }
  };
  const path = (id) => `v1/tenant/catering/orders/${id}/manual-delivery`;
  return Object.freeze({
    loadManualFacts({ orderId, orderVersion, positionIds, afterSequence = 0, signal } = {}) {
      return invoke(async () => {
        const expected = scope({ orderId, orderVersion, positionIds }); const after = count(afterSequence, 0);
        const query = new URLSearchParams({ orderVersion: String(expected.orderVersion), afterSequence: String(after) });
        const value = await apiClient.request(`${path(expected.orderId)}?${query}`, { signal });
        orderRecord(value, ['schemaVersion','orderId','orderVersion','orderState','manualSequence',
          'events','nextAfterSequence','effective']);
        if (value.schemaVersion !== 1 || value.orderId !== expected.orderId || value.orderVersion !== expected.orderVersion) invalid();
        const sequence = count(value.manualSequence, 0); let previous = after;
        const events = orderArray(value.events, 20).map((entry) => {
          const result = fact(entry, expected); if (result.sequence !== previous + 1 || result.sequence > sequence) invalid();
          previous = result.sequence; return result;
        });
        if (events.length !== Math.min(20, Math.max(0, sequence - after))) invalid();
        const next = sequence > previous ? previous : null;
        if (value.nextAfterSequence !== next) invalid();
        let effective = null;
        if (value.effective !== null) {
          orderRecord(value.effective, ['orderVersion','status']);
          if (!['confirmed','cancelled'].includes(value.effective.status)) invalid();
          effective = { orderVersion: count(value.effective.orderVersion), status: value.effective.status };
        }
        return immutable({ schemaVersion: 1, orderId: expected.orderId, orderVersion: expected.orderVersion,
          orderState: state(value.orderState, expected.orderVersion), manualSequence: sequence, events,
          nextAfterSequence: next, effective });
      });
    },
    recordManualFact({ orderId, expectedOrderVersion, expectedStateRevision, expectedQuoteRevision, expectedDecisionSequence,
      positionIds, commandId, kind, channel, reference, occurredAt, receipt: sourceReceipt } = {}) {
      return invoke(async () => {
        const expected = scope({ orderId, orderVersion: expectedOrderVersion, positionIds });
        const common = details({ kind, channel, reference, occurredAt });
        const normalizedReceipt = kind === 'transmitted' ? null : receipt(sourceReceipt, expected);
        if (kind === 'transmitted' && sourceReceipt !== null) invalid();
        const body = { schemaVersion: 1, commandId: orderUuid(commandId), expectedOrderVersion: expected.orderVersion,
          expectedStateRevision: orderInteger(expectedStateRevision, 1, Number.MAX_SAFE_INTEGER - 2),
          ...common, receipt: normalizedReceipt };
        const quote = count(expectedQuoteRevision); const decision = count(expectedDecisionSequence);
        const value = await apiClient.request(path(expected.orderId), { method: 'POST', body });
        orderRecord(value, ['schemaVersion','replayed','fact','orderState']);
        if (value.schemaVersion !== 1 || typeof value.replayed !== 'boolean') invalid();
        const saved = fact(value.fact, expected); const current = state(value.orderState, expected.orderVersion);
        if (saved.kind !== common.kind || saved.channel !== common.channel || saved.reference !== common.reference
          || saved.occurredAt !== common.occurredAt || saved.quoteRevision !== quote || saved.decisionSequence !== decision
          || JSON.stringify(saved.receipt) !== JSON.stringify(normalizedReceipt)
          || current.revision < body.expectedStateRevision + 1 || (!value.replayed
            && (current.revision !== body.expectedStateRevision + 1 || current.status !== saved.status))) invalid();
        return immutable({ schemaVersion: 1, replayed: value.replayed, fact: saved, orderState: current });
      });
    },
  });
}
