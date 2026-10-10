import { ACCEPTANCE_HEADER, acceptanceGateEnabled, requireAcceptanceAccess } from '../../tests/support/hosted-transport/acceptance-config.mjs';
import { getSecretGuardStatus, writeManagedSummary } from '../../tests/support/hosted-transport/redaction-guard.mjs';

const FORBIDDEN_OPTIONS = ['dispatcher', 'agent', 'proxy', 'rejectUnauthorized', 'ignoreHTTPSErrors'];

function fail(code = 'CM_ACCEPTANCE_REQUEST_REJECTED') { throw new Error(code); }

// The caller chooses a fixed, validated service when composing an operation.
// An injected fetch remains available for existing offline operation tests.
export function createHostedAcceptanceFetch({ origin, fetchImpl = fetch, env = process.env }) {
  if (typeof fetchImpl !== 'function') fail();
  if (!acceptanceGateEnabled(env)) return fetchImpl;
  const { token, expiresAt } = requireAcceptanceAccess(origin, env);
  return async (url, options = {}) => {
    let target;
    try { target = new URL(url); } catch { fail(); }
    if (typeof url !== 'string' || target.origin !== origin || target.username || target.password
      || target.hash || FORBIDDEN_OPTIONS.some((key) => options[key] !== undefined)
      || (options.redirect !== undefined && options.redirect !== 'error')) fail();
    const remaining = expiresAt - Date.now();
    if (remaining <= 0) fail('CM_ACCEPTANCE_DEADLINE_EXPIRED');
    const headers = new Headers(options.headers);
    if ([ACCEPTANCE_HEADER, 'host', 'proxy-authorization'].some((name) => headers.has(name))) fail();
    headers.set(ACCEPTANCE_HEADER, token);
    const deadline = AbortSignal.timeout(remaining);
    const signal = options.signal ? AbortSignal.any([options.signal, deadline]) : deadline;
    try {
      return await fetchImpl(url, { ...options, headers, redirect: 'error', signal });
    } catch { fail('CM_ACCEPTANCE_REQUEST_FAILED'); }
  };
}

// Gated CLIs persist only the guard's closed count schema, never remote payloads
// or exception causes. Existing textual evidence remains the ungated behavior.
export async function runHostedOperationCli(operation, { onSuccess = () => {}, failureCode }) {
  let passed = false;
  try {
    const result = await operation();
    if (!acceptanceGateEnabled()) onSuccess(result);
    passed = true;
  } catch {
    process.stderr.write(`${failureCode}\n`);
    process.exitCode = 1;
  }
  if (process.env.CM_DEMO_ACCEPTANCE_MODE === 'gate') {
    const { guardBlockedWrites } = getSecretGuardStatus();
    passed &&= guardBlockedWrites === 0;
    if (!passed) process.exitCode = 1;
    try {
      writeManagedSummary({ status: passed ? 'passed' : 'failed', total: 1,
        passed: passed ? 1 : 0, failed: passed ? 0 : 1, skipped: 0,
        interrupted: 0, timedOut: 0, guardBlockedWrites });
    } catch { process.exitCode = 1; }
  }
}
