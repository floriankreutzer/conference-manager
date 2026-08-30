import assert from 'node:assert/strict';
import test from 'node:test';
import { customerDemoBoundaryViolations } from '../scripts/customer-demo-boundary-policy.mjs';

test('Customer Production and Demo roots share only server-authoritative composition', () => {
  const violations = customerDemoBoundaryViolations({
    'src/app.js': "import './employee/server.js';",
    'src/employee/server.js': 'export const employee = true;',
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

test('language preference storage remains a bounded non-authoritative exception', () => {
  const violations = customerDemoBoundaryViolations({
    'src/platform/demo-bootstrap.js': "import '../core/preferences.js';",
    'src/core/preferences.js': "export const language = localStorage.getItem('language');",
  });
  assert.deepEqual(violations, []);
});
