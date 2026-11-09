import { attachCustomerScreenEvidence } from './fixtures/customer-screen-evidence.js';
import { expect, test } from '@playwright/test';

for (const language of ['de', 'en']) {
  test(`CO-309: compact audit preserves selection, identifiers, pagination and filters in ${language}`, async ({ page }, testInfo) => {
    await page.goto('/');
    await page.evaluate(async (lang) => {
      const { createAuditSection } = await import('/src/tenant-admin/sections/audit/index.js');
      const { setLanguage } = await import('/src/core/i18n.js');
      setLanguage(lang);
      const identity = '22222222-2222-4222-8222-222222222222';
      const event = (id) => ({ id: String(id), category: 'configuration', action: 'tenant.onboarding.invited',
        actor: { userId: id % 2 ? null : identity }, target: { type: 'customer_invitation', id: identity },
        outcome: 'success', occurredAt: '2026-10-20T08:00:00.000Z', correlationId: identity,
        change: { before: null, after: { revision: id, status: 'issued' }, summary: null } });
      window.auditReads = [];
      const section = createAuditSection({ adapter: { async listAuditEvents(query) {
        window.auditReads.push(query);
        return { events: query.outcome === 'denied' ? [] : query.beforeId ? [event(20)] : Array.from({ length: 20 }, (_, i) => event(40 - i)),
          nextBeforeId: query.outcome === 'denied' || query.beforeId ? null : '21',
          window: { from: '2026-10-01T00:00:00.000Z', to: '2026-10-20T12:00:00.000Z' } };
      } } });
      document.body.replaceChildren();
      const root = document.createElement('main'); document.body.appendChild(root);
      const render = () => section.render({ root, isCurrent: () => true, rerender: render });
      await render();
    }, language);
    const rows = page.locator('.tenant-audit-table tbody tr');
    const detail = page.locator('#tenantAuditDetail');
    await expect(rows).toHaveCount(20);
    await expect(page.locator('.tenant-audit-event')).toHaveCount(1);
    await expect(page.locator('.tenant-audit-table')).not.toContainText('22222222');
    const selected = page.locator('[data-tenant-audit-select="38"]');
    await selected.focus(); await page.keyboard.press('Enter');
    await expect(detail.getByRole('heading').first()).toBeFocused();
    await expect(selected).toHaveAttribute('aria-expanded', 'true');
    await expect(detail).toContainText(language === 'de' ? 'Name nicht dokumentiert' : 'name not recorded');
    const technical = detail.locator('.tenant-audit-technical > summary');
    await technical.focus(); await page.keyboard.press('Enter');
    await expect(detail.locator('.tenant-operation-identifier').first()).toHaveText('22222222-2222-4222-8222-222222222222');
    await page.keyboard.press('Escape');
    await expect(detail).toBeHidden(); await expect(selected).toBeFocused();
    await expect(selected).toHaveAttribute('aria-expanded', 'false');
    await selected.press('Enter');
    await detail.getByRole('button', { name: language === 'de' ? 'Details schließen' : 'Close details' }).click();
    await expect(selected).toBeFocused();
    for (const width of [390, 768, 1366]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
    await page.locator('[data-tenant-audit-page="next"]').click();
    await expect(rows).toHaveCount(1);
    await expect(page.locator('.tenant-operations-result-status')).toBeFocused();
    await expect(page.locator('[data-tenant-audit-select="20"]')).toHaveAttribute('aria-expanded', 'true');
    await page.locator('[data-tenant-audit-page="previous"]').click();
    await expect(rows).toHaveCount(20);
    await page.locator('#tenant-audit-actor-filter').fill('invalid');
    await page.getByRole('button', { name: language === 'de' ? 'Filter anwenden' : 'Apply filters' }).click();
    await expect(page.locator('#tenant-audit-actor-filter')).toBeFocused();
    expect(await page.evaluate(() => window.auditReads.length)).toBe(3);
    await page.locator('#tenant-audit-actor-filter').fill('');
    await page.locator('#tenant-audit-outcome-filter').selectOption('denied');
    await page.getByRole('button', { name: language === 'de' ? 'Filter anwenden' : 'Apply filters' }).click();
    await expect(rows).toHaveCount(0); await expect(detail).toHaveCount(0);
    await expect(page.locator('.tenant-operations-result-status')).toContainText('0');
    expect(await page.evaluate(() => window.auditReads.at(-1))).toMatchObject({ outcome: 'denied', beforeId: null, limit: 20 });
    await page.getByRole('button', { name: language === 'de' ? 'Filter zurücksetzen' : 'Reset filters' }).click();
    await expect(rows).toHaveCount(20);
    await attachCustomerScreenEvidence(page, testInfo, { screen: '26', state: 'events-after-filter-reset', roles: ['tenant_admin'], name: `audit-${language}`, composition: 'isolated-component-fixture' });
  });
}
