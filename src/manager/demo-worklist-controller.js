import { authorityFailureCode } from '../shared/authority-failure.js';
import { deriveDemoManagerTasks } from './demo-worklist.js';

// This controller owns only the read projection of Demo work. Mutations still
// use the canonical server adapters; their successful result is never invented.
export function createDemoManagerWorklistController({
  persistence, locations, catalogue, currentTarget, present, onAuthorityFailure,
} = {}) {
  if (![currentTarget, present, onAuthorityFailure].every((value) => typeof value === 'function')) {
    throw new TypeError('DEMO_WORKLIST_LIFECYCLE_REQUIRED');
  }
  let generation = 0;

  async function refresh() {
    const target = currentTarget();
    const version = ++generation;
    if (!target) return;
    const isCurrent = () => version === generation && currentTarget() === target;
    present(target, Object.freeze({ status: 'loading' }));
    try {
      const [requests, locationSnapshot, catalogueSnapshot] = await Promise.all([
        persistence.listRequests(),
        locations.loadLocations({ schemaVersion: 3 }),
        catalogue.loadCatalogue(),
      ]);
      if (!isCurrent()) return;
      const tasks = deriveDemoManagerTasks({
        requests,
        locations: locationSnapshot.configuration,
        catalogue: catalogueSnapshot.catalogue,
      });
      present(target, Object.freeze({ status: 'ready', tasks }));
    } catch (error) {
      // Revocation must invalidate authority even when its old UI is detached.
      if (authorityFailureCode(error)) {
        onAuthorityFailure(error);
        return;
      }
      if (isCurrent()) present(target, Object.freeze({ status: 'error' }));
    }
  }

  function observeMutations(adapter, methods) {
    const observed = { ...adapter };
    for (const method of methods) {
      if (typeof adapter[method] !== 'function') continue;
      observed[method] = async (...args) => {
        const result = await adapter[method](...args);
        // A failed reread is shown as unavailable, not as all tasks completed,
        // and must not turn an already committed mutation into a false failure.
        await refresh();
        return result;
      };
    }
    return Object.freeze(observed);
  }

  return Object.freeze({
    refresh,
    persistence: observeMutations(persistence, [
      'transitionRequest', 'proposeBookingChange', 'decideBookingChange',
    ]),
    locations: observeMutations(locations, ['saveLocations', 'applyBulk']),
    catalogue: observeMutations(catalogue, ['saveCatalogue', 'applyBulk']),
  });
}
