const FEATURE_ID_PATTERN = /^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/;

export function createFeatureFlagDefinitions(definitions = {}) {
  if (!definitions || typeof definitions !== 'object' || Array.isArray(definitions)) return Object.freeze({});

  const normalized = {};
  for (const [featureId, enabledByDefault] of Object.entries(definitions)) {
    if (!FEATURE_ID_PATTERN.test(featureId) || typeof enabledByDefault !== 'boolean') continue;
    normalized[featureId] = enabledByDefault;
  }
  return Object.freeze(normalized);
}

// Baseline functionality is intentionally absent from this registry. Genuinely
// new functionality must be registered here and must default to false unless an
// explicitly approved requirement says otherwise.
export const FEATURE_FLAG_DEFAULTS = createFeatureFlagDefinitions({ 'platform.provider-usage': false, 'platform.product-delivery': false, 'catering.configuration': false, 'catering.catalogue': false, 'catering.orders': false, 'catering.delivery': false, 'customer.invitations': false, 'platform.customer-invitations': false, 'customer.microsoft-authentication': false, 'customer.synthetic-handoff': false, 'customer.synthetic-onboarding': false, 'platform.synthetic-workspace': false, 'customer.owner-handoff': false, 'platform.owner-customer-access': false });

export function createFeatureFlagResolver(defaults = FEATURE_FLAG_DEFAULTS, overrides = {}) {
  const safeDefaults = createFeatureFlagDefinitions(defaults);
  const safeOverrides = createFeatureFlagDefinitions(overrides);

  return Object.freeze({
    isEnabled(featureId) {
      if (!FEATURE_ID_PATTERN.test(String(featureId || ''))) return false;
      if (!Object.hasOwn(safeDefaults, featureId)) return false;
      if (Object.hasOwn(safeOverrides, featureId)) return safeOverrides[featureId] === true;
      return safeDefaults[featureId] === true;
    },
  });
}

// Approved Operations Demo rollout. The registry defaults remain OFF; this
// presentation override never grants the server's private-read capability.
const operationsFlags = createFeatureFlagResolver(undefined, { 'platform.provider-usage': true, 'platform.product-delivery': true });
export const featureFlags = Object.freeze({
  isEnabled: operationsFlags.isEnabled,
  // Read-only nonsecret artifact metadata enables presentation, never authority.
  // Missing, duplicate or unknown profile markers keep every feature disabled.
  forProtectedDocument(documentRef) {
    function single(name) {
      if (typeof documentRef?.querySelectorAll!=='function') return null;
      const nodes=documentRef.querySelectorAll(`meta[name="${name}"]`);
      return nodes.length===1 ? nodes[0].content : null;
    }
    const environment=single('conference-deployment-environment');
    const qualified=single('conference-protected-runtime')==='true' && ['dev','int','prod'].includes(environment);
    const synthetic=qualified && ['dev','int'].includes(environment) && single('conference-protected-synthetic')==='enabled';
    const owner=qualified && single('conference-protected-owner-access')==='enabled'
      && single('conference-protected-microsoft')==='enabled';
    const invitations=qualified && single('conference-protected-invitations')==='enabled';
    return createFeatureFlagResolver(undefined,{
      'customer.owner-handoff': owner,'platform.owner-customer-access': owner,
      'customer.synthetic-handoff': synthetic,'customer.synthetic-onboarding': synthetic,'platform.synthetic-workspace': synthetic,
      'customer.microsoft-authentication': qualified && single('conference-protected-microsoft')==='enabled',
      'customer.invitations': invitations,'platform.customer-invitations': invitations,
    });
  },
  // A validated authenticated server projection can enable this presentation capability only.
  forServerCateringConfiguration(available) {
    return createFeatureFlagResolver(undefined, { 'catering.configuration': available === true });
  },
  forServerCateringOrders(available) {
    return createFeatureFlagResolver(undefined, { 'catering.orders': available === true });
  },
  forServerCateringDelivery(available) {
    return createFeatureFlagResolver(undefined, { 'catering.delivery': available === true });
  },
  forServerCateringCatalogue(available) {
    return createFeatureFlagResolver(undefined, { 'catering.catalogue': available === true });
  },
});
