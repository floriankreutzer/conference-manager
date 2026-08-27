import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const APP_PATH = 'src/app.js';

test('Composition Root injects all five settings domains through one explicit runtime branch', () => {
  const source = readFileSync(APP_PATH, 'utf8');
  assert.match(source, /from '\.\/platform\/tenant-settings-api\.js';/);
  assert.doesNotMatch(source, /from '\.\/platform\/tenant-(?:organization|location|catalogue|booking-policy|cost-allocation)-settings-api\.js';/);
  assert.doesNotMatch(source, /from '\.\/tenant-admin\/sections\//);
  const factories = [
    ['createDemoOrganizationSettings', 'createTenantOrganizationSettingsApi'],
    ['createDemoLocationSettings', 'createTenantLocationSettingsApi'],
    ['createDemoCatalogueSettings', 'createTenantCatalogueSettingsApi'],
    ['createDemoBookingPolicySettings', 'createTenantBookingPolicySettingsApi'],
    ['createDemoCostAllocationSettings', 'createTenantCostAllocationSettingsApi'],
  ];

  for (const [demoFactory, productionFactory] of factories) {
    assert.equal(source.split(demoFactory).length - 1, 2, `${demoFactory} must be imported and composed once`);
    assert.equal(source.split(productionFactory).length - 1, 2, `${productionFactory} must be imported and composed once`);
  }

  assert.match(source, /const tenantSettingsAdapters = context\.isDemoRuntime\(\)/);
  assert.match(source, /: \(context\.isTenantAdmin\(\) && authentication\s+\? Object\.freeze\(/);
  assert.match(source, /: Object\.freeze\(\{\}\)\);/);
  assert.match(source, /sectionAdapters: Object\.freeze\(\{\s+\.\.\.tenantSettingsAdapters,\s+users:/);
  assert.doesNotMatch(source, /createTenant\w+SettingsApi[\s\S]{0,120}(?:\|\||\?\?)\s*createDemo/);
});

test('settings factories are exposed through the approved Platform and Tenant Admin facades', () => {
  const platform = readFileSync('src/platform/tenant-settings-api.js', 'utf8');
  const tenantAdmin = readFileSync('src/tenant-admin/index.js', 'utf8');
  for (const factory of [
    'createTenantOrganizationSettingsApi',
    'createTenantLocationSettingsApi',
    'createTenantCatalogueSettingsApi',
    'createTenantBookingPolicySettingsApi',
    'createTenantCostAllocationSettingsApi',
  ]) assert.match(platform, new RegExp(`export \\{ ${factory} \\}`));
  for (const factory of [
    'createDemoOrganizationSettings',
    'createDemoLocationSettings',
    'createDemoCatalogueSettings',
    'createDemoBookingPolicySettings',
    'createDemoCostAllocationSettings',
  ]) assert.match(tenantAdmin, new RegExp(`\\b${factory}\\b`));
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
  assert.match(html, new RegExp(`src/app\\.js\\?v=${expectedMarker}`));
});
