import {
  TENANT_SETTINGS_REVISION_CONFLICT,
  createDemoTenantSettingsRevision,
} from '../../settings-revision.js';
import {
  ORGANIZATION_DEMO_SCENARIO,
  ORGANIZATION_DEMO_SCENARIOS,
  organizationDemoFixture,
} from './demo-fixtures.js';

const at = (revision) => `2026-08-27T10:${String(revision).padStart(2, '0')}:00.000Z`;
const clone = (value) => structuredClone(value);
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

export function createDemoOrganizationSettings({ scenario = ORGANIZATION_DEMO_SCENARIO.NORMAL } = {}) {
  let revision;
  let organization;
  let revisions;
  let currentScenario;
  let conflictPending;
  let recoveryPending;

  const reset = ({ scenario: nextScenario = ORGANIZATION_DEMO_SCENARIO.NORMAL } = {}) => {
    if (!ORGANIZATION_DEMO_SCENARIOS.includes(nextScenario)) throw new TypeError('ORGANIZATION_DEMO_SCENARIO_INVALID');
    revision = createDemoTenantSettingsRevision({ initialRevision: 1 });
    organization = organizationDemoFixture(nextScenario);
    revisions = [{ revision: 1, effectiveAt: at(1), organization: clone(organization) }];
    currentScenario = nextScenario;
    conflictPending = nextScenario === ORGANIZATION_DEMO_SCENARIO.CONFLICT;
    recoveryPending = nextScenario === ORGANIZATION_DEMO_SCENARIO.RECOVERY;
    return 1;
  };
  reset({ scenario });

  return Object.freeze({
    isDemo: true,
    async loadOrganization() {
      if (recoveryPending) {
        recoveryPending = false;
        throw Object.assign(new Error('DEMO_RECOVERY_REQUIRED'), { code: 'HTTP_503' });
      }
      return Object.freeze({ schemaVersion: 1, revision: revision.current(), organization: clone(organization) });
    },
    async saveOrganization({ expectedRevision, organization: next } = {}) {
      if (conflictPending) {
        conflictPending = false;
        revision.advance(revision.current());
        revisions.push({ revision: revision.current(), effectiveAt: at(revision.current()), organization: clone(organization) });
        throw conflict(revision.current());
      }
      const nextRevision = advance(revision, expectedRevision);
      organization = clone(next);
      revisions.push({ revision: nextRevision, effectiveAt: at(nextRevision), organization: clone(organization) });
      return Object.freeze({ schemaVersion: 1, revision: nextRevision, organization: clone(organization) });
    },
    async listOrganizationHistory({ limit = 25, beforeRevision = null } = {}) {
      const filtered = revisions.filter((entry) => beforeRevision === null || entry.revision < beforeRevision).reverse();
      return Object.freeze({
        schemaVersion: 1,
        revisions: Object.freeze(filtered.slice(0, limit).map((entry) => clone(entry))),
        nextBeforeRevision: filtered.length > limit ? filtered[limit - 1].revision : null,
      });
    },
    reset,
    scenario() { return currentScenario; },
  });
}
