import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ORIGIN = 'https://conference.test';
const USER_ID = '11111111-1111-4111-8111-111111111111';
const TENANT_ID = '22222222-2222-4222-8222-222222222222';
const CSRF_TOKEN = 'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC';
const MANAGED_BRAND_REFERENCE = 'managed-brand:conference-manager-mark-v1';

function contentType(filePath) {
  if (filePath.endsWith('.html')) return 'text/html; charset=utf-8';
  if (filePath.endsWith('.js')) return 'text/javascript; charset=utf-8';
  if (filePath.endsWith('.css')) return 'text/css; charset=utf-8';
  if (filePath.endsWith('.svg')) return 'image/svg+xml';
  if (filePath.endsWith('.ttf')) return 'font/ttf';
  return 'application/octet-stream';
}

async function productionHtml() {
  const source = await readFile(path.join(ROOT, 'index.html'), 'utf8');
  return source
    .replace(
      '<meta name="conference-runtime" content="demo">',
      '<meta name="conference-runtime" content="production">',
    )
    .replace("connect-src 'none'", "connect-src 'self'");
}

function permissionsFor(roles) {
  const permissions = ['request:read', 'request:cancel'];
  if (roles.includes('conference_manager')) permissions.push('request:manage');
  if (roles.includes('tenant_admin')) {
    permissions.push(
      'tenant:configure',
      'tenant:users:manage',
      'tenant:integrations:manage',
      'tenant:audit:read',
    );
  }
  return permissions;
}

function sessionPayload(roles) {
  return {
    user: { id: USER_ID },
    tenant: { id: TENANT_ID, status: 'active' },
    roles,
    permissions: permissionsFor(roles),
    session: { expiresAt: '2026-09-24T12:00:00.000Z' },
    csrfToken: CSRF_TOKEN,
  };
}

function presentationPayload({
  revision = 1,
  displayName = 'Northstar Events',
  defaultLocale = 'de-DE',
  defaultCurrency = 'EUR',
  logoPreset = 'conference-manager-mark',
} = {}) {
  return {
    schemaVersion: 1,
    revision,
    presentation: {
      displayName,
      defaultLocale,
      defaultCurrency,
      branding: { logoPreset, accentToken: 'default' },
    },
  };
}

function organizationFromPresentation(presentation) {
  return {
    displayName: presentation.presentation.displayName,
    businessMetadata: { legalName: null, registrationNumber: null, countryCode: 'DE' },
    presentation: {
      defaultLocale: presentation.presentation.defaultLocale,
      defaultCurrency: presentation.presentation.defaultCurrency,
    },
    branding: {
      logoAssetRef: presentation.presentation.branding.logoPreset === 'conference-manager-mark'
        ? MANAGED_BRAND_REFERENCE
        : null,
      accentToken: 'default',
    },
  };
}

