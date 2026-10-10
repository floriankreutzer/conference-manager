import fs from 'node:fs';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { syncBuiltinESMExports } from 'node:module';

// Explicit, process-local protection for reviewed Playwright 1.63 runners. This
// is not a sandbox for arbitrary test code, native browser downloads or profiles.
const original = {
  realpath: fs.realpathSync.native,
  exists: fs.existsSync,
  writeFile: fs.writeFileSync,
};
const CHECKSUM = '7e22005f1e9689fbea4ccfc75084f5f3d224fe10e60a6af23c1cb600f2b70014';
const STATUSES = ['passed', 'failed', 'timedout', 'interrupted'];
const COUNTS = ['total', 'passed', 'failed', 'skipped', 'interrupted', 'timedOut', 'guardBlockedWrites'];
const PROJECTS = ['chromium-hosted-demo', 'webkit-hosted-demo', 'chromium-shared-demo', 'webkit-shared-demo'];
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/;
const RESET_REASONS = ['gate_failed', 'transaction_failed', 'transaction_lock_failed', 'preconditions_failed',
  'authority_failed', 'media_registration_failed', 'truncate_failed', 'audit_chain_failed', 'business_seed_failed',
  'provider_seed_failed', 'persona_seed_failed', 'semantic_read_failed', 'semantic_checksum_failed', 'success_audit_failed', 'reset_failed'];
const UNSAFE_ENV = ['DEBUG', 'PWDEBUG', 'PW_RUNNER_DEBUG', 'NODE_DEBUG', 'DEBUG_FILE', 'SSLKEYLOGFILE',
  'NODE_OPTIONS', 'NODE_TLS_REJECT_UNAUTHORIZED', 'PW_TEST_CONNECT_WS_ENDPOINT', 'PW_TEST_CONNECT_HEADERS',
  'PLAYWRIGHT_DISABLE_FORCED_CHROMIUM_PROXIED_LOOPBACK', 'PLAYWRIGHT_PROXY_BYPASS_FOR_TESTING'];
let state;
const preloadPath = fileURLToPath(import.meta.url);
const earlyPreload = process.execArgv.some((argument, index, args) => {
  const value = argument === '--import' ? args[index + 1] : argument.startsWith('--import=') ? argument.slice(9) : undefined;
  if (!value) return false;
  try { return (value.startsWith('file:') ? fileURLToPath(value) : path.resolve(value)) === preloadPath; }
  catch { return false; }
});

