import { expect } from '@playwright/test';
import {
  ORIGINS, FABRIKAM, INTEGRATION_PATH, LOCATIONS_PATH, selectContext, locations,
  openAdmin, uiResponse, json,
} from './scenario-support.js';

export async function verifyFabrikamBaseline(page) {
  const session = await selectContext(page, FABRIKAM, 'tenant_admin');
  expect(session.tenant.status).toBe('onboarding');
  const snapshot = await locations(page.context());
  expect(snapshot.configuration.sites).toHaveLength(0);
  expect(snapshot.configuration.rooms).toHaveLength(0);
  const readiness = (await json(await page.context().request.get(`${ORIGINS.customer}${INTEGRATION_PATH}/pilot-readiness`))).readiness;
  expect(readiness.ready).toBe(false);
  expect(readiness.checks.microsoft365Connected).toBe(false);
  expect(readiness.checks.roomImported).toBe(false);
  expect(readiness.checks.freeBusyVerified).toBe(false);
  return session;
}

export async function progressFabrikam(page, cycle) {
  await openAdmin(page, 'organization');
  await page.locator('#tenant-organization-display-name').fill(`Fabrikam onboarding cycle ${cycle}`);
  await uiResponse(page, 'PUT', '/api/v1/tenant/settings/organization',
    () => page.locator('[data-tenant-settings-form="organization"]').getByRole('button', { name: 'Speichern', exact: true }).click());
  await page.locator('[data-tenant-admin-section="locations"]').click();
  await page.getByRole('button', { name: 'Standort hinzufügen', exact: true }).click();
  await page.locator('#tenant-site-name-0').fill('Fabrikam Acceptance Campus');
  await page.locator('#tenant-site-time-zone-0').fill('Europe/Berlin');
  await uiResponse(page, 'PUT', LOCATIONS_PATH,
    () => page.locator('[data-tenant-settings-form="locations-technical"]').getByRole('button', { name: 'Speichern', exact: true }).click());
  await page.locator('[data-tenant-admin-section="microsoft365"]').click();
  const connection = page.locator('[data-onboarding-step="connection"]');
  const callback = page.waitForResponse((response) => response.request().method() === 'GET'
    && new URL(response.url()).pathname === `${INTEGRATION_PATH}/callback`);
  await connection.getByRole('button', { name: /^(Microsoft 365 verbinden|Erneut verbinden)$/ }).click();
  expect((await callback).status()).toBe(303);
  await page.waitForURL((url) => url.origin === ORIGINS.customer && url.pathname === '/');
  await openAdmin(page, 'microsoft365');
  await uiResponse(page, 'POST', `${INTEGRATION_PATH}/verify`,
    () => page.getByRole('button', { name: 'Verbindung und Berechtigungen prüfen', exact: true }).click());
  await expect(page.locator('[data-onboarding-step="verification"]')).toHaveClass(/is-complete/);
  await uiResponse(page, 'GET', `${INTEGRATION_PATH}/rooms`,
    () => page.getByRole('button', { name: 'Räume aus Microsoft 365 laden', exact: true }).click());
  const discovered = page.locator('.onboarding-room-list input[type="checkbox"]');
  await expect(discovered).toHaveCount(2);
  for (const control of await discovered.all()) await control.check();
  await page.locator('.onboarding-site-field select').selectOption('site-1');
  await uiResponse(page, 'POST', `${INTEGRATION_PATH}/room-mappings/import`,
    () => page.getByRole('button', { name: 'Ausgewählte Räume importieren', exact: true }).click());
  await uiResponse(page, 'POST', `${INTEGRATION_PATH}/free-busy/verify`,
    () => page.getByRole('button', { name: 'Kalenderverfügbarkeit prüfen', exact: true }).click());
  await expect(page.locator('[data-onboarding-step="availability"]')).toHaveClass(/is-complete/);
  await page.reload();
  await openAdmin(page, 'microsoft365');
  await expect(page.locator('[data-onboarding-step="import"]')).toHaveClass(/is-complete/);
  await expect(page.locator('[data-onboarding-step="availability"]')).toHaveClass(/is-complete/);
  const readiness = (await json(await page.context().request.get(`${ORIGINS.customer}${INTEGRATION_PATH}/pilot-readiness`))).readiness;
  expect(readiness.checks).toMatchObject({ microsoft365Connected: true, placesPermissionGranted: true,
    calendarPermissionGranted: true, roomImported: true, freeBusyVerified: true });
  // Tenant Admin onboarding success does not silently activate this Tenant.
  expect(readiness.tenantStatus).toBe('onboarding');
  await expect(page.getByRole('button', { name: 'Anfrage absenden', exact: true })).toHaveCount(0);
  const configuration = (await locations(page.context())).configuration;
  expect(configuration.sites).toHaveLength(1);
  expect(configuration.rooms).toHaveLength(2);
  expect(configuration.rooms.every(({ siteId }) => siteId === 'site-1')).toBe(true);
  return configuration.rooms.map(({ id }) => id);
}
