import assert from 'node:assert/strict';
import test from 'node:test';
import { createRoomMediaModel } from '../src/manager/room-media-model.js';
import { roomMediaPath } from '../src/shared/room-media-reference.js';
import { projectRoomBusinessConfiguration } from '../src/core/tenant-location-ownership.js';

const PLAN = 'c6000000-0000-4000-8000-000000000091';
const PHOTO = 'c6000000-0000-4000-8000-000000000092';
const OTHER = 'c6000000-0000-4000-8000-000000000093';
const room = { id: 'room-a', floorplanAssetId: PLAN, mediaAssetIds: [PHOTO, 'legacy-photo'] };
const asset = { id: PLAN, ownerKind: 'room_plan', ownerId: room.id,
  contentType: 'image/png', altText: '<img src=x onerror=alert(1)>',
  url: `/api/v1/tenant/catalogue-media/${PLAN}` };

test('CO-306 media choices use only current own-Room attachments, preserving opaque references and order', () => {
  const model = createRoomMediaModel({ room, catalogueMedia: [asset,
    { ...asset, id: OTHER, ownerId: 'room-b', url: `/api/v1/tenant/catalogue-media/${OTHER}` }] });
  assert.deepEqual(model.choices('floorplan').map(({ id }) => id), [PLAN, PHOTO, 'legacy-photo']);
  assert.deepEqual(model.choices('media').map(({ id }) => id), [PHOTO, 'legacy-photo']);
  assert.equal(model.choices('floorplan')[0].url, asset.url);
  assert.equal(model.choices('floorplan')[0].altText, asset.altText);
  assert.equal(model.choices('media')[0].url, roomMediaPath(room.id, PHOTO));
  assert.equal(model.choices('media')[1].url, null);
  assert.ok(Object.isFrozen(model.choices('media')));
  assert.ok(Object.isFrozen(model.choices('media')[0]));
  const selection = { floorplanAssetId: PLAN, mediaAssetIds: [PHOTO, 'legacy-photo'] };
  const value = model.readValue(selection);
  assert.deepEqual(value, selection);
  value.mediaAssetIds.pop();
  assert.deepEqual(model.readValue(selection), selection);
  assert.deepEqual(model.readValue({ floorplanAssetId: PHOTO, mediaAssetIds: [] }),
    { floorplanAssetId: PHOTO, mediaAssetIds: [] });
});

test('CO-306 floorplan metadata must match exact current Room, attachment, image kind and fixed runtime path', () => {
  for (const change of [
    { ownerId: 'room-b' }, { ownerKind: 'catering_item' }, { id: OTHER },
    { url: 'https://foreign.invalid/image.png' }, { url: `//foreign.invalid/${PLAN}` },
    { url: `/api/v1/demo/media/${PLAN}` }, { url: `${asset.url}?tenant=other` },
    { url: 'javascript:alert(1)' }, { contentType: 'image/svg+xml' }, { altText: 'x'.repeat(161) },
    { extra: 'field' },
  ]) {
    const model = createRoomMediaModel({ room, catalogueMedia: [{ ...asset, ...change }] });
    assert.equal(model.choices('floorplan')[0].url, roomMediaPath(room.id, PLAN));
    assert.equal(model.choices('floorplan')[0].altText, null);
  }
  for (const assets of [[asset, asset], Array(41).fill(asset), null]) {
    assert.equal(createRoomMediaModel({ room, catalogueMedia: assets }).choices('floorplan')[0].url,
      roomMediaPath(room.id, PLAN));
  }
  const accessor = { ...asset };
  Object.defineProperty(accessor, 'url', { enumerable: true, get() { assert.fail('metadata accessors must not execute'); } });
  assert.equal(createRoomMediaModel({ room, catalogueMedia: [accessor] }).choices('floorplan')[0].url,
    roomMediaPath(room.id, PLAN));
  assert.equal(createRoomMediaModel({ room: { ...room, floorplanAssetId: null }, catalogueMedia: [asset] })
    .choices('floorplan').some(({ id }) => id === PLAN), false);
});

test('CO-306 Demo media requires explicit Demo mode and exact current owner, never a UUID-prefix fallback', () => {
  const demo = { ...asset, url: `/api/v1/demo/media/${PLAN}` };
  assert.equal(createRoomMediaModel({ room, catalogueMedia: [demo], demoRuntime: true })
    .choices('floorplan')[0].url, demo.url);
  for (const demoRuntime of [false, undefined, 'demo']) {
    assert.equal(createRoomMediaModel({ room, catalogueMedia: [demo], demoRuntime })
      .choices('floorplan')[0].url, roomMediaPath(room.id, PLAN));
  }
  const legacyDemo = { ...room, floorplanAssetId: '52000000-0000-4000-8000-000000000091' };
  assert.equal(createRoomMediaModel({ room: legacyDemo, demoRuntime: true }).choices('floorplan')[0].url,
    roomMediaPath(room.id, legacyDemo.floorplanAssetId));
});