function reject(code = 'CM_ACCEPTANCE_ARTIFACT_REJECTED') { throw new Error(code); }
function keysEqual(object, keys) {
  return object !== null && typeof object === 'object' && !Array.isArray(object)
    && Object.keys(object).sort().join('\0') === [...keys].sort().join('\0');
}
function tokensValid(tokens) {
  return Array.isArray(tokens) && tokens.length >= 1 && tokens.length <= 2
    && tokens.every((token) => typeof token === 'string' && /^[a-f0-9]{64}$/.test(token))
    && new Set(tokens).size === tokens.length;
}
function hasSecret(value) { return state?.tokens.some((token) => value.includes(token)) ?? false; }
function lexical(value) {
  if (value instanceof URL) value = fileURLToPath(value);
  if (Buffer.isBuffer(value)) value = value.toString('utf8');
  if (typeof value !== 'string') reject();
  return path.resolve(value);
}
function canonical(value) {
  const absolute = lexical(value);
  let existing = absolute;
  while (!original.exists(existing)) {
    const parent = path.dirname(existing);
    if (parent === existing) reject();
    existing = parent;
  }
  return path.resolve(original.realpath(existing), path.relative(existing, absolute));
}
function managed(value) {
  if (typeof value === 'number') return false;
  return [lexical(value), canonical(value)].some((target) => state.roots.some((root) => target === root || target.startsWith(`${root}${path.sep}`)));
}
function privateWrite(file, body) {
  state.safeWriting = true;
  try { original.writeFile(file, body, { encoding: 'utf8', mode: 0o600, flag: 'wx' }); }
  finally { state.safeWriting = false; }
}
function block() {
  state.blockedWrites += 1;
  try { privateWrite(path.join(state.roots[0], `.guard-violation-${process.pid}-${state.blockedWrites}.json`), '{}\n'); }
  catch { process.exit(1); }
  reject();
}
function fixed(object, key, replacement) {
  // Playwright's bundled graceful-fs clones property descriptors and replaces
  // methods on the clone. Preserve the guarded getter through these assignments.
  Object.defineProperty(object, key, { configurable: false, enumerable: true,
    get() { return replacement; }, set(value) { if (typeof value !== 'function') reject('CM_ACCEPTANCE_SINK_REJECTED'); } });
  state.locks.push([object, key, replacement]);
}
function suppress(args) {
  state.suppressedOutputWrites += 1;
  const callback = args.at(-1);
  if (typeof callback === 'function') queueMicrotask(() => callback(null));
  return true;
}
function parseJson(data) {
  if (!(typeof data === 'string' || Buffer.isBuffer(data) || data instanceof Uint8Array)) reject();
  const buffer = Buffer.from(data);
  if (buffer.length > 8192) reject();
  const text = buffer.toString('utf8');
  if (!Buffer.from(text).equals(buffer) || hasSecret(text)) reject();
  try { return JSON.parse(text); } catch { reject(); }
}
function allowLastRun(file, data) {
  if (path.basename(canonical(file)) !== '.last-run.json') return false;
  const value = parseJson(data);
  return keysEqual(value, ['status', 'failedTests']) && STATUSES.includes(value.status)
    && Array.isArray(value.failedTests) && value.failedTests.length <= 1000
    && value.failedTests.every((id) => typeof id === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(id));
}
function protectFileMethod(object, name, paths, { writableOpen = false, lastRun = false } = {}) {
  const method = object[name];
  if (typeof method !== 'function') return;
  const promise = object === fsp;
  const check = (args) => {
    if (state.safeWriting) return 'ordinary';
    if (typeof args[0] === 'number' && [1, 2].includes(args[0])) return 'output';
    if (!paths.some((index) => managed(args[index]))) return 'ordinary';
    if (paths.some((index) => typeof args[index] !== 'number' && lexical(args[index]) !== canonical(args[index]))) block();
    if (writableOpen && (args[1] === 'r' || args[1] === fs.constants.O_RDONLY)) return 'ordinary';
    if (lastRun) { try { if (allowLastRun(args[0], args[1])) return 'lastRun'; } catch { block(); } }
    block();
  };
  fixed(object, name, promise ? async function (...args) {
    const kind = check(args);
    if (kind === 'output') { suppress(args); return undefined; }
    if (kind === 'lastRun') { privateWrite(canonical(args[0]), JSON.stringify(parseJson(args[1])) + '\n'); return undefined; }
    return method.apply(this, args);
  } : function (...args) {
    const kind = check(args);
    if (kind === 'output') { suppress(args); return undefined; }
    if (kind === 'lastRun') {
      privateWrite(canonical(args[0]), JSON.stringify(parseJson(args[1])) + '\n');
      const callback = args.at(-1);
      if (typeof callback === 'function') queueMicrotask(() => callback(null));
      return undefined;
    }
    return method.apply(this, args);
  });
}

