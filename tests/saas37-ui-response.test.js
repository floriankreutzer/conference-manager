import assert from 'node:assert/strict';
import test from 'node:test';
import { applyContextThroughUi, uiResponse } from './e2e-saas37/scenario-support.js';

function response(status = 200, contentType = 'application/json') {
  return {
    request: () => ({ method: () => 'POST' }),
    url: () => 'https://customer.demo.test:4443/api/v1/application/room-availability',
    status: () => status,
    headers: () => ({ 'content-type': contentType }),
    json: async () => { throw new Error('retired browser body is not readable'); },
  };
}

const pageFor = (result) => ({ waitForResponse: async (predicate) => {
  assert.equal(predicate(result), true);
  return result;
} });

test('UI response verification does not read retired browser payloads', async () => {
  const result = response();
  assert.equal(await uiResponse(pageFor(result), 'POST', '/api/v1/application/room-availability',
    async () => {}), result);
});

test('status and JSON content type remain mandatory for the real UI response', async () => {
  for (const result of [response(403), response(429), response(500), response(200, 'text/html')]) {
    await assert.rejects(uiResponse(pageFor(result), 'POST', '/api/v1/application/room-availability',
      async () => {}));
  }
});

test('UI action failure stays attached to the same awaited response operation', async () => {
  await assert.rejects(uiResponse(pageFor(response()), 'POST', '/api/v1/application/room-availability',
    async () => { throw new Error('visible UI action failed'); }), /visible UI action failed/);
});

function contextSwitchPage({ actionError = null, trialError = null, switchStatus = 200, bootstrapStatus = 200 } = {}) {
  const calls = [];
  return {
    calls,
    locator(selector) {
      assert.equal(selector, '[data-demo-security] button');
      return { async click(options) {
        calls.push(options?.trial ? 'trial' : 'click');
        if (options?.trial && trialError) throw trialError;
        if (!options?.trial && actionError) throw actionError;
      } };
    },
    async waitForResponse(predicate) {
      const candidates = [
        { method: 'PUT', path: '/api/v1/demo/session/context', status: switchStatus },
        { method: 'GET', path: '/api/v1/demo/session', status: bootstrapStatus },
      ].map((candidate) => ({
        request: () => ({ method: () => candidate.method }),
        url: () => `https://customer.demo.test:4443${candidate.path}`,
        status: () => candidate.status,
      }));
      const result = candidates.find(predicate);
      assert.ok(result);
      calls.push(result.request().method());
      return result;
    },
    async waitForEvent(event) { assert.equal(event, 'domcontentloaded'); calls.push(event); },
  };
}

test('context switch establishes actionability then awaits click, both responses and reload together', async () => {
  const page = contextSwitchPage();
  await applyContextThroughUi(page);
  assert.deepEqual(page.calls, ['trial', 'PUT', 'GET', 'domcontentloaded', 'click']);
});

test('context switch preserves action failures and does not start response waits for an obstructed control', async () => {
  const blocked = contextSwitchPage({ trialError: new Error('control obstructed') });
  await assert.rejects(applyContextThroughUi(blocked), /control obstructed/);
  assert.deepEqual(blocked.calls, ['trial']);
  await assert.rejects(applyContextThroughUi(contextSwitchPage({ actionError: new Error('click failed') })), /click failed/);
});

test('context switch still rejects denied, throttled and failed switch or bootstrap responses', async () => {
  for (const status of [401, 403, 429, 500]) {
    await assert.rejects(applyContextThroughUi(contextSwitchPage({ switchStatus: status })));
    await assert.rejects(applyContextThroughUi(contextSwitchPage({ bootstrapStatus: status })));
  }
});
