import assert from 'node:assert/strict';
import test from 'node:test';
import { managedRoomMedia, roomMediaPath } from '../src/employee/room-media.js';

const ID = '11111111-1111-4111-8111-111111111111';

test('room media uses only same-origin paths from valid Room and managed UUIDs', () => {
  assert.equal(roomMediaPath('room-a', ID), `/api/v1/tenant/rooms/room-a/media/${ID}`);
  assert.equal(roomMediaPath('room/a', ID), null);
  assert.equal(roomMediaPath('room-a', 'https://example.invalid/image'), null);
  assert.equal(roomMediaPath('room-a', '../private'), null);
  assert.deepEqual(managedRoomMedia({
    id: 'room-a', floorplanAssetId: 'legacy-floor', mediaAssetIds: [ID, 'legacy-photo'],
  }), { floorplan: null, media: [`/api/v1/tenant/rooms/room-a/media/${ID}`] });
  assert.deepEqual(managedRoomMedia({ id: 'room-a', mediaAssetIds: Array(21).fill(ID) }), {
    floorplan: null, media: [],
  });
});
