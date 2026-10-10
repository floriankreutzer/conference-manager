import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtemp, mkdir, readFile, rm, symlink, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { copySharedAcceptance, SHARED_ACCEPTANCE_FILES } from '../scripts/copy-shared-acceptance.mjs';
import { buildModuleGraph, findModuleCycles } from '../scripts/module-graph.mjs';

async function fixture(t) {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cm-acceptance-copy-'));
  t.after(() => rm(root, { recursive: true, force: true }));
  const source = path.join(root, 'source');
  const target = path.join(root, 'target');
  await mkdir(source); await mkdir(target);
  for (const name of [...SHARED_ACCEPTANCE_FILES, 'src/app.js']) {
    await mkdir(path.dirname(path.join(source, name)), { recursive: true });
    await writeFile(path.join(source, name), `// ${name}\n`);
  }
  const git = (...args) => execFileSync('git', ['-C', source, ...args],
    { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
  git('init', '--quiet'); git('add', '.');
  git('-c', 'user.name=Fixture', '-c', 'user.email=fixture@example.invalid', 'commit', '--quiet', '-m', 'Fixture');
  return { source, target, ref: git('rev-parse', 'HEAD'), root };
}

test('immutable acceptance copies only the explicit test contract and reports exact content hashes', async (t) => {
  const options = await fixture(t);
  await mkdir(path.join(options.target, 'src'));
  await writeFile(path.join(options.target, 'src/app.js'), '// served application remains authoritative\n');
  const evidence = await copySharedAcceptance(options);
  assert.equal(evidence.ref, options.ref);
  assert.deepEqual(evidence.files.map(({ path: name }) => name), SHARED_ACCEPTANCE_FILES);
  for (const { path: name, sha256 } of evidence.files) {
    assert.match(sha256, /^[a-f0-9]{64}$/);
    assert.equal(await readFile(path.join(options.target, name), 'utf8'), `// ${name}\n`);
  }
  assert.equal(await readFile(path.join(options.target, 'src/app.js'), 'utf8'),
    '// served application remains authoritative\n');
  assert.deepEqual(await copySharedAcceptance(options), evidence);
});

test('wrong ref and dirty source reject before any destination writes', async (t) => {
  const options = await fixture(t);
  for (const ref of ['main', '0'.repeat(40), '../HEAD']) {
    await assert.rejects(copySharedAcceptance({ ...options, ref }), /SHARED_ACCEPTANCE_SOURCE_REJECTED/);
  }
  await writeFile(path.join(options.source, SHARED_ACCEPTANCE_FILES.at(-1)), '// changed after review\n');
  await assert.rejects(copySharedAcceptance(options), /SHARED_ACCEPTANCE_SOURCE_REJECTED/);
  await assert.rejects(readFile(path.join(options.target, SHARED_ACCEPTANCE_FILES[0])), { code: 'ENOENT' });
});

test('source and destination symlinks cannot redirect the fixed copy boundary', async (t) => {
  const sourceCase = await fixture(t);
  const sourceFile = path.join(sourceCase.source, SHARED_ACCEPTANCE_FILES[0]);
  const external = path.join(sourceCase.root, 'external');
  await writeFile(external, '// outside\n');
  await rm(sourceFile); await symlink(external, sourceFile);
  await assert.rejects(copySharedAcceptance(sourceCase), /SHARED_ACCEPTANCE_SOURCE_REJECTED/);
  const targetCase = await fixture(t);
  const outside = path.join(targetCase.root, 'outside');
  await mkdir(outside); await symlink(outside, path.join(targetCase.target, 'tests'));
  await assert.rejects(copySharedAcceptance(targetCase), /SHARED_ACCEPTANCE_SOURCE_REJECTED/);
  await assert.rejects(readFile(path.join(outside, 'e2e-shared/shared-demo-runtime.spec.js')), { code: 'ENOENT' });
});

test('the immutable Shared copy contract closes the actual test module graph without served application dependencies', async () => {
  const sources = new Map(await Promise.all(SHARED_ACCEPTANCE_FILES.map(async (name) => [name, await readFile(name, 'utf8')])));
  const { graph, unresolved } = buildModuleGraph(sources);
  assert.deepEqual(unresolved, [], 'Every local transitive fixture import must have an explicit immutable copy entry');
  assert.deepEqual(findModuleCycles(graph), []);
  const reachable = new Set();
  function visit(file) {
    if (reachable.has(file)) return;
    reachable.add(file);
    for (const dependency of graph.get(file)) visit(dependency);
  }
  visit('tests/e2e-shared/shared-demo-runtime.spec.js');
  assert.deepEqual([...reachable].sort(), [...SHARED_ACCEPTANCE_FILES].sort());
  assert.ok([...reachable].every((name) => name.startsWith('tests/')));
});
