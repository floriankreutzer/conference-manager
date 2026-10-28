import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const root = fileURLToPath(new URL('../', import.meta.url));
const symbol = 'assets/brand/microsoft-sign-in/reference-2026-10-27/ms-symbollockup_mssymbol_19.svg';

test('Microsoft symbol retains its official original bytes in both explicit Platform inventories', async () => {
  const bytes = await readFile(path.join(root, symbol));
  assert.equal(createHash('sha256').update(bytes).digest('hex'), '929f48f88c8ca7f3f5d294be47ec4caf51acc28ac25340c19a903125d7ecd84a');
  for (const profile of ['production', 'demo']) {
    const manifest = JSON.parse(await readFile(path.join(root, `deployment/platform-admin-${profile}.json`), 'utf8'));
    assert.ok(manifest.files.includes(symbol));
    assert.ok(manifest.files.includes('src/core/microsoft-sign-in-control.js'));
  }
});

test('vendor typography is permitted only in the exact Microsoft component rule; global product families remain enforced', async t => {
  const directory = await mkdtemp(path.join(os.tmpdir(), 'cm-ms-branding-'));
  t.after(() => rm(directory, { recursive: true, force: true }));
  await cp(path.join(root, 'assets'), path.join(directory, 'assets'), { recursive: true });
  for (const entry of ['index.html', 'platform-admin/index.html', 'platform-admin-demo/index.html']) {
    await mkdir(path.dirname(path.join(directory, entry)), { recursive: true });
    await cp(path.join(root, entry), path.join(directory, entry));
  }
  const file = path.join(directory, 'assets/styles.css');
  const original = await readFile(file, 'utf8');
  const run = () => spawnSync(process.execPath, [path.join(root, 'scripts/check-design.mjs')], { cwd: directory, encoding: 'utf8' });
  const baseline = run(); assert.equal(baseline.status, 0, baseline.stderr);
  for (const source of [
    `${original}\nbody { font-family: var(--font-family-microsoft-sign-in); }`,
    `${original}\n.microsoft-sign-in-other { font-family: var(--font-family-microsoft-sign-in); }`,
    original.replace('font-family: var(--font-family-microsoft-sign-in)', 'font-family: Arial'),
  ]) {
    await writeFile(file, source); assert.notEqual(run().status, 0);
  }
  await writeFile(file, original);
  await writeFile(path.join(directory, 'assets/vendor-copy.css'), '.microsoft-sign-in { font-family: var(--font-family-microsoft-sign-in); }');
  assert.notEqual(run().status, 0);
});
