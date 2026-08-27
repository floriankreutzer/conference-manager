const ALLOWED_METHODS = new Set(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
const SAFE_METHODS = new Set(['GET']);
const JSON_CONTENT_TYPE = /^application\/(?:[a-z0-9.+-]*\+)?json(?:\s*;|$)/i;
const ABSOLUTE_OR_PROTOCOL_RELATIVE = /^(?:[a-z][a-z0-9+.-]*:|\/\/)/i;
const SERVER_ERROR_CODE = /^[A-Z][A-Z0-9_]{1,127}$/;
const SERVER_REQUEST_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const TENANT_SETTINGS_REVISION_CONFLICT = 'TENANT_SETTINGS_REVISION_CONFLICT';
const TENANT_SETTINGS_CONFLICT_KEYS = Object.freeze(['code', 'currentRevision', 'requestId']);
const MAX_RESPONSE_BYTES = 1_000_000;

export class ApiSecurityError extends Error {
  constructor(code, options = {}) {
    super(code, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'ApiSecurityError';
    this.code = code;
    this.serverCode = typeof options.serverCode === 'string' && SERVER_ERROR_CODE.test(options.serverCode)
      ? options.serverCode
      : null;
    this.currentRevision = Number.isSafeInteger(options.currentRevision) && options.currentRevision > 0
      ? options.currentRevision
      : null;
  }
}

function normalizedOrigin(origin) {
  const parsed = new URL(origin);
  if (parsed.protocol !== 'https:') throw new ApiSecurityError('HTTPS_REQUIRED');
  return parsed.origin;
}

function normalizeBaseUrl(baseUrl, origin) {
  if (typeof baseUrl !== 'string' || ABSOLUTE_OR_PROTOCOL_RELATIVE.test(baseUrl.trim())) {
    throw new ApiSecurityError('INVALID_API_BASE');
  }
  const root = `${normalizedOrigin(origin)}/`;
  const base = new URL(baseUrl.replace(/^\/+/, ''), root);
  if (base.origin !== normalizedOrigin(origin)) throw new ApiSecurityError('CROSS_ORIGIN_API');
  const path = base.pathname.endsWith('/') ? base.pathname : `${base.pathname}/`;
  base.pathname = path;
  base.search = '';
  base.hash = '';
  return base;
}

function endpointUrl(base, path) {
  if (typeof path !== 'string' || !path.trim() || ABSOLUTE_OR_PROTOCOL_RELATIVE.test(path.trim()) || path.includes('\\')) {
    throw new ApiSecurityError('INVALID_API_PATH');
  }
  const normalized = path.replace(/^\/+/, '');
  const target = new URL(normalized, base);
  if (target.origin !== base.origin || !target.pathname.startsWith(base.pathname)) {
    throw new ApiSecurityError('API_PATH_ESCAPE');
  }
  target.hash = '';
  return target;
}

function normalizedMethod(method) {
  const value = String(method || 'GET').trim().toUpperCase();
  if (!ALLOWED_METHODS.has(value)) throw new ApiSecurityError('METHOD_NOT_ALLOWED');
  return value;
}

function normalizedSignal(signal) {
  if (signal === undefined) return undefined;
  if (!signal || typeof signal.aborted !== 'boolean' || typeof signal.addEventListener !== 'function') {
    throw new ApiSecurityError('INVALID_ABORT_SIGNAL');
  }
  return signal;
}

function csrfHeader(method, csrfTokenProvider) {
  if (SAFE_METHODS.has(method)) return {};
  const token = csrfTokenProvider?.();
  if (typeof token !== 'string' || token.length < 16 || token.length > 4096) {
    throw new ApiSecurityError('CSRF_TOKEN_REQUIRED');
  }
  return { 'X-CSRF-Token': token };
}

function serializeBody(body) {
  if (body === undefined) return undefined;
  try {
    return JSON.stringify(body);
  } catch (error) {
    throw new ApiSecurityError('INVALID_JSON_BODY', { cause: error });
  }
}

function assertResponseLengthHeader(response) {
  const rawLength = response.headers.get('content-length');
  if (!rawLength || !/^\d+$/.test(rawLength.trim())) return;
  if (Number(rawLength) > MAX_RESPONSE_BYTES) throw new ApiSecurityError('RESPONSE_TOO_LARGE');
}

async function readBoundedText(response) {
  assertResponseLengthHeader(response);
  if (!response.body) return '';
  if (typeof response.body.getReader !== 'function') throw new ApiSecurityError('RESPONSE_STREAM_REQUIRED');

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let byteCount = 0;
  let text = '';
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      byteCount += value.byteLength;
      if (byteCount > MAX_RESPONSE_BYTES) {
        try { await reader.cancel(); } catch {}
        throw new ApiSecurityError('RESPONSE_TOO_LARGE');
      }
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally {
    reader.releaseLock();
  }
}

async function parseJsonResponse(response) {
  if (response.status === 204) return null;
  const contentType = response.headers.get('content-type') || '';
  if (!JSON_CONTENT_TYPE.test(contentType)) throw new ApiSecurityError('UNEXPECTED_CONTENT_TYPE');
  const text = await readBoundedText(response);
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new ApiSecurityError('INVALID_JSON_RESPONSE', { cause: error });
  }
}

async function responseError(response) {
  const contentType = response.headers.get('content-type') || '';
  if (!JSON_CONTENT_TYPE.test(contentType)) {
    return new ApiSecurityError(`HTTP_${response.status}`);
  }
  const payload = await parseJsonResponse(response);
  const serverCode = payload
    && typeof payload === 'object'
    && !Array.isArray(payload)
    && payload.error
    && typeof payload.error === 'object'
    && !Array.isArray(payload.error)
    && typeof payload.error.code === 'string'
    && SERVER_ERROR_CODE.test(payload.error.code)
    ? payload.error.code
    : null;
  const errorKeys = payload?.error && typeof payload.error === 'object' && !Array.isArray(payload.error)
    ? Object.keys(payload.error).sort()
    : [];
  const currentRevision = response.status === 409
    && serverCode === TENANT_SETTINGS_REVISION_CONFLICT
    && payload
    && typeof payload === 'object'
    && !Array.isArray(payload)
    && Object.keys(payload).length === 1
    && errorKeys.length === TENANT_SETTINGS_CONFLICT_KEYS.length
    && errorKeys.every((key, index) => key === TENANT_SETTINGS_CONFLICT_KEYS[index])
    && typeof payload.error.requestId === 'string'
    && SERVER_REQUEST_ID.test(payload.error.requestId)
    && Number.isSafeInteger(payload.error.currentRevision)
    && payload.error.currentRevision > 0
    ? payload.error.currentRevision
    : null;
  return new ApiSecurityError(`HTTP_${response.status}`, { serverCode, currentRevision });
}

export function createApiClient({
  baseUrl = '/api/',
  origin = globalThis.location?.origin,
  fetchImpl = globalThis.fetch,
  csrfTokenProvider,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new ApiSecurityError('FETCH_UNAVAILABLE');
  const base = normalizeBaseUrl(baseUrl, origin);

  return Object.freeze({
    async request(path, { method = 'GET', body, signal } = {}) {
      const normalized = normalizedMethod(method);
      const url = endpointUrl(base, path);
      const serialized = serializeBody(body);
      const abortSignal = normalizedSignal(signal);
      const response = await fetchImpl(url, {
        method: normalized,
        credentials: 'same-origin',
        redirect: 'error',
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
        headers: {
          Accept: 'application/json',
          ...(serialized === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...csrfHeader(normalized, csrfTokenProvider),
        },
        ...(abortSignal === undefined ? {} : { signal: abortSignal }),
        ...(serialized === undefined ? {} : { body: serialized }),
      });
      if (!response.ok) throw await responseError(response);
      return parseJsonResponse(response);
    },
  });
}