async function installFixture(page, {
  roles = ['employee'],
  initialPresentation = presentationPayload(),
  presentationFailure = false,
  productDefaultAssetFailure = false,
  organizationSettings = false,
} = {}) {
  let presentation = structuredClone(initialPresentation);
  let organization = organizationFromPresentation(presentation);
  const presentationReads = [];
  const writes = [];

  const fulfillJson = (route, body, status = 200) => route.fulfill({
    status,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify(body),
  });

  await page.route(`${ORIGIN}/**`, async (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.pathname === '/api/v1/session') {
      await fulfillJson(route, sessionPayload(roles));
      return;
    }
    if (url.pathname === '/api/v1/tenant/presentation') {
      presentationReads.push(url.pathname);
      if (presentationFailure) {
        await fulfillJson(route, { error: { code: 'SERVICE_UNAVAILABLE' } }, 503);
      } else {
        await fulfillJson(route, presentation);
      }
      return;
    }
    if (organizationSettings && url.pathname === '/api/v1/tenant/settings/organization' && request.method() === 'GET') {
      await fulfillJson(route, { schemaVersion: 1, revision: presentation.revision, organization });
      return;
    }
    if (organizationSettings && url.pathname === '/api/v1/tenant/settings/organization/history') {
      await fulfillJson(route, {
        schemaVersion: 1,
        revisions: [{
          revision: presentation.revision,
          effectiveAt: '2026-08-27T10:00:00.000Z',
          organization,
        }],
        nextBeforeRevision: null,
      });
      return;
    }
    if (organizationSettings && url.pathname === '/api/v1/tenant/settings/organization' && request.method() === 'PUT') {
      const body = request.postDataJSON();
      writes.push(body);
      organization = structuredClone(body.organization);
      presentation = presentationPayload({
        revision: body.expectedRevision + 1,
        displayName: organization.displayName,
        defaultLocale: organization.presentation.defaultLocale,
        defaultCurrency: organization.presentation.defaultCurrency,
        logoPreset: organization.branding.logoAssetRef === MANAGED_BRAND_REFERENCE
          ? 'conference-manager-mark'
          : 'product-default',
      });
      await fulfillJson(route, {
        schemaVersion: 1,
        revision: presentation.revision,
        organization,
      });
      return;
    }
    if (url.pathname.startsWith('/api/')) {
      await fulfillJson(route, { error: { code: 'NOT_FOUND' } }, 404);
      return;
    }
    if (
      productDefaultAssetFailure
      && url.pathname === '/assets/brand/pavurel-signet-monochrome-white.svg'
    ) {
      await route.fulfill({ status: 404, body: 'Not found' });
      return;
    }

    let relativePath = decodeURIComponent(url.pathname).replace(/^\/+/, '');
    if (!relativePath) relativePath = 'index.html';
    const filePath = path.resolve(ROOT, relativePath);
    if (filePath !== ROOT && !filePath.startsWith(`${ROOT}${path.sep}`)) {
      await route.fulfill({ status: 404, body: 'Not found' });
      return;
    }
    try {
      const body = relativePath === 'index.html'
        ? Buffer.from(await productionHtml(), 'utf8')
        : await readFile(filePath);
      await route.fulfill({ status: 200, contentType: contentType(filePath), body });
    } catch {
      await route.fulfill({ status: 404, body: 'Not found' });
    }
  });

  return {
    presentationReads,
    writes,
  };
}

test('effective presentation loads for Employee, Conference Manager, Tenant Admin, and combined roles', async ({ browser }) => {
  const roleSets = [
    ['employee'],
    ['employee', 'conference_manager'],
    ['employee', 'tenant_admin'],
    ['employee', 'conference_manager', 'tenant_admin'],
  ];
  for (const roles of roleSets) {
    const context = await browser.newContext();
    const page = await context.newPage();
    const fixture = await installFixture(page, { roles });
    await page.goto(`${ORIGIN}/`);
    await expect(page.locator('html')).toHaveAttribute('data-tenant-presentation-revision', '1');
    await expect(page.locator('#brandTitle')).toHaveText('Northstar Events');
    await expect(page.locator('.brand-mark img')).toHaveAttribute('src', /conference-manager-mark\.svg\?v=20260827-74$/);
    await expect(page.locator('.brand')).toHaveJSProperty('tagName', 'HEADER');
    await expect(page.locator('#brandTitle')).toHaveJSProperty('tagName', 'STRONG');
    await expect(page.locator('[data-demo-security]')).toHaveCount(0);
    expect(fixture.presentationReads).toEqual(['/api/v1/tenant/presentation']);
    await context.close();
  }
});

test('tenant defaults drive locale and currency while an explicit User language wins', async ({ browser }) => {
  const defaultContext = await browser.newContext();
  const defaultPage = await defaultContext.newPage();
  await installFixture(defaultPage, {
    initialPresentation: presentationPayload({ defaultLocale: 'en-GB', defaultCurrency: 'CHF' }),
  });
  await defaultPage.goto(`${ORIGIN}/`);
  await expect(defaultPage.locator('html')).toHaveAttribute('lang', 'en');
  const tenantDefault = await defaultPage.evaluate(async () => {
    const i18n = await import('/src/core/i18n.js');
    return { language: i18n.language(), currency: i18n.currency(), money: i18n.formatMoney(1234.5) };
  });
  expect(tenantDefault).toMatchObject({ language: 'en', currency: 'CHF' });
  expect(tenantDefault.money).toMatch(/CHF|Fr/);
  await defaultContext.close();

  const preferredContext = await browser.newContext();
  const preferredPage = await preferredContext.newPage();
  await preferredPage.addInitScript(() => localStorage.setItem('conference_language_v1', 'de'));
  await installFixture(preferredPage, {
    initialPresentation: presentationPayload({ defaultLocale: 'en-GB', defaultCurrency: 'GBP' }),
  });
  await preferredPage.goto(`${ORIGIN}/`);
  await expect(preferredPage.locator('html')).toHaveAttribute('lang', 'de');
  const preferred = await preferredPage.evaluate(async () => {
    const i18n = await import('/src/core/i18n.js');
    return { language: i18n.language(), currency: i18n.currency(), money: i18n.formatMoney(1234.5) };
  });
  expect(preferred).toMatchObject({ language: 'de', currency: 'GBP' });
  expect(preferred.money).toMatch(/£|GBP/);
  await preferredContext.close();
});

