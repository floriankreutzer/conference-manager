import { expect, test } from '@playwright/test';

test('Platform passkey adapter serializes native browser buffers without browser authority or storage', async ({ page }) => {
  await page.goto('/platform-admin/');
  const result = await page.evaluate(async () => {
    const { createPlatformPasskeyBrowser } = await import('/src/platform-admin/production/passkey-browser.js');
    const bytes = length => new Uint8Array(length).fill(1).buffer;
    const encoded = length => btoa(String.fromCharCode(...new Uint8Array(bytes(length))))
      .replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
    const before = { local: JSON.stringify(localStorage), session: JSON.stringify(sessionStorage), cookie: document.cookie };
    let options;
    const adapter = createPlatformPasskeyBrowser({ origin: 'https://ops-int.example.com', secureContext: true,
      credentials: { async get(value) {
        options = value.publicKey;
        return { id: encoded(32), rawId: bytes(32), type: 'public-key', authenticatorAttachment: 'platform',
          response: { clientDataJSON: bytes(64), authenticatorData: bytes(37), signature: bytes(72), userHandle: bytes(32) },
          getClientExtensionResults: () => ({}) };
      } } });
    const response = await adapter.authenticate({ challenge: encoded(32), rpId: 'ops-int.example.com',
      allowCredentials: [{ id: encoded(32), type: 'public-key' }], userVerification: 'required', timeout: 120000 });
    return { challengeBytes: options.challenge.byteLength, credentialBytes: options.allowCredentials[0].id.byteLength,
      requiredVerification: options.userVerification, responseFields: Object.keys(response).sort(),
      signatureLength: response.response.signature.length,
      storageUnchanged: before.local === JSON.stringify(localStorage) && before.session === JSON.stringify(sessionStorage)
        && before.cookie === document.cookie };
  });
  expect(result.challengeBytes).toBe(32); expect(result.credentialBytes).toBe(32);
  expect(result.requiredVerification).toBe('required'); expect(result.signatureLength).toBe(96);
  expect(result.storageUnchanged).toBe(true);
  expect(result.responseFields).toEqual(['authenticatorAttachment','clientExtensionResults','id','rawId','response','type']);
});

test('Platform passkey adapter cancels an in-flight prompt and rejects overlapping prompts in both engines', async ({ page }) => {
  await page.goto('/platform-admin/');
  const result = await page.evaluate(async () => {
    const { createPlatformPasskeyBrowser } = await import('/src/platform-admin/production/passkey-browser.js');
    const encoded = btoa(String.fromCharCode(...new Uint8Array(32).fill(1))).replace(/=+$/, '');
    let fail;
    const adapter = createPlatformPasskeyBrowser({ origin: 'https://ops-int.example.com', secureContext: true,
      credentials: { get() { return new Promise((resolve, reject) => { fail = reject; }); } } });
    const options = { challenge: encoded, rpId: 'ops-int.example.com', userVerification: 'required',
      allowCredentials: [{ id: encoded, type: 'public-key' }] };
    const controller = new AbortController();
    const first = adapter.authenticate(options, { signal: controller.signal }).catch(error => error.code);
    const overlap = await adapter.authenticate(options).catch(error => error.code);
    controller.abort(); fail(new DOMException('synthetic-private-native-error', 'AbortError'));
    const cancelled = await first;
    return { overlap, cancelled };
  });
  expect(result).toEqual({ overlap: 'PLATFORM_PASSKEY_BROWSER_BUSY', cancelled: 'PLATFORM_PASSKEY_BROWSER_CANCELLED' });
});
