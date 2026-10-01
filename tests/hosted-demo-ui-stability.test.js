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

function geometryHarness(samples) {
  let reads = 0;
  let scrolls = 0;
  const control = {
    async scrollIntoViewIfNeeded(options) {
      assert.equal(options.timeout, 15_000);
      scrolls += 1;
    },
    async evaluate(read) {
      const sample = samples[Math.min(reads, samples.length - 1)];
      reads += 1;
      const element = {
        getBoundingClientRect: () => ({ x: 10, y: sample.y, width: 100, height: 30 }),
        contains: () => false,
        ownerDocument: { elementFromPoint: () => (sample.hit ? element : null) },
      };
      return read(element);
    },
  };
  const expect = {
    poll(read, options) {
      assert.equal(options.timeout, 10_000);
      assert.equal(Array.from(options.intervals).join(','), '100,100,250');
      return {
        async toBe(expected) {
          for (let attempt = 0; attempt < 8; attempt += 1) {
            if (await read() === expected) return;
          }
          throw new Error('CONTROL_NOT_STABLE');
        },
      };
    },
  };
  return { control, expect, reads: () => reads, scrolls: () => scrolls };
}

test('pointer guard requires repeated stationary geometry and an unobstructed hit target', async () => {
  const harness = geometryHarness([
    { y: 50, hit: false },
    { y: 60, hit: true },
    { y: 65, hit: true },
    { y: 65.25, hit: true },
    { y: 64.9, hit: true },
  ]);
  const settle = helper('waitForStableControl', 'switchPlatformThroughUi', { expect: harness.expect });
  await settle(harness.control);
  assert.equal(harness.reads(), 5);
  assert.equal(harness.scrolls(), 1);
});

test('pointer guard rejects an obscured target instead of forcing a click', async () => {
  const harness = geometryHarness([{ y: 65, hit: false }]);
  const settle = helper('waitForStableControl', 'switchPlatformThroughUi', { expect: harness.expect });
  await assert.rejects(settle(harness.control), /CONTROL_NOT_STABLE/);
  assert.equal(harness.scrolls(), 1);
  const guard = source.slice(source.indexOf('async function waitForStableControl('), source.indexOf('async function switchPlatformThroughUi('));
  assert.doesNotMatch(guard, /\.click\(|dispatchEvent|fetch\(|force\s*:/);
  assert.match(source, /context\.setDefaultTimeout\(15_000\)/);
  assert.match(source, /context\.setDefaultNavigationTimeout\(30_000\)/);
  assert.match(source, /await waitForStableControl\(startReviewControl\);/);
  assert.match(source, /\(\) => startReviewControl\.click\(\)/);
});
