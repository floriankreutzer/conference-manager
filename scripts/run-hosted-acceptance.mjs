import { spawn } from 'node:child_process';
import { mkdtemp, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// Intentionally no secret/config imports before the guarded child starts.
// The child preloads the guard before importing Playwright or any config.
const root = fileURLToPath(new URL('../', import.meta.url));
const combinations = {
  shared: ['playwright.hosted-demo.config.js'], saas37: ['playwright.saas37.config.js'],
  'shared-chromium': ['playwright.hosted-demo.config.js', 'chromium-hosted-demo'],
  'shared-webkit': ['playwright.hosted-demo.config.js', 'webkit-hosted-demo'],
  'saas37-chromium': ['playwright.saas37.config.js', 'chromium-shared-demo'],
  'saas37-webkit': ['playwright.saas37.config.js', 'webkit-shared-demo'],
};
const unsafe = ['DEBUG', 'PWDEBUG', 'NODE_DEBUG', 'DEBUG_FILE', 'PW_RUNNER_DEBUG', 'SSLKEYLOGFILE', 'NODE_OPTIONS',
  'NODE_TLS_REJECT_UNAUTHORIZED', 'PW_TEST_CONNECT_WS_ENDPOINT', 'PW_TEST_CONNECT_HEADERS',
  'PLAYWRIGHT_DISABLE_FORCED_CHROMIUM_PROXIED_LOOPBACK', 'PLAYWRIGHT_PROXY_BYPASS_FOR_TESTING'];

export async function runManagedAcceptance({ target, env = process.env }) {
  const selected = combinations[target];
  if (!selected || env.CM_DEMO_ACCEPTANCE_MODE !== 'gate') throw new Error('CM_ACCEPTANCE_RUNNER_ARGUMENT_REJECTED');
  if (unsafe.some((name) => env[name] !== undefined)) throw new Error('CM_ACCEPTANCE_DIAGNOSTICS_REJECTED');
  for (const module of ['playwright', 'playwright-core', '@playwright/test']) {
    const version = JSON.parse(await readFile(path.join(root, 'node_modules', module, 'package.json'), 'utf8')).version;
    if (version !== '1.63.0') throw new Error('CM_ACCEPTANCE_PLAYWRIGHT_VERSION_REJECTED');
  }
  const expiresAt = Date.parse(env.CM_DEMO_ACCEPTANCE_EXPIRES_AT);
  const remaining = expiresAt - Date.now();
  if (!Number.isFinite(expiresAt) || remaining <= 0 || remaining > 5_400_000) throw new Error('CM_ACCEPTANCE_DEADLINE_REJECTED');
  const directory = await mkdtemp(path.join(env.CM_ACCEPTANCE_ARTIFACT_ROOT || root, 'acceptance-evidence-'));
  const summary = path.join(directory, 'summary.json');
  const guard = fileURLToPath(new URL('../tests/support/hosted-transport/redaction-guard.mjs', import.meta.url));
  const reporter = fileURLToPath(new URL('../tests/support/hosted-transport/safe-reporter.mjs', import.meta.url));
  const cli = fileURLToPath(new URL('../node_modules/playwright/cli.js', import.meta.url));
  const args = ['--import', guard, cli, 'test', '--config', 'scripts/managed-acceptance.config.mjs',
    '--reporter', reporter, '--output', path.join(directory, 'test-results')];
  if (selected[1]) args.push('--project', selected[1]);
  const child = spawn(process.execPath, args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], env: { ...env,
    CM_ACCEPTANCE_ARTIFACT_ROOT: directory, CM_ACCEPTANCE_SUMMARY_PATH: summary, CM_ACCEPTANCE_RUNNER_TARGET: target } });
  let unexpectedOutput = 0;
  let forcedKill;
  function terminate() {
    child.kill('SIGTERM'); forcedKill ||= setTimeout(() => child.kill('SIGKILL'), 5_000); forcedKill.unref();
  }
  const deadline = setTimeout(terminate, remaining); deadline.unref();
  for (const stream of [child.stdout, child.stderr]) stream.on('data', (chunk) => {
    unexpectedOutput += chunk.length;
    if (unexpectedOutput > 1_048_576) terminate();
  });
  const exitCode = await new Promise((resolve) => {
    child.once('error', () => resolve(1)); child.once('exit', (code) => resolve(code));
  });
  clearTimeout(deadline); clearTimeout(forcedKill);
  let passed = false;
  try {
    const bytes = await readFile(summary);
    if (bytes.length > 8192) throw new Error('invalid');
    const result = JSON.parse(bytes.toString());
    const expectedPassed = target === 'shared' ? 4 : target === 'saas37' ? 2 : target.startsWith('shared') ? 2 : 1;
    const expectedSkipped = target === 'shared' ? 2 : target.startsWith('shared') ? 1 : 0;
    passed = exitCode === 0 && unexpectedOutput === 0 && result.status === 'passed'
      && result.guardBlockedWrites === 0
      && result.failed === 0 && result.interrupted === 0 && result.timedOut === 0
      && result.passed === expectedPassed && result.skipped === expectedSkipped && result.total === expectedPassed + expectedSkipped;
  } catch { passed = false; }
  return Object.freeze({ status: passed ? 'passed' : 'failed', evidenceDirectory: directory, summaryPath: summary });
}

if (process.argv[1] && import.meta.url === pathToFileURL(path.resolve(process.argv[1])).href) {
  try {
    if (process.argv.length !== 3) throw new Error('CM_ACCEPTANCE_RUNNER_ARGUMENT_REJECTED');
    const result = await runManagedAcceptance({ target: process.argv[2] });
    console.log(result.status === 'passed' ? 'CM_ACCEPTANCE_RUN_PASSED' : 'CM_ACCEPTANCE_RUN_FAILED');
    process.exitCode = result.status === 'passed' ? 0 : 1;
  } catch {
    console.error('CM_ACCEPTANCE_RUN_FAILED'); process.exitCode = 1;
  }
}
