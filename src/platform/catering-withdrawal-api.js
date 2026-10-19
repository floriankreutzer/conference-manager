import { adapterError, immutable } from './tenant-settings-wire.js';
import { orderInstant, orderInteger, orderRecord, orderUuid } from './catering-order-wire.js';

const INVALID = 'CATERING_WITHDRAWAL_RESPONSE_INVALID';
const UNSENT = ['pending_quote','pending_manager_review','released','rejected','queued'];
const STATES = [...UNSENT,'dispatching','reconciliation_required','transmitted','confirmed','partially_confirmed',
  'cancelled','failed','withdrawn'];
const count = (value, maximum = Number.MAX_SAFE_INTEGER - 1) => orderInteger(value, 1, maximum);
function invalid() { throw new CateringWithdrawalApiError(INVALID); }
function reason(value) {
  if (typeof value !== 'string' || !value.length || value.length > 1000 || value !== value.trim()
    || /[\u0000-\u001f\u007f]/.test(value)) invalid();
  return value;
}
function state(value) {
  orderRecord(value, ['orderVersion','revision','status']); if (!STATES.includes(value.status)) invalid();
  return { orderVersion: count(value.orderVersion), revision: count(value.revision), status: value.status };
}
function fact(value, orderId) {
  orderRecord(value, ['orderId','orderVersion','previousStatus','justification','attestNotTransmitted','recordedAt']);
  if (value.orderId !== orderId || !UNSENT.includes(value.previousStatus) || value.attestNotTransmitted !== true) invalid();
  return { orderId, orderVersion: count(value.orderVersion), previousStatus: value.previousStatus,
    justification: reason(value.justification), attestNotTransmitted: true, recordedAt: orderInstant(value.recordedAt) };
}
export class CateringWithdrawalApiError extends Error {
  constructor(code, { cause, serverCode = null } = {}) {
    super(code, cause === undefined ? undefined : { cause }); this.name = 'CateringWithdrawalApiError';
    this.code = code; this.serverCode = serverCode;
  }
}
export function createCateringWithdrawalApi({ apiClient } = {}) {
  if (typeof apiClient?.request !== 'function') throw new TypeError('CATERING_API_CLIENT_REQUIRED');
  const invoke = async (work) => {
    try { return await work(); }
    catch (error) {
      if (error?.code === 'CATERING_ORDER_RESPONSE_INVALID') throw new CateringWithdrawalApiError(INVALID, { cause: error });
      throw adapterError(CateringWithdrawalApiError, error, 'CATERING_WITHDRAWAL_UNAVAILABLE');
    }
  };
  const path = (orderId) => `v1/tenant/catering/orders/${orderId}/withdrawal`;
  return Object.freeze({
    loadWithdrawal({ orderId, orderVersion = null, signal } = {}) {
      return invoke(async () => {
        const id = orderUuid(orderId); const selected = orderVersion === null ? null : count(orderVersion);
        const value = await apiClient.request(`${path(id)}${selected === null ? '' : `?orderVersion=${selected}`}`, { signal });
        orderRecord(value, ['schemaVersion','orderId','orderState','eligible','effective','withdrawal']);
        if (value.schemaVersion !== 1 || value.orderId !== id || typeof value.eligible !== 'boolean') invalid();
        const current = state(value.orderState); if (selected !== null && current.orderVersion !== selected) invalid();
        let effective = null;
        if (value.effective !== null) {
          orderRecord(value.effective, ['orderVersion','status']);
          if (!['confirmed','cancelled'].includes(value.effective.status)) invalid();
          effective = { orderVersion: count(value.effective.orderVersion), status: value.effective.status };
        }
        const saved = value.withdrawal === null ? null : fact(value.withdrawal, id);
        if ((current.status === 'withdrawn') !== (saved !== null) || (saved && saved.orderVersion !== current.orderVersion)
          || (value.eligible && (!UNSENT.includes(current.status) || saved
            || (effective && (effective.orderVersion >= current.orderVersion || effective.status === 'cancelled'))))) invalid();
        return immutable({ schemaVersion: 1, orderId: id, orderState: current, eligible: value.eligible, effective, withdrawal: saved });
      });
    },
    withdrawOrder({ orderId, commandId, expectedOrderVersion, expectedStateRevision, justification, attestNotTransmitted } = {}) {
      return invoke(async () => {
        const id = orderUuid(orderId); if (attestNotTransmitted !== true) invalid();
        const body = { schemaVersion: 1, commandId: orderUuid(commandId), expectedOrderVersion: count(expectedOrderVersion),
          expectedStateRevision: count(expectedStateRevision, Number.MAX_SAFE_INTEGER - 2), justification: reason(justification),
          attestNotTransmitted: true };
        const value = await apiClient.request(path(id), { method: 'POST', body });
        orderRecord(value, ['schemaVersion','replayed','withdrawal','orderState']);
        if (value.schemaVersion !== 1 || typeof value.replayed !== 'boolean') invalid();
        const saved = fact(value.withdrawal, id); const current = state(value.orderState);
        if (saved.orderVersion !== body.expectedOrderVersion || saved.justification !== body.justification
          || current.orderVersion !== body.expectedOrderVersion || current.revision !== body.expectedStateRevision + 1
          || current.status !== 'withdrawn') invalid();
        return immutable({ schemaVersion: 1, replayed: value.replayed, withdrawal: saved, orderState: current });
      });
    },
  });
}
