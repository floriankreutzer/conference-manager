import test from 'node:test';
import assert from 'node:assert/strict';
import { mergePolicySelection } from '../src/tenant-admin/sections/booking-policies/reference-selection.js';

test('policy selection keeps unknown saved references and exact known selection', () => {
  const options = [{ id: 'a', name: 'Alpha' }, { id: 'b', name: 'Beta' }];
  assert.deepEqual(mergePolicySelection(['old', 'a'], options, ['b']), ['old', 'b']);
  assert.deepEqual(mergePolicySelection(['old', 'a'], [], []), ['old', 'a']);
  assert.deepEqual(mergePolicySelection([], options, []), []);
  assert.deepEqual(mergePolicySelection(['b', 'a'], options, ['a', 'b']), ['b', 'a']);
  assert.throws(() => mergePolicySelection([], options, ['foreign']), /POLICY_REFERENCE_SELECTION_INVALID/);
  assert.throws(() => mergePolicySelection([], options, ['a', 'a']), /POLICY_REFERENCE_SELECTION_INVALID/);
});
