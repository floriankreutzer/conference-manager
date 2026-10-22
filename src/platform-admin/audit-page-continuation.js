// Pages are already normalized by the data source. Never relabel retained events
// with a later response's different verification context.
export function assertPlatformAuditContinuation(previous, next) {
  if (previous.schemaVersion !== next.schemaVersion
    || (next.schemaVersion === 2 && (previous.audit.segmentId !== next.audit.segmentId
      || previous.audit.verification !== next.audit.verification
      || previous.audit.legacy.eventCount !== next.audit.legacy.eventCount
      || previous.audit.legacy.verification !== next.audit.legacy.verification))) {
    throw new TypeError('PLATFORM_AUDIT_CONTEXT_CHANGED');
  }
}
