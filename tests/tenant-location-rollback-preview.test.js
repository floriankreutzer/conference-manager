import assert from 'node:assert/strict';
import test from 'node:test';

import {
  createLocationRollbackConfiguration,
  createLocationRollbackPreview,
} from '../src/tenant-admin/sections/locations/rollback-preview.js';
import { createDemoLocationSettings } from '../src/tenant-admin/sections/locations/demo-adapter.js';

const site = (id, active = true) => ({ id, name: id, active, timeZone: 'Europe/Berlin', address: null });
const room = (id, siteId, active = true, capacity = 10) => ({
  id, siteId, name: id, capacity, active, floor: null, equipment: [], accessibility: [],
  serviceIds: [], cateringPackageIds: [], floorplanAssetId: null, mediaAssetIds: [],
});

test('location rollback projection restores source values and retains newer identities inactive', () => {
  const source = {
    sites: [site('berlin')],
    rooms: [room('atlas', 'berlin')],
  };
  const current = {
    sites: [site('berlin'), site('munich')],
    rooms: [room('atlas', 'berlin', true, 18), room('orion', 'munich')],
  };

  assert.deepEqual(createLocationRollbackConfiguration(current, source), {
    sites: [site('berlin'), site('munich', false)],
    rooms: [room('atlas', 'berlin'), room('orion', 'munich', false)],
  });
  assert.deepEqual(createLocationRollbackPreview(current, source), {
    changedSites: 1,
    changedRooms: 2,
    retainedSites: 1,
    retainedRooms: 1,
  });
});

test('location Demo rollback creates a new revision with post-source identities inactive', async () => {
  const adapter = createDemoLocationSettings();
  const source = await adapter.loadLocations();
  await adapter.saveLocations({
    expectedRevision: 1,
    configuration: {
      sites: [...source.configuration.sites, site('munich')],
      rooms: [...source.configuration.rooms, room('orion', 'munich')],
    },
  });

  const restored = await adapter.rollbackLocations({ expectedRevision: 2, sourceRevision: 1 });
  assert.equal(restored.revision, 3);
  assert.equal(restored.configuration.sites.find(({ id }) => id === 'munich').active, false);
  assert.equal(restored.configuration.rooms.find(({ id }) => id === 'orion').active, false);
  assert.deepEqual((await adapter.listLocationsHistory()).map(({ revision }) => revision), [3, 2, 1]);
});
