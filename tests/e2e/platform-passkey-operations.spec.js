import { expect, test } from '@playwright/test';

const ORIGIN = 'https://ops-int.example.com';
const ID = '11111111-1111-4111-8111-111111111111';
const TENANT = '22222222-2222-4222-8222-222222222222';
const state = Buffer.alloc(32, 1).toString('base64url');
const permissions = ['platform:tenant:read','platform:readiness:read','platform:integration-health:read',
  'platform:diagnostics:read','platform:entitlement:read','platform:metering:read','platform:runtime:read',
  'platform:invitation:manage','platform:lifecycle:manage','platform:entitlement:manage','platform:quota:manage'];
async function setup(page) {
  const writes = []; let status = 'active'; let revision = 3; let sessionReads = 0;
  await page.addInitScript(() => {
    const bytes = length => new Uint8Array(length).fill(1).buffer;
    const encoded = btoa(String.fromCharCode(...new Uint8Array(bytes(32)))).replace(/=+$/, '');
    Object.defineProperty(navigator, 'credentials', { configurable: true, value: { async get() {
      if (globalThis.passkeyCancelNext) { globalThis.passkeyCancelNext = false; throw new DOMException('', 'NotAllowedError'); }
      return { id: encoded, rawId: bytes(32), type: 'public-key', response: {
        clientDataJSON: bytes(64), authenticatorData: bytes(37), signature: bytes(72), userHandle: bytes(32) },
      getClientExtensionResults: () => ({}) };
    } } });
  });
  await page.route(`${ORIGIN}/**`, async route => {
    const request = route.request(); const url = new URL(request.url()); let body; let code = 200;
    if (!url.pathname.startsWith('/api/')) {
      const upstream = await route.fetch({ url: `https://127.0.0.1:4173${url.pathname}${url.search}` });
      await route.fulfill({ response: upstream }); return;
    }
    if (url.pathname === '/api/v1/platform/session') {
      sessionReads++;
      body = { operatorId: ID, roles: ['platform_tenant_operator'], permissions,
        assurance: { level: 'mfa', authenticatedAt: '2099-01-01T00:00:00.000Z' },
        expiresAt: '2099-01-01T04:00:00.000Z', stepUpExpiresAt: null,
        csrfToken: (sessionReads > 1 ? 'N' : 'C').repeat(43) };
    } else if (url.pathname === '/api/v1/platform/auth/passkey/configuration') {
      body = { mode: 'application_passkey', environment: 'int', minimumPasskeys: 2, requestId: ID };
    } else if (url.pathname === '/api/v1/platform/tenants' && request.method() === 'GET') {
      body = { schemaVersion: 1, snapshotAt: '2026-10-19T08:00:00.000Z', items: [{ tenantId: TENANT,
        displayName: 'Synthetic customer', lifecycle: { status, revision }, onboardingState: 'complete', identityState: 'active',
        invitation: { id: null, state: 'none', revision: null, expiresAt: null }, updatedAt: '2026-10-19T08:00:00.000Z' }], nextCursor: null };
    } else if (url.pathname === `/api/v1/platform/tenants/${TENANT}/lifecycle/transitions`) {
      const headers = request.headers(); writes.push({ headers, body: request.postDataJSON(), url: request.url(), method: request.method() });
      if (!headers['x-platform-passkey-proof']) {
        code = 428; body = { status: 'passkey_required', state, requestId: ID, options: { challenge: state,
          rpId: 'ops-int.example.com', allowCredentials: [{ id: state, type: 'public-key' }], userVerification: 'required' } };
      } else {
        status = 'suspended'; revision++;
        body = { schemaVersion: 1, outcome: 'updated', lifecycle: { tenantId: TENANT, status, revision,
          changedAt: '2026-10-19T08:01:00.000Z' } };
      }
    } else { code = 404; body = { error: { code: 'PLATFORM_NOT_FOUND' } }; }
    await route.fulfill({ status: code, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto(`${ORIGIN}/platform-admin/`);
  await page.locator(`[data-platform-admin-tenant="${TENANT}"]`).click();
  await page.locator('[data-platform-admin-navigate="lifecycle"]').click();
  return { writes, sessionReads: () => sessionReads };
}

test('ordinary MFA presents permitted actions and signs only the confirmed concrete request without generic elevation', async ({ page }) => {
  const f = await setup(page);
  await page.locator('[data-platform-action="suspend"]').click();
  await expect(page.getByText('Vor dem Ausführen bestätigst du genau diese Aktion mit deinem Passkey.')).toBeVisible();
  await page.getByRole('dialog').getByRole('textbox', { name: /^Betriebliche Begründung/ }).fill('Synthetic signed lifecycle approval');
  await page.locator('[data-platform-admin-confirm-action="suspend"]').click();
  await expect(page.locator('[data-platform-action="reactivate"]')).toBeVisible();
  expect(f.writes).toHaveLength(2); const [first,second] = f.writes;
  expect(first.url).toBe(second.url); expect(first.method).toBe(second.method); expect(first.body).toEqual(second.body);
  expect(first.headers['idempotency-key']).toBe(second.headers['idempotency-key']);
  expect(first.headers['x-csrf-token']).toBe('C'.repeat(43)); expect(second.headers['x-csrf-token']).toBe('C'.repeat(43));
  expect(first.headers['x-platform-passkey-proof']).toBeUndefined();
  const proof = JSON.parse(Buffer.from(second.headers['x-platform-passkey-proof'], 'base64url').toString());
  expect(proof.state).toBe(state); expect(Object.keys(proof).sort()).toEqual(['response','state']);
  expect(f.sessionReads()).toBe(2);
  expect(await page.evaluate(() => JSON.stringify(localStorage) + JSON.stringify(sessionStorage))).not.toContain(state);
});

test('cancelling native operation proof sends no execution retry and never changes the customer state', async ({ page }) => {
  const f = await setup(page); await page.evaluate(() => { globalThis.passkeyCancelNext = true; });
  await page.locator('[data-platform-action="suspend"]').click();
  await page.getByRole('dialog').getByRole('textbox', { name: /^Betriebliche Begründung/ }).fill('Synthetic cancelled approval');
  await page.locator('[data-platform-admin-confirm-action="suspend"]').click();
  await expect(page.locator('[data-platform-action="suspend"]')).toBeVisible();
  await expect(page.locator('[data-platform-action="reactivate"]')).toHaveCount(0);
  expect(f.writes).toHaveLength(1); expect(f.writes[0].headers['x-platform-passkey-proof']).toBeUndefined();
  expect(f.sessionReads()).toBe(1);
});
