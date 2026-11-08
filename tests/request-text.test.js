import assert from 'node:assert/strict';
import test from 'node:test';
import { requestTextResult } from '../src/shared/request-text.js';
import { normalizeProductionRequestDraft } from '../src/platform/production-request-wire.js';

const options = { maximum: 2_000, nullable: true, multiline: true };
function draft(overrides = {}) {
  return {
    title: 'Workshop', roomId: 'room-1',
    startsAt: '2099-01-01T10:00:00.000Z', endsAt: '2099-01-01T11:00:00.000Z',
    internalParticipants: 2, externalParticipants: 0, serviceIds: [], equipmentIds: [],
    catering: { participantCount: 0, packageSelection: null, itemQuantities: [] },
    specialRequirements: null, dietaryRequirements: null, allocations: [],
    configurationRevisions: { organization: 1, locations: 1, catalogue: 1, bookingPolicies: 1, costAllocation: 1 },
    ...overrides,
  };
}

test('CO-301 requirements preserve LF, normalize CRLF/NFC and retain exact length limits', () => {
  for (const lineBreak of ['\n', '\r\n']) {
    const input = `  Bitte Wasser & O'Neills Tee.${lineBreak}Danach Raum lu\u0308ften.  `;
    const expected = "Bitte Wasser & O'Neills Tee.\nDanach Raum lüften.";
    assert.deepEqual(requestTextResult(input, options), { value: expected, error: null });
    const normalized = normalizeProductionRequestDraft(draft({
      specialRequirements: input, dietaryRequirements: input,
    }));
    assert.equal(normalized.specialRequirements, expected);
    assert.equal(normalized.dietaryRequirements, expected);
  }
  assert.equal(requestTextResult('x'.repeat(999) + '\r\n' + 'x'.repeat(1_000), options).value.length, 2_000);
  assert.equal(requestTextResult('x'.repeat(2_001), options).error, 'length');
  for (const value of [null, '', ' \r\n ']) {
    assert.deepEqual(requestTextResult(value, options), { value: null, error: null });
  }
});

test('CO-301 text exceptions never admit markup, other controls, bidi controls or multiline titles', () => {
  for (const value of ['x\ry', 'x\ty', 'x\0y', 'x\u001fy', 'x\u007fy', 'x\u202ey', 'x\u2066y', '<b>Text</b>', '<script>alert(1)</script>', 42]) {
    assert.equal(requestTextResult(value, options).error, 'characters');
    for (const field of ['specialRequirements', 'dietaryRequirements']) {
      assert.throws(() => normalizeProductionRequestDraft(draft({ [field]: value })), /PRODUCTION_REQUEST_DRAFT_INVALID/);
    }
  }
  for (const title of ['First\nSecond', 'First\r\nSecond', '<Title>', 'x'.repeat(161), ' ']) {
    assert.throws(() => normalizeProductionRequestDraft(draft({ title })), /PRODUCTION_REQUEST_DRAFT_INVALID/);
  }
  assert.equal(requestTextResult('', { maximum: 160 }).error, 'required');
  assert.equal(normalizeProductionRequestDraft(draft({ title: 'x'.repeat(160) })).title.length, 160);
});
