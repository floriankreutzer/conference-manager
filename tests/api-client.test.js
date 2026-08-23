import test from 'node:test';
import assert from 'node:assert/strict';

import { ApiSecurityError, createApiClient } from '../src/core/api-client.js';

function jsonResponse(body = {}, { status = 200, contentType = 'application/json' } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': contentType },
  });
}

function assertSecurityCode(error, code) {
  assert.equal(error instanceof ApiSecurityError, true);
  assert.equal(error.code, code);
  return true;
}

test('production API client requires HTTPS', () => {
  assert.throws(
    () => createApiClient({ origin: 'http://conference.example', fetchImpl: async () => jsonResponse() }),
    (error) => assertSecurityCode(error, 'HTTPS_REQUIRED'),
  );
});

test('production API base must be same-origin and relative', () => {
  assert.throws(
    () => createApiClient({
      origin: 'https://conference.example',
      baseUrl: 'https://attacker.example/api/',
      fetchImpl: async () => jsonResponse(),
    }),
    (error) => assertSecurityCode(error, 'INVALID_API_BASE'),
  );
});

test('API paths cannot escape the configured base path', async () => {
  const client = createApiClient({
    origin: 'https://conference.example',
    fetchImpl: async () => jsonResponse(),
  });
  await assert.rejects(
    () => client.request('../admin'),
    (error) => assertSecurityCode(error, 'API_PATH_ESCAPE'),
  );
  await assert.rejects(
    () => client.request('https://attacker.example/collect'),
    (error) => assertSecurityCode(error, 'INVALID_API_PATH'),
  );
});

test('unsafe API methods require a CSRF token', async () => {
  const client = createApiClient({
    origin: 'https://conference.example',
    fetchImpl: async () => jsonResponse(),
  });
  await assert.rejects(
    () => client.request('requests', { method: 'POST', body: { title: 'Test' } }),
    (error) => assertSecurityCode(error, 'CSRF_TOKEN_REQUIRED'),
  );
});

test('unsafe API requests use same-origin credentials and defensive fetch options', async () => {
  let captured;
  const client = createApiClient({
    origin: 'https://conference.example',
    csrfTokenProvider: () => '0123456789abcdef0123456789abcdef',
    fetchImpl: async (url, options) => {
      captured = { url: String(url), options };
      return jsonResponse({ ok: true });
    },
  });

  const result = await client.request('requests', { method: 'POST', body: { title: 'Test' } });
  assert.deepEqual(result, { ok: true });
  assert.equal(captured.url, 'https://conference.example/api/requests');
  assert.equal(captured.options.credentials, 'same-origin');
  assert.equal(captured.options.redirect, 'error');
  assert.equal(captured.options.cache, 'no-store');
  assert.equal(captured.options.referrerPolicy, 'no-referrer');
  assert.equal(captured.options.headers['X-CSRF-Token'], '0123456789abcdef0123456789abcdef');
  assert.equal(captured.options.headers['Content-Type'], 'application/json');
});

test('API responses must use JSON content types', async () => {
  const client = createApiClient({
    origin: 'https://conference.example',
    fetchImpl: async () => new Response('<html></html>', {
      status: 200,
      headers: { 'content-type': 'text/html' },
    }),
  });
  await assert.rejects(
    () => client.request('requests'),
    (error) => assertSecurityCode(error, 'UNEXPECTED_CONTENT_TYPE'),
  );
});

test('unsupported HTTP methods are rejected before network access', async () => {
  let called = false;
  const client = createApiClient({
    origin: 'https://conference.example',
    fetchImpl: async () => {
      called = true;
      return jsonResponse();
    },
  });
  await assert.rejects(
    () => client.request('requests', { method: 'TRACE' }),
    (error) => assertSecurityCode(error, 'METHOD_NOT_ALLOWED'),
  );
  assert.equal(called, false);
});
