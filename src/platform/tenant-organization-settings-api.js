import {
  adapterError,
  boundedText,
  exactObject,
  historyPage,
  immutable,
  schemaRevision,
} from './tenant-settings-wire.js';
import { MANAGED_BRAND_REFERENCE } from '../shared/tenant-branding.js';

const CURRENT_PATH = 'v1/tenant/settings/organization';
const HISTORY_PATH = `${CURRENT_PATH}/history`;
const LOCALES = new Set(['de-DE', 'en-GB']);
const CURRENCIES = new Set(['CHF', 'EUR', 'GBP', 'USD']);
const UNSAFE_ORGANIZATION_TEXT = /[<>\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/;

export class TenantOrganizationSettingsApiError extends Error {
  constructor(code, { cause, serverCode = null, currentRevision = null } = {}) {
    super(code, cause === undefined ? undefined : { cause });
    this.name = 'TenantOrganizationSettingsApiError';
    this.code = code;
    this.serverCode = serverCode;
    this.currentRevision = currentRevision;
  }
}

function responseInvalid() {
  throw new TenantOrganizationSettingsApiError('TENANT_ORGANIZATION_RESPONSE_INVALID');
}

function nullableText(value, maximum) {
  if (value !== null && (typeof value !== 'string' || UNSAFE_ORGANIZATION_TEXT.test(value))) responseInvalid();
  try {
    const normalized = value === null ? null : value.trim().normalize('NFC');
    return boundedText(normalized, {
      code: 'TENANT_ORGANIZATION_RESPONSE_INVALID',
      maximum,
      nullable: true,
    });
  } catch {
    responseInvalid();
  }
}

function normalizeOrganization(value) {
  try {
    exactObject(value, ['displayName', 'businessMetadata', 'presentation', 'branding'], 'TENANT_ORGANIZATION_RESPONSE_INVALID');
    exactObject(value.businessMetadata, ['legalName', 'registrationNumber', 'countryCode'], 'TENANT_ORGANIZATION_RESPONSE_INVALID');
    exactObject(value.presentation, ['defaultLocale', 'defaultCurrency'], 'TENANT_ORGANIZATION_RESPONSE_INVALID');
    exactObject(value.branding, ['logoAssetRef', 'accentToken'], 'TENANT_ORGANIZATION_RESPONSE_INVALID');
    if (!LOCALES.has(value.presentation.defaultLocale) || !CURRENCIES.has(value.presentation.defaultCurrency)) responseInvalid();
    if (value.businessMetadata.countryCode !== null && !/^[A-Z]{2}$/.test(value.businessMetadata.countryCode)) responseInvalid();
    if (value.branding.logoAssetRef !== null && value.branding.logoAssetRef !== MANAGED_BRAND_REFERENCE) responseInvalid();
    if (value.branding.accentToken !== 'default') responseInvalid();
    if (typeof value.displayName !== 'string' || UNSAFE_ORGANIZATION_TEXT.test(value.displayName)) responseInvalid();
    return immutable({
      displayName: boundedText(value.displayName.trim().normalize('NFC'), { code: 'TENANT_ORGANIZATION_RESPONSE_INVALID', maximum: 160 }),
      businessMetadata: {
        legalName: nullableText(value.businessMetadata.legalName, 160),
        registrationNumber: nullableText(value.businessMetadata.registrationNumber, 80),
        countryCode: value.businessMetadata.countryCode,
      },
      presentation: {
        defaultLocale: value.presentation.defaultLocale,
        defaultCurrency: value.presentation.defaultCurrency,
      },
      branding: {
        logoAssetRef: value.branding.logoAssetRef,
        accentToken: value.branding.accentToken,
      },
    });
  } catch (error) {
    if (error instanceof TenantOrganizationSettingsApiError) throw error;
    responseInvalid();
  }
}

function normalizeCurrent(value) {
  try {
    const revision = schemaRevision(value, 'organization', 'TENANT_ORGANIZATION_RESPONSE_INVALID');
    return Object.freeze({
      schemaVersion: 1,
      revision,
      organization: normalizeOrganization(value.organization),
    });
  } catch (error) {
    if (error instanceof TenantOrganizationSettingsApiError) throw error;
    responseInvalid();
  }
}

function query({ limit = 25, beforeRevision = null } = {}) {
  if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) {
    throw new TenantOrganizationSettingsApiError('TENANT_ORGANIZATION_HISTORY_QUERY_INVALID');
  }
  if (beforeRevision !== null && (!Number.isSafeInteger(beforeRevision) || beforeRevision < 1)) {
    throw new TenantOrganizationSettingsApiError('TENANT_ORGANIZATION_HISTORY_QUERY_INVALID');
  }
  const search = new URLSearchParams({ limit: String(limit) });
  if (beforeRevision !== null) search.set('beforeRevision', String(beforeRevision));
  return search.toString();
}

export function createTenantOrganizationSettingsApi({ apiClient } = {}) {
  if (!apiClient || typeof apiClient.request !== 'function') throw new TypeError('TENANT_ORGANIZATION_API_CLIENT_REQUIRED');
  return Object.freeze({
    async loadOrganization() {
      try {
        return normalizeCurrent(await apiClient.request(CURRENT_PATH));
      } catch (error) {
        throw adapterError(TenantOrganizationSettingsApiError, error, 'TENANT_ORGANIZATION_UNAVAILABLE');
      }
    },
    async saveOrganization({ expectedRevision, organization } = {}) {
      if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 1) {
        throw new TenantOrganizationSettingsApiError('TENANT_ORGANIZATION_REVISION_INVALID');
      }
      const normalized = normalizeOrganization(organization);
      try {
        return normalizeCurrent(await apiClient.request(CURRENT_PATH, {
          method: 'PUT',
          body: { schemaVersion: 1, expectedRevision, organization: normalized },
        }));
      } catch (error) {
        throw adapterError(TenantOrganizationSettingsApiError, error, 'TENANT_ORGANIZATION_UPDATE_FAILED');
      }
    },
    async listOrganizationHistory(options) {
      try {
        return historyPage(
          await apiClient.request(`${HISTORY_PATH}?${query(options)}`),
          'organization',
          normalizeOrganization,
          'TENANT_ORGANIZATION_HISTORY_RESPONSE_INVALID',
        );
      } catch (error) {
        throw adapterError(TenantOrganizationSettingsApiError, error, 'TENANT_ORGANIZATION_HISTORY_UNAVAILABLE');
      }
    },
  });
}
