export function locationOverview(configuration) {
  const sites = configuration.sites.filter((site) => site.active);
  const activeSiteIds = new Set(sites.map((site) => site.id));
  return Object.freeze({
    activeRooms: configuration.rooms.filter((room) => room.active && activeSiteIds.has(room.siteId)).length,
    missingGuestSites: sites.filter((site) => site.guestInformation === null).length,
  });
}
