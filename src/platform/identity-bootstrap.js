import { RUNTIME_MODE, runtimeModeFromDocument } from '../core/security-policy.js';
import { KEYS, readJson, writeJson } from '../core/storage.js';

const IDENTITY_BOOTSTRAP_BUILD = '2026.08.24.01';
const DEMO_IDENTITY_MARKER = 'conference_demo_identity_seed_v1';
const DEMO_PROFILE = Object.freeze({ firstName: 'Florian', lastName: 'Kreutzer' });

function hasIdentity(profile) {
  if (!profile || typeof profile !== 'object') return false;
  return Boolean(String(profile.firstName || '').trim() || String(profile.lastName || '').trim());
}

function isDemoProfile(profile) {
  return String(profile?.firstName || '').trim() === DEMO_PROFILE.firstName
    && String(profile?.lastName || '').trim() === DEMO_PROFILE.lastName;
}

function markDemoIdentitySeeded() {
  try { localStorage.setItem(DEMO_IDENTITY_MARKER, 'true'); } catch {}
}

function bootstrapIdentity() {
  if (runtimeModeFromDocument(document) !== RUNTIME_MODE.DEMO) return;

  const existing = readJson(KEYS.profile, null);
  if (!hasIdentity(existing)) writeJson(KEYS.profile, DEMO_PROFILE);
  if (!hasIdentity(existing) || isDemoProfile(existing)) markDemoIdentitySeeded();
}

bootstrapIdentity();
document.documentElement.dataset.identityBootstrapBuild = IDENTITY_BOOTSTRAP_BUILD;
