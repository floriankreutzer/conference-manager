import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const runner = readFileSync(new URL('../scripts/run-zap-baseline.sh', import.meta.url), 'utf8');
const finalCommand = runner.slice(runner.lastIndexOf('zap.sh -cmd'));

function requireCompleteEvidence(args) {
  const configs = [];
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '-config') configs.push(args[index + 1]);
  }
  for (const key of ['alert.systemicLimit', 'alert.maxInstances']) {
    assert.deepEqual(configs.filter(value => value?.startsWith(`${key}=`)), [`${key}=0`]);
  }
  assert.equal(args[args.indexOf('-autorun') + 1], '/zap/wrk/zap.yaml');
}

test('the actual final ZAP invocation removes both independent core evidence caps', () => {
  const directory = mkdtempSync(join(tmpdir(), 'zap-evidence-limits-'));
  try {
    const capture = join(directory, 'arguments.txt');
    // Execute the existing final shell command with a local function instead of
    // ZAP; no container mount, provider request or credential is required.
    const result = spawnSync('bash', ['-s'], {
      encoding: 'utf8', timeout: 5000,
      env: { ...process.env, ZAP_LIMIT_CAPTURE: capture },
      input: `set -euo pipefail\nauth_args=()\nfunction zap.sh() { printf '%s\\n' "$@" > "$ZAP_LIMIT_CAPTURE"; }\n${finalCommand}`,
    });
    assert.equal(result.error, undefined);
    assert.equal(result.status, 0, result.stderr);
    const args = readFileSync(capture, 'utf8').trimEnd().split('\n');
    requireCompleteEvidence(args);
    assert.ok(args.includes('stats.pkg.baseline-af=1'));
    assert.equal(result.stdout, '');
    assert.equal(result.stderr, '');
  } finally { rmSync(directory, { recursive: true, force: true }); }
});

test('missing, bounded or duplicate evidence settings fail the regression contract', () => {
  const good = ['-cmd', '-autorun', '/zap/wrk/zap.yaml',
    '-config', 'alert.systemicLimit=0', '-config', 'alert.maxInstances=0'];
  assert.doesNotThrow(() => requireCompleteEvidence(good));
  for (const key of ['alert.systemicLimit', 'alert.maxInstances']) {
    assert.throws(() => requireCompleteEvidence(good.filter(value => value !== `${key}=0`)));
    assert.throws(() => requireCompleteEvidence(good.map(value => value === `${key}=0` ? `${key}=5` : value)));
    assert.throws(() => requireCompleteEvidence([...good, '-config', `${key}=20`]));
  }
});

test('uncapped evidence does not disable rules, expand the target or expose scanner credentials', () => {
  assert.match(finalCommand, /"\$\{auth_args\[@\]\}" >\/dev\/null 2>&1/);
  assert.match(runner, /unset DAST_OPERATIONS_PASSWORD/);
  assert.match(runner, /require_addon pscanrulesBeta beta/);
  assert.match(runner, /require_addon pscanrulesAlpha alpha/);
  assert.doesNotMatch(finalCommand, /threshold=OFF|disableAllScanners|alertFilter|url=|set -x/);
  assert.equal((runner.match(/-autorun/g) || []).length, 1);
});
