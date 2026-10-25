import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflow = await readFile(new URL('../.github/workflows/ci.yml',import.meta.url),'utf8');
test('regular browser CI retains both full projects, one unchanged budget and distinct evidence before its required status',() => {
  const matrix = workflow.slice(workflow.indexOf('  browser-e2e:'),workflow.indexOf('  # Keep the existing required status'));
  assert.match(matrix,/needs: quality/); assert.match(matrix,/timeout-minutes: 20/);
  assert.match(matrix,/fail-fast: false/); assert.match(matrix,/project: \[chromium-desktop, webkit-mobile\]/);
  assert.match(matrix,/run: npm run test:e2e -- --project=\$\{\{ matrix\.project \}\}/);
  assert.match(matrix,/name: playwright-report-\$\{\{ matrix\.project \}\}/);
  for (const proof of ['test-hosted-transport.mjs --browsers','platform-microsoft-operations.spec.js',
    'EMP-14 EMP-15','Tenant Admin lifecycle','EMP-09: scoped session draft']) {
    assert.ok(matrix.includes(proof));
  }
  assert.doesNotMatch(matrix,/continue-on-error:|--grep-invert|--shard|--retries|--workers/);
});
test('required e2e aggregate rejects failed, cancelled, skipped, absent and ambiguous matrix results',() => {
  const aggregate = workflow.slice(workflow.indexOf('\n  e2e:'),workflow.indexOf('\n  shared-demo-e2e:'));
  assert.match(aggregate,/needs: \[browser-e2e, protected-browser-e2e\]/);
  assert.match(aggregate,/if: \$\{\{ always\(\) \}\}/);
  assert.match(aggregate,/BROWSER_MATRIX_RESULT: \$\{\{ needs\['browser-e2e'\]\.result \}\}/);
  assert.match(aggregate,/PROTECTED_BROWSER_MATRIX_RESULT: \$\{\{ needs\['protected-browser-e2e'\]\.result \}\}/);
  const command = aggregate.match(/run: (test "\$BROWSER_MATRIX_RESULT" = success[^\n]*)/)?.[1];
  assert.ok(command); assert.doesNotMatch(aggregate,/continue-on-error:|\|\| true/);
  for (const value of ['success','failure','cancelled','skipped','','success\nfailure']) {
    for (const protectedValue of ['success','failure','cancelled','skipped','','success\nfailure']) {
      const result = spawnSync('bash',['-c',command],{ env: { ...process.env,BROWSER_MATRIX_RESULT: value,
        PROTECTED_BROWSER_MATRIX_RESULT: protectedValue },encoding: 'utf8' });
      assert.equal(result.status,value === 'success' && protectedValue === 'success' ? 0 : 1);
    }
  }
});

test('qualified protected acceptance pins the API, retains both engines and actual TLS without weakening permanent gates',()=>{
  const protectedJob=workflow.slice(workflow.indexOf('\n  protected-browser-e2e:'));
  assert.match(protectedJob,/browser: \[chromium, webkit\]/);assert.match(protectedJob,/needs: quality/);
  assert.match(protectedJob,/ref: d8d1d10d4ca46dd524a808a5b5939f79c34e9638/);
  assert.match(protectedJob,/node frontend\/scripts\/check-platform-passkey-wire.mjs "\$PWD\/api"/);
  const refs=[...workflow.matchAll(/repository: floriankreutzer\/conference-manager-api\n\s+ref: ([a-f0-9]{40})/g)]
    .map(match=>match[1]);
  assert.deepEqual(refs,["d8d1d10d4ca46dd524a808a5b5939f79c34e9638","d8d1d10d4ca46dd524a808a5b5939f79c34e9638"]);
  assert.match(protectedJob,/node scripts\/test-protected-browser.mjs "\$\{\{ matrix.browser \}\}-protected"/);
  assert.doesNotMatch(protectedJob,/continue-on-error:|--ignore-https-errors|--retries|--grep|--shard/);
  assert.match(workflow,/Run full three-customer progression and two-cycle reset acceptance/);
});
