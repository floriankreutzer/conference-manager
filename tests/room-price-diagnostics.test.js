import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import test from 'node:test';
import { MANAGER_SETTINGS_MESSAGES } from '../src/core/i18n-manager-settings-messages.js';
import { localSharedDemoDiagnosticsEnabled } from './support/local-demo-network-diagnostics.js';
import { observeLocalRoomPrice, withLocalRoomPriceDiagnostics } from './support/room-price-diagnostics.js';

function fixture({ retired = false } = {}) {
  const page = new EventEmitter();
  const listeners = new Map();
  const observers = [];
  const forbidden = () => { throw new Error('PRIVATE_MATERIAL_MUST_NOT_BE_READ'); };
  const element = () => ({ isConnected: true, disabled: false, validity: { valid: true },
    getBoundingClientRect: () => ({ x: 10.3, y: 20.8, width: 140, height: 44 }),
    contains(target) { return target === this; },
    get value() { return forbidden(); }, get id() { return forbidden(); },
    get src() { return forbidden(); }, get outerHTML() { return forbidden(); },
    focus: forbidden, click: forbidden, reportValidity: forbidden, scrollIntoView: forbidden });
  const button = element(); const amount = element(); const currency = element();
  const image = Object.assign(element(), { tagName: 'IMG', complete: false, naturalWidth: 0 });
  const form = { getAttribute: () => null };
  const toast = { textContent: 'PRIVATE_TOAST_CONTENT' };
  const room = { closest: () => form, contains: (node) => [button, amount, currency, image].includes(node),
    querySelector: (selector) => ({ '[data-manager-room-price] button': button,
      'input[id^="manager-room-price-amount-"]': amount, 'select[id^="manager-room-price-currency-"]': currency })[selector],
    querySelectorAll: () => [image] };
  const root = {
    querySelector: (selector) => selector === '#toast' ? toast : selector === '[data-manager-room-id="contoso-paris-room-2"]' ? room : null,
    ownerDocument: {
      location: { origin: 'https://customer.demo.test:4443' },
      addEventListener: (event, listener, options) => {
        assert.deepEqual(options, { capture: true, passive: true }); listeners.set(event, listener);
      },
      removeEventListener: (event, listener, capture) => { assert.equal(capture, true); assert.equal(listeners.get(event), listener); listeners.delete(event); },
      defaultView: { scrollX: 0, scrollY: 410, performance: { now: () => 100 },
        getComputedStyle: () => ({ scrollBehavior: 'smooth' }),
        MutationObserver: class {
          constructor(callback) { this.callback = callback; observers.push(this); }
          observe() {}
          disconnect() { this.disconnected = true; }
        } },
    },
  };
  page.locator = (selector) => {
    assert.equal(selector, 'html');
    return { async evaluate(callback, data, options) {
      assert.equal(options.timeout, 1_000);
      if (retired) throw new Error('PRIVATE_RETIRED_DOCUMENT');
      return structuredClone(callback(root, data));
    } };
  };
  const emit = (type, target, extras = {}) => listeners.get(type)?.({ type, target, ...extras });
  return { page, button, amount, currency, image, toast, emit, observers, listeners, root };
}

function request(path, method = 'PUT', origin = 'https://customer.demo.test:4443') {
  const forbidden = () => { throw new Error('PRIVATE_MATERIAL_MUST_NOT_BE_READ'); };
  return { url: () => `${origin}${path}`, method: () => method, headers: forbidden, postData: forbidden, failure: forbidden };
}

test('room-price diagnostics stay closed outside the exact local ungated browser scope', async () => {
  for (const change of [{ hosted: true }, { gated: true }, { customerOrigin: 'https://private.example' },
    { projectName: 'webkit' }, { hosted: undefined }]) {
    const enabled = localSharedDemoDiagnosticsEnabled({ projectName: 'webkit-shared-demo',
      customerOrigin: 'https://customer.demo.test:4443', hosted: false, gated: false, ...change });
    assert.equal(enabled, false);
    const page = new EventEmitter(); page.locator = () => assert.fail('disabled DOM observation');
    assert.equal(await observeLocalRoomPrice(page, enabled), null);
    assert.deepEqual(page.eventNames(), []);
  }
});

test('room-price evidence separates actual pointer targets, validity, image geometry and fixed message phases', async () => {
  const f = fixture(); const diagnostic = await observeLocalRoomPrice(f.page, true);
  f.emit('pointerdown', f.button, { clientX: 40.2, clientY: 50.1 });
  f.image.complete = true; f.image.naturalWidth = 32;
  f.image.getBoundingClientRect = () => ({ x: 10, y: 100, width: 480, height: 320 });
  f.emit('load', f.image);
  f.emit('pointerup', f.amount, { clientX: 40, clientY: 50 });
  f.amount.validity = { valid: false, stepMismatch: true };
  f.emit('invalid', f.amount);
  f.toast.textContent = MANAGER_SETTINGS_MESSAGES.en['managerSettings.error'];
  f.observers[0].callback();
  const evidence = await diagnostic.snapshot();
  assert.deepEqual(evidence.ui.records.map(({ event, target }) => [event, target]),
    [['start', 'none'], ['pointerdown', 'price-button'], ['load', 'room-image'], ['pointerup', 'amount'], ['invalid', 'amount'], ['phase', 'none']]);
  assert.equal(evidence.ui.current.amountValidity.valid, false);
  assert.equal(evidence.ui.current.amountValidity.stepMismatch, true);
  assert.equal(evidence.ui.current.phase, 'error');
  assert.deepEqual(evidence.ui.current.images, [{ loaded: true, box: { x: 10, y: 100, width: 480, height: 320 } }]);
  assert.equal(evidence.ui.current.scroll.smooth, true);
  assert.doesNotMatch(JSON.stringify(evidence), /PRIVATE|https|cookie|header|Business settings/);
  await diagnostic.dispose(); assert.equal(f.listeners.size, 0);
  assert.equal(f.observers[0].disconnected, true); assert.deepEqual(f.page.eventNames(), []);
});

