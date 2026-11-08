import assert from 'node:assert/strict';
import test from 'node:test';
import { locationOverview } from '../src/tenant-admin/overview-model.js';

test('setup overview counts only active rooms at active sites and explicitly published guest information', () => {
  assert.deepEqual(locationOverview({ sites: [
    { id: 'active', active: true, guestInformation: null },
    { id: 'published', active: true, guestInformation: { schemaVersion: 1 } },
    { id: 'inactive', active: false, guestInformation: null },
  ], rooms: [
    { siteId: 'active', active: true }, { siteId: 'active', active: false },
    { siteId: 'published', active: true }, { siteId: 'inactive', active: true },
    { siteId: 'missing', active: true },
  ] }), { activeRooms: 2, missingGuestSites: 1 });
  assert.deepEqual(locationOverview({ sites: [], rooms: [] }), { activeRooms: 0, missingGuestSites: 0 });
});
