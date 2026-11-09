import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { chromium, expect, test } from '@playwright/test';
import { acceptanceGateEnabled, createOriginContext, createOriginPersistentContext } from '../support/origin-context.mjs';
import {
  activateContoso, businessDate, CONTOSO, ORIGINS, requests, reset, selectContext, uiResponse,
} from '../e2e-saas37/scenario-support.js';
import { expectRequestCardReflow, expectSubmissionNoticeReflow, readSubmissionNoticeLayout } from '../e2e/fixtures/request-card-layout.js';

const EXTENSION = fileURLToPath(new URL('../e2e/fixtures/browser-zoom-extension/', import.meta.url));

async function setBrowserZoom(worker, page, factor) {
  return worker.evaluate(async ({ url, zoom }) => {
    const tabs = await chrome.tabs.query({});
    const tab = tabs.find((entry) => entry.url === url);
    if (!tab?.id) throw new Error('WORKLIST_ZOOM_TAB_MISSING');
    await chrome.tabs.setZoom(tab.id, zoom);
    return chrome.tabs.getZoom(tab.id);
  }, { url: page.url(), zoom: factor });
}

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

async function centerInZoomViewport(locator) {
  // Nearest-edge scrolling can leave a fractional border outside the viewport
  // at real tab zoom. Center the unchanged content before requiring full visibility.
  await locator.evaluate((node) => node.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' }));
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
    const zoom = await setBrowserZoom(worker, page, 2);
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

test('CO-305: Employee and Manager request cards retain full DE/EN content at actual browser zoom 200%', async ({ browser }, testInfo) => {
  test.skip(!process.env.CM_ACTUAL_BROWSER_ZOOM || testInfo.project.name !== 'chromium-shared-demo',
    'Run in the dedicated headed Chromium zoom CI step');
  const profile = await mkdtemp(path.join(os.tmpdir(), 'cm-request-cards-zoom-'));
  const platformContext = await createOriginContext(browser, { origin: ORIGINS.platform,
    ignoreHTTPSErrors: !acceptanceGateEnabled(), locale: 'de-DE' });
  let customerContext;
  let started = false;
  try {
    await reset(platformContext);
    started = true;
    await activateContoso(await platformContext.newPage());
    customerContext = await createOriginPersistentContext(chromium, profile, {
      origin: ORIGINS.customer, channel: 'chromium', headless: false, locale: 'de-DE',
      viewport: { width: 1366, height: 900 }, ignoreHTTPSErrors: !acceptanceGateEnabled(),
      args: [`--disable-extensions-except=${EXTENSION}`, `--load-extension=${EXTENSION}`],
    });
    const worker = customerContext.serviceWorkers()[0]
      || await customerContext.waitForEvent('serviceworker', { timeout: 15_000 });
    const page = await customerContext.newPage();
    await page.goto(ORIGINS.customer);
    await selectContext(page, CONTOSO, 'conference_manager');

    // Create one genuine own request through the implicit Employee capability.
    // The unchanged reset in finally restores the canonical scenario afterwards.
    const title = 'A'.repeat(160);
    await page.locator('[data-view="employee"]').click();
    await page.locator('#productionTitle').fill(title);
    await page.locator('#productionDate').fill(businessDate());
    await page.locator('#productionStart').fill('09:00');
    await page.locator('#productionEnd').fill('10:00');
    await page.locator('#productionInternal').fill('2');
    await page.locator('#productionExternal').fill('1');
    const next = page.getByRole('button', { name: 'Weiter', exact: true });
    await next.click();
    await page.getByRole('radio', { name: /Paris Atelier/ }).check();
    await uiResponse(page, 'POST', '/api/v1/application/room-availability', () => (
      page.getByRole('button', { name: 'Raumverfügbarkeit prüfen', exact: true }).click()
    ));
    await next.click();
    await next.click();
    await page.locator('#productionDietary').fill('Nut allergy');
    await next.click();
    await next.click();
    await uiResponse(page, 'POST', '/api/v1/application/requests', () => (
      page.getByRole('button', { name: 'Anfrage absenden', exact: true }).click()
    ), 201);
    const created = (await requests(customerContext)).find((entry) => entry.details?.title === title);
    expect(created?.id).toMatch(/^[0-9a-f-]{36}$/i);
    expect(created.status).toBe('Submitted');
    expect(created.details.dietaryRequirements).toBe('Nut allergy');
    expect(created.roomId).toBe('contoso-paris-room-1');
    expect(created.pricing.room.price).toEqual({ amountMinor: 9500, currency: 'EUR' });
    expect(created.allocations.entries).toEqual([]);
    const zoom = await setBrowserZoom(worker, page, 2);
    expect(zoom).toBe(2);
    await expect.poll(() => page.evaluate(() => innerWidth)).toBeLessThan(900);
    const evidence = [];
    for (const language of ['de', 'en']) {
      if (language === 'en') {
        await page.locator('#primaryNavigation button[aria-haspopup="dialog"]').click();
        await page.locator('#profileLanguage').selectOption('en');
        await expect(page.getByRole('dialog')).toHaveCount(0);
      }
      await expect(page.locator('html')).toHaveAttribute('lang', language);
      for (const view of ['requests', 'manager']) {
        await page.locator(`[data-view="${view}"]`).click();
        const card = page.locator(`[data-production-request-id="${created.id}"]`);
        await expect(card.locator('h3')).toHaveText(title);
        await expect(card.locator('.request-card-summary [data-request-fact]')).toHaveCount(6);
        const note = card.locator('.request-critical-note');
        await expect(note).toContainText('Nut allergy');
        const details = card.locator('details.request-business-disclosure');
        await expect(details).not.toHaveAttribute('open');
        await page.evaluate(() => document.fonts.ready);
        let submissionNotice = null;
        if (view === 'requests') {
          const notice = page.locator('[data-ux-submission-success]');
          // Observe the normal toast timeout and fade; never hide it or change the clock.
          await expect(page.locator('#toast')).not.toHaveClass(/\bshow\b/);
          await expect(page.locator('#toast')).toHaveCSS('opacity', '0');
          await centerInZoomViewport(notice);
          const geometry = await readSubmissionNoticeLayout(notice);
          await writeFile(testInfo.outputPath(`request-submission-notice-${language}-200-percent-geometry.json`),
            JSON.stringify({ language, actualTabZoom: zoom, ...geometry }, null, 2));
          await captureZoomViewport(page, testInfo, `request-submission-notice-${language}-200-percent.png`);
          await expect(notice).toBeInViewport({ ratio: 1 });
          submissionNotice = await expectSubmissionNoticeReflow(notice, title);
        }
        const layout = await expectRequestCardReflow(card);
        for (const field of await card.locator('.request-card-summary h3, .request-card-summary dd, .request-critical-note').all()) {
          await centerInZoomViewport(field);
          await expect(field).toBeInViewport({ ratio: 1 });
        }
        await centerInZoomViewport(card.locator('h3'));
        await captureZoomViewport(page, testInfo, `request-summary-${view}-${language}-200-percent.png`);
        const summary = details.locator('summary');
        await summary.focus();
        await expect(summary).toBeFocused();
        await page.keyboard.press('Enter');
        await expect(details).toHaveAttribute('open', '');
        await expect(details.locator('.request-business-details')).toContainText(title);
        await expect(details.locator('.request-business-details')).toContainText('Nut allergy');
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(true);
        await centerInZoomViewport(summary);
        await captureZoomViewport(page, testInfo, `request-details-${view}-${language}-200-percent.png`);
        await page.keyboard.press('Enter');
        await expect(details).not.toHaveAttribute('open');
        const actionLabel = view === 'requests'
          ? (language === 'de' ? 'Anfrage stornieren' : 'Cancel request')
          : (language === 'de' ? 'Prüfung starten' : 'Start review');
        const action = card.getByRole('button', { name: actionLabel, exact: true });
        await action.focus();
        await expect(action).toBeFocused();
        await centerInZoomViewport(action);
        await action.click({ trial: true });
        await expect(action).toBeInViewport({ ratio: 1 });
        const actionBounds = await action.boundingBox();
        expect(actionBounds.width).toBeGreaterThanOrEqual(44);
        expect(actionBounds.height).toBeGreaterThanOrEqual(44);
        await captureZoomViewport(page, testInfo, `request-action-${view}-${language}-200-percent.png`);
        evidence.push({ language, view, actualTabZoom: zoom, ...layout, keyboardDetails: true,
          submissionNotice, primaryAction: { name: actionLabel, ...actionBounds } });
      }
    }
    await writeFile(testInfo.outputPath('request-cards-zoom-evidence.json'), JSON.stringify({
      composition: 'server-backed shared Demo with a real own request',
      titleLength: title.length, allergyOutsideDisclosure: true, evidence,
      limits: 'Actual Chromium tab zoom; no real-device Safari or product acceptance claim',
    }, null, 2));
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
