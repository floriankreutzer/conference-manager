import assert from 'node:assert/strict';
import test from 'node:test';
import { createTenantLocationSettingsApi } from '../src/platform/tenant-location-settings-api.js';
import { createDemoLocationSettings } from '../src/tenant-admin/sections/locations/demo-adapter.js';

const site = {
  id: 'site-a', name: 'Site A', active: true, timeZone: 'Europe/Berlin', address: null,
};

test('Production bulk adapter uses only aggregate-owned exact endpoints', async () => {
  const calls = [];
  const api = createTenantLocationSettingsApi({
    apiClient: {
      async request(path, options = {}) {
        calls.push({ path, options });
        if (path.endsWith('/template')) return { schemaVersion: 1, type: 'sites', rows: [] };
        if (path.endsWith('/export')) {
          return { revision: 1, document: { schemaVersion: 1, type: 'sites', rows: [site] } };
        }
        if (path.endsWith('/validate')) {
          return {
            schemaVersion: 1, valid: true, changed: true, sourceRevision: 1, errors: [],
            receipt: { id: '00000000-0000-4000-8000-000000000001', expiresAt: '2026-08-27T12:30:00.000Z' },
          };
        }
        throw new Error('UNEXPECTED_CALL');
      },
    },
  });
  const document = { schemaVersion: 1, type: 'sites', rows: [site] };
  assert.equal((await api.loadBulkTemplate('sites')).rows.length, 0);
  assert.equal((await api.exportBulk('sites')).revision, 1);
  assert.equal((await api.validateBulk('sites', document)).changed, true);
  assert.deepEqual(calls.map(({ path }) => path), [
    'v1/tenant/settings/locations/bulk/sites/template',
    'v1/tenant/settings/locations/bulk/sites/export',
    'v1/tenant/settings/locations/bulk/sites/validate',
  ]);
  assert.equal(calls[2].options.method, 'POST');
  assert.deepEqual(calls[2].options.body, { document });
  await assert.rejects(() => api.loadBulkTemplate('services'), /TENANT_BULK_TYPE_INVALID/);
});

test('Demo bulk flow validates, applies once, replays, and resets deterministically', async () => {
  const demo = createDemoLocationSettings();
  const before = await demo.loadLocations();
  const document = {
    schemaVersion: 1,
    type: 'sites',
    rows: [{ ...before.configuration.sites[0], name: 'Bulk updated' }],
  };
  const validated = await demo.validateBulk('sites', document);
  const applied = await demo.applyBulk('sites', document, validated.receipt.id);
  const replay = await demo.applyBulk('sites', document, validated.receipt.id);
  assert.equal(applied.revision, 2);
  assert.deepEqual(replay, applied);
  assert.equal((await demo.loadLocations()).configuration.sites[0].name, 'Bulk updated');
  demo.reset();
  assert.deepEqual(await demo.loadLocations(), before);
});
