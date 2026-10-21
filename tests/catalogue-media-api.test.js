import assert from 'node:assert/strict';
import test from 'node:test';
import { createCatalogueMediaApi,normalizeCatalogueMediaResponse } from '../src/core/catalogue-media-api.js';
import { managedRoomMedia } from '../src/employee/room-media.js';

const id='c6000000-0000-4000-8000-000000000099';
const asset={ id,ownerKind: 'room_plan',ownerId: 'room-01',contentType: 'image/png',
  altText: '<img src=x onerror=alert(1)>',url: `/api/v1/tenant/catalogue-media/${id}` };

test('catalogue media captures the authenticated request port and uses only the fixed bounded current read',async()=>{
  const calls=[],response={ assets: [{ ...asset }],requestId: id };
  const client={ async request(...args) { calls.push(args);return response; } },api=createCatalogueMediaApi({ apiClient: client });
  client.request=()=>assert.fail('cannot replace captured transport');const entries=await api.list();
  assert.equal(calls[0][0],'v1/tenant/catalogue-media');assert.ok(calls[0][1].signal instanceof AbortSignal);
  assert.equal(calls[0][1].method,undefined);assert.equal(entries[0].altText,asset.altText);
  response.assets[0].url='https://foreign.example/image';assert.equal(entries[0].url,asset.url);
  assert.ok(Object.isFrozen(entries));assert.ok(Object.isFrozen(entries[0]));
});

test('catalogue media rejects external, Demo, foreign-owner, duplicate, oversized and accessor DTOs',()=>{
  for (const change of [{ url: 'https://foreign.example/image' },{ url: `/api/v1/demo/media/${id}` },
    { ownerKind: 'unknown' },{ ownerId: '../foreign' },{ contentType: 'image/svg+xml' },{ altText: 'x'.repeat(161) },
    { id: 'invalid' },{ extra: 'field' }]) {
    assert.throws(()=>normalizeCatalogueMediaResponse({ assets: [{ ...asset,...change }] }));
  }
  assert.throws(()=>normalizeCatalogueMediaResponse({ assets: [asset,asset] }));
  assert.throws(()=>normalizeCatalogueMediaResponse({ assets: Array(41).fill(asset) }));
  const accessor={ ...asset };Object.defineProperty(accessor,'url',{ get() { assert.fail('no DTO getter execution'); },enumerable: true });
  assert.throws(()=>normalizeCatalogueMediaResponse({ assets: [accessor] }),/CATALOGUE_MEDIA_RESPONSE_INVALID/);
  assert.throws(()=>normalizeCatalogueMediaResponse({ assets: [Object.create(asset)] }));
});

test('read failures preserve authentication errors and never retry or select the Demo endpoint',async()=>{
  let calls=0;const error=new Error('SESSION_REVOKED');error.status=401;
  const api=createCatalogueMediaApi({ apiClient: { async request(path) {
    assert.equal(path,'v1/tenant/catalogue-media');calls++;throw error;
  } } });
  await assert.rejects(api.list(),value=>value===error);assert.equal(calls,1);
  assert.throws(()=>createCatalogueMediaApi({ apiClient: { request() {} },timeoutMs: 15001 }));
});

test('room plans use catalogue paths only for an exact current Room attachment and owner',()=>{
  const room={ id: 'room-01',floorplanAssetId: id,mediaAssetIds: [id] };
  const media=new Map([['room_plan:room-01',asset]]),value=managedRoomMedia(room,media);
  assert.equal(value.floorplan,asset.url);assert.deepEqual(value.media,[`/api/v1/tenant/rooms/room-01/media/${id}`]);
  for (const change of [{ ownerId: 'foreign' },{ ownerKind: 'catering_item' },{ id: 'bad' },{ url: 'https://foreign.example' }]) {
    const candidate=new Map([['room_plan:room-01',{ ...asset,...change }]]);
    assert.equal(managedRoomMedia(room,candidate).floorplan,`/api/v1/tenant/rooms/room-01/media/${id}`);
  }
  assert.equal(managedRoomMedia({ ...room,floorplanAssetId: null },media).floorplan,null);
});
