import { expect, test } from '@playwright/test';

const ORIGIN = 'https://ops-int.example.com';
const ID = '11111111-1111-4111-8111-111111111111';
const state = Buffer.alloc(32, 1).toString('base64url'); const keyId = Buffer.alloc(32, 2).toString('base64url');
const options = { challenge: state, rpId: 'ops-int.example.com', userVerification: 'required',
  allowCredentials: [{ id: state, type: 'public-key' }] };
const registration = { challenge: state, rp: { id: 'ops-int.example.com', name: 'Conference Manager' },
  user: { id: state, name: 'Operator', displayName: 'Operator' }, pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
  attestation: 'none', authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
  excludeCredentials: [], extensions: { credProps: true } };
const permissions = ['platform:tenant:read','platform:readiness:read','platform:integration-health:read',
  'platform:diagnostics:read','platform:entitlement:read','platform:metering:read','platform:runtime:read'];
async function setup(page, { invalidKeys = false } = {}) {
  let authenticated = true; let enrolled = false; let refreshed = false; const writes = [];
  await page.addInitScript(() => {
    const bytes = length => new Uint8Array(length).fill(1).buffer;
    const encoded = btoa(String.fromCharCode(...new Uint8Array(bytes(32)))).replace(/=+$/, '');
    Object.defineProperty(navigator, 'credentials', { configurable: true, value: {
      async get() { return { id: encoded, rawId: bytes(32), type: 'public-key', response: {
        clientDataJSON: bytes(64), authenticatorData: bytes(37), signature: bytes(72), userHandle: bytes(32) },
      getClientExtensionResults: () => ({}) }; },
      async create() { return { id: encoded, rawId: bytes(32), type: 'public-key', response: {
        clientDataJSON: bytes(64), attestationObject: bytes(64), getTransports: () => ['internal'] },
      getClientExtensionResults: () => ({ credProps: { rk: true } }) }; },
    } });
  });
  await page.route(`${ORIGIN}/**`, async route => {
    const request = route.request(); const path = new URL(request.url()).pathname; let body; let status = 200;
    if (!path.startsWith('/api/')) {
      const upstream = await route.fetch({ url: `https://127.0.0.1:4173${new URL(request.url()).pathname}${new URL(request.url()).search}` });
      await route.fulfill({ response: upstream }); return;
    }
    if (request.method() === 'POST') writes.push({ path, body: request.postDataJSON(), csrf: request.headers()['x-csrf-token'] });
    if (path === '/api/v1/platform/session') {
      if (!authenticated) { status = 401; body = { error: { code: 'PLATFORM_UNAUTHENTICATED' } }; }
      else body = { operatorId: ID, roles: ['platform_support_reader'], permissions,
        assurance: { level: 'mfa', authenticatedAt: '2099-01-01T00:00:00.000Z' }, expiresAt: '2099-01-01T04:00:00.000Z',
        stepUpExpiresAt: null, csrfToken: (refreshed ? 'N' : 'C').repeat(43) };
    } else if (path.endsWith('/auth/passkey/configuration')) {
      body = { mode: 'application_passkey', environment: 'int', minimumPasskeys: 2, requestId: ID };
    } else if (path.endsWith('/auth/passkey/enrollment/pending') && enrolled) {
      body = { status: 'registration_required', state, options: registration, requestId: ID };
    } else if (path.endsWith('/auth/passkey/enrollment/pending') || path.endsWith('/auth/passkey/pending')) {
      status = 401; body = { error: { code: 'PLATFORM_PASSKEY_REJECTED' } };
    } else if (path.endsWith('/auth/passkey/manage/keys')) {
      body = { items: [state,keyId].map(id => ({ id, createdAt: '2026-10-19T08:00:00.000Z', lastUsedAt: null,
        backupEligible: true, backedUp: false, ...(invalidKeys ? { publicKey: 'UNEXPECTED_PRIVATE_PROJECTION' } : {}) })), requestId: ID };
    } else if (path.endsWith('/auth/passkey/manage/addition/start') || path.endsWith('/auth/passkey/manage/revocation/start')) {
      body = { status: 'passkey_required', state, options, requestId: ID };
    } else if (path.endsWith('/auth/passkey/manage/addition/complete')) {
      enrolled = true; refreshed = true; body = { status: 'registration_required', state, options: registration, requestId: ID };
    } else if (path.endsWith('/auth/passkey/enrollment/register')) {
      body = { status: 'possession_required', state, options, requestId: ID };
    } else if (path.endsWith('/auth/passkey/enrollment/complete')) {
      enrolled = false; authenticated = false; body = { status: 'credential_enrolled', requestId: ID };
    } else if (path.endsWith('/auth/passkey/manage/revocation/complete')) {
      authenticated = false; body = { status: 'reauthentication_required', requestId: ID };
    } else if (path === '/api/v1/platform/tenants') {
      body = { schemaVersion: 1, snapshotAt: '2026-10-19T08:00:00.000Z', items: [], nextCursor: null };
    } else { status = 404; body = { error: { code: 'PLATFORM_NOT_FOUND' } }; }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto(`${ORIGIN}/platform-admin/`);
  await page.getByRole('button', { name: 'Passkeys verwalten' }).click();
  return { writes };
}

test('a reader manages only own keys and requires addition proof, native registration and distinct possession before fresh sign-in', async ({ page }) => {
  const f = await setup(page); const dialog = page.getByRole('dialog');
  await expect(dialog.getByRole('heading', { name: 'Passkey 1', exact: true })).toBeVisible();
  for (const width of [320,1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    expect(await dialog.evaluate(node => node.scrollWidth <= node.clientWidth)).toBe(true);
  }
  await dialog.getByRole('button', { name: 'Weiteren Passkey hinzufügen' }).click();
  await expect(dialog.getByRole('heading', { name: 'Passkey erstellen', exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Passkey erstellen', exact: true }).click();
  await dialog.getByRole('button', { name: 'Neuen Passkey bestätigen' }).click();
  await expect(page.getByRole('heading', { name: 'Plattform-Anmeldung', exact: true })).toBeVisible();
  expect(f.writes.map(item => item.path.split('/auth/passkey/')[1])).toEqual([
    'manage/addition/start','manage/addition/complete','enrollment/register','enrollment/complete',
  ]);
  expect(f.writes[0].csrf).toBe('C'.repeat(43)); expect(f.writes[1].csrf).toBe('C'.repeat(43));
  expect(f.writes[2].csrf).toBe(state); expect(f.writes[3].csrf).toBe(state);
  expect(f.writes.every(item => !Object.hasOwn(item.body, 'operatorId') && !Object.hasOwn(item.body, 'grant'))).toBe(true);
});

test('revocation binds the selected key and ends with sign-in; malformed key projections expose no private fields', async ({ page }) => {
  const f = await setup(page);
  await page.getByRole('dialog').getByRole('button', { name: 'Passkey 2 entfernen' }).click();
  await expect(page.getByRole('heading', { name: 'Plattform-Anmeldung', exact: true })).toBeVisible();
  expect(f.writes).toHaveLength(2); expect(f.writes.every(item => item.body.credentialId === keyId)).toBe(true);
  await page.unrouteAll({ behavior: 'wait' });
  await setup(page, { invalidKeys: true });
  await expect(page.getByRole('dialog').getByRole('alert')).toBeVisible();
  await expect(page.getByRole('dialog').getByRole('button', { name: 'Weiteren Passkey hinzufügen' })).toBeDisabled();
  await expect(page.getByText('UNEXPECTED_PRIVATE_PROJECTION')).toHaveCount(0);
});
