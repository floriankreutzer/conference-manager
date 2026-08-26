import assert from 'node:assert/strict';
import test from 'node:test';
import { loadOpenBookingChanges } from '../src/shared/booking-change-loader.js';

test('booking-change lookups are bounded, isolated, ordered and fail closed', async () => {
  const requests = Array.from({ length: 20 }, (_, index) => ({
    id: `CR-${index}`,
    status: index === 19 ? 'Submitted' : 'Confirmed',
  }));
  let active = 0;
  let maximum = 0;
  const persistence = {
    async loadBookingChange(id) {
      active += 1;
      maximum = Math.max(maximum, active);
      await new Promise((resolve) => setImmediate(resolve));
      active -= 1;
      if (id === 'CR-7') throw new Error('LOOKUP_UNAVAILABLE');
      return id === 'CR-3' ? { id: 'change-3' } : null;
    },
  };

  const result = await loadOpenBookingChanges(requests, persistence);

  assert.equal(maximum <= 8, true);
  assert.deepEqual(result[3], { id: 'change-3' });
  assert.equal(result[7], undefined);
  assert.equal(result[19], null);
  assert.equal(Object.isFrozen(result), true);
});
