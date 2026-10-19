import { adapterError, immutable } from './tenant-settings-wire.js';
import { orderInstant, orderInteger, orderRecord, orderUuid } from './catering-order-wire.js';

const INVALID = 'CATERING_HEALTH_RESPONSE_INVALID';
const PHASES = ['queued','processing','awaiting_confirmation','manual_action','reconciliation','conflict',
  'settled','failed','superseded','paused'];
function invalid() { throw new CateringOperationalHealthApiError(INVALID); }
export class CateringOperationalHealthApiError extends Error {
  constructor(code, { cause, serverCode = null } = {}) {
    super(code, cause === undefined ? undefined : { cause });
    this.name = 'CateringOperationalHealthApiError'; this.code = code; this.serverCode = serverCode;
  }
}
function summary(value, integrationId, expectedRevision) {
  orderRecord(value, ['schemaVersion','integrationId','providerId','configurationRevision','observedAt','state',
    'dispatchEnabled','availability','coverage','counts','expiredLeaseCount','oldestOpenAt']);
  if (value.schemaVersion !== 1 || value.integrationId !== integrationId || value.providerId !== 'manual_catering'
    || typeof value.dispatchEnabled !== 'boolean') invalid();
  const revision = orderInteger(value.configurationRevision, 1);
  if (revision !== expectedRevision) throw new CateringOperationalHealthApiError('CATERING_HEALTH_CONFIGURATION_CHANGED');
  const observedAt = orderInstant(value.observedAt);
  orderRecord(value.availability, ['connection','tenantBusiness']);
  if (typeof value.availability.connection !== 'boolean' || typeof value.availability.tenantBusiness !== 'boolean') invalid();
  orderRecord(value.coverage, ['limit','complete']);
  if (value.coverage.limit !== 1000 || typeof value.coverage.complete !== 'boolean') invalid();
  orderRecord(value.counts, PHASES);
  const counts = Object.fromEntries(PHASES.map((key) => [key, orderInteger(value.counts[key], 0, 1000)]));
  const total = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const expiredLeaseCount = orderInteger(value.expiredLeaseCount, 0, counts.processing + counts.reconciliation);
  const open = total - counts.settled - counts.superseded;
  const oldestOpenAt = value.oldestOpenAt === null ? null : orderInstant(value.oldestOpenAt);
  if (total > 1000 || (!value.coverage.complete && total !== 1000)
    || (oldestOpenAt === null) !== (open === 0)) invalid();
  const attention = counts.reconciliation + counts.conflict + counts.failed + counts.paused + expiredLeaseCount > 0;
  const state = attention ? 'attention'
    : !value.availability.connection || !value.availability.tenantBusiness || !value.dispatchEnabled ? 'disabled'
      : !value.coverage.complete ? 'incomplete' : counts.manual_action > 0 ? 'manual_action'
        : counts.queued + counts.processing + counts.awaiting_confirmation > 0 ? 'working' : 'idle';
  if (value.state !== state) invalid();
  return immutable({ schemaVersion: 1, integrationId, providerId: value.providerId, configurationRevision: revision,
    observedAt, state, dispatchEnabled: value.dispatchEnabled, availability: value.availability, coverage: value.coverage,
    counts, expiredLeaseCount, oldestOpenAt });
}

export function createCateringOperationalHealthApi({ apiClient } = {}) {
  if (typeof apiClient?.request !== 'function') throw new TypeError('CATERING_API_CLIENT_REQUIRED');
  return Object.freeze({
    async loadOperationalHealth({ integrationId, expectedRevision, signal } = {}) {
      try {
        const id = orderUuid(integrationId); const revision = orderInteger(expectedRevision, 1);
        return summary(await apiClient.request(`v1/integrations/catering/${id}/health`, { signal }), id, revision);
      } catch (error) {
        if (error?.code === 'CATERING_ORDER_RESPONSE_INVALID') throw new CateringOperationalHealthApiError(INVALID, { cause: error });
        throw adapterError(CateringOperationalHealthApiError, error, 'CATERING_HEALTH_UNAVAILABLE');
      }
    },
  });
}
