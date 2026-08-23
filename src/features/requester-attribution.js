import { KEYS, readJson, requestRepository } from '../core/storage.js';

const REQUESTER_ATTRIBUTION_BUILD = '2026.08.23.64';
const originalSave = requestRepository.save.bind(requestRepository);

function currentRequesterName() {
  const profile = readJson(KEYS.profile, { firstName: '', lastName: '' });
  return [profile?.firstName, profile?.lastName]
    .map((value) => String(value || '').trim())
    .filter(Boolean)
    .join(' ')
    .replace(/\s+/g, ' ')
    .slice(0, 160);
}

function attributeNewRequests(nextValue, currentValue) {
  if (!Array.isArray(nextValue)) return nextValue;
  const existingIds = new Set(
    (Array.isArray(currentValue) ? currentValue : [])
      .map((entry) => String(entry?.id || '').trim())
      .filter(Boolean),
  );
  const requesterName = currentRequesterName();
  if (!requesterName) return nextValue;

  return nextValue.map((entry) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return entry;
    const id = String(entry.id || '').trim();
    const storedRequester = String(entry.requesterName || '').trim();
    if (!id || existingIds.has(id) || storedRequester) return entry;
    return { ...entry, requesterName };
  });
}

requestRepository.save = (value) => {
  const current = requestRepository.all();
  return originalSave(attributeNewRequests(value, current));
};

document.documentElement.dataset.requesterAttributionBuild = REQUESTER_ATTRIBUTION_BUILD;
