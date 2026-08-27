import { isProductionTimeZone } from '../core/production-time.js';

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
const CURSOR = /^[A-Za-z0-9_-]{1,2048}$/;
const UTC_INSTANT = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/;
const UNSAFE_DRAFT_TEXT = /[<>\u0000-\u001f\u007f\u202a-\u202e\u2066-\u2069]/;
const CONTROL_CHARACTER = /[\u0000-\u001f\u007f]/;
const COST_CENTER_CODE = /^[A-Z0-9][A-Z0-9._-]{0,63}$/;
const MAX_SAFE_VERSION = Number.MAX_SAFE_INTEGER - 1;
const MAX_PARTICIPANTS = 500;
const MAX_TOTAL_MINOR = Number.MAX_SAFE_INTEGER;

export const PRODUCTION_CATALOG_SECTIONS = Object.freeze([
  'sites',
  'rooms',
  'services',
  'cateringPackages',
  'cateringItems',
  'costCenters',
]);

export const PRODUCTION_CURRENCIES = Object.freeze(['CHF', 'EUR', 'GBP', 'USD']);

const CURRENCIES = new Set(PRODUCTION_CURRENCIES);
const REQUEST_STATUSES = new Set([
  'Submitted',
  'In Review',
  'Confirmed',
  'Rejected',
  'Change Requested',
  'Cancelled',
]);
const REASON_STATUSES = new Set(['Rejected', 'Change Requested']);
const BOOKING_CHANGE_STATUSES = new Set([
  'pending',
  'applying',
  'applied',
  'rejected',
  'superseded',
]);
const HISTORY_OPERATIONS = new Set([
  'migrated_legacy',
  'created',
  'resubmitted',
  'transitioned',
  'booking_changed',
]);
const REVISION_KEYS = Object.freeze([
  'organization',
  'locations',
  'catalogue',
  'bookingPolicies',
  'costAllocation',
]);

export class ProductionRequestWireError extends Error {
  constructor(code = 'PRODUCTION_REQUEST_WIRE_INVALID') {
    super(code);
    this.name = 'ProductionRequestWireError';
    this.code = code;
  }
}

function invalid(code = 'PRODUCTION_REQUEST_WIRE_INVALID') {
  throw new ProductionRequestWireError(code);
}

function exactObject(value, keys, code) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) invalid(code);
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  if (
    actual.length !== expected.length
    || actual.some((key, index) => key !== expected[index])
  ) invalid(code);
  return value;
}

function immutable(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(immutable));
  if (value && typeof value === 'object') {
    return Object.freeze(Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, immutable(entry)]),
    ));
  }
  return value;
}

function safeInteger(value, minimum, maximum, code) {
  if (!Number.isSafeInteger(value) || value < minimum || value > maximum) invalid(code);
  return value;
}

function positiveVersion(value, code) {
  return safeInteger(value, 1, MAX_SAFE_VERSION, code);
}

function identifier(value, code) {
  if (typeof value !== 'string' || !SAFE_ID.test(value)) invalid(code);
  return value;
}

function canonicalUtc(value, code) {
  if (typeof value !== 'string' || !UTC_INSTANT.test(value)) invalid(code);
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString() !== value) invalid(code);
  return value;
}

function responseText(value, { maximum, nullable = false, code }) {
  if (nullable && value === null) return null;
  if (typeof value !== 'string') invalid(code);
  const normalized = value.trim().normalize('NFC');
  if (
    normalized.length < 1
    || normalized.length > maximum
    || normalized !== value
    || CONTROL_CHARACTER.test(normalized)
  ) invalid(code);
  return normalized;
}

function draftText(value, { maximum, nullable = false, code }) {
  if (nullable && value === null) return null;
  if (typeof value !== 'string' || UNSAFE_DRAFT_TEXT.test(value)) invalid(code);
  const normalized = value.trim().normalize('NFC');
  if (nullable && normalized.length === 0) return null;
  if (normalized.length < 1 || normalized.length > maximum) invalid(code);
  return normalized;
}

function uniqueIdentifiers(value, maximum, code, { sorted = false } = {}) {
  if (!Array.isArray(value) || value.length > maximum) invalid(code);
  const result = value.map((entry) => identifier(entry, code));
  if (new Set(result).size !== result.length) invalid(code);
  if (sorted && result.some((entry, index) => index > 0 && result[index - 1] >= entry)) {
    invalid(code);
  }
  return Object.freeze(result);
}

function supportedCurrency(value, code) {
  if (!CURRENCIES.has(value)) invalid(code);
  return value;
}

function money(value, code) {
  const input = exactObject(value, ['amountMinor', 'currency'], code);
  return Object.freeze({
    amountMinor: safeInteger(input.amountMinor, 0, MAX_TOTAL_MINOR, code),
    currency: supportedCurrency(input.currency, code),
  });
}

function safeSum(values, code) {
  const result = values.reduce((sum, value) => sum + BigInt(value), 0n);
  if (result > BigInt(MAX_TOTAL_MINOR)) invalid(code);
  return Number(result);
}

function lineTotal(amountMinor, multiplier, code) {
  const result = BigInt(amountMinor) * BigInt(multiplier);
  if (result > BigInt(MAX_TOTAL_MINOR)) invalid(code);
  return Number(result);
}

function configurationRevisions(value, code) {
  const input = exactObject(value, REVISION_KEYS, code);
  return Object.freeze(Object.fromEntries(
    REVISION_KEYS.map((key) => [key, positiveVersion(input[key], code)]),
  ));
}

function sameRevisions(left, right) {
  return REVISION_KEYS.every((key) => left[key] === right[key]);
}

function sameIdentifiers(left, right) {
  return left.length === right.length && left.every((entry, index) => entry === right[index]);
}

