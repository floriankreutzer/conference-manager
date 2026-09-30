import { test, expect } from '@playwright/test';
import {
  ORIGINS, NORTHWIND, CONTOSO, FABRIKAM, LOCATIONS_PATH, PNG,
  SEMANTIC_CHECKSUM, SEED_VERSION, json, headers, selectContext, contextFor,
  customerSession, locations, mediaHash, reset, activateContoso,
} from './scenario-support.js';
import { verifyNorthwindBaseline, northwindBooking, unavailableIntegrationFailsClosed } from './northwind-scenario.js';
import { verifyContosoBaseline, completeContosoTasks } from './contoso-scenario.js';
import { verifyFabrikamBaseline, progressFabrikam } from './fabrikam-scenario.js';

// Two complete cycles mutate ALL three Tenants. No route mocking, database
// shortcuts, storage seeding, retries, optional assertions or test.skip paths.
test('SaaS 3.7: three visible scenarios persist, isolate authority and restore twice', async ({ browser }, testInfo) => {
  test.setTimeout(420_000);
  const options = { ignoreHTTPSErrors: !ORIGINS.hosted, locale: 'de-DE' };
  const platformContext = await browser.newContext(options);
  const customerContext = await browser.newContext(options);
  const observerContext = await browser.newContext(options);
  const customer = await customerContext.newPage();
  const platform = await platformContext.newPage();
  const evidence = { schemaVersion: 1, browser: testInfo.project.name, seedVersion: SEED_VERSION,
    checksum: SEMANTIC_CHECKSUM, cycles: [] };
  let destructiveStarted = false;
  let cleanupVerified = false;
  try {
    // Both suites and browser projects share the same source-IP rate bucket.
    // Respect its real 60-second window; never raise limits or retry a denial.
    await test.step('respect the server rate-limit window before the scenario',
      () => new Promise((resolve) => setTimeout(resolve, 61_000)));
    destructiveStarted = true;
    await reset(platformContext);
    await customer.goto(ORIGINS.customer);
    for (let cycle = 1; cycle <= 2; cycle += 1) {
      const baseline = await test.step(`cycle ${cycle}: Northwind 10 rooms and 20 complete requests`,
        () => verifyNorthwindBaseline(customer));
      const requestId = await test.step(`cycle ${cycle}: visible Northwind booking, details and planning`,
        () => northwindBooking(customer, cycle, baseline));
      await contextFor(observerContext, NORTHWIND, 'employee');
      const independentlyPersisted = await json(await observerContext.request.get(`${ORIGINS.customer}/api/v1/requests/${requestId}`));
      expect(independentlyPersisted.request.status).toBe('Confirmed');
      await activateContoso(platform);
      const contosoBaseline = await verifyContosoBaseline(customer);
      const media = await test.step(`cycle ${cycle}: complete all seven Contoso tasks without stale UI`,
        () => completeContosoTasks(customer, cycle, contosoBaseline));
      await contextFor(observerContext, CONTOSO, 'conference_manager');
      const observerLocations = (await locations(observerContext)).configuration;
      expect(observerLocations.rooms.find(({ id }) => id === 'contoso-paris-room-2').description)
        .toBe(`Completed Studio description cycle ${cycle}`);
      await verifyFabrikamBaseline(customer);
      const importedRooms = await test.step(`cycle ${cycle}: actual Fabrikam consent, import and verification`,
        () => progressFabrikam(customer, cycle));
      await test.step(`cycle ${cycle}: object, role, CSRF and unfinished lifecycle negatives`, async () => {
        for (const [tenantId, persona] of [[NORTHWIND, 'employee'], [CONTOSO, 'employee'], [FABRIKAM, 'tenant_admin']]) {
          await contextFor(observerContext, tenantId, persona);
          const own = await customerSession(observerContext);
          // Requests require active lifecycle; media reads also support onboarding.
          // Fabrikam is denied before request lookup; all media lookups hide foreign objects.
          const expectedForeignRequestStatus = tenantId === FABRIKAM ? 403 : 404;
          const foreignRequest = tenantId === NORTHWIND ? contosoBaseline.pending[0].id : requestId;
          expect((await observerContext.request.get(`${ORIGINS.customer}/api/v1/requests/${foreignRequest}`)).status()).toBe(expectedForeignRequestStatus);
          const foreignMedia = tenantId === CONTOSO
            ? `${ORIGINS.customer}/api/v1/tenant/rooms/${baseline.rooms[0].id}/media/${baseline.rooms[0].mediaAssetIds[0]}`
            : media.uploadedUrl;
          expect((await observerContext.request.get(foreignMedia)).status()).toBe(404);
          const noCsrf = await observerContext.request.put(`${ORIGINS.customer}/api/v1/demo/session/context`, {
            headers: { Origin: ORIGINS.customer }, data: { tenantId, persona },
          });
          expect(noCsrf.status()).toBe(403);
          const deniedMediaWrite = await observerContext.request.post(
            `${ORIGINS.customer}/api/v1/tenant/rooms/${tenantId === FABRIKAM ? importedRooms[0] : (tenantId === NORTHWIND ? baseline.rooms[0].id : 'contoso-paris-room-2')}/media`, {
              headers: { ...headers(own), 'Content-Type': 'image/png' }, data: PNG,
            },
          );
          expect(deniedMediaWrite.status()).toBe(403);
          if (tenantId === FABRIKAM) {
            expect((await observerContext.request.get(`${ORIGINS.customer}/api/v1/application/requests?limit=10`)).status()).toBe(403);
          }
        }
        await selectContext(customer, CONTOSO, 'conference_manager');
        const own = await customerSession(customerContext);
        const snapshot = await locations(customerContext);
        const stale = await customerContext.request.put(`${ORIGINS.customer}${LOCATIONS_PATH}`, {
          headers: headers(own), data: { schemaVersion: 3, expectedRevision: 1, configuration: snapshot.configuration },
        });
        expect(stale.status()).toBe(409);
        expect((await customerContext.request.get(`${ORIGINS.customer}/api/v1/platform/tenants?limit=10`)).status()).toBe(404);
      });
      await test.step(`cycle ${cycle}: unavailable integration remains fail-closed`,
        () => unavailableIntegrationFailsClosed(customer));
      const result = await test.step(`cycle ${cycle}: canonical reset and independent stale-session revocation`,
        () => reset(platformContext));
      expect((await customerContext.request.get(`${ORIGINS.customer}/api/v1/application/profile`)).status()).toBe(401);
      expect((await observerContext.request.get(`${ORIGINS.customer}/api/v1/application/profile`)).status()).toBe(401);
      await customerContext.clearCookies();
      await observerContext.clearCookies();
      await customer.goto(ORIGINS.customer);
      await test.step(`cycle ${cycle}: restore all baseline contents, tasks, imports and original media`, async () => {
        await verifyNorthwindBaseline(customer);
        expect((await customerContext.request.get(`${ORIGINS.customer}/api/v1/requests/${requestId}`)).status()).toBe(404);
        await verifyContosoBaseline(customer);
        expect((await customerContext.request.get(media.uploadedUrl)).status()).toBe(404);
        expect(await mediaHash(customerContext, media.originalMediaUrl)).toBe(media.originalHash);
        await verifyFabrikamBaseline(customer);
      });
      evidence.cycles.push({ cycle, northwindRooms: 10, northwindSeedRequests: 20, contosoTasksCompleted: 7,
        fabrikamRoomsImported: importedRooms.length, allThreeRestored: true, checksum: result.checksum });
      if (cycle === 1) {
        await test.step('respect the server rate-limit window between complete cycles',
          () => new Promise((resolve) => setTimeout(resolve, 61_000)));
      }
    }
    // End with clean canonical state, not post-assertion sessions or changed data.
    await reset(platformContext);
    cleanupVerified = true;
    evidence.cleanupVerified = true;
    await testInfo.attach('saas37-scenario-evidence', { body: Buffer.from(JSON.stringify(evidence, null, 2)), contentType: 'application/json' });
  } finally {
    try {
      if (destructiveStarted && !cleanupVerified) await reset(platformContext);
    } finally {
      await Promise.all([customerContext.close(), platformContext.close(), observerContext.close()]);
    }
  }
});
