import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { normalizeProductDelivery } from '../src/platform-admin/product-delivery-contracts.js';
import { normalizeRuntimeProductReport } from '../src/platform-admin/product-runtime-contract.js';

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

const { compileRuntimeProductReport } = await import(pathToFileURL(resolve(apiRoot,
  'src/observability/product-runtime-report.js')));
const { normalizeRuntimeProductReport: normalizeApiRuntimeProductReport } = await import(pathToFileURL(resolve(apiRoot,
  'src/observability/product-runtime-contract.js')));
assert.equal(readFileSync(new URL('../src/platform-admin/product-runtime-contract.js', import.meta.url), 'utf8'),
  '// Mirrors the Operations API product-runtime-contract.js; keep the closed wire contract synchronized.\n'
    + readFileSync(resolve(apiRoot, 'src/observability/product-runtime-contract.js'), 'utf8')
      .replace("'./product-delivery-contract.js'", "'./product-delivery-contracts.js'"),
  'Closed runtime Product validation drift');

// These synthetic audit facts exercise the real compiler; no collected customer data is used.
const runtimeSource = JSON.parse(readFileSync(new URL('../tests/support/product-runtime-source-fixture.json', import.meta.url), 'utf8'));
const runtimeFixture = JSON.parse(readFileSync(new URL('../tests/support/product-runtime-compiled-fixture.json', import.meta.url), 'utf8'));
const runtimeActual = compileRuntimeProductReport(runtimeSource);
assert.deepEqual(runtimeFixture, runtimeActual, 'Immutable API wire drift: product-runtime-compiled-fixture.json');
assert.deepEqual(normalizeApiRuntimeProductReport(runtimeActual), runtimeActual);
assert.deepEqual(normalizeRuntimeProductReport(runtimeActual), runtimeActual);
console.log('All three v1 Product & Delivery fixtures and the compiled v2 runtime Product fixture match the immutable API.');
