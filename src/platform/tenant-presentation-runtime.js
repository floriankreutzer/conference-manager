import { configureTenantLocalization } from '../core/i18n.js';
import {
  MANAGED_BRAND_LOGO_PRESET,
  MANAGED_BRAND_REFERENCE,
  PRODUCT_DEFAULT_LOGO_PRESET,
} from '../shared/tenant-branding.js';
import {
  normalizeTenantPresentation,
  TENANT_PRESENTATION_FALLBACK,
} from './tenant-presentation-api.js';

const PRODUCT_DEFAULT_LOGO_ASSET = new URL(
  '../../assets/brand/pavurel-signet-monochrome-white.svg?v=20260827-75',
  import.meta.url,
).href;
const MANAGED_LOGO_ASSET = new URL('../../assets/brand/conference-manager-mark.svg?v=20260827-74', import.meta.url).href;
const PRESENTATION_REFRESH_TIMEOUT_MS = 5_000;

function normalizedRefreshTimeout(value) {
  return Number.isSafeInteger(value) && value >= 1 && value <= 30_000
    ? value
    : PRESENTATION_REFRESH_TIMEOUT_MS;
}

function sameSnapshot(left, right) {
  return left.revision === right.revision
    && left.presentation.displayName === right.presentation.displayName
    && left.presentation.defaultLocale === right.presentation.defaultLocale
    && left.presentation.defaultCurrency === right.presentation.defaultCurrency
    && left.presentation.branding.logoPreset === right.presentation.branding.logoPreset
    && left.presentation.branding.accentToken === right.presentation.branding.accentToken;
}

function applyLocalization(snapshot) {
  configureTenantLocalization({
    defaultLocale: snapshot.presentation.defaultLocale,
    defaultCurrency: snapshot.presentation.defaultCurrency,
  });
}

function presentationFromOrganizationResult(result) {
  const organization = result?.organization;
  return normalizeTenantPresentation({
    schemaVersion: 1,
    revision: result?.revision,
    presentation: {
      displayName: organization?.displayName,
      defaultLocale: organization?.presentation?.defaultLocale,
      defaultCurrency: organization?.presentation?.defaultCurrency,
      branding: {
        logoPreset: organization?.branding?.logoAssetRef === MANAGED_BRAND_REFERENCE
          ? MANAGED_BRAND_LOGO_PRESET
          : PRODUCT_DEFAULT_LOGO_PRESET,
        accentToken: organization?.branding?.accentToken,
      },
    },
  });
}

export function createTenantPresentationRuntime({
  adapter = null,
  refreshTimeoutMs = PRESENTATION_REFRESH_TIMEOUT_MS,
} = {}) {
  if (adapter !== null && typeof adapter?.loadPresentation !== 'function') {
    throw new TypeError('TENANT_PRESENTATION_ADAPTER_INVALID');
  }
  let current = TENANT_PRESENTATION_FALLBACK;
  let highestRevision = 0;
  let refreshSequence = 0;
  const refreshTimeout = normalizedRefreshTimeout(refreshTimeoutMs);
  const subscribers = new Set();

  function apply(next) {
    const changed = !sameSnapshot(current, next);
    current = next;
    applyLocalization(current);
    if (changed) subscribers.forEach((subscriber) => subscriber(current));
    return current;
  }

  return Object.freeze({
    current() {
      return current;
    },
    async refresh(options = {}) {
      const sequence = ++refreshSequence;
      const { preserveCurrentOnFailure = false, ...adapterOptions } = options;
      let next;
      let timeoutId = null;
      try {
        if (adapter === null) {
          next = TENANT_PRESENTATION_FALLBACK;
        } else if (adapterOptions.signal) {
          next = await adapter.loadPresentation(adapterOptions);
        } else {
          const controller = new AbortController();
          timeoutId = globalThis.setTimeout(() => controller.abort(), refreshTimeout);
          next = await adapter.loadPresentation({ ...adapterOptions, signal: controller.signal });
        }
        if (next.revision < highestRevision) {
          next = preserveCurrentOnFailure ? current : TENANT_PRESENTATION_FALLBACK;
        }
      } catch {
        next = preserveCurrentOnFailure ? current : TENANT_PRESENTATION_FALLBACK;
      } finally {
        if (timeoutId !== null) globalThis.clearTimeout(timeoutId);
      }
      if (sequence !== refreshSequence) return current;
      if (next.revision > highestRevision) highestRevision = next.revision;
      return apply(next);
    },
    applyOrganizationResult(result) {
      const next = presentationFromOrganizationResult(result);
      if (next.revision < highestRevision) throw new TypeError('TENANT_PRESENTATION_MUTATION_STALE');
      refreshSequence += 1;
      highestRevision = next.revision;
      return apply(next);
    },
    subscribe(subscriber) {
      if (typeof subscriber !== 'function') throw new TypeError('TENANT_PRESENTATION_SUBSCRIBER_INVALID');
      subscribers.add(subscriber);
      return () => subscribers.delete(subscriber);
    },
  });
}