test('Tenant Admin organization save refreshes name, managed mark, revision, and currency in-session', async ({ page }) => {
  const fixture = await installFixture(page, {
    roles: ['employee', 'tenant_admin'],
    organizationSettings: true,
    initialPresentation: presentationPayload({
      displayName: 'Before save',
      logoPreset: 'product-default',
    }),
  });
  await page.goto(`${ORIGIN}/`);
  await page.locator('[data-view="tenantAdmin"]').click();
  await page.locator('[data-tenant-admin-section="organization"]').click();
  const form = page.locator('[data-tenant-settings-form="organization"]');
  await expect(form).toBeVisible();
  await form.locator('#tenant-organization-display-name').fill('After save');
  await form.locator('#tenant-organization-currency').selectOption('USD');
  await form.locator('#tenant-organization-logo').selectOption(MANAGED_BRAND_REFERENCE);
  await form.getByRole('button', { name: /speichern/i }).click();

  await expect(page.locator('#brandTitle')).toHaveText('After save');
  await expect(page.locator('.brand-mark img')).toHaveAttribute('src', /conference-manager-mark\.svg\?v=20260827-74$/);
  await expect(page.locator('html')).toHaveAttribute('data-tenant-presentation-revision', '2');
  await expect.poll(async () => page.evaluate(async () => (await import('/src/core/i18n.js')).currency()))
    .toBe('USD');
  expect(fixture.presentationReads).toEqual([
    '/api/v1/tenant/presentation',
    '/api/v1/tenant/presentation',
  ]);
  expect(fixture.writes).toHaveLength(1);
  expect(fixture.writes[0].organization.branding.logoAssetRef).toBe(MANAGED_BRAND_REFERENCE);
});

test('transient presentation failure stays in the PAVUREL Production shell fallback', async ({ page }) => {
  await installFixture(page, { presentationFailure: true });
  await page.goto(`${ORIGIN}/`);
  await expect(page.locator('#brandTitle')).toHaveText('Conference Manager');
  await expect(page.locator('.brand-mark img')).toHaveAttribute(
    'src',
    /pavurel-signet-monochrome-white\.svg\?v=20260827-75$/,
  );
  await expect(page.locator('.brand-mark')).toHaveText('');
  await expect(page.locator('html')).toHaveAttribute('data-tenant-presentation-revision', '0');
  await expect(page.locator('[data-demo-security]')).toHaveCount(0);
});

test('product-default asset failure degrades to the safe textual mark', async ({ page }) => {
  await installFixture(page, {
    presentationFailure: true,
    productDefaultAssetFailure: true,
  });
  await page.goto(`${ORIGIN}/`);
  await expect(page.locator('#brandTitle')).toHaveText('Conference Manager');
  await expect(page.locator('.brand-mark img')).toHaveCount(0);
  await expect(page.locator('.brand-mark')).toHaveText('CM.');
  await expect(page.locator('html')).toHaveAttribute('data-tenant-presentation-revision', '0');
  await expect(page.locator('[data-demo-security]')).toHaveCount(0);
});

test('long tenant display name reflows without changing shell semantics', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 720 });
  await installFixture(page, {
    initialPresentation: presentationPayload({ displayName: 'Northstar '.repeat(15).trim() }),
  });
  await page.goto(`${ORIGIN}/`);
  await expect(page.locator('#brandTitle')).toBeVisible();
  await expect(page.locator('.brand')).toHaveJSProperty('tagName', 'HEADER');
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
