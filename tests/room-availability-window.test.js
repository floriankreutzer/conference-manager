import assert from 'node:assert/strict';
import test from 'node:test';
import { productionUtcInstant } from '../src/core/production-time.js';
import { createProductionPersistence } from '../src/platform/production-persistence.js';

function availabilityHarness() {
  const calls = [];
  const persistence = createProductionPersistence({
    apiClient: { async request(path, options) {
      calls.push({ path, options });
      return { schemaVersion: 1, availability: { available: true, conflictCount: 0 } };
    } },
  });
  return { calls, persistence };
}

for (const [name, startsAt, endsAt] of [
  ['exactly 24 hours', '2026-09-01T08:00:00.000Z', '2026-09-02T08:00:00.000Z'],
  ['overnight within 24 hours', '2026-09-01T20:00:00.000Z', '2026-09-02T06:00:00.000Z'],
]) {
  test(`CO-322 availability accepts ${name} with the exact UTC payload`, async () => {
    const { calls, persistence } = availabilityHarness();
    const window = { roomId: 'room-a', startsAt, endsAt };
    assert.deepEqual(await persistence.checkRoomAvailability(window), { available: true, conflictCount: 0 });
    assert.deepEqual(calls, [{ path: 'v1/application/room-availability', options: { method: 'POST', body: window } }]);
  });
}

for (const [name, startsAt, endsAt] of [
  ['24 hours plus one millisecond', '2026-09-01T08:00:00.000Z', '2026-09-02T08:00:00.001Z'],
  ['multiple days', '2026-09-01T08:00:00.000Z', '2026-09-03T08:00:00.000Z'],
  ['zero duration', '2026-09-01T08:00:00.000Z', '2026-09-01T08:00:00.000Z'],
  ['reversed duration', '2026-09-01T08:00:00.000Z', '2026-09-01T07:59:00.000Z'],
  ['a noncanonical offset', '2026-09-01T10:00:00+02:00', '2026-09-01T09:00:00.000Z'],
]) {
  test(`CO-322 availability rejects ${name} before transport`, async () => {
    const { calls, persistence } = availabilityHarness();
    await assert.rejects(persistence.checkRoomAvailability({ roomId: 'room-a', startsAt, endsAt }),
      { code: 'AVAILABILITY_WINDOW_INVALID' });
    assert.equal(calls.length, 0);
  });
}

test('CO-322 duration uses elapsed UTC time across the Site DST transition', async () => {
  const { calls, persistence } = availabilityHarness();
  const spring = {
    roomId: 'room-a',
    startsAt: productionUtcInstant('2026-03-28', '12:00', 'Europe/Berlin'),
    endsAt: productionUtcInstant('2026-03-29', '13:00', 'Europe/Berlin'),
  };
  assert.equal(Date.parse(spring.endsAt) - Date.parse(spring.startsAt), 86_400_000);
  await persistence.checkRoomAvailability(spring);
  const autumn = {
    roomId: 'room-a',
    startsAt: productionUtcInstant('2026-10-24', '12:00', 'Europe/Berlin'),
    endsAt: productionUtcInstant('2026-10-25', '12:00', 'Europe/Berlin'),
  };
  assert.equal(Date.parse(autumn.endsAt) - Date.parse(autumn.startsAt), 90_000_000);
  await assert.rejects(persistence.checkRoomAvailability(autumn), { code: 'AVAILABILITY_WINDOW_INVALID' });
  assert.equal(calls.length, 1);
});

test('CO-322 missing Site zone and ambiguous or nonexistent wall times cannot reach availability transport', async () => {
  const { calls, persistence } = availabilityHarness();
  for (const [date, time, zone] of [
    ['2026-09-01', '10:00', null],
    ['2026-03-29', '02:30', 'Europe/Berlin'],
    ['2026-10-25', '02:30', 'Europe/Berlin'],
  ]) {
    const startsAt = productionUtcInstant(date, time, zone);
    assert.equal(startsAt, null);
    await assert.rejects(persistence.checkRoomAvailability({
      roomId: 'room-a', startsAt, endsAt: '2026-10-26T10:00:00.000Z',
    }), { code: 'AVAILABILITY_WINDOW_INVALID' });
  }
  assert.equal(calls.length, 0);
});
