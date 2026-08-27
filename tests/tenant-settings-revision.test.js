import assert from 'node:assert/strict';
import test from 'node:test';

import {
  TENANT_SETTINGS_REVISION_CONFLICT,
  TenantSettingsRevisionConflictError,
  assertTenantSettingsRevision,
  assertTenantSettingsSchemaVersion,
  createDemoTenantSettingsRevision,
  tenantSettingsConflictRevision,
} from '../src/tenant-admin/settings-revision.js';

test('Tenant settings schema and revision primitives fail closed for unknown values', () => {
  assert.equal(assertTenantSettingsSchemaVersion(1), 1);
  for (const value of [undefined, null, 0, 2, '1']) {
    assert.throws(() => assertTenantSettingsSchemaVersion(value), /TENANT_SETTINGS_SCHEMA_VERSION_UNSUPPORTED/);
  }
  assert.equal(assertTenantSettingsRevision(1), 1);
  for (const value of [undefined, null, 0, -1, 1.5, '1', Number.MAX_SAFE_INTEGER + 1]) {
    assert.throws(() => assertTenantSettingsRevision(value), /TENANT_SETTINGS_REVISION_INVALID/);
  }
});

test('Demo revision primitive advances one aggregate and resets deterministically', () => {
  const revision = createDemoTenantSettingsRevision();
  const detachedAdvance = revision.advance;
  assert.equal(revision.current(), 1);
  assert.equal(detachedAdvance(1), 2);
  assert.equal(revision.current(), 2);
  assert.throws(
    () => revision.advance(1),
    (error) => error instanceof TenantSettingsRevisionConflictError
      && error.code === TENANT_SETTINGS_REVISION_CONFLICT
      && error.currentRevision === 2,
  );
  assert.equal(revision.current(), 2);
  assert.equal(revision.reset(), 1);
});

test('Demo revision primitive rejects overflow without changing authoritative state', () => {
  const revision = createDemoTenantSettingsRevision({ initialRevision: Number.MAX_SAFE_INTEGER });
  assert.throws(() => revision.advance(Number.MAX_SAFE_INTEGER), /TENANT_SETTINGS_REVISION_EXHAUSTED/);
  assert.equal(revision.current(), Number.MAX_SAFE_INTEGER);
});

test('Production conflict extraction accepts only the bounded revision error contract', () => {
  assert.equal(tenantSettingsConflictRevision({
    code: 'HTTP_409',
    serverCode: TENANT_SETTINGS_REVISION_CONFLICT,
    currentRevision: 7,
  }), 7);
  for (const error of [
    null,
    { code: 'HTTP_400', serverCode: TENANT_SETTINGS_REVISION_CONFLICT, currentRevision: 7 },
    { code: 'HTTP_409', serverCode: 'OTHER_CONFLICT', currentRevision: 7 },
    { code: 'HTTP_409', serverCode: TENANT_SETTINGS_REVISION_CONFLICT, currentRevision: 0 },
    { code: 'HTTP_409', serverCode: TENANT_SETTINGS_REVISION_CONFLICT, currentRevision: '7' },
  ]) assert.equal(tenantSettingsConflictRevision(error), null);
});
