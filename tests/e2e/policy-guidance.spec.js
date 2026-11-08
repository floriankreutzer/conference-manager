import { test, expect } from '@playwright/test';

async function fixture(page, language, unavailable = false) {
  await page.goto('/');
  await page.evaluate(async ({ language: lang, unavailable: missing }) => {
    const { setLanguage } = await import('/src/core/i18n.js');
    const { createBookingPoliciesSection } = await import('/src/tenant-admin/sections/booking-policies/index.js');
    const { createTenantAdminSettingsShell } = await import('/src/tenant-admin/settings-shell.js');
    setLanguage(lang);
    const state = { revision: 3, writes: [], mode: 'ready', configuration: { versions: [{
      id: 'future', effectiveFrom: '2099-01-01T00:00:00.000Z', rules: {
        minimumLeadTimeMinutes: 60, maximumAdvanceMinutes: 527040,
        cancellationWindowMinutes: 120, changeWindowMinutes: 120, maximumParticipants: 50,
        allowedSiteIds: ['site-old', 'site-a'], allowedRoomIds: [], allowedServiceIds: [],
      },
    }] } };
    window.policyTest = state;
    const adapter = {
      async loadBookingPolicies() { return structuredClone({ revision: state.revision, configuration: state.configuration }); },
      async listBookingPoliciesHistory() { return [{ revision: state.revision, changedAt: '2026-01-01T00:00:00.000Z' }]; },
      async loadBookingPoliciesRevision() {},
      async loadReferenceCatalog() {
        if (missing) throw new Error('TEST_UNAVAILABLE');
        return { sites: [{ id: 'site-a', name: 'Berlin Campus' }, { id: 'site-b', name: 'Stuttgart Campus' }],
          rooms: [{ id: 'room-a', name: 'Forum' }], services: [{ id: 'service-a', name: 'AV support' }] };
      },
      async saveBookingPolicies(value) {
        state.writes.push(structuredClone(value));
        if (state.mode === 'conflict') throw Object.assign(new Error('CONFLICT'), {
          code: 'HTTP_409', serverCode: 'TENANT_SETTINGS_REVISION_CONFLICT', currentRevision: 4,
        });
        if (state.mode === 'failed') throw new Error('TEST_SAVE_FAILED');
        state.configuration = structuredClone(value.configuration); state.revision += 1;
      },
    };
    document.body.replaceChildren();
    const root = document.createElement('main'); document.body.appendChild(root);
    history.replaceState(null, '', '#tenant-admin/booking-policies');
    const shell = createTenantAdminSettingsShell({ appRoot: root, setPageHeading() {},
      sections: [createBookingPoliciesSection({ adapter })] });
    shell.render();
  }, { language, unavailable });
  await expect(page.locator('[data-tenant-settings-form="booking-policies"]')).toBeVisible();
}

for (const language of ['de', 'en']) {
  test(`CO-319: named policy selections preserve unknown references, duration and navigation in ${language}`, async ({ page }, testInfo) => {
    await fixture(page, language);
    const form = page.locator('form');
    await expect(form.locator('#tenant-policy-0-advance')).toHaveValue('366');
    await expect(form.getByRole('checkbox', { name: 'Berlin Campus' })).toBeChecked();
    await form.getByRole('checkbox', { name: 'Berlin Campus' }).uncheck();
    await form.getByRole('checkbox', { name: 'Stuttgart Campus' }).check();
    await page.locator('[data-tenant-admin-section="overview"]').click();
    const dialog = page.getByRole('dialog');
    await expect(dialog).toBeVisible(); await page.keyboard.press('Escape');
    await expect(form.getByRole('checkbox', { name: 'Stuttgart Campus' })).toBeChecked();
    await form.locator('button[type="submit"]').click();
    await expect.poll(() => page.evaluate(() => window.policyTest.writes.length)).toBe(1);
    const saved = await page.evaluate(() => window.policyTest.writes[0]);
    expect(saved.expectedRevision).toBe(3);
    expect(saved.configuration.versions[0].rules.allowedSiteIds).toEqual(['site-old', 'site-b']);
    expect(saved.configuration.versions[0].rules.maximumAdvanceMinutes).toBe(527040);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    for (const width of [390, 768, 1366]) {
      await page.setViewportSize({ width, height: 900 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      await testInfo.attach(`policy-${language}-${width}`, { body: await page.screenshot({ fullPage: true }), contentType: 'image/png' });
    }
    await page.locator('[data-tenant-admin-section="overview"]').click();
    await expect(form).toHaveCount(0);
    await expect(page.getByRole('dialog')).toHaveCount(0);
  });

  test(`CO-319: unavailable catalogue and save conflict keep the policy draft in ${language}`, async ({ page }) => {
    await fixture(page, language, true);
    const form = page.locator('form');
    await expect(form.getByRole('checkbox')).toHaveCount(0);
    await expect(form).toContainText(language === 'de' ? 'Auswahl derzeit nicht verfügbar' : 'Selection currently unavailable');
    await form.locator('#tenant-policy-0-participants').fill('42');
    await page.evaluate(() => { window.policyTest.mode = 'failed'; });
    await form.locator('button[type="submit"]').click();
    await expect(form.locator('button[type="submit"]')).toBeEnabled();
    await expect(form.locator('#tenant-policy-0-participants')).toHaveValue('42');
    await page.evaluate(() => { window.policyTest.mode = 'conflict'; });
    await form.locator('button[type="submit"]').click();
    await expect(page.locator('[data-tenant-settings-conflict-reload]')).toBeVisible();
    await expect(form.locator('#tenant-policy-0-participants')).toHaveValue('42');
    await expect(page.locator('[data-tenant-settings-conflict-reapply]')).toHaveCount(0);
    expect(await page.evaluate(() => window.policyTest.writes[1].configuration.versions[0].rules.allowedSiteIds))
      .toEqual(['site-old', 'site-a']);
    await page.locator('[data-tenant-settings-conflict-reload]').click();
    await expect(page.getByRole('dialog')).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(form.locator('#tenant-policy-0-participants')).toHaveValue('42');
    expect(await page.evaluate(() => window.policyTest.writes.length)).toBe(2);
  });
}
