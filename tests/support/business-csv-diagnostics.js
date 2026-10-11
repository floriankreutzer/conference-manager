const LOCAL_CUSTOMER_ORIGIN = 'https://customer.demo.test:4443';
const ENDPOINTS = Object.freeze({
  '/api/v1/demo/session': 'session',
  '/api/v1/demo/tenants': 'tenants',
  '/api/v1/application/profile': 'profile',
  '/api/v1/application/catalog': 'catalog',
  '/api/v1/application/requests': 'requests',
  '/api/v1/application/notifications': 'notifications',
});
const PHASES = new Set(['initial', 'rooms', 'services', 'equipment', 'catering-items', 'catering-packages']);
const CATALOG_SECTIONS = new Set(['sites', 'rooms', 'services', 'equipment', 'cateringPackages', 'cateringItems', 'costCenters']);
const MAX_REQUESTS = 64;
const MAX_DURATION_MS = 300_000;

export function localCsvDiagnosticsEnabled({ projectName, customerOrigin, hosted, gated }) {
  return ['chromium-shared-demo', 'webkit-shared-demo'].includes(projectName)
    && customerOrigin === LOCAL_CUSTOMER_ORIGIN && hosted === false && gated === false;
}

// Observe only the current local bootstrap. Never read response bodies, headers,
// cookies, cursor/context values or raw network errors. A known catalogue
// section selects a fixed endpoint class; unknown query values are discarded.
export function observeLocalCsvBootstrap(page, enabled) {
  if (!enabled) return null;
  let phase = 'initial';
  let active = false;
  let overflow = false;
  let entries = [];
  let pending = new WeakMap();
  const elapsed = (start) => Math.min(MAX_DURATION_MS, Math.max(0, Math.round(performance.now() - start)));
  const onRequest = (request) => {
    if (!active || request.method() !== 'GET') return;
    let url;
    try { url = new URL(request.url()); } catch { return; }
    if (url.origin !== LOCAL_CUSTOMER_ORIGIN || url.username || url.password
      || !Object.hasOwn(ENDPOINTS, url.pathname)) return;
    if (entries.length === MAX_REQUESTS) { overflow = true; return; }
    let endpoint = ENDPOINTS[url.pathname];
    if (endpoint === 'catalog') {
      const sections = url.searchParams.getAll('section');
      if (sections.length === 1 && CATALOG_SECTIONS.has(sections[0])) endpoint = `catalog.${sections[0]}`;
    }
    const entry = { sequence: entries.length + 1, endpoint, status: null, outcome: 'pending', durationMs: 0 };
    entries.push(entry);
    pending.set(request, { entry, start: performance.now() });
  };
  const onResponse = (response) => {
    const value = pending.get(response.request());
    if (!value) return;
    const status = response.status();
    value.entry.status = Number.isInteger(status) && status >= 100 && status <= 599 ? status : null;
    value.entry.outcome = 'response';
    value.entry.durationMs = elapsed(value.start);
  };
  const complete = (request, outcome) => {
    const value = pending.get(request);
    if (!value) return;
    value.entry.outcome = outcome;
    value.entry.durationMs = elapsed(value.start);
    pending.delete(request);
  };
  const onFinished = (request) => complete(request, 'finished');
  const onFailed = (request) => complete(request, 'failed');
  const listeners = { request: onRequest, response: onResponse, requestfinished: onFinished, requestfailed: onFailed };
  for (const [event, listener] of Object.entries(listeners)) page.on(event, listener);
  return Object.freeze({
    start(value) {
      if (!PHASES.has(value)) throw new Error('CSV_DIAGNOSTIC_PHASE_INVALID');
      phase = value; entries = []; pending = new WeakMap(); overflow = false; active = true;
    },
    stop() { active = false; },
    snapshot() { return { phase, overflow, requests: entries.map((entry) => ({ ...entry })) }; },
    dispose() {
      active = false;
      for (const [event, listener] of Object.entries(listeners)) page.off(event, listener);
    },
  });
}

// Attempt every cleanup independently. A reset failure must neither hide the
// journey failure nor prevent either browser context from being closed.
export async function cleanupCsvContexts({ seeded, reset, customer, platform }) {
  const result = { reset: 'not_needed', customer: 'failed', platform: 'failed' };
  if (seeded) {
    try { await reset(platform); result.reset = 'passed'; }
    catch { result.reset = 'failed'; }
  }
  for (const [name, context] of [['customer', customer], ['platform', platform]]) {
    try { await context.close(); result[name] = 'passed'; }
    catch { result[name] = 'failed'; }
  }
  return result;
}

export function csvTestFailure(primaryError, cleanup, diagnosticFailed = false) {
  if (primaryError !== undefined) return primaryError;
  if (Object.values(cleanup).includes('failed')) return new Error('CSV_CLEANUP_NOT_VERIFIED');
  if (diagnosticFailed) return new Error('CSV_DIAGNOSTIC_ATTACHMENT_FAILED');
  return undefined;
}
