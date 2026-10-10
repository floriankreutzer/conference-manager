import test from 'node:test';
import assert from 'node:assert/strict';
import { request as playwrightRequest } from '@playwright/test';
import { localFixture, ORIGIN, HEADER } from './local-fixture.mjs';

async function apiFixture(options = {}) {
  const fixture = await localFixture(options);
  const request = await playwrightRequest.newContext({ ignoreHTTPSErrors: false,
    proxy: { server: fixture.proxy.server }, extraHTTPHeaders: { [HEADER]: fixture.token }, timeout: 2_000 });
  return { ...fixture, request, async close() { await request.dispose(); await fixture.close(); } };
}

test('real APIRequestContext preserves methods, bodies, cookies and same-origin redirects under verified TLS', async () => {
  const fixture = await apiFixture();
  try {
    const initial = await fixture.request.get(`${ORIGIN}/api`); assert.equal(initial.status(), 200);
    for (const method of ['get', 'post', 'put', 'patch', 'delete']) {
      const response = await fixture.request[method](`${ORIGIN}/api`, method === 'get' ? {} : { data: 'synthetic body' });
      const body = await response.json(); assert.equal(body.authorized, true); assert.equal(body.method, method.toUpperCase());
      assert.equal(body.cookiePresent, true); if (method !== 'get') assert.equal(body.data, 'synthetic body');
    }
    const redirected = await fixture.request.get(`${ORIGIN}/same`); assert.equal(redirected.status(), 200);
    assert.equal(redirected.url(), `${ORIGIN}/api`);
    assert.equal((await fixture.request.head(`${ORIGIN}/api`)).status(), 200);
  } finally { await fixture.close(); }
});

test('real APIRequestContext cannot carry a header through cross-origin, port or plaintext redirects', async () => {
  const fixture = await apiFixture();
  try {
    for (const path of ['/other', '/scheme', '/port']) {
      const before = fixture.events.length;
      let rejected = false; try { await fixture.request.get(`${ORIGIN}${path}`); } catch { rejected = true; }
      assert.equal(rejected, true); assert.equal(fixture.events.length, before + 1);
    }
    assert.ok(fixture.proxy.evidence().rejected >= 3);
  } finally { await fixture.close(); }
});

test('real APIRequestContext does not retry an unknown write and preserves private ETag/304 headers', async () => {
  const fixture = await apiFixture();
  try {
    let rejected = false; try { await fixture.request.put(`${ORIGIN}/unknown-put`, { data: 'one write' }); } catch { rejected = true; }
    assert.equal(rejected, true); assert.equal(fixture.events.filter(({ path }) => path === '/unknown-put').length, 1);
    const first = await fixture.request.get(`${ORIGIN}/private-media`); assert.equal(first.status(), 200);
    const second = await fixture.request.get(`${ORIGIN}/private-media`, { headers: { 'If-None-Match': first.headers().etag } });
    assert.equal(second.status(), 304); assert.equal((await second.body()).length, 0);
    assert.equal(second.headers().vary, 'Cookie'); assert.equal(second.headers()['cache-control'], first.headers()['cache-control']);
  } finally { await fixture.close(); }
});

test('real APIRequestContext rejects an untrusted server certificate before any HTTP request', async () => {
  const fixture = await apiFixture({ badCertificate: true });
  try {
    let rejected = false; try { await fixture.request.get(`${ORIGIN}/api`); } catch { rejected = true; }
    assert.equal(rejected, true); assert.equal(fixture.events.length, 0);
    assert.equal(fixture.proxy.evidence().tlsAccepted, 1);
  } finally { await fixture.close(); }
});
