import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { acceptanceGateEnabled, createOriginContext } from '../support/origin-context.mjs';
import { tenantBulkCsvToDocument, tenantBulkDocumentToCsv } from '../../src/shared/tenant-bulk-csv.js';
import { contextFor, headers, json, NORTHWIND, ORIGINS, reset } from '../e2e-saas37/scenario-support.js';

async function openBusiness(page, section) {
  await page.locator('[data-view="manager"]').click();
  await page.getByRole('tab', { name: 'Administration', exact: true }).click();
  await page.getByRole('button', { name: 'Business-Einstellungen', exact: true }).click();
  if (section !== 'Räume') await page.getByRole('button', { name: section, exact: true }).click();
  await expect(page.locator('#viewTitle')).toBeFocused();
}

async function downloadCsv(panel, page, name) {
  const pending = page.waitForEvent('download');
  await panel.getByRole('button', { name, exact: true }).click();
  const download = await pending;
  return readFile(await download.path(), 'utf8');
}

test('Business CSV validates, applies, reloads and reimports every owned data type against PostgreSQL', async ({ browser }) => {
  test.setTimeout(300_000);
  const platform = await createOriginContext(browser, { origin: ORIGINS.platform, ignoreHTTPSErrors: !acceptanceGateEnabled() });
  const customer = await createOriginContext(browser, { origin: ORIGINS.customer, ignoreHTTPSErrors: !acceptanceGateEnabled(), locale: 'de-DE' });
  let seeded = false;
  try {
    // Chromium runs first and owns the initial process-wide rate-limit wait.
    // WebKit starts only after the preceding shared-runtime test has already
    // waited for the same real 60-second window; do not raise or disable it.
    if (browser.browserType().name() === 'chromium') {
      await new Promise((resolve) => setTimeout(resolve, 61_000));
    }
    await reset(platform); seeded = true;
    const session = await contextFor(customer, NORTHWIND, 'conference_manager');
    const page = await customer.newPage();
    await page.goto(ORIGINS.customer);
    for (const [type, section, aggregate] of [
      ['rooms', 'Räume', 'locations'], ['services', 'Services & Ausstattung', 'catalogue'],
      ['equipment', 'Services & Ausstattung', 'catalogue'], ['catering-items', 'Catering', 'catalogue'],
      ['catering-packages', 'Catering', 'catalogue'],
    ]) {
      await openBusiness(page, section);
      let panel = page.locator('[data-tenant-bulk-transfer]');
      await panel.locator('select').selectOption(type);
      const template = await downloadCsv(panel, page, 'Vorlage herunterladen');
      expect(tenantBulkCsvToDocument(template, type).rows).toEqual([]);
      const beforeCsv = await downloadCsv(panel, page, 'Aktuellen Stand exportieren');
      const before = tenantBulkCsvToDocument(beforeCsv, type);
      expect(before.rows.length).toBeGreaterThan(0);
      const changed = { ...before, rows: [{ ...before.rows[0], name: `${before.rows[0].name} CSV` }] };
      const csv = tenantBulkDocumentToCsv(changed);
      // Use the template columns, a real File, the public validation receipt and UI Apply.
      expect(csv.split('\r\n')[0]).toBe(template.split('\r\n')[0]);
      await panel.locator('input[type="file"]').setInputFiles({ name: `${type}.csv`, mimeType: 'text/csv', buffer: Buffer.from(csv) });
      await panel.getByRole('button', { name: 'Datei prüfen', exact: true }).click();
      await expect(panel.getByRole('status')).toContainText('gültig und enthält Änderungen');
      await expect(panel.getByRole('button', { name: 'Geprüfte Änderungen anwenden', exact: true })).toBeEnabled();
      const applyResponse = page.waitForResponse((response) => response.url().endsWith(`/bulk/${type}/apply`)
        && response.request().method() === 'POST');
      await panel.getByRole('button', { name: 'Geprüfte Änderungen anwenden', exact: true }).click();
      const applied = await applyResponse;
      expect(applied.status(), `CSV Apply ${type}`).toBe(200);
      await expect(page.locator('#viewTitle')).toBeFocused();
      const endpoint = `${ORIGINS.customer}/api/v1/tenant/settings/${aggregate}/bulk/${type}/export`;
      const persisted = await json(await customer.request.get(endpoint));
      expect(persisted.document.rows.find((row) => row.id === changed.rows[0].id).name).toBe(changed.rows[0].name);
      await page.reload(); await openBusiness(page, section);
      panel = page.locator('[data-tenant-bulk-transfer]');
      await panel.locator('select').selectOption(type);
      const exported = await downloadCsv(panel, page, 'Aktuellen Stand exportieren');
      const reimported = tenantBulkCsvToDocument(exported, type);
      expect(reimported.rows.find((row) => row.id === changed.rows[0].id).name).toBe(changed.rows[0].name);
      await panel.locator('input[type="file"]').setInputFiles({ name: `${type}-reimport.csv`, mimeType: 'text/csv', buffer: Buffer.from(exported) });
      await panel.getByRole('button', { name: 'Datei prüfen', exact: true }).click();
      await expect(panel.getByRole('status')).toContainText('enthält aber keine Änderungen');
      await expect(panel.getByRole('button', { name: 'Geprüfte Änderungen anwenden', exact: true })).toBeDisabled();
      const denied = await customer.request.post(`${ORIGINS.customer}/api/v1/tenant/settings/${aggregate}/bulk/${type}/validate`, {
        headers: { Origin: ORIGINS.customer }, data: { document: changed },
      });
      expect(denied.status()).toBe(403);
      const unknown = { ...changed, rows: [{ ...changed.rows[0], id: 'foreign-csv-object',
        ...(type === 'rooms' ? {} : { roomIds: ['foreign-room'] }) }] };
      const invalid = await json(await customer.request.post(`${ORIGINS.customer}/api/v1/tenant/settings/${aggregate}/bulk/${type}/validate`, {
        headers: headers(session), data: { document: unknown },
      }));
      expect(invalid.valid).toBe(false); expect(invalid.receipt).toBeNull();
    }
  } finally {
    try {
      if (seeded) await reset(platform);
      // The following shared-runtime test owns the inter-test rate-window wait.
      // Keeping it out of this five-type WebKit journey preserves the existing
      // 300-second per-test cap without raising or disabling the real limit.
    }
    finally { await customer.close(); await platform.close(); }
  }
});
