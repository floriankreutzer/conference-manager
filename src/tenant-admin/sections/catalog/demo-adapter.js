import { TENANT_SETTINGS_REVISION_CONFLICT, createDemoTenantSettingsRevision } from '../../settings-revision.js';
import { CATALOGUE_DEMO_SCENARIO, CATALOGUE_DEMO_SCENARIOS, catalogueDemoFixture } from './demo-fixtures.js';

const clone = structuredClone;
const effectiveAt = (value) => `2026-08-27T12:${String(value).padStart(2, '0')}:00.000Z`;
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

export function createDemoCatalogueSettings({ scenario = CATALOGUE_DEMO_SCENARIO.NORMAL } = {}) {
  let revision;
  let catalogue;
  let revisions;
  let currentScenario;
  let conflictPending;
  let recoveryPending;
  const reset = ({ scenario: nextScenario = CATALOGUE_DEMO_SCENARIO.NORMAL } = {}) => {
    if (!CATALOGUE_DEMO_SCENARIOS.includes(nextScenario)) throw new TypeError('CATALOGUE_DEMO_SCENARIO_INVALID');
    revision = createDemoTenantSettingsRevision({ initialRevision: 1 });
    catalogue = catalogueDemoFixture(nextScenario);
    revisions = [{ revision: 1, effectiveAt: effectiveAt(1), catalogue: clone(catalogue) }];
    currentScenario = nextScenario;
    conflictPending = nextScenario === CATALOGUE_DEMO_SCENARIO.CONFLICT;
    recoveryPending = nextScenario === CATALOGUE_DEMO_SCENARIO.RECOVERY;
    return 1;
  };
  reset({ scenario });
  return Object.freeze({
    isDemo: true,
    async loadCatalogue() {
      if (recoveryPending) { recoveryPending = false; throw Object.assign(new Error('DEMO_RECOVERY_REQUIRED'), { code: 'HTTP_503' }); }
      return { schemaVersion: 1, revision: revision.current(), catalogue: clone(catalogue) };
    },
    async saveCatalogue({ expectedRevision, catalogue: next } = {}) {
      if (conflictPending) {
        conflictPending = false;
        revision.advance(revision.current());
        revisions.push({ revision: revision.current(), effectiveAt: effectiveAt(revision.current()), catalogue: clone(catalogue) });
        throw conflict(revision.current());
      }
      const nextRevision = advance(revision, expectedRevision);
      catalogue = clone(next);
      revisions.push({ revision: nextRevision, effectiveAt: effectiveAt(nextRevision), catalogue: clone(catalogue) });
      return { schemaVersion: 1, revision: nextRevision, catalogue: clone(catalogue) };
    },
    async listCatalogueHistory({ limit = 25, beforeRevision = null } = {}) {
      const filtered = revisions.filter((entry) => beforeRevision === null || entry.revision < beforeRevision).reverse();
      return { schemaVersion: 1, revisions: Object.freeze(filtered.slice(0, limit).map((entry) => clone(entry))), nextBeforeRevision: filtered.length > limit ? filtered[limit - 1].revision : null };
    },
    reset,
    scenario() { return currentScenario; },
  });
}
