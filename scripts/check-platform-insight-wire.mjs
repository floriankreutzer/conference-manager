import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { Readable } from 'node:stream';
import { isAbsolute, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { createProtectedPlatformInsights } from '../src/platform-admin/production/insights-api.js';

const apiRoot = process.argv[2];
if (process.argv.length !== 3 || !isAbsolute(apiRoot ?? '')) throw new Error('INSIGHT_WIRE_API_ROOT_REQUIRED');
const { loadProtectedPlatformInsightSnapshots } = await import(pathToFileURL(
  join(apiRoot, 'src/observability/platform-insight-snapshots.js')));
const { compileRuntimeProductReport } = await import(pathToFileURL(join(apiRoot, 'src/observability/product-runtime-report.js')));
const { createPlatformInsightService } = await import(pathToFileURL(join(apiRoot, 'src/platform/application/insight-service.js')));
const { createPlatformInsightRoutes } = await import(pathToFileURL(join(apiRoot, 'src/platform/http/insight-routes.js')));
const { createPlatformAuthorizationPolicy, permissionsForPlatformRoles } = await import(pathToFileURL(join(apiRoot, 'src/platform/identity/policy.js')));
const now = Date.parse('2026-10-23T12:00:00.000Z');
const securityEpoch = '11111111-1111-4111-8111-111111111111';
const sourceContext = { runtimeEnvironment: 'int', dataProfile: 'synthetic',
  securityEpochDigest: createHash('sha256').update(JSON.stringify(securityEpoch)).digest('hex') };
const runtimeSource = JSON.parse(readFileSync(new URL('../tests/support/product-runtime-source-fixture.json', import.meta.url), 'utf8'));
const runtimeProduct = compileRuntimeProductReport({ ...runtimeSource, environment: 'production',
  accessMode: 'application_passkey', sourceContext });
const sources = loadProtectedPlatformInsightSnapshots({ securityEpoch,
  runtimeProductSnapshot: JSON.stringify(runtimeProduct), providerSnapshot: JSON.stringify({
  schemaVersion: 1, plan: 'launch_v3', referenceObservedAt: '2026-10-01T00:00:00.000Z',
  finops: { schemaVersion: 1, current: { schemaVersion: 1,
    periodStart: '2026-10-01T00:00:00.000Z', periodEnd: '2026-11-01T00:00:00.000Z',
    observedAt: '2026-10-22T00:00:00.000Z',
    measurements: [{ source: 'database_transfer', unit: 'bytes', used: 1000, limit: 500000000000 }] },
  history: [], rates: [] },
}) });
const roles = ['platform_support_reader', 'platform_security_admin'];
const operatorContext = { operatorId: securityEpoch, roles, permissions: permissionsForPlatformRoles(roles),
  securityVersion: 1, providerIdentity: { provider: 'microsoft_entra_platform', tenantReference: 'tenant', subjectReference: 'subject' },
  targetScope: { mode: 'all', securityVersion: 1 },
  assurance: { level: 'mfa', authenticationContext: 'cm:pk:v1', authenticatedAt: new Date(now).toISOString() },
  session: { id: '22222222-2222-4222-8222-222222222222', securityVersion: 1, securityEpoch: 2,
    issuedAt: new Date(now).toISOString(), expiresAt: new Date(now + 3600000).toISOString(), stepUpExpiresAt: null } };
const service = createPlatformInsightService({ sources, authorizationPolicy: createPlatformAuthorizationPolicy(), clock: () => now });
const handler = createPlatformInsightRoutes(service).createHandler({ maxResponseBytes: 100000,
  platformPrincipalGuard: { async require() { return operatorContext; } } });
const seen = [];
const insights = createProtectedPlatformInsights({ apiClient: { async request(path, options) {
  assert.equal(options.method, 'GET'); assert.equal(options.body, undefined); seen.push(path);
  const parsedUrl = new URL(`/api/v1/platform/${path}`, 'https://ops.example.test');
  const request = Readable.from([]); request.method = options.method; request.headers = {};
  let report;
  const status = await handler({ path: parsedUrl.pathname, parsedUrl, request,
    response: { setHeader() {}, end(value) { report = JSON.parse(value); } },
    requestId: '33333333-3333-4333-8333-333333333333' });
  assert.equal(status, 200); return report;
} } });
assert.equal((await insights.providerUsage.load()).neon.usedBytes, 1000);
const loaded = await insights.productDelivery.load();
const product = loaded.storedReport;
assert.equal(product.environment, 'production');
assert.equal(product.accessMode, 'application_passkey');
assert.ok(product.product.every(row => row.value === null));
assert.equal(loaded.runtimeProduct.observedAt, runtimeProduct.observedAt);
assert.equal(loaded.runtimeProduct.evaluatedAt, new Date(now).toISOString());
assert.deepEqual(loaded.runtimeProduct.sourceContext, sourceContext);
assert.deepEqual(loaded.runtimeProduct.product, runtimeProduct.product);
assert.deepEqual(seen, ['insights/providers', 'insights/product-delivery?schemaVersion=2']);
console.log('PLATFORM_INSIGHT_API_WIRE_VERIFIED');
