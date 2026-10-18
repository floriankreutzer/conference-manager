import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const ORIGIN = 'https://manager-focus.test';

// Own only the deterministic delayed-frame edge. The real Manager renderer and
// native browser focus run unchanged; fixture ports never become API authority.
test('Manager tab navigation cannot reclaim focus after the next field interaction', async ({ page }) => {
  await page.route(`${ORIGIN}/**`, async route => {
    const url = new URL(route.request().url());
    if (url.pathname === '/') {
      await route.fulfill({ contentType: 'text/html', body: `<!doctype html><html lang="de"><body>
        <h1 id="viewTitle" tabindex="-1">Manager</h1><main id="app"></main>
        <script type="module">
          import { createProductionManagerApplication } from '/src/manager/production-application.js';
          const unavailable = async () => { throw new Error('Unexpected fixture operation'); };
          const persistence = Object.fromEntries(['loadBookingChange','loadRequestRoomContext','proposeBookingChange',
            'decideBookingChange','transitionRequest','loadRequestHistory','loadRequestReport'].map(key => [key, unavailable]));
          persistence.listRequests = async () => [];
          persistence.loadCatalog = async () => ({ sites: [], rooms: [], services: [], equipment: [],
            cateringItems: [], cateringPackages: [] });
          window.delayedManagerFrames = [];
          window.requestAnimationFrame = callback => window.delayedManagerFrames.push(callback);
          const application = createProductionManagerApplication({ appRoot: document.getElementById('app'), persistence,
            setPageHeading: title => { document.getElementById('viewTitle').textContent = title; },
            onOpenBusinessSettings(panel) {
              const field = document.createElement('textarea'); field.id = 'next-room-description'; panel.replaceChildren(field);
            } });
          await application.renderManager(); window.managerFocusReady = true;
        </script></body></html>` }); return;
    }
    const file = path.resolve(ROOT, `.${url.pathname}`);
    if (!file.startsWith(`${ROOT}${path.sep}src${path.sep}`) || !file.endsWith('.js')) {
      await route.abort(); return;
    }
    await route.fulfill({ contentType: 'text/javascript', body: await readFile(file) });
  });
  await page.goto(ORIGIN); await page.waitForFunction(() => window.managerFocusReady === true);
  await page.locator('#managerTab-BOOKINGS').focus(); await page.keyboard.press('End');
  await expect(page.locator('#managerTab-ADMIN')).toBeFocused();
  const input = page.locator('#next-room-description'); await expect(input).toBeVisible(); await input.focus();
  await page.evaluate(() => {
    const callbacks = window.delayedManagerFrames.splice(0);
    callbacks.forEach(callback => callback(performance.now()));
  });
  await expect(input).toBeFocused();
  await page.keyboard.insertText('Completed Studio description');
  await expect(input).toHaveValue('Completed Studio description');
});
