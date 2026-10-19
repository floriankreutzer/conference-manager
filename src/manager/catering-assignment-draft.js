// Package components share a connection. Overlapping packages therefore form
// one selectable group; prices, availability and catalogue membership stay unchanged.
export function createCateringAssignmentDraft({ catalogue, current }) {
  const entries = [
    ...catalogue.cateringItems.map((entry) => ({ ...entry, kind: 'item' })),
    ...catalogue.cateringPackages.map((entry) => ({ ...entry, kind: 'package' })),
  ];
  const key = (entry) => `${entry.kind}:${entry.id}`;
  const parent = new Map(entries.map((entry) => [key(entry), key(entry)]));
  function root(value) {
    let result = value;
    while (parent.get(result) !== result) result = parent.get(result);
    return result;
  }
  for (const entry of catalogue.cateringPackages) {
    for (const itemId of entry.itemIds) {
      const itemKey = `item:${itemId}`;
      if (!parent.has(itemKey)) throw new TypeError('CATERING_ASSIGNMENT_CATALOGUE_INVALID');
      parent.set(root(itemKey), root(`package:${entry.id}`));
    }
  }
  const grouped = new Map();
  for (const entry of entries) {
    const groupKey = root(key(entry));
    if (!grouped.has(groupKey)) grouped.set(groupKey, []);
    grouped.get(groupKey).push(Object.freeze({ kind: entry.kind, entryId: entry.id, name: entry.name, active: entry.active }));
  }
  const existing = new Map(current.assignments.map((entry) => [`${entry.kind}:${entry.entryId}`, entry.integrationId]));
  const selected = new Map();
  const groups = [...grouped.entries()].map(([groupId, members]) => {
    const values = members.map((entry) => existing.get(`${entry.kind}:${entry.entryId}`));
    selected.set(groupId, values.every((value) => value && value === values[0]) ? values[0] : '');
    return Object.freeze({ groupId, entries: Object.freeze(members) });
  });
  return Object.freeze({
    groups: Object.freeze(groups),
    selection(groupId) { return selected.get(groupId) ?? ''; },
    select(groupId, integrationId) {
      if (!selected.has(groupId) || typeof integrationId !== 'string') throw new TypeError('CATERING_ASSIGNMENT_GROUP_INVALID');
      selected.set(groupId, integrationId);
    },
    assignments() {
      if ([...selected.values()].some((value) => !value)) throw new TypeError('CATERING_ASSIGNMENT_SELECTION_REQUIRED');
      return Object.freeze(groups.flatMap((group) => group.entries.map((entry) => Object.freeze({
        kind: entry.kind, entryId: entry.entryId, integrationId: selected.get(group.groupId),
      }))));
    },
  });
}
