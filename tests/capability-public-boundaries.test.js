import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('canonical capability facades expose one server-authoritative application factory', async () => {
  const [employee, manager, workspace] = await Promise.all([
    readFile(new URL('../src/employee/index.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/manager/index.js', import.meta.url), 'utf8'),
    readFile(new URL('../src/manager/workspace-application.js', import.meta.url), 'utf8'),
  ]);
  assert.match(employee, /createProductionEmployeeApplication as createEmployeeApplication/);
  assert.match(employee, /createProductionEmployeeApplication as createServerEmployeeApplication/);
  assert.doesNotMatch(employee, /from '\.\/application\.js'/);
  assert.doesNotMatch(employee, /employee-(?:ux|visuals|accessibility|first-use)|welcome-print/);
  assert.match(manager, /createProductionManagerApplication as createManagerApplication/);
  assert.match(manager, /createManagerWorkspaceApplication as createServerManagerApplication/);
  assert.match(workspace, /createProductionManagerApplication/);
  assert.match(workspace, /createManagerBusinessSettingsApplication/);
  assert.doesNotMatch(manager, /from '\.\/application\.js'/);
  assert.doesNotMatch(manager, /manager-(?:parity|responsive|first-use|ux|operational|final)|admin-parity/);
});

test('Composition Root imports Employee and Manager only through canonical facades', async () => {
  const app = await readFile(new URL('../src/app.js', import.meta.url), 'utf8');
  assert.match(app, /from '\.\/employee\/index\.js';/);
  assert.match(app, /from '\.\/manager\/index\.js';/);
  assert.doesNotMatch(app, /from '\.\/(?:employee|manager)\/(?!index\.js)[^']+';/);
});
