import assert from 'node:assert/strict';
import test from 'node:test';

import { TENANT_ADMIN_SETTINGS_MESSAGES } from '../src/core/i18n-tenant-admin-settings-messages.js';
import {
  tenantAdminHashForSection,
  tenantAdminSectionFromHash,
} from '../src/tenant-admin/settings-shell.js';
import {
  TENANT_ADMIN_SECTION_PERMISSION,
  defineTenantAdminSection,
} from '../src/tenant-admin/section-contract.js';

const section = (id, available = true) => defineTenantAdminSection({
  id,
  titleKey: `tenantAdmin.${id}.title`,
  descriptionKey: `tenantAdmin.${id}.description`,
  permission: TENANT_ADMIN_SECTION_PERMISSION.CONFIGURE,
  available,
  render() {},
});

test('Tenant Admin direct routes restore only registered and available sections', () => {
  const sections = [
    section('organization'),
    section('locations'),
    section('audit', false),
  ];
  assert.equal(
    tenantAdminSectionFromHash('#tenant-admin/locations', sections),
    'locations',
  );
  assert.equal(
    tenantAdminSectionFromHash('#tenant-admin/audit', sections),
    'overview',
  );
  assert.equal(
    tenantAdminSectionFromHash('#tenant-admin/unknown', sections),
    'overview',
  );
  assert.equal(
    tenantAdminSectionFromHash('#tenant-admin/%E0%A4%A', sections),
    'overview',
  );
});

test('Tenant Admin route generation is bounded to a hash route', () => {
  assert.equal(tenantAdminHashForSection('users'), '#tenant-admin/users');
  assert.equal(
    tenantAdminHashForSection('booking-policies'),
    '#tenant-admin/booking-policies',
  );
});

test('Tenant Admin settings localization stays synchronized in German and English', () => {
  const germanKeys = Object.keys(TENANT_ADMIN_SETTINGS_MESSAGES.de).sort();
  const englishKeys = Object.keys(TENANT_ADMIN_SETTINGS_MESSAGES.en).sort();
  assert.deepEqual(englishKeys, germanKeys);
  for (const key of germanKeys) {
    const germanTokens = [...TENANT_ADMIN_SETTINGS_MESSAGES.de[key].matchAll(/\{(\w+)\}/g)]
      .map((match) => match[1])
      .sort();
    const englishTokens = [...TENANT_ADMIN_SETTINGS_MESSAGES.en[key].matchAll(/\{(\w+)\}/g)]
      .map((match) => match[1])
      .sort();
    assert.deepEqual(englishTokens, germanTokens, key);
  }
});

test('section contracts reject unknown permissions and invalid identifiers', () => {
  assert.throws(() => defineTenantAdminSection({
    id: '../users',
    titleKey: 'tenantAdmin.users.title',
    descriptionKey: 'tenantAdmin.users.description',
    permission: TENANT_ADMIN_SECTION_PERMISSION.USERS_MANAGE,
    available: true,
    render() {},
  }), /TENANT_ADMIN_SECTION_ID_INVALID/);

  assert.throws(() => defineTenantAdminSection({
    id: 'users',
    titleKey: 'tenantAdmin.users.title',
    descriptionKey: 'tenantAdmin.users.description',
    permission: 'platform:operate',
    available: true,
    render() {},
  }), /TENANT_ADMIN_SECTION_PERMISSION_INVALID/);
});
