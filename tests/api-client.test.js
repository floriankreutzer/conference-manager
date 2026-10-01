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

test('Room image upload stays same-origin, uses CSRF and never serializes raster into JSON', async () => {
  const requests = [];
  const client = createApiClient({
    origin: 'https://conference.example',
    csrfTokenProvider: () => 'test-csrf-token-at-least-sixteen-bytes',
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return jsonResponse({ assetId: '11111111-1111-4111-8111-111111111111' }, { status: 201 });
    },
  });
  const file = new File([new Uint8Array([1, 2, 3])], 'room.png', { type: 'image/png' });
  await assert.rejects(() => client.uploadRoomImage('v1/tenant/rooms/../media', file),
    (error) => assertSecurityCode(error, 'ROOM_MEDIA_INPUT_INVALID'));
  await assert.rejects(() => client.uploadRoomImage('v1/tenant/rooms/room-a/media',
    new File(['svg'], 'image.svg', { type: 'image/svg+xml' })),
  (error) => assertSecurityCode(error, 'ROOM_MEDIA_INPUT_INVALID'));
  assert.equal(requests.length, 0);
  await client.uploadRoomImage('v1/tenant/rooms/room-a/media', file);
  assert.equal(requests[0].url.href, 'https://conference.example/api/v1/tenant/rooms/room-a/media');
  assert.equal(requests[0].options.credentials, 'same-origin');
  assert.equal(requests[0].options.headers['X-CSRF-Token'], 'test-csrf-token-at-least-sixteen-bytes');
  assert.equal(requests[0].options.headers['Content-Type'], 'image/png');
  assert.equal(requests[0].options.body, file);
});

test('Demo catalogue image replacement is bounded to same-origin WebP and CSRF', async () => {
  const requests = [];
  const client = createApiClient({
    origin: 'https://conference.example',
    csrfTokenProvider: () => 'test-csrf-token-at-least-sixteen-bytes',
    fetchImpl: async (url, options) => {
      requests.push({ url, options });
      return jsonResponse({ id: '11111111-1111-4111-8111-111111111111' });
    },
  });
  const file = new File([new Uint8Array(32)], 'catering.webp', { type: 'image/webp' });
  await assert.rejects(() => client.replaceDemoCatalogueImage('../rooms', file),
    (error) => assertSecurityCode(error, 'DEMO_MEDIA_INPUT_INVALID'));
  await assert.rejects(() => client.replaceDemoCatalogueImage('11111111-1111-4111-8111-111111111111',
    new File(['<svg/>'], 'bad.svg', { type: 'image/svg+xml' })),
  (error) => assertSecurityCode(error, 'DEMO_MEDIA_INPUT_INVALID'));
  assert.equal(requests.length, 0);
  await client.replaceDemoCatalogueImage('11111111-1111-4111-8111-111111111111', file);
  assert.equal(requests[0].url.href, 'https://conference.example/api/v1/demo/media/11111111-1111-4111-8111-111111111111');
  assert.equal(requests[0].options.method, 'PUT');
  assert.equal(requests[0].options.credentials, 'same-origin');
  assert.equal(requests[0].options.headers['Content-Type'], 'image/webp');
  assert.equal(requests[0].options.headers['X-CSRF-Token'], 'test-csrf-token-at-least-sixteen-bytes');
  assert.equal(requests[0].options.body, file);
});

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

test('unsafe API requests accept only a caller-generated UUID idempotency key', async () => {
  let captured;
  const client = createApiClient({
    origin: 'https://conference.example',
    csrfTokenProvider: () => '0123456789abcdef0123456789abcdef',
    fetchImpl: async (_url, options) => {
      captured = options;
      return jsonResponse({ ok: true });
    },
  });
  const idempotencyId = '123e4567-e89b-42d3-a456-426614174000';
  await client.request('platform-operation', { method: 'POST', body: {}, idempotencyKey: idempotencyId });
  assert.equal(captured.headers['Idempotency-Key'], idempotencyId);
  await assert.rejects(
    () => client.request('platform-operation', { method: 'POST', body: {}, idempotencyKey: 'retry-me' }),
    (error) => assertSecurityCode(error, 'INVALID_IDEMPOTENCY_KEY'),
  );
  await assert.rejects(
    () => client.request('platform-operation', { idempotencyKey: idempotencyId }),
    (error) => assertSecurityCode(error, 'INVALID_IDEMPOTENCY_KEY'),
  );
});

test('Request version preconditions use one strong If-Match tag and reject invalid transport intent', async () => {
  const calls = [];
  const client = createApiClient({
    origin: 'https://conference.example',
    csrfTokenProvider: () => '0123456789abcdef0123456789abcdef',
    fetchImpl: async (_url, options) => {
      calls.push(options);
      return jsonResponse({ ok: true });
    },
  });
  await client.request('v1/requests/request-1/transitions', {
    method: 'POST', body: { transition: 'cancel' }, ifMatchVersion: 3,
  });
  assert.equal(calls[0].headers['If-Match'], '"3"');
  for (const [method, value] of [
    ['GET', 3], ['PUT', 3], ['POST', 0], ['POST', -1], ['POST', 1.5],
    ['POST', '3'], ['POST', '"3"'], ['POST', Number.MAX_SAFE_INTEGER],
  ]) {
    await assert.rejects(() => client.request('v1/requests/request-1/transitions', {
      method, ifMatchVersion: value,
    }), (error) => assertSecurityCode(error, 'INVALID_VERSION_PRECONDITION'));
  }
  assert.equal(calls.length, 1);
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

test('API errors retain only an exact Tenant settings current-revision conflict context', async () => {
  const client = createApiClient({
    origin: 'https://conference.example',
    fetchImpl: async () => jsonResponse({
      error: {
        code: 'TENANT_SETTINGS_REVISION_CONFLICT',
        currentRevision: 7,
        requestId: '123e4567-e89b-42d3-a456-426614174000',
      },
    }, { status: 409 }),
  });
  await assert.rejects(
    () => client.request('tenant/settings/locations'),
    (error) => error instanceof ApiSecurityError
      && error.code === 'HTTP_409'
      && error.serverCode === 'TENANT_SETTINGS_REVISION_CONFLICT'
      && error.currentRevision === 7,
  );
});

test('API errors discard malformed, misplaced and expanded Tenant settings conflict context', async () => {
  const variants = [
    { status: 400, error: { code: 'TENANT_SETTINGS_REVISION_CONFLICT', currentRevision: 7, requestId: '123e4567-e89b-42d3-a456-426614174000' } },
    { status: 409, error: { code: 'OTHER_CONFLICT', currentRevision: 7, requestId: '123e4567-e89b-42d3-a456-426614174000' } },
    { status: 409, error: { code: 'TENANT_SETTINGS_REVISION_CONFLICT', currentRevision: '7', requestId: '123e4567-e89b-42d3-a456-426614174000' } },
    { status: 409, error: { code: 'TENANT_SETTINGS_REVISION_CONFLICT', currentRevision: 7, requestId: 'not-a-server-request-id' } },
    { status: 409, error: { code: 'TENANT_SETTINGS_REVISION_CONFLICT', currentRevision: 7, requestId: '123e4567-e89b-42d3-a456-426614174000', tenantId: 'hidden' } },
  ];

  for (const variant of variants) {
    const client = createApiClient({
      origin: 'https://conference.example',
      fetchImpl: async () => jsonResponse({ error: variant.error }, { status: variant.status }),
    });
    await assert.rejects(
      () => client.request('tenant/settings/locations'),
      (error) => error instanceof ApiSecurityError && error.currentRevision === null,
    );
  }
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
