import { roomMediaPath } from '../shared/room-media-reference.js';

const ROOM_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
const CATALOGUE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MEDIA_KEYS = ['altText', 'contentType', 'id', 'ownerId', 'ownerKind', 'url'];

function currentCataloguePlan(room, assets, demoRuntime) {
  if (!Array.isArray(assets) || assets.length > 40) return null;
  const owned = assets.filter((asset) => {
    if (!asset || Object.getPrototypeOf(asset) !== Object.prototype
      || Object.keys(asset).sort().join(',') !== MEDIA_KEYS.join(',')
      || MEDIA_KEYS.some((key) => !Object.hasOwn(Object.getOwnPropertyDescriptor(asset, key) ?? {}, 'value'))) return false;
    return asset.ownerKind === 'room_plan' && asset.ownerId === room.id;
  });
  if (owned.length !== 1) return null;
  const asset = owned[0];
  const root = demoRuntime ? '/api/v1/demo/media' : '/api/v1/tenant/catalogue-media';
  const url = `${root}/${asset.id}`;
  if (typeof asset.id !== 'string' || !CATALOGUE_ID.test(asset.id)
    || asset.id !== room.floorplanAssetId || asset.url !== url
    || !['image/png', 'image/webp'].includes(asset.contentType)
    || typeof asset.altText !== 'string' || asset.altText.length > 160) return null;
  return Object.freeze({ url, altText: asset.altText });
}

// There is no asset inventory contract. Choices come only from this Room's
// loaded attachments and the successful own-Room upload callback below.
export function createRoomMediaModel({ room, catalogueMedia = [], demoRuntime = false }) {
  const references = room?.mediaAssetIds;
  if (typeof room?.id !== 'string' || !ROOM_ID.test(room.id)
    || (room.floorplanAssetId !== null && (typeof room.floorplanAssetId !== 'string' || !REFERENCE.test(room.floorplanAssetId)))
    || !Array.isArray(references) || references.length > 20
    || new Set(references).size !== references.length
    || references.some((id) => typeof id !== 'string' || !REFERENCE.test(id))) {
    throw new TypeError('MANAGER_ROOM_MEDIA_INVALID');
  }
  const plan = currentCataloguePlan(room, catalogueMedia, demoRuntime === true);
  const floorplans = [];
  const media = [];
  function choice(id, kind, number, cataloguePlan = null) {
    return Object.freeze({ id, kind, number,
      url: cataloguePlan?.url || roomMediaPath(room.id, id),
      altText: cataloguePlan?.altText || null });
  }
  if (room.floorplanAssetId) floorplans.push(choice(room.floorplanAssetId, 'floorplan', 1, plan));
  references.forEach((id, index) => {
    const entry = choice(id, 'media', index + 1);
    media.push(entry);
    if (!floorplans.some((candidate) => candidate.id === id)) floorplans.push(entry);
  });
  return Object.freeze({
    choices(kind) {
      if (!['floorplan', 'media'].includes(kind)) throw new TypeError('MANAGER_ROOM_MEDIA_KIND_INVALID');
      return Object.freeze([...(kind === 'floorplan' ? floorplans : media)]);
    },
    readValue({ floorplanAssetId, mediaAssetIds }) {
      if ((floorplanAssetId !== null && !floorplans.some((entry) => entry.id === floorplanAssetId))
        || !Array.isArray(mediaAssetIds) || mediaAssetIds.length > 20
        || new Set(mediaAssetIds).size !== mediaAssetIds.length
        || mediaAssetIds.some((id) => !media.some((entry) => entry.id === id))) {
        throw new TypeError('MANAGER_ROOM_MEDIA_SELECTION_INVALID');
      }
      return { floorplanAssetId, mediaAssetIds: [...mediaAssetIds] };
    },
    addUploadedAsset({ kind, assetId }) {
      if (!['floorplan', 'media'].includes(kind) || !roomMediaPath(room.id, assetId)) {
        throw new TypeError('MANAGER_ROOM_MEDIA_UPLOAD_INVALID');
      }
      const candidates = kind === 'floorplan' ? floorplans : media;
      if (candidates.some((entry) => entry.id === assetId)) return;
      const number = candidates.filter((entry) => entry.kind === kind).length + 1;
      const entry = choice(assetId, kind, number);
      candidates.push(entry);
      if (kind === 'media' && !floorplans.some((candidate) => candidate.id === assetId)) floorplans.push(entry);
    },
  });
}
