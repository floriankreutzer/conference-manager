import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const PROXY_PATH = 'scripts/serve-hosted-demo-e2e.mjs';
const DIAGNOSTIC_PATH = 'scripts/read-hosted-demo-reset-evidence.mjs';
const WORKFLOW_PATH = '.github/workflows/hosted-demo-acceptance.yml';

test('hosted Demo proxy stays fixed-origin and outlives the bounded reset request', () => {
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
});

test('hosted reset diagnostic reads only fixed Platform audit evidence and never logs session material', () => {
  const source = readFileSync(DIAGNOSTIC_PATH, 'utf8');
  assert.match(source, /const PLATFORM_ORIGIN = 'https:\/\/conference-manager-ops-demo\.onrender\.com';/);
  assert.match(source, /HOSTED_ACCEPTANCE_STARTED_AT/);
  assert.match(source, /platform\.recovery\.executed/);
  assert.match(source, /item\?\.metadata\?\.operation === 'reset'/);
  assert.match(source, /reset_failure_reason=/);
  assert.match(source, /reset_failure_correlation_id=/);
  assert.match(source, /reset_failure_occurred_at=/);
  assert.doesNotMatch(source, /process\.env\..*(?:ORIGIN|TARGET|UPSTREAM|DESTINATION|URL)/);
  assert.doesNotMatch(source, /process\.stdout\.write\([^\n]*(?:cookie|csrf|session)/i);
  assert.doesNotMatch(source, /console\.(?:log|info|debug|warn|error)/);
});

test('hosted acceptance diagnoses, cleans up, preserves evidence, and fails after a failed journey', () => {
  const workflow = readFileSync(WORKFLOW_PATH, 'utf8');
  const journeyIndex = workflow.indexOf('name: Run hosted cross-role Demo journey');
  const diagnosticIndex = workflow.indexOf('name: Record bounded reset failure audit evidence');
  const cleanupIndex = workflow.indexOf('name: Restore public Demo baseline after failed journey');
  const uploadIndex = workflow.indexOf('name: Upload hosted Demo evidence');
  const enforcementIndex = workflow.indexOf('name: Enforce hosted journey result');

  assert.ok(
    journeyIndex >= 0
      && diagnosticIndex > journeyIndex
      && cleanupIndex > diagnosticIndex
      && uploadIndex > cleanupIndex
      && enforcementIndex > uploadIndex,
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
    /name: Enforce hosted journey result\n\s+if: always\(\) && steps\.hosted_journey\.outcome == 'failure'\n\s+run: exit 1/,
  );
});
