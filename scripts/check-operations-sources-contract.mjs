import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { normalizeOperationsSources } from '../src/platform-admin/demo/operations-sources-api.js';

if (process.argv.length !== 3) throw new TypeError('An immutable API checkout is required.');
const apiRoot = resolve(process.argv[2]);
const { createOperationsSourceProjection } = await import(pathToFileURL(resolve(apiRoot,
  'src/demo/platform-operations-source-projection.js')));
const { operationsSourceDigest } = await import(pathToFileURL(resolve(apiRoot,
  'src/observability/operations-source-contract.js')));
const source = JSON.parse(readFileSync(resolve(apiRoot, 'tests/support/product-delivery-source-fixture.json'), 'utf8'));
const manual = { ...source, feedbackSource: 'not_configured', feedbackComplete: false, feedback: [] };
const feedback = { observedAt: source.observedAt, periodStart: source.periodStart, periodEnd: source.periodEnd,
  feedbackSource: 'protected_operator_registry', feedbackComplete: false, feedback: [] };
const projection = createOperationsSourceProjection({ clock: () => Date.parse('2026-10-15T13:00:00.000Z'),
  sources: { async read(kind) {
    const envelope = { schemaVersion: 1, environment: 'demo', kind, operatorId: 'synthetic-owner',
      recordedAt: '2026-10-15T12:30:00.000Z', source: kind === 'manual' ? manual : feedback };
    return { envelope, digest: operationsSourceDigest(envelope), sourceState: 'available' };
  } } });
const actual = await projection.read();
const fixture = JSON.parse(readFileSync(new URL('../tests/support/operations-sources-fixture.json', import.meta.url), 'utf8'));
assert.deepEqual(actual, fixture, 'Operator source wire drift from immutable API');
assert.deepEqual(normalizeOperationsSources(actual), actual);
console.log('Protected operator source fixture matches the immutable API projection and compiler.');
