import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { normalizeProviderUsage } from '../src/platform-admin/provider-usage-contracts.js';

if (process.argv.length !== 3) throw new TypeError('An immutable API checkout is required.');
const apiRoot = resolve(process.argv[2]);
const { loadDemoProviderUsage } = await import(pathToFileURL(resolve(apiRoot, 'src/demo/platform-provider-usage.js')));
const source = JSON.parse(readFileSync(new URL('../tests/support/provider-usage-source-fixture.json', import.meta.url), 'utf8'));
for (const [name, observedAt, evaluatedAt] of [
  ['provider-usage-fixture.json', '2026-10-15T00:00:00.000Z', '2026-10-15T12:00:00.000Z'],
  ['provider-usage-refreshed-fixture.json', '2026-10-16T00:00:00.001Z', '2026-10-16T00:00:00.001Z'],
]) {
  const input = structuredClone(source); input.finops.current.observedAt = observedAt;
  const actual = loadDemoProviderUsage({ DEMO_PROVIDER_USAGE_SNAPSHOT: JSON.stringify(input) }, { mode: 'password' })
    .read(Date.parse(evaluatedAt));
  const fixture = JSON.parse(readFileSync(new URL(`../tests/support/${name}`, import.meta.url), 'utf8'));
  assert.deepEqual(fixture, actual, `Immutable API wire drift: ${name}`);
  assert.deepEqual(normalizeProviderUsage(actual), actual);
}
console.log('Both Provider snapshots match the immutable API loader and FinOps policy.');
