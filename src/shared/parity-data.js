import { language, t, tFor } from '../core/i18n.js';
import { KEYS, RepositoryWriteError, readJson, writeJson } from '../core/storage.js';
import { safeHttpsUrl } from '../core/ui.js';

const CATERING_ART = Object.freeze({
  meeting: '<path d="M244 148h250v160a92 92 0 0 1-92 92h-66a92 92 0 0 1-92-92z" fill="#fff"/><path d="M494 194h34a64 64 0 0 1 0 128h-34" fill="none" stroke="#1d1d1f" stroke-width="24"/><path d="M304 112c-28-34 26-48 0-80M374 112c-28-34 26-48 0-80M444 112c-28-34 26-48 0-80" fill="none" stroke="#fff" stroke-linecap="round" stroke-width="18"/>',
  breakfast: '<circle cx="370" cy="172" r="92" fill="#fff"/><path d="M370 40v-30M370 334v-30M238 172h-30M532 172h-30M276 78l-22-22M486 288l-22-22M464 78l22-22M254 288l22-22" stroke="#fff" stroke-linecap="round" stroke-width="18"/><path d="M232 402h276l-34-124H266z" fill="#fff"/><path d="M286 330h168" stroke="#1d1d1f" stroke-linecap="round" stroke-width="18"/>',
  lunch: '<circle cx="370" cy="230" r="160" fill="#fff"/><circle cx="370" cy="230" r="104" fill="none" stroke="#d0d0ce" stroke-width="18"/><path d="M164 78v304M128 78v112a36 36 0 0 0 72 0V78M576 78v304M576 78c72 52 72 138 0 176" fill="none" stroke="#fff" stroke-linecap="round" stroke-linejoin="round" stroke-width="20"/>',
  full: '<path d="M138 108h236v152a86 86 0 0 1-86 86h-64a86 86 0 0 1-86-86z" fill="#fff"/><path d="M374 146h30a58 58 0 0 1 0 116h-30" fill="none" stroke="#1d1d1f" stroke-width="22"/><circle cx="528" cy="282" r="118" fill="#fff"/><circle cx="528" cy="282" r="74" fill="none" stroke="#d0d0ce" stroke-width="16"/><path d="M220 80c-24-30 22-42 0-70M286 80c-24-30 22-42 0-70" fill="none" stroke="#fff" stroke-linecap="round" stroke-width="16"/>',
});

const TIER_ACCENTS = Object.freeze({
  Basic: '#53565a',
  Standard: '#7a1f3d',
  Deluxe: '#8a6334',
});

