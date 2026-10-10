import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm, access, writeFile } from 'node:fs/promises';
import { once } from 'node:events';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

async function filesUnder(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await filesUnder(file)); else result.push(file);
  }
  return result;
}

async function runCase(kind, args = []) {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'cm-managed-'));
  const outside = await mkdtemp(path.join(os.tmpdir(), 'cm-managed-outside-'));
  const guard = fileURLToPath(new URL('../support/hosted-transport/redaction-guard.mjs', import.meta.url));
  const cli = fileURLToPath(new URL('../../node_modules/playwright/cli.js', import.meta.url));
  const summaryPath = path.join(directory, 'summary.json');
  const marker = path.join(outside, 'executed.txt');
  try {
    const attachment = path.join(outside, 'attachment.txt');
    await writeFile(attachment, 'Synthetic path attachment.');
    const extra = args.map((value) => value === '<outside>' ? outside : value);
    const child = spawn(process.execPath, ['--import', guard, cli, 'test', '--config', 'tests/hosted-transport/canary.config.mjs', ...extra], {
      stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, CM_DEMO_ACCEPTANCE_MODE: 'gate',
        CM_DEMO_ACCEPTANCE_EXPIRES_AT: new Date(Date.now() + 60_000).toISOString(),
        CM_ACCEPTANCE_ARTIFACT_ROOT: directory, CM_ACCEPTANCE_SUMMARY_PATH: summaryPath,
        CM_TRANSPORT_CANARY_CASE: kind, CM_TRANSPORT_ATTACHMENT_PATH: attachment,
        ...(args.length ? { CM_TRANSPORT_EXECUTION_MARKER: marker } : {}) },
    });
    const output = []; child.stdout.on('data', (chunk) => output.push(chunk)); child.stderr.on('data', (chunk) => output.push(chunk));
    const deadline = setTimeout(() => child.kill('SIGKILL'), 60_000); deadline.unref();
    const [status] = await once(child, 'exit');
    clearTimeout(deadline);
    const bytes = Buffer.concat(output);
    for (const token of [process.env.CM_DEMO_CUSTOMER_ACCEPTANCE_TOKEN, process.env.CM_DEMO_PLATFORM_ACCEPTANCE_TOKEN]) {
      assert.equal(bytes.includes(Buffer.from(token)), false);
      for (const file of [...await filesUnder(directory), ...await filesUnder(outside)]) assert.equal((await readFile(file)).includes(Buffer.from(token)), false);
    }
    assert.equal(bytes.length, 0);
    const summary = JSON.parse(await readFile(summaryPath, 'utf8'));
    return { status, summary, files: await filesUnder(directory), markerExists: await access(marker).then(() => true, () => false) };
  } finally { await rm(directory, { recursive: true, force: true }); await rm(outside, { recursive: true, force: true }); }
}

test('real PW runner allows canonical in-memory scenario evidence with no raw diagnostic output', async () => {
  const result = await runCase('positive'); assert.equal(result.status, 0); assert.equal(result.summary.status, 'passed');
  assert.equal(result.files.some((file) => file.endsWith('scenario-chromium-shared-demo.json')), true);
});
test('real PW runner blocks reflected error and arbitrary attachment before persistent artifacts', async () => {
  const result = await runCase('reflection'); assert.notEqual(result.status, 0); assert.equal(result.summary.status, 'failed');
  assert.ok(result.summary.guardBlockedWrites > 0); assert.equal(result.files.some((file) => file.endsWith('error-context.md')), false);
});
test('caught raw artifact writes still make the real PW run fail via cross-process latch', async () => {
  const result = await runCase('caught-write'); assert.notEqual(result.status, 0); assert.equal(result.summary.status, 'failed');
  assert.ok(result.summary.guardBlockedWrites > 0);
});
test('fully resolved unsafe output directory is rejected before any test or token binding', async () => {
  const result = await runCase('positive', ['--output', '<outside>']); assert.notEqual(result.status, 0);
  assert.equal(result.markerExists, false); assert.equal(result.summary.total, 0);
});
test('fully resolved trace override is rejected before any test or token binding', async () => {
  const result = await runCase('positive', ['--trace', 'on']); assert.notEqual(result.status, 0);
  assert.equal(result.markerExists, false); assert.equal(result.summary.total, 0);
});
test('public origin fixture rejects caller credential/deadline/proxy overrides before context creation', async () => {
  const result = await runCase('public-options'); assert.equal(result.status, 0); assert.equal(result.summary.passed, 1);
});
for (const kind of ['binary', 'path']) test(`real PW runner rejects ${kind} attachments before exporting evidence`, async () => {
  const result = await runCase(kind); assert.notEqual(result.status, 0); assert.equal(result.summary.status, 'failed');
  assert.equal(result.files.some((file) => file.includes(`${path.sep}attachments${path.sep}`)), false);
});
if (process.env.CM_TRANSPORT_BROWSERS === '1') {
  for (const name of ['chromium', 'webkit']) test(`${name}: real response/DOM assertion reflection cannot persist the canary`, async () => {
    const result = await runCase(`browser-echo-${name}`);
    assert.notEqual(result.status, 0); assert.equal(result.summary.status, 'failed');
    assert.equal(result.summary.failed, 1); assert.ok(result.summary.guardBlockedWrites > 0);
    assert.equal(result.files.some((file) => file.endsWith('scenario-chromium-shared-demo.json')), true);
    assert.equal(result.files.some((file) => /error-context\.md$|\.(png|webm|zip|har)$/.test(file)), false);
  });
}
