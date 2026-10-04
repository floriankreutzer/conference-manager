import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { validateLicenseExpression, validateLockfileLicenses } from '../scripts/check-dependency-licenses.mjs';

const graph = (license = 'MIT', metadata = {}) => ({
  lockfileVersion: 3,
  packages: { '': { name: 'synthetic-fixture' }, 'node_modules/example': { license, ...metadata } },
});

const accepted = ['MIT', 'Apache-2.0', 'mIt', 'APACHE-2.0', '\t MIT \t', '(MIT)',
  'MIT AND Apache-2.0', 'MIT OR Apache-2.0', 'MIT OR (Apache-2.0 AND MIT)',
  '(MIT)AND(Apache-2.0)', '((MIT OR Apache-2.0) AND (Apache-2.0 OR MIT))'];
for (const expression of accepted) {
  test(`license policy accepts the reviewed SPDX subset: ${expression}`, () => {
    assert.doesNotThrow(() => validateLicenseExpression(expression));
  });
}

for (const denied of ['GPL-3.0', 'GPL-3.0-only', 'GPL-3.0-or-later', 'GPL-3.0+',
  'AGPL-3.0', 'AGPL-3.0-only', 'AGPL-3.0-or-later', 'AGPL-3.0+', 'gPl-3.0']) {
  test(`license policy rejects ${denied} in every AND/OR position and with an exception`, () => {
    for (const expression of [denied, `MIT AND ${denied}`, `MIT OR ${denied}`,
      `${denied} OR MIT`, `MIT OR (Apache-2.0 AND ${denied})`,
      `(MIT OR ${denied}) AND Apache-2.0`, `${denied} WITH Classpath-exception-2.0`]) {
      assert.throws(() => validateLicenseExpression(expression), /LICENSE_DENIED/);
    }
  });
}

test('license policy blocks incomplete, custom, unreviewed, modified and malformed expressions', () => {
  for (const expression of [undefined, null, '', ' \t', {}, [], 4, 'ISC', 'BSD-3-Clause',
    'LicenseRef-Proprietary', 'DocumentRef-example:LicenseRef-MIT', 'SEE LICENSE IN LICENSE',
    'UNLICENSED', 'NOASSERTION', 'NONE', 'MIT+', 'MIT WITH Classpath-exception-2.0',
    'MIT OR Unknown-1.0', 'MIT AND (Apache-2.0 OR Unknown-1.0)', '()', '(MIT', 'MIT)',
    'MIT Apache-2.0', 'MIT AND', 'OR MIT', 'MIT OR OR MIT', 'MIT and Apache-2.0',
    'MIT or Apache-2.0', 'MIT||Apache-2.0', 'MIT/Apache-2.0', 'MIT;Apache-2.0',
    'MIT(Apache-2.0)', '(MIT)(Apache-2.0)', 'MIT\n', 'MIT\u200b', 'MIT\0',
    '('.repeat(33) + 'MIT' + ')'.repeat(33), 'MIT'.padEnd(1025)]) {
    assert.throws(() => validateLicenseExpression(expression), /LICENSE_/);
  }
});

test('license policy validates bounded nesting and size at their exact limits', () => {
  assert.doesNotThrow(() => validateLicenseExpression('('.repeat(32) + 'MIT' + ')'.repeat(32)));
  assert.doesNotThrow(() => validateLicenseExpression('MIT'.padEnd(1024)));
});

test('every generated nested OR/AND operand is inspected; no permissive short circuit', () => {
  for (const left of accepted.slice(0, 4)) {
    for (const right of accepted.slice(0, 4)) {
      for (const operator of ['AND', 'OR']) {
        assert.doesNotThrow(() => validateLicenseExpression(`(${left} ${operator} ${right})`));
        for (const unapproved of ['GPL-3.0-only', 'AGPL-3.0+', 'Unknown-1.0']) {
          assert.throws(() => validateLicenseExpression(`(${left} ${operator} (${right} OR ${unapproved}))`));
          assert.throws(() => validateLicenseExpression(`((${unapproved} OR ${left}) ${operator} ${right})`));
        }
      }
    }
  }
});

test('lock policy inspects dev, optional, scoped and nested packages without omission', () => {
  const lock = graph();
  lock.packages['node_modules/@scope/example/node_modules/nested'] = { license: 'Apache-2.0', dev: true };
  lock.packages['node_modules/optional'] = { license: '(MIT OR Apache-2.0)', optional: true };
  assert.equal(validateLockfileLicenses(lock), 3);
  for (const key of Object.keys(lock.packages).filter(Boolean)) {
    for (const license of [undefined, null, '', {}, 'MIT OR GPL-3.0-only']) {
      const tampered = structuredClone(lock);
      tampered.packages[key].license = license;
      assert.throws(() => validateLockfileLicenses(tampered));
    }
  }
});

test('malformed, absent, empty, linked and legacy lock graphs fail closed', () => {
  for (const lock of [null, [], {}, { lockfileVersion: 2, packages: graph().packages },
    { lockfileVersion: 3 }, { lockfileVersion: 3, packages: [] },
    { lockfileVersion: 3, packages: {} }, { lockfileVersion: 3, packages: { '': {} } },
    { lockfileVersion: 3, packages: { '': null, 'node_modules/example': { license: 'MIT' } } },
    graph('MIT', { link: true }), graph('MIT', { link: 'false' })]) {
    assert.throws(() => validateLockfileLicenses(lock));
  }
  for (const value of [null, [], 'MIT']) {
    const lock = graph();
    lock.packages['node_modules/example'] = value;
    assert.throws(() => validateLockfileLicenses(lock));
  }
  for (const path of ['outside/example', 'node_modules/../outside', 'node_modules/example\n']) {
    const lock = graph();
    lock.packages[path] = { license: 'MIT' };
    assert.throws(() => validateLockfileLicenses(lock));
  }
});

test('the actual committed lock graph passes without missing license evidence', () => {
  const lock = JSON.parse(readFileSync(new URL('../package-lock.json', import.meta.url), 'utf8'));
  assert.equal(validateLockfileLicenses(lock), Object.keys(lock.packages).length - 1);
});

test('CLI blocks malformed/missing/oversized lock data and never reflects its content', () => {
  const directory = mkdtempSync(join(tmpdir(), 'cm-license-policy-'));
  const script = fileURLToPath(new URL('../scripts/check-dependency-licenses.mjs', import.meta.url));
  const file = join(directory, 'package-lock.json');
  const run = (...args) => spawnSync(process.execPath, [script, ...args], {
    cwd: directory, encoding: 'utf8', timeout: 10_000,
  });
  try {
    assert.equal(run().status, 1);
    writeFileSync(file, JSON.stringify(graph('MIT')));
    assert.equal(run().status, 0);
    assert.equal(run('--skip').status, 1);
    for (const data of ['{private-fixture-content', JSON.stringify(graph(undefined, { license: null })),
      JSON.stringify(graph('MIT OR AGPL-3.0-only')), ' '.repeat(8 * 1024 * 1024 + 1)]) {
      writeFileSync(file, data);
      const result = run();
      assert.equal(result.status, 1);
      assert.match(result.stderr, /^Dependency license policy blocked: LICENSE_[A-Z_]+\n$/);
      assert.equal(result.stdout, '');
      assert.doesNotMatch(result.stderr, /private-fixture-content|AGPL/);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
