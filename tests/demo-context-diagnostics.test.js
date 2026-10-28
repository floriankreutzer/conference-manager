import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { securityMessages } from '../src/core/security-i18n.js';
import { observeLocalDemoContextSwitch } from './support/demo-context-diagnostics.js';

function pageFixture({ status = '', retired = false, tenantIndex = 2, personaIndex = 1 } = {}) {
  const page = new EventEmitter();
  const apply = { disabled: true };
  const controls = { button: apply, '[role="status"]': { textContent: status },
    '#demoTenantSwitch': { selectedIndex: tenantIndex }, '#demoPersonaSwitch': { selectedIndex: personaIndex } };
  const root = { dataset: { demoContextSwitching: 'true', sessionLocked: 'false' },
    ownerDocument: { readyState: 'complete', activeElement: apply },
    querySelector: (selector) => selector === '[data-demo-security]' ? { querySelector: (key) => controls[key] } : null };
  page.locator = (selector) => {
    assert.equal(selector, 'html');
    return { async evaluate(callback, phases, options) {
      assert.equal(options.timeout, 1_000);
      if (retired) throw new Error('PRIVATE_RETIRED_DOCUMENT');
      return callback(root, phases);
    } };
  };
  return page;
}
function request(path, method = 'GET') {
  const forbidden = () => { throw new Error('PRIVATE_MATERIAL_MUST_NOT_BE_READ'); };
  return { url: () => `https://customer.demo.test:4443${path}`, method: () => method,
    headers: forbidden, postData: forbidden, failure: forbidden };
}

test('disabled context diagnostics install no observers or DOM probes', () => {
  const page = new EventEmitter();
  page.locator = () => { throw new Error('Hosted DOM must not be inspected'); };
  assert.equal(observeLocalDemoContextSwitch(page, false), null);
  assert.deepEqual(page.eventNames(), []);
});

test('context evidence distinguishes PUT, session GET and reload without private material', async () => {
  const page = pageFixture({ status: 'PRIVATE_STATUS' });
  const diagnostic = observeLocalDemoContextSwitch(page, true);
  const put = request('/api/v1/demo/session/context?tenantId=PRIVATE_ID', 'PUT');
  const get = request('/api/v1/demo/session?cookie=PRIVATE_COOKIE');
  page.emit('request', put); page.emit('request', get);
  page.emit('response', { request: () => put, status: () => 200,
    body: () => { throw new Error('body must not be read'); } });
  page.emit('requestfinished', put); page.emit('requestfailed', get);
  page.emit('pageerror', new Error('PRIVATE_SCRIPT_ERROR'));
  page.emit('domcontentloaded');
  for (const denied of [request('/api/v1/demo/session/context'), request('/api/v1/demo/session', 'PUT'),
    request('/api/v1/customer/PRIVATE_PATH'), request('/api/v1/demo/session', 'POST')]) page.emit('request', denied);
  const evidence = await diagnostic.snapshot();
  assert.deepEqual(evidence.network.requests.map(({ endpoint, method, status, outcome }) => ({ endpoint, method, status, outcome })),
    [{ endpoint: 'context', method: 'PUT', status: 200, outcome: 'finished' },
      { endpoint: 'session', method: 'GET', status: null, outcome: 'failed' }]);
  assert.equal(evidence.domContentLoaded, 1); assert.equal(evidence.pageErrors, 1);
  assert.deepEqual(evidence.ui, { available: true, readyState: 'complete', panelPresent: true, applyPresent: true,
    applyDisabled: true, applyFocused: true, switching: true, locked: false, tenantIndex: 2, personaIndex: 1, statusPhase: 'other' });
  assert.doesNotMatch(JSON.stringify(evidence), /PRIVATE|https|cookie|header/i);
  evidence.network.requests[0].status = 599;
  assert.equal((await diagnostic.snapshot()).network.requests[0].status, 200);
  diagnostic.dispose(); assert.deepEqual(page.eventNames(), []);
});

test('central German and English messages classify into fixed context phases', async () => {
  for (const locale of ['de', 'en']) {
    for (const [key, phase] of [['applyingContext', 'applying'], ['contextApplied', 'applied'],
      ['contextError', 'error'], ['unavailable', 'unavailable']]) {
      const diagnostic = observeLocalDemoContextSwitch(pageFixture({ status: securityMessages(locale)[key] }), true);
      assert.equal((await diagnostic.snapshot()).ui.statusPhase, phase);
      diagnostic.dispose();
    }
  }
  const diagnostic = observeLocalDemoContextSwitch(pageFixture({ tenantIndex: 101, personaIndex: -2 }), true);
  const { ui } = await diagnostic.snapshot();
  assert.equal(ui.statusPhase, 'empty'); assert.equal(ui.tenantIndex, null); assert.equal(ui.personaIndex, null);
  diagnostic.dispose();
});

test('context evidence remains bounded and a retired document preserves network evidence', async () => {
  const page = pageFixture({ retired: true });
  const diagnostic = observeLocalDemoContextSwitch(page, true);
  for (let index = 0; index < 70; index++) {
    page.emit('request', request('/api/v1/demo/session/context', 'PUT'));
    page.emit('pageerror', new Error('PRIVATE_ERROR')); page.emit('domcontentloaded');
  }
  const evidence = await diagnostic.snapshot();
  assert.equal(evidence.network.requests.length, 64); assert.equal(evidence.network.overflow, true);
  assert.equal(evidence.pageErrors, 64); assert.equal(evidence.domContentLoaded, 64);
  assert.deepEqual(evidence.ui, { available: false });
  assert.doesNotMatch(JSON.stringify(evidence), /PRIVATE/);
  diagnostic.dispose(); assert.deepEqual(page.eventNames(), []);
});
