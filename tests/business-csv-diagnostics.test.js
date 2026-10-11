import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { cleanupCsvContexts, csvTestFailure, localCsvDiagnosticsEnabled,
  observeLocalCsvBootstrap } from './support/business-csv-diagnostics.js';

function request(path, { method = 'GET', origin = 'https://customer.demo.test:4443' } = {}) {
  return {
    method: () => method,
    url: () => `${origin}${path}`,
    headers: () => { throw new Error('headers must never be read'); },
    postData: () => { throw new Error('payload must never be read'); },
    failure: () => { throw new Error('raw failure must never be read'); },
  };
}

function respond(page, candidate, status) {
  page.emit('response', {
    request: () => candidate,
    status: () => status,
    headers: () => { throw new Error('response headers must never be read'); },
    body: () => { throw new Error('response payload must never be read'); },
  });
}

test('only exact local Shared projects enable the observer and shorter Manager wait', () => {
  const local = { projectName: 'webkit-shared-demo', customerOrigin: 'https://customer.demo.test:4443',
    hosted: false, gated: false };
  assert.equal(localCsvDiagnosticsEnabled(local), true);
  assert.equal(localCsvDiagnosticsEnabled({ ...local, projectName: 'chromium-shared-demo' }), true);
  for (const override of [
    { projectName: 'webkit-hosted-demo' }, { projectName: 'chromium-hosted-demo' },
    { projectName: 'webkit-saas37' }, { projectName: undefined },
    { hosted: true }, { gated: true }, { gated: undefined },
    { customerOrigin: 'https://conference-manager-demo.onrender.com' },
    { customerOrigin: 'https://customer.demo.test:4443/' },
  ]) assert.equal(localCsvDiagnosticsEnabled({ ...local, ...override }), false);
});

test('disabled CSV diagnostics do not observe a Hosted page or install listeners', () => {
  const page = new EventEmitter();
  assert.equal(observeLocalCsvBootstrap(page, false), null);
  assert.deepEqual(page.eventNames(), []);
});

test('bootstrap evidence records fixed local GET classes and never private request material', () => {
  const page = new EventEmitter();
  const diagnostic = observeLocalCsvBootstrap(page, true);
  diagnostic.start('catering-items');
  const allowed = request('/api/v1/application/catalog?section=cateringItems&cursor=PRIVATE_CURSOR#PRIVATE_FRAGMENT');
  page.emit('request', allowed);
  respond(page, allowed, 429);
  page.emit('requestfinished', allowed);
  for (const denied of [
    request('/api/v1/application/catalog', { method: 'POST' }),
    request('/api/v1/application/catalog', { origin: 'https://conference-manager-demo.onrender.com' }),
    request('/api/v1/application/catalog', { origin: 'https://customer.demo.test:4443.evil.invalid' }),
    request('/api/v1/application/catalog', { origin: 'https://PRIVATE_USER:PRIVATE_PASSWORD@customer.demo.test:4443' }),
    request('/api/v1/application/requests/PRIVATE_ID'),
    request('/api/v1/tenant/settings/catalogue'),
    request('/api/v1/application/catalog/'),
    request('/__proto__'),
  ]) { page.emit('request', denied); respond(page, denied, 200); }
  const evidence = diagnostic.snapshot();
  assert.equal(evidence.phase, 'catering-items');
  assert.equal(evidence.overflow, false);
  assert.equal(evidence.requests.length, 1);
  assert.deepEqual(Object.keys(evidence.requests[0]), ['sequence', 'endpoint', 'status', 'outcome', 'durationMs']);
  assert.deepEqual({ ...evidence.requests[0], durationMs: 0 },
    { sequence: 1, endpoint: 'catalog.cateringItems', status: 429, outcome: 'finished', durationMs: 0 });
  assert.ok(Number.isSafeInteger(evidence.requests[0].durationMs));
  assert.doesNotMatch(JSON.stringify(evidence), /PRIVATE|https|cookie|header/i);
  diagnostic.dispose();
});

