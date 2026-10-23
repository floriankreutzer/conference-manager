import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { createProtectedPlatformInsights } from '../src/platform-admin/production/insights-api.js';

const fixture = name => JSON.parse(readFileSync(new URL(`./support/${name}-fixture.json`, import.meta.url), 'utf8'));

test('protected insight ports use only their fixed bounded authenticated GETs and validate protected source identity', async () => {
  const calls = [];
  const api = createProtectedPlatformInsights({ apiClient: { async request(path, options) {
    calls.push({ path, options });
    const value = fixture(path.endsWith('providers') ? 'provider-usage' : 'product-delivery');
    value.accessMode = 'application_passkey';
    if (value.environment) value.environment = 'production';
    return value;
  } } });
  const provider = await api.providerUsage.load();
  const product = await api.productDelivery.load();
  assert.equal(provider.accessMode, 'application_passkey');
  assert.equal(product.storedReport.environment, 'production');
  assert.ok(product.storedReport.product.every(row => row.value === null));
  assert.equal(product.liveMetrics, null);
  assert.deepEqual(calls.map(row => row.path), ['insights/providers', 'insights/product-delivery']);
  assert.ok(calls.every(row => row.options.method === 'GET' && row.options.body === undefined && row.options.signal));
});

test('protected reports reject Demo authority and malformed successes; every failure propagates without fallback', async () => {
  for (const kind of ['providerUsage','productDelivery']) {
    let calls = 0;
    const client = createProtectedPlatformInsights({ apiClient: { async request() {
      calls++; return fixture(kind === 'providerUsage' ? 'provider-usage' : 'product-delivery');
    } } });
    await assert.rejects(client[kind].load());
    assert.equal(calls, 1);
    for (const code of ['HTTP_401','HTTP_403','HTTP_404','HTTP_429','HTTP_503']) {
      calls = 0; const failure = Object.assign(new Error('failed'), { code });
      const failed = createProtectedPlatformInsights({ apiClient: { async request() { calls++; throw failure; } } });
      await assert.rejects(failed[kind].load(), error => error === failure);
      assert.equal(calls, 1);
    }
  }
});
