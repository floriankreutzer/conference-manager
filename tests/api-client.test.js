import test from 'node:test';
import assert from 'node:assert/strict';

import { ApiSecurityError, createApiClient } from '../src/core/api-client.js';

function jsonResponse(body = {}, { status = 200, contentType = 'application/json', headers = {} } = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': contentType, ...headers },
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

test('API errors preserve only a bounded machine-readable server code for safe recovery UX', async () => {
  const client = createApiClient({
    origin: 'https://conference.example',
    fetchImpl: async () => jsonResponse({
      error: {
        code: 'MICROSOFT365_CONNECTION_REVOKED',
        requestId: 'not-forwarded-as-authority',
      },
    }, { status: 409 }),
  });
  await assert.rejects(
    () => client.request('integration'),
    (error) => error instanceof ApiSecurityError
      && error.code === 'HTTP_409'
      && error.serverCode === 'MICROSOFT365_CONNECTION_REVOKED',
  );
});

test('API errors reject malformed server error codes instead of exposing arbitrary response text', async () => {
  const client = createApiClient({
    origin: 'https://conference.example',
    fetchImpl: async () => jsonResponse({
      error: { code: '<script>alert(1)</script>', detail: 'sensitive provider response' },
    }, { status: 503 }),
  });
  await assert.rejects(
    () => client.request('integration'),
    (error) => error instanceof ApiSecurityError
      && error.code === 'HTTP_503'
      && error.serverCode === null
      && !error.message.includes('sensitive'),
  );
});

test('API errors preserve the HTTP classification when no public JSON error body exists', async () => {
  const client = createApiClient({
    origin: 'https://conference.example',
    fetchImpl: async () => new Response(null, { status: 401 }),
  });
  await assert.rejects(
    () => client.request('session'),
    (error) => error instanceof ApiSecurityError
      && error.code === 'HTTP_401'
      && error.serverCode === null,
  );
});

test('oversized API responses are rejected from Content-Length before body processing', async () => {
  const client = createApiClient({
    origin: 'https://conference.example',
    fetchImpl: async () => jsonResponse({ ok: true }, {
      headers: { 'content-length': '1000001' },
    }),
  });
  await assert.rejects(
    () => client.request('requests'),
    (error) => assertSecurityCode(error, 'RESPONSE_TOO_LARGE'),
  );
});

test('chunked API responses are byte-bounded even without Content-Length', async () => {
  const oversized = new Uint8Array(1_000_001);
  oversized.fill(97);
  const client = createApiClient({
    origin: 'https://conference.example',
    fetchImpl: async () => new Response(oversized, {
      status: 200,
      headers: { 'content-type': 'application/json' },
    }),
  });
  await assert.rejects(
    () => client.request('requests'),
    (error) => assertSecurityCode(error, 'RESPONSE_TOO_LARGE'),
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