export function createPresentationRefreshingOrganizationSettings({
  organizationSettings,
  presentationRuntime,
} = {}) {
  if (!organizationSettings || !['loadOrganization', 'saveOrganization', 'listOrganizationHistory']
    .every((method) => typeof organizationSettings?.[method] === 'function')) {
    throw new TypeError('TENANT_ORGANIZATION_SETTINGS_INVALID');
  }
  if (
    !presentationRuntime
    || typeof presentationRuntime.refresh !== 'function'
    || typeof presentationRuntime.applyOrganizationResult !== 'function'
  ) {
    throw new TypeError('TENANT_PRESENTATION_RUNTIME_REQUIRED');
  }
  const adapter = {
    loadOrganization: (...args) => organizationSettings.loadOrganization(...args),
    listOrganizationHistory: (...args) => organizationSettings.listOrganizationHistory(...args),
    async saveOrganization(...args) {
      const result = await organizationSettings.saveOrganization(...args);
      presentationRuntime.applyOrganizationResult(result);
      void Promise.resolve(
        presentationRuntime.refresh({ preserveCurrentOnFailure: true }),
      ).catch(() => {});
      return result;
    },
  };
  if (typeof organizationSettings.reset === 'function') {
    adapter.reset = async (...args) => {
      const result = await organizationSettings.reset(...args);
      await presentationRuntime.refresh();
      return result;
    };
  }
  if (typeof organizationSettings.scenario === 'function') {
    adapter.scenario = (...args) => organizationSettings.scenario(...args);
  }
  return Object.freeze(adapter);
}

function renderTextFallback(mark, documentRoot) {
  mark.textContent = 'CM';
  const accent = documentRoot.createElement('span');
  accent.textContent = '.';
  mark.appendChild(accent);
  delete mark.dataset.logoPreset;
}

function renderProductDefault(mark, documentRoot) {
  mark.textContent = '';
  const image = documentRoot.createElement('img');
  image.alt = '';
  image.src = PRODUCT_DEFAULT_LOGO_ASSET;
  image.decoding = 'async';
  image.addEventListener('error', () => renderTextFallback(mark, documentRoot), { once: true });
  delete mark.dataset.logoPreset;
  mark.appendChild(image);
}

function renderManagedMark(mark, documentRoot) {
  mark.textContent = '';
  const image = documentRoot.createElement('img');
  image.alt = '';
  image.src = MANAGED_LOGO_ASSET;
  image.decoding = 'async';
  image.addEventListener('error', () => renderProductDefault(mark, documentRoot), { once: true });
  mark.dataset.logoPreset = 'conference-manager-mark';
  mark.appendChild(image);
}

export function applyTenantPresentationToDocument(documentRoot, snapshot = TENANT_PRESENTATION_FALLBACK) {
  const presentation = snapshot.presentation;
  const productTitle = presentation.displayName === TENANT_PRESENTATION_FALLBACK.presentation.displayName
    ? presentation.displayName
    : `${presentation.displayName} · ${TENANT_PRESENTATION_FALLBACK.presentation.displayName}`;
  documentRoot.title = productTitle;
  documentRoot.documentElement.dataset.tenantPresentationRevision = String(snapshot.revision);
  documentRoot.getElementById('sidebar')?.setAttribute('aria-label', presentation.displayName);
  const title = documentRoot.getElementById('brandTitle');
  if (title) title.textContent = presentation.displayName;
  const mark = documentRoot.querySelector('.brand-mark');
  if (mark) {
    if (presentation.branding.logoPreset === MANAGED_BRAND_LOGO_PRESET) renderManagedMark(mark, documentRoot);
    else renderProductDefault(mark, documentRoot);
  }
  return presentation;
}
