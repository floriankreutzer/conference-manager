import { expect, test } from '@playwright/test';

const ORIGIN = 'https://127.0.0.1:4173';
const TENANT = '11111111-1111-4111-8111-111111111111';
const CORRELATION = '22222222-2222-4222-8222-222222222222';

// Isolated presentation/wire regression, not an authentication or Hosted claim.
// Render the actual section and production API adapter; only the loopback API
// response is substituted. Existing full authorization suites remain required.
async function setup(browser, timezoneId, language) {
  const { viewport, deviceScaleFactor, isMobile, hasTouch, userAgent } = test.info().project.use;
  const context = await browser.newContext({ viewport, deviceScaleFactor, isMobile, hasTouch, userAgent,
    timezoneId, ignoreHTTPSErrors: true });
  const page = await context.newPage();
  await page.clock.install({ time: new Date('2026-07-01T12:34:00.000Z') });
  const requests = [];
  await page.route(`${ORIGIN}/platform-admin/`, route => route.fulfill({ contentType: 'text/html', body:
    '<!doctype html><html lang="de"><meta name="viewport" content="width=device-width,initial-scale=1">'
    + '<title>Isolated diagnostic form</title><link rel="stylesheet" href="/assets/tokens.css">'
    + '<link rel="stylesheet" href="/assets/styles.css"><link rel="stylesheet" href="/assets/platform-admin.css">'
    + '<main id="diagnosticsFixture"></main></html>',
  }));
  await page.route(`${ORIGIN}/api/v1/platform/**`, async route => {
    const url = new URL(route.request().url());
    expect(url.pathname).toBe(`/api/v1/platform/tenants/${TENANT}/diagnostics/correlations/${CORRELATION}`);
    const query = Object.fromEntries(url.searchParams); requests.push(query);
    await route.fulfill({ contentType: 'application/json', body: JSON.stringify({ schemaVersion: 1,
      tenantId: TENANT, lookupCorrelationId: CORRELATION, from: query.from, to: query.to, items: [] }) });
  });
  await page.goto(`${ORIGIN}/platform-admin/`);
  await page.evaluate(async ({ tenantId, language }) => {
    const { setLanguage } = await import('/src/core/i18n.js');
    const { renderPlatformAdminTenantSection } = await import('/src/platform-admin/tenant-sections.js');
    const { createPlatformAdminApi } = await import('/src/platform-admin/production/platform-api.js');
    setLanguage(language);
    const api = createPlatformAdminApi({ apiClient: { async request(path) {
      const response = await fetch('/api/v1/platform/' + path); return response.json();
    } } });
    const resource = { status: 'ready', data: { correlation: null, summary: { summary: {
      tenant: { lifecycleStatus: 'active' }, readiness: { state: 'ready' }, microsoft: { healthState: 'healthy' },
      entitlements: { enabledCount: 2 }, mappings: { active: 1, total: 1 }, deployment: { release: null },
    } } } };
    const render = () => document.querySelector('#diagnosticsFixture').replaceChildren(renderPlatformAdminTenantSection({
      sectionId: 'diagnostics', resource, operationProofAvailable: true,
      operator: { permissions: ['platform:diagnostics:read', 'platform:diagnostics:sensitive'], assurance: { level: 'mfa' } },
      async onCorrelationLookup(query) {
        resource.data.correlation = await api.lookupCorrelation({ tenantId, ...query }); render();
      },
    }));
    render();
  }, { tenantId: TENANT, language });
  return { context, page, requests };
}

for (const zone of ['UTC', 'Europe/Berlin']) for (const language of ['de', 'en']) {
  test(`diagnostic ${language} input and sent range agree in ${zone}`, async ({ browser }) => {
    const { context, page, requests } = await setup(browser, zone, language);
    try {
      const from = page.locator('#platformAdminCorrelationFrom');
      const to = page.locator('#platformAdminCorrelationTo');
      await expect(page.locator('#platformAdminCorrelationTimeZone')).toContainText(zone);
      await expect(from).toHaveValue(zone === 'UTC' ? '2026-06-30T12:34' : '2026-06-30T14:34');
      await expect(to).toHaveValue(zone === 'UTC' ? '2026-07-01T12:34' : '2026-07-01T14:34');
      await page.locator('#platformAdminCorrelationId').fill(CORRELATION);
      await from.fill('2026-01-15T09:15'); await to.fill('2026-01-15T10:45');
      await page.getByRole('button', { name: language === 'de' ? 'Korrelation suchen' : 'Find correlation', exact: true }).click();
      await expect(page.getByText(language === 'de'
        ? 'Für diese Korrelation wurden im gewählten Zeitraum keine Ereignisse gefunden.'
        : 'No events were found for this correlation in the selected period.')).toBeVisible();
      expect(requests).toEqual([{ from: zone === 'UTC' ? '2026-01-15T09:15:00.000Z' : '2026-01-15T08:15:00.000Z',
        to: zone === 'UTC' ? '2026-01-15T10:45:00.000Z' : '2026-01-15T09:45:00.000Z', limit: '100' }]);
      await expect(from).toHaveValue('2026-01-15T09:15'); await expect(to).toHaveValue('2026-01-15T10:45');
      await expect(page.locator('#platformAdminCorrelationId')).toHaveValue(CORRELATION);
      for (const width of [320, 1280]) {
        await page.setViewportSize({ width, height: 900 });
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        if (zone === 'Europe/Berlin') await test.info().attach(`diagnostics-${language}-${width}`, {
          body: await page.screenshot(), contentType: 'image/png',
        });
      }
    } finally { await context.close(); }
  });
}

for (const language of ['de', 'en']) test(`diagnostic ${language} rejects Berlin DST gaps and overlaps before HTTP`, async ({ browser }) => {
  const { context, page, requests } = await setup(browser, 'Europe/Berlin', language);
  try {
    await page.locator('#platformAdminCorrelationId').fill(CORRELATION);
    const from = page.locator('#platformAdminCorrelationFrom');
    const to = page.locator('#platformAdminCorrelationTo');
    for (const date of ['2026-03-29', '2026-10-25']) {
      await from.fill(`${date}T02:30`); await to.fill(`${date}T03:30`);
      await page.getByRole('button', { name: language === 'de' ? 'Korrelation suchen' : 'Find correlation', exact: true }).click();
      expect(await from.evaluate(control => control.validity.customError)).toBe(true);
      await expect(from).toBeFocused(); expect(requests).toEqual([]);
    }
    await from.fill('2026-10-25T03:00');
    expect(await from.evaluate(control => control.validity.customError)).toBe(false);
    await page.getByRole('button', { name: language === 'de' ? 'Korrelation suchen' : 'Find correlation', exact: true }).click();
    await expect(page.locator('#platformAdminCorrelationFrom')).toHaveValue('2026-10-25T03:00');
    await expect.poll(() => requests.length).toBe(1);
    expect(requests[0]).toEqual({ from: '2026-10-25T02:00:00.000Z', to: '2026-10-25T02:30:00.000Z', limit: '100' });
  } finally { await context.close(); }
});
