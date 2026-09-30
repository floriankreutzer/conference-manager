import assert from 'node:assert/strict';
import test from 'node:test';
import { uiResponse } from './e2e-saas37/scenario-support.js';

const response = (read) => ({
  request: () => ({ method: () => 'POST' }),
  url: () => 'https://customer.demo.test:4443/api/v1/application/room-availability',
  status: () => 200,
  headers: () => ({ 'content-type': 'application/json' }),
  json: read,
});

test('UI response bodies are consumed before the triggering action finishes', async () => {
  let bodyRead = false;
  const result = response(async () => { bodyRead = true; return { available: true }; });
  const page = { waitForResponse: async (predicate) => {
    assert.equal(predicate(result), true);
    return result;
  } };
  const body = await uiResponse(page, 'POST', '/api/v1/application/room-availability', async () => {
    await Promise.resolve();
    await Promise.resolve();
    assert.equal(bodyRead, true, 'the action can retire its browser response resource');
  });
  assert.deepEqual(body, { available: true });
});

test('UI action failure stays attached to the same awaited response operation', async () => {
  const page = { waitForResponse: async () => response(async () => ({ available: true })) };
  await assert.rejects(uiResponse(page, 'POST', '/api/v1/application/room-availability',
    async () => { throw new Error('visible UI action failed'); }), /visible UI action failed/);
});
