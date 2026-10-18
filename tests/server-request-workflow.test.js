import assert from 'node:assert/strict';
import test from 'node:test';
import { createServerRequestWorkflow } from '../src/employee/server-request-workflow.js';
import { createProductionPersistence } from '../src/platform/production-persistence.js';

const KEY = '11111111-1111-4111-8111-111111111111';
const ID = '22222222-2222-4222-8222-222222222222';
const NOW = '2026-10-18T09:00:00.000Z';
const STARTED = { id: ID, status: 'started', startedAt: NOW, endedAt: null };

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

test('first edits coalesce and reserve the idempotency key before transport; navigation is not an event', async () => {
  const pending = deferred();
  const calls = [];
  let stored = null;
  const draftStore = { loadWorkflow: () => stored,
    saveWorkflow(value) { stored = value; calls.push(['store', value]); } };
  const persistence = { startRequestWorkflow(key) { calls.push(['start', key]); return pending.promise; },
    async abandonRequestWorkflow(id) { calls.push(['abandon', id]); } };
  const workflow = createServerRequestWorkflow({ persistence, draftStore, idFactory: () => KEY });
  assert.equal(calls.length, 0);
  const first = workflow.ensureStarted();
  const repeated = workflow.ensureStarted();
  assert.equal(first, repeated);
  assert.deepEqual(calls.slice(0, 2), [['store', { idempotencyKey: KEY, workflowId: null }], ['start', KEY]]);
  pending.resolve(STARTED);
  assert.equal(await first, ID);
  assert.equal(await repeated, ID);
  const restored = createServerRequestWorkflow({ persistence, draftStore,
    idFactory: () => { throw new Error('MUST_REUSE_REFERENCE'); } });
  assert.equal(await restored.ensureStarted(), ID);
  assert.equal(calls.filter(([kind]) => kind === 'start').length, 1);
  assert.equal(calls.filter(([kind]) => kind === 'abandon').length, 0);
});

test('an uncertain start retries the same key and explicit abandon waits for its server identity once', async () => {
  let attempt = 0;
  const starts = [];
  const abandoned = [];
  const persistence = {
    async startRequestWorkflow(key) { starts.push(key); if (attempt++ === 0) throw new Error('OFFLINE'); return STARTED; },
    async abandonRequestWorkflow(id) { abandoned.push(id); },
  };
  const workflow = createServerRequestWorkflow({ persistence, idFactory: () => KEY });
  await assert.rejects(workflow.ensureStarted(), /OFFLINE/);
  await Promise.all([workflow.abandon(), workflow.abandon()]);
  assert.deepEqual(starts, [KEY, KEY]);
  assert.deepEqual(abandoned, [ID]);
  await workflow.abandon();
  assert.deepEqual(abandoned, [ID]);
  await assert.rejects(workflow.ensureStarted(), /CLOSED/);
});

test('discarding an untouched form and successful submission create no abandonment', async () => {
  const calls = [];
  const persistence = { async startRequestWorkflow() { calls.push('start'); return STARTED; },
    async abandonRequestWorkflow() { calls.push('abandon'); } };
  const untouched = createServerRequestWorkflow({ persistence, idFactory: () => KEY });
  await untouched.abandon();
  assert.deepEqual(calls, []);
  const submitted = createServerRequestWorkflow({ persistence, idFactory: () => KEY });
  await submitted.ensureStarted();
  submitted.finish();
  await submitted.abandon();
  assert.deepEqual(calls, ['start']);
});

test('discard reconciles a lost submission response without changing the submitted server workflow', async () => {
  const calls = [];
  let state = STARTED;
  const conflict = new Error('PRODUCTION_PERSISTENCE_UNAVAILABLE', {
    cause: { code: 'HTTP_409', serverCode: 'REQUEST_STATE_CONFLICT' },
  });
  const persistence = {
    async startRequestWorkflow(key) { calls.push(['start', key]); return state; },
    async abandonRequestWorkflow(id) { calls.push(['abandon', id]); throw conflict; },
  };
  const workflow = createServerRequestWorkflow({ persistence, idFactory: () => KEY });
  await workflow.ensureStarted();
  state = { ...STARTED, status: 'submitted', endedAt: NOW };
  await workflow.abandon();
  assert.deepEqual(calls, [['start', KEY], ['abandon', ID], ['start', KEY]]);
  await workflow.abandon();
  assert.equal(calls.length, 3);
  await assert.rejects(workflow.ensureStarted(), /CLOSED/);
});

