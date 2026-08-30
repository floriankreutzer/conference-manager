import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const APP_PATH = 'src/app.js';

test('Composition Root injects all five server settings domains through one authorization branch', () => {
  const source = readFileSync(APP_PATH, 'utf8');
  assert.match(source, /from '\.\/platform\/server-tenant-settings-api\.js';/);
  assert.doesNotMatch(source, /from '\.\/platform\/tenant-(?:organization|location|catalogue|booking-policy|cost-allocation)-settings-api\.js';/);
  assert.doesNotMatch(source, /from '\.\/tenant-admin\/sections\//);
  const factories = [
    'createTenantOrganizationSettingsApi',
    'createTenantLocationSettingsApi',
    'createTenantCatalogueSettingsApi',
    'createTenantBookingPolicySettingsApi',
    'createTenantCostAllocationSettingsApi',
  ];

  for (const factory of factories) {
    assert.equal(source.split(factory).length - 1, 2, `${factory} must be imported and composed once`);
  }

  assert.match(source, /const tenantSettingsAdapters = context\.isTenantAdmin\(\) && authentication\s+\? Object\.freeze\(/);
  assert.match(source, /: Object\.freeze\(\{\}\);/);
  assert.match(source, /sectionAdapters: Object\.freeze\(\{\s+\.\.\.effectiveTenantSettingsAdapters,\s+users:/);
  assert.doesNotMatch(source, /createDemo|demo-adapter|demo-store|fixtures/);
});

test('settings factories are exposed through the server-only Platform facade', () => {
  const platform = readFileSync('src/platform/server-tenant-settings-api.js', 'utf8');
  const tenantAdmin = readFileSync('src/tenant-admin/index.js', 'utf8');
  for (const factory of [
    'createTenantOrganizationSettingsApi',
    'createTenantLocationSettingsApi',
    'createTenantCatalogueSettingsApi',
    'createTenantBookingPolicySettingsApi',
    'createTenantCostAllocationSettingsApi',
  ]) assert.match(platform, new RegExp(`export \\{ ${factory} \\}`));
  assert.doesNotMatch(tenantAdmin, /\bcreateDemo(?:Organization|Location|Catalogue|BookingPolicy|CostAllocation)Settings\b/);
});

test('domain messages are registered in Core and in the canonical i18n gate', () => {
  const core = readFileSync('src/core/i18n.js', 'utf8');
  const gate = readFileSync('scripts/check-i18n.mjs', 'utf8');
  assert.match(core, /import \{ TENANT_SETTINGS_DOMAIN_MESSAGES \} from '\.\/i18n-tenant-settings-domain-messages\.js';/);
  assert.match(core, /TENANT_SETTINGS_DOMAIN_MESSAGES\[targetLanguage\]/);
  assert.match(gate, /TENANT_SETTINGS_DOMAIN_CATALOG_PATH/);
  assert.match(gate, /readFrozenCatalog\(TENANT_SETTINGS_DOMAIN_CATALOG_PATH\)/);
});

test('application build and app-module cache markers remain coherent', () => {
  const app = readFileSync(APP_PATH, 'utf8');
  const html = readFileSync('index.html', 'utf8');
  const build = app.match(/const APP_BUILD = '(\d{4})\.(\d{2})\.(\d{2})\.(\d+)';/);
  assert.ok(build, 'APP_BUILD must use the repository date/revision convention');
  const expectedMarker = `${build[1]}${build[2]}${build[3]}-${build[4]}`;
  assert.match(html, new RegExp(`src/platform/demo-bootstrap\\.js\\?v=${expectedMarker}`));
});
