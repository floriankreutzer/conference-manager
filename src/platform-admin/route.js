import { isPlatformAdminSection } from './contracts.js';

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function platformAdminRouteFromHash(hash = '') {
  const value = String(hash).replace(/^#/, '');
  if (!value || value === 'fleet') return Object.freeze({ view: 'fleet', tenantId: null, section: null });
  const parameters = new URLSearchParams(value);
  const tenantId = parameters.get('tenant');
  const section = parameters.get('section') || 'overview';
  if (!tenantId || !UUID_PATTERN.test(tenantId) || !isPlatformAdminSection(section)) {
    return Object.freeze({ view: 'fleet', tenantId: null, section: null });
  }
  return Object.freeze({ view: 'tenant', tenantId, section });
}

export function platformAdminFleetHash() {
  return '#fleet';
}

export function platformAdminTenantHash(tenantId, section = 'overview') {
  if (!UUID_PATTERN.test(String(tenantId)) || !isPlatformAdminSection(section)) return platformAdminFleetHash();
  const parameters = new URLSearchParams({ tenant: tenantId, section });
  return `#${parameters.toString()}`;
}
