import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

test('WebKitGTK probe offline boundaries, certificates and cleanup regression/progression', () => {
  const result = spawnSync('python3', [
    '-m', 'unittest', 'discover', '-s', 'tests', '-p', 'webkitgtk_print_probe_test.py',
  ], { encoding: 'utf8', timeout: 90_000 });
  assert.ifError(result.error);
  assert.equal(result.status, 0, result.stderr || result.stdout);
});

test('the synthetic probe starts only on its dedicated free hosted branch after baseline gates', () => {
  const workflow = readFileSync('.github/workflows/webkitgtk-print-probe.yml', 'utf8');
  assert.match(workflow, /branches: \[CO-317-webkitgtk-capability-probe\]/);
  assert.match(workflow, /permissions:\n  contents: read\n/);
  assert.match(workflow, /runs-on: ubuntu-26\.04/);
  assert.match(workflow, /github\.event\.repository\.private == false/);
  assert.match(workflow, /persist-credentials: false/);
  assert.match(workflow, /env -i PATH=\/usr\/bin:\/bin LANG=C\.UTF-8 LC_ALL=C/);
  assert.doesNotMatch(workflow, /secrets\.|pull_request_target|schedule:|self-hosted|continue-on-error|write-all/);
  const baseline = workflow.indexOf('run: npm run check');
  const audit = workflow.indexOf('run: npm run audit');
  const dependencies = workflow.indexOf('sudo apt-get update');
  const probe = workflow.indexOf('dbus-run-session -- xvfb-run');
  assert.ok(baseline >= 0 && audit > baseline && dependencies > audit && probe > dependencies);
});
