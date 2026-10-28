import { createServer as httpsServer } from 'node:https';
import { createServer as httpServer,request as httpRequest } from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { isolatedOwnerMicrosoftDocument } from './isolated-owner-microsoft.mjs';
import { buildProtectedFrontendArtifacts } from '../../../scripts/protected-frontend-artifacts.mjs';
import { connectQualifiedTunnel } from './qualified-connect-tunnel.mjs';

const HOSTS=Object.freeze({ 'app-int.example.test': 'customer','ops-int.example.com': 'platform' });
const ORIGINS=Object.freeze({ customer: 'https://app-int.example.test',platform: 'https://ops-int.example.com' });
const MAX_BYTES=2*1024*1024,MAX_EVENTS=2000;
function fail() { throw new Error('PROTECTED_QUALIFIED_EDGE_INVALID'); }

// Explicit phase compaction releases only successful immutable-asset evidence.
// Authentication, document, failure and unfinished events retain their order.
export function compactQualifiedStaticRequests(events) {
  const completed={ customer: 0,platform: 0 },requests=[];
  for (const event of events) {
    if (Object.hasOwn(completed,event.surface) && ['GET','HEAD'].includes(event.method) && event.status===200
      && /^(?:\/src\/[A-Za-z0-9_./-]+\.js|\/assets\/[A-Za-z0-9_./-]+)$/.test(event.path)) completed[event.surface]++;
    else requests.push(event);
  }
  return { requests,completed };
}
export async function buildProtectedAcceptanceArtifacts(root) {
  return buildProtectedFrontendArtifacts({ root,apiCommit: 'a'.repeat(40),frontendCommit: 'b'.repeat(40),
    ...Object.fromEntries(Object.entries(ORIGINS).map(([surface,origin])=>[`${surface}Origin`,origin])),
    environment: 'int',syntheticEnabled: true });
}
async function listen(server) {
  await new Promise((resolve,reject)=>{ server.once('error',reject);server.listen(0,'127.0.0.1',resolve); });
  return server.address().port;
}

// A byte-transparent CONNECT relay admits only these two qualified :443 sites
// to this loopback TLS edge. Browser URL/origin, SNI, certificate and RP stay real;
// it adds no auth header, mocks no response and cannot contact another host.
export async function createQualifiedProtectedEdge({ root,ports,certificateDirectory,artifactDigests,isolatedMicrosoft=false }={}) {
  if (typeof isolatedMicrosoft!=='boolean' || !path.isAbsolute(root ?? '') || !path.isAbsolute(certificateDirectory ?? '')
    || !ports || ['customer','platform'].some(surface=>!Number.isSafeInteger(ports[surface])
      || ports[surface]<1024 || ports[surface]>65535) || ports.customer===ports.platform || !artifactDigests
    || ['customer','platform'].some(surface=>!/^[a-f0-9]{64}$/.test(artifactDigests[surface] ?? ''))) fail();
  const events=[],sockets=new Set(),completedStatic={ customer: 0,platform: 0 };let deniedConnects=0,staticCompactions=0,providerDocuments=0;
  const edge=httpsServer({ key: await readFile(path.join(certificateDirectory,'server.key')),
    cert: await readFile(path.join(certificateDirectory,'server.crt')),maxHeaderSize: 16384 },(request,response)=>{
    const host=request.headers.host;
    if (isolatedMicrosoft && host==='login.microsoftonline.com' && request.socket.servername===host) {
      const document=isolatedOwnerMicrosoftDocument(request.method,request.url);
      if (document===null) { response.writeHead(400);response.end();return; }
      providerDocuments++;response.writeHead(200,{ 'Content-Type': 'text/html; charset=utf-8','Cache-Control': 'no-store',
        'Cross-Origin-Opener-Policy': 'same-origin','Referrer-Policy': 'no-referrer',
        'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'" });response.end(document);return;
    }
    const surface=Object.hasOwn(HOSTS,host) ? HOSTS[host] : null;
    if (!surface || request.socket.servername!==host) { response.writeHead(421);response.end();return; }
    let url;try { url=new URL(request.url,ORIGINS[surface]); } catch { response.writeHead(400);response.end();return; }
    if (url.origin!==ORIGINS[surface] || events.length>=MAX_EVENTS) { response.writeHead(400);response.end();return; }
    const event={ surface,path: url.pathname,method: request.method,status: null,fetchSite: request.headers['sec-fetch-site'] ?? null,
      cookiePresent: Boolean(request.headers.cookie) };events.push(event);
    response.once('finish',()=>{ event.status=response.statusCode; });
    {
      const upstream=httpRequest({ hostname: '127.0.0.1',port: ports[surface],path: request.url,
        method: request.method,headers: { ...request.headers,connection: 'close' } },incoming=>{
        response.writeHead(incoming.statusCode,incoming.headers);let bytes=0;const failure=[];
        incoming.on('data',chunk=>{
          bytes+=chunk.length;if (bytes>MAX_BYTES) { incoming.destroy();response.destroy(); }
          if (incoming.statusCode>=400 && bytes<=4096) failure.push(chunk);
        });
        incoming.on('end',()=>{
          if (incoming.statusCode<400 || bytes>4096) return;
          try {
            const body=JSON.parse(Buffer.concat(failure).toString()),code=body.error?.code;
            if (typeof code==='string' && /^[A-Z][A-Z0-9_]{1,127}$/.test(code)) event.errorCode=code;
          } catch { /* No raw response is retained as diagnostic evidence. */ }
        });
        incoming.on('error',()=>response.destroy());incoming.pipe(response);
      });let length=0;
      request.on('data',chunk=>{ length+=chunk.length;if (length>MAX_BYTES) { upstream.destroy();response.destroy(); } });
      upstream.setTimeout(15000,()=>upstream.destroy());upstream.on('error',()=>{
        if (!response.headersSent) response.writeHead(503);response.end();
      });request.on('aborted',()=>upstream.destroy());request.pipe(upstream);return;
    }

  });
  edge.on('tlsClientError',()=>{});edge.requestTimeout=20000;edge.headersTimeout=10000;
  function track(server) { server.on('connection',socket=>{
    sockets.add(socket);socket.on('close',()=>sockets.delete(socket));socket.on('error',()=>{});
  }); }track(edge);
  const edgePort=await listen(edge),proxy=httpServer((request,response)=>{ response.writeHead(405);response.end(); });track(proxy);
  proxy.on('connect',(request,socket,head)=>{
    const allowed=Object.keys(HOSTS).some(host=>request.url===`${host}:443`)
      || (isolatedMicrosoft && request.url==='login.microsoftonline.com:443');
    if (!allowed) {
      deniedConnects++;socket.end('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n');return;
    }
    connectQualifiedTunnel({ socket,head,edgePort,sockets });
  });const proxyPort=await listen(proxy);
  return Object.freeze({ proxy: `http://127.0.0.1:${proxyPort}`,origins: ORIGINS,
    compactStaticEvidence() {
      if (staticCompactions>=2) fail();
      const compacted=compactQualifiedStaticRequests(events);staticCompactions++;
      for (const surface of Object.keys(completedStatic)) completedStatic[surface]+=compacted.completed[surface];
      events.splice(0,events.length,...compacted.requests);
    },
    evidence: ()=>({ artifacts: { ...artifactDigests },requests: events.map(value=>({ ...value })),deniedConnects,
      staticCompactions,providerDocuments,completedStatic: { ...completedStatic } }),
    async close() { for (const socket of sockets) socket.destroy();
      await Promise.all([new Promise(resolve=>edge.close(resolve)),new Promise(resolve=>proxy.close(resolve))]);
    },
  });
}
