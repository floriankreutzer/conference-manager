const detachedPrintWindows = new Set();
const lifecycleOwners = new WeakSet();

export const DETACHED_PRINT_CSP = [
  "default-src 'none'",
  "script-src 'none'",
  "style-src 'unsafe-inline'",
  "img-src 'none'",
  "font-src 'none'",
  "connect-src 'none'",
  "media-src 'none'",
  "object-src 'none'",
  "frame-src 'none'",
  "child-src 'none'",
  "worker-src 'none'",
  "manifest-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

export const DETACHED_PRINT_CSS = `
  @page{size:A4;margin:12mm}
  :root{color-scheme:light;--print-text:#1d1d1f;--print-muted:#4b4b4f;--print-border:#d0d0ce;--print-surface:#fff;--print-accent:#7a1f3d;--print-highlight:#c29a6b}
  *{box-sizing:border-box}
  body{max-inline-size:190mm;margin:0 auto;padding:1rem;background:var(--print-surface);color:var(--print-text);font-family:Arial,sans-serif;font-size:10.5pt;line-height:1.48}
  h1,h2,p{overflow-wrap:anywhere}h1{font-size:2rem;line-height:1.15}h2{font-size:1rem}
  dl{display:grid;grid-template-columns:minmax(8rem,11rem) minmax(0,1fr);gap:.5rem 1rem}dt{font-weight:700}dd{margin:0;overflow-wrap:anywhere}
  a{color:var(--print-accent)}.print-action{min-block-size:2.75rem;margin-block-end:1rem;padding:.625rem .875rem;border:0;background:var(--print-text);color:var(--print-surface);font:inherit;font-weight:700}
  @media(max-width:40rem){body{padding:.75rem}dl{grid-template-columns:1fr;gap:.25rem}dd{margin-block-end:.625rem}}
  @media print{body{max-inline-size:none;padding:0}.print-action{display:none}a{color:inherit;text-decoration:underline}}
`;

function clearDetachedPrintWindow(printWindow) {
  try {
    const root = printWindow?.document?.documentElement;
    if (typeof root?.replaceChildren === 'function') root.replaceChildren();
    else printWindow?.document?.body?.replaceChildren?.();
  } catch {
    // A navigated or already-closed window is no longer readable by the opener.
  }
}

export function closeDetachedPrintWindow(printWindow) {
  if (!printWindow) return false;
  const registered = detachedPrintWindows.delete(printWindow);
  if (registered) clearDetachedPrintWindow(printWindow);
  try { printWindow.close?.(); } catch {}
  return registered;
}

export function closeDetachedPrintWindows() {
  const windows = [...detachedPrintWindows];
  detachedPrintWindows.clear();
  windows.forEach((printWindow) => {
    clearDetachedPrintWindow(printWindow);
    try { printWindow.close?.(); } catch {}
  });
  return windows.length;
}

function installOwnerLifecycle(ownerWindow) {
  if (
    (!ownerWindow || (typeof ownerWindow !== 'object' && typeof ownerWindow !== 'function'))
    || lifecycleOwners.has(ownerWindow)
  ) return;
  lifecycleOwners.add(ownerWindow);
  ownerWindow.addEventListener?.('pagehide', closeDetachedPrintWindows);
  ownerWindow.addEventListener?.('beforeunload', closeDetachedPrintWindows);
}

export function registerDetachedPrintWindow(printWindow, { ownerWindow = globalThis.window } = {}) {
  if (!printWindow || (typeof printWindow !== 'object' && typeof printWindow !== 'function')) {
    return null;
  }
  try {
    printWindow.opener = null;
    if (printWindow.opener !== null) {
      closeDetachedPrintWindow(printWindow);
      return null;
    }
  } catch {
    closeDetachedPrintWindow(printWindow);
    return null;
  }
  detachedPrintWindows.add(printWindow);
  installOwnerLifecycle(ownerWindow);
  return printWindow;
}

export function openDetachedPrintWindow({ windowRoot = globalThis.window } = {}) {
  const printWindow = windowRoot?.open?.('', '_blank');
  return printWindow ? registerDetachedPrintWindow(printWindow, { ownerWindow: windowRoot }) : null;
}

export function initializeDetachedPrintDocument(printWindow, {
  lang,
  title,
  css = '',
} = {}) {
  if (
    !detachedPrintWindows.has(printWindow)
    || typeof lang !== 'string'
    || !/^[a-z]{2}(?:-[A-Z]{2})?$/u.test(lang)
    || typeof title !== 'string'
    || !title.trim()
    || typeof css !== 'string'
    || /url\s*\(|@import|@font-face/iu.test(css)
  ) throw new TypeError('DETACHED_PRINT_DOCUMENT_INVALID');
  const doc = printWindow.document;
  const head = doc.createElement('head');
  const body = doc.createElement('body');
  const charset = doc.createElement('meta');
  charset.setAttribute('charset', 'utf-8');
  const viewport = doc.createElement('meta');
  viewport.setAttribute('name', 'viewport');
  viewport.setAttribute('content', 'width=device-width, initial-scale=1');
  const referrer = doc.createElement('meta');
  referrer.setAttribute('name', 'referrer');
  referrer.setAttribute('content', 'no-referrer');
  const csp = doc.createElement('meta');
  csp.setAttribute('http-equiv', 'Content-Security-Policy');
  csp.setAttribute('content', DETACHED_PRINT_CSP);
  const style = doc.createElement('style');
  style.textContent = `${DETACHED_PRINT_CSS}\n${css}`;
  head.append(charset, viewport, referrer, csp, style);
  doc.documentElement.replaceChildren(head, body);
  doc.documentElement.lang = lang;
  doc.title = title;
  return doc;
}
