import { expect, test } from '@playwright/test';

// Actual native renderer with strict, isolated server DTOs. This proves display,
// keyboard and freshness semantics, not provider connectivity or live consent.
for (const language of ['de', 'en']) test(`integration target exposes permission and evidence values in ${language}`, async ({ page }, testInfo) => {
  await page.route('**/platform-admin/', route => route.fulfill({ contentType: 'text/html', body:
    '<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<title>Integration target acceptance</title><link rel="stylesheet" href="/assets/tokens.css">'
    + '<link rel="stylesheet" href="/assets/styles.css"><link rel="stylesheet" href="/assets/platform-admin.css">'
    + '<main id="integrationFixture" class="platform-admin-page" data-platform-admin-page="integration-health"></main></html>' }));
  await page.goto('/platform-admin/');
  await page.evaluate(async language => {
    const { setLanguage } = await import('/src/core/i18n.js');
    const { renderPlatformFleetView } = await import('/src/platform-admin/fleet-sections.js');
    const { normalizePlatformMicrosoftHealthPage } = await import('/src/platform-admin/resource-contracts.js');
    setLanguage(language); window.integrationReloads = 0;
    const data = normalizePlatformMicrosoftHealthPage({ schemaVersion: 1, snapshotAt: '2026-10-30T10:00:00.000Z', nextCursor: null,
      items: [{ tenantId: '11111111-1111-4111-8111-111111111111', displayName: 'Integration customer',
        lifecycle: { status: 'active', revision: 1 }, connectionState: 'connected',
        permissions: { places: 'granted', calendars: 'missing' }, mappings: { active: 1, missing: 1, total: 2 },
        capabilities: [
          { capability: 'places', status: 'healthy', reasonCode: null, checkedAt: '2026-10-30T09:59:00.000Z',
            lastSuccessAt: '2026-10-30T09:58:00.000Z', freshness: 'fresh', incidentScope: 'unknown' },
          { capability: 'free_busy', status: 'unavailable', reasonCode: 'provider.unavailable', checkedAt: '2026-10-29T09:00:00.000Z',
            lastSuccessAt: null, freshness: 'stale', incidentScope: 'provider' },
          { capability: 'calendar_write', status: 'permission_missing', reasonCode: 'permission.missing', checkedAt: null,
            lastSuccessAt: null, freshness: 'unknown', incidentScope: 'tenant' },
        ] }],
    });
    document.querySelector('#integrationFixture').append(renderPlatformFleetView({ view: 'integration-health', resource: { status: 'ready', data },
      onRetry() { window.integrationReloads++; } }));
  }, language);
  const permissions = page.locator('.platform-admin-integration-permissions');
  await expect(permissions).toContainText(language === 'de' ? 'Erteilt' : 'Granted');
  await expect(permissions).toContainText(language === 'de' ? 'Fehlt' : 'Missing');
  await expect(page.locator('tbody tr')).toHaveCount(3);
  const fresh = page.locator('[data-integration-capability="places"]');
  await expect(fresh.locator('[data-state="healthy"]')).toHaveAttribute('data-tone', 'positive');
  await expect(fresh.locator('time')).toHaveCount(2);
  const stale = page.locator('[data-integration-capability="free_busy"]');
  await expect(stale.locator('[data-state="stale"]')).toHaveAttribute('data-tone', 'neutral');
  await expect(stale.locator('[data-state="unavailable"]')).toHaveCount(0);
  await expect(stale).toContainText(language === 'de' ? 'Zuletzt beobachtet: Nicht verfügbar' : 'Last observed: Unavailable');
  const unknown = page.locator('[data-integration-capability="calendar_write"]');
  await expect(unknown.locator('[data-state="unknown"]')).toHaveAttribute('data-tone', 'neutral');
  await expect(unknown).not.toContainText('platformAdmin.');
  await expect(stale.locator('code')).toHaveCount(2);
  for (const code of await stale.locator('code').all()) await expect(code).toBeHidden();
  await stale.locator('summary').focus(); await page.keyboard.press('Enter');
  await expect(stale.locator('code').first()).toHaveText('free_busy');
  await expect(stale.locator('code').first()).toBeVisible(); await stale.locator('summary').press('Enter');
  await page.getByRole('button', { name: language === 'de' ? 'Bericht neu laden' : 'Reload report', exact: true }).click();
  expect(await page.evaluate(() => window.integrationReloads)).toBe(1);
  for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.getByRole('region').focus(); await expect(page.getByRole('region')).toBeFocused();
    await testInfo.attach(`integration-target-${language}-${width}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
  }
});
