import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

import { createDemoTenantPresentationApi } from '../src/platform/tenant-presentation-api.js';
import { createDemoOrganizationSettings } from '../src/tenant-admin/sections/organization/demo-adapter.js';

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

test('normal Demo tenant projection keeps Conference Manager on the PAVUREL product default', async () => {
  const organizationSettings = createDemoOrganizationSettings();
  const presentationApi = createDemoTenantPresentationApi({ organizationSettings });

  const first = await presentationApi.loadPresentation();
  assert.equal(first.revision, 1);
  assert.equal(first.presentation.displayName, 'Conference Manager');
  assert.equal(first.presentation.branding.logoPreset, 'product-default');

  const organization = await organizationSettings.loadOrganization();
  assert.equal(organization.organization.branding.logoAssetRef, null);

  organizationSettings.reset();
  const afterReset = await presentationApi.loadPresentation();
  assert.equal(afterReset.presentation.displayName, 'Conference Manager');
  assert.equal(afterReset.presentation.branding.logoPreset, 'product-default');
});

test('Demo runbook documents the same Conference Manager and PAVUREL baseline as the runtime', async () => {
  const runbook = await source('docs/DEMO-RUNBOOK.md');

  assert.match(runbook, /effective presentation is Conference Manager, German, EUR and the code-shipped PAVUREL product-default signet/i);
  assert.match(runbook, /role change recreates their fixtures[\s\S]*PAVUREL product-default presentation/i);
  assert.doesNotMatch(runbook, /Northstar Events/i);
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
