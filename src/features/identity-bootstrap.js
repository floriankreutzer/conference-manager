import { RUNTIME_MODE, runtimeModeFromDocument } from '../core/security-policy.js';
import { KEYS, readJson, writeJson } from '../core/storage.js';

const IDENTITY_BOOTSTRAP_BUILD = '2026.08.23.02';
const DEMO_IDENTITY_MARKER = 'conference_demo_identity_seed_v1';
const DEMO_PROFILE = Object.freeze({ firstName: 'Florian', lastName: 'Kreutzer' });
const EMPTY_PROFILE = Object.freeze({ firstName: '', lastName: '' });

function hasIdentity(profile) {
  if (!profile || typeof profile !== 'object') return false;
  return Boolean(String(profile.firstName || '').trim() || String(profile.lastName || '').trim());
}

function isDemoProfile(profile) {
  return String(profile?.firstName || '').trim() === DEMO_PROFILE.firstName
    && String(profile?.lastName || '').trim() === DEMO_PROFILE.lastName;
}

function demoIdentityWasSeeded() {
  try { return localStorage.getItem(DEMO_IDENTITY_MARKER) === 'true'; } catch { return false; }
}

function markDemoIdentitySeeded() {
  try { localStorage.setItem(DEMO_IDENTITY_MARKER, 'true'); } catch {}
}

function clearDemoIdentityMarker() {
  try { localStorage.removeItem(DEMO_IDENTITY_MARKER); } catch {}
}

function bootstrapIdentity() {
  const mode = runtimeModeFromDocument(document);
  const existing = readJson(KEYS.profile, null);

  if (mode === RUNTIME_MODE.DEMO) {
    if (!hasIdentity(existing)) writeJson(KEYS.profile, DEMO_PROFILE);
    if (!hasIdentity(existing) || isDemoProfile(existing)) markDemoIdentitySeeded();
    return;
  }

  if (demoIdentityWasSeeded()) {
    writeJson(KEYS.profile, EMPTY_PROFILE);
    clearDemoIdentityMarker();
    return;
  }

  if (!hasIdentity(existing)) writeJson(KEYS.profile, EMPTY_PROFILE);
}

bootstrapIdentity();
document.documentElement.dataset.identityBootstrapBuild = IDENTITY_BOOTSTRAP_BUILD;
