import { createHash } from 'node:crypto';
import { mkdir,readFile,readdir,writeFile } from 'node:fs/promises';
import path from 'node:path';
import { buildModuleGraph } from './module-graph.mjs';
import { createProtectedCustomerHtml,requireProtectedFrontendOrigins } from './protected-customer-html.mjs';
import { createProtectedPlatformHtml } from './protected-platform-html.mjs';

const fail=()=>{ throw new TypeError('PROTECTED_FRONTEND_BUILD_INVALID'); };
const hash=bytes=>createHash('sha256').update(bytes).digest('hex');
async function files(root,relative) {
  const result=[];
  for (const entry of await readdir(path.join(root,relative),{ withFileTypes: true })) {
    const name=path.posix.join(relative,entry.name);
    if (entry.isDirectory()) result.push(...await files(root,name));else if (entry.isFile()) result.push(name);else fail();
  }
  return result;
}

// Build-time only: no credentials, network, source execution, runtime authority
// or browser-controlled paths. The reviewed checkout supplies native modules.
export async function buildProtectedFrontendArtifacts({ root,apiCommit,frontendCommit,customerOrigin,platformOrigin,
  environment,syntheticEnabled=false,microsoftEnabled=false,invitationsEnabled=false }={}) {
  if (!path.isAbsolute(root ?? '') || ![apiCommit,frontendCommit].every(ref=>/^[a-f0-9]{40}$/.test(ref ?? ''))
    || !['dev','int','prod'].includes(environment)) fail();
  requireProtectedFrontendOrigins({ customerOrigin,platformOrigin });
  const sources=new Map();for (const name of await files(root,'src')) {
    if (name.endsWith('.js')) sources.set(name,await readFile(path.join(root,name),'utf8'));
  }
  const { graph,unresolved }=buildModuleGraph(sources);if (unresolved.length) fail();
  const customerFiles=new Set(['index.html',...(await files(root,'assets')).filter(name=>!name.endsWith('.md'))]);
  function visit(name) {
    if (customerFiles.has(name)) return;if (!graph.has(name)) fail();customerFiles.add(name);
    for (const dependency of graph.get(name)) visit(dependency);
  }
  visit('src/platform/production-bootstrap.js');
  if ([...customerFiles].some(name=>name.startsWith('src/platform-admin/'))) fail();
  const platformInventory=JSON.parse(await readFile(path.join(root,'deployment/platform-admin-production.json'),'utf8'));
  if (platformInventory.artifact!=='platform-admin-production' || !Array.isArray(platformInventory.files)) fail();
  const platformFiles=new Set(platformInventory.files);if (platformFiles.size!==platformInventory.files.length) fail();
  const presentation={ customerOrigin,platformOrigin,environment,syntheticEnabled,microsoftEnabled,invitationsEnabled };
  const html={ customer: createProtectedCustomerHtml({ source: await readFile(path.join(root,'index.html'),'utf8'),...presentation }),
    platform: createProtectedPlatformHtml({ source: await readFile(path.join(root,'platform-admin/index.html'),'utf8'),...presentation }) };
  const sets={ customer: customerFiles,platform: platformFiles },content=new Map(),digests={},manifests={},manifestDigests={};
  for (const [surface,set] of Object.entries(sets)) {
    if (set.size>512) fail();const ordered=createHash('sha256'),entries=[];let total=0;
    for (const name of [...set].sort()) {
      if (!/^(?:src|assets|platform-admin)\//.test(name) && name!=='index.html' || name.includes('..')) fail();
      const bytes=name==='index.html' ? Buffer.from(html.customer) : name==='platform-admin/index.html'
        ? Buffer.from(html.platform) : await readFile(path.join(root,name));
      total+=bytes.length;if (!bytes.length || bytes.length>2*1024*1024 || total>16*1024*1024) fail();
      content.set(`${surface}:${name}`,bytes);ordered.update(name).update('\0').update(bytes).update('\0');
      entries.push({ path: name,bytes: bytes.length,sha256: hash(bytes) });
    }
    digests[surface]=ordered.digest('hex');
    manifests[surface]=Buffer.from(JSON.stringify({ schemaVersion: 1,surface,environment,apiCommit,frontendCommit,
      customerOrigin,platformOrigin,syntheticEnabled,microsoftEnabled,invitationsEnabled,files: entries })+'\n');
    manifestDigests[surface]=hash(manifests[surface]);
  }
  return { sets,content,digests,manifests,manifestDigests };
}

export async function writeProtectedFrontendArtifacts(built,destination) {
  if (!path.isAbsolute(destination ?? '')) fail();
  // Exclusive directory creation prevents stale/foreign file adoption. The
  // operator explicitly replaces an old artifact before running a new build.
  await mkdir(destination,{ recursive: false });
  for (const [surface,set] of Object.entries(built.sets)) {
    const root=path.join(destination,surface);await mkdir(root);
    for (const name of set) {
      if (name.includes('..') || !/^(?:src|assets|platform-admin)\//.test(name) && name!=='index.html') fail();
      const target=path.join(root,name);await mkdir(path.dirname(target),{ recursive: true });
      await writeFile(target,built.content.get(`${surface}:${name}`),{ flag: 'wx' });
    }
    await writeFile(path.join(root,'manifest.json'),built.manifests[surface],{ flag: 'wx' });
  }
}
