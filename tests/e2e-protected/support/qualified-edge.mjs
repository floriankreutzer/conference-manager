import { createServer as httpsServer } from 'node:https';
import { createServer as httpServer,request as httpRequest } from 'node:http';
import { connect } from 'node:net';
import { readFile,readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import path from 'node:path';
import { buildModuleGraph } from '../../../scripts/module-graph.mjs';
import { createProtectedCustomerHtml } from '../../../scripts/protected-customer-html.mjs';
import { createProtectedPlatformHtml } from '../../../scripts/protected-platform-html.mjs';

const HOSTS=Object.freeze({ 'app-int.example.test': 'customer','ops-int.example.com': 'platform' });
const ORIGINS=Object.freeze({ customer: 'https://app-int.example.test',platform: 'https://ops-int.example.com' });
const MAX_BYTES=2*1024*1024,MAX_EVENTS=2000;
function fail() { throw new Error('PROTECTED_QUALIFIED_EDGE_INVALID'); }
async function files(root,relative) {
  const result=[];
  for (const entry of await readdir(path.join(root,relative),{ withFileTypes: true })) {
    const name=path.posix.join(relative,entry.name);
    if (entry.isDirectory()) result.push(...await files(root,name));
    else if (entry.isFile()) result.push(name);
    else fail();
  }
  return result;
}
export async function buildProtectedAcceptanceArtifacts(root) {
  const sources=new Map();for (const name of await files(root,'src')) {
    if (name.endsWith('.js')) sources.set(name,await readFile(path.join(root,name),'utf8'));
  }
  const { graph,unresolved }=buildModuleGraph(sources);if (unresolved.length) fail();
  const customerFiles=new Set(['index.html',...await files(root,'assets')]);
  function visit(name) {
    if (customerFiles.has(name)) return;if (!graph.has(name)) fail();customerFiles.add(name);
    for (const dependency of graph.get(name)) visit(dependency);
  }
  visit('src/platform/production-bootstrap.js');
  if ([...customerFiles].some(name=>name.startsWith('src/platform-admin/'))) fail();
  const manifest=JSON.parse(await readFile(path.join(root,'deployment/platform-admin-production.json'),'utf8'));
  if (manifest.artifact!=='platform-admin-production' || !Array.isArray(manifest.files)) fail();
  const platformFiles=new Set(manifest.files);if (platformFiles.size!==manifest.files.length) fail();
  const presentation={ ...Object.fromEntries(Object.entries(ORIGINS).map(([surface,origin])=>[`${surface}Origin`,origin])),
    environment: 'int',syntheticEnabled: true,microsoftEnabled: false,invitationsEnabled: false };
  const customerHtml=createProtectedCustomerHtml({ source: await readFile(path.join(root,'index.html'),'utf8'),...presentation });
  const platformHtml=createProtectedPlatformHtml({ source: await readFile(path.join(root,'platform-admin/index.html'),'utf8'),...presentation });
  const sets={ customer: customerFiles,platform: platformFiles },content=new Map(),digests={};
  for (const [surface,set] of Object.entries(sets)) {
    const hash=createHash('sha256');
    for (const name of [...set].sort()) {
      if (!/^(?:src|assets|platform-admin)\//.test(name) && name!=='index.html' || name.includes('..')) fail();
      const bytes=name==='index.html' ? Buffer.from(customerHtml) : name==='platform-admin/index.html'
        ? Buffer.from(platformHtml) : await readFile(path.join(root,name));
      content.set(`${surface}:${name}`,bytes);hash.update(name).update('\0').update(bytes).update('\0');
    }
    digests[surface]=hash.digest('hex');
  }
  return { sets,content,digests };
}
function mime(name) {
  return name.endsWith('.js') ? 'text/javascript' : name.endsWith('.css') ? 'text/css' : name.endsWith('.html') ? 'text/html'
    : name.endsWith('.svg') ? 'image/svg+xml' : name.endsWith('.ttf') ? 'font/ttf' : 'application/octet-stream';
}
async function listen(server) {
  await new Promise((resolve,reject)=>{ server.once('error',reject);server.listen(0,'127.0.0.1',resolve); });
  return server.address().port;
}

// A byte-transparent CONNECT relay admits only these two qualified :443 sites
// to this loopback TLS edge. Browser URL/origin, SNI, certificate and RP stay real;
// it adds no auth header, mocks no response and cannot contact another host.
export async function createQualifiedProtectedEdge({ root,ports,certificateDirectory }={}) {
  if (!path.isAbsolute(root ?? '') || !path.isAbsolute(certificateDirectory ?? '')
    || !ports || ['customer','platform'].some(surface=>!Number.isSafeInteger(ports[surface])
      || ports[surface]<1024 || ports[surface]>65535) || ports.customer===ports.platform) fail();
  const built=await buildProtectedAcceptanceArtifacts(root),events=[],sockets=new Set();let deniedConnects=0;
  const edge=httpsServer({ key: await readFile(path.join(certificateDirectory,'server.key')),
    cert: await readFile(path.join(certificateDirectory,'server.crt')),maxHeaderSize: 16384 },(request,response)=>{
    const host=request.headers.host,surface=Object.hasOwn(HOSTS,host) ? HOSTS[host] : null;
    if (!surface || request.socket.servername!==host) { response.writeHead(421);response.end();return; }
    let url;try { url=new URL(request.url,ORIGINS[surface]); } catch { response.writeHead(400);response.end();return; }
    if (url.origin!==ORIGINS[surface] || events.length>=MAX_EVENTS) { response.writeHead(400);response.end();return; }
    const event={ surface,path: url.pathname,method: request.method,status: null,fetchSite: request.headers['sec-fetch-site'] ?? null,
      cookiePresent: Boolean(request.headers.cookie) };events.push(event);
    response.once('finish',()=>{ event.status=response.statusCode; });
    if (url.pathname.startsWith('/api/')) {
      const upstream=httpRequest({ hostname: '127.0.0.1',port: ports[surface],path: request.url,
        method: request.method,headers: { ...request.headers,connection: 'close' } },incoming=>{
        response.writeHead(incoming.statusCode,incoming.headers);let bytes=0;
        incoming.on('data',chunk=>{ bytes+=chunk.length;if (bytes>MAX_BYTES) { incoming.destroy();response.destroy(); } });
        incoming.on('error',()=>response.destroy());incoming.pipe(response);
      });let length=0;
      request.on('data',chunk=>{ length+=chunk.length;if (length>MAX_BYTES) { upstream.destroy();response.destroy(); } });
      upstream.setTimeout(15000,()=>upstream.destroy());upstream.on('error',()=>{
        if (!response.headersSent) response.writeHead(503);response.end();
      });request.on('aborted',()=>upstream.destroy());request.pipe(upstream);return;
    }
    if (request.method!=='GET') { response.writeHead(405);response.end();return; }
    let name;try { name=decodeURIComponent(url.pathname).slice(1); } catch { response.writeHead(400);response.end();return; }
    if (surface==='platform' && !name) { response.writeHead(303,{ Location: '/platform-admin/' });response.end();return; }
    if (surface==='customer' && !name) name='index.html';
    if (surface==='platform' && name==='platform-admin/') name='platform-admin/index.html';
    const bytes=built.content.get(`${surface}:${name}`);
    if (!built.sets[surface].has(name) || !bytes) { response.writeHead(404);response.end();return; }
    response.writeHead(200,{ 'Content-Type': mime(name),'Content-Length': bytes.length,
      'Cache-Control': 'no-store','X-Content-Type-Options': 'nosniff' });response.end(bytes);
  });
  edge.on('tlsClientError',()=>{});edge.requestTimeout=20000;edge.headersTimeout=10000;
  function track(server) { server.on('connection',socket=>{
    sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.on('error',()=>{});
  }); }track(edge);
  const edgePort=await listen(edge),proxy=httpServer((request,response)=>{ response.writeHead(405);response.end(); });track(proxy);
  proxy.on('connect',(request,socket,head)=>{
    if (!Object.hasOwn(HOSTS,request.url.replace(/:443$/,'')) || !Object.keys(HOSTS).some(host=>request.url===`${host}:443`)) {
      deniedConnects++;socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;
    }
    const upstream=connect({ host: '127.0.0.1',port: edgePort });sockets.add(upstream);
    upstream.on('close',()=>sockets.delete(upstream));upstream.on('error',()=>socket.destroy());socket.on('error',()=>upstream.destroy());
    socket.on('close',()=>upstream.destroy());upstream.setTimeout(20000,()=>upstream.destroy());
    upstream.once('connect',()=>{ socket.write('HTTP/1.1 200 Connection Established\r\n\r\n');
      if (head.length) upstream.write(head);socket.pipe(upstream);upstream.pipe(socket);
    });
  });const proxyPort=await listen(proxy);
  return Object.freeze({ proxy: `http://127.0.0.1:${proxyPort}`,origins: ORIGINS,
    evidence: ()=>({ artifacts: { ...built.digests },requests: events.map(value=>({ ...value })),deniedConnects }),
    async close() { for (const socket of sockets) socket.destroy();
      await Promise.all([new Promise(resolve=>edge.close(resolve)),new Promise(resolve=>proxy.close(resolve))]);
    },
  });
}
