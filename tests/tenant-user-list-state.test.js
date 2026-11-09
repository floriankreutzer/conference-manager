import assert from 'node:assert/strict';
import test from 'node:test';
import { canRetainUserList, retainedUserPage, USER_FILTER_DEFAULTS } from '../src/tenant-admin/sections/users/model.js';

const scope = { owner: Object.freeze({}), userId: 'admin-one', query: { limit: 25, afterId: null, ...USER_FILTER_DEFAULTS } };
const page = { users: [], nextAfterId: null };
const snapshot = { ...scope, page };

test('retained Users presentation is restricted to the exact active identity and list query', () => {
  assert.equal(retainedUserPage(snapshot, { ...scope, query: { ...scope.query } }), page);
  for (const changes of [{ owner: Object.freeze({}) }, { userId: 'admin-two' }, { owner: null }, { userId: '' }]) {
    assert.equal(retainedUserPage(snapshot, { ...scope, ...changes }), null);
  }
  for (const changes of [{ search: 'Casey' }, { status: 'disabled' }, { role: 'tenant_admin' },
    { providerLink: 'linked' }, { afterId: 'next-user' }, { limit: 50 }]) {
    assert.equal(retainedUserPage(snapshot, { ...scope, query: { ...scope.query, ...changes } }), null);
  }
  assert.equal(retainedUserPage(null, scope), null);
});

test('only temporary list failures may retain a read-only projection, never authority or invalid data', () => {
  for (const code of ['TENANT_USERS_UNAVAILABLE', 'HTTP_429', 'HTTP_500', 'HTTP_502', 'HTTP_503', 'HTTP_504']) {
    assert.equal(canRetainUserList(code), true, code);
  }
  for (const code of ['HTTP_401', 'HTTP_403', 'SESSION_EXPIRED', 'SESSION_REVOKED', 'AUTHORIZATION_DENIED',
    'TENANT_USERS_RESPONSE_INVALID', 'TENANT_USER_FILTERS_INVALID', 'HTTP_409', 'UNKNOWN', undefined, null]) {
    assert.equal(canRetainUserList(code), false, String(code));
  }
});