function page(value, maximumLimit, code) {
  const input = exactObject(value, ['limit', 'complete', 'nextCursor'], code);
  const limit = safeInteger(input.limit, 1, maximumLimit, code);
  if (typeof input.complete !== 'boolean') invalid(code);
  const nextCursor = input.nextCursor === null
    ? null
    : (() => {
      if (typeof input.nextCursor !== 'string' || !CURSOR.test(input.nextCursor)) invalid(code);
      return input.nextCursor;
    })();
  if (input.complete !== (nextCursor === null)) invalid(code);
  return Object.freeze({ limit, complete: input.complete, nextCursor });
}

function policyRules(value, code) {
  const rules = exactObject(value, [
    'minimumLeadTimeMinutes',
    'maximumAdvanceMinutes',
    'cancellationWindowMinutes',
    'changeWindowMinutes',
    'maximumParticipants',
    'allowedSiteIds',
    'allowedRoomIds',
    'allowedServiceIds',
  ], code);
  const minimumLeadTimeMinutes = safeInteger(rules.minimumLeadTimeMinutes, 0, 43_200, code);
  const maximumAdvanceMinutes = safeInteger(rules.maximumAdvanceMinutes, 1, 1_054_080, code);
  const cancellationWindowMinutes = safeInteger(rules.cancellationWindowMinutes, 0, 43_200, code);
  const changeWindowMinutes = safeInteger(rules.changeWindowMinutes, 0, 43_200, code);
  if (
    minimumLeadTimeMinutes > maximumAdvanceMinutes
    || cancellationWindowMinutes > maximumAdvanceMinutes
    || changeWindowMinutes > maximumAdvanceMinutes
  ) invalid(code);
  return Object.freeze({
    minimumLeadTimeMinutes,
    maximumAdvanceMinutes,
    cancellationWindowMinutes,
    changeWindowMinutes,
    maximumParticipants: safeInteger(rules.maximumParticipants, 1, 100_000, code),
    allowedSiteIds: uniqueIdentifiers(rules.allowedSiteIds, 500, code, { sorted: true }),
    allowedRoomIds: uniqueIdentifiers(rules.allowedRoomIds, 500, code, { sorted: true }),
    allowedServiceIds: uniqueIdentifiers(rules.allowedServiceIds, 500, code, { sorted: true }),
  });
}

function bookingPolicy(value, code) {
  const input = exactObject(value, [
    'policyVersionId',
    'effectiveFrom',
    'evaluatedAt',
    'rules',
  ], code);
  const effectiveFrom = canonicalUtc(input.effectiveFrom, code);
  const evaluatedAt = canonicalUtc(input.evaluatedAt, code);
  if (evaluatedAt < effectiveFrom) invalid(code);
  return Object.freeze({
    policyVersionId: identifier(input.policyVersionId, code),
    effectiveFrom,
    evaluatedAt,
    rules: policyRules(input.rules, code),
  });
}

function catalogSite(value, code) {
  const site = exactObject(value, ['id', 'name', 'active', 'timeZone'], code);
  if (site.active !== true || (site.timeZone !== null && !isProductionTimeZone(site.timeZone))) {
    invalid(code);
  }
  return Object.freeze({
    id: identifier(site.id, code),
    name: responseText(site.name, { maximum: 160, code }),
    active: true,
    timeZone: site.timeZone,
  });
}

function catalogRoom(value, code) {
  const room = exactObject(value, ['id', 'siteId', 'name', 'capacity', 'active', 'price'], code);
  if (room.active !== true || room.price === null) invalid(code);
  return Object.freeze({
    id: identifier(room.id, code),
    siteId: identifier(room.siteId, code),
    name: responseText(room.name, { maximum: 160, code }),
    capacity: safeInteger(room.capacity, 1, 100_000, code),
    active: true,
    price: money(room.price, code),
  });
}

function catalogApplicability(value, code, { packageEntry = false } = {}) {
  const keys = [
    'id', 'name', 'description', 'active', 'order', 'price', 'siteIds', 'roomIds',
    ...(packageEntry ? ['itemIds', 'variants'] : []),
  ];
  const input = exactObject(value, keys, code);
  if (input.active !== true) invalid(code);
  const result = {
    id: identifier(input.id, code),
    name: responseText(input.name, { maximum: 160, code }),
    description: responseText(input.description, { maximum: 1_000, nullable: true, code }),
    active: true,
    order: safeInteger(input.order, 0, 100_000, code),
    price: money(input.price, code),
    siteIds: uniqueIdentifiers(input.siteIds, 200, code, { sorted: true }),
    roomIds: uniqueIdentifiers(input.roomIds, 200, code, { sorted: true }),
  };
  if (packageEntry) {
    result.itemIds = uniqueIdentifiers(input.itemIds, 300, code, { sorted: true });
    if (!Array.isArray(input.variants) || input.variants.length < 1 || input.variants.length > 20) {
      invalid(code);
    }
    result.variants = Object.freeze(input.variants.map((variant) => {
      const normalized = exactObject(variant, [
        'id', 'name', 'description', 'active', 'order', 'price',
      ], code);
      if (normalized.active !== true) invalid(code);
      return Object.freeze({
        id: identifier(normalized.id, code),
        name: responseText(normalized.name, { maximum: 160, code }),
        description: responseText(normalized.description, {
          maximum: 1_000, nullable: true, code,
        }),
        active: true,
        order: safeInteger(normalized.order, 0, 100_000, code),
        price: money(normalized.price, code),
      });
    }));
    if (new Set(result.variants.map((entry) => entry.id)).size !== result.variants.length) invalid(code);
  }
  return Object.freeze(result);
}

function catalogCostCenter(value, code) {
  const center = exactObject(value, ['id', 'code', 'name', 'group'], code);
  if (typeof center.code !== 'string' || !COST_CENTER_CODE.test(center.code)) invalid(code);
  return Object.freeze({
    id: identifier(center.id, code),
    code: center.code,
    name: responseText(center.name, { maximum: 160, code }),
    group: responseText(center.group, { maximum: 160, nullable: true, code }),
  });
}

