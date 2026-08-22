import { expect, test } from '@playwright/test';

const futureIsoDate = () => {
  const date = new Date();
  date.setDate(date.getDate() + 3);
  return date.toISOString().slice(0, 10);
};

test('demo mode is explicit, input bounds apply and local demo data can be cleared', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-demo-security-build', '2026.08.22.43');

  const notice = page.locator('[data-demo-security]');
  await expect(notice).toBeVisible();
  await expect(notice).toContainText(/Kein SSO|No SSO/);
  await expect(notice).toContainText(/Daten nur in diesem Browser|data only in this browser/);

  await page.locator('#primaryNavigation button[data-view="employee"]').click();
  const title = page.locator('#title');
  await title.focus();
  await expect(title).toHaveAttribute('maxlength', '120');

  const participants = page.locator('#internalParticipants');
  await participants.fill('999');
  await expect(participants).toHaveValue('500');
  await expect(participants).toHaveAttribute('max', '500');

  await page.evaluate(() => localStorage.setItem('conference_security_test', 'sensitive-demo-value'));
  page.once('dialog', (dialog) => dialog.accept());
  await notice.locator('.demo-security-reset').click();
  await page.waitForLoadState('domcontentloaded');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('conference_security_test'))).toBeNull();
});

test('stored user-controlled text is rendered as text and cannot execute markup', async ({ page }) => {
  const date = futureIsoDate();
  await page.addInitScript(({ seededDate }) => {
    localStorage.setItem('conference_requests', JSON.stringify([{
      id: 'CR-SEC-001',
      title: '<img src=x onerror="window.__conferenceXss=1">Security test',
      location: 'Berlin',
      date: seededDate,
      start: '10:00',
      end: '11:00',
      roomId: 'BER-321',
      status: 'Submitted',
      calendarStatus: 'Tentative',
      participants: 2,
      internalParticipants: 2,
      externalParticipants: 0,
      serviceIds: [],
      quantities: {},
      allocations: [{ costCenter: 'CC-SEC', percent: 100 }],
      estimatedCost: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      statusHistory: [],
    }]));
  }, { seededDate: date });

  await page.goto('/');
  await page.locator('#primaryNavigation button[data-view="requests"]').click();
  await expect(page.locator('.request-card')).toContainText('<img src=x onerror="window.__conferenceXss=1">Security test');
  await expect(page.locator('.request-card img[src="x"]')).toHaveCount(0);
  expect(await page.evaluate(() => window.__conferenceXss)).toBeUndefined();

  const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content');
  expect(csp).toContain("object-src 'none'");
  expect(csp).toContain("connect-src 'none'");
});
