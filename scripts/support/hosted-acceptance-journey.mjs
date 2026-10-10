import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { requireAcceptanceAccess } from '../../tests/support/hosted-transport/acceptance-config.mjs';
import { createHostedAcceptanceFetch, runHostedOperationCli } from './hosted-acceptance-fetch.mjs';
import { verifyHostedDemoDeployment } from '../verify-hosted-demo-deployment.mjs';
import { resetHostedDemoBaseline } from '../reset-hosted-demo-baseline.mjs';
import { runManagedAcceptance } from '../run-hosted-acceptance.mjs';
import { readHostedDemoResetEvidence } from '../read-hosted-demo-reset-evidence.mjs';
import { writeManagedJourneyEvidence } from '../../tests/support/hosted-transport/redaction-guard.mjs';

const CUSTOMER = 'https://conference-manager-demo.onrender.com';
const PLATFORM = 'https://conference-manager-ops-demo.onrender.com';
const CLEANUP_RESERVE_MS = 4_200_000;
const JOB_BUDGET_MS = 4_800_000;
const READINESS_BUDGET_MS = 360_000;

function failure(code) { throw new Error(code); }

export async function waitHostedReadiness({ fetchImpl = fetch, env = process.env,
  now = Date.now, sleep = delay } = {}) {
  const services = [
    [CUSTOMER, '/api/v1/health/ready'], [PLATFORM, '/api/v1/platform/health/ready'],
  ].map(([origin, endpoint]) => ({ url: origin + endpoint,
    request: createHostedAcceptanceFetch({ origin, fetchImpl, env }) }));
  const deadline = Math.min(now() + READINESS_BUDGET_MS, Date.parse(env.CM_DEMO_ACCEPTANCE_EXPIRES_AT));
  while (now() < deadline) {
    const statuses = [];
    for (const service of services) {
      try {
        const response = await service.request(service.url, { redirect: 'error', signal: AbortSignal.timeout(10_000) });
        statuses.push(response.status);
        await response.body?.cancel();
      } catch { statuses.push(0); }
    }
    if (statuses.every((status) => status === 200)) return;
    if (now() < deadline) await sleep(Math.min(5_000, deadline - now()));
  }
  failure('CM_ACCEPTANCE_READINESS_FAILED');
}

export function requireJourneyReserve({ env = process.env, now = Date.now } = {}) {
  const expiresAt = Date.parse(env.CM_DEMO_ACCEPTANCE_EXPIRES_AT);
  const started = Number(env.HOSTED_JOB_STARTED_EPOCH) * 1000;
  const current = now();
  if (!/^\d{1,20}$/.test(env.HOSTED_JOB_STARTED_EPOCH || '')
    || env.HOSTED_JOB_BUDGET_SECONDS !== '4800' || env.HOSTED_DESTRUCTIVE_RESERVE_SECONDS !== '4200'
    || !Number.isSafeInteger(started) || started <= 0 || started > current
    || !Number.isFinite(expiresAt) || expiresAt - current < CLEANUP_RESERVE_MS
    || started + JOB_BUDGET_MS - current < CLEANUP_RESERVE_MS) failure('CM_ACCEPTANCE_RESERVE_REJECTED');
}

async function readResetCorrelation(directory) {
  if (!directory) return null;
  let bytes;
  try { bytes = await readFile(path.join(directory, 'reset-correlation.json')); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  if (bytes.length > 1024) failure('CM_ACCEPTANCE_CORRELATION_REJECTED');
  const value = JSON.parse(bytes.toString('utf8'));
  if (!value || Object.keys(value).join(',') !== 'requestId'
    || !/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value.requestId || '')) failure('CM_ACCEPTANCE_CORRELATION_REJECTED');
  return value.requestId;
}

// Dependency injection exists only for deterministic offline stage-order tests.
// Production composes the two exact hosted origins and unchanged suite configs.
export async function runHostedAcceptanceJourney({ env = process.env, now = Date.now,
  validateAccess = requireAcceptanceAccess, readiness = waitHostedReadiness,
  verify = verifyHostedDemoDeployment, reset = resetHostedDemoBaseline,
  runSuite = runManagedAcceptance, diagnose = readHostedDemoResetEvidence,
  correlation = readResetCorrelation, recordEvidence = writeManagedJourneyEvidence } = {}) {
  const phases = { schemaVersion: 1, readiness: 'not_started', initialIdentity: 'not_started',
    reserve: 'not_started', shared: 'not_started', scenarios: 'not_started', cleanup: 'not_started',
    finalIdentity: 'not_started', resetAudit: 'not_started' };
  async function stage(name, operation) {
    phases[name] = 'failed';
    const result = await operation();
    phases[name] = 'passed';
    return result;
  }
  let destructiveStarted = false;
  let sharedResult;
  try {
    validateAccess(CUSTOMER, env);
    validateAccess(PLATFORM, env);
    await stage('readiness', () => readiness({ env }));
    await stage('initialIdentity', () => verify({ env }));
    await stage('reserve', () => requireJourneyReserve({ env, now }));
    destructiveStarted = true;
    await stage('shared', async () => {
      sharedResult = await runSuite({ target: 'shared', env });
      if (sharedResult.status !== 'passed') failure('CM_ACCEPTANCE_SHARED_FAILED');
    });
    await stage('scenarios', async () => {
      const scenarios = await runSuite({ target: 'saas37', env });
      if (scenarios.status !== 'passed') failure('CM_ACCEPTANCE_SCENARIOS_FAILED');
    });
  } catch { /* Closed phase evidence records the failure without remote text. */ }
  finally {
    if (destructiveStarted) {
      // Independently attempt diagnostics, both canonical resets and identity.
      // The immutable deadline never grants cleanup additional authority.
      if (phases.shared !== 'passed') {
        phases.resetAudit = 'failed';
        try {
          const evidence = await diagnose({ env, requestId: await correlation(sharedResult?.evidenceDirectory) });
          if (typeof evidence?.available !== 'boolean') failure('CM_ACCEPTANCE_AUDIT_REJECTED');
          phases.resetAudit = evidence.available ? 'matched' : 'unavailable';
        } catch { /* Cleanup remains mandatory. */ }
      }
      try { await stage('cleanup', () => reset({ env })); } catch { /* Keep independent identity attempt. */ }
      try { await stage('finalIdentity', () => verify({ env })); } catch { /* Persist the failed phase. */ }
    }
    recordEvidence(Object.freeze({ ...phases }));
  }
  const journeyPassed = phases.shared === 'passed' && phases.scenarios === 'passed';
  const cleanupPassed = phases.cleanup === 'passed';
  const identityPassed = phases.finalIdentity === 'passed';
  if (!journeyPassed || !cleanupPassed || !identityPassed) failure('CM_ACCEPTANCE_JOURNEY_FAILED');
  return Object.freeze({ journeyPassed, cleanupPassed, identityPassed });
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await runHostedOperationCli(() => runHostedAcceptanceJourney(), { failureCode: 'CM_ACCEPTANCE_JOURNEY_FAILED' });
}
