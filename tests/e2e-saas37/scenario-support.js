import { createHash } from 'node:crypto';
import { expect } from '@playwright/test';

// Hosted runs use the real approved HTTPS origins (including same-origin consent).
// Isolated runs use the repository's fixed TLS edge; no caller-chosen destination.
export function scenarioOrigins(env = process.env) {
  const supplied = [env.SHARED_DEMO_CUSTOMER_ORIGIN, env.SHARED_DEMO_PLATFORM_ORIGIN];
  if (supplied.every((value) => value === undefined)) {
    return Object.freeze({ customer: 'https://customer.demo.test:4443', platform: 'https://platform.demo.test:4443', hosted: false });
  }
  if (supplied[0] !== 'https://conference-manager-demo.onrender.com'
    || supplied[1] !== 'https://conference-manager-ops-demo.onrender.com') {
    throw new TypeError('SAAS37_SCENARIO_ORIGINS_INVALID');
  }
  return Object.freeze({ customer: supplied[0], platform: supplied[1], hosted: true });
}

export const ORIGINS = scenarioOrigins();
export const NORTHWIND = '10000000-0000-4000-8000-000000000001';
export const CONTOSO = '20000000-0000-4000-8000-000000000002';
export const FABRIKAM = '40000000-0000-4000-8000-000000000004';
export const SEED_VERSION = 'saas-3.7-three-demo-customers-v1';
export const SEMANTIC_CHECKSUM = '7e22005f1e9689fbea4ccfc75084f5f3d224fe10e60a6af23c1cb600f2b70014';
export const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAACAAAAAgCAIAAAD8GO2jAAAALUlEQVR4nGOsWHCCgZaAiaamj1owasGoBaMWjFowasGoBaMWjFowasGoBVQEAEl4AiCcDJG+AAAAAElFTkSuQmCC', 'base64');
export const LOCATIONS_PATH = '/api/v1/tenant/settings/locations';
export const CATALOGUE_PATH = '/api/v1/tenant/settings/catalogue';
export const INTEGRATION_PATH = '/api/v1/integrations/microsoft365';

export async function json(response, expected = 200) {
  // Never stringify a session or consent payload into failure output.
  expect(response.status(), `HTTP status for ${new URL(response.url()).pathname}`).toBe(expected);
  expect(response.headers()['content-type']).toContain('application/json');
  return response.json();
}

export function headers(session, origin = ORIGINS.customer) {
  return { Origin: origin, 'X-CSRF-Token': session.csrfToken };
}

export async function customerSession(context) {
  return json(await context.request.get(`${ORIGINS.customer}/api/v1/demo/session`));
}

export async function contextFor(context, tenantId, persona) {
  const current = await customerSession(context);
  return json(await context.request.put(`${ORIGINS.customer}/api/v1/demo/session/context`, {
    headers: headers(current), data: { tenantId, persona },
  }));
}

export async function selectContext(page, tenantId, persona) {
  await page.getByLabel('Demo-Tenant').selectOption(tenantId);
  await page.getByLabel('Demo-Persona').selectOption(persona);
  const bootstrap = page.waitForResponse((response) => response.request().method() === 'GET'
    && new URL(response.url()).pathname === '/api/v1/demo/session');
  const switched = page.waitForResponse((response) => response.request().method() === 'PUT'
    && new URL(response.url()).pathname === '/api/v1/demo/session/context');
  const reloadedDocument = page.waitForEvent('domcontentloaded');
  await page.locator('[data-demo-security] button').click();
  await reloadedDocument;
  // The accepted switch intentionally reloads the document. Its old response
  // body is no longer readable; verify status and the fresh server session.
  expect((await switched).status()).toBe(200);
  expect((await bootstrap).status()).toBe(200);
  await expect(page.getByLabel('Demo-Tenant')).toHaveValue(tenantId);
  await expect(page.getByLabel('Demo-Persona')).toHaveValue(persona);
  return customerSession(page.context());
}

