import assert from 'node:assert/strict';
import test from 'node:test';

class MemoryStorage {
  constructor(entries = []) {
    this.values = new Map(entries);
  }

  getItem(key) {
    return this.values.has(key) ? this.values.get(key) : null;
  }

  setItem(key, value) {
    this.values.set(key, String(value));
  }
}

class FixtureElement {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.attributes = new Map();
    this.children = [];
    this.dataset = {};
    this._textContent = '';
  }

  set textContent(value) {
    this._textContent = String(value);
    this.children = [];
  }

  get textContent() {
    return this._textContent + this.children.map((child) => child.textContent).join('');
  }

  appendChild(child) {
    this.children.push(child);
    return child;
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  getAttribute(name) {
    return this.attributes.get(name) ?? null;
  }

  addEventListener(type, listener) {
    this.listener = { type, listener };
  }
}

const storage = new MemoryStorage();
const documentAtImport = {
  documentElement: { lang: 'de', dataset: {} },
};
globalThis.localStorage = storage;
globalThis.document = documentAtImport;
globalThis.window = { dispatchEvent() {} };
globalThis.CustomEvent = class CustomEvent {
  constructor(type, options) {
    this.type = type;
    this.detail = options?.detail;
  }
};

const {
  MANAGED_BRAND_REFERENCE,
  MANAGED_BRAND_LOGO_PRESET,
} = await import('../src/shared/tenant-branding.js');
const {
  TENANT_PRESENTATION_FALLBACK,
  createTenantPresentationApi,
} = await import('../src/platform/tenant-presentation-api.js');
const { createDemoTenantPresentationApi } = await import('../src/platform/demo-tenant-presentation-api.js');
const {
  applyTenantPresentationToDocument,
  createPresentationRefreshingOrganizationSettings,
  createTenantPresentationRuntime,
} = await import('../src/platform/tenant-presentation-runtime.js');
const { createTenantOrganizationSettingsApi } = await import('../src/platform/tenant-organization-settings-api.js');
const { productionRequestBusinessDetails } = await import('../src/shared/production-request-details.js');
const {
  configureTenantLocalization,
  currency,
  formatMoney,
  language,
  locale,
  setLanguage,
  t,
} = await import('../src/core/i18n.js');

function payload(overrides = {}) {
  return {
    schemaVersion: 1,
    revision: 4,
    presentation: {
      displayName: 'Northstar Events',
      defaultLocale: 'en-GB',
      defaultCurrency: 'CHF',
      branding: { logoPreset: MANAGED_BRAND_LOGO_PRESET, accentToken: 'default' },
    },
    ...overrides,
  };
}

function client(response) {
  const calls = [];
  return {
    calls,
    async request(path, options) {
      calls.push({ path, options });
      if (response instanceof Error) throw response;
      return structuredClone(response);
    },
  };
}

test('Production presentation adapter accepts only the exact minimized projection', async () => {
  const apiClient = client(payload());
  const result = await createTenantPresentationApi({ apiClient }).loadPresentation();
  assert.deepEqual(result, payload());
  assert.equal(Object.isFrozen(result.presentation.branding), true);
  assert.deepEqual(apiClient.calls, [{ path: 'v1/tenant/presentation', options: undefined }]);

  const invalidResponses = [
    { ...payload(), tenantId: 'other' },
    { ...payload(), schemaVersion: 2 },
    { ...payload(), revision: 0 },
    { ...payload(), presentation: { ...payload().presentation, roles: ['tenant_admin'] } },
    { ...payload(), presentation: { ...payload().presentation, defaultLocale: 'fr-FR' } },
    { ...payload(), presentation: { ...payload().presentation, defaultCurrency: 'BTC' } },
    { ...payload(), presentation: { ...payload().presentation, displayName: '<img src=x>' } },
    {
      ...payload(),
      presentation: {
        ...payload().presentation,
        branding: { logoPreset: 'https://other.example/logo.svg', accentToken: 'default' },
      },
    },
    {
      ...payload(),
      presentation: {
        ...payload().presentation,
        branding: { ...payload().presentation.branding, remoteAsset: 'https://other.example/logo.svg' },
      },
    },
  ];
  for (const response of invalidResponses) {
    await assert.rejects(
      createTenantPresentationApi({ apiClient: client(response) }).loadPresentation(),
      (error) => error.code === 'TENANT_PRESENTATION_RESPONSE_INVALID',
    );
  }
});

