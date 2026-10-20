import assert from 'node:assert/strict';
import test from 'node:test';
import { customerDemoBoundaryViolations } from '../scripts/customer-demo-boundary-policy.mjs';

test('Customer Demo rejects invitation transport directly and transitively',() => {
  for (const bridge of [false,true]) {
    const source={
      'src/platform/demo-bootstrap.js': bridge ? "import './invitation-bridge.js';" : "import './customer-invitations/client.js';",
      'src/platform/customer-invitations/client.js': 'export const client = true;',
      ...(bridge ? { 'src/platform/invitation-bridge.js': "import './customer-invitations/client.js';" } : {}),
    };
    assert.ok(customerDemoBoundaryViolations(source).some(item => item.includes('must not reach real Customer invitation transport')));
  }
});

test('Customer Demo rejects invited identity transport and presentation through direct and shared imports', () => {
  for (const name of ['client','controller','view','bootstrap']) {
    const target=`src/platform/customer-authentication/${name}.js`;
    for (const bridge of [false,true]) {
      const source={
        'src/platform/demo-bootstrap.js': bridge ? "import './shared-sign-in.js';" : `import './customer-authentication/${name}.js';`,
        [target]: 'export const identity = true;',
        ...(bridge ? { 'src/platform/shared-sign-in.js': `import './customer-authentication/${name}.js';` } : {}),
      };
      assert.ok(customerDemoBoundaryViolations(source).some(item => item.includes('must not reach invited Customer authentication')));
    }
  }
});

test('Customer Production and Demo roots share only server-authoritative composition', () => {
  const violations = customerDemoBoundaryViolations({
    'src/app.js': "import './employee/index.js';",
    'src/employee/index.js': "export { createProductionEmployeeApplication as createEmployeeApplication } from './production-application.js';",
    'src/employee/production-application.js': 'export function createProductionEmployeeApplication() {}',
    'src/platform/production-bootstrap.js': "import '../app.js';",
    'src/platform/demo-bootstrap.js': "import '../app.js'; import './demo-session.js';",
    'src/platform/demo-session.js': 'export const session = true;',
  });
  assert.deepEqual(violations, []);
});

test('Production reachability into Customer Demo modules is rejected', () => {
  const violations = customerDemoBoundaryViolations({
    'src/platform/production-bootstrap.js': "import './demo-session.js';",
    'src/platform/demo-session.js': 'export const session = true;',
  });
  assert.ok(violations.some((item) => item.includes('Production reachability includes Demo module')));
  assert.ok(violations.some((item) => item.includes('Production code must not import Demo module')));
});

test('Customer Demo browser storage and retired local business authority are rejected', () => {
  const violations = customerDemoBoundaryViolations({
    'src/platform/demo-bootstrap.js': "import '../core/storage.js'; import '../employee/application.js';",
    'src/core/storage.js': "const tenant = localStorage.getItem('tenant'); export { tenant };",
    'src/employee/application.js': 'export function createEmployeeApplication() {}',
  });
  assert.ok(violations.some((item) => item.includes('must not use browser storage')));
  assert.ok(violations.some((item) => item.includes('retired browser authority')));
});

test('unreachable retired renderer source is rejected instead of treated as a dormant fallback', () => {
  const violations = customerDemoBoundaryViolations({
    'src/platform/demo-bootstrap.js': "import '../app.js';",
    'src/platform/production-bootstrap.js': "import '../app.js';",
    'src/app.js': 'export const app = true;',
    'src/manager/application.js': 'export function createManagerApplication() {}',
  });
  assert.ok(violations.some((item) => (
    item.startsWith('src/manager/application.js:')
    && item.includes('must not be reintroduced')
  )));
});

test('language preference storage remains a bounded non-authoritative exception', () => {
  const violations = customerDemoBoundaryViolations({
    'src/platform/demo-bootstrap.js': "import '../core/preferences.js';",
    'src/core/preferences.js': "export const language = localStorage.getItem('language');",
  });
  assert.deepEqual(violations, []);
});

test('scoped server draft storage is the only Employee browser-storage exception', () => {
  const approved = customerDemoBoundaryViolations({
    'src/platform/demo-bootstrap.js': "import '../employee/server-draft-store.js';",
    'src/employee/server-draft-store.js': 'export const storage = globalThis.sessionStorage;',
  });
  assert.deepEqual(approved, []);

  const rejected = customerDemoBoundaryViolations({
    'src/platform/demo-bootstrap.js': "import '../employee/another-store.js';",
    'src/employee/another-store.js': 'export const storage = globalThis.sessionStorage;',
  });
  assert.ok(rejected.some((item) => item.includes('must not use browser storage')));
});
