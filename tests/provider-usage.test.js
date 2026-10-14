import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeProviderUsage } from '../src/platform-admin/provider-usage-contracts.js';
import { createProviderUsageApi } from '../src/platform-admin/demo/provider-usage-api.js';
import { platformAdminBoundaryViolations } from '../scripts/platform-admin-boundary-policy.mjs';

function fixture() {
  return { schemaVersion: 1, collectionMode: 'operator_snapshot', accessMode: 'shared_owner_password',
    evaluatedAt: '2026-10-15T12:00:00.000Z', observedAt: '2026-10-15T00:00:00.000Z',
    periodStart: '2026-10-01T00:00:00.000Z', periodEnd: '2026-11-01T00:00:00.000Z', freshness: 'fresh',
    alertDelivery: 'not_configured', costState: 'unknown',
    neon: { plan: 'launch_v3', source: 'neon_control_plane', referenceBasis: 'published_launch_model',
      referenceObservedAt: '2026-10-01T00:00:00.000Z', usedBytes: 10_000_000_000,
      referenceBytes: 500_000_000_000, projectedBytes: 22_142_857_143, utilizationPercent: 2,
      projectedUtilizationPercent: 4.43, crossedThresholds: [], projectedExhaustion: false,
      anomalyState: 'insufficient_baseline' }, render: { usageState: 'unknown_monthly_usage' },
    github: { usageState: 'unknown_billing_usage' } };
}

test('provider client retains unknowns and uses only a fixed bounded GET', async () => {
  let observed;
  const api = createProviderUsageApi({ apiClient: { async request(path, options) {
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

test('only Demo composition may consume the pure central flag resolver', () => {
  const resolver = 'export const createFeatureFlagResolver = () => false;';
  assert.deepEqual(platformAdminBoundaryViolations({
    'src/platform-admin/demo/bootstrap.js': "import '../../platform/feature-flags.js';",
    'src/platform/feature-flags.js': resolver,
  }), []);
  for (const file of ['src/platform-admin/application.js', 'src/platform-admin/production/bootstrap.js']) {
    const correct = platformAdminBoundaryViolations({ [file]: file.endsWith('application.js')
      ? "import '../platform/feature-flags.js';" : "import '../../platform/feature-flags.js';",
    'src/platform/feature-flags.js': resolver });
    assert.ok(correct.some((item) => item.includes('must not depend on customer capability')));
  }
});
