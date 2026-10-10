import { assertSecretGuardActive } from './redaction-guard.mjs';

export const ACCEPTANCE_HEADER = 'x-cm-demo-acceptance';
const CUSTOMER = 'https://conference-manager-demo.onrender.com';
const PLATFORM = 'https://conference-manager-ops-demo.onrender.com';
const UNSAFE_ENV = ['DEBUG', 'PWDEBUG', 'NODE_DEBUG', 'DEBUG_FILE', 'PW_TEST_CONNECT_WS_ENDPOINT',
  'PW_TEST_CONNECT_HEADERS', 'PLAYWRIGHT_DISABLE_FORCED_CHROMIUM_PROXIED_LOOPBACK',
  'PLAYWRIGHT_PROXY_BYPASS_FOR_TESTING', 'NODE_TLS_REJECT_UNAUTHORIZED', 'PW_RUNNER_DEBUG', 'SSLKEYLOGFILE', 'NODE_OPTIONS'];

function fail() { throw new Error('CM_ACCEPTANCE_CONFIGURATION_REJECTED'); }

export function acceptanceGateEnabled(env = process.env) {
  if (env.CM_DEMO_ACCEPTANCE_MODE === undefined) return false;
  if (env.CM_DEMO_ACCEPTANCE_MODE !== 'gate') fail();
  return true;
}

export function requireAcceptanceAccess(origin, env = process.env) {
  if (!acceptanceGateEnabled(env) || UNSAFE_ENV.some((key) => env[key] !== undefined)) fail();
  const customer = env.CM_DEMO_CUSTOMER_ACCEPTANCE_TOKEN;
  const platform = env.CM_DEMO_PLATFORM_ACCEPTANCE_TOKEN;
  if (![customer, platform].every((value) => /^[a-f0-9]{64}$/.test(value || '')) || customer === platform) fail();
  const expiry = env.CM_DEMO_ACCEPTANCE_EXPIRES_AT;
  if (typeof expiry !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(expiry)) fail();
  const expiresAt = Date.parse(expiry);
  const remaining = expiresAt - Date.now();
  if (!Number.isFinite(expiresAt) || new Date(expiresAt).toISOString() !== expiry || remaining <= 0 || remaining > 5_400_000) fail();
  assertSecretGuardActive([customer, platform]);
  if (origin === CUSTOMER) return Object.freeze({ token: customer, expiresAt });
  if (origin === PLATFORM) return Object.freeze({ token: platform, expiresAt });
  fail();
}
