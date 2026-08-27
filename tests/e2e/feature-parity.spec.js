import { expect, test } from '@playwright/test';

const futureIsoDate = (days = 2) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

const fillSchedule = async (page, { title = 'Feature Parity Workshop', date = futureIsoDate() } = {}) => {
  await page.locator('#title').fill(title);
  await page.locator('#location').selectOption('Berlin');
  await page.locator('#date').fill(date);
  await page.locator('#internalParticipants').fill('8');
  await page.locator('#externalParticipants').fill('2');
  await page.locator('#start').fill('10:00');
  await page.locator('#end').fill('12:00');
};

const seedManagerData = async (page, date) => {
  await page.addInitScript(({ seededDate }) => {
    localStorage.setItem('conference_demo_role_v1', 'manager');
    localStorage.setItem('conference_requests', JSON.stringify([
      {
        id: 'CR-2026-900001', title: 'Confirmed Catering Session', location: 'Berlin', date: seededDate, start: '09:00', end: '11:00', roomId: 'BER-321', status: 'Confirmed', calendarStatus: 'Busy', participants: 10, internalParticipants: 8, externalParticipants: 2, cateringParticipants: 7, serviceIds: ['host', 'av'], packageSelection: { packageId: 'meeting', packageName: 'Meeting', tier: 'Basic', pricePerPerson: 8.5 }, quantities: { coffee: 2 }, allocations: [{ costCenter: 'CC-REPORT', percent: 100 }], estimatedCost: 415, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), statusHistory: [],
      },
      {
        id: 'CR-2026-900002', title: 'Open Review Session', location: 'Berlin', date: seededDate, start: '12:00', end: '13:00', roomId: 'BER-412', status: 'Submitted', calendarStatus: 'Provisional', participants: 6, internalParticipants: 6, externalParticipants: 0, serviceIds: [], quantities: {}, allocations: [{ costCenter: 'CC-OPEN', percent: 100 }], estimatedCost: 120, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), statusHistory: [],
      },
    ]));
  }, { seededDate: date });
};

test('employee catering visuals and rich floorplan survive the reorganization', async ({ page }) => {
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-feature-parity-build', '2026.08.23.47');
  await page.locator('#primaryNavigation button[data-view="employee"]').click();
  await fillSchedule(page);
  await page.locator('.wizard-actions button.primary').click();
  const roomPreview = page.locator('#rooms .room-preview-image').first();
  await expect(roomPreview).toBeVisible();
  await expect(roomPreview).toHaveAttribute('alt', /Raumaufbau/);
  const floorplanButton = page.locator('#rooms [data-feature-floorplan]').first();
  await expect(floorplanButton).toBeVisible();
  await floorplanButton.click();
  await expect(page.locator('dialog')).toContainText('Raumeindruck');
  await expect(page.locator('dialog .rich-floorplan-image')).toBeVisible();
  await page.keyboard.press('Escape');
  const roomSelect = page.locator('#rooms .option-card:not(.disabled) button[aria-pressed]').first();
  await roomSelect.click();
  await page.locator('.wizard-actions button.primary').click();
  await page.locator('.wizard-actions button.primary').click();
  await page.locator('input[name="cateringMode"][value="PACKAGE"]').check();
  const images = page.locator('.package-grid .catering-card-image');
  await expect(images).toHaveCount(12);
  await expect(images.first()).toHaveAttribute('src', /^data:image\/svg\+xml;charset=UTF-8,/);
});

