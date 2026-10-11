import { readFile } from 'node:fs/promises';
import { expect, test } from '@playwright/test';
import { acceptanceGateEnabled, createOriginContext } from '../support/origin-context.mjs';
import { tenantBulkCsvToDocument, tenantBulkDocumentToCsv } from '../../src/shared/tenant-bulk-csv.js';
import { contextFor, headers, json, NORTHWIND, ORIGINS, reset } from '../e2e-saas37/scenario-support.js';
import { cleanupCsvContexts, csvTestFailure, localCsvDiagnosticsEnabled,
  observeLocalCsvBootstrap } from '../support/business-csv-diagnostics.js';

async function openBusiness(page, section, localDiagnostics) {
  // Fail at the missing control while time remains for canonical cleanup,
  // instead of spending the entire journey budget waiting after a bad bootstrap.
  await page.locator('[data-view="manager"]').click(localDiagnostics ? { timeout: 15_000 } : undefined);
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

test('Business CSV validates, applies, reloads and reimports every owned data type against PostgreSQL', async ({ browser }, testInfo) => {
  test.setTimeout(300_000);
  const localDiagnostics = localCsvDiagnosticsEnabled({ projectName: testInfo.project.name,
    customerOrigin: ORIGINS.customer, hosted: ORIGINS.hosted, gated: acceptanceGateEnabled() });
  const platform = await createOriginContext(browser, { origin: ORIGINS.platform, ignoreHTTPSErrors: !acceptanceGateEnabled() });
  const customer = await createOriginContext(browser, { origin: ORIGINS.customer, ignoreHTTPSErrors: !acceptanceGateEnabled(), locale: 'de-DE' });
  let seeded = false;
  let primaryError;
  let diagnostics;
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
    diagnostics = observeLocalCsvBootstrap(page, localDiagnostics);
    diagnostics?.start('initial');
    await page.goto(ORIGINS.customer);
    for (const [type, section, aggregate] of [
      ['rooms', 'Räume', 'locations'], ['services', 'Services & Ausstattung', 'catalogue'],
      ['equipment', 'Services & Ausstattung', 'catalogue'], ['catering-items', 'Catering', 'catalogue'],
      ['catering-packages', 'Catering', 'catalogue'],
    ]) {
      await openBusiness(page, section, localDiagnostics);
      diagnostics?.stop();
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
      diagnostics?.start(type);
      await page.reload(); await openBusiness(page, section, localDiagnostics);
      diagnostics?.stop();
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
  } catch (error) {
    primaryError = error;
  } finally {
    diagnostics?.dispose();
    const cleanup = await cleanupCsvContexts({ seeded, reset, customer, platform });
    let diagnosticFailed = false;
    if (diagnostics && csvTestFailure(primaryError, cleanup) !== undefined) {
      try {
        await testInfo.attach('business-csv-bootstrap', {
          body: Buffer.from(JSON.stringify({ schemaVersion: 1, ...diagnostics.snapshot(),
            primaryFailed: primaryError !== undefined, cleanup })),
          contentType: 'application/json',
        });
      } catch { diagnosticFailed = true; }
    }
    // No raw diagnostic attachment is emitted for Hosted or gated acceptance.
    // The following shared-runtime test retains the inter-test rate-window wait.
    const failure = csvTestFailure(primaryError, cleanup, diagnosticFailed);
    if (failure !== undefined) throw failure;
  }
});
