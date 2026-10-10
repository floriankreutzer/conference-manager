import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const workflow = readFileSync('.github/workflows/hosted-demo-acceptance.yml', 'utf8');
function step(name) {
  const marker = `      - name: ${name}\n`;
  assert.ok(workflow.includes(marker));
  return workflow.split(marker)[1].split('      - name: ')[0];
}

test('dispatch mode validation rejects missing, malformed and non-main gated refs before protected tokens', () => {
  const validation = step('Validate acceptance mode');
  const code = validation.match(/run: node -e "([^"]+)"/)?.[1];
  assert.ok(code);
  for (const [mode, ref, status] of [
    ['ordinary', 'refs/heads/main', 0], ['ordinary', 'refs/heads/feature', 0],
    ['gate', 'refs/heads/main', 0], ['gate', 'refs/heads/feature', 1],
    ['', 'refs/heads/main', 1], ['unknown', 'refs/heads/main', 1],
  ]) {
    assert.equal(spawnSync(process.execPath, ['-e', code], {
      env: { ACCEPTANCE_MODE: mode, ACCEPTANCE_REF: ref }, stdio: 'pipe',
    }).status, status);
  }
  assert.ok(workflow.indexOf('name: Validate acceptance mode') < workflow.indexOf('name: Run guarded hosted acceptance'));
});

test('gate tokens occur only in the guarded step environment and uploads enumerate closed evidence', () => {
  const gated = step('Run guarded hosted acceptance and independent cleanup');
  assert.match(gated, /if: inputs\.mode == 'gate' && github\.ref == 'refs\/heads\/main'/);
  assert.match(gated, /run: node scripts\/run-hosted-acceptance-journey\.mjs/);
  const tokenReferences = [...workflow.matchAll(/\$\{\{ secrets\.CM_DEMO_(?:CUSTOMER|PLATFORM)_ACCEPTANCE_TOKEN \}\}/g)];
  assert.equal(tokenReferences.length, 2);
  for (const [reference] of tokenReferences) assert.ok(gated.includes(reference));
  assert.doesNotMatch(gated.split('run:')[1], /\$\{\{|TOKEN|curl/);
  const upload = step('Upload closed-schema guarded acceptance evidence');
  assert.match(upload, /summary\.json/);
  assert.match(upload, /journey-phases\.json/);
  assert.match(upload, /scenario-\*\.json/);
  assert.match(upload, /reset-audit\.json/);
  assert.match(upload, /reset-correlation\.json/);
  assert.doesNotMatch(upload, /playwright-report|test-results|\.zip|\.har/);
});

test('ordinary suites and isolated transport canaries remain mandatory in their existing jobs', () => {
  assert.match(step('Run hosted cross-role Demo journey'), /if: inputs\.mode != 'gate'/);
  assert.match(step('Run full hosted three-customer and two-cycle scenario acceptance'), /steps\.hosted_journey\.outcome == 'success' && inputs\.mode != 'gate'/);
  const ci = readFileSync('.github/workflows/ci.yml', 'utf8');
  const canary = ci.split('      - name: Verify isolated acceptance transport in Chromium, WebKit and API requests\n')[1]?.split('      - name: ')[0];
  assert.ok(canary);
  assert.match(canary, /node scripts\/test-hosted-transport\.mjs --browsers/);
  assert.doesNotMatch(canary, /if:|continue-on-error|\|\| true/);
});
