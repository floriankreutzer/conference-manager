import assert from 'node:assert/strict';
import test from 'node:test';
import { createDemoManagerWorklistController } from '../src/manager/demo-worklist-controller.js';

function setup() {
  const target = {};
  const shown = [];
  const authorityErrors = [];
  const state = {
    target,
    requests: [{ id: 'request-1', status: 'In Review', details: { title: 'Review' } }],
    configuration: { rooms: [{ id: 'contoso-paris-room-2', description: null, mediaAssetIds: [] }] },
    catalogue: { roomPrices: [], cateringPackages: [] },
  };
  const persistence = {
    listRequests: async () => structuredClone(state.requests),
    async transitionRequest(id, command) {
      assert.equal(this, persistence);
      state.requests.find((entry) => entry.id === id).status = command.status;
      return command;
    },
  };
  const locations = {
    loadLocations: async () => ({ configuration: structuredClone(state.configuration) }),
    async saveLocations(configuration) {
      state.configuration = configuration;
      return configuration;
    },
    async applyBulk(configuration) {
      state.configuration = configuration;
      return configuration;
    },
  };
  const catalogue = {
    loadCatalogue: async () => ({ catalogue: structuredClone(state.catalogue) }),
    async saveCatalogue(value) {
      state.catalogue = value;
      return value;
    },
  };
  const controller = createDemoManagerWorklistController({
    persistence, locations, catalogue,
    currentTarget: () => state.target,
    present: (node, snapshot) => shown.push({ node, ...snapshot }),
    onAuthorityFailure: (error) => authorityErrors.push(error),
  });
  const ids = () => shown.at(-1).tasks.map(({ id }) => id);
  return { controller, state, shown, authorityErrors, persistence, locations, catalogue, ids };
}

test('committed room, price, catering, image and request mutations immediately refresh real pending work', async () => {
  const fixture = setup();
  const { controller, state, ids } = fixture;
  await controller.refresh();
  assert.equal(ids().length, 5);
  const configuration = structuredClone(state.configuration);
  configuration.rooms[0].description = 'Configured studio';
  assert.equal(await controller.locations.saveLocations(configuration), configuration);
  assert.ok(!ids().includes('room:description'));
  const catalog = { roomPrices: [{ roomId: 'contoso-paris-room-2' }], cateringPackages: [{ id: 'coffee' }] };
  assert.equal(await controller.catalogue.saveCatalogue(catalog), catalog);
  assert.deepEqual(ids(), ['request:request-1', 'room:image']);
  configuration.rooms[0].mediaAssetIds.push('asset-1');
  await controller.locations.applyBulk(configuration);
  assert.deepEqual(ids(), ['request:request-1']);
  const command = { status: 'Confirmed' };
  assert.equal(await controller.persistence.transitionRequest('request-1', command), command);
  assert.deepEqual(ids(), []);
  assert.equal(controller.persistence.listRequests, fixture.persistence.listRequests);
  assert.equal(controller.catalogue.applyBulk, undefined);
  assert.equal(Object.isFrozen(controller.locations), true);
});

test('failed writes neither fabricate task completion nor replace the original mutation error', async () => {
  const { controller, persistence, shown } = setup();
  const error = new Error('write-conflict');
  persistence.transitionRequest = async () => { throw error; };
  await controller.refresh();
  const before = shown.length;
  await assert.rejects(controller.persistence.transitionRequest('request-1', {}), (caught) => caught === error);
  assert.equal(shown.length, before);
});

test('a failed reread reports unavailable without falsely rejecting an already committed write', async () => {
  const { controller, persistence, shown } = setup();
  persistence.listRequests = async () => { throw new Error('read-unavailable'); };
  const command = { status: 'Confirmed' };
  assert.equal(await controller.persistence.transitionRequest('request-1', command), command);
  assert.equal(shown.at(-1).status, 'error');
  assert.equal(shown.at(-1).tasks, undefined);
});

test('late read completion cannot resurrect stale tasks or a detached/locked workspace', async () => {
  const { controller, persistence, state, shown } = setup();
  let release;
  persistence.listRequests = () => new Promise((resolve) => { release = resolve; });
  const oldRead = controller.refresh();
  persistence.listRequests = async () => [];
  await controller.refresh();
  const count = shown.length;
  release([{ id: 'stale', status: 'In Review' }]);
  await oldRead;
  assert.equal(shown.length, count);
  assert.ok(!shown.at(-1).tasks.some(({ id }) => id === 'request:stale'));

  persistence.listRequests = () => new Promise((resolve) => { release = resolve; });
  const detached = controller.refresh();
  state.target = null;
  release([]);
  await detached;
  assert.equal(shown.at(-1).status, 'loading');
  const finalCount = shown.length;
  await controller.refresh();
  assert.equal(shown.length, finalCount);
});

test('authority failures from old reads still reach the owning session boundary', async () => {
  const { controller, persistence, state, shown, authorityErrors } = setup();
  let reject;
  persistence.listRequests = () => new Promise((_resolve, fail) => { reject = fail; });
  const read = controller.refresh();
  state.target = null;
  const error = Object.assign(new Error('revoked'), { code: 'HTTP_403' });
  reject(error);
  await read;
  assert.deepEqual(authorityErrors, [error]);
  assert.equal(shown.at(-1).status, 'loading');
});