function catalogEntry(section, value, code) {
  if (section === 'sites') return catalogSite(value, code);
  if (section === 'rooms') return catalogRoom(value, code);
  if (section === 'services' || section === 'cateringItems') {
    return catalogApplicability(value, code);
  }
  if (section === 'cateringPackages') {
    return catalogApplicability(value, code, { packageEntry: true });
  }
  return catalogCostCenter(value, code);
}

export function normalizeProductionCatalogPage(value) {
  const code = 'PRODUCTION_CATALOG_PAGE_INVALID';
  const input = exactObject(value, [
    'schemaVersion',
    'configurationRevisions',
    'bookingPolicy',
    'organization',
    'costAllocation',
    'context',
    'section',
    'entries',
    'page',
  ], code);
  if (input.schemaVersion !== 2 || !PRODUCTION_CATALOG_SECTIONS.includes(input.section)) invalid(code);
  if (typeof input.context !== 'string' || !CURSOR.test(input.context)) invalid(code);
  const publicPage = page(input.page, 10, code);
  if (!Array.isArray(input.entries) || input.entries.length > publicPage.limit) invalid(code);
  const entries = Object.freeze(input.entries.map((entry) => catalogEntry(input.section, entry, code)));
  if (
    new Set(entries.map((entry) => entry.id)).size !== entries.length
    || entries.some((entry, index) => index > 0 && entries[index - 1].id >= entry.id)
  ) invalid(code);
  const organization = exactObject(input.organization, ['defaultCurrency'], code);
  const costAllocation = exactObject(input.costAllocation, ['allocationRequired'], code);
  if (typeof costAllocation.allocationRequired !== 'boolean') invalid(code);
  return Object.freeze({
    schemaVersion: 2,
    configurationRevisions: configurationRevisions(input.configurationRevisions, code),
    bookingPolicy: bookingPolicy(input.bookingPolicy, code),
    organization: Object.freeze({
      defaultCurrency: supportedCurrency(organization.defaultCurrency, code),
    }),
    costAllocation: Object.freeze({ allocationRequired: costAllocation.allocationRequired }),
    context: input.context,
    section: input.section,
    entries,
    page: publicPage,
  });
}