test('CO-306 selection rejects injected foreign refs, duplicate slots and oversized or malformed data', () => {
  const model = createRoomMediaModel({ room });
  for (const selection of [
    { floorplanAssetId: OTHER, mediaAssetIds: [PHOTO] },
    { floorplanAssetId: PLAN, mediaAssetIds: [OTHER] },
    { floorplanAssetId: PLAN, mediaAssetIds: [PHOTO, PHOTO] },
    { floorplanAssetId: PLAN, mediaAssetIds: [PLAN] },
    { floorplanAssetId: PLAN, mediaAssetIds: Array(21).fill(PHOTO) },
    { floorplanAssetId: undefined, mediaAssetIds: [] },
  ]) assert.throws(() => model.readValue(selection), /MANAGER_ROOM_MEDIA_SELECTION_INVALID/);
  for (const change of [{ id: '../room-b' }, { floorplanAssetId: 'https://foreign.invalid' },
    { mediaAssetIds: [PHOTO, PHOTO] }, { mediaAssetIds: Array(21).fill(PHOTO) }, { mediaAssetIds: ['../private'] }]) {
    assert.throws(() => createRoomMediaModel({ room: { ...room, ...change } }), /MANAGER_ROOM_MEDIA_INVALID/);
  }
});

test('CO-306 confirmed own-Room uploads extend only the editor candidates without replacing existing references', () => {
  const model = createRoomMediaModel({ room });
  model.addUploadedAsset({ kind: 'media', assetId: OTHER });
  model.addUploadedAsset({ kind: 'media', assetId: OTHER });
  assert.deepEqual(model.choices('media').map(({ id }) => id), [PHOTO, 'legacy-photo', OTHER]);
  assert.equal(model.choices('media').at(-1).url, roomMediaPath(room.id, OTHER));
  assert.deepEqual(model.readValue({ floorplanAssetId: OTHER, mediaAssetIds: [PHOTO, 'legacy-photo', OTHER] }),
    { floorplanAssetId: OTHER, mediaAssetIds: [PHOTO, 'legacy-photo', OTHER] });
  for (const upload of [{ kind: 'other', assetId: OTHER }, { kind: 'media', assetId: 'legacy-injected' },
    { kind: 'floorplan', assetId: 'https://foreign.invalid/x' }]) {
    assert.throws(() => model.addUploadedAsset(upload), /MANAGER_ROOM_MEDIA_UPLOAD_INVALID/);
  }
});

test('CO-306 all twenty existing image slots and a separate legacy floorplan survive unchanged', () => {
  const bounded = { id: room.id, floorplanAssetId: 'legacy-floorplan',
    mediaAssetIds: Array.from({ length: 20 }, (_, index) => `legacy-photo-${index + 1}`) };
  const model = createRoomMediaModel({ room: bounded, catalogueMedia: null });
  assert.equal(model.choices('floorplan').length, 21);
  assert.equal(model.choices('media').length, 20);
  assert.ok(model.choices('floorplan').every(({ url }) => url === null));
  assert.deepEqual(model.readValue(bounded), { floorplanAssetId: bounded.floorplanAssetId, mediaAssetIds: bounded.mediaAssetIds });
});

test('CO-306 media edits preserve every Room, Site/provider-owned field, legacy slot and public-value snapshot', () => {
  const completeRoom = { ...room, siteId: 'site-a', name: 'Atelier', description: 'Existing description',
    capacity: 8, active: true, floor: '2', equipment: ['screen'], accessibility: ['step-free'],
    serviceIds: ['video'], cateringPackageIds: ['coffee'], guestPublicValues: { floorNumber: 2, accessibilityFeatures: ['lift'] } };
  const untouched = { ...completeRoom, id: 'room-b', floorplanAssetId: 'unknown-plan', mediaAssetIds: ['unknown-photo'] };
  const current = { sites: [{ id: 'site-a', name: 'Berlin', active: true, timeZone: 'Europe/Berlin',
    address: null, guestInformation: null, guestPublicValues: null }], rooms: [completeRoom, untouched] };
  const original = structuredClone(current);
  const edits = current.rooms.map(({ siteId: _siteId, ...entry }) => ({ ...entry,
    ...createRoomMediaModel({ room: entry }).readValue({ floorplanAssetId: entry.floorplanAssetId,
      mediaAssetIds: entry.id === room.id ? ['legacy-photo'] : entry.mediaAssetIds }) }));
  const projected = projectRoomBusinessConfiguration(current, edits);
  assert.deepEqual(projected.sites, original.sites);
  assert.deepEqual(projected.rooms[1], original.rooms[1]);
  assert.deepEqual(projected.rooms[0], { ...original.rooms[0], mediaAssetIds: ['legacy-photo'] });
  assert.deepEqual(current, original);
});
