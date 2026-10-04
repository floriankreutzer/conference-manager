import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const read = (path) => readFileSync(new URL('../' + path, import.meta.url), 'utf8');

test('accepted Employee and Manager Demo readiness is consistent across HTML and release documentation', () => {
  const index = read('index.html');
  const readme = read('README.md');
  for (const name of ['conference-end-user-readiness', 'conference-manager-readiness']) {
    assert.match(index, new RegExp('<meta name="' + name + '" content="ready">'));
    assert.doesNotMatch(index, new RegExp('<meta name="' + name + '" content="in-validation">'));
  }
  assert.match(readme, /Employee UX: \*\*ready\*\*/);
  assert.match(readme, /Conference Manager UX: \*\*ready\*\*/);
  assert.doesNotMatch(readme, /(?:Employee|Conference Manager) UX: \*\*in validation\*\*/);
  assert.match(readme, /#182 parity gate and #170 release gate control this promotion/);
});

test('readiness promotion retains exact executed acceptance and its independent Production limits', () => {
  const evidence = read('docs/SAAS-3.6-RELEASE-EVIDENCE.md');
  const readme = read('README.md');
  const rollout = read('docs/SAAS-3.6-ROLLOUT.md');
  assert.match(evidence, /Status: \*\*accepted SaaS 3\.6 Demo baseline\*\*/);
  for (const ref of [
    'e1ac8a52f0524901cfa09993d12ff95616f603fe',
    'b4b755b6e1c74976fb1020a0fe98c68fce9304cb',
    'aab347c774042fe0c54b846fac018008e88d098c',
  ]) assert.ok(evidence.includes(ref));
  assert.match(evidence, /37198302584[^\n]*SUCCESS/);
  assert.match(evidence, /37193829601[^\n]*SUCCESS/);
  assert.match(evidence, /independent canonical cleanup and stable pre\/post deployment identity/);
  assert.match(evidence, /three-customer.*two-reset/);
  assert.match(readme, /does not certify Production/);
  assert.match(readme, /browser.*never establishes authorization|navigation.*never establishes authorization/);
  assert.match(rollout, /Current readiness promotion/);
  assert.match(rollout, /Historical candidate state/);
  assert.doesNotMatch(read('index.html'), /conference-production-readiness" content="ready"/);
});

