import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('Employee and Manager readiness remain truthfully in validation until #182 and #170 pass', () => {
  const index = read('index.html');
  const readme = read('README.md');
  const rollout = read('docs/SAAS-3.6-ROLLOUT.md');
  for (const name of ['conference-end-user-readiness', 'conference-manager-readiness']) {
    assert.match(index, new RegExp(`<meta name="${name}" content="in-validation">`));
    assert.doesNotMatch(index, new RegExp(`<meta name="${name}" content="ready">`));
  }
  assert.match(readme, /Employee UX: \*\*in validation\*\*/);
  assert.match(readme, /Conference Manager UX: \*\*in validation\*\*/);
  assert.match(readme, /#182 parity gate and #170 release gate remain required/);
  assert.match(rollout, /readiness markers remain\s+`in-validation`/);
  assert.doesNotMatch(readme, /Employee UX: \*\*ready\*\*/);
  assert.doesNotMatch(readme, /Conference Manager UX: \*\*ready\*\*/);
});