test('organization settings accept only the bounded managed brand reference', async () => {
  const organization = {
    displayName: 'Northstar Events',
    businessMetadata: { legalName: null, registrationNumber: null, countryCode: 'DE' },
    presentation: { defaultLocale: 'de-DE', defaultCurrency: 'EUR' },
    branding: { logoAssetRef: MANAGED_BRAND_REFERENCE, accentToken: 'default' },
  };
  const apiClient = client({ schemaVersion: 1, revision: 2, organization });
  await createTenantOrganizationSettingsApi({ apiClient }).saveOrganization({
    expectedRevision: 1,
    organization,
  });
  assert.equal(apiClient.calls[0].options.body.organization.branding.logoAssetRef, MANAGED_BRAND_REFERENCE);

  for (const logoAssetRef of [
    'managed-brand:another-managed-reference-v1',
    'https://other.example/logo.svg',
    'data:image/svg+xml,remote',
  ]) {
    const rejectedClient = client({ schemaVersion: 1, revision: 2, organization });
    await assert.rejects(
      createTenantOrganizationSettingsApi({ apiClient: rejectedClient }).saveOrganization({
        expectedRevision: 1,
        organization: { ...organization, branding: { logoAssetRef, accentToken: 'default' } },
      }),
      (error) => error.code === 'TENANT_ORGANIZATION_RESPONSE_INVALID',
    );
    assert.equal(rejectedClient.calls.length, 0);
  }
});

test('runtime applies a safe product fallback for transport, partial, invalid, and stale responses', async () => {
  const partialApi = createTenantPresentationApi({
    apiClient: client({ schemaVersion: 1, revision: 1, presentation: { displayName: 'Partial' } }),
  });
  const partialRuntime = createTenantPresentationRuntime({ adapter: partialApi });
  assert.deepEqual(await partialRuntime.refresh(), TENANT_PRESENTATION_FALLBACK);

  const transportRuntime = createTenantPresentationRuntime({
    adapter: { async loadPresentation() { throw new Error('NETWORK_UNAVAILABLE'); } },
  });
  assert.deepEqual(await transportRuntime.refresh(), TENANT_PRESENTATION_FALLBACK);

  const responses = [payload({ revision: 1 }), payload({ revision: 2 }), payload({ revision: 1 })];
  const revisions = [];
  const runtime = createTenantPresentationRuntime({
    adapter: { async loadPresentation() { return responses.shift(); } },
  });
  runtime.subscribe((snapshot) => revisions.push(snapshot.revision));
  assert.equal((await runtime.refresh()).revision, 1);
  assert.equal((await runtime.refresh()).revision, 2);
  assert.deepEqual(await runtime.refresh(), TENANT_PRESENTATION_FALLBACK);
  assert.deepEqual(revisions, [1, 2, 0]);
});

test('Demo projection derives from the same organization revision and rejects unapproved references', async () => {
  let reference = MANAGED_BRAND_REFERENCE;
  const organizationSettings = {
    async loadOrganization() {
      return {
        schemaVersion: 1,
        revision: 7,
        organization: {
          displayName: 'Deterministic tenant',
          presentation: { defaultLocale: 'de-DE', defaultCurrency: 'EUR' },
          branding: { logoAssetRef: reference, accentToken: 'default' },
        },
      };
    },
  };
  const api = createDemoTenantPresentationApi({ organizationSettings });
  assert.equal((await api.loadPresentation()).presentation.branding.logoPreset, MANAGED_BRAND_LOGO_PRESET);
  reference = null;
  assert.equal((await api.loadPresentation()).presentation.branding.logoPreset, 'product-default');
  reference = 'managed-brand:unapproved-remote-reference';
  await assert.rejects(api.loadPresentation(), (error) => error.code === 'TENANT_PRESENTATION_RESPONSE_INVALID');
});

test('organization writes refresh the effective presentation before returning success', async () => {
  const calls = [];
  const organizationSettings = {
    async loadOrganization() { calls.push('load'); return { revision: 1 }; },
    async listOrganizationHistory() { calls.push('history'); return { revisions: [] }; },
    async saveOrganization() { calls.push('save'); return { revision: 2 }; },
    async reset() {
      calls.push('reset:start');
      await Promise.resolve();
      calls.push('reset:complete');
      return 1;
    },
  };
  const adapter = createPresentationRefreshingOrganizationSettings({
    organizationSettings,
    presentationRuntime: { async refresh() { calls.push('refresh'); } },
  });
  assert.deepEqual(await adapter.saveOrganization({}), { revision: 2 });
  assert.deepEqual(calls, ['save', 'refresh']);
  assert.equal(await adapter.reset(), 1);
  assert.deepEqual(calls, ['save', 'refresh', 'reset:start', 'reset:complete', 'refresh']);
});

