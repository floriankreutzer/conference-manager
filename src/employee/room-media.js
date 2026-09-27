const ROOM_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const ASSET_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function roomMediaPath(roomId, assetId) {
  if (typeof roomId !== 'string' || !ROOM_ID.test(roomId)
    || typeof assetId !== 'string' || !ASSET_ID.test(assetId)) return null;
  return `/api/v1/tenant/rooms/${encodeURIComponent(roomId)}/media/${assetId.toLowerCase()}`;
}

export function managedRoomMedia(room) {
  const floorplan = roomMediaPath(room?.id, room?.floorplanAssetId);
  const references = Array.isArray(room?.mediaAssetIds) && room.mediaAssetIds.length <= 20
    ? room.mediaAssetIds : [];
  return Object.freeze({
    floorplan,
    media: Object.freeze(references.map((assetId) => roomMediaPath(room?.id, assetId)).filter(Boolean)),
  });
}
