import assert from 'node:assert/strict';
import test from 'node:test';
import { cateringManualOccurrence } from '../src/manager/catering-manual-draft.js';

test('actual manual occurrence preserves explicit UTC seconds and milliseconds without device timezone ambiguity', () => {
  const now = Date.parse('2026-10-25T03:00:00.000Z');
  for (const [value, expected] of [['2026-10-25T02:15', '2026-10-25T02:15:00.000Z'],
    ['2026-10-25T02:15:12', '2026-10-25T02:15:12.000Z'], ['2026-10-25T02:15:12.1', '2026-10-25T02:15:12.100Z'],
    ['2026-10-25T02:15:12.123', '2026-10-25T02:15:12.123Z']]) {
    assert.equal(cateringManualOccurrence(value, now), expected);
  }
  for (const value of ['2026-02-30T01:00', '2026-10-25T03:01', '2026-13-01T01:00', '2026-10-25T02:15+01:00',
    '2026-10-25T02:15Z', '2026-10-25T02:15:12.1234', '2026-10-25T24:00', '', null, 1]) {
    assert.throws(() => cateringManualOccurrence(value, now), /INVALID/);
  }
});
