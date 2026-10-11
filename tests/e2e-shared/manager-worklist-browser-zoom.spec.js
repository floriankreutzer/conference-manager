import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium, expect, test } from '@playwright/test';
import { acceptanceGateEnabled, createOriginContext, createOriginPersistentContext } from '../support/origin-context.mjs';
import {
  activateContoso, CONTOSO, ORIGINS, reset, selectContext,
} from '../e2e-saas37/scenario-support.js';

const EXTENSION = fileURLToPath(new URL('../e2e/fixtures/browser-zoom-extension/', import.meta.url));

async function captureZoomViewport(page, testInfo, name) {
  // Playwright supplies a CSS clip that Chromium interprets in physical units
  // at real tab zoom. Let Chromium capture its visible surface without a clip.
  const session = await page.context().newCDPSession(page);
  let screenshot;
  try {
    const { data } = await session.send('Page.captureScreenshot', {
      format: 'png', fromSurface: true, captureBeyondViewport: false,
    });
    screenshot = Buffer.from(data, 'base64');
  } finally {
    await session.detach();
  }
  expect(screenshot.readUInt32BE(16)).toBe(page.viewportSize().width);
  await writeFile(testInfo.outputPath(name), screenshot);
}

test('manager worklist remains operable at actual Chromium browser zoom 200%', async ({ browser }, testInfo) => {
  test.skip(!process.env.CM_ACTUAL_BROWSER_ZOOM || testInfo.project.name !== 'chromium-shared-demo',
    'Run in the dedicated headed Chromium zoom CI step');
  const profile = await mkdtemp(path.join(os.tmpdir(), 'cm-worklist-zoom-'));
  const platformContext = await createOriginContext(browser, { origin: ORIGINS.platform, ignoreHTTPSErrors: !acceptanceGateEnabled(), locale: 'de-DE' });
  let customerContext;
  let started = false;
  try {
    await reset(platformContext);
    started = true;
    const platform = await platformContext.newPage();
    await activateContoso(platform);
    customerContext = await createOriginPersistentContext(chromium, profile, {
      origin: ORIGINS.customer,
      channel: 'chromium', headless: false, locale: 'de-DE',
      viewport: { width: 1280, height: 900 }, ignoreHTTPSErrors: !acceptanceGateEnabled(),
      args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`],
    });
    const worker = customerContext.serviceWorkers()[0]
      || await customerContext.waitForEvent('serviceworker', { timeout: 15_000 });
    const page = await customerContext.newPage();
    await page.goto(ORIGINS.customer);
    await selectContext(page, CONTOSO, 'conference_manager');
    await page.locator('[data-view="manager"]').click();
    await expect(page.getByRole('tab', { name: 'Anfragen & Buchungen', exact: true })).toBeVisible();
    const worklist = page.locator('[data-demo-manager-tasks]');
    await expect(worklist.locator('[data-demo-manager-task]')).toHaveCount(7);
    const zoom = await worker.evaluate(async (url) => {
      const tabs = await chrome.tabs.query({});
      const tab = tabs.find((entry) => entry.url === url);
      if (!tab?.id) throw new Error('WORKLIST_ZOOM_TAB_MISSING');
      await chrome.tabs.setZoom(tab.id, 2);
      return chrome.tabs.getZoom(tab.id);
    }, page.url());
    expect(zoom).toBe(2);
    await expect.poll(() => page.evaluate(() => innerWidth)).toBeLessThan(900);
    await expect(worklist.locator('[data-demo-manager-task]')).toHaveCount(7);
    await expect(worklist).not.toHaveAttribute('open');
    const summary = worklist.locator('summary');
    await summary.focus();
    await expect(summary).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(worklist).toHaveAttribute('open', '');
    await expect(worklist.getByRole('heading', { name: 'Anfragen', exact: true })).toBeVisible();
    await expect(worklist.getByRole('heading', { name: 'Einrichtung & Katalog', exact: true })).toBeVisible();
    const layout = await worklist.evaluate((node) => ({
      viewportWidth: innerWidth,
      documentWidth: document.documentElement.scrollWidth,
      actions: [...node.querySelectorAll('button')].map((action) => {
        const box = action.getBoundingClientRect();
        return { left: box.left, right: box.right, width: box.width, height: box.height };
      }),
    }));
    expect(layout.documentWidth, JSON.stringify(layout)).toBeLessThanOrEqual(layout.viewportWidth + 1);
    expect(layout.actions).toHaveLength(7);
    for (const action of layout.actions) {
      expect(action.left).toBeGreaterThanOrEqual(0);
      expect(action.right).toBeLessThanOrEqual(layout.viewportWidth + 1);
      expect(action.width).toBeGreaterThanOrEqual(44);
      expect(action.height).toBeGreaterThanOrEqual(44);
    }
    await summary.scrollIntoViewIfNeeded();
    await captureZoomViewport(page, testInfo, 'manager-worklist-200-percent.png');
    await worklist.getByRole('button').last().scrollIntoViewIfNeeded();
    await captureZoomViewport(page, testInfo, 'manager-worklist-last-action-200-percent.png');
    await page.keyboard.press('Tab');
    await expect(worklist.getByRole('button').first()).toBeFocused();
    const roomTask = worklist.locator('[data-demo-manager-task="room:description"] button');
    await roomTask.focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('[data-manager-room-id="contoso-paris-room-2"]')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await page.locator('[data-manager-room-id="contoso-paris-room-2"]').scrollIntoViewIfNeeded();
    await captureZoomViewport(page, testInfo, 'manager-room-navigation-200-percent.png');
    await page.getByRole('button', { name: 'Services & Ausstattung', exact: true }).click();
    const fieldHelp = page.locator('.manager-field-help summary').first();
    await fieldHelp.focus();
    await page.keyboard.press('Enter');
    await expect(fieldHelp.locator('..')).toHaveAttribute('open', '');
    await expect(page.locator('select[multiple]').first()).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
    await fieldHelp.scrollIntoViewIfNeeded();
    await captureZoomViewport(page, testInfo, 'manager-business-help-200-percent.png');
    await writeFile(testInfo.outputPath('manager-worklist-zoom-evidence.json'),
      JSON.stringify({ actualTabZoom: zoom, ...layout, keyboardNavigation: true, businessHelpAt200Percent: true }, null, 2));
  } finally {
    try {
      if (started) await reset(platformContext);
    } finally {
      await customerContext?.close();
      await platformContext.close();
      await rm(profile, { recursive: true, force: true });
    }
  }
});
