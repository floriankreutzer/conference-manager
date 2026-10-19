import { createCateringManualApi } from './catering-manual-api.js';
import { createCateringVersionApi } from './catering-version-api.js';
import { createCateringWithdrawalApi } from './catering-withdrawal-api.js';
import { adapterError, immutable } from './tenant-settings-wire.js';
import { orderArray, orderInstant, orderInteger, orderRecord, orderUuid } from './catering-order-wire.js';

const ROOT = 'v1/tenant/catering/delivery-jobs';
const INVALID = 'CATERING_DELIVERY_RESPONSE_INVALID';
const STATUSES = ['queued','leased','dispatching','reconciling','retry_wait','deferred',
  'reconciliation_required','succeeded','failed','superseded'];
const revision = (value, minimum = 1, maximum = Number.MAX_SAFE_INTEGER - 1) => orderInteger(value, minimum, maximum);
function invalid() { throw new CateringDeliveryApiError(INVALID); }
function job(value, { jobId = null, orderId = null } = {}) {
  orderRecord(value, ['jobId','integrationId','orderId','orderVersion','operation','revision','status',
    'dispatchAttempts','automaticReconciliationAttempts','quoteRevision','decisionSequence','createdAt','updatedAt','availableAt']);
  const result = { jobId: orderUuid(value.jobId), integrationId: orderUuid(value.integrationId), orderId: orderUuid(value.orderId),
    orderVersion: revision(value.orderVersion), operation: value.operation, revision: revision(value.revision), status: value.status,
    dispatchAttempts: revision(value.dispatchAttempts, 0, 3),
    automaticReconciliationAttempts: revision(value.automaticReconciliationAttempts, 0, 10),
    quoteRevision: revision(value.quoteRevision), decisionSequence: revision(value.decisionSequence),
    createdAt: orderInstant(value.createdAt), updatedAt: orderInstant(value.updatedAt),
    availableAt: value.availableAt === null ? null : orderInstant(value.availableAt) };
  if ((jobId !== null && result.jobId !== jobId) || (orderId !== null && result.orderId !== orderId)
    || !STATUSES.includes(result.status) || !['initial','change','cancel','exception'].includes(result.operation)
    || result.updatedAt < result.createdAt || (['queued','retry_wait'].includes(result.status)
      && (result.availableAt === null || result.dispatchAttempts === 3))
    || (['dispatching','reconciling','reconciliation_required','succeeded','failed'].includes(result.status)
      && result.dispatchAttempts === 0)) invalid();
  return immutable(result);
}

export class CateringDeliveryApiError extends Error {
  constructor(code, { cause, serverCode = null, currentRevision = null } = {}) {
    super(code, cause === undefined ? undefined : { cause });
    this.name = 'CateringDeliveryApiError'; this.code = code;
    this.serverCode = serverCode; this.currentRevision = currentRevision;
  }
}

export function createCateringDeliveryApi({ apiClient } = {}) {
  if (!apiClient || typeof apiClient.request !== 'function') throw new TypeError('CATERING_API_CLIENT_REQUIRED');
  const invoke = async (operation) => {
    try { return await operation(); }
    catch (error) {
      if (error?.code === 'CATERING_ORDER_RESPONSE_INVALID') throw new CateringDeliveryApiError(INVALID, { cause: error });
      throw adapterError(CateringDeliveryApiError, error, 'CATERING_DELIVERY_UNAVAILABLE');
    }
  };
  return Object.freeze({
    ...createCateringManualApi({ apiClient }),
    ...createCateringVersionApi({ apiClient }),
    ...createCateringWithdrawalApi({ apiClient }),
    listJobs({ orderId = null, afterJobId = null, signal } = {}) {
      return invoke(async () => {
        const order = orderId === null ? null : orderUuid(orderId);
        const after = afterJobId === null ? null : orderUuid(afterJobId);
        const query = new URLSearchParams();
        if (after !== null) query.set('afterJobId', after);
        if (order !== null) query.set('orderId', order);
        const value = await apiClient.request(`${ROOT}${query.size ? `?${query}` : ''}`, { signal });
        orderRecord(value, ['schemaVersion','jobs','nextAfterJobId']);
        if (value.schemaVersion !== 1) invalid();
        let previous = after;
        const jobs = orderArray(value.jobs, 20).map((entry) => {
          const normalized = job(entry, { orderId: order });
          if (previous !== null && normalized.jobId <= previous) invalid();
          previous = normalized.jobId; return normalized;
        });
        const next = value.nextAfterJobId === null ? null : orderUuid(value.nextAfterJobId);
        if (next !== null && (jobs.length !== 20 || next !== previous)) invalid();
        return immutable({ schemaVersion: 1, jobs, nextAfterJobId: next });
      });
    },
    loadJob(jobId, { signal } = {}) {
      return invoke(async () => {
        const id = orderUuid(jobId); const value = await apiClient.request(`${ROOT}/${id}`, { signal });
        orderRecord(value, ['schemaVersion','job']);
        if (value.schemaVersion !== 1) invalid();
        return immutable({ schemaVersion: 1, job: job(value.job, { jobId: id }) });
      });
    },
    enqueue({ orderId, expectedOrderVersion, expectedStateRevision, expectedQuoteRevision } = {}) {
      return invoke(async () => {
        const body = { schemaVersion: 1, orderId: orderUuid(orderId), expectedOrderVersion: revision(expectedOrderVersion),
          expectedStateRevision: revision(expectedStateRevision, 1, Number.MAX_SAFE_INTEGER - 2),
          expectedQuoteRevision: revision(expectedQuoteRevision) };
        const value = await apiClient.request(ROOT, { method: 'POST', body });
        orderRecord(value, ['schemaVersion','replayed','job']);
        if (value.schemaVersion !== 1 || typeof value.replayed !== 'boolean') invalid();
        const saved = job(value.job, { orderId: body.orderId });
        if (saved.orderVersion !== body.expectedOrderVersion || saved.quoteRevision !== body.expectedQuoteRevision
          || (!value.replayed && (saved.revision !== 1 || saved.status !== 'queued' || saved.dispatchAttempts !== 0
            || saved.automaticReconciliationAttempts !== 0))) invalid();
        return immutable({ schemaVersion: 1, replayed: value.replayed, job: saved });
      });
    },
  });
}
