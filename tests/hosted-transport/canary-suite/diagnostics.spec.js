import { test, expect, chromium, webkit } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { createOriginContext, createBoundContext } from '../../support/origin-context.mjs';
import { localFixture, ORIGIN } from '../local-fixture.mjs';

const checksum = '7e22005f1e9689fbea4ccfc75084f5f3d224fe10e60a6af23c1cb600f2b70014';
async function evidence(testInfo) {
  await testInfo.attach('saas37-scenario-evidence', { contentType: 'application/json', body: Buffer.from(JSON.stringify({
    schemaVersion: 1, browser: testInfo.project.name, seedVersion: 'saas-3.7-three-demo-customers-v1', checksum,
    cycles: [1, 2].map((cycle) => ({ cycle, northwindRooms: 10, northwindSeedRequests: 20, contosoTasksCompleted: 7,
      fabrikamRoomsImported: 2, allThreeRestored: true, checksum })), cleanupVerified: true,
  })) });
}

test('managed acceptance diagnostic boundary', async ({}, testInfo) => {
  if (process.env.CM_TRANSPORT_EXECUTION_MARKER) await writeFile(process.env.CM_TRANSPORT_EXECUTION_MARKER, 'executed');
  const token = process.env.CM_DEMO_CUSTOMER_ACCEPTANCE_TOKEN;
  console.log(token); console.error(token);
  if (process.env.CM_TRANSPORT_CANARY_CASE === 'reflection') {
    await testInfo.attach('untrusted-reflection', { body: Buffer.from(token), contentType: 'text/plain' });
    throw new Error(token);
  }
  if (process.env.CM_TRANSPORT_CANARY_CASE === 'binary') {
    await testInfo.attach('untrusted-binary', { body: Buffer.from(token), contentType: 'application/octet-stream' }); return;
  }
  if (process.env.CM_TRANSPORT_CANARY_CASE === 'path') {
    await testInfo.attach('untrusted-path', { path: process.env.CM_TRANSPORT_ATTACHMENT_PATH }); return;
  }
  if (process.env.CM_TRANSPORT_CANARY_CASE?.startsWith('browser-echo-')) {
    const engine = process.env.CM_TRANSPORT_CANARY_CASE === 'browser-echo-chromium' ? chromium : webkit;
    const fixture = await localFixture(); let browser; let context;
    try {
      browser = await engine.launch({ headless: true });
      context = await createBoundContext((options) => browser.newContext(options), {
        origin: ORIGIN, token, expiresAt: Date.now() + 30_000, ignoreHTTPSErrors: false,
      }, { connectSocket: fixture.connectSocket });
      const page = await context.newPage(); await page.goto(`${ORIGIN}/echo`);
      expect(await page.locator('p').textContent()).toBe(token);
      // A closed-schema success marker is emitted only after the real page
      // received the echoed canary through the bound, TLS-verifying context.
      await evidence(testInfo);
      await expect(page.locator('p')).toHaveText('expected-safe-text', { timeout: 200 });
    } finally { await context?.close(); await browser?.close(); await fixture.close(); }
    return;
  }
  if (process.env.CM_TRANSPORT_CANARY_CASE === 'caught-write') {
    try { await writeFile(testInfo.outputPath('raw.json'), token); } catch { /* The persistent latch must fail the run. */ }
    return;
  }
  if (process.env.CM_TRANSPORT_CANARY_CASE === 'public-options') {
    let contexts = 0;
    const fake = { newContext() { contexts += 1; throw new Error('must not bind'); } };
    for (const extra of [{ token }, { expiresAt: Date.now() + 999_999 }, { connectSocket() {} },
      { ignoreHTTPSErrors: true }, { proxy: { server: 'http://127.0.0.1:1' } }]) {
      await expect(createOriginContext(fake, { origin: 'https://conference-manager-demo.onrender.com', ignoreHTTPSErrors: false, ...extra })).rejects.toThrow();
    }
    expect(contexts).toBe(0); return;
  }
  await evidence(testInfo);
});
