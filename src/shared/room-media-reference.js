const ROOM_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const ASSET_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// A reference constructs a fixed read path; the API still checks Tenant, Room,
// session and current attachment authority for every request.
export function roomMediaPath(roomId, assetId) {
  if (typeof roomId !== 'string' || !ROOM_ID.test(roomId)
    || typeof assetId !== 'string' || !ASSET_ID.test(assetId)) return null;
  return `/api/v1/tenant/rooms/${encodeURIComponent(roomId)}/media/${assetId.toLowerCase()}`;
}
