import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { LIVE_METRICS, normalizeLiveMeasurements } from '../src/platform-admin/live-metrics-contracts.js';
import { normalizeLiveMetrics } from '../src/platform-admin/demo/live-metrics-api.js';

if (process.argv.length !== 3) throw new TypeError('An immutable API checkout is required.');
const apiRoot = resolve(process.argv[2]);
const api = await import(pathToFileURL(resolve(apiRoot, 'src/demo/platform-live-metrics.js')));
const contract = await import(pathToFileURL(resolve(apiRoot, 'src/observability/live-metrics-contract.js')));
const source = JSON.parse(readFileSync(resolve(apiRoot, 'tests/support/daily-live-source-fixture.json'), 'utf8'));
const actual = await api.createDailyLiveMetrics({ clock: () => Date.parse(source.observedAt),
  storage: { read: async () => JSON.stringify(source) } }).read();
const fixture = JSON.parse(readFileSync(new URL('../tests/support/daily-live-metrics-fixture.json', import.meta.url), 'utf8'));
assert.deepEqual(LIVE_METRICS, contract.LIVE_METRICS);
assert.equal(readFileSync(new URL('../src/platform-admin/live-metrics-contracts.js', import.meta.url), 'utf8'),
  readFileSync(resolve(apiRoot, 'src/observability/live-metrics-contract.js'), 'utf8')
    .replace("'./product-delivery-contract.js'", "'./product-delivery-contracts.js'"), 'Closed measurement validation drift');
assert.deepEqual(normalizeLiveMeasurements(actual.measurements, actual.observedAt), actual.measurements);
assert.deepEqual(fixture, actual, 'Daily live snapshot drift from immutable API');
assert.deepEqual(normalizeLiveMetrics(actual), actual);
console.log('Daily live metrics match the immutable API contract and real reader.');
