export const TENANT_SETTINGS_SCHEMA_VERSION = 1;
export const TENANT_SETTINGS_REVISION_CONFLICT = 'TENANT_SETTINGS_REVISION_CONFLICT';

function positiveRevision(value, errorCode) {
  if (!Number.isSafeInteger(value) || value < 1) throw new TypeError(errorCode);
  return value;
}

export function assertTenantSettingsSchemaVersion(value) {
  if (value !== TENANT_SETTINGS_SCHEMA_VERSION) {
    throw new TypeError('TENANT_SETTINGS_SCHEMA_VERSION_UNSUPPORTED');
  }
  return value;
}

export function assertTenantSettingsRevision(value) {
  return positiveRevision(value, 'TENANT_SETTINGS_REVISION_INVALID');
}

export function tenantSettingsConflictRevision(error) {
  if (
    !error
    || error.code !== 'HTTP_409'
    || error.serverCode !== TENANT_SETTINGS_REVISION_CONFLICT
  ) return null;
  return Number.isSafeInteger(error.currentRevision) && error.currentRevision > 0
    ? error.currentRevision
    : null;
}

export class TenantSettingsRevisionConflictError extends Error {
  constructor(currentRevision) {
    super(TENANT_SETTINGS_REVISION_CONFLICT);
    this.name = 'TenantSettingsRevisionConflictError';
    this.code = TENANT_SETTINGS_REVISION_CONFLICT;
    this.currentRevision = assertTenantSettingsRevision(currentRevision);
  }
}

export function createDemoTenantSettingsRevision({ initialRevision = 1 } = {}) {
  const baseline = assertTenantSettingsRevision(initialRevision);
  let revision = baseline;

  const assertExpected = (expectedRevision) => {
    const expected = assertTenantSettingsRevision(expectedRevision);
    if (expected !== revision) throw new TenantSettingsRevisionConflictError(revision);
    return expected;
  };

  return Object.freeze({
    current() {
      return revision;
    },
    assertExpected,
    advance(expectedRevision) {
      assertExpected(expectedRevision);
      if (revision === Number.MAX_SAFE_INTEGER) {
        throw new TypeError('TENANT_SETTINGS_REVISION_EXHAUSTED');
      }
      revision += 1;
      return revision;
    },
    reset() {
      revision = baseline;
      return revision;
    },
  });
}
