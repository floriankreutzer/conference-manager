import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { asProductionHtml } from './e2e/fixtures/production-html.js';

test('Production browser fixture follows the current immutable bootstrap cache marker', async () => {
  const demo = await readFile('index.html', 'utf8');
  const production = asProductionHtml(demo);
  const demoMarker = demo.match(/src\/platform\/demo-bootstrap\.js(\?v=[A-Za-z0-9._-]+)?/)?.[1];
  const productionMarker = production.match(
    /src\/platform\/production-bootstrap\.js(\?v=[A-Za-z0-9._-]+)?/,
  )?.[1];
  assert.match(production, /conference-runtime" content="production/);
  assert.equal(productionMarker, demoMarker);
  assert.doesNotMatch(production, /src\/platform\/demo-bootstrap\.js/);
});

test('Production browser fixture fails closed when either canonical marker drifts', () => {
  assert.throws(() => asProductionHtml('<html></html>'), /PRODUCTION_HTML_RUNTIME_MARKER_INVALID/);
  assert.throws(
    () => asProductionHtml('<meta name="conference-runtime" content="demo">'),
    /PRODUCTION_HTML_BOOTSTRAP_MARKER_INVALID/,
  );
});
