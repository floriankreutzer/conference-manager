import assert from 'node:assert/strict';
import { isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createProtectedPlatformInsights } from '../src/platform-admin/production/insights-api.js';

const apiRoot = process.argv[2];
if (process.argv.length !== 3 || !isAbsolute(apiRoot ?? '')) throw new Error('INSIGHT_WIRE_API_ROOT_REQUIRED');
const { loadProtectedPlatformInsightSnapshots } = await import(pathToFileURL(
  join(apiRoot, 'src/observability/platform-insight-snapshots.js')));
const now = Date.parse('2026-10-23T12:00:00.000Z');
const sources = loadProtectedPlatformInsightSnapshots({ providerSnapshot: JSON.stringify({
  schemaVersion: 1, plan: 'launch_v3', referenceObservedAt: '2026-10-01T00:00:00.000Z',
  finops: { schemaVersion: 1, current: { schemaVersion: 1,
    periodStart: '2026-10-01T00:00:00.000Z', periodEnd: '2026-11-01T00:00:00.000Z',
    observedAt: '2026-10-22T00:00:00.000Z',
    measurements: [{ source: 'database_transfer', unit: 'bytes', used: 1000, limit: 500000000000 }] },
  history: [], rates: [] },
}) });
const seen = [];
const insights = createProtectedPlatformInsights({ apiClient: { async request(path, options) {
  assert.equal(options.method, 'GET'); assert.equal(options.body, undefined); seen.push(path);
  const report = path === 'insights/providers' ? sources.readProvider(now) : sources.readProduct(now);
  return JSON.parse(JSON.stringify(report));
} } });
assert.equal((await insights.providerUsage.load()).neon.usedBytes, 1000);
const product = (await insights.productDelivery.load()).storedReport;
assert.equal(product.environment, 'production');
assert.equal(product.accessMode, 'application_passkey');
assert.ok(product.product.every(row => row.value === null));
assert.deepEqual(seen, ['insights/providers', 'insights/product-delivery']);
console.log('PLATFORM_INSIGHT_API_WIRE_VERIFIED');
