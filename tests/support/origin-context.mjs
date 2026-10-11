import { createTlsEgressProxy, validateOrigin } from './hosted-transport/tls-egress-proxy.mjs';
import { assertSecretGuardActive, assertManagedArtifactPath, validateScenarioEvidence,
  writeManagedResetCorrelation } from './hosted-transport/redaction-guard.mjs';
import { createRequire } from 'node:module';
import { ACCEPTANCE_HEADER, acceptanceGateEnabled, requireAcceptanceAccess } from './hosted-transport/acceptance-config.mjs';

export { ACCEPTANCE_HEADER, acceptanceGateEnabled };
const require = createRequire(import.meta.url);

function fail(code = 'CM_ACCEPTANCE_CONFIGURATION_REJECTED') { throw new Error(code); }

function gateAccess(origin) {
  const access = requireAcceptanceAccess(origin);
  const info = require('@playwright/test').test.info();
  const use = info.project.use;
  if (use.trace !== 'off' || use.screenshot !== 'off' || (use.video !== undefined && use.video !== 'off')
    || use.ignoreHTTPSErrors !== false
    || ['extraHTTPHeaders', 'recordHar', 'recordVideo', 'proxy', 'connectOptions'].some((key) => use[key] !== undefined)
    || (use.launchOptions !== undefined && Object.keys(use.launchOptions).length !== 0)) fail();
  assertManagedArtifactPath(info.outputDir);
  if (!protectedTestInfos.has(info)) {
    const attach = info.attach.bind(info);
    fixedMethod(info, 'attach', async (name, options) => {
      validateScenarioEvidence({ name, ...options }); return attach(name, options);
    });
    protectedTestInfos.add(info);
  }
  return access;
}
const protectedTestInfos = new WeakSet();

function validateContextOptions(options) {
  if (options.ignoreHTTPSErrors !== false || ['proxy', 'extraHTTPHeaders', 'recordHar', 'recordVideo',
    'logger', 'clientCertificates', 'baseURL', 'env', 'executablePath', 'ignoreDefaultArgs'].some((key) => options[key] !== undefined)) fail();
}

function deny() { fail('CM_ACCEPTANCE_DIAGNOSTICS_REJECTED'); }

function fixedMethod(object, name, value) {
  Object.defineProperty(object, name, { configurable: false, writable: false, value });
}

export function bindApiRequestContext(request, origin) {
  const fetch = request.fetch.bind(request);
  fixedMethod(request, 'fetch', async (url, options = {}) => {
    let target;
    try { target = new URL(url); } catch { fail('CM_ACCEPTANCE_ORIGIN_REJECTED'); }
    if (typeof url !== 'string' || target.origin !== origin || target.username || target.password) fail('CM_ACCEPTANCE_ORIGIN_REJECTED');
    if (options.ignoreHTTPSErrors === true || (options.maxRetries !== undefined && options.maxRetries !== 0)
      || Object.keys(options.headers || {}).some((name) => [ACCEPTANCE_HEADER, 'host', 'proxy-authorization'].includes(name.toLowerCase()))) fail();
    try {
      const response = await fetch(url, options);
      if (origin === 'https://conference-manager-ops-demo.onrender.com'
        && target.pathname === '/api/v1/platform/demo/reset' && target.search === ''
        && options.method?.toUpperCase() === 'POST' && response.status() >= 500) {
        const requestId = response.headers()['x-request-id'];
        if (!/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(requestId || '')) fail('CM_ACCEPTANCE_RESET_EVIDENCE_REJECTED');
        writeManagedResetCorrelation({ requestId });
      }
      return response;
    }
    catch { fail('CM_ACCEPTANCE_REQUEST_FAILED'); }
  });
  if (request.tracing) {
    fixedMethod(request.tracing, 'start', deny);
    fixedMethod(request.tracing, 'startChunk', deny);
  }
  return request;
}

function protectContext(context, origin, proxy) {
  for (const method of ['setExtraHTTPHeaders', 'route', 'routeFromHAR']) fixedMethod(context, method, deny);
  fixedMethod(context.tracing, 'start', deny);
  fixedMethod(context.tracing, 'startChunk', deny);
  bindApiRequestContext(context.request, origin);
  const protectedPages = new WeakSet();
  function protectPage(page) {
    if (protectedPages.has(page)) return page;
    protectedPages.add(page);
    for (const method of ['setExtraHTTPHeaders', 'route', 'routeFromHAR']) fixedMethod(page, method, deny);
    return page;
  }
  context.pages().forEach(protectPage);
  context.on('page', protectPage);
  const newPage = context.newPage.bind(context);
  fixedMethod(context, 'newPage', async () => protectPage(await newPage()));
  const close = context.close.bind(context);
  let proxyClosed;
  function closeProxy() { proxyClosed ||= proxy.close(); return proxyClosed; }
  context.once('close', () => { void closeProxy(); });
  fixedMethod(context, 'close', async (...args) => { try { return await close(...args); } finally { await closeProxy(); } });
  return context;
}

// The dependency seam is used only by isolated TLS tests; the public fixture
// below supplies fixed hosted origins and the built-in socket connector.
export async function createBoundContext(create, { origin, token, expiresAt, ...options }, dependencies = {}) {
  validateOrigin(origin);
  validateContextOptions(options);
  if (!/^[a-f0-9]{64}$/.test(token || '')) fail();
  assertSecretGuardActive([token]);
  const proxy = await createTlsEgressProxy({ origin, expiresAt, ...dependencies });
  try {
    const context = await create({ ...options, proxy: { server: proxy.server },
      extraHTTPHeaders: { [ACCEPTANCE_HEADER]: token } });
    return protectContext(context, origin, proxy);
  } catch { await proxy.close(); fail('CM_ACCEPTANCE_CONTEXT_FAILED'); }
}

export async function createOriginContext(browser, { origin, ...options }) {
  if (!acceptanceGateEnabled()) return browser.newContext(options);
  if (['token', 'expiresAt', 'connectSocket', 'handshakeTimeout', 'idleTimeout'].some((key) => Object.hasOwn(options, key))) fail();
  return createBoundContext((bound) => browser.newContext(bound), { ...options, origin, ...gateAccess(origin) });
}

export async function createOriginPersistentContext(browserType, profile, { origin, ...options }) {
  if (!acceptanceGateEnabled()) return browserType.launchPersistentContext(profile, options);
  if (['token', 'expiresAt', 'connectSocket', 'handshakeTimeout', 'idleTimeout'].some((key) => Object.hasOwn(options, key))) fail();
  if (options.ignoreDefaultArgs || options.args?.some((value) => /proxy|ignore-certificate|ignore-ssl|disable-web-security|remote-debugging|log-net-log/i.test(value))) fail();
  return createBoundContext((bound) => browserType.launchPersistentContext(profile, bound),
    { ...options, origin, ...gateAccess(origin) });
}
