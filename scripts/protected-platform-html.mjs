import { requireProtectedFrontendOrigins,protectedPresentationMetadata } from './protected-customer-html.mjs';

// The immutable build supplies both fixed origins and presentation flags.
// Browser metadata never grants a session, target, role or privileged proof.
export function createProtectedPlatformHtml({ source,customerOrigin,platformOrigin,...presentation }={}) {
  requireProtectedFrontendOrigins({ customerOrigin,platformOrigin });
  if (typeof source!=='string') throw new TypeError('PROTECTED_PLATFORM_HTML_INVALID');
  const metadata=protectedPresentationMetadata(presentation);
  const replacements=[
    ['<meta name="conference-runtime" content="production">',`<meta name="conference-runtime" content="production">\n  ${metadata}`],
    ['<meta name="referrer" content="no-referrer">','<meta name="referrer" content="same-origin">'],
    ["; form-action 'self';",`; form-action 'self' ${customerOrigin};`],
  ];
  let html=source;
  for (const [before,after] of replacements) {
    if (html.split(before).length!==2) throw new TypeError('PROTECTED_PLATFORM_HTML_INVALID');html=html.replace(before,after);
  }
  if ((html.match(/src\/platform-admin\/production\/bootstrap\.js(?:\?v=[A-Za-z0-9._-]+)?/g) || []).length!==1) {
    throw new TypeError('PROTECTED_PLATFORM_HTML_INVALID');
  }
  return html;
}