test('only exact local catalogue PUT status and terminal class enter bounded network evidence', async () => {
  const f = fixture(); const diagnostic = await observeLocalRoomPrice(f.page, true);
  const accepted = request('/api/v1/tenant/settings/catalogue?private=PRIVATE_QUERY');
  const failed = request('/api/v1/tenant/settings/catalogue');
  f.page.emit('request', accepted); f.page.emit('request', failed);
  f.page.emit('response', { request: () => accepted, status: () => 409, body: () => assert.fail('no body') });
  f.page.emit('requestfinished', accepted); f.page.emit('requestfailed', failed);
  for (const denied of [request('/api/v1/tenant/settings/catalogue', 'GET'), request('/api/v1/demo/session/context'),
    request('/api/v1/tenant/settings/catalogue/PRIVATE'), request('/api/v1/tenant/settings/catalogue', 'PUT', 'https://private.example'),
    request('/api/v1/tenant/settings/catalogue', 'PUT', 'https://user:secret@customer.demo.test:4443')]) f.page.emit('request', denied);
  const evidence = await diagnostic.snapshot();
  assert.deepEqual(evidence.network.requests.map(({ method, status, outcome }) => ({ method, status, outcome })),
    [{ method: 'PUT', status: 409, outcome: 'finished' }, { method: 'PUT', status: null, outcome: 'failed' }]);
  assert.doesNotMatch(JSON.stringify(evidence), /PRIVATE|private|https|cookie|header|secret/);
  await diagnostic.dispose();
});

test('room-price diagnostics cap events and geometry and retain evidence after document retirement', async () => {
  const f = fixture(); const diagnostic = await observeLocalRoomPrice(f.page, true);
  f.button.getBoundingClientRect = () => ({ x: Infinity, y: -1e9, width: 1e9, height: NaN });
  for (let index = 0; index < 70; index++) {
    f.emit('click', f.button); f.page.emit('pageerror', new Error('PRIVATE_ERROR'));
    f.page.emit('request', request('/api/v1/tenant/settings/catalogue'));
  }
  const evidence = await diagnostic.snapshot();
  assert.equal(evidence.ui.records.length, 32); assert.equal(evidence.ui.overflow, true);
  assert.deepEqual(evidence.ui.current.button, { x: null, y: -100000, width: 100000, height: null });
  assert.equal(evidence.network.requests.length, 64); assert.equal(evidence.network.overflow, true);
  assert.equal(evidence.pageErrors, 64); await diagnostic.dispose();
  const retired = fixture({ retired: true }); const closed = await observeLocalRoomPrice(retired.page, true);
  retired.page.emit('request', request('/api/v1/tenant/settings/catalogue'));
  assert.deepEqual((await closed.snapshot()).ui, { available: false });
  assert.equal((await closed.snapshot()).network.requests.length, 1); await closed.dispose();
});

test('the actual document origin is checked and detached geometry cannot interrupt native events', async () => {
  const foreign = fixture(); foreign.root.ownerDocument.location.origin = 'https://private.example';
  const unavailable = await observeLocalRoomPrice(foreign.page, true);
  assert.deepEqual((await unavailable.snapshot()).ui, { available: false });
  assert.equal(foreign.listeners.size, 0); await unavailable.dispose();
  const f = fixture(); const diagnostic = await observeLocalRoomPrice(f.page, true);
  f.button.getBoundingClientRect = () => { throw new Error('retired geometry'); };
  assert.doesNotThrow(() => f.emit('click', f.button));
  assert.doesNotThrow(() => f.observers[0].callback());
  await diagnostic.dispose(); assert.equal(f.listeners.size, 0);
});

test('observation and attachment failures preserve the exact original action result without retries', async () => {
  const original = new Error('ORIGINAL_ACTION_FAILURE');
  for (const retired of [false, true]) {
    const f = fixture({ retired }); let actions = 0;
    await assert.rejects(withLocalRoomPriceDiagnostics(f.page, true, async () => { actions++; throw original; },
      async () => { throw new Error('attachment failed'); }), (error) => error === original);
    assert.equal(actions, 1); assert.deepEqual(f.page.eventNames(), []);
  }
  const f = fixture(); let attachments = 0;
  assert.equal(await withLocalRoomPriceDiagnostics(f.page, true, async () => 'unchanged', async () => attachments++), 'unchanged');
  assert.equal(attachments, 0); assert.equal(f.listeners.size, 0);
});
