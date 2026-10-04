import assert from 'node:assert/strict';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const workflow = readFileSync(new URL('../.github/workflows/complete-saas39-milestone.yml', import.meta.url), 'utf8');
const script = workflow.split('        run: |\n')[1].split('\n').map((line) => line.replace(/^ {10}/, '')).join('\n');

function executeGate({ incompleteIssue, issueState = 'open:', milestone = {}, patchState = 'closed' } = {}) {
  const directory = mkdtempSync(join(tmpdir(), 'saas39-completion-'));
  try {
    const fixture = {
      incompleteIssue, issueState, patchState,
      milestone: { number: 12, title: 'SaaS 3.9 - Infrastruktur-/Security', open_issues: 0, state: 'open', ...milestone },
    };
    writeFileSync(join(directory, 'fixture.json'), JSON.stringify(fixture));
    writeFileSync(join(directory, 'gh'), [
      '#!/usr/bin/env node',
      "const fs = require('node:fs');",
      "const fixture = JSON.parse(fs.readFileSync(process.env.COMPLETION_FIXTURE, 'utf8'));",
      'const args = process.argv.slice(2);',
      "fs.appendFileSync(process.env.COMPLETION_CALLS, JSON.stringify(args) + '\\n');",
      "const endpoint = args.find((arg) => arg.startsWith('repos/'));",
      "if (args.includes('PATCH')) {",
      "  if (endpoint !== 'repos/floriankreutzer/conference-manager/milestones/12' || !args.includes('state=closed')) process.exit(9);",
      '  process.stdout.write(fixture.patchState);',
      "} else if (endpoint?.includes('/issues/')) {",
      "  const number = Number(endpoint.split('/').at(-1));",
      "  process.stdout.write(number === fixture.incompleteIssue ? fixture.issueState : 'closed:completed');",
      "} else if (endpoint === 'repos/floriankreutzer/conference-manager/milestones/12') {",
      '  process.stdout.write(JSON.stringify(fixture.milestone));',
      '} else process.exit(10);',
    ].join('\n'), { mode: 0o700 });
    const result = spawnSync('bash', ['-c', script], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: directory + ':' + process.env.PATH,
        COMPLETION_FIXTURE: join(directory, 'fixture.json'),
        COMPLETION_CALLS: join(directory, 'calls.jsonl'),
      },
    });
    const calls = readFileSync(join(directory, 'calls.jsonl'), 'utf8').trim().split('\n').map(JSON.parse);
    return { status: result.status, stdout: result.stdout, stderr: result.stderr, calls, patches: calls.filter((args) => args.includes('PATCH')) };
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

test('SaaS 3.9 closure is restricted to its repository, release issue and least-privilege job', () => {
  assert.match(workflow, /github\.repository == 'floriankreutzer\/conference-manager'/);
  const trigger = workflow.match(/contains\(fromJSON\('(\[[\d, ]+\])'\), github\.event\.issue\.number\)/);
  assert.ok(trigger, 'Every scoped issue closure must evaluate completion');
  const allowedIssueEvents = JSON.parse(trigger[1]);
  assert.deepEqual(allowedIssueEvents, [164, 247, 248, 249, 250, 251, 252, 253, 254, 272]);
  for (const number of [0, 163, 165, 246, 255, 271, 273, 999]) {
    assert.equal(allowedIssueEvents.includes(number), false, 'Unrelated issue events stay excluded');
  }
  assert.match(workflow, /permissions:\n  contents: read/);
  assert.match(workflow, /permissions:\n      issues: write/);
  assert.match(workflow, /cancel-in-progress: false/);
  assert.doesNotMatch(workflow, /pull_request_target|continue-on-error|contents: write|force:/);
});

test('SaaS 3.9 closes only its exact milestone after every scoped issue is completed', () => {
  const result = executeGate();
  assert.equal(result.status, 0);
  assert.equal(result.patches.length, 1);
  assert.equal(result.calls.filter((args) => args.some((arg) => arg.includes('/issues/'))).length, 9);
  assert.match(result.stdout, /closed after all release issues were completed/);
});

test('every unfinished or non-completed SaaS 3.9 issue prevents milestone mutation', () => {
  for (const incompleteIssue of [247, 248, 249, 250, 251, 252, 253, 254, 272]) {
    for (const issueState of ['open:', 'closed:not_planned', 'closed:']) {
      const result = executeGate({ incompleteIssue, issueState });
      assert.equal(result.status, 0);
      assert.equal(result.patches.length, 0);
      assert.match(result.stdout, /is not completed/);
    }
  }
});

test('additional unfinished milestone work prevents closure', () => {
  const result = executeGate({ milestone: { open_issues: 1 } });
  assert.equal(result.status, 0);
  assert.equal(result.patches.length, 0);
  assert.match(result.stdout, /additional unfinished work/);
});

test('changed milestone identity fails closed before any mutation', () => {
  for (const milestone of [{ number: 10 }, { title: 'SaaS 4' }]) {
    const result = executeGate({ milestone });
    assert.equal(result.status, 1);
    assert.equal(result.patches.length, 0);
    assert.match(result.stderr, /identity changed/);
  }
});

test('completed milestone closure is idempotent and rejected writes fail', () => {
  const closed = executeGate({ milestone: { state: 'closed' } });
  assert.equal(closed.status, 0);
  assert.equal(closed.patches.length, 0);
  assert.match(closed.stdout, /already closed/);
  const rejected = executeGate({ patchState: 'open' });
  assert.equal(rejected.status, 1);
});
