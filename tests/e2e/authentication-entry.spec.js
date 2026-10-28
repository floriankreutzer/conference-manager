import { expect, test } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { asProductionHtml } from './fixtures/production-html.js';

async function microsoftControl(control, name) {
  await expect(control).toHaveAccessibleName(name);
  await expect(control).toHaveClass('microsoft-sign-in');
  const image = control.locator('img');
  await expect(image).toHaveAttribute('alt', ''); await expect(image).toHaveAttribute('aria-hidden', 'true');
  await expect(image).toHaveAttribute('src', /\/assets\/brand\/microsoft-sign-in\/reference-2026-10-27\/ms-symbollockup_mssymbol_19\.svg$/);
  await expect.poll(() => image.evaluate(node => node.complete && node.naturalWidth === 21)).toBe(true);
  const style = await control.evaluate(node => ({ family: getComputedStyle(node).fontFamily,
    background: getComputedStyle(node).backgroundColor, color: getComputedStyle(node).color,
    height: node.getBoundingClientRect().height }));
  expect(style.family).toContain('Segoe UI'); expect(style.background).toBe('rgb(255, 255, 255)');
  expect(style.color).toBe('rgb(94, 94, 94)'); expect(style.height).toBeGreaterThanOrEqual(44);
  await control.focus(); await expect(control).toBeFocused();
}


test('signed-out Platform has a separate bilingual entry with Microsoft, no application chrome and the local Pavurel image', async ({ page }) => {
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.route('**/api/v1/platform/**', route => route.fulfill({
    status: route.request().url().endsWith('/configuration') ? 404 : 401,
    contentType: 'application/json', body: JSON.stringify({ error: { code: 'PLATFORM_UNAUTHENTICATED' } }),
  }));
  await page.goto('/platform-admin/');
  const entry = page.locator('[data-authentication-surface="platform"]');
  await expect(page).toHaveTitle('Anmelden · Pavurel Plattform');
  await expect(entry.getByRole('heading', { level: 1 })).toHaveText('Willkommen in der Plattformverwaltung');
  await expect(page.locator('.app-shell')).toBeHidden();
  await expect(entry.getByRole('link', { name: 'Mit Microsoft anmelden' })).toHaveAttribute('href',
    new URL('/api/v1/platform/auth/microsoft/login', page.url()).href);
  await microsoftControl(entry.getByRole('link', { name: 'Mit Microsoft anmelden' }), 'Mit Microsoft anmelden');
  await expect(entry.getByRole('button', { name: /Passkey/ })).toHaveCount(0);
  await expect(page.locator('#skipLink')).toHaveAttribute('href', '#authenticationContent');
  await entry.getByRole('combobox', { name: 'Sprache', exact: true }).selectOption('en');
  await expect(entry.getByRole('heading', { level: 1 })).toHaveText('Welcome to platform administration');
  await expect(page).toHaveTitle('Sign in · Pavurel Platform');
  await expect(entry.getByRole('combobox', { name: 'Language', exact: true })).toBeFocused();
  await microsoftControl(entry.getByRole('link', { name: 'Sign in with Microsoft' }), 'Sign in with Microsoft');
  for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    if (width === 1280) {
      const image = entry.locator('.authentication-entry-visual img');
      await expect(image).toBeVisible();
      expect(await image.evaluate(node => node.complete && node.naturalWidth === 900)).toBe(true);
      const loginBox = await entry.locator('main').boundingBox(), imageBox = await image.boundingBox();
      expect(imageBox.x).toBeGreaterThanOrEqual(loginBox.x + loginBox.width);
    }
  }
  expect(errors).toEqual([]);
});

test('signed-out Customer retains both Microsoft and email-code methods on its own entry page', async ({ page }) => {
  const html = asProductionHtml(await readFile(new URL('../../index.html', import.meta.url), 'utf8'));
  await page.route('**/', route => route.fulfill({ contentType: 'text/html', body: html }));
  await page.route('**/src/platform/production-bootstrap.js*', route => route.fulfill({ contentType: 'text/javascript', body: `
    import { bootstrapCustomerApplication } from '/src/app.js';
    import { RUNTIME_MODE } from '/src/core/security-policy.js';
    import { bootstrapInvitedCustomerAuthentication } from '/src/platform/customer-authentication/bootstrap.js';
    await bootstrapCustomerApplication({ runtimeMode: RUNTIME_MODE.PRODUCTION,
      authenticationBootstrap: options => bootstrapInvitedCustomerAuthentication({ ...options,
        microsoftAuthenticationEnabled: true }) });
  ` }));
  await page.route('**/api/**', route => route.fulfill({ status: 401, contentType: 'application/json',
    body: JSON.stringify({ error: { code: 'AUTHENTICATION_REQUIRED' } }) }));
  await page.goto('/');
  const entry = page.locator('[data-authentication-surface="customer"]');
  await expect(page).toHaveTitle('Anmelden · Conference Manager');
  await expect(entry.getByRole('heading', { level: 1 })).toHaveText('Willkommen im Conference Manager');
  await expect(page.locator('.app-shell')).toBeHidden();
  await expect(entry.getByRole('textbox', { name: 'E-Mail-Adresse', exact: true })).toBeVisible();
  await expect(entry.getByRole('button', { name: 'Code anfordern', exact: true })).toBeVisible();
  await microsoftControl(entry.getByRole('button', { name: 'Mit Microsoft anmelden', exact: true }), 'Mit Microsoft anmelden');
  await entry.getByRole('combobox', { name: 'Sprache', exact: true }).selectOption('en');
  await microsoftControl(entry.getByRole('button', { name: 'Sign in with Microsoft', exact: true }), 'Sign in with Microsoft');
  for (const width of [320, 1280]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
});
