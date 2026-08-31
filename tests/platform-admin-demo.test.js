import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

test('Platform Admin Demo bootstraps only the server-backed session and API boundary', async () => {
  const bootstrap = await readFile('src/platform-admin/demo/bootstrap.js', 'utf8');
  assert.match(bootstrap, /createPlatformDemoSessionApi/);
  assert.match(bootstrap, /loadBoundedPlatformDemoSession/);
  assert.match(bootstrap, /createPlatformAdminApi/);
  for (const retiredAuthority of [
    'createPlatformAdminDemoStore',
    'platform_admin_demo_v1',
    'localStorage',
    'sessionStorage',
    './demo-adapter.js',
    './demo-store.js',
  ]) {
    assert.equal(bootstrap.includes(retiredAuthority), false);
  }
});

test('Platform Admin detail headings fall back to the canonical Tenant ID', async () => {
  const application = await readFile('src/platform-admin/application.js', 'utf8');

  assert.match(application, /`\$\{tenant\.reference \|\| tenant\.id\} · \$\{t\(definition\.titleKey\)\}`/);
});
