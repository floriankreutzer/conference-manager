import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, readdir, rm } from 'node:fs/promises';
import { once } from 'node:events';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

test('actual bound API fixture enforces origin, retry, TLS, header and trace boundaries with safe errors', async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'cm-binding-'));
  const guard = fileURLToPath(new URL('../support/hosted-transport/redaction-guard.mjs', import.meta.url));
  try {
    const child = spawn(process.execPath, ['--import', guard, fileURLToPath(new URL('./fixture-binding-child.mjs', import.meta.url))],
      { env: { ...process.env, CM_DEMO_ACCEPTANCE_MODE: 'gate', CM_ACCEPTANCE_ARTIFACT_ROOT: directory,
        CM_ACCEPTANCE_SUMMARY_PATH: path.join(directory, 'summary.json') }, stdio: ['ignore', 'pipe', 'pipe'] });
    const output = []; child.stdout.on('data', (chunk) => output.push(chunk)); child.stderr.on('data', (chunk) => output.push(chunk));
    const [status] = await once(child, 'exit');
    const summary = JSON.parse(await readFile(path.join(directory, 'summary.json'), 'utf8'));
    assert.equal(status, 0, `CM_BINDING_EXIT_STAGE_${summary.total}`); assert.equal(Buffer.concat(output).length, 0);
    assert.equal(summary.status, 'passed'); assert.equal(summary.guardBlockedWrites, 0);
    for (const file of await readdir(directory)) {
      const bytes = await readFile(path.join(directory, file));
      assert.equal(bytes.includes(Buffer.from(process.env.CM_DEMO_CUSTOMER_ACCEPTANCE_TOKEN)), false);
      assert.equal(bytes.includes(Buffer.from(process.env.CM_DEMO_PLATFORM_ACCEPTANCE_TOKEN)), false);
    }
  } finally { await rm(directory, { recursive: true, force: true }); }
});