export function installSecretGuard({ tokens, artifactRoots, summaryPath }) {
  if (state) { assertSecretGuardActive(tokens); return getSecretGuardStatus(); }
  if (UNSAFE_ENV.some((key) => process.env[key] !== undefined) || !tokensValid(tokens) || !Array.isArray(artifactRoots) || artifactRoots.length < 1
    || artifactRoots.length > 4 || artifactRoots.some((root) => typeof root !== 'string' || !path.isAbsolute(root))) reject('CM_ACCEPTANCE_GUARD_CONFIGURATION_REJECTED');
  const roots = artifactRoots.map(canonical);
  if (artifactRoots.some((root, index) => lexical(root) !== roots[index])) reject('CM_ACCEPTANCE_GUARD_CONFIGURATION_REJECTED');
  if (roots.some((root) => root === path.parse(root).root || !original.exists(root))) reject('CM_ACCEPTANCE_GUARD_CONFIGURATION_REJECTED');
  state = { tokens: [...tokens], roots, summaryPath: undefined, blockedWrites: 0, suppressedOutputWrites: 0, locks: [] };
  try {
    assertManagedArtifactPath(summaryPath);
    state.summaryPath = canonical(summaryPath);
  } catch { state = undefined; reject('CM_ACCEPTANCE_GUARD_CONFIGURATION_REJECTED'); }
  // Register before any Playwright/config import; syncBuiltinESMExports updates
  // named builtin imports too. Read APIs and unrelated compiler caches remain.
  for (const object of [fs, fsp]) {
    for (const name of ['writeFile', 'writeFileSync']) protectFileMethod(object, name, [0], { lastRun: true });
    for (const name of ['appendFile', 'appendFileSync', 'truncate', 'truncateSync', 'createWriteStream']) protectFileMethod(object, name, [0]);
    for (const name of ['copyFile', 'copyFileSync', 'cp', 'cpSync', 'rename', 'renameSync', 'link', 'linkSync', 'symlink', 'symlinkSync']) protectFileMethod(object, name, [0, 1]);
    for (const name of ['open', 'openSync']) protectFileMethod(object, name, [0], { writableOpen: true });
  }
  for (const name of ['write', 'writeSync', 'writev', 'writevSync']) {
    const method = fs[name];
    fixed(fs, name, function (...args) {
      if ([1, 2].includes(args[0])) { suppress(args); return 0; }
      return method.apply(this, args);
    });
  }
  for (const stream of [process.stdout, process.stderr]) {
    const replacement = function (...args) { return suppress(args); };
    // Playwright 1.63 replaces/restores these properties in workerProcessEntry
    // and runner/index. Accept its assignments without ever releasing the sink.
    Object.defineProperty(stream, 'write', { configurable: false,
      get() { return replacement; }, set(value) { if (typeof value !== 'function') reject('CM_ACCEPTANCE_OUTPUT_REJECTED'); } });
    state.locks.push([stream, 'write', replacement]);
  }
  syncBuiltinESMExports();
  // Node's fatal diagnostic printer can bypass JS stream.write. A fixed exit
  // prevents native uncaught-exception/rejection dumps in the managed process.
  process.on('uncaughtException', () => process.exit(1));
  process.on('unhandledRejection', () => process.exit(1));
  return getSecretGuardStatus();
}

export function assertSecretGuardActive(tokens) {
  if (!state || !earlyPreload || !tokensValid(tokens) || tokens.some((token) => !state.tokens.includes(token))
    || state.locks.some(([object, key, replacement]) => object[key] !== replacement)) reject('CM_ACCEPTANCE_GUARD_REQUIRED');
}
export function assertManagedArtifactPath(value) {
  if (!state || !managed(value) || lexical(value) !== canonical(value)) reject('CM_ACCEPTANCE_ARTIFACT_PATH_REJECTED');
  return canonical(value);
}
export function getSecretGuardStatus() {
  let count = 0;
  if (state) {
    for (const name of fs.readdirSync(state.roots[0])) {
      if (!/^\.guard-violation-\d+-\d+\.json$/.test(name)) continue;
      const file = path.join(state.roots[0], name);
      if (fs.lstatSync(file).isSymbolicLink() || fs.readFileSync(file, 'utf8') !== '{}\n') reject('CM_ACCEPTANCE_GUARD_STATE_REJECTED');
      count += 1;
    }
  }
  return Object.freeze({ active: Boolean(state), guardBlockedWrites: count,
    suppressedOutputWrites: state?.suppressedOutputWrites ?? 0 });
}
function persist(file, value) {
  const target = assertManagedArtifactPath(file);
  const body = JSON.stringify(value, null, 2) + '\n';
  if (hasSecret(body)) block();
  privateWrite(target, body);
}
export function writeManagedSummary(value) {
  if (!state || !keysEqual(value, ['status', ...COUNTS]) || !STATUSES.includes(value.status)
    || !COUNTS.every((key) => Number.isSafeInteger(value[key]) && value[key] >= 0 && value[key] <= 1_000_000)
    || value.guardBlockedWrites !== getSecretGuardStatus().guardBlockedWrites
    || (value.guardBlockedWrites > 0 && value.status === 'passed')) reject('CM_ACCEPTANCE_SUMMARY_REJECTED');
  persist(state.summaryPath, value);
}

