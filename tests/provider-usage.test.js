import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { normalizeProviderUsage } from '../src/platform-admin/provider-usage-contracts.js';
import { createProviderUsageApi } from '../src/platform-admin/demo/provider-usage-api.js';
import { platformAdminBoundaryViolations } from '../scripts/platform-admin-boundary-policy.mjs';

function fixture() {
  return JSON.parse(readFileSync(new URL('./support/provider-usage-fixture.json', import.meta.url), 'utf8'));
}

test('provider client retains unknowns and uses only a fixed bounded GET', async () => {
  let observed;
  const api = createProviderUsageApi({ apiClient: { async request(path, options) {
    if (path === 'demo/live-metrics') throw Object.assign(new Error('Not found'), { code: 'HTTP_404' });
    observed = { path, options }; return fixture();
  } } });
  const report = await api.load();
  assert.equal(report.costState, 'unknown');
  assert.equal(report.github.usageState, 'unknown_billing_usage');
  assert.equal(observed.path, 'demo/provider-usage');
  assert.equal(observed.options.method, 'GET');
  assert.equal(observed.options.body, undefined);
  assert.equal(typeof observed.options.signal.addEventListener, 'function');
  assert.ok(Object.isFrozen(report.neon.crossedThresholds));
});

test('provider response rejects unknown fields, authority, amounts, periods, thresholds and sources', () => {
  for (const change of [
    { ownerEmail: 'secret@example.invalid' }, { accessMode: 'demo_role' }, { observedAt: 'invalid' },
    { alertDelivery: 'sent' }, { periodEnd: '2026-10-10T00:00:00.000Z' },
    { neon: { ...fixture().neon, usedBytes: -1 } }, { neon: { ...fixture().neon, source: 'browser' } },
    { neon: { ...fixture().neon, referenceBasis: 'account_spend_cap' } },
    { neon: { ...fixture().neon, crossedThresholds: [70, 50] } },
    { render: { usageState: 'zero' } }, { github: { usageState: 'unknown_billing_usage', token: 'secret' } },
  ]) assert.throws(() => normalizeProviderUsage({ ...fixture(), ...change }), /PLATFORM_PROVIDER_USAGE_INVALID/);
});

test('Provider wire freshness follows the server clock and cannot contradict its observation/window', () => {
  const value = fixture();
  value.evaluatedAt = '2026-10-16T00:00:00.000Z';
  assert.equal(normalizeProviderUsage(value).freshness, 'fresh');
  value.evaluatedAt = '2026-10-16T00:00:00.001Z';
  assert.throws(() => normalizeProviderUsage(value));
  value.freshness = 'stale'; assert.equal(normalizeProviderUsage(value).freshness, 'stale');
  value.evaluatedAt = value.observedAt; assert.throws(() => normalizeProviderUsage(value));
  value.periodEnd = value.observedAt; value.freshness = 'fresh';
  assert.throws(() => normalizeProviderUsage(value));
  value.freshness = 'stale'; assert.equal(normalizeProviderUsage(value).freshness, 'stale');
});

test('only explicit Demo/production bootstrap may consume the pure central flag resolver', () => {
  const resolver = 'export const createFeatureFlagResolver = () => false;';
  for (const file of ['src/platform-admin/demo/bootstrap.js','src/platform-admin/production/bootstrap.js']) {
    assert.deepEqual(platformAdminBoundaryViolations({
      [file]: "import '../../platform/feature-flags.js';",'src/platform/feature-flags.js': resolver,
    }), []);
  }
  for (const file of ['src/platform-admin/application.js','src/platform-admin/production/private-client.js']) {
    const violations = platformAdminBoundaryViolations({ [file]: file.endsWith('application.js')
      ? "import '../platform/feature-flags.js';" : "import '../../platform/feature-flags.js';",
    'src/platform/feature-flags.js': resolver });
    assert.ok(violations.some((item) => item.includes('must not depend on customer capability')));
  }
});
