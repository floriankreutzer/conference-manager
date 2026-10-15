import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { readPolicyRows, readSummaryPolicyRows, exactUrlUnionPattern } from '../scripts/validate-zap-report.mjs';

const dast = readFileSync(new URL('../.github/workflows/dast.yml', import.meta.url), 'utf8');
const hosted = readFileSync(new URL('../.github/workflows/hosted-demo-acceptance.yml', import.meta.url), 'utf8');

function pin(workflow, key) {
  const match = workflow.match(new RegExp(`^  ${key}: ([0-9a-f]{40})$`, 'm'));
  assert.ok(match, `${key} must pin a complete commit`);
  return match[1];
}

test('live DAST checks its exact deployed pair while manual Hosted acceptance binds the reviewed candidate', () => {
  assert.equal(pin(dast, 'EXPECTED_FRONTEND_REF'), 'ac0cd04281700636743e508335cd20c2325098a2');
  assert.equal(pin(hosted, 'EXPECTED_FRONTEND_REF'), '5d5102b4f9842ec704ff26441ebe96719324ddb0');
  assert.equal(pin(dast, 'EXPECTED_RUNTIME_REF'), '38a14b0435fb92bfacea319c5414c1fc10aab9eb');
  assert.equal(pin(hosted, 'EXPECTED_RUNTIME_REF'), '566402fd098c298ff09ec3230ddd0b55d4ea91f6');
  const identityStep = dast.indexOf('- name: Verify live candidate identity before DAST');
  const scanStep = dast.indexOf('- name: Run uncapped ZAP passive baseline');
  assert.ok(identityStep > 0 && scanStep > identityStep);
  const finalIdentityStep = dast.indexOf('- name: Verify live candidate identity after DAST');
  assert.ok(finalIdentityStep > scanStep);
  for (const step of [dast.slice(identityStep, dast.indexOf('\n      - name:', identityStep)),
    dast.slice(finalIdentityStep, dast.indexOf('\n      - name:', finalIdentityStep))]) {
    assert.match(step, /if: .*matrix.surface != 'static-launchpad'/);
    assert.match(step, /DAST_OPERATIONS_REQUIRED: '1'/);
    assert.match(step, /DAST_OPERATIONS_PASSWORD: \$\{\{ secrets.DAST_OPERATIONS_PASSWORD \}\}/);
    assert.match(step, /run: node scripts\/verify-hosted-demo-deployment.mjs/);
  }
  assert.match(dast, /pull_request:[\s\S]*?- \.github\/workflows\/hosted-demo-acceptance\.yml[\s\S]*?push:/);
  assert.match(dast, /push:[\s\S]*?- \.github\/workflows\/hosted-demo-acceptance\.yml[\s\S]*?schedule:/);
});

test('reviewed website CSP observation stays scoped to the authority-free launchpad', () => {
  const rows = readPolicyRows(readFileSync(new URL('../.zap/static-launchpad.tsv', import.meta.url), 'utf8'));
  const summary = readSummaryPolicyRows(readFileSync(new URL('../.zap/static-launchpad-summary.tsv', import.meta.url), 'utf8'));
  const risks = JSON.parse(readFileSync(new URL('../.zap/reviewed-alert-risks.json', import.meta.url), 'utf8'));
  const csp = rows.filter((row) => row.alertRef === '10038-1');
  assert.deepEqual(csp.map((row) => row.url), ['https://floriankreutzer.github.io/conference-manager-website/en/demo/']);
  assert.equal(risks.surfaces['static-launchpad'].maxRiskByAlertRef['10038-1'], 2);
  assert.equal(summary.find((row) => row.pluginId === '10038')?.pattern, exactUrlUnionPattern(csp.map((row) => row.url)));
  for (const surface of ['customer-demo', 'platform-demo']) {
    assert.equal(risks.surfaces[surface].maxRiskByAlertRef['10038-1'], undefined);
  }
});
