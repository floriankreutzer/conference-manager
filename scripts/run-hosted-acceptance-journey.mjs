import { spawn } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// The launcher loads no application, Playwright, configuration or token-bearing
// transport module. The child installs the guard before all of those imports.
const root = fileURLToPath(new URL('../', import.meta.url));
const unsafe = ['DEBUG', 'PWDEBUG', 'NODE_DEBUG', 'DEBUG_FILE', 'PW_RUNNER_DEBUG', 'SSLKEYLOGFILE', 'NODE_OPTIONS',
  'NODE_TLS_REJECT_UNAUTHORIZED', 'PW_TEST_CONNECT_WS_ENDPOINT', 'PW_TEST_CONNECT_HEADERS'];

async function main() {
  const env = process.env;
  const expiresAt = Date.parse(env.CM_DEMO_ACCEPTANCE_EXPIRES_AT);
  const remaining = expiresAt - Date.now();
  const started = Number(env.HOSTED_JOB_STARTED_EPOCH) * 1000;
  if (process.argv.length !== 2 || env.CM_DEMO_ACCEPTANCE_MODE !== 'gate'
    || unsafe.some((key) => env[key] !== undefined)
    || !Number.isFinite(expiresAt) || new Date(expiresAt).toISOString() !== env.CM_DEMO_ACCEPTANCE_EXPIRES_AT
    || remaining <= 0 || remaining > 5_400_000 || !Number.isSafeInteger(started) || started <= 0
    || env.HOSTED_JOB_BUDGET_SECONDS !== '4800' || env.HOSTED_DESTRUCTIVE_RESERVE_SECONDS !== '4200') throw new Error('rejected');
  const timeoutMs = Math.min(expiresAt, started + 4_800_000) - Date.now();
  if (timeoutMs <= 0) throw new Error('rejected');
  const directory = await mkdtemp(path.join(root, 'acceptance-evidence-journey-'));
  const summary = path.join(directory, 'summary.json');
  const guard = path.join(root, 'tests/support/hosted-transport/redaction-guard.mjs');
  const script = path.join(root, 'scripts/support/hosted-acceptance-journey.mjs');
  const child = spawn(process.execPath, ['--import', guard, script], {
    cwd: root, detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...env,
      HOSTED_ACCEPTANCE_STARTED_AT: new Date().toISOString(),
      CM_ACCEPTANCE_ARTIFACT_ROOT: directory, CM_ACCEPTANCE_SUMMARY_PATH: summary },
  });
  let unexpectedOutput = 0;
  let forcedKill;
  let terminated = false;
  function signal(groupSignal) {
    if (!child.pid) return;
    try { process.kill(-child.pid, groupSignal); } catch { child.kill(groupSignal); }
  }
  function terminate() {
    terminated = true;
    signal('SIGTERM');
    forcedKill ||= setTimeout(() => signal('SIGKILL'), 5_000);
    forcedKill.unref();
  }
  const timeout = setTimeout(terminate, timeoutMs);
  timeout.unref();
  process.once('SIGTERM', terminate);
  process.once('SIGINT', terminate);
  for (const stream of [child.stdout, child.stderr]) stream.on('data', (chunk) => {
    unexpectedOutput += chunk.length;
    if (unexpectedOutput > 1_048_576) terminate();
  });
  const exitCode = await new Promise((resolve) => {
    child.once('error', () => resolve(1)); child.once('exit', (code) => resolve(code));
  });
  clearTimeout(timeout); clearTimeout(forcedKill);
  signal('SIGKILL');
  process.removeListener('SIGTERM', terminate);
  process.removeListener('SIGINT', terminate);
  const bytes = await readFile(summary);
  if (bytes.length > 8192) throw new Error('rejected');
  const result = JSON.parse(bytes.toString('utf8'));
  if (terminated || exitCode !== 0 || unexpectedOutput !== 0 || result.status !== 'passed'
    || result.total !== 1 || result.passed !== 1 || result.failed !== 0 || result.skipped !== 0
    || result.interrupted !== 0 || result.timedOut !== 0 || result.guardBlockedWrites !== 0) throw new Error('rejected');
  process.stdout.write('CM_ACCEPTANCE_JOURNEY_PASSED\n');
}

try { await main(); }
catch {
  process.stderr.write('CM_ACCEPTANCE_JOURNEY_FAILED\n');
  process.exitCode = 1;
}
