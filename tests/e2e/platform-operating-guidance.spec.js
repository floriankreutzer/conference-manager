import { expect,test } from '@playwright/test';

// Isolated UI regression with normalized fixed DTOs. This is not a server
// authorization, provider, delivery or Hosted acceptance claim.
for (const language of ['de','en']) test(`operating guidance distinguishes zero, unknown and an empty recovery target in ${language}`,async({ page },testInfo)=>{
  await page.route('**/platform-admin/',route=>route.fulfill({ contentType: 'text/html',body:
    '<!doctype html><html lang="en"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Operating guidance fixture</title>'
    + '<link rel="stylesheet" href="/assets/tokens.css"><link rel="stylesheet" href="/assets/styles.css">'
    + '<link rel="stylesheet" href="/assets/platform-admin.css"><main id="guidanceFixture"></main></html>' }));
  await page.goto('/platform-admin/');
  await page.evaluate(async language=>{
    const { setLanguage }=await import('/src/core/i18n.js');
    const { renderPlatformAdminTenantSection }=await import('/src/platform-admin/tenant-sections.js');
    const { normalizePlatformMeteringUsage }=await import('/src/platform-admin/resource-contracts.js');
    setLanguage(language);
    const tenantId='11111111-1111-4111-8111-111111111111';
    const dimensions=['active_users','active_rooms','requests_created','bookings_confirmed','integration_operations'];
    const usage=normalizePlatformMeteringUsage({ schemaVersion: 1,tenantId,period: {
      start: '2026-10-01T00:00:00.000Z',end: '2026-11-01T00:00:00.000Z',timeZone: 'UTC' },
    dataState: 'partial',measuredAt: null,reconciledAt: null,
    dimensions: dimensions.map((dimension,index)=>({ dimension,value: index===0 ? 0 : null })),
    quotas: dimensions.map(dimension=>({ dimension,state: 'not_configured',softLimit: null,hardLimit: null,revision: 0 })),
    },tenantId);
    const root=document.querySelector('#guidanceFixture');
    root.append(renderPlatformAdminTenantSection({ sectionId: 'metering',operator: { permissions: ['platform:metering:read'] },
      resource: { status: 'ready',data: usage } }));
    window.guidancePreviewCount=0;
    root.append(renderPlatformAdminTenantSection({ sectionId: 'recovery',operationProofAvailable: true,
      operator: { permissions: ['platform:recovery:execute'],assurance: { level: 'mfa' } },
      resource: { status: 'ready',data: { previews: {},targets: { 'last-tenant-admin': { items: [],nextCursor: null } } } },
      onRecoveryPreview() { window.guidancePreviewCount+=1; },
    }));
  },language);
  const records=page.locator('article.platform-admin-record');
  await expect(records).toHaveCount(5);
  await expect(records.first().locator('strong')).toHaveText('0');
  await expect(records.nth(1).locator('strong')).toHaveText(language==='de' ? 'Unbekannt' : 'Unknown');
  await expect(records.first().getByRole('heading')).toHaveText(language==='de' ? 'Aktive interne Personen' : 'Active internal people');
  await expect(records.first().locator('code')).toBeHidden();
  await expect(page.getByText(language==='de' ? /Auf dieser geladenen Seite ist kein geeignetes Ziel/ : /No eligible target is available on this loaded page/)).toBeVisible();
  await page.locator('[data-platform-admin-recovery-preview="last-tenant-admin"]').focus();await page.keyboard.press('Enter');
  await expect(page.locator('#platformAdminRecoveryTarget-last-tenant-admin')).toBeFocused();
  expect(await page.evaluate(()=>window.guidancePreviewCount)).toBe(0);
  for (const width of [320,1280]) {
    await page.setViewportSize({ width,height: 900 });
    expect(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth)).toBe(true);
    await testInfo.attach(`operating-guidance-${language}-${width}`,{ body: await page.screenshot(),contentType: 'image/png' });
  }
});
