import assert from 'node:assert/strict';
import test from 'node:test';
import {
  normalizeProductionRequestListPage,
  normalizeProductionRequestReportPage,
  normalizeProductionRequestHistoryPage,
  normalizeProductionCatalogPage,
} from '../src/platform/production-request-wire.js';
import { createProductionPersistence } from '../src/platform/production-persistence.js';

// Syntax-only browser fixtures. Signature verification and Tenant/scope binding
// belong to the trusted API; the browser must forward the token without decoding it.
const SIGNED_CURSOR = `synthetic_payload.${'A'.repeat(43)}`;
const NOW = '2026-09-29T12:00:00.000Z';
const RANGE = {
  field: 'startsAt', fromInclusive: '2026-09-01T00:00:00.000Z',
  toExclusive: '2026-10-01T00:00:00.000Z', timeZone: 'UTC',
};
const pagination = (cursor) => ({ limit: 10, complete: cursor === null, nextCursor: cursor });
const list = (cursor, version = 3) => ({
  schemaVersion: version, asOf: NOW, requests: [], page: pagination(cursor),
});
const report = (cursor, version = 3) => ({ ...list(cursor, version), range: RANGE });
const history = (cursor, version = 3) => ({
  schemaVersion: version, requestId: 'synthetic-correlation', asOfVersion: 12,
  history: [], page: pagination(cursor),
});
const contracts = [
  ['list', list, normalizeProductionRequestListPage, 'PRODUCTION_REQUEST_LIST_INVALID'],
  ['report', report, normalizeProductionRequestReportPage, 'PRODUCTION_REQUEST_REPORT_INVALID'],
  ['history', history, normalizeProductionRequestHistoryPage, 'PRODUCTION_REQUEST_HISTORY_INVALID'],
];

for (const [name, envelope, normalize, code] of contracts) {
  test(`v3 ${name} pagination accepts the bounded signed API cursor unchanged`, () => {
    for (const token of [SIGNED_CURSOR, `${'x'.repeat(3072)}.${'A'.repeat(43)}`]) {
      const result = normalize(envelope(token));
      assert.equal(result.page.nextCursor, token);
      assert.equal(Object.isFrozen(result.page), true);
    }
    assert.equal(normalize(envelope(null)).page.complete, true);
  });

  test(`v3 ${name} pagination rejects malformed, oversized and unsigned cursors`, () => {
    for (const token of [
      'unsigned_cursor', '', '.', `.${'A'.repeat(43)}`,
      `x.${'A'.repeat(42)}`, `x.${'A'.repeat(44)}`,
      `${'x'.repeat(3073)}.${'A'.repeat(43)}`, `${SIGNED_CURSOR}.extra`,
      `${SIGNED_CURSOR}\n`, `${SIGNED_CURSOR}\r`, ` ${SIGNED_CURSOR}`,
      `${SIGNED_CURSOR}=`, 'https://example.invalid/cursor', 5, {},
    ]) {
      assert.throws(() => normalize(envelope(token)), (error) => error.code === code);
    }
    const contradictory = envelope(SIGNED_CURSOR);
    contradictory.page.complete = true;
    assert.throws(() => normalize(contradictory), (error) => error.code === code);
  });

  test(`v2 ${name} pagination retains its separate legacy syntax`, () => {
    assert.equal(normalize(envelope('legacy_cursor', 2)).page.nextCursor, 'legacy_cursor');
    assert.throws(() => normalize(envelope(SIGNED_CURSOR, 2)), (error) => error.code === code);
  });
}

for (const [name, envelope, method, args, expectedPath] of [
  ['list', list, 'listRequests', [], 'v1/application/requests'],
  ['report', report, 'loadRequestReport', [RANGE.fromInclusive, RANGE.toExclusive], 'v1/application/reports/requests'],
  ['history', history, 'loadRequestHistory', ['request-1'], 'v1/requests/request-1/history'],
]) {
  test(`v3 ${name} persistence follows the signed cursor and stops only on the complete page`, async () => {
    const calls = [];
    const persistence = createProductionPersistence({ apiClient: {
      async request(path) {
        calls.push(path);
        return envelope(calls.length === 1 ? SIGNED_CURSOR : null);
      },
    } });
    await persistence[method](...args);
    assert.equal(calls.length, 2);
    assert.ok(calls.every((path) => path.startsWith(expectedPath)));
    const forwarded = new URL(calls[1], 'https://customer.example/').searchParams.get('cursor');
    assert.equal(forwarded, SIGNED_CURSOR);
  });

  test(`v3 ${name} persistence still rejects signed cursor cycles`, async () => {
    let calls = 0;
    const persistence = createProductionPersistence({ apiClient: {
      async request() { calls += 1; return envelope(SIGNED_CURSOR); },
    } });
    await assert.rejects(persistence[method](...args), /_INVALID/);
    assert.equal(calls, 2);
  });
}

test('signed Request cursor syntax does not broaden the catalogue context or pagination contract', () => {
  const catalogue = {
    schemaVersion: 2,
    configurationRevisions: { organization: 1, locations: 1, catalogue: 1, bookingPolicies: 1, costAllocation: 1 },
    bookingPolicy: {
      policyVersionId: 'policy-1', effectiveFrom: '2026-01-01T00:00:00.000Z', evaluatedAt: NOW,
      rules: { minimumLeadTimeMinutes: 0, maximumAdvanceMinutes: 527040,
        cancellationWindowMinutes: 0, changeWindowMinutes: 0, maximumParticipants: 500,
        allowedSiteIds: [], allowedRoomIds: [], allowedServiceIds: [] },
    },
    organization: { defaultCurrency: 'EUR' }, costAllocation: { allocationRequired: false },
    context: 'catalogue_context', section: 'rooms', entries: [], page: pagination(null),
  };
  assert.equal(normalizeProductionCatalogPage(catalogue).page.complete, true);
  for (const invalid of [
    { ...catalogue, context: SIGNED_CURSOR },
    { ...catalogue, page: pagination(SIGNED_CURSOR) },
  ]) assert.throws(() => normalizeProductionCatalogPage(invalid), /PRODUCTION_CATALOG_PAGE_INVALID/);
});
