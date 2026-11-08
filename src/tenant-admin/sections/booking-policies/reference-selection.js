// Keep unresolved saved references; a missing catalogue is never an empty policy.
export function mergePolicySelection(savedIds, options, selectedIds) {
  const known = new Set(options.map((option) => option.id));
  if (selectedIds.some((id) => !known.has(id)) || new Set(selectedIds).size !== selectedIds.length) {
    throw new TypeError('POLICY_REFERENCE_SELECTION_INVALID');
  }
  const selected = new Set(selectedIds);
  return [...savedIds.filter((id) => !known.has(id) || selected.has(id)),
    ...selectedIds.filter((id) => !savedIds.includes(id))];
}
