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


test('protected Product renders every panel with unknown sources and no Demo retrieval metadata', async () => {
  class ViewNode {
    constructor(tagName = '') { this.tagName = tagName.toUpperCase(); this.children = []; this.dataset = {}; this.attrs = {}; }
    append(...nodes) { this.children.push(...nodes); }
    setAttribute(key, value) { this.attrs[key] = value; }
    addEventListener() {}
  }
  const previousDocument = globalThis.document, previousNode = globalThis.Node;
  try {
    globalThis.Node = ViewNode;
    globalThis.document = { documentElement: { lang: 'de', dataset: {} },
      createElement: tag => new ViewNode(tag),
      createTextNode: text => Object.assign(new ViewNode(), { textContent: text }),
    };
    const { renderProductDelivery } = await import('../src/platform-admin/product-delivery.js');
    const api = createProtectedPlatformInsights({ apiClient: { async request() {
      return { ...fixture('product-delivery'), environment: 'production', accessMode: 'application_passkey' };
    } } });
    const model = await api.productDelivery.load();
    assert.equal(model.retrieval, null);
    for (const retrieval of [null, undefined]) {
      const view = renderProductDelivery({ resource: { status: 'ready', data: { ...model, retrieval } }, onRetry() {} });
      const descendants = node => [node, ...node.children.flatMap(descendants)];
      const nodes = descendants(view);
      assert.equal(view.dataset.productDeliveryReport, 'true');
      assert.deepEqual(nodes.filter(node => node.attrs.role === 'tabpanel').map(node => node.dataset.insightsPanel),
        ['overview', 'usage', 'delivery', 'feedback']);
      assert.equal(nodes.filter(node => node.dataset.productMetric).length, 72);
      assert.ok(model.storedReport.product.every(metric => metric.value === null));
      assert.equal(nodes.some(node => node.dataset.insightFallback), false);
      assert.ok(nodes.some(node => node.textContent?.includes('Neuladen ruft den gespeicherten Produktbericht erneut ab.')));
      assert.equal(nodes.some(node => node.textContent?.includes('Produktdaten, Tagesbericht und Betreiberquellen getrennt')), false);
    }
  } finally {
    globalThis.document = previousDocument; globalThis.Node = previousNode;
  }
});