function generatedCateringImage(packageId, tier) {
  const art = CATERING_ART[packageId] || CATERING_ART.meeting;
  const accent = TIER_ACCENTS[tier] || TIER_ACCENTS.Basic;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 740 460">
    <rect width="740" height="460" fill="${accent}"/>
    <circle cx="92" cy="78" r="120" fill="#ffffff" opacity=".08"/>
    <circle cx="674" cy="412" r="170" fill="#ffffff" opacity=".08"/>
    ${art}
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

const DEFAULT_CATERING_IMAGES = Object.freeze(Object.fromEntries(
  Object.keys(CATERING_ART).flatMap((packageId) => Object.keys(TIER_ACCENTS).map((tier) => [
    `${packageId}:${tier}`,
    generatedCateringImage(packageId, tier),
  ])),
));

const DEFAULT_ROOM_DESCRIPTIONS = Object.freeze({
  'BER-321': {
    de: 'Kompakter Besprechungsraum mit Tischinsel für bis zu 12 Personen und Display an der Stirnseite.',
    en: 'Compact meeting room with a central table for up to 12 people and a display at the front.',
  },
  'BER-412': {
    de: 'Großer Konferenzraum mit zentralem Boardtable, zwei Displays und Präsentationsfläche.',
    en: 'Large conference room with a central board table, dual displays and presentation area.',
  },
  'BER-AUD': {
    de: 'Auditorium mit Bühnenbereich, Reihenbestuhlung und Hybrid-Event-Setup.',
    en: 'Auditorium with stage area, theatre seating and a hybrid-event setup.',
  },
  'STR-201': {
    de: 'Mittlerer Meetingraum mit Tischgruppe und Fokus auf kleinere Workshops.',
    en: 'Medium-sized meeting room with grouped tables, suitable for smaller workshops.',
  },
  'STR-ATR': {
    de: 'Offene Atriumfläche für Townhalls, Events und größere Gruppen.',
    en: 'Open atrium space for town halls, events and larger groups.',
  },
  'FRA-105': {
    de: 'Moderner Meetingraum mit Boardtable, Whiteboard und Teams-Setup.',
    en: 'Modern meeting room with board table, whiteboard and Teams setup.',
  },
});

export const DEMO_IMAGE_SOURCE_MAX_LENGTH = 32_768;

const INLINE_SVG_PATTERN = /^data:image\/svg\+xml(?:;charset=utf-8)?,/i;
const MANAGED_IMAGE_PATH_PATTERN = /(?:^|\/)assets\/[^?#]+\.(?:avif|gif|jpe?g|png|svg|webp)$/i;
const UNSAFE_INLINE_SVG_PATTERN = /(?:<\s*(?:script|style|foreignobject|iframe|object|embed|image|use|a)\b|<\s*!|<\s*\?|\b(?:href|xlink:href|src|style|on[a-z]+)\s*=|(?:url\s*\(|@import))/i;

export const catalogData = () => readJson(KEYS.catalog, {
  rooms: [],
  services: [],
  cateringPackages: [],
  cateringItems: [],
});

export const requestData = () => readJson(KEYS.requests, []);
export const siteData = () => readJson(KEYS.siteInfo, {});

export function localized(value) {
  if (value && typeof value === 'object') return value[language()] ?? value.de ?? value.en ?? '';
  return String(value ?? '');
}

export function setLocalized(current, value) {
  const base = current && typeof current === 'object'
    ? { ...current }
    : { de: String(current || ''), en: String(current || '') };
  base[language()] = String(value ?? '');
  return base;
}

function escapeXml(value) {
  return String(value ?? '').replace(/[<>&"']/g, (character) => ({
    '<': '&lt;',
    '>': '&gt;',
    '&': '&amp;',
    '"': '&quot;',
    "'": '&apos;',
  })[character]);
}

export function validatedImageSource(value, {
  baseUrl = globalThis.window?.location?.href,
  origin = globalThis.window?.location?.origin,
} = {}) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  if (raw.length > DEMO_IMAGE_SOURCE_MAX_LENGTH) return null;

  if (INLINE_SVG_PATTERN.test(raw)) {
    const separator = raw.indexOf(',');
    try {
      const svg = decodeURIComponent(raw.slice(separator + 1)).trim();
      if (
        !/^<svg\b[^>]*xmlns=["']http:\/\/www\.w3\.org\/2000\/svg["'][^>]*>/i.test(svg)
        || !/<\/svg>$/i.test(svg)
        || UNSAFE_INLINE_SVG_PATTERN.test(svg)
      ) return null;
      return raw;
    } catch {
      return null;
    }
  }

  if (!baseUrl && origin) baseUrl = `${origin}/`;
  if (!baseUrl && !/^(?:[a-z][a-z0-9+.-]*:|\/\/)/i.test(raw)) {
    baseUrl = 'https://demo.invalid/';
    origin = 'https://demo.invalid';
  }
  if (!baseUrl) return null;
  try {
    const base = new URL(baseUrl);
    const trustedOrigin = origin || base.origin;
    const url = new URL(raw, base);
    const localManagedAsset = ['http:', 'https:'].includes(url.protocol)
      && !url.username
      && !url.password
      && url.origin === trustedOrigin
      && MANAGED_IMAGE_PATH_PATTERN.test(url.pathname);
    return localManagedAsset ? raw : null;
  } catch {
    return null;
  }
}

export function safeImageSource(value, fallback = '') {
  const source = validatedImageSource(value);
  if (!source) return fallback;
  if (INLINE_SVG_PATTERN.test(source)) return source;
  try {
    return new URL(source, window.location.href).href;
  } catch {
    return fallback;
  }
}

export function validatedHttps(value) {
  const trimmed = String(value || '').trim();
  if (!trimmed) return '';
  return safeHttpsUrl(trimmed);
}

export function ensureParityCatalog() {
  const catalog = catalogData();
  let changed = false;

  for (const pack of catalog.cateringPackages || []) {
    for (const variant of pack.variants || []) {
      const fallback = DEFAULT_CATERING_IMAGES[`${pack.id}:${variant.tier}`];
      const imageSource = validatedImageSource(variant.image);
      if (fallback && !imageSource) {
        variant.image = fallback;
        changed = true;
      } else if (imageSource && imageSource !== variant.image) {
        variant.image = imageSource;
        changed = true;
      }
    }
  }

  for (const room of catalog.rooms || []) {
    if (!room.floorplanDescription) {
      room.floorplanDescription = structuredClone(
        DEFAULT_ROOM_DESCRIPTIONS[room.id] || {
          de: tFor('de', 'room.floorplan.defaultDescription', { capacity: room.capacity || 0 }),
          en: tFor('en', 'room.floorplan.defaultDescription', { capacity: room.capacity || 0 }),
        },
      );
      changed = true;
    }
  }

  if (changed) writeJson(KEYS.catalog, catalog);
}

export function generatedFloorplan(room) {
  const title = escapeXml(localized(room.name));
  const floor = escapeXml(localized(room.floor));
  const capacity = Number(room.capacity || 0);
  const auditorium = String(room.id).includes('AUD');
  const atrium = String(room.id).includes('ATR');

  const seats = auditorium
    ? Array.from({ length: 18 }, (_value, index) => {
      const x = 140 + (index % 6) * 82;
      const y = 190 + Math.floor(index / 6) * 72;
      return `<rect x="${x}" y="${y}" width="48" height="34" rx="8" fill="#F5EEE6" stroke="#7A1F3D" stroke-width="2"/>`;
    }).join('')
    : '';

  const center = atrium
    ? '<circle cx="360" cy="240" r="105" fill="#F5EEE6" stroke="#7A1F3D" stroke-width="4"/><circle cx="360" cy="240" r="42" fill="#ffffff" stroke="#C29A6B" stroke-width="3"/>'
    : '<rect x="180" y="150" width="360" height="170" rx="22" fill="#F5EEE6" stroke="#7A1F3D" stroke-width="4"/>';

  const stage = auditorium
    ? `<rect x="190" y="350" width="420" height="44" rx="6" fill="#7A1F3D"/><text x="400" y="380" text-anchor="middle" font-family="Arial,sans-serif" font-size="20" fill="#ffffff">${escapeXml(t('room.presentation'))}</text>`
    : '';

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 460">
    <rect width="800" height="460" fill="#f7f7f7"/>
    <rect x="24" y="24" width="752" height="412" rx="10" fill="#ffffff" stroke="#1d1d1f" stroke-width="5"/>
    <rect x="48" y="48" width="704" height="70" rx="6" fill="#1d1d1f"/>
    <text x="72" y="91" font-family="Arial,sans-serif" font-size="28" font-weight="700" fill="#ffffff">${title}</text>
    ${auditorium ? seats : center}
    ${stage}
    <rect x="590" y="150" width="120" height="45" rx="4" fill="#d0d0ce" stroke="#1d1d1f" stroke-width="2"/>
    <rect x="605" y="230" width="90" height="75" rx="4" fill="#efe7db" stroke="#C29A6B" stroke-width="3"/>
    <text x="70" y="398" font-family="Arial,sans-serif" font-size="18" fill="#53565a">${floor} · ${capacity}</text>
    <path d="M70 350h90" stroke="#1d1d1f" stroke-width="8"/><path d="M160 336l24 14-24 14z" fill="#1d1d1f"/>
  </svg>`;
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function writeAuthoritativeJson(key, value) {
  if (!writeJson(key, value)) throw new RepositoryWriteError(key);
  return value;
}

export function writeCatalog(catalog) {
  return writeAuthoritativeJson(KEYS.catalog, catalog);
}

export function writeSites(sites) {
  return writeAuthoritativeJson(KEYS.siteInfo, sites);
}
