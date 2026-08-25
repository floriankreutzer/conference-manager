import assert from 'node:assert/strict';
import test from 'node:test';
import { createMicrosoft365ConnectionApi } from '../src/platform/microsoft365-connection-api.js';

function client(responses) {
  const calls = [];
  return {
    calls,
    request: async (path, options = {}) => {
      calls.push({ path, options });
      return responses.shift();
    },
  };
}

function connectionPayload(overrides = {}) {
  return {
    connection: {
      status: 'connected',
      placesPermission: 'granted',
      calendarsPermission: 'granted',
      reason: null,
      lastVerifiedAt: '2026-08-25T12:00:00.000Z',
      requiredPermissions: ['Place.Read.All', 'Calendars.ReadBasic.All'],
      ...overrides,
    },
    requestId: '00000000-0000-4000-8000-000000000001',
  };
}

test('Microsoft 365 status maps the backend connection contract into the UI model', async () => {
  const apiClient = client([connectionPayload({
    status: 'degraded',
    calendarsPermission: 'unverified',
    reason: 'calendars_permission_unverified',
  })]);
  const api = createMicrosoft365ConnectionApi({ apiClient });
  assert.deepEqual(await api.getStatus(), {
    state: 'degraded',
    reason: 'calendars_permission_unverified',
    permissions: { place: 'granted', calendars: 'unverified' },
  });
  assert.equal(apiClient.calls[0].path, 'v1/integrations/microsoft365');
});

test('Microsoft 365 mutations use the shared CSRF-capable API client', async () => {
  const apiClient = client([
    { authorizationUrl: 'https://login.microsoftonline.com/organizations/v2.0/adminconsent?client_id=x' },
    connectionPayload(),
    connectionPayload({
      status: 'disconnected',
      placesPermission: 'unknown',
      calendarsPermission: 'unknown',
    }),
  ]);
  const api = createMicrosoft365ConnectionApi({ apiClient });
  await api.connect();
  await api.verify();
  await api.disconnect();
  assert.deepEqual(apiClient.calls.map(({ path, options }) => [path, options.method]), [
    ['v1/integrations/microsoft365/connect', 'POST'],
    ['v1/integrations/microsoft365/verify', 'POST'],
    ['v1/integrations/microsoft365', 'DELETE'],
  ]);
});

test('Microsoft 365 consent rejects non-Microsoft and malformed redirect authority', async () => {
  for (const authorizationUrl of ['https://attacker.example/consent', 'not a url']) {
    const api = createMicrosoft365ConnectionApi({
      apiClient: client([{ authorizationUrl }]),
    });
    await assert.rejects(() => api.connect(), (error) => error.code === 'MICROSOFT365_REDIRECT_INVALID');
  }
});

test('Microsoft 365 response validation rejects invented client-side contract shapes', async () => {
  const api = createMicrosoft365ConnectionApi({
    apiClient: client([{
      connection: {
        state: 'connected',
        permissions: { place: 'granted', calendars: 'granted' },
      },
    }]),
  });
  await assert.rejects(() => api.getStatus(), (error) => error.code === 'MICROSOFT365_RESPONSE_INVALID');
});

test('Microsoft 365 response validation fails closed for invalid provider permission states', async () => {
  const api = createMicrosoft365ConnectionApi({
    apiClient: client([connectionPayload({ calendarsPermission: 'invented' })]),
  });
  await assert.rejects(() => api.getStatus(), (error) => error.code === 'MICROSOFT365_RESPONSE_INVALID');
});
