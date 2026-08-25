import assert from 'node:assert/strict';
import test from 'node:test';
import { createDemoOnboarding } from '../src/tenant-admin/demo-onboarding.js';

test('demo onboarding presents the full guided flow without pretending to be Microsoft evidence', async () => {
  const runtime = createDemoOnboarding();
  assert.equal(runtime.isDemo, true);
  assert.equal((await runtime.getReadiness()).ready, false);
  assert.equal((await runtime.getConnection()).state, 'disconnected');

  await runtime.connect();
  assert.equal((await runtime.getConnection()).state, 'pending');
  await runtime.verify();
  assert.equal((await runtime.getConnection()).state, 'connected');

  const rooms = await runtime.discoverRooms();
  assert.equal(rooms.length >= 2, true);
  await runtime.importRooms([{
    externalRoomId: rooms[0].id,
    siteId: 'berlin',
    name: rooms[0].name,
    capacity: rooms[0].capacity,
  }]);

  const readiness = await runtime.getReadiness();
  assert.equal(readiness.ready, true);
  assert.equal(readiness.checks.roomImported, true);
  assert.equal(readiness.entitlements.microsoftCalendarWrite, false);
});
