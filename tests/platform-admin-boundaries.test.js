import test from 'node:test';
import assert from 'node:assert/strict';

import { platformAdminBoundaryViolations } from '../scripts/platform-admin-boundary-policy.mjs';

test('Platform Admin runtime graphs may share capability code without selecting each other', () => {
  const violations = platformAdminBoundaryViolations({
    'src/platform-admin/index.js': "export { app } from './application.js';",
    'src/platform-admin/application.js': 'export const app = true;',
    'src/platform-admin/production/bootstrap.js': "import { app } from '../index.js'; void app;",
    'src/platform-admin/demo/bootstrap.js': "import { app } from '../index.js'; void app;",
  });
  assert.deepEqual(violations, []);
});

test('customer imports and Production-to-Demo fallback paths are rejected', () => {
  const violations = platformAdminBoundaryViolations({
    'src/app.js': "import './platform-admin/index.js';",
    'src/platform-admin/index.js': 'export const platform = true;',
    'src/platform-admin/production/bootstrap.js': "import '../demo/fixtures.js';",
    'src/platform-admin/demo/fixtures.js': 'export const fixtures = [];',
  });
  assert.ok(violations.some((item) => item.includes('must not import Platform Admin authority')));
  assert.ok(violations.some((item) => item.includes('Production code must not import Demo module')));
  assert.ok(violations.some((item) => item.includes('Production reachability includes Demo module')));
});

test('Demo direct network/browser authority and Production browser authority are rejected', () => {
  const violations = platformAdminBoundaryViolations({
    'src/platform-admin/demo/bootstrap.js': "fetch('/api/platform');",
    'src/platform-admin/demo/operator-session.js': 'const session = sessionStorage.getItem("operator");',
    'src/platform-admin/production/bootstrap.js': "const session = localStorage.getItem('session');",
  });
  assert.ok(violations.some((item) => item.includes('approved same-origin API client')));
  assert.ok(violations.some((item) => item.includes('must not use browser storage as business or session authority')));
  assert.ok(violations.some((item) => item.includes('Production Platform Admin modules must not use browser storage')));
});

test('Demo API construction is limited to the Composition Root and retired stores stay forbidden', () => {
  const violations = platformAdminBoundaryViolations({
    'src/platform-admin/demo/operator-session.js': 'createApiClient();',
    'src/platform-admin/demo/legacy.js': 'createPlatformAdminDemoStore();',
  });
  assert.ok(violations.some((item) => item.includes('Only the Demo Composition Root')));
  assert.ok(violations.some((item) => item.includes('Retired browser-owned')));
});

test('shared Platform Admin code cannot select a runtime adapter or customer capability', () => {
  const violations = platformAdminBoundaryViolations({
    'src/platform-admin/application.js': [
      "import './demo/fixtures.js';",
      "import '../tenant-admin/index.js';",
    ].join('\n'),
    'src/platform-admin/demo/fixtures.js': 'export const fixtures = [];',
    'src/tenant-admin/index.js': 'export const tenantAdmin = true;',
  });
  assert.ok(violations.some((item) => item.includes('must not select a runtime adapter')));
  assert.ok(violations.some((item) => item.includes('must not depend on customer capability')));
});
