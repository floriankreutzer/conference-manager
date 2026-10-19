import { normalizeCatalogueReviewCommand } from '../platform/catering-catalogue-publication-api.js';
import { normalizeProviderCatalogueEntry } from '../platform/catering-provider-catalogue-api.js';
import { immutable,internalUuid,safeId } from '../platform/tenant-settings-wire.js';

const INVALID = 'CATERING_CATALOGUE_REVIEW_DRAFT_INVALID';
const key = (kind,id) => `${kind}:${id}`;
function invalid(code = INVALID) { throw new TypeError(code); }
function record(value,keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype,null].includes(Object.getPrototypeOf(value))) invalid();
  const own = Reflect.ownKeys(value);
  if (own.length !== keys.length || own.some((name) => {
    const descriptor = Object.getOwnPropertyDescriptor(value,name);
    return !keys.includes(name) || !descriptor.enumerable || !Object.hasOwn(descriptor,'value');
  })) invalid();
}
function counter(value,minimum = 0) {
  if (!Number.isSafeInteger(value) || value<minimum || value>Number.MAX_SAFE_INTEGER-2) invalid(); return value;
}
function boundedArray(value,maximum) {
  if (!Array.isArray(value) || value.length>maximum || Reflect.ownKeys(value).length !== value.length+1) invalid();
  for (let index=0;index<value.length;index++) {
    const descriptor = Object.getOwnPropertyDescriptor(value,String(index));
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor,'value')) invalid();
  }
  return value;
}
// Browser review preparation only. All observations and decisions are revalidated
// by the trusted API; this object cannot publish, price an order or grant access.
export function createCateringPublicationReview({ current,canonical,assignments,bindings } = {}) {
  if (!current || current.schemaVersion !== 1 || typeof current.canReview !== 'boolean') invalid();
  const integrationId = internalUuid(current.integrationId,INVALID).toLowerCase(); const canReview = current.canReview;
  for (const field of ['reviewRevision','publicationRevision','assignmentRevision']) counter(current[field]);
  for (const field of ['sourceRevision','configurationRevision','catalogueRevision']) counter(current[field],1);
  if (canonical?.revision !== current.catalogueRevision || assignments?.revision !== current.assignmentRevision
    || assignments?.currentCatalogueRevision !== current.catalogueRevision) invalid();
  if (canReview && current.assignmentRevision>0
    && (assignments.assignedCatalogueRevision !== current.catalogueRevision || assignments.stale !== false)) invalid();
  const entries = new Map();
  for (const [kind,collection,maximum] of [['item','cateringItems',300],['package','cateringPackages',100]]) {
    for (const value of boundedArray(canonical.catalogue?.[collection],maximum)) {
      const id = safeId(value?.id,INVALID); const identifier = key(kind,id);
      if (entries.has(identifier)) invalid(); entries.set(identifier,immutable(value));
    }
  }
  const owners = new Map();
  for (const value of boundedArray(assignments.assignments,400)) {
    if (!['item','package'].includes(value.kind)) invalid();
    const identifier = key(value.kind,safeId(value.entryId,INVALID));
    if (!entries.has(identifier) || owners.has(identifier)) invalid();
    owners.set(identifier,internalUuid(value.integrationId,INVALID).toLowerCase());
  }
  if (current.assignmentRevision>0 && owners.size !== entries.size) invalid();
  if (current.assignmentRevision === 0 && (owners.size>0 || entries.size>0)) invalid();
  const retained = boundedArray(bindings,400).map((value) => {
    record(value,['kind','entryId','sourceId','variants']);
    if (!['item','package'].includes(value.kind)) invalid();
    const entry = entries.get(key(value.kind,safeId(value.entryId,INVALID))); if (!entry) invalid();
    const variants = boundedArray(value.variants,20).map((variant) => {
      record(variant,['entryId','sourceId']); const entryId = safeId(variant.entryId,INVALID);
      if (value.kind !== 'package' || !entry.variants.some((x) => x.id === entryId)) invalid();
      return { entryId,sourceId: safeId(variant.sourceId,INVALID) };
    });
    if (new Set(variants.map((x) => x.entryId)).size !== variants.length
      || new Set(variants.map((x) => x.sourceId)).size !== variants.length) invalid();
    return { kind: value.kind,entryId: entry.id,sourceId: safeId(value.sourceId,INVALID),variants };
  });
  if (new Set(retained.map((x) => key(x.kind,x.sourceId))).size !== retained.length
    || new Set(retained.map((x) => key(x.kind,x.entryId))).size !== retained.length
    || (current.publicationRevision === 0 && retained.length>0)) invalid();
  const observed = immutable({ expectedReviewRevision: current.reviewRevision,expectedSourceRevision: current.sourceRevision,
    expectedConfigurationRevision: current.configurationRevision,expectedCatalogueRevision: current.catalogueRevision,
    expectedAssignmentRevision: current.assignmentRevision,expectedPublicationRevision: current.publicationRevision });
  const available = new Map();
  function own(kind,entryId) {
    const owner = owners.get(key(kind,entryId));
    if (owner !== undefined && owner !== integrationId) invalid('CATERING_CATALOGUE_REVIEW_OWNER_CONFLICT');
  }
  function command(value) {
    record(value,['commandId','decision','justification','items','packages']);
    if (!canReview) invalid('CATERING_CATALOGUE_REVIEW_UNAVAILABLE');
    const selected = normalizeCatalogueReviewCommand({ schemaVersion: 1,...observed,...value });
    for (const [kind,values] of [['item',selected.items],['package',selected.packages]]) {
      const existingIds=[...entries.keys()].filter((identifier) => identifier.startsWith(`${kind}:`));
      if (new Set([...existingIds,...values.map((value) => key(kind,value.entryId))]).size>(kind === 'item' ? 300 : 100)) {
        invalid('CATERING_CATALOGUE_REVIEW_CAPACITY');
      }
      for (const mapping of values) {
        own(kind,mapping.entryId); const product = available.get(key(kind,mapping.sourceId));
        if (!product) invalid('CATERING_CATALOGUE_REVIEW_SOURCE_UNREVIEWED');
        if (kind === 'package') {
          if (product.itemIds.some((sourceId) => !selected.items.some((x) => x.sourceId === sourceId))) {
            invalid('CATERING_CATALOGUE_REVIEW_COMPONENT_UNREVIEWED');
          }
          if (mapping.variants.some((variant) => !product.variants.some((x) => x.id === variant.sourceId))) {
            invalid('CATERING_CATALOGUE_REVIEW_SOURCE_UNREVIEWED');
          }
          const previousVariants = entries.get(key('package',mapping.entryId))?.variants ?? [];
          if (new Set([...previousVariants.map((x) => x.id),...mapping.variants.map((x) => x.entryId)]).size>20) {
            invalid('CATERING_CATALOGUE_REVIEW_VARIANT_LIMIT');
          }
        }
      }
    }
    return selected;
  }
  return Object.freeze({
    remember(kind,value) {
      const product = normalizeProviderCatalogueEntry(value,kind); const identifier = key(kind,product.id);
      const previous = available.get(identifier);
      if (previous && JSON.stringify(previous) !== JSON.stringify(product)) invalid('CATERING_CATALOGUE_REVIEW_SOURCE_CHANGED');
      if (!previous && [...available.keys()].filter((x) => x.startsWith(`${kind}:`)).length>=(kind === 'item' ? 300 : 100)) invalid();
      available.set(identifier,product);
      return product;
    },
    existingIds(kind) {
      if (!['item','package'].includes(kind)) invalid();
      return Object.freeze([...entries].filter(([identifier]) => identifier.startsWith(`${kind}:`)).map(([,entry]) => entry.id));
    },
    candidates(kind) {
      if (!['item','package'].includes(kind)) invalid();
      return immutable([...entries].filter(([identifier]) => identifier.startsWith(`${kind}:`) && owners.get(identifier) === integrationId)
        .map(([,entry]) => entry));
    },
    previousTarget(kind,sourceId) {
      const binding = retained.find((x) => x.kind === kind && x.sourceId === sourceId);
      return binding && owners.get(key(kind,binding.entryId)) === integrationId ? immutable(binding) : null;
    },
    command,
    retiring(value) {
      const selected = command(value); const retainedKeys = new Set([...selected.items.map((x) => key('item',x.entryId)),
        ...selected.packages.map((x) => key('package',x.entryId))]);
      if (selected.decision === 'rejected') return Object.freeze([]);
      return immutable(retained.filter((x) => owners.get(key(x.kind,x.entryId)) === integrationId
        && !retainedKeys.has(key(x.kind,x.entryId))).map((x) => ({ kind: x.kind,entryId: x.entryId,
        name: entries.get(key(x.kind,x.entryId)).name })));
    },
  });
}
