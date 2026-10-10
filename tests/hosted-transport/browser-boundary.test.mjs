import test from 'node:test';
import assert from 'node:assert/strict';
import { chromium, webkit } from '@playwright/test';
import { localFixture, ORIGIN, OTHER_ORIGIN, HEADER } from './local-fixture.mjs';

function evidence(engine, scenario, fixture) {
  // Closed numeric counters only: no request/response headers, token or URL.
  console.log('CM_TRANSPORT_EVIDENCE', JSON.stringify({ engine, scenario, counters: fixture.proxy.evidence(),
    acceptedRequests: fixture.events.length, foreignRequests: fixture.foreignEvents.length,
    foreignAuthorized: fixture.foreignEvents.filter((event) => event.authorized).length }));
}

for (const [name, engine] of [['chromium', chromium], ['webkit', webkit]]) {
  test(`${name}: page and API requests share exact-origin TLS transport without disabling cache`, { timeout: 45_000 }, async () => {
    const fixture = await localFixture();
    let browser;
    try {
      browser = await engine.launch({ headless: true });
      const context = await browser.newContext({ ignoreHTTPSErrors: false,
        proxy: { server: fixture.proxy.server }, extraHTTPHeaders: { [HEADER]: fixture.token } });
      const page = await context.newPage();
      await page.goto(ORIGIN); assert.equal(await page.title(), 'Local transport');
      assert.equal(await page.evaluate(() => window.transportLoaded), true);
      await page.goto(`${ORIGIN}/page-two`);
      assert.equal(fixture.events.filter(({ path }) => path === '/cache.js').length, 1);
      const body = await page.evaluate(async () => (await fetch('/api')).json()); assert.equal(body.authorized, true);
      const api = await context.request.get(`${ORIGIN}/api`); assert.equal((await api.json()).cookiePresent, true);
      for (const path of ['/other', '/scheme', '/port']) {
        const before = fixture.events.length;
        let denied = false; try { await page.goto(`${ORIGIN}${path}`, { timeout: 5_000 }); } catch { denied = true; }
        assert.equal(denied, true); assert.equal(fixture.events.filter(({ path: value }) => value === path).length, 1);
        assert.ok(fixture.events.length >= before + 1);
      }
      await context.close();
    } finally { evidence(name, 'cache-api-redirect', fixture); await browser?.close(); await fixture.close(); }
  });

  test(`${name}: cross-origin page fetches, subresources and direct loopback navigation never receive the header`, { timeout: 45_000 }, async () => {
    const fixture = await localFixture();
    let browser;
    try {
      browser = await engine.launch({ headless: true });
      const context = await browser.newContext({ ignoreHTTPSErrors: false,
        proxy: { server: fixture.proxy.server }, extraHTTPHeaders: { [HEADER]: fixture.token } });
      const page = await context.newPage(); await page.goto(ORIGIN);
      const before = fixture.events.length;
      const result = await page.evaluate(async (other) => {
        try { await fetch(`${other}/api`); return false; } catch { return true; }
      }, OTHER_ORIGIN);
      assert.equal(result, true);
      await page.evaluate((other) => new Promise((resolve) => {
        const image = new Image(); image.onload = () => resolve(false); image.onerror = () => resolve(true); image.src = `${other}/image`; document.body.append(image);
      }), OTHER_ORIGIN);
      let denied = false;
      try { denied = (await page.goto(fixture.foreignUrl, { timeout: 5_000 }))?.status() === 403; }
      catch { denied = true; }
      // HTTP 403 is a fulfilled page.goto, unlike a CONNECT/network failure.
      // Both denials must still prove that no request reached the foreign server.
      assert.equal(fixture.foreignEvents.length, 0);
      assert.equal(denied, true); assert.equal(fixture.events.length, before);
      assert.ok(fixture.proxy.evidence().rejected >= 3);
      await context.close();
    } finally { evidence(name, 'foreign-loopback', fixture); await browser?.close(); await fixture.close(); }
  });

  test(`${name}: service worker and WebSocket traffic cannot escape the context boundary`, { timeout: 45_000 }, async () => {
    const fixture = await localFixture();
    let browser;
    try {
      browser = await engine.launch({ headless: true });
      const context = await browser.newContext({ ignoreHTTPSErrors: false,
        proxy: { server: fixture.proxy.server }, extraHTTPHeaders: { [HEADER]: fixture.token } });
      const page = await context.newPage(); await page.goto(ORIGIN);
      const workerDenied = await page.evaluate(async (other) => {
        await navigator.serviceWorker.register('/worker.js');
        const registration = await navigator.serviceWorker.ready;
        const channel = new MessageChannel();
        return new Promise((resolve) => {
          setTimeout(() => resolve(false), 5_000);
          channel.port1.onmessage = (event) => resolve(event.data);
          registration.active.postMessage({ url: `${other}/api` }, [channel.port2]);
        });
      }, OTHER_ORIGIN);
      assert.equal(workerDenied, true);
      const socketDenied = await page.evaluate((other) => new Promise((resolve) => {
        const socket = new WebSocket(other.replace('https:', 'wss:'));
        setTimeout(() => { socket.close(); resolve(false); }, 5_000);
        socket.onopen = () => { socket.close(); resolve(false); }; socket.onerror = () => resolve(true);
      }), OTHER_ORIGIN);
      assert.equal(socketDenied, true); assert.equal(fixture.foreignEvents.length, 0);
      await context.close();
    } finally { evidence(name, 'serviceworker-websocket', fixture); await browser?.close(); await fixture.close(); }
  });

  test(`${name}: invalid TLS remains a failure before an HTTP request`, { timeout: 45_000 }, async () => {
    const fixture = await localFixture({ badCertificate: true });
    let browser;
    try {
      browser = await engine.launch({ headless: true });
      const context = await browser.newContext({ ignoreHTTPSErrors: false,
        proxy: { server: fixture.proxy.server }, extraHTTPHeaders: { [HEADER]: fixture.token } });
      const page = await context.newPage();
      let denied = false; try { await page.goto(ORIGIN, { timeout: 5_000 }); } catch { denied = true; }
      assert.equal(denied, true); assert.equal(fixture.events.length, 0);
      await context.close();
    } finally { evidence(name, 'invalid-certificate', fixture); await browser?.close(); await fixture.close(); }
  });
}
