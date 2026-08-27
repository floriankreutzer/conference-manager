import {
  adapterError,
  boundedText,
  exactObject,
  immutable,
  positiveRevision,
} from './tenant-settings-wire.js';
import {
  MANAGED_BRAND_LOGO_PRESET,
  MANAGED_BRAND_REFERENCE,
  PRODUCT_DEFAULT_LOGO_PRESET,
} from '../shared/tenant-branding.js';

const CURRENT_PATH = 'v1/tenant/presentation';
const LOCALES = new Set(['de-DE', 'en-GB']);
const CURRENCIES = new Set(['CHF', 'EUR', 'GBP', 'USD']);
const LOGO_PRESETS = new Set([PRODUCT_DEFAULT_LOGO_PRESET, MANAGED_BRAND_LOGO_PRESET]);
const UNSAFE_DISPLAY_NAME = /[<>\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/;

export const TENANT_PRESENTATION_FALLBACK = immutable({
  schemaVersion: 1,
  revision: 0,
  presentation: {
    displayName: 'Conference Manager',
    defaultLocale: 'de-DE',
    defaultCurrency: 'EUR',
    branding: {
      logoPreset: PRODUCT_DEFAULT_LOGO_PRESET,
      accentToken: 'default',
    },
  },
});

export class TenantPresentationApiError extends Error {
  constructor(code, { cause } = {}) {
    super(code, cause === undefined ? undefined : { cause });
    this.name = 'TenantPresentationApiError';
    this.code = code;
  }
}

function responseInvalid() {
  throw new TenantPresentationApiError('TENANT_PRESENTATION_RESPONSE_INVALID');
}

function normalizedDisplayName(value) {
  if (typeof value !== 'string' || UNSAFE_DISPLAY_NAME.test(value)) responseInvalid();
  try {
    return boundedText(value.trim().normalize('NFC'), {
      code: 'TENANT_PRESENTATION_RESPONSE_INVALID',
      maximum: 160,
    });
  } catch {
    responseInvalid();
  }
}

export function normalizeTenantPresentation(value) {
  try {
    exactObject(value, ['schemaVersion', 'revision', 'presentation'], 'TENANT_PRESENTATION_RESPONSE_INVALID');
    exactObject(
      value.presentation,
      ['displayName', 'defaultLocale', 'defaultCurrency', 'branding'],
      'TENANT_PRESENTATION_RESPONSE_INVALID',
    );
    exactObject(value.presentation.branding, ['logoPreset', 'accentToken'], 'TENANT_PRESENTATION_RESPONSE_INVALID');
    if (value.schemaVersion !== 1) responseInvalid();
    if (!LOCALES.has(value.presentation.defaultLocale)) responseInvalid();
    if (!CURRENCIES.has(value.presentation.defaultCurrency)) responseInvalid();
    if (!LOGO_PRESETS.has(value.presentation.branding.logoPreset)) responseInvalid();
    if (value.presentation.branding.accentToken !== 'default') responseInvalid();
    return immutable({
      schemaVersion: 1,
      revision: positiveRevision(value.revision, 'TENANT_PRESENTATION_RESPONSE_INVALID'),
      presentation: {
        displayName: normalizedDisplayName(value.presentation.displayName),
        defaultLocale: value.presentation.defaultLocale,
        defaultCurrency: value.presentation.defaultCurrency,
        branding: {
          logoPreset: value.presentation.branding.logoPreset,
          accentToken: 'default',
        },
      },
    });
  } catch (error) {
    if (error instanceof TenantPresentationApiError) throw error;
    responseInvalid();
  }
}

export function createTenantPresentationApi({ apiClient } = {}) {
  if (!apiClient || typeof apiClient.request !== 'function') {
    throw new TypeError('TENANT_PRESENTATION_API_CLIENT_REQUIRED');
  }
  return Object.freeze({
    async loadPresentation() {
      try {
        return normalizeTenantPresentation(await apiClient.request(CURRENT_PATH));
      } catch (error) {
        throw adapterError(TenantPresentationApiError, error, 'TENANT_PRESENTATION_UNAVAILABLE');
      }
    },
  });
}

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
