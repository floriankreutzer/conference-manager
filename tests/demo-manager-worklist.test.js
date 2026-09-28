import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveDemoManagerTasks } from '../src/manager/demo-worklist.js';

function state() {
  return {
    requests: [1, 2, 3].map((number) => ({
      id: `request-${number}`, status: 'In Review',
      details: { title: `Anfrage ${number}` },
    })),
    locations: { rooms: [
      { id: 'contoso-paris-room-1', description: 'Atelier', mediaAssetIds: ['image'] },
      { id: 'contoso-paris-room-2', description: null, mediaAssetIds: [] },
    ] },
    catalogue: { roomPrices: [{ roomId: 'contoso-paris-room-1' }], cateringPackages: [] },
  };
}

test('Contoso work follows pending requests and missing business state', () => {
  const current = state();
  const baseline = deriveDemoManagerTasks(current);
  assert.deepEqual(baseline.map(({ id }) => id), [
    'request:request-1', 'request:request-2', 'request:request-3',
    'room:description', 'room:price', 'room:image', 'catalogue:catering',
  ]);
  current.requests[0].status = 'Confirmed';
  current.locations.rooms[1].description = 'Kleiner Besprechungsraum';
  current.locations.rooms[1].mediaAssetIds.push('image-2');
  current.catalogue.roomPrices.push({ roomId: 'contoso-paris-room-2' });
  current.catalogue.cateringPackages.push({ id: 'coffee' });
  assert.deepEqual(deriveDemoManagerTasks(current).map(({ id }) => id), [
    'request:request-2', 'request:request-3',
  ]);
  assert.deepEqual(deriveDemoManagerTasks({ ...current, locations: { rooms: [] } }), []);
});
