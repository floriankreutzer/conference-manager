import { readFile } from 'node:fs/promises';
import { constants, createPublicKey, publicEncrypt, randomUUID, createHash } from 'node:crypto';
import { expect, test } from '@playwright/test';

const ORIGIN = 'https://ops-int.example.com';
const BASE = '/api/v1/platform/auth/passkey/';
const requestId = '11111111-1111-4111-8111-111111111111';
const state = Buffer.alloc(32, 1).toString('base64url');
const registration = { challenge: state, rp: { id: 'ops-int.example.com', name: 'Conference Manager' },
  user: { id: state, name: 'Operator', displayName: 'Operator' }, pubKeyCredParams: [{ type: 'public-key', alg: -7 }],
  attestation: 'none', authenticatorSelection: { residentKey: 'required', userVerification: 'required', requireResidentKey: true },
  timeout: 120000, excludeCredentials: [], extensions: { credProps: true } };
const assertion = { challenge: state, rpId: 'ops-int.example.com', userVerification: 'required',
  allowCredentials: [{ id: state, type: 'public-key' }], timeout: 120000 };

async function setup(page, { initial = 'enrollment_required', minimumPasskeys = 2 } = {}) {
  let phase = initial; const writes = [];
  // Browser UI/serialization fixture only. Real crypto/DB proof is owned by API
  // integration gates; this fixture does not represent owner-device enrollment.
  await page.addInitScript(() => {
    const bytes = length => new Uint8Array(length).fill(1).buffer;
    const encoded = btoa(String.fromCharCode(...new Uint8Array(bytes(32)))).replace(/=+$/, '');
    Object.defineProperty(navigator, 'credentials', { configurable: true, value: {
      async create() { return { id: encoded, rawId: bytes(32), type: 'public-key',
        response: { clientDataJSON: bytes(64), attestationObject: bytes(64), getTransports: () => ['internal'] },
        getClientExtensionResults: () => ({ credProps: { rk: true } }) }; },
      async get() {
        if (globalThis.passkeyCancelNext) { globalThis.passkeyCancelNext = false; throw new DOMException('', 'NotAllowedError'); }
        return { id: encoded, rawId: bytes(32), type: 'public-key', response: {
          clientDataJSON: bytes(64), authenticatorData: bytes(37), signature: bytes(72), userHandle: bytes(32) },
        getClientExtensionResults: () => ({}) };
      },
    } });
  });
  await page.route(`${ORIGIN}/**`, async route => {
    const request = route.request(); const url = new URL(request.url());
    if (!url.pathname.startsWith('/api/')) {
      const upstream = await route.fetch({ url: `https://127.0.0.1:4173${url.pathname}${url.search}` });
      await route.fulfill({ response: upstream }); return;
    }
    let status = 200; let body;
    if (url.pathname === '/api/v1/platform/session') { status = 401; body = { error: { code: 'PLATFORM_UNAUTHENTICATED' } }; }
    else if (url.pathname === `${BASE}configuration`) body = { mode: 'passkey_setup', environment: 'int', minimumPasskeys, requestId };
    else if (request.method() === 'GET') {
      const enrollment = url.pathname === `${BASE}enrollment/pending`;
      if (enrollment !== ['registration_required','possession_required'].includes(phase)) {
        status = 401; body = { error: { code: 'PLATFORM_PASSKEY_REJECTED' } };
      } else body = { status: phase, state, requestId,
        ...(phase === 'enrollment_required' ? {} : { options: phase === 'registration_required' ? registration : assertion }),
        ...(phase === 'passkey_required' ? { setupRequired: true } : {}) };
    } else {
      const data = request.postDataJSON(); writes.push({ path: url.pathname, data, csrf: request.headers()['x-csrf-token'] });
      if (url.pathname.endsWith('/enrollment/start')) phase = 'registration_required';
      else if (url.pathname.endsWith('/enrollment/register')) phase = 'possession_required';
      else if (url.pathname.endsWith('/enrollment/complete')) phase = 'credential_enrolled';
      else phase = 'setup_complete';
      body = { status: phase, requestId, ...(['registration_required','possession_required'].includes(phase)
        ? { state, options: phase === 'registration_required' ? registration : assertion } : {}) };
    }
    await route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
  });
  await page.goto(`${ORIGIN}/platform-admin/`);
  return { writes };
}

test('independent setup is labelled, keyboard usable, bilingual, responsive and resumable without browser persistence', async ({ page }) => {
  const f = await setup(page);
  await expect(page.getByRole('heading', { name: 'Ersten Passkey einrichten' })).toBeVisible();
  await expect(page.getByLabel('Einrichtungscode')).toHaveAttribute('type', 'password');
  await page.getByLabel('Freigabe-ID').fill(requestId); await page.getByLabel('Einrichtungscode').fill(state);
  await page.getByRole('button', { name: 'Freigabe verwenden' }).focus(); await page.keyboard.press('Enter');
  await expect(page.getByRole('heading', { name: 'Passkey erstellen', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Passkey erstellen', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Passkey bestätigen', exact: true })).toBeFocused();
  await page.reload(); await expect(page.getByRole('button', { name: 'Neuen Passkey bestätigen' })).toBeVisible();
  await page.locator('.platform-admin-sidebar-select').selectOption('en');
  await expect(page.getByRole('heading', { name: 'Confirm your passkey' })).toBeVisible();
  for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  await page.getByRole('button', { name: 'Confirm new passkey' }).click();
  await expect(page.getByRole('heading', { name: 'Passkey registered', exact: true })).toBeFocused();
  expect(f.writes.map(value => value.path)).toEqual([`${BASE}enrollment/start`,`${BASE}enrollment/register`,`${BASE}enrollment/complete`]);
  expect(f.writes.every(value => value.csrf === state && value.data.state === state)).toBe(true);
  expect(await page.evaluate(() => [JSON.stringify(localStorage), JSON.stringify(sessionStorage)].some(value => value.includes('AQEBAQ'))))
    .toBe(false);
  await expect(page.getByLabel('Setup code')).toHaveCount(0);
  await page.screenshot({ path: '/tmp/cm-platform-passkey-setup-webkit.png', fullPage: true });
});

