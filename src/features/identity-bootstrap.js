import { RUNTIME_MODE, runtimeModeFromDocument } from '../core/security-policy.js';
import { KEYS, readJson, writeJson } from '../core/storage.js';

const IDENTITY_BOOTSTRAP_BUILD = '2026.08.23.01';
const DEMO_PROFILE = Object.freeze({ firstName: 'Florian', lastName: 'Kreutzer' });
const EMPTY_PROFILE = Object.freeze({ firstName: '', lastName: '' });

function hasIdentity(profile) {
  if (!profile || typeof profile !== 'object') return false;
  return Boolean(String(profile.firstName || '').trim() || String(profile.lastName || '').trim());
}

function bootstrapIdentity() {
  const existing = readJson(KEYS.profile, null);
  if (hasIdentity(existing)) return;

  const mode = runtimeModeFromDocument(document);
  const fallback = mode === RUNTIME_MODE.DEMO ? DEMO_PROFILE : EMPTY_PROFILE;
  writeJson(KEYS.profile, fallback);
}

bootstrapIdentity();
document.documentElement.dataset.identityBootstrapBuild = IDENTITY_BOOTSTRAP_BUILD;
