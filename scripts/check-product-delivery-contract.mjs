import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { normalizeProductDelivery } from '../src/platform-admin/product-delivery-contracts.js';

// CI supplies an immutable, separately checked-out API root. Never loaded by browsers.
if (process.argv.length !== 3) throw new TypeError('An immutable API checkout is required.');
const apiRoot = resolve(process.argv[2]);
const { compileProductDeliveryReport } = await import(pathToFileURL(resolve(apiRoot,
  'src/observability/product-delivery-report.js')));
const { loadDemoProductDelivery } = await import(pathToFileURL(resolve(apiRoot,
  'src/demo/platform-product-delivery.js')));
const source = JSON.parse(readFileSync(resolve(apiRoot,
  'tests/support/product-delivery-source-fixture.json'), 'utf8'));
const now = Date.parse(source.observedAt);
const configured = { DEMO_PRODUCT_DELIVERY_SNAPSHOT: JSON.stringify(compileProductDeliveryReport(source)) };
for (const [name, env, evaluatedAt] of [
  ['product-delivery-fixture.json', {}, now],
  ['product-delivery-known-fixture.json', configured, now],
  ['product-delivery-expired-fixture.json', configured, now + 30 * 86_400_000],
]) {
  const fixture = JSON.parse(readFileSync(new URL(`../tests/support/${name}`, import.meta.url), 'utf8'));
  const actual = loadDemoProductDelivery(env, { mode: 'password' }).read(evaluatedAt);
  assert.deepEqual(fixture, actual, `Immutable API wire drift: ${name}`);
  assert.deepEqual(normalizeProductDelivery(actual), actual);
}
console.log('All three Product & Delivery browser fixtures match the immutable API compiler and private loader.');
