import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const workflowUrl = new URL('../.github/workflows/ci.yml', import.meta.url);
const packageUrl = new URL('../package.json', import.meta.url);
const configUrl = new URL('../playwright.shared-demo.config.js', import.meta.url);
const journeyUrl = new URL('../tests/e2e-shared/shared-demo-runtime.spec.js', import.meta.url);

test('frontend CI runs the dedicated shared Demo suite exactly once', async () => {
  const [workflow, packageText, config] = await Promise.all([
    readFile(workflowUrl, 'utf8'),
    readFile(packageUrl, 'utf8'),
    readFile(configUrl, 'utf8'),
  ]);
  const packageJson = JSON.parse(packageText);
  const sharedRuns = workflow.match(/run: npm run test:e2e:shared-demo$/gm) ?? [];

  assert.equal(sharedRuns.length, 1);
  assert.equal(
    packageJson.scripts['test:e2e:shared-demo'],
    'playwright test --config=playwright.shared-demo.config.js',
  );
  assert.match(config, /testDir: '\.\/tests\/e2e-shared'/);
});

test('shared Demo cookie isolation inspects the cookies on their bounded API paths', async () => {
  const journey = await readFile(journeyUrl, 'utf8');

  assert.match(journey, /`\$\{CUSTOMER_ORIGIN\}\/api\/v1\/demo\/session`/);
  assert.match(journey, /`\$\{PLATFORM_ORIGIN\}\/api\/v1\/platform\/demo\/session`/);
  assert.doesNotMatch(journey, /context\.cookies\(\[CUSTOMER_ORIGIN, PLATFORM_ORIGIN\]\)/);
});

test('shared Demo CI pins the private API and fails closed without checkout authority', async () => {
  const workflow = await readFile(workflowUrl, 'utf8');
  const apiCheckout = workflow.match(
    /repository: floriankreutzer\/conference-manager-api\s+ref: ([a-f0-9]{40})\s+token: \$\{\{ secrets\.SHARED_DEMO_API_READ_TOKEN \}\}\s+persist-credentials: false/,
  );

  assert.ok(apiCheckout, 'expected an immutable authenticated API checkout');
  assert.doesNotMatch(apiCheckout[1], /^(?:0{40}|f{40})$/);
  assert.match(workflow, /if \[\[ -z "\$SHARED_DEMO_API_READ_TOKEN" \]\]; then/);
  assert.match(workflow, /if \[\[ -f api\/customer-demo-api\.pid \]\]/);
  assert.doesNotMatch(workflow, /name: Stop Demo API processes\s+if: always\(\)\s+working-directory:/);
});

test('shared Demo CI uses bounded request capacity only for the complete cross-browser journey', async () => {
  const workflow = await readFile(workflowUrl, 'utf8');
  const capacityDeclarations = workflow.match(/DEMO_RATE_LIMIT_MAX: '1000'/g) ?? [];

  assert.equal(capacityDeclarations.length, 1);
  assert.match(
    workflow,
    /shared-demo-e2e:[\s\S]*?timeout-minutes: 30\s+env:\s+DEMO_RATE_LIMIT_MAX: '1000'\s+services:/,
  );
  assert.doesNotMatch(
    workflow,
    /jobs:\s+env:\s+DEMO_RATE_LIMIT_MAX: '1000'/,
  );
});
