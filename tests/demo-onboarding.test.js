import assert from 'node:assert/strict';
import test from 'node:test';
import { createDemoOnboarding } from '../src/tenant-admin/demo-onboarding.js';

test('demo onboarding requires explicit free-busy verification after room import', async () => {
  const runtime = createDemoOnboarding();
  assert.equal(runtime.isDemo, true);
  assert.equal((await runtime.getReadiness()).ready, false);
  assert.equal((await runtime.getConnection()).state, 'disconnected');

  await assert.rejects(runtime.verifyFreeBusy(), /DEMO_FREE_BUSY_NOT_READY/);
  await runtime.connect();
  assert.equal((await runtime.getConnection()).state, 'pending');
  await runtime.verify();
  assert.equal((await runtime.getConnection()).state, 'connected');
  assert.equal((await runtime.getReadiness()).checks.freeBusyVerified, false);

  const rooms = await runtime.discoverRooms();
  assert.equal(rooms.length >= 2, true);
  await runtime.importRooms([{
    externalRoomId: rooms[0].id,
    siteId: 'berlin',
    name: rooms[0].name,
    capacity: rooms[0].capacity,
  }]);

  const imported = await runtime.getReadiness();
  assert.equal(imported.ready, false);
  assert.equal(imported.checks.roomImported, true);
  assert.equal(imported.checks.freeBusyVerified, false);

  const verification = await runtime.verifyFreeBusy();
  assert.deepEqual(verification, {
    verified: true,
    checkedAt: '2026-08-26T06:00:00.000Z',
  });
  const readiness = await runtime.getReadiness();
  assert.equal(readiness.ready, true);
  assert.equal(readiness.checks.freeBusyVerified, true);
  assert.equal(readiness.entitlements.microsoftCalendarWrite, false);
});

test('changing Demo room mappings invalidates prior simulated free-busy verification', async () => {
  const runtime = createDemoOnboarding();
  await runtime.connect();
  await runtime.verify();
  const rooms = await runtime.discoverRooms();
  const selection = (room) => ({
    externalRoomId: room.id,
    siteId: 'berlin',
    name: room.name,
    capacity: room.capacity,
  });
  await runtime.importRooms([selection(rooms[0])]);
  await runtime.verifyFreeBusy();
  assert.equal((await runtime.getReadiness()).checks.freeBusyVerified, true);
  await runtime.importRooms([selection(rooms[1])]);
  assert.equal((await runtime.getReadiness()).checks.freeBusyVerified, false);
});
