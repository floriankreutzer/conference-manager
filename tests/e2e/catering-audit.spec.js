import { expect, test } from '@playwright/test';

for (const language of ['de', 'en']) {
  test(`Tenant Admin reads minimized Catering history and configuration summaries in ${language}`, async ({ page }) => {
    await page.goto('/');
    await page.evaluate(async (lang) => {
      const { createAuditSection } = await import('/src/tenant-admin/sections/audit/index.js');
      const { createTenantAuditApi } = await import('/src/platform/tenant-audit-api.js');
      const { setLanguage } = await import('/src/core/i18n.js');
      setLanguage(lang);
      const identity = '22222222-2222-4222-8222-222222222222';
      const api = createTenantAuditApi({ apiClient: { async request() {
        return { events: [{ id: '42', category: 'request', action: 'catering.order.decided',
          actor: { userId: null }, target: { type: 'catering_order', id: identity }, outcome: 'success',
          occurredAt: '2026-10-19T10:00:00.000Z', correlationId: identity,
          change: { before: { status: 'pending_manager_review' }, after: { revision: 3, status: 'released' },
            summary: { activeCateringItemCount: 3, cateringItemCount: 4 } } }],
          nextBeforeId: null, window: { from: '2026-10-01T00:00:00.000Z', to: '2026-10-19T12:00:00.000Z' },
          requestId: identity };
      } } });
      document.body.replaceChildren();
      const root = document.createElement('main'); document.body.appendChild(root);
      const section = createAuditSection({ adapter: api });
      const render = () => section.render({ root, isCurrent: () => true, rerender: render });
      await render();
    }, language);
    const heading = language === 'de' ? 'Catering-Kostenentscheidung erfasst' : 'Catering cost decision recorded';
    await expect(page.getByRole('heading', { name: heading })).toBeVisible();
    const disclosure = page.locator('.tenant-audit-change > summary');
    await disclosure.focus(); await page.keyboard.press('Enter');
    await expect(page.getByText(language === 'de' ? 'Kostenentscheidung ausstehend' : 'Cost decision pending',
      { exact: true })).toBeVisible();
    await expect(page.getByText(language === 'de' ? 'Freigegeben' : 'Released', { exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: language === 'de' ? 'Zusammenfassung' : 'Summary', exact: true })).toBeVisible();
    await expect(page.getByText(language === 'de' ? 'Aktive Catering-Artikel' : 'Active catering items',
      { exact: true })).toBeVisible();
    expect(await page.locator('main').innerText()).not.toMatch(/amountMinor|providerPayload|undefined/);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  });
}