for (const minimumPasskeys of [1,2]) test(`native cancellation and completion with ${minimumPasskeys} required keys stay bilingual and session-free`,
async ({ page }) => {
  const f = await setup(page, { initial: 'passkey_required',minimumPasskeys });
  await expect(page.getByRole('button', { name: 'Mit Passkey bestätigen' })).toBeVisible();
  await page.evaluate(() => { globalThis.passkeyCancelNext = true; });
  await page.getByRole('button', { name: 'Mit Passkey bestätigen' }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'abgebrochen' })).toBeVisible(); expect(f.writes).toHaveLength(0);
  await page.getByRole('button', { name: 'Mit Passkey bestätigen' }).click();
  await expect(page.getByRole('heading', { name: 'Passkey-Einrichtung abgeschlossen' })).toBeVisible();
  await page.locator('.platform-admin-sidebar-select').selectOption('en');
  await expect(page.getByRole('heading', { name: 'Passkey setup complete' })).toBeVisible();
  await expect(page.locator('[data-platform-admin-create-tenant]')).toHaveCount(0);
  expect(f.writes).toHaveLength(1); expect(f.writes[0].path).toBe(`${BASE}authenticate`);
});


test('INT approval file stays encrypted until an explicit local import and never fills or stores its setup code',async({ page })=>{
  const f=await setup(page,{ minimumPasskeys: 1 });
  await page.getByRole('button',{ name: 'Sichere Übergabe vorbereiten',exact: true }).click();
  const save=page.getByRole('link',{ name: 'Einrichtungsanfrage speichern',exact: true });
  await expect(save).toBeVisible();
  await expect(page.getByRole('link',{ name: 'Mit Microsoft anmelden',exact: true })).toHaveAttribute('target','_blank');
  const downloadPromise=page.waitForEvent('download');await save.click();const download=await downloadPromise;
  const recipient=JSON.parse(await readFile(await download.path(),'utf8'));
  expect(recipient.origin).toBe(ORIGIN);expect(recipient.format).toBe('cm-int-passkey-recipient:v1');
  expect(JSON.stringify(recipient)).not.toMatch(/PRIVATE KEY|privateKey|grantId|token/);
  const picker=page.getByLabel('Verschlüsselte Freigabedatei');
  await picker.setInputFiles({ name: 'invalid.json',mimeType: 'application/json',buffer: Buffer.from('{') });
  await page.getByRole('button',{ name: 'Freigabedatei öffnen',exact: true }).click();
  await expect(page.getByRole('alert').filter({ hasText: 'Die Datei konnte nicht verwendet werden' })).toBeVisible();
  expect(f.writes).toHaveLength(0);
  const grant={ grantId: randomUUID(),token: Buffer.alloc(32,3).toString('base64url') };
  const label=createHash('sha256').update(Buffer.from(JSON.stringify(['cm-int-passkey-browser-delivery:v1','a'.repeat(40),recipient.requestId,randomUUID(),
    1,'int',2,randomUUID(),randomUUID(),recipient.recipientSha256]))).digest();
  const ciphertext=publicEncrypt({ key: createPublicKey(recipient.recipientPublicKey),padding: constants.RSA_PKCS1_OAEP_PADDING,
    oaepHash: 'sha256',oaepLabel: label },Buffer.from(JSON.stringify(grant)));
  const bundle={ format: 'cm-int-passkey-browser-delivery:v1',requestId: recipient.requestId,
    recipientSha256: recipient.recipientSha256,labelHash: label.toString('hex'),ciphertext: ciphertext.toString('base64url') };
  await picker.setInputFiles({ name: 'approval.json',mimeType: 'application/json',buffer: Buffer.from(JSON.stringify(bundle)) });
  await page.getByRole('button',{ name: 'Freigabedatei öffnen',exact: true }).click();
  await expect(page.getByRole('heading',{ name: 'Passkey erstellen',exact: true })).toBeVisible();
  expect(f.writes).toHaveLength(1);expect(f.writes[0].path).toBe(`${BASE}enrollment/start`);
  expect(f.writes[0].data).toEqual({ state,...grant });expect(f.writes[0].csrf).toBe(state);
  expect(await page.evaluate(token=>[document.body.textContent,JSON.stringify(localStorage),JSON.stringify(sessionStorage)]
    .some(value=>value.includes(token)),grant.token)).toBe(false);
});
