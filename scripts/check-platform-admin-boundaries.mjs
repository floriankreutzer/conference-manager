import { existsSync } from 'node:fs';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { buildModuleGraph, isInside } from './module-graph.mjs';
import { platformAdminBoundaryViolations } from './platform-admin-boundary-policy.mjs';

async function sourceFiles(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const current = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await sourceFiles(current));
    else if (entry.name.endsWith('.js')) files.push(current.replaceAll('\\', '/'));
  }
  return files;
}

let failures = 0;
function fail(message) {
  console.error(message);
  failures += 1;
}

const requiredFiles = [
  'platform-admin/index.html',
  'platform-admin-demo/index.html',
  'assets/platform-admin.css',
  'src/platform-admin/index.js',
  'src/platform-admin/contracts.js',
  'src/platform-admin/application.js',
  'src/platform-admin/production/bootstrap.js',
  'src/platform-admin/production/operator-session.js',
  'src/platform-admin/platform-api.js',
  'src/platform-admin/demo/bootstrap.js',
  'src/platform-admin/demo/operator-session.js',
  'deployment/platform-admin-production.json',
  'deployment/platform-admin-demo.json',
];
for (const file of requiredFiles) {
  if (!existsSync(file)) fail(`${file}: required Platform Admin topology file is missing.`);
}

const sources = new Map();
for (const file of await sourceFiles('src')) sources.set(file, await readFile(file, 'utf8'));
for (const item of platformAdminBoundaryViolations(sources)) fail(item);

function reachableModules(graph, entrypoint) {
  const visited = new Set();
  const visit = (file) => {
    if (visited.has(file)) return;
    visited.add(file);
    for (const dependency of graph.get(file) || []) visit(dependency);
  };
  visit(entrypoint);
  return visited;
}

const { graph } = buildModuleGraph(sources);
for (const definition of [
  {
    manifestPath: 'deployment/platform-admin-production.json',
    artifact: 'platform-admin-production',
    htmlEntrypoint: 'platform-admin/index.html',
    moduleEntrypoint: 'src/platform-admin/production/bootstrap.js',
    forbiddenRoots: [
      'platform-admin-demo',
      'src/platform-admin/demo',
    ],
  },
  {
    manifestPath: 'deployment/platform-admin-demo.json',
    artifact: 'platform-admin-demo',
    htmlEntrypoint: 'platform-admin-demo/index.html',
    moduleEntrypoint: 'src/platform-admin/demo/bootstrap.js',
    forbiddenRoots: [
      'platform-admin',
      'src/platform-admin/production',
    ],
  },
]) {
  let manifest;
  try {
    manifest = JSON.parse(await readFile(definition.manifestPath, 'utf8'));
  } catch {
    fail(`${definition.manifestPath}: deployment manifest must be valid JSON.`);
    continue;
  }
  const keys = manifest && typeof manifest === 'object' && !Array.isArray(manifest)
    ? Object.keys(manifest).sort()
    : [];
  if (keys.join(',') !== 'artifact,entrypoint,files,schemaVersion') {
    fail(`${definition.manifestPath}: deployment manifest shape is invalid.`);
    continue;
  }
  if (
    manifest.schemaVersion !== 1
    || manifest.artifact !== definition.artifact
    || manifest.entrypoint !== definition.htmlEntrypoint
    || !Array.isArray(manifest.files)
  ) {
    fail(`${definition.manifestPath}: deployment identity or entrypoint is invalid.`);
    continue;
  }
  const fileSet = new Set(manifest.files);
  if (fileSet.size !== manifest.files.length) {
    fail(`${definition.manifestPath}: deployment files must be unique.`);
  }
  for (const file of manifest.files) {
    if (
      typeof file !== 'string'
      || file.startsWith('/')
      || file.includes('\\')
      || file.split('/').includes('..')
      || !existsSync(file)
    ) {
      fail(`${definition.manifestPath}: invalid or missing deployment file ${String(file)}.`);
      continue;
    }
    if (
      file === 'index.html'
      || ['src/app.js', 'src/employee', 'src/manager', 'src/tenant-admin', 'src/platform']
        .some((root) => isInside(file, root))
      || definition.forbiddenRoots.some((root) => isInside(file, root))
    ) fail(`${definition.manifestPath}: deployment file crosses the artifact boundary: ${file}.`);
  }
  if (!fileSet.has(definition.htmlEntrypoint)) {
    fail(`${definition.manifestPath}: HTML entrypoint is missing from the deployment files.`);
  }
  const requiredModules = reachableModules(graph, definition.moduleEntrypoint);
  for (const module of requiredModules) {
    if (!fileSet.has(module)) fail(`${definition.manifestPath}: reachable module is missing: ${module}.`);
  }
  for (const file of manifest.files.filter((item) => item.endsWith('.js'))) {
    if (!requiredModules.has(file)) {
      fail(`${definition.manifestPath}: unreachable JavaScript expands the artifact: ${file}.`);
    }
  }
}

const customerRoot = await readFile('src/app.js', 'utf8');
const customerHtml = await readFile('index.html', 'utf8');
if (/platform-admin/i.test(customerRoot)) fail('src/app.js: customer Composition Root must not reference Platform Admin.');
if (/platform-admin/i.test(customerHtml)) fail('index.html: customer Demo entrypoint must not reference Platform Admin.');

const productionHtml = await readFile('platform-admin/index.html', 'utf8');
const demoHtml = await readFile('platform-admin-demo/index.html', 'utf8');
if (!productionHtml.includes('conference-runtime" content="production"')) {
  fail('platform-admin/index.html: Production runtime declaration is required.');
}
if (!productionHtml.includes("connect-src 'self'")) {
  fail("platform-admin/index.html: Production connect-src must remain same-origin only.");
}
if (!productionHtml.includes('../src/platform-admin/production/bootstrap.js') || /\/demo\//.test(productionHtml)) {
  fail('platform-admin/index.html: Production must load only the Production composition root.');
}
if (!demoHtml.includes('conference-runtime" content="demo"')) {
  fail('platform-admin-demo/index.html: Demo runtime declaration is required.');
}
if (!demoHtml.includes("connect-src 'self'")) {
  fail("platform-admin-demo/index.html: Demo connect-src must allow only the same-origin Demo Platform API.");
}
if (!demoHtml.includes('platform-demo-data" content="synthetic-server-backed"')) {
  fail('platform-admin-demo/index.html: synthetic server-backed data disclosure metadata is required.');
}
if (!demoHtml.includes('../src/platform-admin/demo/bootstrap.js') || /\/production\//.test(demoHtml)) {
  fail('platform-admin-demo/index.html: Demo must load only the Demo composition root.');
}

const demoBootstrap = await readFile('src/platform-admin/demo/bootstrap.js', 'utf8');
for (const required of [
  'createApiClient',
  'createPlatformDemoSessionApi',
  'createPlatformAdminApi',
  "baseUrl: '/api/v1/platform/'",
]) {
  if (!demoBootstrap.includes(required)) {
    fail(`src/platform-admin/demo/bootstrap.js: server-backed Demo composition is missing ${required}.`);
  }
}
if (/demo-(?:store|adapter)|operator-fixtures|platform_admin_demo_v1|createPlatformAdminDemoStore/.test(demoBootstrap)) {
  fail('src/platform-admin/demo/bootstrap.js: retired browser Demo authority must not be reachable.');
}

if (failures) process.exit(1);
console.log(`Platform Admin Production/Demo boundary check passed for ${sources.size} frontend source modules.`);
