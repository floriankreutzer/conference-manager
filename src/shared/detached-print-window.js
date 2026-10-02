const detachedPrintWindows = new Set();
const lifecycleOwners = new WeakSet();
const stylesheetReadiness = new WeakMap();
const printStylesheets = ['../../assets/tokens.css', '../../assets/employee-ux.css']
  .map((path) => new URL(path, import.meta.url).href);

export const DETACHED_PRINT_CSP = [
  "default-src 'none'",
  "script-src 'none'",
  `style-src ${printStylesheets.join(' ')}`,
  "style-src-attr 'none'",
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

export function detachedPrintStylesReady(printWindow) {
  return stylesheetReadiness.get(printWindow) || Promise.reject(new TypeError('DETACHED_PRINT_DOCUMENT_INVALID'));
}

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
} = {}) {
  if (
    !detachedPrintWindows.has(printWindow)
    || typeof lang !== 'string'
    || !/^[a-z]{2}(?:-[A-Z]{2})?$/u.test(lang)
    || typeof title !== 'string'
    || !title.trim()
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
  head.append(charset, viewport, referrer, csp);
  body.className = 'guest-print-document';
  doc.documentElement.replaceChildren(head, body);
  doc.documentElement.lang = lang;
  doc.title = title;
  const loads = printStylesheets.map((href) => {
    const link = doc.createElement('link');
    link.setAttribute('rel', 'stylesheet');
    link.setAttribute('href', href);
    const loaded = new Promise((resolve, reject) => {
      link.addEventListener('load', resolve, { once: true });
      link.addEventListener('error', () => reject(new Error('DETACHED_PRINT_STYLE_UNAVAILABLE')), { once: true });
    });
    head.append(link);
    return loaded;
  });
  let timeout;
  const deadline = new Promise((_, reject) => {
    timeout = printWindow.setTimeout(() => reject(new Error('DETACHED_PRINT_STYLE_TIMEOUT')), 15_000);
  });
  const ready = Promise.race([Promise.all(loads), deadline])
    .finally(() => printWindow.clearTimeout(timeout));
  // Register a handler immediately, including when a caller only reserves a surface.
  ready.catch(() => {});
  stylesheetReadiness.set(printWindow, ready);
  return doc;
}
