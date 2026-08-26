function normalizedSites(catalog) {
  if (!catalog || !Array.isArray(catalog.sites)) throw new TypeError('ONBOARDING_CATALOG_REQUIRED');
  return Object.freeze(catalog.sites.map((site) => {
    if (!site || typeof site !== 'object' || Array.isArray(site)) throw new TypeError('ONBOARDING_SITE_INVALID');
    if (typeof site.id !== 'string' || !site.id || typeof site.name !== 'string' || !site.name) {
      throw new TypeError('ONBOARDING_SITE_INVALID');
    }
    return Object.freeze({ id: site.id, name: site.name });
  }));
}

export function createMicrosoft365OnboardingRuntime({
  onboardingApi,
  connectionApi,
  persistence,
} = {}) {
  if (!onboardingApi || typeof onboardingApi.getReadiness !== 'function') {
    throw new TypeError('ONBOARDING_API_REQUIRED');
  }
  if (typeof onboardingApi.verifyFreeBusy !== 'function') {
    throw new TypeError('ONBOARDING_FREE_BUSY_API_REQUIRED');
  }
  if (
    !connectionApi
    || typeof connectionApi.getStatus !== 'function'
    || typeof connectionApi.disconnect !== 'function'
  ) {
    throw new TypeError('MICROSOFT365_CONNECTION_API_REQUIRED');
  }
  if (!persistence || typeof persistence.loadCatalog !== 'function') {
    throw new TypeError('PRODUCTION_PERSISTENCE_REQUIRED');
  }
  return Object.freeze({
    isDemo: false,
    async listSites() {
      return normalizedSites(await persistence.loadCatalog());
    },
    getConnection: () => connectionApi.getStatus(),
    connect: () => connectionApi.connect(),
    disconnect: () => connectionApi.disconnect(),
    verify: () => connectionApi.verify(),
    discoverRooms: () => onboardingApi.discoverRooms(),
    listMappings: () => onboardingApi.listMappings(),
    importRooms: (selections) => onboardingApi.importRooms(selections),
    verifyFreeBusy: () => onboardingApi.verifyFreeBusy(),
    getReadiness: () => onboardingApi.getReadiness(),
  });
}
