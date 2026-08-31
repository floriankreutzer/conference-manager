import { createApiClient } from '../core/api-client.js';
import {
  PRODUCTION_AUTH_STATUS,
  ProductionSessionError,
  validateProductionSession,
} from './production-session.js';

const SESSION_PATH = 'v1/demo/session';
const TENANTS_PATH = 'v1/demo/tenants';
const CONTEXT_PATH = 'v1/demo/session/context';
const DEFAULT_BOOTSTRAP_TIMEOUT_MS = 10_000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const UNSAFE_TEXT = /[<>\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/;
const TENANT_STATUSES = new Set(['pending', 'onboarding', 'ready', 'active']);

export const DEMO_CUSTOMER_PERSONA = Object.freeze({
  EMPLOYEE: 'employee',
  CONFERENCE_MANAGER: 'conference_manager',
  TENANT_ADMIN: 'tenant_admin',
});

const PERSONAS = new Set(Object.values(DEMO_CUSTOMER_PERSONA));
const PERSONA_ROLES = Object.freeze({
  [DEMO_CUSTOMER_PERSONA.EMPLOYEE]: Object.freeze(['employee']),
  [DEMO_CUSTOMER_PERSONA.CONFERENCE_MANAGER]: Object.freeze(['employee', 'conference_manager']),
  [DEMO_CUSTOMER_PERSONA.TENANT_ADMIN]: Object.freeze(['employee', 'tenant_admin']),
});

export class DemoCustomerSessionError extends Error {
  constructor(code, options = {}) {
    super(code, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'DemoCustomerSessionError';
    this.code = code;
  }
}

function exactObject(value, keys, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new DemoCustomerSessionError(code);
  }
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    throw new DemoCustomerSessionError(code);
  }
  return value;
}

function requestId(value, code) {
  if (typeof value !== 'string' || !UUID.test(value)) throw new DemoCustomerSessionError(code);
  return value;
}

function persona(value) {
  if (!PERSONAS.has(value)) throw new DemoCustomerSessionError('DEMO_SESSION_PERSONA_INVALID');
  return value;
}

function sameValues(left, right) {
  return left.length === right.length && left.every((value, index) => value === right[index]);
}

export function normalizeDemoCustomerSession(payload, options = {}) {
  const input = exactObject(payload, [
    'user', 'tenant', 'roles', 'permissions', 'session', 'csrfToken', 'demo', 'requestId',
  ], 'DEMO_SESSION_INVALID');
  requestId(input.requestId, 'DEMO_SESSION_INVALID');
  const demo = exactObject(input.demo, ['persona'], 'DEMO_SESSION_INVALID');
  const user = exactObject(input.user, ['id'], 'DEMO_SESSION_INVALID');
  const tenant = exactObject(input.tenant, ['id', 'status'], 'DEMO_SESSION_INVALID');
  const serverSession = exactObject(input.session, ['expiresAt'], 'DEMO_SESSION_INVALID');
  const selectedPersona = persona(demo.persona);
  let session;
  try {
    session = validateProductionSession({
      user,
      tenant,
      roles: input.roles,
      permissions: input.permissions,
      session: serverSession,
      csrfToken: input.csrfToken,
    }, options);
  } catch (error) {
    throw new DemoCustomerSessionError('DEMO_SESSION_INVALID', { cause: error });
  }
  if (!sameValues(session.roles, PERSONA_ROLES[selectedPersona])) {
    throw new DemoCustomerSessionError('DEMO_SESSION_PERSONA_MISMATCH');
  }
  return Object.freeze({
    ...session,
    demo: Object.freeze({ persona: selectedPersona }),
  });
}

function boundedDisplayName(value) {
  if (
    typeof value !== 'string'
    || value.trim() !== value
    || value.length < 1
    || value.length > 160
    || UNSAFE_TEXT.test(value)
  ) throw new DemoCustomerSessionError('DEMO_TENANTS_INVALID');
  return value;
}

function normalizedDemoTenant(value) {
  const tenant = exactObject(
    value,
    ['id', 'displayName', 'lifecycleStatus', 'lifecycleRevision'],
    'DEMO_TENANTS_INVALID',
  );
  if (!UUID.test(tenant.id) || !TENANT_STATUSES.has(tenant.lifecycleStatus)) {
    throw new DemoCustomerSessionError('DEMO_TENANTS_INVALID');
  }
  if (!Number.isSafeInteger(tenant.lifecycleRevision) || tenant.lifecycleRevision < 1) {
    throw new DemoCustomerSessionError('DEMO_TENANTS_INVALID');
  }
  return Object.freeze({
    id: tenant.id.toLowerCase(),
    displayName: boundedDisplayName(tenant.displayName),
    lifecycleStatus: tenant.lifecycleStatus,
    lifecycleRevision: tenant.lifecycleRevision,
  });
}

export function normalizeDemoCustomerTenants(payload) {
  const input = exactObject(payload, ['tenants', 'requestId'], 'DEMO_TENANTS_INVALID');
  requestId(input.requestId, 'DEMO_TENANTS_INVALID');
  if (!Array.isArray(input.tenants) || input.tenants.length < 1 || input.tenants.length > 20) {
    throw new DemoCustomerSessionError('DEMO_TENANTS_INVALID');
  }
  const tenants = input.tenants.map(normalizedDemoTenant);
  if (new Set(tenants.map((tenant) => tenant.id)).size !== tenants.length) {
    throw new DemoCustomerSessionError('DEMO_TENANTS_INVALID');
  }
  return Object.freeze(tenants);
}

