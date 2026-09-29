import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium, expect, test } from '@playwright/test';

const EXTENSION = fileURLToPath(new URL('./fixtures/browser-zoom-extension/', import.meta.url));
const CUSTOMER = 'https://conference-manager-demo.onrender.com';
const PLATFORM = 'https://conference-manager-ops-demo.onrender.com';

test('portal remains usable at actual Chromium browser zoom 200%', async ({}, testInfo) => {
  test.skip(!process.env.CM_ACTUAL_BROWSER_ZOOM || testInfo.project.name !== 'chromium-desktop',
    'Run in the headed Chromium zoom CI step');
  const profile = await mkdtemp(path.join(os.tmpdir(), 'cm-zoom-'));
  let context;
  try {
    context = await chromium.launchPersistentContext(profile, {
      channel: 'chromium',
      headless: false,
      viewport: { width: 1280, height: 900 },
      ignoreHTTPSErrors: true,
      args: [
        `--disable-extensions-except=${EXTENSION}`,
        `--load-extension=${EXTENSION}`,
      ],
    });
    const worker = context.serviceWorkers()[0]
      || await context.waitForEvent('serviceworker', { timeout: 15_000 });
    const page = await context.newPage();
    await page.goto('https://127.0.0.1:4173/demo-portal/');
    const zoom = await worker.evaluate(async (url) => {
      const tabs = await chrome.tabs.query({});
      const tab = tabs.find((candidate) => candidate.url === url);
      if (!tab?.id) throw new Error('ZOOM_TEST_TAB_MISSING');
      await chrome.tabs.setZoom(tab.id, 2);
      return chrome.tabs.getZoom(tab.id);
    }, page.url());
    expect(zoom).toBe(2);
    await expect(page.getByRole('heading', { name: 'Conference Manager Demo' })).toBeVisible();
    await expect(page.getByRole('link', { name: 'Launch Customer Demo' })).toHaveAttribute('href', CUSTOMER);
    await expect(page.getByRole('link', { name: 'Launch Platform Demo' })).toHaveAttribute('href', PLATFORM);

    const layout = await page.evaluate(() => ({
      viewportWidth: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      gridDisplay: getComputedStyle(document.querySelector('.launch-grid')).display,
      columns: getComputedStyle(document.querySelector('.launch-grid')).gridTemplateColumns.split(' ').length,
      actions: [...document.querySelectorAll('.launch-action')].map((link) => {
        const rect = link.getBoundingClientRect();
        return { left: rect.left, right: rect.right, width: rect.width };
      }),
    }));
    expect(layout.viewportWidth, JSON.stringify(layout)).toBeLessThan(900);
    expect(layout.documentWidth, JSON.stringify(layout)).toBeLessThanOrEqual(layout.viewportWidth + 1);
    expect(layout.gridDisplay).toBe('grid');
    expect(layout.columns).toBe(1);
    for (const action of layout.actions) {
      expect(action.left).toBeGreaterThanOrEqual(0);
      expect(action.right).toBeLessThanOrEqual(layout.viewportWidth + 1);
      expect(action.width).toBeGreaterThan(0);
    }

    await page.keyboard.press('Tab');
    await expect(page.locator('.skip-link')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Launch Customer Demo' })).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByRole('link', { name: 'Launch Platform Demo' })).toBeFocused();
  } finally {
    await context?.close();
    await rm(profile, { recursive: true, force: true });
  }
});
