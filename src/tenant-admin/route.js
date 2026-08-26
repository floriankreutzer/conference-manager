const OVERVIEW_ID = 'overview';
const ROUTE_PREFIX = '#tenant-admin/';

function availableSectionIds(sections) {
  const registered = Array.isArray(sections) ? sections : [];
  return new Set(
    registered
      .filter((section) => section?.available === true && typeof section.id === 'string')
      .map((section) => section.id),
  );
}

export function tenantAdminSectionFromHash(hash, sections) {
  const availableIds = availableSectionIds(sections);
  const raw = String(hash || '');
  if (!raw.startsWith(ROUTE_PREFIX)) return OVERVIEW_ID;

  let candidate = '';
  try {
    candidate = decodeURIComponent(raw.slice(ROUTE_PREFIX.length).split(/[?#]/, 1)[0]);
  } catch {
    return OVERVIEW_ID;
  }
  return availableIds.has(candidate) ? candidate : OVERVIEW_ID;
}

export function tenantAdminHashForSection(sectionId) {
  const normalized = String(sectionId || OVERVIEW_ID);
  return `${ROUTE_PREFIX}${encodeURIComponent(normalized)}`;
}

export function isTenantAdminRoute(hash = globalThis.location?.hash) {
  return /^#tenant-admin(?:\/|$)/.test(String(hash || ''));
}
