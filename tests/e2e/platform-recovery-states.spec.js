import { expect, test } from '@playwright/test';

const FIRST_USER = '11111111-1111-4111-8111-111111111111';
const SECOND_USER = '22222222-2222-4222-8222-222222222222';

// Actual native renderer and controls, with isolated normalized resources and
// mocked external effects. No protected production operation is executed here.
async function mount(page, language, status) {
  await page.route('**/platform-admin/', route => route.fulfill({ contentType: 'text/html', body:
    '<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<title>Recovery acceptance</title><link rel="stylesheet" href="/assets/tokens.css">'
    + '<link rel="stylesheet" href="/assets/styles.css"><link rel="stylesheet" href="/assets/platform-admin.css">'
    + '<main id="recoveryFixture"></main></html>' }));
  await page.goto('/platform-admin/');
  await page.evaluate(async ({ language, status, first, second }) => {
    const { setLanguage } = await import('/src/core/i18n.js');
    const { renderPlatformAdminTenantSection } = await import('/src/platform-admin/tenant-sections.js');
    setLanguage(language);
    const root = document.querySelector('#recoveryFixture');
    let resource = { status, data: null };
    window.recoveryPreviewCount = 0; window.recoveryExecuteCount = 0; window.recoveryFail = true;
    const ready = (items = []) => ({ status: 'ready', data: { previews: {}, targets: {
      'last-tenant-admin': { items, nextCursor: null }, 'room-mapping-repair': { items: [], nextCursor: null },
      'user-session-revocation': { items: [], nextCursor: null },
    } } });
    if (status === 'ready') resource = ready([first, second].map(targetUserId => ({ targetUserId, eligible: true })));
    function render() {
      root.replaceChildren(renderPlatformAdminTenantSection({ sectionId: 'recovery', resource,
        operator: { permissions: ['platform:recovery:execute'], assurance: { level: 'mfa' } }, operationProofAvailable: true,
        onRetry() { resource = ready(); render(); },
        async onRecoveryPreview(id, target) {
          window.recoveryPreviewCount++;
          await new Promise(resolve => { window.releaseRecovery = resolve; });
          if (window.recoveryFail) throw new Error('UNAVAILABLE');
          resource.data.previews[id] = { targetId: target.targetUserId,
            expiresAt: '2099-01-01T00:00:00.000Z', impactCodes: ['sessions_revoked'] };
          render();
        },
        onRecoveryExecute() { window.recoveryExecuteCount++; },
      }));
    }
    render();
  }, { language, status, first: FIRST_USER, second: SECOND_USER });
}

for (const language of ['de', 'en']) {
  test(`recovery ${language} exposes loading and failed target retrieval with retry`, async ({ page }) => {
    await mount(page, language, 'loading');
    await expect(page.getByRole('status')).toContainText(language === 'de' ? 'geladen' : 'Loading');
    await expect(page.getByRole('combobox')).toHaveCount(0);
    await mount(page, language, 'error');
    await expect(page.getByRole('alert')).toBeVisible();
    await page.getByRole('button', { name: language === 'de' ? 'Erneut laden' : 'Retry', exact: true }).click();
    await expect(page.getByRole('alert')).toHaveCount(0);
    await expect(page.getByText(language === 'de' ? /Auf dieser geladenen Seite ist kein geeignetes Ziel/ : /No eligible target is available/).first()).toBeVisible();
    await expect(page.locator('[data-platform-admin-recovery-preview="last-tenant-admin"]')).toBeDisabled();
  });

  test(`recovery ${language} preserves targets on error and binds execution to the previewed target`, async ({ page }) => {
    const errors = []; page.on('pageerror', error => errors.push(error.message));
    await mount(page, language, 'ready');
    const select = page.locator('#platformAdminRecoveryTarget-last-tenant-admin');
    const preview = page.locator('[data-platform-admin-recovery-preview="last-tenant-admin"]');
    const card = page.locator('article').filter({ has: preview });
    await expect(preview).toBeDisabled(); await select.selectOption(FIRST_USER); await preview.click();
    await expect(card).toHaveAttribute('aria-busy', 'true'); await expect(select).toBeDisabled();
    expect(await page.evaluate(() => window.recoveryPreviewCount)).toBe(1);
    await page.evaluate(() => window.releaseRecovery());
    await expect(card.getByRole('alert')).toContainText(language === 'de' ? 'Auswahl bleibt erhalten' : 'selection is preserved');
    await expect(select).toHaveValue(FIRST_USER); await expect(preview).toBeFocused();
    await page.evaluate(() => { window.recoveryFail = false; });
    await preview.click(); await expect.poll(() => page.evaluate(() => window.recoveryPreviewCount)).toBe(2);
    await page.evaluate(() => window.releaseRecovery());
    const execute = page.locator('[data-platform-admin-recovery-execute="last-tenant-admin"]');
    await expect(execute).toBeEnabled(); await expect(select).toHaveValue(FIRST_USER);
    await select.selectOption(SECOND_USER); await expect(execute).toBeDisabled();
    expect(await page.evaluate(() => window.recoveryExecuteCount)).toBe(0);
    expect(errors).toEqual([]);
    for (const width of [320, 1280]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await test.info().attach(`recovery-${language}-${width}`, { body: await page.screenshot(), contentType: 'image/png' });
    }
  });
}
