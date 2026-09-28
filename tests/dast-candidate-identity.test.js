import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const dast = readFileSync(new URL('../.github/workflows/dast.yml', import.meta.url), 'utf8');
const hosted = readFileSync(new URL('../.github/workflows/hosted-demo-acceptance.yml', import.meta.url), 'utf8');

function pin(workflow, key) {
  const match = workflow.match(new RegExp(`^  ${key}: ([0-9a-f]{40})$`, 'm'));
  assert.ok(match, `${key} must pin a complete commit`);
  return match[1];
}

test('live DAST checks the exact hosted candidate before and after each Render scan', () => {
  for (const key of ['EXPECTED_FRONTEND_REF', 'EXPECTED_RUNTIME_REF']) {
    assert.equal(pin(dast, key), pin(hosted, key));
  }
  const identityStep = dast.indexOf("if: matrix.surface != 'static-launchpad'\n        run: node scripts/verify-hosted-demo-deployment.mjs");
  const scanStep = dast.indexOf('- name: Run uncapped ZAP passive baseline');
  assert.ok(identityStep > 0 && scanStep > identityStep);
  const finalIdentityStep = dast.indexOf("if: ${{ always() && matrix.surface != 'static-launchpad' }}\n        run: node scripts/verify-hosted-demo-deployment.mjs");
  assert.ok(finalIdentityStep > scanStep);
  assert.match(dast, /pull_request:[\s\S]*?- \.github\/workflows\/hosted-demo-acceptance\.yml[\s\S]*?push:/);
  assert.match(dast, /push:[\s\S]*?- \.github\/workflows\/hosted-demo-acceptance\.yml[\s\S]*?schedule:/);
});