export async function uiResponse(page, method, path, action, expected = 200) {
  const [response] = await Promise.all([
    page.waitForResponse((result) => result.request().method() === method
      && new URL(result.url()).pathname === path),
    action(),
  ]);
  // Browser response bodies can be retired by document/context transitions.
  // Verify the real UI operation here; scenario reads prove committed payloads
  // through normal authenticated API reads and visible post-action state.
  expect(response.status(), `HTTP status for ${path}`).toBe(expected);
  if (expected === 204) {
    // HTTP 204 has no payload; Chromium does not expose a body for it.
    expect(response.headers()['content-type']).toBeUndefined();
  } else {
    expect(response.headers()['content-type']).toContain('application/json');
  }
  return response;
}

export async function locations(context) {
  return (await json(await context.request.get(`${ORIGINS.customer}${LOCATIONS_PATH}?schemaVersion=3`))).locations;
}

export async function catalogue(context) {
  return json(await context.request.get(`${ORIGINS.customer}${CATALOGUE_PATH}`));
}

export async function requests(context) {
  const result = [];
  const cursors = new Set();
  let cursor = null;
  for (let count = 0; count < 30; count += 1) {
    const query = new URLSearchParams({ limit: '10', ...(cursor ? { cursor } : {}) });
    const page = await json(await context.request.get(`${ORIGINS.customer}/api/v1/application/requests?${query}`));
    result.push(...page.requests);
    if (page.page.complete) {
      expect(new Set(result.map(({ id }) => id)).size).toBe(result.length);
      return result;
    }
    cursor = page.page.nextCursor;
    expect(typeof cursor).toBe('string');
    expect(cursors.has(cursor)).toBe(false);
    cursors.add(cursor);
  }
  throw new Error('SAAS37_REQUEST_PAGINATION_BOUNDS_EXCEEDED');
}

export async function reset(context) {
  await context.clearCookies();
  const initial = await json(await context.request.get(`${ORIGINS.platform}/api/v1/platform/demo/session`));
  const admin = await json(await context.request.put(`${ORIGINS.platform}/api/v1/platform/demo/session/persona`, {
    headers: headers(initial, ORIGINS.platform), data: { persona: 'security_admin' },
  }));
  const result = await json(await context.request.post(`${ORIGINS.platform}/api/v1/platform/demo/reset`, {
    headers: headers(admin, ORIGINS.platform), data: { confirm: true }, timeout: 75_000,
  }));
  expect(result.seedVersion).toBe(SEED_VERSION);
  expect(result.checksum).toBe(SEMANTIC_CHECKSUM);
  return { seedVersion: result.seedVersion, checksum: result.checksum };
}

export async function activateContoso(page) {
  await page.goto(ORIGINS.platform);
  const select = page.getByLabel('Simulierte Operator-Rolle');
  await uiResponse(page, 'PUT', '/api/v1/platform/demo/session/persona', () => select.selectOption('tenant_operator'));
  await page.locator(`[data-platform-admin-tenant="${CONTOSO}"]`).click();
  await page.locator('[data-platform-admin-navigate="lifecycle"]').click();
  await page.locator('[data-platform-action="activate"]').click();
  await page.locator('#platformAdminActionReason').fill('SaaS 3.7 synthetic scenario acceptance');
  await uiResponse(page, 'POST', `/api/v1/platform/tenants/${CONTOSO}/lifecycle/transitions`,
    () => page.locator('[data-platform-admin-confirm-action="activate"]').click());
}

export async function openAdmin(page, section) {
  await page.locator('[data-view="tenantAdmin"]').click();
  await page.locator(`[data-tenant-admin-section="${section}"]`).click();
}

export function businessDate() {
  const date = new Date(Date.now() + 28 * 86_400_000);
  date.setUTCHours(10, 0, 0, 0);
  while ([0, 6].includes(date.getUTCDay())) date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

export async function mediaHash(context, url) {
  const response = await context.request.get(url);
  expect(response.status()).toBe(200);
  expect(response.headers()['cache-control']).toBe('private, no-store');
  return createHash('sha256').update(await response.body()).digest('hex');
}

export async function imagesLoaded(root) {
  const images = root.locator('img');
  expect(await images.count()).toBeGreaterThan(0);
  for (const image of await images.all()) {
    // Native lazy images in scrollable previews load when a user reaches them.
    await image.scrollIntoViewIfNeeded();
    await expect(image).toBeVisible();
    await expect.poll(() => image.evaluate((element) => element.complete && element.naturalWidth > 0)).toBe(true);
    expect(await image.getAttribute('alt')).toBeTruthy();
  }
}
