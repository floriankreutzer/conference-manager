import { adapterError, immutable, safeId } from './tenant-settings-wire.js';
import { orderArray, orderInstant, orderInteger, orderMoney, orderRecord, orderUuid } from './catering-order-wire.js';

const INVALID = 'CATERING_VERSION_RESPONSE_INVALID';
const OPERATIONS = ['change','cancel','exception'];
const STATES = ['pending_quote','pending_manager_review','released','queued','dispatching','reconciliation_required',
  'transmitted','confirmed','partially_confirmed','rejected','cancelled','failed'];
const count = (value, minimum = 1) => orderInteger(value, minimum);
function invalid() { throw new CateringVersionApiError(INVALID); }
function reason(value) {
  if (typeof value !== 'string' || value !== value.trim() || !value.length || value.length > 1000
    || /[\u0000-\u001f\u007f]/.test(value)) invalid();
  return value;
}
function state(value) {
  orderRecord(value, ['orderVersion','revision','status']);
  if (!STATES.includes(value.status)) invalid();
  return { orderVersion: count(value.orderVersion), revision: count(value.revision), status: value.status };
}
function proposal(value, orderId) {
  orderRecord(value, ['orderId','orderVersion','priorOrderVersion','basisOrderVersion','operation','requestId',
    'requestEvidenceVersion','requestEvidenceStatus','sourceRequestVersion','assignmentRevision','configurationRevision',
    'justification','proposedAt']);
  if (value.orderId !== orderId || !OPERATIONS.includes(value.operation)
    || count(value.orderVersion, 2) !== count(value.priorOrderVersion) + 1
    || count(value.basisOrderVersion) > value.priorOrderVersion
    || !['Confirmed','Cancelled'].includes(value.requestEvidenceStatus)
    || (value.operation !== 'cancel' && value.requestEvidenceStatus !== 'Confirmed')
    || count(value.sourceRequestVersion) > count(value.requestEvidenceVersion)
    || (value.operation !== 'cancel' && value.sourceRequestVersion !== value.requestEvidenceVersion)) invalid();
  return { ...value, requestId: safeId(value.requestId, INVALID), assignmentRevision: count(value.assignmentRevision),
    configurationRevision: count(value.configurationRevision), justification: reason(value.justification),
    proposedAt: orderInstant(value.proposedAt) };
}
export class CateringVersionApiError extends Error {
  constructor(code, { cause, serverCode = null } = {}) {
    super(code, cause === undefined ? undefined : { cause }); this.name = 'CateringVersionApiError';
    this.code = code; this.serverCode = serverCode;
  }
}
export function createCateringVersionApi({ apiClient } = {}) {
  if (typeof apiClient?.request !== 'function') throw new TypeError('CATERING_API_CLIENT_REQUIRED');
  const invoke = async (work) => {
    try { return await work(); }
    catch (error) {
      if (error?.code === 'CATERING_ORDER_RESPONSE_INVALID') throw new CateringVersionApiError(INVALID, { cause: error });
      throw adapterError(CateringVersionApiError, error, 'CATERING_VERSION_UNAVAILABLE');
    }
  };
  const path = (orderId) => `v1/tenant/catering/orders/${orderId}/versions`;
  return Object.freeze({
    loadVersionProposals({ orderId, afterOrderVersion = 1, signal } = {}) {
      return invoke(async () => {
        const id = orderUuid(orderId); const after = count(afterOrderVersion);
        const value = await apiClient.request(`${path(id)}?afterOrderVersion=${after}`, { signal });
        orderRecord(value, ['schemaVersion','orderId','requestId','orderState','currentRequest','currentAssignmentRevision',
          'basis','allowedOperations','proposals','nextAfterOrderVersion']);
        if (value.schemaVersion !== 1 || value.orderId !== id) invalid();
        const requestId = safeId(value.requestId, INVALID); const current = state(value.orderState);
        const assignment = count(value.currentAssignmentRevision, 0); let request = null; let basis = null;
        if (value.currentRequest !== null) {
          orderRecord(value.currentRequest, ['version','status']);
          if (!['Confirmed','Cancelled'].includes(value.currentRequest.status)) invalid();
          request = { version: count(value.currentRequest.version), status: value.currentRequest.status };
        }
        if (value.basis !== null) {
          orderRecord(value.basis, ['orderVersion','status','requestVersion','assignmentRevision','providerCost']);
          if (!['confirmed','cancelled'].includes(value.basis.status) || count(value.basis.orderVersion) > current.orderVersion
            || (request && count(value.basis.requestVersion) > request.version)) invalid();
          basis = { orderVersion: value.basis.orderVersion, status: value.basis.status,
            requestVersion: count(value.basis.requestVersion), assignmentRevision: count(value.basis.assignmentRevision),
            providerCost: orderMoney(value.basis.providerCost) };
        }
        const allowed = orderArray(value.allowedOperations, 3).map((operation) => {
          if (!OPERATIONS.includes(operation) || !basis || basis.status !== 'confirmed' || !request
            || !['confirmed','rejected','failed'].includes(current.status)
            || (current.status === 'confirmed' && current.orderVersion !== basis.orderVersion)
            || (operation !== 'cancel' && request.status !== 'Confirmed')
            || (operation === 'change' && (request.version === basis.requestVersion || assignment === 0))
            || (operation === 'exception' && request.version !== basis.requestVersion)) invalid();
          return operation;
        });
        if (new Set(allowed).size !== allowed.length) invalid();
        let previous = after;
        const proposals = orderArray(value.proposals, 20).map((entry) => {
          const saved = proposal(entry, id);
          if (saved.orderVersion !== previous + 1 || saved.orderVersion > current.orderVersion || saved.requestId !== requestId) invalid();
          previous = saved.orderVersion; return saved;
        });
        if (proposals.length !== Math.min(20, Math.max(0, current.orderVersion - after))) invalid();
        const next = current.orderVersion > previous ? previous : null;
        if (value.nextAfterOrderVersion !== next) invalid();
        return immutable({ schemaVersion: 1, orderId: id, requestId, orderState: current, currentRequest: request,
          currentAssignmentRevision: assignment, basis, allowedOperations: allowed, proposals, nextAfterOrderVersion: next });
      });
    },
    proposeVersion({ orderId, commandId, expectedOrderVersion, expectedStateRevision, expectedRequestVersion,
      expectedAssignmentRevision, operation, justification } = {}) {
      return invoke(async () => {
        const id = orderUuid(orderId);
        if (!OPERATIONS.includes(operation)) invalid();
        const body = { schemaVersion: 1, commandId: orderUuid(commandId), expectedOrderVersion: count(expectedOrderVersion),
          expectedStateRevision: count(expectedStateRevision), expectedRequestVersion: count(expectedRequestVersion),
          expectedAssignmentRevision: count(expectedAssignmentRevision), operation, justification: reason(justification) };
        const value = await apiClient.request(path(id), { method: 'POST', body });
        orderRecord(value, ['schemaVersion','replayed','proposal','orderState']);
        if (value.schemaVersion !== 1 || typeof value.replayed !== 'boolean') invalid();
        const saved = proposal(value.proposal, id); const current = state(value.orderState);
        if (saved.priorOrderVersion !== body.expectedOrderVersion || saved.requestEvidenceVersion !== body.expectedRequestVersion
          || saved.assignmentRevision !== body.expectedAssignmentRevision || saved.operation !== body.operation
          || saved.justification !== body.justification || current.orderVersion !== saved.orderVersion
          || (!value.replayed && (current.revision !== 1 || current.status !== 'pending_quote'))) invalid();
        return immutable({ schemaVersion: 1, replayed: value.replayed, proposal: saved, orderState: current });
      });
    },
  });
}