test('tenant localization supplies defaults while an explicit User language remains authoritative', () => {
  configureTenantLocalization({ defaultLocale: 'en-GB', defaultCurrency: 'CHF' });
  assert.equal(language(), 'en');
  assert.equal(locale(), 'en-GB');
  assert.equal(currency(), 'CHF');
  assert.match(formatMoney(1234.5), /CHF|Fr/);

  setLanguage('de');
  configureTenantLocalization({ defaultLocale: 'en-GB', defaultCurrency: 'GBP' });
  assert.equal(language(), 'de');
  assert.equal(locale(), 'de-DE');
  assert.equal(currency(), 'GBP');
  assert.equal(storage.getItem('conference_language_v1'), 'de');
  assert.match(formatMoney(1234.5), /£|GBP/);
});

test('production request business numbers follow the active locale', () => {
  const request = {
    details: {
      title: 'Locale review',
      catering: { participantCount: 1_234.5 },
      dietaryRequirements: '',
      specialRequirements: '',
    },
    pricing: {
      currency: 'EUR',
      totalMinor: 12_345,
      services: [],
      catering: {
        packageSelection: null,
        items: [{ item: { name: 'Coffee' }, quantity: 1_234.5 }],
      },
    },
    allocations: {
      entries: [{ code: 'CC-1', name: 'Events', percentageBasisPoints: 1_250 }],
    },
  };

  setLanguage('de');
  const german = new Map(productionRequestBusinessDetails(request));
  assert.equal(german.get(t('catering.people')), '1.234,5');
  assert.match(german.get(t('catering.items')), /1\.234,5/);
  assert.match(german.get(t('cost.allocations')), /12,5\s%/u);

  setLanguage('en');
  const english = new Map(productionRequestBusinessDetails(request));
  assert.equal(english.get(t('catering.people')), '1,234.5');
  assert.match(english.get(t('catering.items')), /1,234\.5/);
  assert.match(english.get(t('cost.allocations')), /12\.5%/);
});

test('shell application preserves its semantic brand container and uses only code-shipped preset assets', () => {
  const elements = {
    sidebar: new FixtureElement('aside'),
    brandTitle: new FixtureElement('strong'),
  };
  const mark = new FixtureElement('div');
  const documentRoot = {
    title: '',
    documentElement: { dataset: {} },
    createElement: (tagName) => new FixtureElement(tagName),
    getElementById: (id) => elements[id] || null,
    querySelector: (selector) => (selector === '.brand-mark' ? mark : null),
  };
  const snapshot = payload({ revision: 9 });
  applyTenantPresentationToDocument(documentRoot, snapshot);
  assert.equal(elements.brandTitle.textContent, 'Northstar Events');
  assert.equal(elements.sidebar.getAttribute('aria-label'), 'Northstar Events');
  assert.equal(documentRoot.documentElement.dataset.tenantPresentationRevision, '9');
  assert.equal(mark.tagName, 'DIV');
  assert.equal(mark.children.length, 1);
  assert.equal(mark.children[0].tagName, 'IMG');
  assert.equal(mark.children[0].alt, '');
  assert.match(mark.children[0].src, /\/assets\/brand\/conference-manager-mark\.svg\?v=20260827-74$/);
  assert.doesNotMatch(mark.children[0].src, /^https:\/\/(?!conference\.test)/);

  applyTenantPresentationToDocument(documentRoot, TENANT_PRESENTATION_FALLBACK);
  assert.equal(mark.textContent, '');
  assert.equal(mark.children.length, 1);
  assert.equal(mark.children[0].tagName, 'IMG');
  assert.equal(mark.children[0].alt, '');
  assert.match(mark.children[0].src, /\/assets\/brand\/pavurel-signet-monochrome-white\.svg\?v=20260827-75$/);
  assert.doesNotMatch(mark.children[0].src, /^https:\/\/(?!conference\.test)/);
  assert.equal(mark.dataset.logoPreset, undefined);

  mark.children[0].listener.listener();
  assert.equal(mark.textContent, 'CM.');
  assert.equal(mark.children.length, 1);
  assert.equal(mark.children[0].tagName, 'SPAN');
});
