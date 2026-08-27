function configurationCollections(configuration) {
  if (
    !configuration
    || typeof configuration !== 'object'
    || Array.isArray(configuration)
    || !Array.isArray(configuration.sites)
    || !Array.isArray(configuration.rooms)
  ) {
    throw new TypeError('TENANT_LOCATION_ROLLBACK_PREVIEW_INVALID');
  }
  return configuration;
}

const changed = (current, projected) => JSON.stringify(current) !== JSON.stringify(projected);

function collectionPreview(currentEntries, sourceEntries) {
  const currentById = new Map(currentEntries.map((entry) => [entry.id, entry]));
  const sourceIds = new Set(sourceEntries.map((entry) => entry.id));
  const retained = currentEntries
    .filter((entry) => !sourceIds.has(entry.id))
    .map((entry) => ({ ...entry, active: false }));
  const projected = [...sourceEntries, ...retained].sort((left, right) => left.id.localeCompare(right.id));
  return Object.freeze({
    changed: projected.filter((entry) => changed(currentById.get(entry.id), entry)).length,
    retained: retained.length,
    projected: Object.freeze(projected),
  });
}

export function createLocationRollbackConfiguration(currentConfiguration, sourceConfiguration) {
  const current = configurationCollections(currentConfiguration);
  const source = configurationCollections(sourceConfiguration);
  return Object.freeze({
    sites: collectionPreview(current.sites, source.sites).projected,
    rooms: collectionPreview(current.rooms, source.rooms).projected,
  });
}

export function createLocationRollbackPreview(currentConfiguration, sourceConfiguration) {
  const current = configurationCollections(currentConfiguration);
  const source = configurationCollections(sourceConfiguration);
  const sites = collectionPreview(current.sites, source.sites);
  const rooms = collectionPreview(current.rooms, source.rooms);
  return Object.freeze({
    changedSites: sites.changed,
    changedRooms: rooms.changed,
    retainedSites: sites.retained,
    retainedRooms: rooms.retained,
  });
}
