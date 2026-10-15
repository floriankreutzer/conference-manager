import assert from 'node:assert/strict';
import { mkdtempSync, writeFileSync, chmodSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { createDastMetadataFetch, DAST_OPERATIONS_ORIGIN as origin } from '../scripts/support/dast-operations-auth.mjs';
import { verifyHostedDemoDeployment } from '../scripts/verify-hosted-demo-deployment.mjs';

const password = 'A'.repeat(43);
const env = { DAST_OPERATIONS_PASSWORD: password, DAST_OPERATIONS_REQUIRED: '1' };
const metadataUrl = `${origin}/assets/hosted-demo-deployment.json`;
const authorization = `Basic ${Buffer.from(`ops:${password}`).toString('base64')}`;

test('DAST metadata authentication is limited to the exact Operations metadata GET', async () => {
  const calls = [];
  const fetchImpl = async (...args) => { calls.push(args); return new Response('{}'); };
  const request = createDastMetadataFetch({ origin, fetchImpl, env });
  await request(metadataUrl, { redirect: 'error', headers: { Accept: 'application/json' } });
  assert.equal(calls[0][1].headers.get('Authorization'), authorization);
  for (const url of [
    `${origin}.evil.test/assets/hosted-demo-deployment.json`,
    metadataUrl.replace('https:', 'http:'),
    metadataUrl.replace('https://', 'https://user@'),
    `${origin}/`, `${metadataUrl}?secret=x`, `${metadataUrl}#fragment`,
    metadataUrl.replace('.com/', '.com:8443/'),
  ]) {
    await assert.rejects(request(url, { redirect: 'error' }), /REQUEST_REJECTED/);
  }
  for (const options of [
    {}, { redirect: 'follow' }, { redirect: 'error', method: 'POST' },
    { redirect: 'error', headers: { Authorization: 'other' } },
    { redirect: 'error', headers: { Host: 'evil.test' } },
  ]) await assert.rejects(request(metadataUrl, options), /REQUEST_REJECTED/);
  assert.equal(calls.length, 1);
  assert.equal(createDastMetadataFetch({ origin, fetchImpl, env: {} }), fetchImpl);
  assert.equal(createDastMetadataFetch({ origin: 'https://conference-manager-demo.onrender.com', fetchImpl, env }), fetchImpl);
  for (const value of ['', 'short', `${password}\n`]) {
    assert.throws(() => createDastMetadataFetch({ origin, fetchImpl, env: { ...env, DAST_OPERATIONS_PASSWORD: value } }), /CREDENTIAL_INVALID/);
  }
});

test('authenticated deployment verification retains exact identity assertions on both services', async () => {
  const calls = [];
  const args = {
    expectedRuntimeRef: 'a'.repeat(40), expectedFrontendRef: 'b'.repeat(40), env,
    fetchImpl: async (url, options) => {
      calls.push({ url, options });
      return Response.json({
        schemaVersion: 1, provider: 'render', repository: 'floriankreutzer/conference-manager-api', branch: 'main',
        serviceName: url.startsWith(origin) ? 'conference-manager-ops-demo' : 'conference-manager-demo',
        runtimeRef: 'a'.repeat(40), frontendRef: 'b'.repeat(40),
      });
    },
  };
  assert.equal((await verifyHostedDemoDeployment(args)).length, 2);
  assert.equal(new Headers(calls[0].options.headers).has('Authorization'), false);
  assert.equal(new Headers(calls[1].options.headers).get('Authorization'), authorization);
  await assert.rejects(verifyHostedDemoDeployment({ ...args, expectedFrontendRef: 'c'.repeat(40) }), /IDENTITY_MISMATCH/);
  const request = createDastMetadataFetch({ origin, env, fetchImpl: async () => { throw new Error(authorization); } });
  await assert.rejects(request(metadataUrl, { redirect: 'error' }), (error) => {
    assert.equal(error.message, 'DAST_OPERATIONS_REQUEST_FAILED');
    assert.equal(error.cause, undefined);
    return true;
  });
});

test('ZAP runner scopes the header and contains raw scanner output without altering the plan', () => {
  const directory = mkdtempSync(join(tmpdir(), 'dast-runner-'));
  try {
    const capture = join(directory, 'args.json');
    const stub = join(directory, 'zap.sh');
    // Exit at addon installation, avoiding a dependency on the container mount.
    writeFileSync(stub, '#!/usr/bin/env node\nrequire("fs").writeFileSync(process.env.CAPTURE, JSON.stringify({ args: process.argv.slice(2), inherited: process.env.DAST_OPERATIONS_PASSWORD })); console.log(process.env.CANARY); console.error(process.env.CANARY); process.exit(1);\n');
    chmodSync(stub, 0o755);
    const run = (target, credential = password) => spawnSync('bash', [resolve('scripts/run-zap-baseline.sh')], {
      encoding: 'utf8', env: { ...process.env, PATH: `${directory}:${process.env.PATH}`, CAPTURE: capture,
        CANARY: authorization, ZAP_TARGET: target, DAST_OPERATIONS_PASSWORD: credential },
    });
    const result = run(`${origin}/`);
    assert.equal(result.status, 1);
    assert.doesNotMatch(result.stdout + result.stderr, new RegExp(password));
    assert.doesNotMatch(result.stdout + result.stderr, new RegExp(Buffer.from(`ops:${password}`).toString('base64')));
    assert.equal(JSON.parse(readFileSync(capture, 'utf8')).inherited, undefined);
    assert.match(run('https://evil.test/').stderr, /TARGET_REJECTED/);
    assert.match(run(`${origin}/`, '').stderr, /CREDENTIAL_INVALID/);
    const runner = readFileSync('scripts/run-zap-baseline.sh', 'utf8');
    const pattern = runner.match(/replacer[.]full_list\(0\)[.]url=([^']+)/)[1];
    assert.ok(new RegExp(pattern).test(metadataUrl));
    for (const url of [`${origin}.evil.test/`, 'https://evil.test/', metadataUrl.replace('https:', 'http:')]) {
      assert.equal(new RegExp(pattern).test(url), false);
    }
    assert.match(runner, /matchtype=REQ_HEADER/);
    assert.match(runner, /matchstr=Authorization/);
    assert.doesNotMatch(runner, /ZAP_AUTH_HEADER_SITE|set -x/);
  } finally { rmSync(directory, { recursive: true, force: true }); }
});
