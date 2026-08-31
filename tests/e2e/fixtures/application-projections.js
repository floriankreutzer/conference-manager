const DEFAULT_AS_OF = '2026-08-30T08:00:00.000Z';

function catalogEntries(section) {
  return section === 'sites'
    ? [{ id: 'fixture-site', name: 'Fixture site', active: true, timeZone: 'Europe/Berlin' }]
    : [];
}

function catalogPage(section) {
  return {
    schemaVersion: 2,
    configurationRevisions: {
      organization: 1,
      locations: 1,
      catalogue: 1,
      bookingPolicies: 1,
      costAllocation: 1,
    },
    bookingPolicy: {
      policyVersionId: 'fixture-policy',
      effectiveFrom: '2026-01-01T00:00:00.000Z',
      evaluatedAt: DEFAULT_AS_OF,
      rules: {
        minimumLeadTimeMinutes: 0,
        maximumAdvanceMinutes: 527_040,
        cancellationWindowMinutes: 0,
        changeWindowMinutes: 0,
        maximumParticipants: 500,
        allowedSiteIds: [],
        allowedRoomIds: [],
        allowedServiceIds: [],
      },
    },
    organization: { defaultCurrency: 'EUR' },
    costAllocation: { allocationRequired: false },
    context: 'e2e_application_projection',
    section,
    entries: catalogEntries(section),
    page: { limit: 10, complete: true, nextCursor: null },
  };
}

export function applicationProjectionPayload(url, { displayName = 'Fixture User' } = {}) {
  switch (url.pathname) {
    case '/api/v1/application/profile':
      return { schemaVersion: 1, profile: { displayName } };
    case '/api/v1/application/catalog':
      return catalogPage(url.searchParams.get('section'));
    case '/api/v1/application/site-info':
      return { schemaVersion: 1, siteInfo: {} };
    case '/api/v1/application/requests':
      return {
        schemaVersion: 2,
        asOf: DEFAULT_AS_OF,
        requests: [],
        page: { limit: 10, complete: true, nextCursor: null },
      };
    case '/api/v1/application/notifications':
      return { schemaVersion: 1, notifications: [] };
    default:
      return null;
  }
}

export async function fulfillApplicationProjection(route, options) {
  if (route.request().method() !== 'GET') return false;
  const payload = applicationProjectionPayload(new URL(route.request().url()), options);
  if (payload === null) return false;
  await route.fulfill({
    status: 200,
    contentType: 'application/json; charset=utf-8',
    body: JSON.stringify(payload),
  });
  return true;
}