test('manager cockpit restores overview, timeline/list room planning, detailed reports and full administration', async ({ page }) => {
  const date = futureIsoDate();
  await seedManagerData(page, date);
  await page.goto('/');
  await page.locator('#primaryNavigation button[data-view="manager"]').click();
  const overview = page.locator('[data-feature-manager-overview]');
  await expect(overview).toBeVisible();
  await expect(overview).toContainText('Offene Anfragen');
  await expect(overview).toContainText('Nächste 7 Tage');
  await overview.locator('[data-quick-filter="ACTION"]').click();
  await expect(page.locator('.request-card:not(.feature-filter-hidden)')).toHaveCount(1);
  await expect(page.locator('.request-card:not(.feature-filter-hidden)')).toContainText('Open Review Session');

  await page.getByRole('button', { name: 'Raumplanung' }).click();
  const roomPlan = page.locator('[data-feature-parity="room-plan"]');
  await expect(roomPlan).toBeVisible();
  await page.locator('#roomPlanDate').fill(date);
  await page.locator('#roomPlanDate').dispatchEvent('change');
  await page.locator('[data-room-plan-view="TIMELINE"]').click();
  await expect(page.locator('.room-timeline-booking')).toHaveCount(2);
  await page.locator('[data-room-plan-view="LIST"]').click();
  const roomPlanList = page.locator('.room-plan-list');
  const mobileCards = page.locator('[data-feature-parity="room-plan"] .responsive-table-cards');
  const viewport = page.viewportSize();
  if (viewport && viewport.width <= 760) {
    await expect(mobileCards).toBeVisible();
    await expect(mobileCards).toContainText('Confirmed Catering Session');
  } else {
    await expect(roomPlanList).toContainText('Teilnehmende');
    await expect(roomPlanList).toContainText('Confirmed Catering Session');
  }
  await expect(page.locator('#roomPlanLocation')).toBeVisible();

  await page.getByRole('button', { name: 'Reports' }).click();
  await page.locator('#reportReferenceDate').fill(date);
  await page.locator('#reportReferenceDate').dispatchEvent('change');
  const reports = page.locator('[data-feature-parity="reports"]');
  await expect(reports).toBeVisible();
  await expect(page.locator('#reportPeriod option')).toHaveCount(4);
  await expect(reports).toContainText('Gebuchte Räume');
  await expect(reports).toContainText('Gebuchte Services');
  await expect(reports).toContainText('Gebuchte Catering-Pakete');
  await expect(reports).toContainText('Catering-Einzeloptionen');
  await expect(reports).toContainText('Operative Hinweise');

  await page.getByRole('button', { name: 'Administration' }).click();
  const admin = page.locator('[data-feature-parity="admin"]');
  await expect(admin).toBeVisible();
  await expect(admin).toContainText('Räume & Standorte');
  await expect(admin).toContainText('Services & Catering');
  await admin.locator('[data-admin-section="PACKAGES"]').click();
  await expect(page.locator('.catering-package-admin')).toHaveCount(4);
  await expect(page.locator('input[id^="parity-package-image-"]')).toHaveCount(12);
  await admin.locator('[data-admin-section="ROOMS"]').click();
  await expect(page.locator('#room-location-BER-321')).toBeVisible();
  await expect(page.locator('#room-floor-BER-321')).toBeVisible();
  await expect(page.locator('#room-floorplan-description-BER-321')).toBeVisible();
  await expect(page.locator('#room-floorplan-image-BER-321')).toBeVisible();
  await admin.locator('[data-admin-section="SITES"]').click();
  await expect(page.locator('#parity-site-Berlin-carArrival')).toBeVisible();
  await expect(page.locator('#parity-site-Berlin-building')).toBeVisible();
  await expect(page.locator('#parity-site-Berlin-visitorNotes')).toBeVisible();
  await expect(page.locator('#parity-site-Berlin-mapsUrl')).toBeVisible();
  await expect(page.locator('#parity-site-Berlin-wifiName')).toBeVisible();
});

test('confirmed booking opens the rich welcome print view with route QR and visitor information', async ({ page }) => {
  const date = futureIsoDate();
  await page.addInitScript(({ seededDate }) => {
    localStorage.setItem('conference_requests', JSON.stringify([{ id: 'CR-2026-910001', title: 'Welcome PDF Session', location: 'Berlin', date: seededDate, start: '10:00', end: '12:00', roomId: 'BER-321', status: 'Confirmed', calendarStatus: 'Busy', participants: 4, internalParticipants: 2, externalParticipants: 2, serviceIds: [], quantities: {}, allocations: [{ costCenter: 'CC-PDF', percent: 100 }], estimatedCost: 80, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), statusHistory: [] }]));
  }, { seededDate: date });
  await page.goto('/');
  await page.locator('#primaryNavigation button[data-view="requests"]').click();
  const pdfButton = page.locator('[data-feature-pdf="CR-2026-910001"]');
  await expect(pdfButton).toBeVisible();
  const popupPromise = page.waitForEvent('popup');
  await pdfButton.click();
  const popup = await popupPromise;
  await expect(popup.locator('h1')).toHaveText('Schön, dass Sie dabei sind.');
  await expect(popup.locator('.hero')).toContainText('Welcome PDF Session');
  await expect(popup.locator('.qr')).toHaveCount(1);
  await expect(popup.locator('.wifi')).toContainText('Gäste-WLAN');
});
