const KEYS = Object.freeze({
  requests: 'conference_requests',
  catalog: 'conference_catalog_v2',
  siteInfo: 'conference_site_info_v1',
  language: 'conference_language_v1',
  role: 'conference_demo_role_v1',
  notifications: 'conference_notifications_v1',
  draft: 'conference_request_draft_v1',
  profile: 'conference_user_profile_v1',
});

export { KEYS };

export function readJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return structuredClone(fallback);
    return JSON.parse(raw);
  } catch {
    return structuredClone(fallback);
  }
}

export function writeJson(key, value) {
  localStorage.setItem(key, JSON.stringify(value));
}

export function remove(key) {
  localStorage.removeItem(key);
}

export function readString(key, fallback = '') {
  try {
    return localStorage.getItem(key) ?? fallback;
  } catch {
    return fallback;
  }
}

export function writeString(key, value) {
  localStorage.setItem(key, String(value));
}

export function createRepository({ key, fallback = [] }) {
  return {
    all() {
      const value = readJson(key, fallback);
      return Array.isArray(fallback) && !Array.isArray(value) ? structuredClone(fallback) : value;
    },
    save(value) {
      writeJson(key, value);
      return value;
    },
    update(mutator) {
      const current = this.all();
      const next = mutator(structuredClone(current));
      this.save(next);
      return next;
    },
  };
}

export const requestRepository = createRepository({ key: KEYS.requests, fallback: [] });
export const notificationRepository = createRepository({ key: KEYS.notifications, fallback: [] });
