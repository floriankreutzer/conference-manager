import test from 'node:test';
import assert from 'node:assert/strict';
import { timelinePosition } from '../src/manager/timeline-position.js';

test('progression: timeline maps a normal booking to deterministic percentage classes', () => {
  assert.deepEqual(timelinePosition('10:00', '12:00'), {
    startPercent: 25,
    widthPercent: 13,
    startClass: 'room-timeline-start-25',
    widthClass: 'room-timeline-width-13',
  });
});

test('regression: timeline clamps malformed and out-of-range values to safe finite classes', () => {
  const malformed = timelinePosition('not-a-time', 'also-invalid');
  assert.deepEqual(malformed, {
    startPercent: 0,
    widthPercent: 1,
    startClass: 'room-timeline-start-0',
    widthClass: 'room-timeline-width-1',
  });

  const late = timelinePosition('23:59', '23:59');
  assert.equal(late.startPercent, 99);
  assert.equal(late.widthPercent, 1);
  assert.equal(late.startPercent + late.widthPercent, 100);
});

test('regression: timeline position never exceeds the visible 0-100 percent range', () => {
  for (const [start, end] of [['00:00', '23:59'], ['21:59', '06:00'], ['12:17', '12:18']]) {
    const result = timelinePosition(start, end);
    assert.ok(result.startPercent >= 0 && result.startPercent <= 99);
    assert.ok(result.widthPercent >= 1);
    assert.ok(result.startPercent + result.widthPercent <= 100);
  }
});
