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
  for (const proof of ['test-hosted-transport.mjs --browsers','EMP-14 EMP-15','Tenant Admin lifecycle','EMP-09: scoped session draft']) {
    assert.ok(matrix.includes(proof));
  }
  assert.doesNotMatch(matrix,/continue-on-error:|--grep-invert|--shard|--retries|--workers/);
});
test('required e2e aggregate rejects failed, cancelled, skipped, absent and ambiguous matrix results',() => {
  const aggregate = workflow.slice(workflow.indexOf('\n  e2e:'),workflow.indexOf('\n  shared-demo-e2e:'));
  assert.match(aggregate,/needs: browser-e2e/); assert.match(aggregate,/if: \$\{\{ always\(\) \}\}/);
  assert.match(aggregate,/BROWSER_MATRIX_RESULT: \$\{\{ needs\['browser-e2e'\]\.result \}\}/);
  const command = aggregate.match(/run: (test "\$BROWSER_MATRIX_RESULT" = success)/)?.[1];
  assert.ok(command); assert.doesNotMatch(aggregate,/continue-on-error:|\|\| true/);
  for (const value of ['success','failure','cancelled','skipped','','success\nfailure']) {
    const result = spawnSync('bash',['-c',command],{ env: { ...process.env,BROWSER_MATRIX_RESULT: value },encoding: 'utf8' });
    assert.equal(result.status,value === 'success' ? 0 : 1);
  }
});
