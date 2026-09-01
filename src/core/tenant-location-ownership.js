const ROOM_BUSINESS_FIELDS = Object.freeze([
  'name',
  'capacity',
  'active',
  'floor',
  'equipment',
  'accessibility',
  'serviceIds',
  'cateringPackageIds',
  'floorplanAssetId',
  'mediaAssetIds',
]);

function record(value, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TypeError(code);
  return value;
}

function locationConfiguration(value) {
  const configuration = record(value, 'TENANT_LOCATION_OWNERSHIP_CONFIGURATION_INVALID');
  if (!Array.isArray(configuration.sites) || !Array.isArray(configuration.rooms)) {
    throw new TypeError('TENANT_LOCATION_OWNERSHIP_CONFIGURATION_INVALID');
  }
  return configuration;
}

function sameIdentifiers(current, edits, code) {
  if (!Array.isArray(edits) || current.length !== edits.length) throw new TypeError(code);
  const currentIds = new Set(current.map((entry) => entry.id));
  if (currentIds.size !== current.length || edits.some((entry) => !currentIds.has(entry?.id))) {
    throw new TypeError(code);
  }
  if (new Set(edits.map((entry) => entry.id)).size !== edits.length) throw new TypeError(code);
}

function additiveSites(current, edits) {
  if (!Array.isArray(edits)) throw new TypeError('TENANT_SITE_TECHNICAL_EDIT_SCOPE_INVALID');
  const currentIds = new Set(current.map((entry) => entry.id));
  const editIds = edits.map((entry) => entry?.id);
  if (
    currentIds.size !== current.length
    || new Set(editIds).size !== edits.length
    || [...currentIds].some((id) => !editIds.includes(id))
  ) {
    throw new TypeError('TENANT_SITE_TECHNICAL_EDIT_SCOPE_INVALID');
  }
}

function businessFields(value) {
  const input = record(value, 'TENANT_ROOM_BUSINESS_EDIT_INVALID');
  const allowed = new Set(['id', ...ROOM_BUSINESS_FIELDS]);
  if (Object.keys(input).some((key) => !allowed.has(key))) {
    throw new TypeError('TENANT_ROOM_BUSINESS_EDIT_INVALID');
  }
  for (const field of ROOM_BUSINESS_FIELDS) {
    if (!Object.hasOwn(input, field)) throw new TypeError('TENANT_ROOM_BUSINESS_EDIT_INVALID');
  }
  return Object.fromEntries(ROOM_BUSINESS_FIELDS.map((field) => [field, input[field]]));
}

export function projectRoomBusinessConfiguration(currentValue, roomEdits) {
  const current = locationConfiguration(currentValue);
  sameIdentifiers(current.rooms, roomEdits, 'TENANT_ROOM_BUSINESS_EDIT_SCOPE_INVALID');
  const editById = new Map(roomEdits.map((entry) => [entry.id, businessFields(entry)]));
  return {
    sites: current.sites.map((site) => ({ ...site })),
    rooms: current.rooms.map((room) => ({
      ...room,
      ...editById.get(room.id),
      id: room.id,
      siteId: room.siteId,
    })),
  };
}

export function projectTechnicalLocationConfiguration(currentValue, { sites, roomSites } = {}) {
  const current = locationConfiguration(currentValue);
  additiveSites(current.sites, sites);
  sameIdentifiers(current.rooms, roomSites, 'TENANT_ROOM_TECHNICAL_EDIT_SCOPE_INVALID');
  const roomSiteById = new Map(roomSites.map((entry) => {
    const input = record(entry, 'TENANT_ROOM_TECHNICAL_EDIT_INVALID');
    if (Object.keys(input).some((key) => !['id', 'siteId'].includes(key)) || !Object.hasOwn(input, 'siteId')) {
      throw new TypeError('TENANT_ROOM_TECHNICAL_EDIT_INVALID');
    }
    return [input.id, input.siteId];
  }));
  return {
    sites: sites.map((site) => ({ ...site })),
    rooms: current.rooms.map((room) => ({
      ...room,
      id: room.id,
      siteId: roomSiteById.get(room.id),
    })),
  };
}

export const TENANT_ROOM_BUSINESS_FIELDS = ROOM_BUSINESS_FIELDS;