function normalizedTimeout(value) {
  if (!Number.isSafeInteger(value) || value < 1 || value > 60_000) {
    throw new DemoCustomerSessionError('DEMO_SESSION_TIMEOUT_INVALID');
  }
  return value;
}

export function createDemoCustomerSessionRuntime({
  origin = globalThis.location?.origin,
  fetchImpl = globalThis.fetch,
  clock = () => Date.now(),
  bootstrapTimeoutMs = DEFAULT_BOOTSTRAP_TIMEOUT_MS,
} = {}) {
  const timeout = normalizedTimeout(bootstrapTimeoutMs);
  let currentSession = null;
  let availableTenants = Object.freeze([]);
  let status = PRODUCTION_AUTH_STATUS.UNAVAILABLE;
  const apiClient = createApiClient({
    baseUrl: '/api/',
    origin,
    fetchImpl,
    csrfTokenProvider: () => currentSession?.csrfToken || null,
  });

  function invalidate() {
    currentSession = null;
    availableTenants = Object.freeze([]);
    status = PRODUCTION_AUTH_STATUS.UNAVAILABLE;
  }

  return Object.freeze({
    apiClient,
    status() {
      return status;
    },
    currentSession() {
      return currentSession;
    },
    tenants() {
      return availableTenants;
    },
    async bootstrap() {
      const controller = new AbortController();
      const timeoutId = globalThis.setTimeout(() => controller.abort(), timeout);
      try {
        currentSession = normalizeDemoCustomerSession(
          await apiClient.request(SESSION_PATH, { signal: controller.signal }),
          { clock },
        );
        availableTenants = normalizeDemoCustomerTenants(
          await apiClient.request(TENANTS_PATH, { signal: controller.signal }),
        );
        if (!availableTenants.some((tenant) => tenant.id === currentSession.tenant.id)) {
          throw new DemoCustomerSessionError('DEMO_SESSION_TENANT_INVALID');
        }
        status = PRODUCTION_AUTH_STATUS.AUTHENTICATED;
        return Object.freeze({ status, session: currentSession, tenants: availableTenants });
      } catch (error) {
        invalidate();
        if (error instanceof DemoCustomerSessionError) throw error;
        if (error instanceof ProductionSessionError) {
          throw new DemoCustomerSessionError('DEMO_SESSION_INVALID', { cause: error });
        }
        if (error?.name === 'AbortError') {
          throw new DemoCustomerSessionError('DEMO_SESSION_BOOTSTRAP_TIMEOUT', { cause: error });
        }
        throw new DemoCustomerSessionError('DEMO_SESSION_BOOTSTRAP_FAILED', { cause: error });
      } finally {
        globalThis.clearTimeout(timeoutId);
      }
    },
    async selectContext({ tenantId, persona: selectedPersona } = {}) {
      if (status !== PRODUCTION_AUTH_STATUS.AUTHENTICATED || !currentSession) {
        throw new DemoCustomerSessionError('DEMO_SESSION_REQUIRED');
      }
      if (typeof tenantId !== 'string' || !UUID.test(tenantId)) {
        throw new DemoCustomerSessionError('DEMO_CONTEXT_INVALID');
      }
      const canonicalTenantId = tenantId.toLowerCase();
      if (!availableTenants.some((tenant) => tenant.id === canonicalTenantId)) {
        throw new DemoCustomerSessionError('DEMO_CONTEXT_INVALID');
      }
      const canonicalPersona = persona(selectedPersona);
      const controller = new AbortController();
      const timeoutId = globalThis.setTimeout(() => controller.abort(), timeout);
      let next;
      try {
        next = normalizeDemoCustomerSession(await apiClient.request(CONTEXT_PATH, {
          method: 'PUT',
          body: { tenantId: canonicalTenantId, persona: canonicalPersona },
          signal: controller.signal,
        }), { clock });
      } catch (error) {
        invalidate();
        if (error instanceof DemoCustomerSessionError) throw error;
        throw new DemoCustomerSessionError('DEMO_CONTEXT_UPDATE_FAILED', { cause: error });
      } finally {
        globalThis.clearTimeout(timeoutId);
      }
      if (next.tenant.id !== canonicalTenantId || next.demo.persona !== canonicalPersona) {
        invalidate();
        throw new DemoCustomerSessionError('DEMO_CONTEXT_RESPONSE_MISMATCH');
      }
      currentSession = next;
      return currentSession;
    },
  });
}

export async function bootstrapDemoCustomerAuthentication(options = {}) {
  let runtime = null;
  try {
    runtime = createDemoCustomerSessionRuntime(options);
    const result = await runtime.bootstrap();
    return Object.freeze({
      status: result.status,
      session: result.session,
      tenants: result.tenants,
      runtime,
    });
  } catch {
    return Object.freeze({
      status: PRODUCTION_AUTH_STATUS.UNAVAILABLE,
      session: null,
      tenants: Object.freeze([]),
      runtime,
    });
  }
}
