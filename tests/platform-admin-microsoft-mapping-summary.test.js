import assert from 'node:assert/strict';
import test from 'node:test';
import { microsoftMappingSummaryPresentation } from '../src/platform-admin/microsoft-mapping-summary.js';

test('labels an empty room mapping set as not configured', () => {
  assert.deepEqual(
    microsoftMappingSummaryPresentation({ active: 0, total: 0 }),
    {
      messageKey: 'platformAdmin.integration.mappingSummary.none',
      values: null,
    },
  );
});

test('retains the active-to-total summary when mappings exist', () => {
  assert.deepEqual(
    microsoftMappingSummaryPresentation({ active: 1, total: 2 }),
    {
      messageKey: 'platformAdmin.integration.mappingSummary',
      values: { active: 1, total: 2 },
    },
  );
});

test('does not label configured but inactive mappings as unconfigured', () => {
  assert.deepEqual(
    microsoftMappingSummaryPresentation({ active: 0, total: 3 }),
    {
      messageKey: 'platformAdmin.integration.mappingSummary',
      values: { active: 0, total: 3 },
    },
  );
});
