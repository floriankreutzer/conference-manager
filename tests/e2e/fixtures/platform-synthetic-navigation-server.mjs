const CUSTOMER='https://127.0.0.1:4174',PLATFORM='https://127.0.0.1:4173';

// Local transport fixture only: validates fixed native document form bytes and
// emits an actual two-origin303. It creates no Customer cookie or identity and
// does not substitute for the real backend's exact proof/session transaction.
export async function handlePlatformSyntheticNavigationFixture(request,response) {
  const owner=request.url==='/api/v1/platform/auth/owner/approve';
  if (!owner && request.url!=='/api/v1/platform/auth/delegation/approve') return false;
  if (request.method!=='POST' || request.headers.host!=='127.0.0.1:4173'
    || request.headers.origin!==PLATFORM || request.headers['content-type']!=='application/x-www-form-urlencoded'
    || !String(request.headers.cookie || '').split(';').some(value=>value.trim()==='cm_fixture_platform=present')) {
    response.writeHead(400);response.end();return true;
  }
  const chunks=[];let bytes=0;
  for await (const chunk of request) { bytes+=chunk.length;
    if (bytes>32768) { response.writeHead(413);response.end();return true; }chunks.push(chunk);
  }
  const form=new URLSearchParams(Buffer.concat(chunks).toString('utf8'));
  let payload;try { payload=JSON.parse(form.get('payload')); } catch { /* Rejected below. */ }
  if (form.size!==2 || !['C'.repeat(43),'N'.repeat(43)].includes(form.get('csrfToken')) || !payload
    || !(owner ? Object.keys(payload).sort().join(',')==='role,state,tenantId'
      && payload.tenantId==='ba000000-0000-4000-8000-000000000002'
      : ['generationId,response,role,slot,state','generationId,role,slot,state'].includes(Object.keys(payload).sort().join(','))
      && ['northwind','contoso','fabrikam'].includes(payload.slot))
    || payload.state!==Buffer.alloc(32,1).toString('base64url')
    || !['employee','conference_manager','tenant_admin'].includes(payload.role)) {
    response.writeHead(400);response.end();return true;
  }
  response.writeHead(303,{ Location: `${CUSTOMER}/__cm-platform-handoff-result`,'Cache-Control': 'no-store',
    'Referrer-Policy': 'no-referrer' });response.end();return true;
}
export function platformSyntheticLandingFixture(request,response) {
  if (request.method!=='GET' || request.url!=='/__cm-platform-handoff-result') {
    response.writeHead(404);response.end();return;
  }
  response.writeHead(200,{ 'Content-Type': 'text/html; charset=utf-8','Cache-Control': 'no-store',
    'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",'Referrer-Policy': 'no-referrer' });
  response.end('<!doctype html><html lang="en"><meta charset="utf-8"><title>Local handoff fixture</title><p>Native handoff fixture reached.</p></html>');
}