function parseScenarioEvidence(attachment) {
  if (!keysEqual(attachment, ['name', 'body', 'contentType']) || attachment.name !== 'saas37-scenario-evidence'
    || attachment.contentType !== 'application/json') reject();
  const value = parseJson(attachment.body);
  if (!keysEqual(value, ['schemaVersion', 'browser', 'seedVersion', 'checksum', 'cycles', 'cleanupVerified'])
    || value.schemaVersion !== 1 || !PROJECTS.includes(value.browser)
    || value.seedVersion !== 'saas-3.7-three-demo-customers-v1' || value.checksum !== CHECKSUM
    || value.cleanupVerified !== true || !Array.isArray(value.cycles) || value.cycles.length !== 2) reject();
  const cycleKeys = ['cycle', 'northwindRooms', 'northwindSeedRequests', 'contosoTasksCompleted', 'fabrikamRoomsImported', 'allThreeRestored', 'checksum'];
  for (const [index, cycle] of value.cycles.entries()) {
    if (!keysEqual(cycle, cycleKeys) || cycle.cycle !== index + 1 || cycle.northwindRooms !== 10
      || cycle.northwindSeedRequests !== 20 || cycle.contosoTasksCompleted !== 7 || cycle.fabrikamRoomsImported !== 2
      || cycle.allThreeRestored !== true || cycle.checksum !== CHECKSUM) reject();
  }
  return value;
}
export function validateScenarioEvidence(attachment) {
  try { return parseScenarioEvidence(attachment); }
  catch { if (state) block(); reject(); }
}
export function writeManagedScenarioEvidence(attachment) {
  const value = validateScenarioEvidence(attachment);
  if (!state) reject('CM_ACCEPTANCE_GUARD_REQUIRED');
  persist(path.join(path.dirname(state.summaryPath), `scenario-${value.browser}.json`), value);
}

export function writeManagedResetCorrelation(value) {
  if (!state || !keysEqual(value, ['requestId']) || typeof value.requestId !== 'string' || !UUID.test(value.requestId)) reject('CM_ACCEPTANCE_RESET_EVIDENCE_REJECTED');
  persist(path.join(path.dirname(state.summaryPath), 'reset-correlation.json'), value);
}
export function writeManagedResetAudit(value) {
  if (!state || !keysEqual(value, ['reasonCode', 'correlationId', 'occurredAt'])) reject('CM_ACCEPTANCE_RESET_EVIDENCE_REJECTED');
  const unavailable = Object.values(value).every((item) => item === null);
  if (!unavailable && (!RESET_REASONS.includes(value.reasonCode)
    || typeof value.correlationId !== 'string' || !UUID.test(value.correlationId)
    || typeof value.occurredAt !== 'string' || !Number.isFinite(Date.parse(value.occurredAt))
    || new Date(value.occurredAt).toISOString() !== value.occurredAt)) reject('CM_ACCEPTANCE_RESET_EVIDENCE_REJECTED');
  persist(path.join(path.dirname(state.summaryPath), 'reset-audit.json'), value);
}

export function writeManagedJourneyEvidence(value) {
  const phases = ['readiness', 'initialIdentity', 'reserve', 'shared', 'scenarios', 'cleanup', 'finalIdentity'];
  if (!state || !keysEqual(value, ['schemaVersion', ...phases, 'resetAudit']) || value.schemaVersion !== 1
    || !phases.every((key) => ['not_started', 'passed', 'failed'].includes(value[key]))
    || !['not_started', 'unavailable', 'matched', 'failed'].includes(value.resetAudit)) reject('CM_ACCEPTANCE_JOURNEY_EVIDENCE_REJECTED');
  persist(path.join(path.dirname(state.summaryPath), 'journey-phases.json'), value);
}

// Explicit --import preloading is inherited by Playwright workers. Importing
// this module during an ordinary ungated test run has no process-wide effects.
if (process.env.CM_DEMO_ACCEPTANCE_MODE === 'gate' && earlyPreload) {
  installSecretGuard({
    tokens: [process.env.CM_DEMO_CUSTOMER_ACCEPTANCE_TOKEN, process.env.CM_DEMO_PLATFORM_ACCEPTANCE_TOKEN],
    artifactRoots: [process.env.CM_ACCEPTANCE_ARTIFACT_ROOT],
    summaryPath: process.env.CM_ACCEPTANCE_SUMMARY_PATH,
  });
}
