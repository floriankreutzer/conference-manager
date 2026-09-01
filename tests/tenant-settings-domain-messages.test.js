import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

import { MANAGER_SETTINGS_MESSAGES } from '../src/core/i18n-manager-settings-messages.js';
import { TENANT_SETTINGS_DOMAIN_MESSAGES } from '../src/core/i18n-tenant-settings-domain-messages.js';

test('Tenant settings domain messages stay synchronized with matching interpolation tokens', () => {
  const germanKeys = Object.keys(TENANT_SETTINGS_DOMAIN_MESSAGES.de).sort();
  const englishKeys = Object.keys(TENANT_SETTINGS_DOMAIN_MESSAGES.en).sort();
  assert.deepEqual(englishKeys, germanKeys);
  germanKeys.forEach((key) => {
    const tokens = (value) => [...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();
    assert.deepEqual(tokens(TENANT_SETTINGS_DOMAIN_MESSAGES.de[key]), tokens(TENANT_SETTINGS_DOMAIN_MESSAGES.en[key]), key);
  });
});

test('Tenant settings sections use the canonical translator and never interpolate localized UI copy themselves', () => {
  const files = ['organization', 'locations', 'booking-policies', 'cost-allocation']
    .map((section) => readFileSync(`src/tenant-admin/sections/${section}/index.js`, 'utf8'));
  files.forEach((source) => {
    assert.match(source, /from '\.\.\/\.\.\/\.\.\/core\/i18n\.js'/);
    assert.doesNotMatch(source, /innerHTML|insertAdjacentHTML|document\.write/);
    for (const match of source.matchAll(/t\('(tenantSettings\.[^']+)'/g)) {
      assert.equal(Object.hasOwn(TENANT_SETTINGS_DOMAIN_MESSAGES.de, match[1]), true, match[1]);
    }
  });
  for (const key of [
    'tenantSettings.catalogue.category.services',
    'tenantSettings.catalogue.category.equipment',
    'tenantSettings.catalogue.category.cateringItems',
    'tenantSettings.catalogue.category.cateringPackages',
    'tenantSettings.locations.providerState.active',
    'tenantSettings.locations.providerState.missing',
  ]) assert.equal(Object.hasOwn(TENANT_SETTINGS_DOMAIN_MESSAGES.de, key), true, key);
});

test('Conference Manager business settings use the canonical translator without unsafe HTML sinks', () => {
  const source = readFileSync('src/manager/business-settings-application.js', 'utf8');
  assert.match(source, /from '\.\.\/core\/i18n\.js'/);
  assert.doesNotMatch(source, /innerHTML|insertAdjacentHTML|document\.write/);
  for (const match of source.matchAll(/t\('(managerSettings\.[^']+)'/g)) {
    assert.equal(Object.hasOwn(MANAGER_SETTINGS_MESSAGES.de, match[1]), true, match[1]);
  }
  assert.deepEqual(
    Object.keys(MANAGER_SETTINGS_MESSAGES.en).sort(),
    Object.keys(MANAGER_SETTINGS_MESSAGES.de).sort(),
  );
});

test('remaining Tenant Admin Demo domain adapters are in-memory only and cannot import Production or browser persistence', () => {
  for (const section of ['organization', 'locations', 'booking-policies', 'cost-allocation']) {
    const source = readFileSync(`src/tenant-admin/sections/${section}/demo-adapter.js`, 'utf8');
    assert.doesNotMatch(source, /platform|apiClient|fetch\(|localStorage|sessionStorage|indexedDB/i);
    assert.match(source, /reset/);
  }
});
