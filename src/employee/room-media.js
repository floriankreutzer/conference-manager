const ROOM_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const ASSET_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function roomMediaPath(roomId, assetId) {
  if (typeof roomId !== 'string' || !ROOM_ID.test(roomId)
    || typeof assetId !== 'string' || !ASSET_ID.test(assetId)) return null;
  return `/api/v1/tenant/rooms/${encodeURIComponent(roomId)}/media/${assetId.toLowerCase()}`;
}

export function managedRoomMedia(room, catalogueMedia = null) {
  const current = catalogueMedia?.get(`room_plan:${room?.id}`);
  const catalogueFloorplan = current?.ownerKind === 'room_plan' && current.ownerId === room?.id
    && typeof current.id === 'string' && ASSET_ID.test(current.id) && current.id === room?.floorplanAssetId
    && current.url === `/api/v1/tenant/catalogue-media/${current.id}` ? current.url : null;
  const floorplan = catalogueFloorplan || (typeof room?.floorplanAssetId === 'string'
    && /^52000000-0000-4000-8000-[0-9a-f]{12}$/i.test(room.floorplanAssetId)
    ? `/api/v1/demo/media/${room.floorplanAssetId.toLowerCase()}`
    : roomMediaPath(room?.id, room?.floorplanAssetId));
  const references = Array.isArray(room?.mediaAssetIds) && room.mediaAssetIds.length <= 20
    ? room.mediaAssetIds : [];
  return Object.freeze({
    floorplan,
    media: Object.freeze(references.map((assetId) => roomMediaPath(room?.id, assetId)).filter(Boolean)),
  });
}
