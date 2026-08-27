import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const EXPECTED_THEME = '#7A1F3D';

async function source(path) {
  return readFile(new URL(`../${path}`, import.meta.url), 'utf8');
}

test('PAVUREL is the code-shipped product-default shell and browser identity', async () => {
  const [index, runtime] = await Promise.all([
    source('index.html'),
    source('src/platform/tenant-presentation-runtime.js'),
  ]);

  assert.match(index, /<meta name="theme-color" content="#7A1F3D">/);
  assert.match(index, /<link rel="icon" href="\.\/assets\/brand\/pavurel-app-icon\.svg" type="image\/svg\+xml">/);
  assert.match(index, /<img src="\.\/assets\/brand\/pavurel-signet-monochrome-white\.svg" alt="" decoding="async">/);
  assert.match(runtime, /pavurel-signet-monochrome-white\.svg\?v=20260827-75/);
  assert.doesNotMatch(runtime, /https?:\/\/[^'"`]+pavurel/i);
});

test('approved PAVUREL runtime SVG masters retain the governed palette and local-only structure', async () => {
  const [signet, reversedSignet, appIcon] = await Promise.all([
    source('assets/brand/pavurel-signet.svg'),
    source('assets/brand/pavurel-signet-monochrome-white.svg'),
    source('assets/brand/pavurel-app-icon.svg'),
  ]);

  assert.match(signet, new RegExp(EXPECTED_THEME));
  assert.match(signet, /#C29A6B/);
  assert.match(reversedSignet, /#FFFFFF/);
  assert.match(appIcon, /<rect[^>]+fill="#7A1F3D"/);
  assert.match(appIcon, /stroke="#FFFFFF"/);
  assert.match(appIcon, /stroke="#C29A6B"/);

  for (const asset of [signet, reversedSignet, appIcon]) {
    assert.doesNotMatch(asset, /<script\b/i);
    assert.doesNotMatch(asset, /(?:href|xlink:href)\s*=\s*["']https?:/i);
    assert.doesNotMatch(asset, /url\(\s*["']?https?:/i);
  }
});
