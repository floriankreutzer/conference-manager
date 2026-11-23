import assert from 'node:assert/strict';
import test from 'node:test';
import { composeServerRequestDraft } from '../src/shared/production-request-draft.js';
import { normalizeProductionRequestDraft } from '../src/platform/production-request-wire.js';

const catalog = { configurationRevisions: {
  organization: 1, locations: 1, catalogue: 1, bookingPolicies: 1, costAllocation: 1,
} };

function original(catering = {}) {
  return {
    roomId: 'room-a', startsAt: '2099-11-27T09:00:00.000Z',
    endsAt: '2099-11-27T10:00:00.000Z', internalParticipants: 8, externalParticipants: 2,
    details: { title: 'Synthetic conference', serviceIds: [], catering: {
      participantCount: 10, packageSelection: null, itemQuantities: [], ...catering,
    } },
  };
}

test('participant reduction bounds the unused catering count before the strict wire boundary', () => {
  const request = original();
  const before = structuredClone(request);
  const draft = composeServerRequestDraft({ request, catalog,
    overrides: { internalParticipants: 4, externalParticipants: 2 } });
  assert.equal(normalizeProductionRequestDraft(draft).catering.participantCount, 6);
  assert.deepEqual(request, before);
});

test('existing valid empty catering counts are preserved on repeats and increases', () => {
  for (const count of [0, 4, 10]) {
    const request = original({ participantCount: count });
    for (const overrides of [{}, { internalParticipants: 10 }]) {
      const draft = composeServerRequestDraft({ request, catalog, overrides });
      assert.equal(normalizeProductionRequestDraft(draft).catering.participantCount, count);
    }
  }
});

test('participant reduction never silently changes selected catering or bypasses its validation', () => {
  for (const selected of [
    { packageSelection: { packageId: 'package-a', variantId: 'variant-a' } },
    { itemQuantities: [{ itemId: 'item-a', quantity: 10 }] },
  ]) {
    const request = original(selected);
    const draft = composeServerRequestDraft({ request, catalog,
      overrides: { internalParticipants: 4, externalParticipants: 2 } });
    assert.deepEqual(draft.catering, request.details.catering);
    assert.throws(() => normalizeProductionRequestDraft(draft), /PRODUCTION_REQUEST_DRAFT_INVALID/);
  }
});

test('malformed participant counts remain rejected at the wire boundary', () => {
  for (const count of [-1, 1.5, '4', NaN, 501]) {
    const draft = composeServerRequestDraft({ request: original(), catalog,
      overrides: { internalParticipants: count, externalParticipants: 2 } });
    assert.throws(() => normalizeProductionRequestDraft(draft), /PRODUCTION_REQUEST_DRAFT_INVALID/);
  }
});

test('explicit catering input and invalid source headcounts are not repaired', () => {
  const request = original();
  const overrides = { internalParticipants: 4, externalParticipants: 2 };
  const explicit = composeServerRequestDraft({ request, catalog,
    overrides: { ...overrides, catering: request.details.catering } });
  assert.throws(() => normalizeProductionRequestDraft(explicit), /PRODUCTION_REQUEST_DRAFT_INVALID/);
  const invalidSource = composeServerRequestDraft({
    request: original({ participantCount: 11 }), catalog, overrides,
  });
  assert.throws(() => normalizeProductionRequestDraft(invalidSource), /PRODUCTION_REQUEST_DRAFT_INVALID/);
  assert.equal(composeServerRequestDraft({ catalog, defaultTitle: 'New conference' })
    .catering.participantCount, 0);
});
