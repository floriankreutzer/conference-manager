// Immutable protected Customer artifact preparation. No runtime secret or
// browser value selects either origin. Closed Demo/ordinary HTML is unchanged.
function origin(value) {
  let url;try { url=new URL(value); } catch { /* The closed check below owns this error. */ }
  if (typeof value!=='string' || value.length>253 || !url || url.protocol!=='https:' || url.origin!==value
    || !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?$/.test(url.hostname)) {
    throw new TypeError('PROTECTED_CUSTOMER_HTML_ORIGIN_INVALID');
  }
  return value;
}
export function requireProtectedFrontendOrigins({ customerOrigin,platformOrigin }={}) {
  origin(customerOrigin);origin(platformOrigin);
  if (customerOrigin===platformOrigin) throw new TypeError('PROTECTED_CUSTOMER_HTML_INVALID');
  return Object.freeze({ customerOrigin,platformOrigin });
}
export function protectedPresentationMetadata({ environment=null,syntheticEnabled=false,microsoftEnabled=false,invitationsEnabled=false,ownerAccessEnabled=false }={}) {
  if ([syntheticEnabled,microsoftEnabled,invitationsEnabled,ownerAccessEnabled].some(value=>typeof value!=='boolean')
    || environment!==null && !['dev','int','prod'].includes(environment)
    || [syntheticEnabled,microsoftEnabled,invitationsEnabled,ownerAccessEnabled].some(Boolean) && environment===null
    || syntheticEnabled && environment==='prod' || ownerAccessEnabled && !microsoftEnabled) throw new TypeError('PROTECTED_PRESENTATION_CONFIGURATION_INVALID');
  return `<meta name="conference-protected-runtime" content="true">
  <meta name="conference-deployment-environment" content="${environment ?? 'unconfigured'}">
  <meta name="conference-protected-synthetic" content="${syntheticEnabled ? 'enabled' : 'disabled'}">
  <meta name="conference-protected-owner-access" content="${ownerAccessEnabled ? 'enabled' : 'disabled'}">
  <meta name="conference-protected-microsoft" content="${microsoftEnabled ? 'enabled' : 'disabled'}">
  <meta name="conference-protected-invitations" content="${invitationsEnabled ? 'enabled' : 'disabled'}">`;
}
export function createProtectedCustomerHtml({ source,customerOrigin,platformOrigin,...presentation }={}) {
  requireProtectedFrontendOrigins({ customerOrigin,platformOrigin });
  if (typeof source!=='string') throw new TypeError('PROTECTED_CUSTOMER_HTML_INVALID');
  const metadata=protectedPresentationMetadata(presentation);
  const replacements=[
    ['<meta name="conference-runtime" content="demo">','<meta name="conference-runtime" content="production">'],
    ['<meta name="conference-demo-data" content="synthetic-server-backed">',metadata],
    ['<meta name="referrer" content="no-referrer">','<meta name="referrer" content="same-origin">'],
    ["; form-action 'self';",`; form-action 'self' ${platformOrigin};`],
  ];
  let html=source;
  for (const [before,after] of replacements) {
    if (html.split(before).length!==2) throw new TypeError('PROTECTED_CUSTOMER_HTML_INVALID');html=html.replace(before,after);
  }
  const entry=/\.\/src\/platform\/demo-bootstrap\.js(\?v=[A-Za-z0-9._-]+)?/g;
  if ([...html.matchAll(entry)].length!==1) throw new TypeError('PROTECTED_CUSTOMER_HTML_INVALID');
  return html.replace(entry,(_match,marker='')=>`./src/platform/production-bootstrap.js${marker}`);
}
