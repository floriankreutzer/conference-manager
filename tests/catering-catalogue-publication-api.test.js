import assert from 'node:assert/strict';
import test from 'node:test';
import { createCateringCataloguePublicationApi,
  normalizeCatalogueReviewCommand } from '../src/platform/catering-catalogue-publication-api.js';

const id = (n) => `e0000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const time = '2026-10-19T12:00:00.000Z';
const mapping = (sourceId = 'supplier-coffee',entryId = 'our-coffee') => ({ sourceId,entryId,price: { amountMinor: 700,currency: 'EUR' },
  active: true,order: 0,siteIds: [],roomIds: [] });
const intent = () => ({ schemaVersion: 1,commandId: id(100),expectedReviewRevision: 2,expectedSourceRevision: 3,
  expectedConfigurationRevision: 2,expectedCatalogueRevision: 4,expectedAssignmentRevision: 2,expectedPublicationRevision: 1,
  decision: 'published',justification: 'Synthetic explicit content and selling-price review',items: [mapping()],packages: [] });
const binding = (entryId = 'a') => ({ kind: 'item',entryId,sourceId: `supplier-${entryId}`,variants: [] });
const context = () => ({ schemaVersion: 1,integrationId: id(3),providerId: 'manual_catering',configurationRevision: 2,
  sourceRevision: 3,reviewRevision: 2,publicationRevision: 1,publishedSourceRevision: 1,catalogueRevision: 4,assignmentRevision: 2,
  canReview: true,bindings: [binding()],nextAfterBinding: null });
const historical = (revision) => ({ revision,sourceRevision: 1,configurationRevision: 1,catalogueRevision: 4,assignmentRevision: 2,
  publicationRevision: 1,decision: revision === 1 ? 'published' : 'rejected',
  justification: 'Synthetic review rationale',recordedAt: time });
const history = () => ({ schemaVersion: 1,integrationId: id(3),currentRevision: 2,
  revisions: [historical(2),historical(1)],nextBeforeRevision: null });
const ack = (body = intent()) => ({ schemaVersion: 1,commandId: body.commandId,replayed: false,decision: body.decision,
  reviewRevision: body.expectedReviewRevision+1,
  publicationRevision: body.expectedPublicationRevision+(body.decision === 'published' ? 1 : 0),
  catalogueRevision: body.expectedCatalogueRevision+(body.decision === 'published' ? 1 : 0),
  assignmentRevision: body.expectedAssignmentRevision+(body.decision === 'published' ? 1 : 0),recordedAt: time });
function fixture(response) {
  const calls = [];
  return { calls,api: createCateringCataloguePublicationApi({ apiClient: { async request(path,options) {
    calls.push({ path,options }); return typeof response === 'function' ? response(path,options) : response;
  } } }) };
}

test('review wire uses two exact scoped routes, trusted observed versions and frozen mapping/acknowledgement values',async () => {
  const f = fixture((path) => path.includes('/reviews') ? history() : context());
  const value = await f.api.loadPublicationContext({ integrationId: id(3) });
  assert.equal(value.canReview,true); assert.equal(Object.isFrozen(value.bindings[0].variants),true);
  assert.equal(f.calls[0].path,`v1/tenant/catering/provider-catalogues/${id(3)}/review`);
  await f.api.loadPublicationHistory({ integrationId: id(3) });
  assert.equal(f.calls[1].path,`v1/tenant/catering/provider-catalogues/${id(3)}/reviews`);
  const write = fixture(ack()); const saved = await write.api.reviewCatalogue({ integrationId: id(3),command: intent() });
  assert.deepEqual(saved,ack()); assert.equal(write.calls[0].options.method,'POST');
  assert.deepEqual(write.calls[0].options.body,normalizeCatalogueReviewCommand(intent()));
  assert.equal(Object.isFrozen(write.calls[0].options.body.items[0].price),true);
  assert.doesNotMatch(JSON.stringify(write.calls[0].options.body),/tenantId|providerId|actorUserId|providerPrice|session/);
  const rejected = { ...intent(),decision: 'rejected',items: [] };
  const retained = await fixture(ack(rejected)).api.reviewCatalogue({ integrationId: id(3),command: rejected });
  assert.equal(retained.publicationRevision,1); assert.equal(retained.catalogueRevision,4); assert.equal(retained.assignmentRevision,2);
});
test('commercial intent requires explicit known selling prices, dense unique closed mappings and justified unambiguous decisions',() => {
  for (const extra of [{ tenantId: id(99) },{ actorUserId: id(99) },{ decision: 'approved' },{ decision: 'rejected' },
    { justification: '' },{ justification: '<unsafe>' },{ justification: 'unsafe\u0085control' },
    { expectedSourceRevision: 0 },{ expectedReviewRevision: Number.MAX_SAFE_INTEGER },
    { items: [{ ...mapping(),price: null }] },{ items: [{ ...mapping(),price: { amountMinor: -1,currency: 'EUR' } }] },
    { items: [{ ...mapping(),price: { amountMinor: 1,currency: 'foreign' } }] },{ items: [mapping(),mapping()] },
    { items: [{ ...mapping(),siteIds: ['a','a'] }] },{ items: [{ ...mapping(),providerPrice: { amountMinor: 1,currency: 'EUR' } }] }]) {
    assert.throws(() => normalizeCatalogueReviewCommand({ ...intent(),...extra }));
  }
  const sparse = intent(); sparse.items=Array(1); assert.throws(() => normalizeCatalogueReviewCommand(sparse));
  let reads = 0; const hidden = intent();
  Object.defineProperty(hidden,'items',{ enumerable: true,get() { reads++; return []; } });
  assert.throws(() => normalizeCatalogueReviewCommand(hidden)); assert.equal(reads,0);
  const explicitZero = normalizeCatalogueReviewCommand({ ...intent(),items: [{ ...mapping(),price: { amountMinor: 0,currency: 'EUR' } }] });
  assert.equal(explicitZero.items[0].price.amountMinor,0);
});
test('full300/100/20 review capacity and stable replay intent do not borrow receipt/order limits',() => {
  const value = intent(); value.items=Array.from({ length: 300 },(_,i) => mapping(`supplier-item-${i}`,`our-item-${i}`));
  value.packages=Array.from({ length: 100 },(_,i) => ({ ...mapping(`supplier-package-${i}`,`our-package-${i}`),
    variants: Array.from({ length: 20 },(_,j) => {
      const { siteIds: _sites,roomIds: _rooms,...variant } = mapping(`supplier-variant-${j}`,`our-variant-${j}`); return variant;
    }) }));
  const normalized = normalizeCatalogueReviewCommand(value); assert.equal(normalized.items.length,300);
  assert.equal(normalized.packages.length,100); assert.equal(normalized.packages[0].variants.length,20);
  const reordered = { ...value,items: [...value.items].reverse(),packages: [...value.packages].reverse() };
  assert.deepEqual(normalizeCatalogueReviewCommand(reordered),normalized);
  value.items.push(mapping('extra','extra')); assert.throws(() => normalizeCatalogueReviewCommand(value));
});
test('publication-version cursors permit byte-packed partial pages and reject stale scope or malformed links',async () => {
  const page = { ...context(),bindings: [binding('a'),binding('b')],nextAfterBinding: { kind: 'item',entryId: 'b' } };
  const f = fixture(page); const first = await f.api.loadPublicationContext({ integrationId: id(3) });
  assert.deepEqual(first.nextAfterBinding,page.nextAfterBinding);
  const next = fixture({ ...context(),bindings: [binding('z')] });
  await next.api.loadPublicationContext({ integrationId: id(3),afterBinding: { kind: 'item',entryId: 'b' },publicationRevision: 1 });
  assert.equal(next.calls[0].path,
    `v1/tenant/catering/provider-catalogues/${id(3)}/review?afterKind=item&afterEntryId=b&publicationRevision=1`);
  for (const extra of [{ integrationId: id(99) },{ providerId: 'foreign' },{ tenantId: id(1) },{ canReview: 'yes' },
    { publishedSourceRevision: 4 },{ publicationRevision: 3 },{ nextAfterBinding: { kind: 'item',entryId: 'z' } },
    { bindings: [binding('b'),binding('a')] },{ bindings: [{ ...binding(),private: true }] }]) {
    await assert.rejects(fixture({ ...page,...extra }).api.loadPublicationContext({ integrationId: id(3) }));
  }
  await assert.rejects(fixture(context()).api.loadPublicationContext({ integrationId: id(3),publicationRevision: 0 }));
  const noRequest = fixture(context());
  await assert.rejects(noRequest.api.loadPublicationContext({ integrationId: id(3),afterBinding: { kind: 'item',entryId: 'a' } }));
  assert.equal(noRequest.calls.length,0);
});
test('history accepts short pages only with genuine continuation and validates rationale and immutable metadata',async () => {
  const partial = { ...history(),currentRevision: 4,revisions: [historical(4)],nextBeforeRevision: 4 };
  const f = fixture(partial); assert.equal((await f.api.loadPublicationHistory({ integrationId: id(3) })).nextBeforeRevision,4);
  const tail = fixture(history()); await tail.api.loadPublicationHistory({ integrationId: id(3),beforeRevision: 3 });
  assert.ok(tail.calls[0].path.endsWith('/reviews?beforeRevision=3'));
  for (const extra of [{ nextBeforeRevision: null },{ nextBeforeRevision: 3 },{ revisions: [] },{ tenantId: id(1) },
    { revisions: [{ ...historical(4),justification: 'unsafe\u0085' }] },
    { revisions: [{ ...historical(4),recordedAt: 'invalid' }] },{ revisions: [{ ...historical(4),publicationRevision: 5 }] },
    { revisions: [{ ...historical(4),private: true }] }]) {
    await assert.rejects(fixture({ ...partial,...extra }).api.loadPublicationHistory({ integrationId: id(3) }));
  }
  const reversed = fixture({ ...history(),revisions: [historical(1),historical(2)] });
  await assert.rejects(reversed.api.loadPublicationHistory({ integrationId: id(3) }));
  const empty = await fixture({ ...history(),currentRevision: 0,revisions: [] }).api.loadPublicationHistory({ integrationId: id(3) });
  assert.equal(empty.revisions.length,0);
});
test('mismatched acknowledgement or private data cannot become success; safe transport codes remain without retry',async () => {
  for (const extra of [{ commandId: id(99) },{ decision: 'rejected' },{ reviewRevision: 2 },{ publicationRevision: 1 },
    { catalogueRevision: 4 },{ assignmentRevision: 2 },{ recordedAt: 'invalid' },{ replayed: 'yes' },{ actorUserId: id(20) }]) {
    const f = fixture({ ...ack(),...extra });
    await assert.rejects(f.api.reviewCatalogue({ integrationId: id(3),command: intent() })); assert.equal(f.calls.length,1);
  }
  const f = fixture(() => { throw Object.assign(new Error('private provider detail'),{ code: 'HTTP_409',
    serverCode: 'CATERING_CATALOGUE_PUBLICATION_SOURCE_CONFLICT' }); });
  await assert.rejects(f.api.reviewCatalogue({ integrationId: id(3),command: intent() }),
    (error) => error.code === 'HTTP_409' && error.serverCode === 'CATERING_CATALOGUE_PUBLICATION_SOURCE_CONFLICT');
  assert.equal(f.calls.length,1);
  const invalid = fixture(ack());
  await assert.rejects(invalid.api.reviewCatalogue({ integrationId: id(3),command: { ...intent(),tenantId: id(1) } }));
  assert.equal(invalid.calls.length,0);
});
