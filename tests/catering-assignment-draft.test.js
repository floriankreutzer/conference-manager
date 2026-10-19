import assert from 'node:assert/strict';
import test from 'node:test';
import { createCateringAssignmentDraft } from '../src/manager/catering-assignment-draft.js';

const item = (id, active = true) => ({ id, name: id, active });
const current = (assignments = []) => ({ assignments });
test('overlapping packages and inactive components remain one explicit choice without modifying catalogue', () => {
  const catalogue = { cateringItems: [item('coffee'), item('fruit', false), item('water')],
    cateringPackages: [{ ...item('break'), itemIds: ['coffee', 'fruit'] },
      { ...item('lunch'), itemIds: ['fruit'] }] };
  const before = JSON.stringify(catalogue);
  const draft = createCateringAssignmentDraft({ catalogue, current: current() });
  assert.equal(draft.groups.length, 2);
  assert.throws(() => draft.assignments(), /SELECTION_REQUIRED/);
  for (const group of draft.groups) draft.select(group.groupId, group.entries.length > 1 ? 'connection-a' : 'connection-b');
  const assignments = draft.assignments();
  assert.equal(assignments.length, 5);
  assert.equal(assignments.find((entry) => entry.entryId === 'fruit').integrationId, 'connection-a');
  assert.equal(assignments.find((entry) => entry.entryId === 'lunch').integrationId, 'connection-a');
  assert.equal(JSON.stringify(catalogue), before);
});
test('new package membership and inconsistent old ownership require explicit selection', () => {
  const catalogue = { cateringItems: [item('coffee')], cateringPackages: [{ ...item('break'), itemIds: ['coffee'] }] };
  const old = [{ kind: 'item', entryId: 'coffee', integrationId: 'connection-a' }];
  for (const assignments of [old, [...old, { kind: 'package', entryId: 'break', integrationId: 'connection-b' }]]) {
    const draft = createCateringAssignmentDraft({ catalogue, current: current(assignments) });
    assert.equal(draft.selection(draft.groups[0].groupId), '');
    assert.throws(() => draft.assignments(), /SELECTION_REQUIRED/);
  }
  const draft = createCateringAssignmentDraft({ catalogue, current: current([...old,
    { kind: 'package', entryId: 'break', integrationId: 'connection-a' }]) });
  assert.equal(draft.selection(draft.groups[0].groupId), 'connection-a');
});
test('empty and full canonical bounds remain available without receipt-size narrowing', () => {
  assert.deepEqual(createCateringAssignmentDraft({ catalogue: { cateringItems: [], cateringPackages: [] }, current: current() }).assignments(), []);
  const catalogue = { cateringItems: Array.from({ length: 300 }, (_, n) => item(`item-${n}`)),
    cateringPackages: Array.from({ length: 100 }, (_, n) => ({ ...item(`package-${n}`), itemIds: ['item-0'] })) };
  const draft = createCateringAssignmentDraft({ catalogue, current: current() });
  for (const group of draft.groups) draft.select(group.groupId, 'connection-a');
  assert.equal(draft.assignments().length, 400);
});
