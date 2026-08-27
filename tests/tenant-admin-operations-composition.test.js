import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const APP_PATH = 'src/app.js';

test('Composition Root injects audit and capabilities through explicit fail-closed runtime branches', () => {
  const source = readFileSync(APP_PATH, 'utf8');
  for (const factory of [
    'createDemoTenantAudit',
    'createDemoTenantCapabilities',
    'createTenantAuditApi',
    'createTenantCapabilitiesApi',
  ]) assert.equal(source.split(factory).length - 1, 2, `${factory} must be imported and composed once`);

  assert.match(source, /const tenantAudit = context\.isDemoRuntime\(\)\s+\? createDemoTenantAudit\(\)\s+: \(context\.isTenantAdmin\(\) && authentication/s);
  assert.match(source, /const tenantCapabilities = context\.isDemoRuntime\(\)\s+\? createDemoTenantCapabilities\(\)\s+: \(context\.isTenantAdmin\(\) && authentication/s);
  assert.match(source, /capabilities: tenantCapabilities,\s+audit: tenantAudit,/);
  assert.doesNotMatch(source, /createTenant(?:Audit|Capabilities)Api[\s\S]{0,120}(?:\|\||\?\?)\s*createDemo/);
});

test('operations factories are exposed through approved Platform and Tenant Admin facades', () => {
  const app = readFileSync(APP_PATH, 'utf8');
  const platform = readFileSync('src/platform/tenant-admin-operations-api.js', 'utf8');
  const tenantAdmin = readFileSync('src/tenant-admin/index.js', 'utf8');
  assert.match(app, /from '\.\/platform\/tenant-admin-operations-api\.js';/);
  assert.doesNotMatch(app, /from '\.\/platform\/tenant-(?:audit|capabilities)-api\.js';/);
  assert.doesNotMatch(app, /from '\.\/tenant-admin\/demo-(?:tenant-audit|tenant-capabilities)\.js';/);
  assert.match(platform, /export \{ createTenantAuditApi \}/);
  assert.match(platform, /export \{ createTenantCapabilitiesApi \}/);
  assert.match(tenantAdmin, /\bcreateDemoTenantAudit\b/);
  assert.match(tenantAdmin, /\bcreateDemoTenantCapabilities\b/);
});

test('operations catalogue and stylesheet are part of canonical shared entry points', () => {
  const core = readFileSync('src/core/i18n.js', 'utf8');
  const i18nGate = readFileSync('scripts/check-i18n.mjs', 'utf8');
  const cssEntry = readFileSync('assets/app-layout.css', 'utf8');
  assert.match(core, /TENANT_ADMIN_OPERATIONS_MESSAGES\[targetLanguage\]/);
  assert.match(i18nGate, /TENANT_ADMIN_OPERATIONS_CATALOG_PATH/);
  assert.match(i18nGate, /readNamedFrozenCatalog\(TENANT_ADMIN_OPERATIONS_CATALOG_PATH/);
  assert.match(cssEntry, /@import url\('\.\/tenant-admin-operations\.css'\);/);
});

test('final application and layout cache markers match the combined build', () => {
  const app = readFileSync(APP_PATH, 'utf8');
  const html = readFileSync('index.html', 'utf8');
  const build = app.match(/const APP_BUILD = '(\d{4})\.(\d{2})\.(\d{2})\.(\d+)';/);
  assert.ok(build);
  const marker = `${build[1]}${build[2]}${build[3]}-${build[4]}`;
  assert.match(html, new RegExp(`src/app\\.js\\?v=${marker}`));
  assert.match(html, new RegExp(`assets/app-layout\\.css\\?v=${marker}`));
});
