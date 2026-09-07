import assert from 'node:assert/strict';
import test from 'node:test';
import {
  projectRoomBusinessConfiguration,
  projectTechnicalLocationConfiguration,
} from '../src/core/tenant-location-ownership.js';

function configuration() {
  return {
    sites: [{
      id: 'site-a',
      name: 'Berlin',
      active: true,
      timeZone: 'Europe/Berlin',
      address: { line1: 'Main 1', line2: null, postalCode: '10115', city: 'Berlin', countryCode: 'DE' },
    }],
    rooms: [{
      id: 'room-a',
      siteId: 'site-a',
      name: 'Boardroom',
      capacity: 12,
      active: true,
      floor: '2',
      equipment: ['screen'],
      accessibility: ['step-free'],
      serviceIds: ['video'],
      cateringPackageIds: ['standard'],
      floorplanAssetId: 'floor-a',
      mediaAssetIds: ['media-a'],
    }],
  };
}

function roomBusiness(overrides = {}) {
  return {
    id: 'room-a',
    name: 'Updated boardroom',
    capacity: 16,
    active: true,
    floor: '3',
    equipment: ['screen', 'camera'],
    accessibility: ['step-free'],
    serviceIds: ['video'],
    cateringPackageIds: ['standard'],
    floorplanAssetId: 'floor-b',
    mediaAssetIds: ['media-b'],
    ...overrides,
  };
}

test('Conference Manager projection preserves Site and Room technical identity exactly', () => {
  const current = configuration();
  const projected = projectRoomBusinessConfiguration(current, [roomBusiness()]);

  assert.deepEqual(projected.sites, current.sites);
  assert.equal(projected.rooms[0].id, 'room-a');
  assert.equal(projected.rooms[0].siteId, 'site-a');
  assert.equal(projected.rooms[0].name, 'Updated boardroom');
  assert.equal(projected.rooms[0].capacity, 16);
  assert.deepEqual(projected.rooms[0].equipment, ['screen', 'camera']);
});

test('Conference Manager projection rejects technical-field injection and scope changes', () => {
  const current = configuration();
  assert.throws(
    () => projectRoomBusinessConfiguration(current, [{ ...roomBusiness(), siteId: 'site-b' }]),
    /TENANT_ROOM_BUSINESS_EDIT_INVALID/,
  );
  assert.throws(
    () => projectRoomBusinessConfiguration(current, []),
    /TENANT_ROOM_BUSINESS_EDIT_SCOPE_INVALID/,
  );
  assert.throws(
    () => projectRoomBusinessConfiguration(current, [roomBusiness(), roomBusiness()]),
    /TENANT_ROOM_BUSINESS_EDIT_SCOPE_INVALID/,
  );
});

test('Tenant Admin technical projection preserves all Room business fields and permits additive Sites', () => {
  const current = configuration();
  const projected = projectTechnicalLocationConfiguration(current, {
    sites: [
      {
        ...current.sites[0],
        name: 'Berlin HQ',
        timeZone: 'Europe/Berlin',
      },
      {
        id: 'site-b',
        name: 'Munich',
        active: true,
        timeZone: 'Europe/Berlin',
        address: null,
      },
    ],
    roomSites: [{ id: 'room-a', siteId: 'site-b' }],
  });

  assert.equal(projected.sites[0].name, 'Berlin HQ');
  assert.equal(projected.sites[1].id, 'site-b');
  assert.deepEqual(projected.rooms[0], { ...current.rooms[0], siteId: 'site-b' });
});

test('Tenant Admin technical projection rejects Site removal, duplicates, Room business injection and Room scope changes', () => {
  const current = configuration();
  assert.throws(
    () => projectTechnicalLocationConfiguration(current, {
      sites: [],
      roomSites: [{ id: 'room-a', siteId: 'site-a' }],
    }),
    /TENANT_SITE_TECHNICAL_EDIT_SCOPE_INVALID/,
  );
  assert.throws(
    () => projectTechnicalLocationConfiguration(current, {
      sites: [current.sites[0], current.sites[0]],
      roomSites: [{ id: 'room-a', siteId: 'site-a' }],
    }),
    /TENANT_SITE_TECHNICAL_EDIT_SCOPE_INVALID/,
  );
  assert.throws(
    () => projectTechnicalLocationConfiguration(current, {
      sites: current.sites,
      roomSites: [{ id: 'room-a', siteId: 'site-a', name: 'Injected' }],
    }),
    /TENANT_ROOM_TECHNICAL_EDIT_INVALID/,
  );
  assert.throws(
    () => projectTechnicalLocationConfiguration(current, {
      sites: current.sites,
      roomSites: [],
    }),
    /TENANT_ROOM_TECHNICAL_EDIT_SCOPE_INVALID/,
  );
});
