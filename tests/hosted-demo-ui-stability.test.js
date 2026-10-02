import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { runInNewContext } from 'node:vm';

const source = readFileSync('tests/e2e-shared/shared-demo-runtime.spec.js', 'utf8');

function helper(name, next, dependencies) {
  const start = source.indexOf(`async function ${name}(`);
  const end = source.indexOf(`async function ${next}(`, start + 1);
  assert.ok(start >= 0 && end > start);
  return runInNewContext(`(${source.slice(start, end).trim()}\n)`, dependencies);
}

function statusExpectation(actual) {
  return { toBe: (expected) => assert.equal(actual, expected) };
}

test('UI response helper registers one bounded exact-origin waiter before one action', async () => {
  let actionCount = 0;
  let waiterRegistered = false;
  const response = { status: () => 200 };
  const candidate = (method, url) => ({ request: () => ({ method: () => method }), url: () => url });
  const page = {
    url: () => 'https://customer.demo.test:4443/#manager',
    waitForResponse(predicate, options) {
      waiterRegistered = true;
      assert.equal(options.timeout, 30_000);
      assert.equal(predicate(candidate('POST', 'https://customer.demo.test:4443/api/transition')), true);
      assert.equal(predicate(candidate('GET', 'https://customer.demo.test:4443/api/transition')), false);
      assert.equal(predicate(candidate('POST', 'https://platform.demo.test:4443/api/transition')), false);
      assert.equal(predicate(candidate('POST', 'https://customer.demo.test:4443/api/other')), false);
      return Promise.resolve(response);
    },
  };
  const execute = helper('expectUiResponseStatus', 'waitForStableControl', { expect: statusExpectation, URL });
  const actual = await execute(page, 'POST', '/api/transition', () => {
    assert.equal(waiterRegistered, true);
    actionCount += 1;
  }, 200);
  assert.equal(actual, response);
  assert.equal(actionCount, 1);
});

test('a failed UI response waiter is surfaced without replaying the mutation', async () => {
  let actionCount = 0;
  const failure = new Error('EXPECTED_RESPONSE_TIMEOUT');
  const execute = helper('expectUiResponseStatus', 'waitForStableControl', { expect: statusExpectation, URL });
  await assert.rejects(execute({
    url: () => 'https://customer.demo.test:4443/',
    waitForResponse: () => Promise.reject(failure),
  }, 'POST', '/api/transition', () => { actionCount += 1; }, 200), failure);
  assert.equal(actionCount, 1);
});

function actionabilityHarness({ blocked = false } = {}) {
  let trials = 0;
  let scrolls = 0;
  const control = {
    async scrollIntoViewIfNeeded(options) {
      assert.equal(options.timeout, 15_000);
      scrolls += 1;
    },
    async click(options) {
      assert.equal(options.trial, true);
      assert.equal(options.timeout, 15_000);
      assert.deepEqual(Object.keys(options).sort(), ['timeout', 'trial']);
      trials += 1;
      if (blocked) throw new Error('CONTROL_NOT_ACTIONABLE');
    },
  };
  return { control, trials: () => trials, scrolls: () => scrolls };
}

test('pointer guard uses one non-mutating Playwright actionability trial', async () => {
  const harness = actionabilityHarness();
  const settle = helper('waitForStableControl', 'switchPlatformThroughUi', {});
  await settle(harness.control);
  assert.equal(harness.trials(), 1);
  assert.equal(harness.scrolls(), 1);
});

test('pointer guard rejects an obscured target instead of forcing a click', async () => {
  const harness = actionabilityHarness({ blocked: true });
  const settle = helper('waitForStableControl', 'switchPlatformThroughUi', {});
  await assert.rejects(settle(harness.control), /CONTROL_NOT_ACTIONABLE/);
  assert.equal(harness.scrolls(), 1);
  const guard = source.slice(source.indexOf('async function waitForStableControl('), source.indexOf('async function switchPlatformThroughUi('));
  assert.match(guard, /\.click\(\{ trial: true, timeout: 15_000 \}\)/);
  assert.doesNotMatch(guard, /dispatchEvent|fetch\(|force\s*:/);
  assert.match(source, /context\.setDefaultTimeout\(15_000\)/);
  assert.match(source, /context\.setDefaultNavigationTimeout\(30_000\)/);
  assert.match(source, /await waitForStableControl\(startReviewControl\);/);
  assert.match(source, /\(\) => startReviewControl\.click\(\)/);
});