test('discard recovery requires the exact server ID and submitted state; authority failures do not retry', async () => {
  for (const current of [STARTED, { ...STARTED, id: KEY, status: 'submitted', endedAt: NOW }]) {
    let starts = 0;
    const conflict = new Error('PRODUCTION_PERSISTENCE_UNAVAILABLE', {
      cause: { code: 'HTTP_409', serverCode: 'REQUEST_STATE_CONFLICT' },
    });
    const persistence = {
      async startRequestWorkflow() { starts += 1; return starts === 1 ? STARTED : current; },
      async abandonRequestWorkflow() { throw conflict; },
    };
    const workflow = createServerRequestWorkflow({ persistence, idFactory: () => KEY });
    await workflow.ensureStarted();
    await assert.rejects(workflow.abandon(), (error) => error === conflict);
    assert.equal(starts, 2);
  }
  let starts = 0;
  const denied = new Error('PRODUCTION_PERSISTENCE_UNAVAILABLE', { cause: { code: 'HTTP_403' } });
  const persistence = {
    async startRequestWorkflow() { starts += 1; return STARTED; },
    async abandonRequestWorkflow() { throw denied; },
  };
  const workflow = createServerRequestWorkflow({ persistence, idFactory: () => KEY });
  await workflow.ensureStarted();
  await assert.rejects(workflow.abandon(), (error) => error === denied);
  assert.equal(starts, 1);
});

test('workflow transport sends no browser clock or scope and binds abandonment responses to the requested ID', async () => {
  const calls = [];
  const persistence = createProductionPersistence({ apiClient: { async request(path, options) {
    calls.push({ path, options });
    return { schemaVersion: 1, requestId: KEY,
      workflow: path.endsWith('/abandon') ? { ...STARTED, status: 'abandoned', endedAt: NOW } : STARTED };
  } } });
  assert.deepEqual(await persistence.startRequestWorkflow(KEY), STARTED);
  await persistence.abandonRequestWorkflow(ID);
  assert.deepEqual(calls, [
    { path: 'v1/application/request-workflows', options: { method: 'POST', body: {}, idempotencyKey: KEY } },
    { path: `v1/application/request-workflows/${ID}/abandon`, options: { method: 'POST', body: {} } },
  ]);
});

test('workflow transport rejects expanded, inconsistent, foreign and malformed server responses', async () => {
  for (const workflow of [
    { ...STARTED, tenantId: KEY }, { ...STARTED, status: 'expired' },
    { ...STARTED, endedAt: NOW }, { ...STARTED, startedAt: 'yesterday' },
    { ...STARTED, id: '../foreign' },
    { ...STARTED, status: 'abandoned', endedAt: '2026-10-17T09:00:00.000Z' },
  ]) {
    const persistence = createProductionPersistence({ apiClient: { async request() {
      return { schemaVersion: 1, requestId: KEY, workflow };
    } } });
    await assert.rejects(persistence.startRequestWorkflow(KEY), /PRODUCTION_REQUEST_WORKFLOW_INVALID/);
  }
  const foreign = createProductionPersistence({ apiClient: { async request() {
    return { schemaVersion: 1, requestId: KEY, workflow: { ...STARTED, id: KEY, status: 'abandoned', endedAt: NOW } };
  } } });
  await assert.rejects(foreign.abandonRequestWorkflow(ID), /PRODUCTION_REQUEST_WORKFLOW_INVALID/);
  await assert.rejects(foreign.startRequestWorkflow('../not-an-id'), /PRODUCTION_REQUEST_WORKFLOW_INVALID/);
});
