import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createDemoMicrosoft365ConnectionApi } from '../src/platform/demo-microsoft365-connection-api.js';
import { createMicrosoft365ConnectionApi } from '../src/platform/microsoft365-connection-api.js';
import { customerDemoBoundaryViolations } from '../scripts/customer-demo-boundary-policy.mjs';

const ORIGIN = 'https://customer.demo.test:4443';
const TENANT = '40000000-0000-4000-8000-000000000004';
const CALLBACK = `${ORIGIN}/api/v1/integrations/microsoft365/callback`;
const QUERY = `state=${'a'.repeat(43)}&tenant=${TENANT}&admin_consent=true`;
const URL_VALUE = `${CALLBACK}?${QUERY}`;

function client(authorizationUrl = URL_VALUE, overrides = {}) {
  const calls = [];
  return {
    calls,
    async request(path, options) {
      calls.push({ path, options });
      return {
        authorizationUrl,
        expiresAt: '2099-01-01T00:00:00.000Z',
        requestId: '10000000-0000-4000-8000-000000000001',
        ...overrides,
      };
    },
  };
}

test('Demo consent accepts only its server-owned same-origin callback through the existing CSRF client', async () => {
  const apiClient = client();
  const result = await createDemoMicrosoft365ConnectionApi({ apiClient, origin: ORIGIN }).connect();
  assert.deepEqual(result, { authorizationUrl: URL_VALUE, expiresAt: '2099-01-01T00:00:00.000Z' });
  assert.equal(Object.isFrozen(result), true);
  assert.deepEqual(apiClient.calls, [{
    path: 'v1/integrations/microsoft365/connect', options: { method: 'POST' },
  }]);
});

test('Demo consent rejects external, production, alternate-port, credentialed and malformed callbacks', async () => {
  for (const value of [
    `https://login.microsoftonline.com/${TENANT}/v2.0/adminconsent`,
    URL_VALUE.replace(ORIGIN, 'https://attacker.invalid'),
    URL_VALUE.replace(':4443', ':4444'),
    URL_VALUE.replace('https:', 'http:'),
    URL_VALUE.replace('https://', 'https://operator@'),
    `${URL_VALUE}#fragment`,
    URL_VALUE.replace('/callback', '/connect'),
    URL_VALUE.replace('/callback', '/other/../callback'),
    `${CALLBACK}?${QUERY}&state=${'b'.repeat(43)}`,
    `${CALLBACK}?${QUERY}&tenant=${TENANT}`,
    `${CALLBACK}?${QUERY}&redirect_uri=https://attacker.invalid`,
    URL_VALUE.replace('admin_consent=true', 'admin_consent=false'),
    URL_VALUE.replace(`tenant=${TENANT}`, 'tenant=organizations'),
    URL_VALUE.replace('state=' + 'a'.repeat(43), 'state=invalid'),
    '/api/v1/integrations/microsoft365/callback',
    'not a URL',
  ]) {
    await assert.rejects(
      createDemoMicrosoft365ConnectionApi({ apiClient: client(value), origin: ORIGIN }).connect(),
      (error) => error.code === 'MICROSOFT365_REDIRECT_INVALID',
      `Must reject ${value}`,
    );
  }
});

test('Demo consent retains exact response, expiry and request-correlation validation', async () => {
  for (const overrides of [
    { expiresAt: 'tomorrow' }, { requestId: 'invalid' }, { unknown: true },
  ]) {
    await assert.rejects(
      createDemoMicrosoft365ConnectionApi({ apiClient: client(URL_VALUE, overrides), origin: ORIGIN }).connect(),
      (error) => error.code === 'MICROSOFT365_RESPONSE_INVALID',
    );
  }
  for (const origin of [undefined, 'http://customer.demo.test', `${ORIGIN}/`, `${ORIGIN}?x=1`, 'not a URL']) {
    assert.throws(
      () => createDemoMicrosoft365ConnectionApi({ apiClient: client(), origin }),
      /DEMO_MICROSOFT365_ORIGIN_INVALID/,
    );
  }
});

test('Production rejects Demo callbacks and non-default Microsoft ports regardless of extra caller flags', async () => {
  for (const authorizationUrl of [URL_VALUE, `https://login.microsoftonline.com:4443/${TENANT}/v2.0/adminconsent`]) {
    const api = createMicrosoft365ConnectionApi({
      apiClient: client(authorizationUrl),
      origin: ORIGIN,
      runtimeMode: 'demo',
      validateConsentUrl: (value) => value,
    });
    await assert.rejects(api.connect(), (error) => error.code === 'MICROSOFT365_REDIRECT_INVALID');
  }
});

test('only the explicit Demo root injects the Demo consent adapter; production reachability is prohibited', () => {
  const root = readFileSync('src/platform/demo-bootstrap.js', 'utf8');
  const app = readFileSync('src/app.js', 'utf8');
  assert.match(root, /microsoft365ConnectionFactory: createDemoMicrosoft365ConnectionApi/);
  assert.match(app, /microsoft365ConnectionFactory = createMicrosoft365ConnectionApi/);
  assert.doesNotMatch(app, /demo-microsoft365-connection-api/);
  const violations = customerDemoBoundaryViolations({
    'src/platform/production-bootstrap.js': "import './demo-microsoft365-connection-api.js';",
    'src/platform/demo-microsoft365-connection-api.js': 'export const adapter = true;',
  });
  assert.ok(violations.some((item) => item.includes('Production reachability includes Demo module')));
});
