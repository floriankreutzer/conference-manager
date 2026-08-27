import { TENANT_SETTINGS_REVISION_CONFLICT, createDemoTenantSettingsRevision } from '../../settings-revision.js';
import { LOCATIONS_DEMO_SCENARIO, LOCATIONS_DEMO_SCENARIOS, locationsDemoFixture } from './demo-fixtures.js';
import { createLocationRollbackConfiguration } from './rollback-preview.js';

const clone = structuredClone;
const changedAt = (value) => `2026-08-27T11:${String(value).padStart(2, '0')}:00.000Z`;
const DEMO_ACTOR = '00000000-0000-4000-8000-000000000001';
const DEMO_OTHER_ACTOR = '00000000-0000-4000-8000-000000000002';
const conflict = (currentRevision) => Object.assign(new Error(TENANT_SETTINGS_REVISION_CONFLICT), {
  code: 'HTTP_409', serverCode: TENANT_SETTINGS_REVISION_CONFLICT, currentRevision,
});
const advance = (revision, expectedRevision) => {
  try { return revision.advance(expectedRevision); }
  catch (error) {
    if (error?.code === TENANT_SETTINGS_REVISION_CONFLICT) throw conflict(error.currentRevision);
    throw error;
  }
};

export function createDemoLocationSettings({ scenario = LOCATIONS_DEMO_SCENARIO.NORMAL } = {}) {
  let revision;
  let configuration;
  let providerContext;
  let snapshots;
  let currentScenario;
  let conflictPending;
  let recoveryPending;
  const reset = ({ scenario: nextScenario = LOCATIONS_DEMO_SCENARIO.NORMAL } = {}) => {
    if (!LOCATIONS_DEMO_SCENARIOS.includes(nextScenario)) throw new TypeError('LOCATIONS_DEMO_SCENARIO_INVALID');
    revision = createDemoTenantSettingsRevision({ initialRevision: 1 });
    ({ configuration, providerContext } = locationsDemoFixture(nextScenario));
    snapshots = [{ revision: 1, configuration: clone(configuration), changedAt: changedAt(1), actorUserId: DEMO_ACTOR }];
    currentScenario = nextScenario;
    conflictPending = nextScenario === LOCATIONS_DEMO_SCENARIO.CONFLICT;
    recoveryPending = nextScenario === LOCATIONS_DEMO_SCENARIO.RECOVERY;
    return 1;
  };
  reset({ scenario });

  return Object.freeze({
    isDemo: true,
    async loadLocations() {
      if (recoveryPending) { recoveryPending = false; throw Object.assign(new Error('DEMO_RECOVERY_REQUIRED'), { code: 'HTTP_503' }); }
      return { schemaVersion: 1, revision: revision.current(), configuration: clone(configuration), providerContext: clone(providerContext) };
    },
    async saveLocations({ expectedRevision, configuration: next } = {}) {
      if (conflictPending) {
        conflictPending = false;
        revision.advance(revision.current());
        snapshots.push({ revision: revision.current(), configuration: clone(configuration), changedAt: changedAt(revision.current()), actorUserId: DEMO_OTHER_ACTOR });
        throw conflict(revision.current());
      }
      const nextRevision = advance(revision, expectedRevision);
      configuration = clone(next);
      snapshots.push({ revision: nextRevision, configuration: clone(configuration), changedAt: changedAt(nextRevision), actorUserId: DEMO_ACTOR });
      return { schemaVersion: 1, revision: nextRevision, configuration: clone(configuration), providerContext: clone(providerContext) };
    },
    async listLocationsHistory({ limit = 50 } = {}) { return Object.freeze(snapshots.slice(-limit).reverse().map(({ configuration: omitted, ...entry }) => Object.freeze(entry))); },
    async loadLocationRevision(sourceRevision) {
      const found = snapshots.find((entry) => entry.revision === sourceRevision);
      if (!found) throw Object.assign(new Error('HTTP_404'), { code: 'HTTP_404' });
      return clone(found);
    },
    async rollbackLocations({ expectedRevision, sourceRevision } = {}) {
      const source = snapshots.find((entry) => entry.revision === sourceRevision);
      if (!source) throw Object.assign(new Error('HTTP_404'), { code: 'HTTP_404' });
      const nextRevision = advance(revision, expectedRevision);
      configuration = clone(createLocationRollbackConfiguration(configuration, source.configuration));
      snapshots.push({ revision: nextRevision, configuration: clone(configuration), changedAt: changedAt(nextRevision), actorUserId: DEMO_ACTOR });
      return { schemaVersion: 1, revision: nextRevision, configuration: clone(configuration), providerContext: clone(providerContext) };
    },
    reset,
    scenario() { return currentScenario; },
  });
}