function sameJson(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

export function normalizeProductionCatalog(value) {
  const code = 'PRODUCTION_CATALOG_INVALID';
  const input = exactObject(value, [
    'configurationRevisions',
    'bookingPolicy',
    'organization',
    'costAllocation',
    ...PRODUCTION_CATALOG_SECTIONS,
  ], code);
  const revisions = configurationRevisions(input.configurationRevisions, code);
  const policy = bookingPolicy(input.bookingPolicy, code);
  const organization = exactObject(input.organization, ['defaultCurrency'], code);
  const allocation = exactObject(input.costAllocation, ['allocationRequired'], code);
  if (typeof allocation.allocationRequired !== 'boolean') invalid(code);
  const sites = normalizeAssembledEntries(input.sites, 200, catalogSite, code);
  const rooms = normalizeAssembledEntries(input.rooms, 2_000, catalogRoom, code);
  const services = normalizeAssembledEntries(
    input.services, 200, (entry) => catalogApplicability(entry, code), code,
  );
  const cateringPackages = normalizeAssembledEntries(
    input.cateringPackages, 100, (entry) => catalogApplicability(entry, code, { packageEntry: true }), code,
  );
  const cateringItems = normalizeAssembledEntries(
    input.cateringItems, 300, (entry) => catalogApplicability(entry, code), code,
  );
  const costCenters = normalizeAssembledEntries(input.costCenters, 1_000, catalogCostCenter, code);
  const siteIds = new Set(sites.map((entry) => entry.id));
  const roomIds = new Set(rooms.map((entry) => entry.id));
  const itemIds = new Set(cateringItems.map((entry) => entry.id));
  if (rooms.some((entry) => !siteIds.has(entry.siteId))) invalid(code);
  for (const entry of [...services, ...cateringPackages, ...cateringItems]) {
    if (
      entry.siteIds.some((id) => !siteIds.has(id))
      || entry.roomIds.some((id) => !roomIds.has(id))
    ) invalid(code);
  }
  if (cateringPackages.some((entry) => entry.itemIds.some((id) => !itemIds.has(id)))) invalid(code);
  if (
    policy.rules.allowedSiteIds.some((id) => !siteIds.has(id))
    || policy.rules.allowedRoomIds.some((id) => !roomIds.has(id))
    || policy.rules.allowedServiceIds.some((id) => !services.some((entry) => entry.id === id))
  ) invalid(code);
  return immutable({
    configurationRevisions: revisions,
    bookingPolicy: policy,
    organization: { defaultCurrency: supportedCurrency(organization.defaultCurrency, code) },
    costAllocation: { allocationRequired: allocation.allocationRequired },
    sites,
    rooms,
    services,
    cateringPackages,
    cateringItems,
    costCenters,
  });
}

function normalizeAssembledEntries(value, maximum, normalize, code) {
  if (!Array.isArray(value) || value.length > maximum) invalid(code);
  const entries = Object.freeze(value.map((entry) => normalize(entry, code)));
  if (
    new Set(entries.map((entry) => entry.id)).size !== entries.length
    || entries.some((entry, index) => index > 0 && entries[index - 1].id >= entry.id)
  ) invalid(code);
  return entries;
}

function snapshotEntry(value, code) {
  const input = exactObject(value, ['id', 'name', 'description', 'price'], code);
  return Object.freeze({
    id: identifier(input.id, code),
    name: responseText(input.name, { maximum: 160, code }),
    description: responseText(input.description, { maximum: 1_000, nullable: true, code }),
    price: money(input.price, code),
  });
}

function requestDetails(value, code) {
  const details = exactObject(value, [
    'title', 'specialRequirements', 'dietaryRequirements', 'serviceIds', 'catering',
  ], code);
  const catering = exactObject(details.catering, [
    'participantCount', 'packageSelection', 'itemQuantities',
  ], code);
  let packageSelection = null;
  if (catering.packageSelection !== null) {
    const selected = exactObject(catering.packageSelection, ['packageId', 'variantId'], code);
    packageSelection = Object.freeze({
      packageId: identifier(selected.packageId, code),
      variantId: identifier(selected.variantId, code),
    });
  }
  if (!Array.isArray(catering.itemQuantities) || catering.itemQuantities.length > 100) invalid(code);
  const itemQuantities = Object.freeze(catering.itemQuantities.map((entry) => {
    const item = exactObject(entry, ['itemId', 'quantity'], code);
    return Object.freeze({
      itemId: identifier(item.itemId, code),
      quantity: safeInteger(item.quantity, 1, 1_000, code),
    });
  }));
  if (
    new Set(itemQuantities.map((entry) => entry.itemId)).size !== itemQuantities.length
    || itemQuantities.some((entry, index) => index > 0 && itemQuantities[index - 1].itemId >= entry.itemId)
  ) invalid(code);
  return Object.freeze({
    title: draftText(details.title, { maximum: 160, code }),
    specialRequirements: draftText(details.specialRequirements, { maximum: 2_000, nullable: true, code }),
    dietaryRequirements: draftText(details.dietaryRequirements, { maximum: 2_000, nullable: true, code }),
    serviceIds: uniqueIdentifiers(details.serviceIds, 200, code, { sorted: true }),
    catering: Object.freeze({
      participantCount: safeInteger(catering.participantCount, 0, MAX_PARTICIPANTS, code),
      packageSelection,
      itemQuantities,
    }),
  });
}

function pricingRoom(value, code) {
  const room = exactObject(value, ['id', 'siteId', 'name', 'price'], code);
  return Object.freeze({
    id: identifier(room.id, code),
    siteId: identifier(room.siteId, code),
    name: responseText(room.name, { maximum: 160, code }),
    price: money(room.price, code),
  });
}

function requestPricing(value, code) {
  const pricing = exactObject(value, [
    'currency', 'totalMinor', 'breakdown', 'room', 'services', 'catering',
  ], code);
  const currency = supportedCurrency(pricing.currency, code);
  const totalMinor = safeInteger(pricing.totalMinor, 0, MAX_TOTAL_MINOR, code);
  const breakdownValue = exactObject(pricing.breakdown, [
    'roomMinor', 'servicesMinor', 'cateringPackageMinor', 'cateringItemsMinor',
  ], code);
  const breakdown = Object.freeze(Object.fromEntries(Object.entries(breakdownValue).map(
    ([key, amount]) => [key, safeInteger(amount, 0, MAX_TOTAL_MINOR, code)],
  )));
  const room = pricingRoom(pricing.room, code);
  if (!Array.isArray(pricing.services) || pricing.services.length > 200) invalid(code);
  const services = Object.freeze(pricing.services.map((value) => {
    const line = exactObject(value, ['service', 'lineTotalMinor'], code);
    const service = snapshotEntry(line.service, code);
    const lineTotalMinor = safeInteger(line.lineTotalMinor, 0, MAX_TOTAL_MINOR, code);
    if (lineTotalMinor !== service.price.amountMinor) invalid(code);
    return Object.freeze({ service, lineTotalMinor });
  }));
  if (
    new Set(services.map((entry) => entry.service.id)).size !== services.length
    || services.some((entry, index) => index > 0 && services[index - 1].service.id >= entry.service.id)
  ) invalid(code);
  const cateringValue = exactObject(pricing.catering, [
    'participantCount', 'packageSelection', 'items',
  ], code);
  const participantCount = safeInteger(cateringValue.participantCount, 0, MAX_PARTICIPANTS, code);
  let packageSelection = null;
  if (cateringValue.packageSelection !== null) {
    const selected = exactObject(cateringValue.packageSelection, [
      'package', 'variant', 'includedItems', 'participantCount', 'lineTotalMinor',
    ], code);
    const packageEntry = snapshotEntry(selected.package, code);
    const variant = snapshotEntry(selected.variant, code);
    if (!Array.isArray(selected.includedItems) || selected.includedItems.length > 300) invalid(code);
    const includedItems = Object.freeze(selected.includedItems.map((entry) => snapshotEntry(entry, code)));
    if (new Set(includedItems.map((entry) => entry.id)).size !== includedItems.length) invalid(code);
    const selectedParticipantCount = safeInteger(selected.participantCount, 1, MAX_PARTICIPANTS, code);
    const selectedLineTotal = safeInteger(selected.lineTotalMinor, 0, MAX_TOTAL_MINOR, code);
    if (
      selectedParticipantCount !== participantCount
      || selectedLineTotal !== lineTotal(variant.price.amountMinor, participantCount, code)
    ) invalid(code);
    packageSelection = Object.freeze({
      package: packageEntry,
      variant,
      includedItems,
      participantCount,
      lineTotalMinor: selectedLineTotal,
    });
  }
  if (!Array.isArray(cateringValue.items) || cateringValue.items.length > 100) invalid(code);
  const includedById = new Map(
    (packageSelection?.includedItems ?? []).map((entry) => [entry.id, entry]),
  );
  const items = Object.freeze(cateringValue.items.map((value) => {
    const line = exactObject(value, ['item', 'quantity', 'includedByPackage', 'lineTotalMinor'], code);
    const item = snapshotEntry(line.item, code);
    const quantity = safeInteger(line.quantity, 1, 1_000, code);
    if (typeof line.includedByPackage !== 'boolean') invalid(code);
    const included = includedById.get(item.id);
    if (line.includedByPackage !== Boolean(included) || (included && !sameJson(included, item))) invalid(code);
    const lineTotalMinor = safeInteger(line.lineTotalMinor, 0, MAX_TOTAL_MINOR, code);
    if (lineTotalMinor !== (line.includedByPackage ? 0 : lineTotal(item.price.amountMinor, quantity, code))) {
      invalid(code);
    }
    return Object.freeze({ item, quantity, includedByPackage: line.includedByPackage, lineTotalMinor });
  }));
  if (
    new Set(items.map((entry) => entry.item.id)).size !== items.length
    || items.some((entry, index) => index > 0 && items[index - 1].item.id >= entry.item.id)
  ) invalid(code);
  const servicesMinor = safeSum(services.map((entry) => entry.lineTotalMinor), code);
  const packageMinor = packageSelection?.lineTotalMinor ?? 0;
  const itemsMinor = safeSum(items.map((entry) => entry.lineTotalMinor), code);
  if (
    breakdown.roomMinor !== room.price.amountMinor
    || breakdown.servicesMinor !== servicesMinor
    || breakdown.cateringPackageMinor !== packageMinor
    || breakdown.cateringItemsMinor !== itemsMinor
    || totalMinor !== safeSum(Object.values(breakdown), code)
  ) invalid(code);
  const chargedCurrencies = new Set([
    room.price.currency,
    ...services.map((entry) => entry.service.price.currency),
    ...(packageSelection ? [packageSelection.variant.price.currency] : []),
    ...items.filter((entry) => !entry.includedByPackage).map((entry) => entry.item.price.currency),
  ]);
  if (chargedCurrencies.size !== 1 || (totalMinor > 0 && !chargedCurrencies.has(currency))) invalid(code);
  return immutable({
    currency,
    totalMinor,
    breakdown,
    room,
    services,
    catering: { participantCount, packageSelection, items },
  });
}

function allocationEntry(value, code) {
  const entry = exactObject(value, [
    'costCenterId', 'code', 'name', 'group', 'percentageBasisPoints', 'allocatedMinor',
  ], code);
  if (typeof entry.code !== 'string' || !COST_CENTER_CODE.test(entry.code)) invalid(code);
  return Object.freeze({
    costCenterId: identifier(entry.costCenterId, code),
    code: entry.code,
    name: responseText(entry.name, { maximum: 160, code }),
    group: responseText(entry.group, { maximum: 160, nullable: true, code }),
    percentageBasisPoints: safeInteger(entry.percentageBasisPoints, 1, 10_000, code),
    allocatedMinor: safeInteger(entry.allocatedMinor, 0, MAX_TOTAL_MINOR, code),
  });
}

function expectedAllocationValues(entries, totalMinor) {
  if (entries.length === 0) return [];
  const total = BigInt(totalMinor);
  const working = entries.map((entry, index) => {
    const product = total * BigInt(entry.percentageBasisPoints);
    return {
      index,
      costCenterId: entry.costCenterId,
      value: product / 10_000n,
      remainder: product % 10_000n,
    };
  });
  const allocated = working.reduce((sum, entry) => sum + entry.value, 0n);
  const remaining = Number(total - allocated);
  const order = [...working].sort((left, right) => (
    left.remainder === right.remainder
      ? left.costCenterId.localeCompare(right.costCenterId)
      : left.remainder > right.remainder ? -1 : 1
  ));
  for (let index = 0; index < remaining; index += 1) order[index].value += 1n;
  const result = Array(entries.length);
  working.forEach((entry) => { result[entry.index] = Number(entry.value); });
  return result;
}

function requestAllocations(value, code) {
  const input = exactObject(value, [
    'schemaVersion', 'configurationRevision', 'snapshottedAt', 'model',
    'totalBasisPoints', 'totalMinor', 'allocatedMinor', 'unallocatedMinor',
    'currency', 'entries',
  ], code);
  if (input.schemaVersion !== 1 || input.model !== 'percentage_basis_points') invalid(code);
  if (!Array.isArray(input.entries) || input.entries.length > 100) invalid(code);
  const entries = Object.freeze(input.entries.map((entry) => allocationEntry(entry, code)));
  if (
    new Set(entries.map((entry) => entry.costCenterId)).size !== entries.length
    || new Set(entries.map((entry) => entry.code)).size !== entries.length
  ) invalid(code);
  const totalBasisPoints = safeInteger(input.totalBasisPoints, 0, 10_000, code);
  const totalMinor = safeInteger(input.totalMinor, 0, MAX_TOTAL_MINOR, code);
  const allocatedMinor = safeInteger(input.allocatedMinor, 0, MAX_TOTAL_MINOR, code);
  const unallocatedMinor = safeInteger(input.unallocatedMinor, 0, MAX_TOTAL_MINOR, code);
  if (
    totalBasisPoints !== (entries.length === 0 ? 0 : 10_000)
    || totalBasisPoints !== entries.reduce((sum, entry) => sum + entry.percentageBasisPoints, 0)
    || allocatedMinor !== safeSum(entries.map((entry) => entry.allocatedMinor), code)
    || safeSum([allocatedMinor, unallocatedMinor], code) !== totalMinor
  ) invalid(code);
  const expected = expectedAllocationValues(entries, totalMinor);
  if (entries.some((entry, index) => entry.allocatedMinor !== expected[index])) invalid(code);
  return immutable({
    schemaVersion: 1,
    configurationRevision: positiveVersion(input.configurationRevision, code),
    snapshottedAt: canonicalUtc(input.snapshottedAt, code),
    model: input.model,
    totalBasisPoints,
    totalMinor,
    allocatedMinor,
    unallocatedMinor,
    currency: supportedCurrency(input.currency, code),
    entries,
  });
}

export function normalizeProductionPublicRequest(value) {
  const code = 'PRODUCTION_REQUEST_INVALID';
  const input = exactObject(value, [
    'schemaVersion', 'version', 'id', 'roomId', 'status', 'statusReason',
    'startsAt', 'endsAt', 'internalParticipants', 'externalParticipants',
    'statusChangedAt', 'createdAt', 'updatedAt', 'details', 'pricing',
    'configurationRevisions', 'policy', 'allocations',
  ], code);
  if (![1, 2].includes(input.schemaVersion) || !REQUEST_STATUSES.has(input.status)) invalid(code);
  const startsAt = canonicalUtc(input.startsAt, code);
  const endsAt = canonicalUtc(input.endsAt, code);
  if (endsAt <= startsAt) invalid(code);
  const statusReason = input.statusReason === null
    ? null
    : responseText(input.statusReason, { maximum: 1_000, code });
  if (REASON_STATUSES.has(input.status) !== (statusReason !== null)) invalid(code);
  const common = {
    schemaVersion: input.schemaVersion,
    version: positiveVersion(input.version, code),
    id: identifier(input.id, code),
    roomId: input.roomId === null ? null : identifier(input.roomId, code),
    status: input.status,
    statusReason,
    startsAt,
    endsAt,
    internalParticipants: safeInteger(input.internalParticipants, 0, MAX_TOTAL_MINOR, code),
    externalParticipants: safeInteger(input.externalParticipants, 0, MAX_TOTAL_MINOR, code),
    statusChangedAt: canonicalUtc(input.statusChangedAt, code),
    createdAt: canonicalUtc(input.createdAt, code),
    updatedAt: canonicalUtc(input.updatedAt, code),
  };
  if (common.updatedAt < common.createdAt) invalid(code);
  if (input.schemaVersion === 1) {
    if (
      input.details !== null
      || input.pricing !== null
      || input.configurationRevisions !== null
      || input.policy !== null
      || input.allocations !== null
    ) invalid(code);
    return immutable({
      ...common,
      details: null,
      pricing: null,
      configurationRevisions: null,
      policy: null,
      allocations: null,
    });
  }
  const participants = common.internalParticipants + common.externalParticipants;
  if (
    common.roomId === null
    || participants < 1
    || participants > MAX_PARTICIPANTS
    || Date.parse(endsAt) - Date.parse(startsAt) > 86_400_000
  ) invalid(code);
  const details = requestDetails(input.details, code);
  const pricing = requestPricing(input.pricing, code);
  const revisions = configurationRevisions(input.configurationRevisions, code);
  const policy = bookingPolicy(input.policy, code);
  const allocations = requestAllocations(input.allocations, code);
  if (
    pricing.room.id !== common.roomId
    || details.catering.participantCount > participants
    || participants > policy.rules.maximumParticipants
    || (policy.rules.allowedSiteIds.length && !policy.rules.allowedSiteIds.includes(pricing.room.siteId))
    || (policy.rules.allowedRoomIds.length && !policy.rules.allowedRoomIds.includes(common.roomId))
    || details.serviceIds.some((id) => (
      policy.rules.allowedServiceIds.length && !policy.rules.allowedServiceIds.includes(id)
    ))
    || !sameIdentifiers(details.serviceIds, pricing.services.map((entry) => entry.service.id))
    || !sameIdentifiers(
      details.catering.itemQuantities.map((entry) => entry.itemId),
      pricing.catering.items.map((entry) => entry.item.id),
    )
    || details.catering.itemQuantities.some((entry, index) => (
      entry.quantity !== pricing.catering.items[index].quantity
    ))
    || details.catering.participantCount !== pricing.catering.participantCount
    || !samePackageSelection(details.catering.packageSelection, pricing.catering.packageSelection)
    || allocations.totalMinor !== pricing.totalMinor
    || allocations.currency !== pricing.currency
    || allocations.configurationRevision !== revisions.costAllocation
    || allocations.snapshottedAt !== policy.evaluatedAt
  ) invalid(code);
  return immutable({
    ...common,
    details,
    pricing,
    configurationRevisions: revisions,
    policy,
    allocations,
  });
}

function samePackageSelection(details, pricing) {
  if (details === null || pricing === null) return details === null && pricing === null;
  return details.packageId === pricing.package.id && details.variantId === pricing.variant.id;
}

function orderedRequests(value, maximum, code) {
  if (!Array.isArray(value) || value.length > maximum) invalid(code);
  const requests = Object.freeze(value.map(normalizeProductionPublicRequest));
  if (
    new Set(requests.map((entry) => entry.id)).size !== requests.length
    || requests.some((entry, index) => index > 0 && (
      requests[index - 1].startsAt > entry.startsAt
      || (requests[index - 1].startsAt === entry.startsAt && requests[index - 1].id >= entry.id)
    ))
  ) invalid(code);
  return requests;
}

export function normalizeProductionRequestListPage(value) {
  const code = 'PRODUCTION_REQUEST_LIST_INVALID';
  const input = exactObject(value, ['schemaVersion', 'asOf', 'requests', 'page'], code);
  if (input.schemaVersion !== 2) invalid(code);
  const publicPage = page(input.page, 10, code);
  const asOf = canonicalUtc(input.asOf, code);
  const requests = orderedRequests(input.requests, publicPage.limit, code);
  if (requests.some((entry) => entry.updatedAt > asOf)) invalid(code);
  return Object.freeze({ schemaVersion: 2, asOf, requests, page: publicPage });
}

export function normalizeProductionRequestReportPage(value) {
  const code = 'PRODUCTION_REQUEST_REPORT_INVALID';
  const input = exactObject(value, ['schemaVersion', 'asOf', 'range', 'requests', 'page'], code);
  if (input.schemaVersion !== 2) invalid(code);
  const rangeValue = exactObject(input.range, [
    'field', 'fromInclusive', 'toExclusive', 'timeZone',
  ], code);
  if (rangeValue.field !== 'startsAt' || rangeValue.timeZone !== 'UTC') invalid(code);
  const fromInclusive = canonicalUtc(rangeValue.fromInclusive, code);
  const toExclusive = canonicalUtc(rangeValue.toExclusive, code);
  const duration = Date.parse(toExclusive) - Date.parse(fromInclusive);
  if (duration <= 0 || duration > 366 * 86_400_000) invalid(code);
  const publicPage = page(input.page, 10, code);
  const requests = orderedRequests(input.requests, publicPage.limit, code);
  if (requests.some((entry) => entry.startsAt < fromInclusive || entry.startsAt >= toExclusive)) {
    invalid(code);
  }
  return immutable({
    schemaVersion: 2,
    asOf: canonicalUtc(input.asOf, code),
    range: { field: 'startsAt', fromInclusive, toExclusive, timeZone: 'UTC' },
    requests,
    page: publicPage,
  });
}

function draftAllocation(value, code) {
  const input = exactObject(value, ['costCenterId', 'percentageBasisPoints'], code);
  return Object.freeze({
    costCenterId: identifier(input.costCenterId, code),
    percentageBasisPoints: safeInteger(input.percentageBasisPoints, 1, 10_000, code),
  });
}

export function normalizeProductionRequestDraft(value) {
  const code = 'PRODUCTION_REQUEST_DRAFT_INVALID';
  const input = exactObject(value, [
    'title', 'roomId', 'startsAt', 'endsAt', 'internalParticipants',
    'externalParticipants', 'serviceIds', 'catering', 'dietaryRequirements',
    'specialRequirements', 'allocations', 'configurationRevisions',
  ], code);
  const startsAt = canonicalUtc(input.startsAt, code);
  const endsAt = canonicalUtc(input.endsAt, code);
  if (endsAt <= startsAt || Date.parse(endsAt) - Date.parse(startsAt) > 86_400_000) invalid(code);
  const internalParticipants = safeInteger(input.internalParticipants, 0, MAX_PARTICIPANTS, code);
  const externalParticipants = safeInteger(input.externalParticipants, 0, MAX_PARTICIPANTS, code);
  const totalParticipants = internalParticipants + externalParticipants;
  if (totalParticipants < 1 || totalParticipants > MAX_PARTICIPANTS) invalid(code);
  const catering = exactObject(input.catering, [
    'participantCount', 'packageSelection', 'itemQuantities',
  ], code);
  let packageSelection = null;
  if (catering.packageSelection !== null) {
    const selected = exactObject(catering.packageSelection, ['packageId', 'variantId'], code);
    packageSelection = Object.freeze({
      packageId: identifier(selected.packageId, code),
      variantId: identifier(selected.variantId, code),
    });
  }
  const participantCount = safeInteger(catering.participantCount, 0, MAX_PARTICIPANTS, code);
  if (participantCount > totalParticipants || (packageSelection && participantCount < 1)) invalid(code);
  if (!Array.isArray(catering.itemQuantities) || catering.itemQuantities.length > 100) invalid(code);
  const itemQuantities = catering.itemQuantities.map((entry) => {
    const item = exactObject(entry, ['itemId', 'quantity'], code);
    return Object.freeze({
      itemId: identifier(item.itemId, code),
      quantity: safeInteger(item.quantity, 1, 1_000, code),
    });
  }).sort((left, right) => left.itemId.localeCompare(right.itemId));
  if (new Set(itemQuantities.map((entry) => entry.itemId)).size !== itemQuantities.length) invalid(code);
  if (!Array.isArray(input.allocations) || input.allocations.length > 100) invalid(code);
  const allocations = input.allocations.map((entry) => draftAllocation(entry, code))
    .sort((left, right) => left.costCenterId.localeCompare(right.costCenterId));
  if (new Set(allocations.map((entry) => entry.costCenterId)).size !== allocations.length) invalid(code);
  if (allocations.length && allocations.reduce((sum, entry) => sum + entry.percentageBasisPoints, 0) !== 10_000) {
    invalid(code);
  }
  return immutable({
    title: draftText(input.title, { maximum: 160, code }),
    roomId: identifier(input.roomId, code),
    startsAt,
    endsAt,
    internalParticipants,
    externalParticipants,
    serviceIds: [...uniqueIdentifiers(input.serviceIds, 200, code)].sort(),
    catering: { participantCount, packageSelection, itemQuantities },
    dietaryRequirements: draftText(input.dietaryRequirements, { maximum: 2_000, nullable: true, code }),
    specialRequirements: draftText(input.specialRequirements, { maximum: 2_000, nullable: true, code }),
    allocations,
    configurationRevisions: configurationRevisions(input.configurationRevisions, code),
  });
}

function requestRef(value, code) {
  const input = exactObject(value, ['id', 'schemaVersion', 'version', 'status'], code);
  if (![1, 2].includes(input.schemaVersion) || !REQUEST_STATUSES.has(input.status)) invalid(code);
  return Object.freeze({
    id: identifier(input.id, code),
    schemaVersion: input.schemaVersion,
    version: positiveVersion(input.version, code),
    status: input.status,
  });
}

function bookingChange(value, ref, code) {
  if (value === null) return null;
  const input = exactObject(value, [
    'id', 'status', 'roomId', 'startsAt', 'endsAt', 'internalParticipants',
    'externalParticipants', 'rejectionReason', 'createdAt', 'updatedAt',
    'requestSchemaVersion', 'baseRequestVersion', 'request', 'proposedRequest',
  ], code);
  if (!BOOKING_CHANGE_STATUSES.has(input.status) || ![1, 2].includes(input.requestSchemaVersion)) invalid(code);
  const rejectionReason = input.rejectionReason === null
    ? null
    : responseText(input.rejectionReason, { maximum: 1_000, code });
  if ((input.status === 'rejected') !== (rejectionReason !== null)) invalid(code);
  const baseRequestVersion = positiveVersion(input.baseRequestVersion, code);
  const startsAt = canonicalUtc(input.startsAt, code);
  const endsAt = canonicalUtc(input.endsAt, code);
  if (endsAt <= startsAt) invalid(code);
  const result = {
    id: identifier(input.id, code),
    status: input.status,
    roomId: identifier(input.roomId, code),
    startsAt,
    endsAt,
    internalParticipants: safeInteger(input.internalParticipants, 0, MAX_TOTAL_MINOR, code),
    externalParticipants: safeInteger(input.externalParticipants, 0, MAX_TOTAL_MINOR, code),
    rejectionReason,
    createdAt: canonicalUtc(input.createdAt, code),
    updatedAt: canonicalUtc(input.updatedAt, code),
    requestSchemaVersion: input.requestSchemaVersion,
    baseRequestVersion,
    request: null,
    proposedRequest: null,
  };
  if (input.requestSchemaVersion === 1) {
    if (input.request !== null || input.proposedRequest !== null) invalid(code);
  } else {
    result.request = normalizeProductionRequestDraft(input.request);
    result.proposedRequest = normalizeProductionPublicRequest(input.proposedRequest);
    if (
      result.proposedRequest.schemaVersion !== 2
      || result.proposedRequest.id !== ref.id
      || result.proposedRequest.version !== baseRequestVersion + 1
      || result.proposedRequest.status !== 'Confirmed'
      || result.roomId !== result.request.roomId
      || result.startsAt !== result.request.startsAt
      || result.endsAt !== result.request.endsAt
      || result.internalParticipants !== result.request.internalParticipants
      || result.externalParticipants !== result.request.externalParticipants
      || result.roomId !== result.proposedRequest.roomId
      || result.startsAt !== result.proposedRequest.startsAt
      || result.endsAt !== result.proposedRequest.endsAt
      || result.internalParticipants !== result.proposedRequest.internalParticipants
      || result.externalParticipants !== result.proposedRequest.externalParticipants
    ) invalid(code);
  }
  const applied = result.status === 'applied';
  if (
    ref.status !== 'Confirmed'
    || ref.version !== (applied ? baseRequestVersion + 1 : baseRequestVersion)
    || (applied && result.proposedRequest === null)
  ) invalid(code);
  return immutable(result);
}

export function normalizeProductionBookingChangeEnvelope(value) {
  const code = 'PRODUCTION_BOOKING_CHANGE_INVALID';
  const envelope = exactObject(value, ['schemaVersion', 'result'], code);
  if (envelope.schemaVersion !== 2) invalid(code);
  if (!envelope.result || typeof envelope.result !== 'object' || Array.isArray(envelope.result)) invalid(code);
  const blocked = envelope.result.status === 'blocked';
  const result = exactObject(
    envelope.result,
    blocked ? ['status', 'alternatives', 'change', 'requestRef'] : ['change', 'requestRef'],
    code,
  );
  const ref = requestRef(result.requestRef, code);
  const normalized = { change: bookingChange(result.change, ref, code), requestRef: ref };
  if (blocked) {
    normalized.status = 'blocked';
    normalized.alternatives = uniqueIdentifiers(result.alternatives, 5, code);
  }
  return immutable(normalized);
}

export function normalizeProductionRequestMutationEnvelope(value) {
  const code = 'PRODUCTION_REQUEST_MUTATION_INVALID';
  const envelope = exactObject(value, ['schemaVersion', 'request', 'requestId'], code);
  if (envelope.schemaVersion !== 2) invalid(code);
  identifier(envelope.requestId, code);
  return normalizeProductionPublicRequest(envelope.request);
}

export function normalizeProductionRequestHistoryEntry(value) {
  const code = 'PRODUCTION_REQUEST_HISTORY_INVALID';
  const input = exactObject(value, ['version', 'schemaVersion', 'operation', 'capturedAt', 'request'], code);
  const request = normalizeProductionPublicRequest(input.request);
  if (
    !HISTORY_OPERATIONS.has(input.operation)
    || input.version !== request.version
    || input.schemaVersion !== request.schemaVersion
  ) invalid(code);
  return Object.freeze({
    version: positiveVersion(input.version, code),
    schemaVersion: input.schemaVersion,
    operation: input.operation,
    capturedAt: canonicalUtc(input.capturedAt, code),
    request,
  });
}

export function normalizeProductionRequestDetailEnvelope(value) {
  const code = 'PRODUCTION_REQUEST_DETAIL_INVALID';
  const envelope = exactObject(value, ['schemaVersion', 'request', 'requestId'], code);
  if (envelope.schemaVersion !== 2) invalid(code);
  identifier(envelope.requestId, code);
  return normalizeProductionPublicRequest(envelope.request);
}

export function normalizeProductionRequestHistoryPage(value) {
  const code = 'PRODUCTION_REQUEST_HISTORY_INVALID';
  const input = exactObject(value, [
    'schemaVersion', 'requestId', 'asOfVersion', 'history', 'page',
  ], code);
  if (input.schemaVersion !== 2) invalid(code);
  identifier(input.requestId, code);
  const asOfVersion = positiveVersion(input.asOfVersion, code);
  const publicPage = page(input.page, 10, code);
  if (!Array.isArray(input.history) || input.history.length > publicPage.limit) invalid(code);
  const history = Object.freeze(input.history.map(normalizeProductionRequestHistoryEntry));
  if (history.some((entry, index) => (
    entry.version > asOfVersion || (index > 0 && history[index - 1].version <= entry.version)
  ))) invalid(code);
  return Object.freeze({ asOfVersion, history, page: publicPage });
}