test('catalogue sections classify only fixed known values and preserve ordered status evidence', () => {
  const page = new EventEmitter();
  const diagnostic = observeLocalCsvBootstrap(page, true);
  diagnostic.start('catering-items');
  const sections = ['sites', 'rooms', 'services', 'equipment', 'cateringPackages', 'cateringItems', 'costCenters'];
  for (const section of sections) {
    const candidate = request(`/api/v1/application/catalog?section=${section}&context=PRIVATE_CONTEXT`);
    page.emit('request', candidate); respond(page, candidate, 200); page.emit('requestfinished', candidate);
  }
  for (const query of ['section=PRIVATE_SECTION', 'section=sites&section=PRIVATE_SECTION']) {
    const candidate = request(`/api/v1/application/catalog?${query}`);
    page.emit('request', candidate); respond(page, candidate, 400);
  }
  const entries = diagnostic.snapshot().requests;
  assert.deepEqual(entries.map(({ sequence }) => sequence), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(entries.map(({ endpoint }) => endpoint), [...sections.map((value) => `catalog.${value}`), 'catalog', 'catalog']);
  assert.deepEqual(entries.map(({ status }) => status), [200, 200, 200, 200, 200, 200, 200, 400, 400]);
  assert.doesNotMatch(JSON.stringify(diagnostic.snapshot()), /PRIVATE/);
  diagnostic.dispose();
});

test('request failure and incomplete bodies remain distinct without reading raw errors', () => {
  const page = new EventEmitter();
  const diagnostic = observeLocalCsvBootstrap(page, true);
  diagnostic.start('initial');
  const stalled = request('/api/v1/application/profile');
  const failed = request('/api/v1/application/requests');
  const pending = request('/api/v1/demo/session');
  for (const value of [stalled, failed, pending]) page.emit('request', value);
  respond(page, stalled, 200);
  page.emit('requestfailed', failed);
  assert.deepEqual(diagnostic.snapshot().requests.map(({ endpoint, status, outcome }) => ({ endpoint, status, outcome })), [
    { endpoint: 'profile', status: 200, outcome: 'response' },
    { endpoint: 'requests', status: null, outcome: 'failed' },
    { endpoint: 'session', status: null, outcome: 'pending' },
  ]);
  diagnostic.dispose();
});

test('evidence stays bounded and a new reload cannot receive the preceding document results', () => {
  const page = new EventEmitter();
  const diagnostic = observeLocalCsvBootstrap(page, true);
  const old = request('/api/v1/application/catalog');
  page.emit('request', old);
  assert.equal(diagnostic.snapshot().requests.length, 0);
  diagnostic.start('rooms');
  page.emit('request', old);
  for (let index = 0; index < 100; index += 1) page.emit('request', request('/api/v1/application/catalog'));
  assert.equal(diagnostic.snapshot().requests.length, 64);
  assert.equal(diagnostic.snapshot().overflow, true);
  diagnostic.start('services');
  respond(page, old, 500);
  page.emit('requestfailed', old);
  assert.deepEqual(diagnostic.snapshot(), { phase: 'services', overflow: false, requests: [] });
  diagnostic.stop();
  page.emit('request', request('/api/v1/demo/session'));
  assert.equal(diagnostic.snapshot().requests.length, 0);
  assert.throws(() => diagnostic.start('PRIVATE_PHASE'), /CSV_DIAGNOSTIC_PHASE_INVALID/);
  diagnostic.dispose();
  assert.deepEqual(page.eventNames(), []);
});

test('diagnostic snapshots cannot mutate the retained evidence', () => {
  const page = new EventEmitter();
  const diagnostic = observeLocalCsvBootstrap(page, true);
  diagnostic.start('equipment');
  page.emit('request', request('/api/v1/demo/session'));
  diagnostic.snapshot().requests[0].endpoint = 'PRIVATE_INJECTION';
  assert.equal(diagnostic.snapshot().requests[0].endpoint, 'session');
  diagnostic.dispose();
});

test('all cleanup operations run even when reset and the first close fail', async () => {
  const calls = [];
  const cleanup = await cleanupCsvContexts({
    seeded: true,
    reset: async () => { calls.push('reset'); throw new Error('PRIVATE_RESET_FAILURE'); },
    customer: { close: async () => { calls.push('customer'); throw new Error('PRIVATE_CLOSE_FAILURE'); } },
    platform: { close: async () => { calls.push('platform'); } },
  });
  assert.deepEqual(calls, ['reset', 'customer', 'platform']);
  assert.deepEqual(cleanup, { reset: 'failed', customer: 'failed', platform: 'passed' });
  assert.doesNotMatch(JSON.stringify(cleanup), /PRIVATE/);
  const original = new Error('primary journey failure');
  assert.equal(csvTestFailure(original, cleanup, true), original);
  assert.equal(csvTestFailure(undefined, cleanup).message, 'CSV_CLEANUP_NOT_VERIFIED');
});

test('an unseeded journey still closes both contexts and a failure-free journey stays successful', async () => {
  let resets = 0;
  let closes = 0;
  const cleanup = await cleanupCsvContexts({
    seeded: false,
    reset: async () => { resets += 1; },
    customer: { close: async () => { closes += 1; } },
    platform: { close: async () => { closes += 1; } },
  });
  assert.equal(resets, 0); assert.equal(closes, 2);
  assert.deepEqual(cleanup, { reset: 'not_needed', customer: 'passed', platform: 'passed' });
  assert.equal(csvTestFailure(undefined, cleanup), undefined);
  assert.equal(csvTestFailure(undefined, cleanup, true).message, 'CSV_DIAGNOSTIC_ATTACHMENT_FAILED');
});
