import test from 'node:test';
import assert from 'node:assert/strict';
import { buildModuleGraph, findModuleCycles, moduleSpecifiers } from '../scripts/module-graph.mjs';
import { frontendSaas2BoundaryViolations } from '../scripts/saas2-boundary-policy.mjs';

test('module graph parses executable static, root and dynamic imports only', () => {
  const source = [
    "// import './ignored-comment.js';",
    "const example = \"import('./ignored-string.js')\";",
    "const pattern = /import\\(['\"]\\.\\/ignored-regex\\.js['\"]\\)/;",
    "import '/src/a.js';",
    "export { x } from './b.js';",
    "import(`./c.js`);",
  ].join('\n');
  assert.deepEqual(moduleSpecifiers(source), ['/src/a.js', './b.js', './c.js']);

  const { graph, unresolved } = buildModuleGraph({
    'src/index.js': source,
    'src/a.js': 'export const a = true;',
    'src/b.js': 'export const x = true;',
    'src/c.js': 'export const c = true;',
  });
  assert.deepEqual(graph.get('src/index.js'), ['src/a.js', 'src/b.js', 'src/c.js']);
  assert.deepEqual(unresolved, []);
});

test('module graph rejects circular dependencies', () => {
  const { graph } = buildModuleGraph({
    'src/a.js': "import './b.js';",
    'src/b.js': "import './a.js';",
  });
  assert.equal(findModuleCycles(graph).length, 1);
});

test('valid Tenant Admin section composition uses public contracts and injected adapters', () => {
  const violations = frontendSaas2BoundaryViolations({
    'src/tenant-admin/settings-shell.js': [
      "import { createLocationsSection } from './sections/locations/index.js';",
      'export { createLocationsSection };',
    ].join('\n'),
    'src/tenant-admin/sections/locations/index.js': "export { createLocationsSection } from './application.js';",
    'src/tenant-admin/sections/locations/application.js': [
      "import { t } from '../../../core/i18n.js';",
      "export const createLocationsSection = (adapter) => ({ adapter, title: t('nav.tenantAdmin') });",
    ].join('\n'),
    'src/core/i18n.js': 'export const t = (key) => key;',
  });
  assert.deepEqual(violations, []);
});

test('root-relative private cross-section imports and Platform access fail closed', () => {
  const violations = frontendSaas2BoundaryViolations({
    'src/tenant-admin/sections/catalog/index.js': "export * from './application.js';",
    'src/tenant-admin/sections/catalog/application.js': [
      "import '/src/tenant-admin/sections/locations/private.js';",
      "import '/src/platform/api-client.js';",
    ].join('\n'),
    'src/tenant-admin/sections/locations/index.js': "export * from './private.js';",
    'src/tenant-admin/sections/locations/private.js': 'export const location = true;',
    'src/platform/api-client.js': 'export const api = true;',
  });
  assert.ok(violations.some((item) => item.includes('section internals are private')));
  assert.ok(violations.some((item) => item.includes('must not depend on another section')));
  assert.ok(violations.some((item) => item.includes('may not import Platform directly')));
});

test('Production adapters cannot import demo.js implementations', () => {
  const violations = frontendSaas2BoundaryViolations({
    'src/tenant-admin/production-adapter.js': "import './demo.js';",
    'src/tenant-admin/demo.js': 'export const demo = true;',
  });
  assert.ok(violations.some((item) => item.includes('Production code must not import Demo module')));
});
