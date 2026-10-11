import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { request as playwrightRequest } from '@playwright/test';
import { createBoundContext } from '../support/origin-context.mjs';
import { getSecretGuardStatus, writeManagedSummary } from '../support/hosted-transport/redaction-guard.mjs';
import { localFixture, ORIGIN, OTHER_ORIGIN, HEADER } from './local-fixture.mjs';

const fixture = await localFixture();
let context;
let passed = false;
let stage = 1;
try {
  context = await createBoundContext(async (options) => {
    const api = await playwrightRequest.newContext(options);
    const result = new EventEmitter();
    Object.assign(result, { request: api, tracing: { start() {}, startChunk() {} }, pages: () => [],
      newPage: async () => ({}), close: async () => { await api.dispose(); result.emit('close'); } });
    return result;
  }, { origin: ORIGIN, token: fixture.token, ignoreHTTPSErrors: false, expiresAt: Date.now() + 30_000 },
  { connectSocket: fixture.connectSocket });
  stage = 2;
  assert.equal((await context.request.get(`${ORIGIN}/api`)).status(), 200);
  assert.equal((await (await context.request.post(`${ORIGIN}/api`, { data: 'one body' })).json()).method, 'POST');
  stage = 3;
  for (const [url, options, message] of [
    [`${OTHER_ORIGIN}/api`, {}, 'CM_ACCEPTANCE_ORIGIN_REJECTED'],
    [`${ORIGIN}/api`, { maxRetries: 1 }, 'CM_ACCEPTANCE_CONFIGURATION_REJECTED'],
    [`${ORIGIN}/api`, { ignoreHTTPSErrors: true }, 'CM_ACCEPTANCE_CONFIGURATION_REJECTED'],
    [`${ORIGIN}/api`, { headers: { [HEADER]: 'override' } }, 'CM_ACCEPTANCE_CONFIGURATION_REJECTED'],
    [`${ORIGIN}/failure`, { failOnStatusCode: true }, 'CM_ACCEPTANCE_REQUEST_FAILED'],
    [`${ORIGIN}/timeout`, { timeout: 100 }, 'CM_ACCEPTANCE_REQUEST_FAILED'],
  ]) await assert.rejects(context.request.get(url, options), { message });
  stage = 4;
  assert.throws(() => context.setExtraHTTPHeaders({}), { message: 'CM_ACCEPTANCE_DIAGNOSTICS_REJECTED' });
  assert.throws(() => context.tracing.start(), { message: 'CM_ACCEPTANCE_DIAGNOSTICS_REJECTED' });
  assert.throws(() => context.request.tracing.start(), { message: 'CM_ACCEPTANCE_DIAGNOSTICS_REJECTED' });
  assert.throws(() => { context.request.fetch = () => {}; }, TypeError);
  passed = true;
} finally {
  await context?.close(); await fixture.close();
  const guard = getSecretGuardStatus();
  writeManagedSummary({ status: passed ? 'passed' : 'failed', total: passed ? 1 : stage, passed: passed ? 1 : 0,
    failed: passed ? 0 : 1, skipped: 0, interrupted: 0, timedOut: 0, guardBlockedWrites: guard.guardBlockedWrites });
  if (!passed) process.exitCode = 1;
}
