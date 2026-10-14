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
for (const [name, env] of [
  ['product-delivery-fixture.json', {}],
  ['product-delivery-known-fixture.json', {
    DEMO_PRODUCT_DELIVERY_SNAPSHOT: JSON.stringify(compileProductDeliveryReport(source)),
  }],
]) {
  const fixture = JSON.parse(readFileSync(new URL(`../tests/support/${name}`, import.meta.url), 'utf8'));
  const actual = loadDemoProductDelivery(env, { mode: 'password' }).read(now);
  assert.deepEqual(fixture, actual, `Immutable API wire drift: ${name}`);
  assert.deepEqual(normalizeProductDelivery(actual), actual);
}
console.log('Both Product & Delivery browser fixtures match the immutable API compiler and private loader.');
