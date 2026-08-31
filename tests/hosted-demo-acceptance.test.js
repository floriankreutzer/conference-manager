import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const PROXY_PATH = 'scripts/serve-hosted-demo-e2e.mjs';
const DIAGNOSTIC_PATH = 'scripts/read-hosted-demo-reset-evidence.mjs';
const VERIFY_PATH = 'scripts/verify-hosted-demo-deployment.mjs';
const RESET_PATH = 'scripts/reset-hosted-demo-baseline.mjs';
const WORKFLOW_PATH = '.github/workflows/hosted-demo-acceptance.yml';

test('hosted Demo proxy stays fixed-origin, outlives reset, and captures only failed reset correlation', () => {
  const source = readFileSync(PROXY_PATH, 'utf8');
  const timeout = source.match(/const UPSTREAM_TIMEOUT_MS = ([\d_]+);/);
  assert.ok(timeout, 'Hosted proxy must declare one explicit upstream timeout');
  const timeoutMs = Number(timeout[1].replaceAll('_', ''));
  assert.ok(timeoutMs > 60_000, 'Hosted proxy must not mask the bounded 60-second reset budget');
  assert.ok(timeoutMs <= 90_000, 'Hosted proxy timeout must remain bounded');
  assert.match(source, /upstream\.setTimeout\(UPSTREAM_TIMEOUT_MS,/);

  assert.match(source, /new URL\('https:\/\/conference-manager-demo\.onrender\.com'\)/);
  assert.match(source, /new URL\('https:\/\/conference-manager-ops-demo\.onrender\.com'\)/);
  assert.match(source, /if \(value !== expected\.origin\) throw new TypeError/);
  assert.doesNotMatch(source, /process\.env\.(?:TARGET|UPSTREAM|DESTINATION|URL)/);

  assert.match(source, /const PLATFORM_RESET_PATH = '\/api\/v1\/platform\/demo\/reset';/);
  assert.match(source, /host !== PLATFORM_HOST/);
  assert.match(source, /request\.method !== 'POST'/);
  assert.match(source, /request\.url !== PLATFORM_RESET_PATH/);
  assert.match(source, /\(upstreamResponse\.statusCode \|\| 0\) < 500/);
  assert.match(source, /headers\['x-request-id'\]/);
  assert.match(source, /hostedResetRequestIdPath\(\)/);
  assert.match(source, /flag: 'wx'/);
});

test('hosted evidence network requests remain bounded before or after cleanup', () => {
  const diagnostic = readFileSync(DIAGNOSTIC_PATH, 'utf8');
  const verifier = readFileSync(VERIFY_PATH, 'utf8');
  const reset = readFileSync(RESET_PATH, 'utf8');

  assert.match(diagnostic, /const DIAGNOSTIC_TIMEOUT_MS = 20_000;/);
  assert.match(diagnostic, /signal: AbortSignal\.timeout\(DIAGNOSTIC_TIMEOUT_MS\)/);
  assert.match(verifier, /const METADATA_TIMEOUT_MS = 20_000;/);
  assert.match(verifier, /signal: AbortSignal\.timeout\(METADATA_TIMEOUT_MS\)/);
  assert.match(reset, /const SESSION_TIMEOUT_MS = 20_000;/);
  assert.match(reset, /const RESET_TIMEOUT_MS = 75_000;/);
  assert.match(reset, /signal: AbortSignal\.timeout\(timeoutMs\)/);
});

test('hosted workflow reserves cleanup time before any destructive journey', () => {
  const workflow = readFileSync(WORKFLOW_PATH, 'utf8');

  assert.match(workflow, /HOSTED_JOB_BUDGET_SECONDS: '1800'/);
  assert.match(workflow, /HOSTED_DESTRUCTIVE_RESERVE_SECONDS: '900'/);
  assert.match(workflow, /HOSTED_READINESS_BUDGET_SECONDS: '360'/);
  assert.match(workflow, /timeout-minutes: 30/);
  assert.match(
    workflow,
    /name: Record hosted job budget start[\s\S]*HOSTED_JOB_STARTED_EPOCH=\$\(date -u \+%s\)/,
  );
  assert.match(
    workflow,
    /deadline=\$\(\( \$\(date -u \+%s\) \+ HOSTED_READINESS_BUDGET_SECONDS \)\)/,
  );
  assert.match(workflow, /--max-time 10/);
  assert.match(
    workflow,
    /latest_start=\$\(\( HOSTED_JOB_BUDGET_SECONDS - HOSTED_DESTRUCTIVE_RESERVE_SECONDS \)\)/,
  );
  assert.match(workflow, /if \(\( elapsed > latest_start \)\); then/);
  assert.match(workflow, /cleanup_reserve_seconds=\$HOSTED_DESTRUCTIVE_RESERVE_SECONDS/);

  const reserveIndex = workflow.indexOf('name: Require destructive cleanup reserve');
  const journeyIndex = workflow.indexOf('name: Run hosted cross-role Demo journey');
  assert.ok(reserveIndex >= 0 && journeyIndex > reserveIndex);
});

test('hosted reset diagnostic correlates exact failed request and never logs session material', () => {
  const source = readFileSync(DIAGNOSTIC_PATH, 'utf8');
  assert.match(source, /const PLATFORM_ORIGIN = 'https:\/\/conference-manager-ops-demo\.onrender\.com';/);
  assert.match(source, /HOSTED_ACCEPTANCE_STARTED_AT/);
  assert.match(source, /hostedResetRequestIdPath\(\)/);
  assert.match(source, /const resetRequestId = await expectedResetRequestId\(\);/);
  assert.match(source, /platform\.recovery\.executed/);
  assert.match(source, /item\?\.metadata\?\.operation === 'reset'/);
  assert.match(source, /item\?\.correlationId === resetRequestId/);
  assert.match(source, /reset_failure_reason=/);
  assert.match(source, /reset_failure_correlation_id=/);
  assert.match(source, /reset_failure_occurred_at=/);
  assert.doesNotMatch(source, /process\.env\..*(?:ORIGIN|TARGET|UPSTREAM|DESTINATION|URL)/);
  assert.doesNotMatch(source, /process\.stdout\.write\([^\n]*(?:cookie|csrf|session)/i);
  assert.doesNotMatch(source, /console\.(?:log|info|debug|warn|error)/);
});

test('hosted acceptance captures bounded reset evidence, restores, then performs post-journey checks', () => {
  const workflow = readFileSync(WORKFLOW_PATH, 'utf8');
  const preIdentityIndex = workflow.indexOf('name: Verify live deployment identity before journey');
  const reserveIndex = workflow.indexOf('name: Require destructive cleanup reserve');
  const journeyIndex = workflow.indexOf('name: Run hosted cross-role Demo journey');
  const diagnosticIndex = workflow.indexOf('name: Record bounded reset failure audit evidence');
  const cleanupIndex = workflow.indexOf('name: Restore public Demo baseline after failed journey');
  const postIdentityIndex = workflow.indexOf('name: Re-verify live deployment identity after journey and cleanup');
  const uploadIndex = workflow.indexOf('name: Upload hosted Demo evidence');
  const enforcementIndex = workflow.indexOf('name: Enforce hosted journey result');

  assert.ok(
    preIdentityIndex >= 0
      && reserveIndex > preIdentityIndex
      && journeyIndex > reserveIndex
      && diagnosticIndex > journeyIndex
      && cleanupIndex > diagnosticIndex
      && postIdentityIndex > cleanupIndex
      && uploadIndex > postIdentityIndex
      && enforcementIndex > uploadIndex,
  );
  assert.match(workflow, /- 'tests\/e2e-shared\/\*\*'/);
  assert.match(
    workflow,
    /name: Verify live deployment identity before journey\n\s+id: pre_identity\n\s+run: node scripts\/verify-hosted-demo-deployment\.mjs >> hosted-demo-evidence\.txt/,
  );
  assert.match(
    workflow,
    /name: Run hosted cross-role Demo journey\n\s+id: hosted_journey\n\s+continue-on-error: true/,
  );
  assert.match(
    workflow,
    /name: Record bounded reset failure audit evidence\n\s+if: always\(\) && steps\.hosted_journey\.outcome == 'failure'/,
  );
  assert.match(workflow, /node scripts\/read-hosted-demo-reset-evidence\.mjs >> hosted-demo-evidence\.txt/);
  assert.match(
    workflow,
    /name: Restore public Demo baseline after failed journey\n\s+if: always\(\) && steps\.hosted_journey\.outcome == 'failure'\n\s+run: node scripts\/reset-hosted-demo-baseline\.mjs >> hosted-demo-evidence\.txt/,
  );
  assert.match(
    workflow,
    /name: Re-verify live deployment identity after journey and cleanup\n\s+if: always\(\) && steps\.pre_identity\.outcome == 'success' && steps\.hosted_journey\.outcome != 'skipped'/,
  );
  assert.match(workflow, /node scripts\/verify-hosted-demo-deployment\.mjs >\/dev\/null/);
  assert.match(workflow, /echo "deployment_identity_stable=true" >> hosted-demo-evidence\.txt/);
  assert.match(
    workflow,
    /name: Enforce hosted journey result\n\s+if: always\(\) && steps\.hosted_journey\.outcome == 'failure'\n\s+run: exit 1/,
  );
});

test('hosted cleanup requires two matching deterministic reset checksums', () => {
  const source = readFileSync(RESET_PATH, 'utf8');
  assert.match(source, /const firstChecksum = await performReset\(fetchImpl, targetOrigin\);/);
  assert.match(source, /const secondChecksum = await performReset\(fetchImpl, targetOrigin\);/);
  assert.match(source, /if \(secondChecksum !== firstChecksum\)/);
  assert.match(source, /HOSTED_DEMO_RESET_REPEATABILITY_INVALID/);
  assert.match(source, /cleanup_repeatable=true/);
});
