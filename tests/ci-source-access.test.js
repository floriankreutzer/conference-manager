import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflow = await readFile(new URL('../.github/workflows/ci.yml', import.meta.url), 'utf8');
const jobs = ['shared-demo-e2e', 'protected-browser-e2e'];

function sourceJob(name) {
  const start = workflow.indexOf(`\n  ${name}:`);
  assert.notEqual(start, -1);
  const tail = workflow.slice(start + 1);
  // Only two-space job headers terminate a job; deeper step indentation does not.
  const nextJob = tail.search(/\n  [a-z][a-z0-9-]*:\n/);
  return nextJob < 0 ? tail : tail.slice(0, nextJob);
}

for (const name of jobs) {
  test(`${name}: executes the credential guard for complete, absent, partial and unknown states`, () => {
    const job = sourceJob(name);
    const guard = job.match(/      - name: Require complete private source credentials\n([\s\S]*?)(?=      - name:)/)?.[1];
    assert.ok(guard, 'credential preflight must run before token creation');
    assert.doesNotMatch(guard, /\n        if:|continue-on-error:/);
    assert.match(guard, /HAS_SOURCE_APP_ID: \$\{\{ secrets\.CM_CI_READER_APP_ID != '' \}\}/);
    assert.match(guard, /HAS_SOURCE_PRIVATE_KEY: \$\{\{ secrets\.CM_CI_READER_PRIVATE_KEY != '' \}\}/);
    assert.match(guard, /SOURCE_REPOSITORY_PRIVATE: \$\{\{ github\.event\.repository\.private \}\}/);
    const command = guard.split('        run: |\n')[1]?.replace(/^          /gm, '');
    assert.ok(command);

    for (const hasId of ['true', 'false', '', 'unknown']) {
      for (const hasKey of ['true', 'false', '', 'unknown']) {
        for (const isPrivate of ['true', 'false', '', 'unknown']) {
          const result = spawnSync('bash', ['-c', command], {
            encoding: 'utf8',
            env: {
              PATH: process.env.PATH,
              HAS_SOURCE_APP_ID: hasId,
              HAS_SOURCE_PRIVATE_KEY: hasKey,
              SOURCE_REPOSITORY_PRIVATE: isPrivate,
            },
          });
          const complete = hasId === 'true' && hasKey === 'true';
          const absentPublic = hasId === 'false' && hasKey === 'false' && isPrivate === 'false';
          const allowed = (complete && ['true', 'false'].includes(isPrivate)) || absentPublic;
          assert.equal(result.status, allowed ? 0 : 1, `${hasId}/${hasKey}/${isPrivate}`);
          if (!allowed) assert.match(result.stdout, /::error::Complete CI Reader credentials/);
        }
      }
    }
  });

  test(`${name}: bounds and revokes App authority while retaining mandatory immutable checkout`, () => {
    const job = sourceJob(name);
    assert.match(job, /HAS_SOURCE_APP: \$\{\{ secrets\.CM_CI_READER_APP_ID != '' \|\| secrets\.CM_CI_READER_PRIVATE_KEY != '' \}\}/);
    const tokenStep = job.match(/      - name: Create short-lived private source token\n([\s\S]*?)(?=      - name:)/)?.[1];
    assert.ok(tokenStep);
    assert.match(tokenStep, /id: source-token\n        if: env\.HAS_SOURCE_APP == 'true'/);
    assert.match(tokenStep, /uses: actions\/create-github-app-token@64ab729a6294000f5aa4a4bc0b73d1f32bc45510/);
    assert.match(tokenStep, /owner: floriankreutzer\n          repositories: conference-manager-api\n          permission-contents: read/);
    assert.equal((tokenStep.match(/permission-[a-z-]+:/g) ?? []).length, 1);
    assert.doesNotMatch(tokenStep, /skip-token-revoke:|continue-on-error:|github-api-url:/);
    assert.ok(job.indexOf('Require complete private source credentials') < job.indexOf('id: source-token'));
    assert.ok(job.indexOf('id: source-token') < job.indexOf('repository: floriankreutzer/conference-manager-api'));
    assert.match(job, /repository: floriankreutzer\/conference-manager-api\n          ref: [a-f0-9]{40}\n          token: \$\{\{ steps\.source-token\.outputs\.token \|\| github\.token \}\}\n          persist-credentials: false/);
    assert.doesNotMatch(job, /name: Checkout immutable[^\n]*\n        if:|continue-on-error:/);
    assert.equal((job.match(/persist-credentials: false/g) ?? []).length, 2);
  });
}

test('CI does not use the legacy source token, broaden workflow authority or exempt Dependabot', () => {
  assert.doesNotMatch(workflow, /SHARED_DEMO_API_READ_TOKEN|pull_request_target:|write-all|skip-token-revoke:/);
  assert.match(workflow, /permissions:\n  contents: read\n/);
  assert.equal((workflow.match(/uses: actions\/create-github-app-token@/g) ?? []).length, 2);
  for (const name of jobs) assert.doesNotMatch(sourceJob(name), /github\.actor[^\n]*dependabot/);
});
