const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;
const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const INTERNAL_UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const ISO_UTC_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;

export class TenantSettingsWireError extends Error {
  constructor(code) {
    super(code);
    this.name = 'TenantSettingsWireError';
    this.code = code;
  }
}

function invalid(code) {
  throw new TenantSettingsWireError(code);
}

export function exactObject(value, keys, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(code);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (actual.length !== expected.length || actual.some((key, index) => key !== expected[index])) {
    invalid(code);
  }
  return value;
}

export function positiveRevision(value, code) {
  if (!Number.isSafeInteger(value) || value < 1) invalid(code);
  return value;
}

export function schemaRevision(value, domainKey, code) {
  exactObject(value, ['schemaVersion', 'revision', domainKey], code);
  if (value.schemaVersion !== 1) invalid(code);
  return positiveRevision(value.revision, code);
}

export function boundedText(value, {
  code,
  minimum = 1,
  maximum = 160,
  nullable = false,
} = {}) {
  if (nullable && value === null) return null;
  if (typeof value !== 'string' || CONTROL_CHARACTER.test(value)) invalid(code);
  const normalized = value.trim();
  if (normalized.length < minimum || normalized.length > maximum) invalid(code);
  return normalized;
}

export function safeId(value, code) {
  if (typeof value !== 'string' || !SAFE_ID.test(value)) invalid(code);
  return value;
}

export function internalUuid(value, code) {
  if (typeof value !== 'string' || !INTERNAL_UUID.test(value)) invalid(code);
  return value;
}

export function safeIdList(value, code, maximum = 500) {
  if (!Array.isArray(value) || value.length > maximum) invalid(code);
  const normalized = value.map((entry) => safeId(entry, code));
  if (new Set(normalized).size !== normalized.length) invalid(code);
  return Object.freeze(normalized);
}

export function boundedStringList(value, code, {
  count = 50,
  length = 80,
} = {}) {
  if (!Array.isArray(value) || value.length > count) invalid(code);
  const normalized = value.map((entry) => boundedText(entry, { code, maximum: length }));
  if (new Set(normalized).size !== normalized.length) invalid(code);
  return Object.freeze(normalized);
}

export function booleanValue(value, code) {
  if (typeof value !== 'boolean') invalid(code);
  return value;
}

export function boundedInteger(value, code, { minimum = 0, maximum = Number.MAX_SAFE_INTEGER } = {}) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) invalid(code);
  return value;
}

export function utcInstant(value, code) {
  if (typeof value !== 'string' || !ISO_UTC_INSTANT.test(value)) invalid(code);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) invalid(code);
  return value;
}

export function immutable(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(immutable));
  if (value && typeof value === 'object') {
    return Object.freeze(Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, immutable(entry)]),
    ));
  }
  return value;
}

export function adapterError(ErrorType, error, fallbackCode) {
  if (error instanceof ErrorType) return error;
  return new ErrorType(error?.code || fallbackCode, {
    cause: error,
    serverCode: error?.serverCode,
    currentRevision: error?.currentRevision,
  });
}

export function historyPage(value, domainKey, normalizeDomain, code) {
  exactObject(value, ['schemaVersion', 'revisions', 'nextBeforeRevision'], code);
  if (value.schemaVersion !== 1 || !Array.isArray(value.revisions) || value.revisions.length > 100) invalid(code);
  const revisions = value.revisions.map((entry) => {
    exactObject(entry, ['revision', 'effectiveAt', domainKey], code);
    return Object.freeze({
      revision: positiveRevision(entry.revision, code),
      effectiveAt: utcInstant(entry.effectiveAt, code),
      [domainKey]: normalizeDomain(entry[domainKey]),
    });
  });
  if (new Set(revisions.map((entry) => entry.revision)).size !== revisions.length) invalid(code);
  const nextBeforeRevision = value.nextBeforeRevision === null
    ? null
    : positiveRevision(value.nextBeforeRevision, code);
  return Object.freeze({
    schemaVersion: 1,
    revisions: Object.freeze(revisions),
    nextBeforeRevision,
  });
}
