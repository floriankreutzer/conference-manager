import assert from 'node:assert/strict';
import test from 'node:test';
import { uiResponse } from './e2e-saas37/scenario-support.js';

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
