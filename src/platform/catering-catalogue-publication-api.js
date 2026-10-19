import { adapterError,boundedInteger,immutable,internalUuid,safeId,utcInstant } from './tenant-settings-wire.js';

const ROOT = 'v1/tenant/catering/provider-catalogues';
const INVALID = 'CATERING_CATALOGUE_REVIEW_RESPONSE_INVALID';
const MAXIMUM = Number.MAX_SAFE_INTEGER-1;
export class CateringCataloguePublicationApiError extends Error {
  constructor(code,{ cause,serverCode = null } = {}) {
    super(code,cause === undefined ? undefined : { cause });
    this.name='CateringCataloguePublicationApiError'; this.code=code; this.serverCode=serverCode;
  }
}
function invalid() { throw new CateringCataloguePublicationApiError(INVALID); }
function record(value,keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype,null].includes(Object.getPrototypeOf(value))) invalid();
  const own = Reflect.ownKeys(value);
  if (own.length !== keys.length || own.some((name) => {
    const descriptor = Object.getOwnPropertyDescriptor(value,name);
    return !keys.includes(name) || !descriptor.enumerable || !Object.hasOwn(descriptor,'value');
  })) invalid();
}
function array(value,limit) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length>limit
    || Reflect.ownKeys(value).length !== value.length+1) invalid();
  for (let i=0;i<value.length;i++) {
    const descriptor = Object.getOwnPropertyDescriptor(value,String(i));
    if (!descriptor?.enumerable || !Object.hasOwn(descriptor,'value')) invalid();
  }
  return value;
}
const count = (value,minimum = 0,maximum = MAXIMUM) => boundedInteger(value,INVALID,{ minimum,maximum });
const uuid = (value) => internalUuid(value,INVALID).toLowerCase();
const id = (value) => safeId(value,INVALID);
function text(value) {
  if (typeof value !== 'string' || !value.isWellFormed()
    || /[<>\u0000-\u001f\u007f-\u009f\u202a-\u202e\u2066-\u2069]/.test(value)) invalid();
  const normalized = value.trim().normalize('NFC'); if (!normalized.length || normalized.length>1000) invalid(); return normalized;
}
function money(value) {
  record(value,['amountMinor','currency']); if (!['CHF','EUR','GBP','USD'].includes(value.currency)) invalid();
  return { amountMinor: count(value.amountMinor,0,1000000000),currency: value.currency };
}
function identifiers(value) {
  const entries = array(value,200).map(id); if (new Set(entries).size !== entries.length) invalid(); return entries.sort();
}
function distinct(entries,property) { if (new Set(entries.map((x) => x[property])).size !== entries.length) invalid(); }
function mapping(value,variant = false,group = false) {
  record(value,['sourceId','entryId','price','active','order',...(variant ? [] : ['siteIds','roomIds']),...(group ? ['variants'] : [])]);
  if (typeof value.active !== 'boolean') invalid();
  const result = { sourceId: id(value.sourceId),entryId: id(value.entryId),price: money(value.price),active: value.active,
    order: count(value.order,0,100000),...(variant ? {} : { siteIds: identifiers(value.siteIds),roomIds: identifiers(value.roomIds) }) };
  if (group) {
    result.variants=array(value.variants,20).map((x) => mapping(x,true));
    distinct(result.variants,'sourceId'); distinct(result.variants,'entryId'); result.variants.sort(compareSource);
  }
  return result;
}
function compareSource(a,b) { return a.sourceId<b.sourceId ? -1 : a.sourceId>b.sourceId ? 1 : 0; }
export function normalizeCatalogueReviewCommand(value) {
  record(value,['schemaVersion','commandId','expectedReviewRevision','expectedSourceRevision','expectedConfigurationRevision',
    'expectedCatalogueRevision','expectedAssignmentRevision','expectedPublicationRevision','decision','justification','items','packages']);
  if (value.schemaVersion !== 1 || !['published','rejected'].includes(value.decision)) invalid();
  const items = array(value.items,300).map((x) => mapping(x));
  const packages = array(value.packages,100).map((x) => mapping(x,false,true));
  for (const entries of [items,packages]) { distinct(entries,'sourceId'); distinct(entries,'entryId'); entries.sort(compareSource); }
  if (value.decision === 'rejected' && (items.length>0 || packages.length>0)) invalid();
  const revisions = {};
  for (const field of ['Review','Source','Configuration','Catalogue','Assignment','Publication']) {
    const minimum = ['Review','Assignment','Publication'].includes(field) ? 0 : 1;
    revisions[`expected${field}Revision`]=count(value[`expected${field}Revision`],minimum,MAXIMUM-1);
  }
  return immutable({ schemaVersion: 1,commandId: uuid(value.commandId),...revisions,decision: value.decision,
    justification: text(value.justification),items,packages });
}
function cursor(value) {
  record(value,['kind','entryId']); if (!['item','package'].includes(value.kind)) invalid();
  return { kind: value.kind,entryId: id(value.entryId) };
}
const key = (entry) => `${entry.kind}:${entry.entryId}`;
function binding(value) {
  record(value,['kind','entryId','sourceId','variants']); const selected = cursor({ kind: value.kind,entryId: value.entryId });
  const variants = array(value.variants,20).map((x) => {
    record(x,['entryId','sourceId']); return { entryId: id(x.entryId),sourceId: id(x.sourceId) };
  });
  if (selected.kind === 'item' && variants.length>0) invalid();
  distinct(variants,'entryId'); distinct(variants,'sourceId');
  return { ...selected,sourceId: id(value.sourceId),variants };
}
function scope(value,integrationId) {
  if (value.schemaVersion !== 1 || uuid(value.integrationId) !== integrationId) invalid();
}
function reviewContext(value,integrationId,after,publicationRevision) {
  record(value,['schemaVersion','integrationId','providerId','configurationRevision','sourceRevision','reviewRevision',
    'publicationRevision','publishedSourceRevision','catalogueRevision','assignmentRevision','canReview','bindings','nextAfterBinding']);
  scope(value,integrationId); if (value.providerId !== 'manual_catering' || typeof value.canReview !== 'boolean') invalid();
  count(value.configurationRevision,1); count(value.catalogueRevision,1);
  for (const name of ['sourceRevision','reviewRevision','publicationRevision','publishedSourceRevision','assignmentRevision']) {
    count(value[name]);
  }
  if (value.publicationRevision>value.reviewRevision || value.publishedSourceRevision>value.sourceRevision
    || ((value.publicationRevision === 0) !== (value.publishedSourceRevision === 0))
    || (value.sourceRevision === 0 && (value.reviewRevision !== 0 || value.canReview))
    || (publicationRevision !== null && publicationRevision !== value.publicationRevision)) invalid();
  let previous = after === null ? '' : key(after); const sources = new Set();
  const entries = array(value.bindings,5).map(binding);
  for (const entry of entries) {
    const sourceKey = `${entry.kind}:${entry.sourceId}`;
    if (key(entry)<=previous || sources.has(sourceKey)) invalid(); previous=key(entry); sources.add(sourceKey);
  }
  const next = value.nextAfterBinding === null ? null : cursor(value.nextAfterBinding);
  if ((value.publicationRevision === 0 && entries.length>0)
    || (next !== null && (entries.length === 0 || key(next) !== previous))) invalid();
  return immutable({ ...value,bindings: entries,nextAfterBinding: next });
}
function historyEntry(value) {
  record(value,['revision','sourceRevision','configurationRevision','catalogueRevision','assignmentRevision','publicationRevision',
    'decision','justification','recordedAt']);
  for (const name of ['revision','sourceRevision','configurationRevision','catalogueRevision']) count(value[name],1);
  count(value.assignmentRevision); count(value.publicationRevision);
  if (!['published','rejected'].includes(value.decision) || (value.decision === 'published' && value.publicationRevision === 0)
    || value.publicationRevision>value.revision
    || (value.revision === 1 && value.publicationRevision !== (value.decision === 'published' ? 1 : 0))) invalid();
  const justification = text(value.justification); if (justification !== value.justification) invalid();
  return { ...value,justification,recordedAt: utcInstant(value.recordedAt,INVALID) };
}
function history(value,integrationId,before) {
  record(value,['schemaVersion','integrationId','currentRevision','revisions','nextBeforeRevision']); scope(value,integrationId);
  const current = count(value.currentRevision); if (before !== null && before>current+1) invalid();
  let expected = Math.min(current,before === null ? current : before-1); let newer = null;
  const entries = array(value.revisions,20).map(historyEntry);
  for (const entry of entries) {
    if (entry.revision !== expected) invalid(); expected--;
    if (newer) {
      const increment = newer.decision === 'published' ? 1 : 0;
      if (newer.publicationRevision !== entry.publicationRevision+increment || newer.sourceRevision<entry.sourceRevision
        || newer.configurationRevision<entry.configurationRevision || newer.catalogueRevision<entry.catalogueRevision+increment
        || newer.assignmentRevision<entry.assignmentRevision+increment) invalid();
    }
    newer=entry;
  }
  const next = value.nextBeforeRevision === null ? null : count(value.nextBeforeRevision,1);
  if ((entries.length === 0 && expected !== 0)
    || next !== (entries.length>0 && entries.at(-1).revision>1 ? entries.at(-1).revision : null)) invalid();
  return immutable({ ...value,revisions: entries,nextBeforeRevision: next });
}
export function createCateringCataloguePublicationApi({ apiClient } = {}) {
  if (typeof apiClient?.request !== 'function') throw new TypeError('CATERING_API_CLIENT_REQUIRED');
  async function invoke(work) {
    try { return await work(); }
    catch (error) { throw adapterError(CateringCataloguePublicationApiError,error,'CATERING_CATALOGUE_REVIEW_UNAVAILABLE'); }
  }
  return Object.freeze({
    validateCatalogueReview: normalizeCatalogueReviewCommand,
    loadPublicationContext({ integrationId,afterBinding = null,publicationRevision = null,signal } = {}) {
      return invoke(async () => {
        const integration = uuid(integrationId); const after = afterBinding === null ? null : cursor(afterBinding);
        const revision = publicationRevision === null ? null : count(publicationRevision);
        if (after !== null && revision === null) invalid();
        const query = new URLSearchParams();
        if (after !== null) { query.set('afterKind',after.kind); query.set('afterEntryId',after.entryId); }
        if (revision !== null) query.set('publicationRevision',String(revision));
        const suffix = query.size>0 ? `?${query}` : '';
        return reviewContext(await apiClient.request(`${ROOT}/${integration}/review${suffix}`,{ signal }),integration,after,revision);
      });
    },
    loadPublicationHistory({ integrationId,beforeRevision = null,signal } = {}) {
      return invoke(async () => {
        const integration = uuid(integrationId); const before = beforeRevision === null ? null : count(beforeRevision,1);
        const query = before === null ? '' : `?beforeRevision=${before}`;
        return history(await apiClient.request(`${ROOT}/${integration}/reviews${query}`,{ signal }),integration,before);
      });
    },
    reviewCatalogue({ integrationId,command } = {}) {
      return invoke(async () => {
        const integration = uuid(integrationId); const body = normalizeCatalogueReviewCommand(command);
        const value = await apiClient.request(`${ROOT}/${integration}/review`,{ method: 'POST',body });
        record(value,['schemaVersion','commandId','replayed','decision','reviewRevision','publicationRevision','catalogueRevision',
          'assignmentRevision','recordedAt']); const increment = body.decision === 'published' ? 1 : 0;
        if (value.schemaVersion !== 1 || uuid(value.commandId) !== body.commandId || value.decision !== body.decision
          || typeof value.replayed !== 'boolean' || value.reviewRevision !== body.expectedReviewRevision+1
          || value.publicationRevision !== body.expectedPublicationRevision+increment
          || value.catalogueRevision !== body.expectedCatalogueRevision+increment
          || value.assignmentRevision !== body.expectedAssignmentRevision+increment) invalid();
        return immutable({ ...value,commandId: body.commandId,recordedAt: utcInstant(value.recordedAt,INVALID) });
      });
    },
  });
}
