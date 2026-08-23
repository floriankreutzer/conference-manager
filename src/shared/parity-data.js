import { language, t, tFor } from '../core/i18n.js';
import { KEYS, RepositoryWriteError, readJson, writeJson } from '../core/storage.js';
import { safeHttpsUrl } from '../core/ui.js';

const DEFAULT_CATERING_IMAGES = Object.freeze({
  'meeting:Basic': 'https://images.unsplash.com/photo-1495474472287-4d71bcdd2085?auto=format&fit=crop&w=900&q=80',
  'meeting:Standard': 'https://images.unsplash.com/photo-1511081692775-05d0f180a065?auto=format&fit=crop&w=900&q=80',
  'meeting:Deluxe': 'https://images.unsplash.com/photo-1445116572660-236099ec97a0?auto=format&fit=crop&w=900&q=80',
  'breakfast:Basic': 'https://images.unsplash.com/photo-1533089860892-a7c6f0a88666?auto=format&fit=crop&w=900&q=80',
  'breakfast:Standard': 'https://images.unsplash.com/photo-1525351484163-7529414344d8?auto=format&fit=crop&w=900&q=80',
  'breakfast:Deluxe': 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=900&q=80',
  'lunch:Basic': 'https://images.unsplash.com/photo-1504674900247-0877df9cc836?auto=format&fit=crop&w=900&q=80',
  'lunch:Standard': 'https://images.unsplash.com/photo-1559339352-11d035aa65de?auto=format&fit=crop&w=900&q=80',
  'lunch:Deluxe': 'https://images.unsplash.com/photo-1547592180-85f173990554?auto=format&fit=crop&w=900&q=80',
  'full:Basic': 'https://images.unsplash.com/photo-1528605248644-14dd04022da1?auto=format&fit=crop&w=900&q=80',
  'full:Standard': 'https://images.unsplash.com/photo-1515003197210-e0cd71810e0f180a065?auto=format&fit=crop&w=900&q=80',
  'full:Deluxe': 'https://images.unsplash.com/photo-1414235077428-338989a2e8c0?auto=format&fit=crop&w=900&q=80',
});

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

export function safeImageSource(value, fallback = '') {
  const raw = String(value || '').trim();
  if (raw.startsWith('data:image/svg+xml')) return raw;
  return safeHttpsUrl(raw) || fallback;
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
      if (!variant.image) {
        const fallback = DEFAULT_CATERING_IMAGES[`${pack.id}:${variant.tier}`];
        if (fallback) {
          variant.image = fallback;
          changed = true;
        }
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
