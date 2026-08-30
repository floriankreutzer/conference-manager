import {
  MANAGED_BRAND_LOGO_PRESET,
  MANAGED_BRAND_REFERENCE,
  PRODUCT_DEFAULT_LOGO_PRESET,
} from '../shared/tenant-branding.js';
import { normalizeTenantPresentation } from './tenant-presentation-api.js';

export function createDemoTenantPresentationApi({ organizationSettings } = {}) {
  if (!organizationSettings || typeof organizationSettings.loadOrganization !== 'function') {
    throw new TypeError('DEMO_TENANT_PRESENTATION_ORGANIZATION_REQUIRED');
  }
  return Object.freeze({
    isDemo: true,
    async loadPresentation() {
      const snapshot = await organizationSettings.loadOrganization();
      const reference = snapshot?.organization?.branding?.logoAssetRef;
      const logoPreset = reference === null
        ? PRODUCT_DEFAULT_LOGO_PRESET
        : (reference === MANAGED_BRAND_REFERENCE ? MANAGED_BRAND_LOGO_PRESET : null);
      return normalizeTenantPresentation({
        schemaVersion: 1,
        revision: snapshot?.revision,
        presentation: {
          displayName: snapshot?.organization?.displayName,
          defaultLocale: snapshot?.organization?.presentation?.defaultLocale,
          defaultCurrency: snapshot?.organization?.presentation?.defaultCurrency,
          branding: {
            logoPreset,
            accentToken: snapshot?.organization?.branding?.accentToken,
          },
        },
      });
    },
  });
}
