import { createHash, randomUUID } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { lstat, mkdir, readFile, realpath, rename, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// This is the entire cross-repository test contract. Never copy application
// sources, configuration or a discovered/globbed support tree into the served ref.
export const SHARED_ACCEPTANCE_FILES = Object.freeze([
  'tests/e2e-shared/shared-demo-runtime.spec.js',
  'tests/support/demo-origins.js',
  'tests/support/origin-context.mjs',
  'tests/support/hosted-transport/acceptance-config.mjs',
  'tests/support/hosted-transport/tls-egress-proxy.mjs',
  'tests/support/hosted-transport/redaction-guard.mjs',
]);

function fail() { throw new Error('SHARED_ACCEPTANCE_SOURCE_REJECTED'); }

function git(root, ...args) {
  return execFileSync('git', ['-C', root, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

async function rejectSymlinks(root, relative, allowMissing = false) {
  let current = root;
  for (const component of relative.split('/')) {
    current = path.join(current, component);
    let stat;
    try { stat = await lstat(current); }
    catch (error) { if (allowMissing && error.code === 'ENOENT') return; throw error; }
    if (stat.isSymbolicLink()) fail();
  }
}

export async function copySharedAcceptance({ source, target, ref }) {
  if (!/^[a-f0-9]{40}$/.test(ref || '')) fail();
  const sourceRoot = await realpath(source);
  const targetRoot = await realpath(target);
  if (sourceRoot === targetRoot || git(sourceRoot, 'rev-parse', 'HEAD') !== ref) fail();
  const files = [];
  // Read and verify every source before writing anything. A dirty checkout or
  // symbolic link must never silently substitute the reviewed immutable blob.
  for (const name of SHARED_ACCEPTANCE_FILES) {
    await rejectSymlinks(sourceRoot, name);
    await rejectSymlinks(targetRoot, name, true);
    const treeEntry = git(sourceRoot, 'ls-tree', ref, '--', name);
    if (!treeEntry.startsWith('100644 blob ')) fail();
    const bytes = await readFile(path.join(sourceRoot, name));
    const blob = createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex');
    if (blob !== git(sourceRoot, 'rev-parse', `${ref}:${name}`)) fail();
    files.push({ name, bytes, sha256: createHash('sha256').update(bytes).digest('hex') });
  }
  for (const { name, bytes } of files) {
    const destination = path.join(targetRoot, name);
    await mkdir(path.dirname(destination), { recursive: true });
    await rejectSymlinks(targetRoot, name, true);
    const temporary = `${destination}.${randomUUID()}.tmp`;
    try {
      await writeFile(temporary, bytes, { flag: 'wx', mode: 0o644 });
      await rename(temporary, destination);
    } finally { await rm(temporary, { force: true }); }
  }
  return { ref, files: files.map(({ name, sha256 }) => ({ path: name, sha256 })) };
}

function cliOptions(args) {
  if (args.length !== 6) fail();
  const options = {};
  for (let index = 0; index < args.length; index += 2) {
    const key = args[index];
    if (!['--source', '--target', '--ref'].includes(key) || options[key.slice(2)] !== undefined) fail();
    options[key.slice(2)] = args[index + 1];
  }
  return options;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const evidence = await copySharedAcceptance(cliOptions(process.argv.slice(2)));
    process.stdout.write(`${JSON.stringify(evidence)}\n`);
  } catch {
    process.stderr.write('SHARED_ACCEPTANCE_SOURCE_REJECTED\n');
    process.exitCode = 1;
  }
}
