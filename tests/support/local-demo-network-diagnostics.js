const LOCAL_CUSTOMER_ORIGIN = 'https://customer.demo.test:4443';
const ENDPOINTS = Object.freeze({
  '/api/v1/demo/session': 'session',
  '/api/v1/demo/tenants': 'tenants',
  '/api/v1/application/profile': 'profile',
  '/api/v1/application/catalog': 'catalog',
  '/api/v1/application/requests': 'requests',
  '/api/v1/application/notifications': 'notifications',
});
const CATALOG_SECTIONS = new Set(['sites', 'rooms', 'services', 'equipment', 'cateringPackages', 'cateringItems', 'costCenters']);
const MAX_REQUESTS = 64;
const MAX_DURATION_MS = 300_000;

export function localSharedDemoDiagnosticsEnabled({ projectName, customerOrigin, hosted, gated }) {
  return ['chromium-shared-demo', 'webkit-shared-demo'].includes(projectName)
    && customerOrigin === LOCAL_CUSTOMER_ORIGIN && hosted === false && gated === false;
}

// Observe only the current fixed local bootstrap/context phase. Never read response bodies, headers,
// cookies, cursor/context values or raw network errors. A known catalogue
// section selects a fixed endpoint class; unknown query values are discarded.
export function observeLocalDemoNetwork(page, enabled, purpose) {
  if (!enabled) return null;
  if (!['csv-bootstrap', 'context-switch'].includes(purpose)) throw new Error('LOCAL_DIAGNOSTIC_PURPOSE_INVALID');
  let active = false;
  let overflow = false;
  let entries = [];
  let pending = new WeakMap();
  const elapsed = (start) => Math.min(MAX_DURATION_MS, Math.max(0, Math.round(performance.now() - start)));
  const onRequest = (request) => {
    if (!active) return;
    const method = request.method();
    if (!['GET', 'PUT'].includes(method)) return;
    let url;
    try { url = new URL(request.url()); } catch { return; }
    if (url.origin !== LOCAL_CUSTOMER_ORIGIN || url.username || url.password
      || !(Object.hasOwn(ENDPOINTS, url.pathname) || (purpose === 'context-switch'
        && url.pathname === '/api/v1/demo/session/context'))) return;
    const contextSwitch = url.pathname === '/api/v1/demo/session/context';
    if ((contextSwitch ? method !== 'PUT' : method !== 'GET')) return;
    if (entries.length === MAX_REQUESTS) { overflow = true; return; }
    let endpoint = contextSwitch ? 'context' : ENDPOINTS[url.pathname];
    if (purpose === 'csv-bootstrap' && endpoint === 'catalog') {
      const sections = url.searchParams.getAll('section');
      if (sections.length === 1 && CATALOG_SECTIONS.has(sections[0])) endpoint = `catalog.${sections[0]}`;
    }
    const entry = { sequence: entries.length + 1, endpoint, method, status: null, outcome: 'pending', durationMs: 0 };
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
    start() { entries = []; pending = new WeakMap(); overflow = false; active = true; },
    stop() { active = false; },
    snapshot() { return { overflow, requests: entries.map((entry) => ({ ...entry })) }; },
    dispose() {
      active = false;
      for (const [event, listener] of Object.entries(listeners)) page.off(event, listener);
    },
  });
}

