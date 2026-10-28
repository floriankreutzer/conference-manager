import { isPlatformAdminSection } from './contracts.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const FLEET_TABS = Object.freeze({
  directory: [], readiness: [], 'integration-health': [], 'platform-audit': [], 'runtime-status': [],
  providers: ['overview', 'usage', 'sources'],
  'product-delivery': ['overview', 'usage', 'delivery', 'feedback'],
});
const DIRECTORY_ROUTE = Object.freeze({ view: 'fleet', tenantId: null, section: null });

function fleetSelection(view, tab) {
  if (!Object.hasOwn(FLEET_TABS, view)) return null;
  const tabs = FLEET_TABS[view];
  if (tab !== null && !tabs.includes(tab)) return null;
  return { fleetView: view, tab: tabs.length ? tab || 'overview' : null };
}

export function platformAdminRouteFromHash(hash = '') {
  const value = String(hash).replace(/^#/, '');
  if (value.length > 256) return DIRECTORY_ROUTE;
  if (!value || value === 'fleet') return DIRECTORY_ROUTE;
  const parameters = new URLSearchParams(value);
  const keys = [...parameters.keys()];
  if (new Set(keys).size !== keys.length) return DIRECTORY_ROUTE;
  if (parameters.has('fleet')) {
    const selection = fleetSelection(parameters.get('fleet'), parameters.get('tab'));
    if (!selection || keys.some(key => !['fleet', 'tab'].includes(key))) return DIRECTORY_ROUTE;
    return selection.fleetView === 'directory' ? DIRECTORY_ROUTE
      : Object.freeze({ ...DIRECTORY_ROUTE, ...selection });
  }
  const tenantId = parameters.get('tenant');
  const section = parameters.get('section') || 'overview';
  if (!tenantId || !UUID_PATTERN.test(tenantId) || !isPlatformAdminSection(section)
    || keys.some(key => !['tenant', 'section'].includes(key))) {
    return DIRECTORY_ROUTE;
  }
  return Object.freeze({ view: 'tenant', tenantId, section });
}

export function platformAdminFleetHash(view = 'directory', tab = null) {
  const selection = fleetSelection(view, tab);
  if (!selection || view === 'directory') return '#fleet';
  const parameters = new URLSearchParams({ fleet: view });
  if (selection.tab) parameters.set('tab', selection.tab);
  return `#${parameters.toString()}`;
}

export function platformAdminTenantHash(tenantId, section = 'overview') {
  if (!UUID_PATTERN.test(String(tenantId)) || !isPlatformAdminSection(section)) return platformAdminFleetHash();
  const parameters = new URLSearchParams({ tenant: tenantId, section });
  return `#${parameters.toString()}`;
}
