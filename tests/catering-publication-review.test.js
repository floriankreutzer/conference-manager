import assert from 'node:assert/strict';
import test from 'node:test';
import { createCateringPublicationReview } from '../src/manager/catering-publication-review.js';

const id = (n) => `e0000000-0000-4000-8000-${String(n).padStart(12,'0')}`;
const money = (amountMinor) => ({ amountMinor,currency: 'EUR' });
const canonicalItem = (entryId,name = entryId) => ({ id: entryId,name,description: null,price: money(700),active: true,
  order: 0,siteIds: [],roomIds: [] });
const receivedItem = (entryId = 'source-coffee') => ({ id: entryId,name: 'Synthetic received coffee',description: null,providerPrice: money(250) });
const receivedPackage = () => ({ ...receivedItem('source-break'),itemIds: ['source-coffee'],variants: [receivedItem('source-standard')] });
const mapping = (sourceId = 'source-coffee',entryId = 'our-coffee') => ({ sourceId,entryId,price: money(900),active: true,
  order: 0,siteIds: [],roomIds: [] });
const intent = (overrides = {}) => ({ commandId: id(100),decision: 'published',justification: 'Synthetic explicit commercial review',
  items: [mapping()],packages: [],...overrides });
function input() {
  return { current: { schemaVersion: 1,integrationId: id(3),canReview: true,reviewRevision: 2,sourceRevision: 3,
    configurationRevision: 2,catalogueRevision: 4,assignmentRevision: 2,publicationRevision: 1 },
  canonical: { revision: 4,catalogue: { cateringItems: [canonicalItem('our-coffee'),canonicalItem('other-fruit')],
    cateringPackages: [{ ...canonicalItem('our-break'),itemIds: ['our-coffee'],variants: [{ id: 'our-standard',name: 'Existing standard',
      description: null,price: money(1000),active: true,order: 0 }] }] } },
  assignments: { revision: 2,currentCatalogueRevision: 4,assignedCatalogueRevision: 4,stale: false,assignments: [
    { kind: 'item',entryId: 'our-coffee',integrationId: id(3) },{ kind: 'item',entryId: 'other-fruit',integrationId: id(4) },
    { kind: 'package',entryId: 'our-break',integrationId: id(3) }] },
  bindings: [{ kind: 'item',entryId: 'our-coffee',sourceId: 'source-coffee',variants: [] },
    { kind: 'package',entryId: 'our-break',sourceId: 'source-break',variants: [{ entryId: 'our-standard',sourceId: 'source-standard' }] }] };
}

test('review preparation captures exact observed versions and requires explicit selling prices independently of received cost',() => {
  const data = input(); const draft = createCateringPublicationReview(data); draft.remember('item',receivedItem());
  const value = draft.command(intent());
  assert.equal(value.expectedSourceRevision,3); assert.equal(value.expectedConfigurationRevision,2);
  assert.equal(value.expectedCatalogueRevision,4); assert.equal(value.expectedAssignmentRevision,2);
  assert.equal(value.expectedReviewRevision,2); assert.equal(value.expectedPublicationRevision,1);
  assert.equal(value.items[0].price.amountMinor,900); assert.equal(Object.isFrozen(value.items[0].price),true);
  assert.doesNotMatch(JSON.stringify(value),/providerPrice|tenantId|integrationId|actorUserId|250/);
  assert.throws(() => draft.command(intent({ items: [{ ...mapping(),price: null }] })));
  assert.throws(() => draft.command({ ...intent(),expectedSourceRevision: 1 }));
});
test('only own existing targets are offered and stale prior bindings cannot deactivate remapped provider ownership',() => {
  const data = input(); const draft = createCateringPublicationReview(data); draft.remember('item',receivedItem());
  assert.deepEqual(draft.candidates('item').map((x) => x.id),['our-coffee']);
  assert.equal(draft.previousTarget('item','source-coffee').entryId,'our-coffee');
  assert.throws(() => draft.command(intent({ items: [mapping('source-coffee','other-fruit')] })),/OWNER_CONFLICT/);
  data.assignments.assignments[0].integrationId=id(4);
  const remapped = createCateringPublicationReview(data); remapped.remember('item',receivedItem());
  assert.equal(remapped.previousTarget('item','source-coffee'),null);
  assert.deepEqual(remapped.retiring(intent({ items: [] })).map((x) => x.entryId),['our-break']);
  assert.deepEqual(draft.retiring(intent()).map((x) => x.entryId),['our-break']);
});
test('all selected package components and variants require explicit received evidence and independent mappings',() => {
  const draft = createCateringPublicationReview(input()); draft.remember('package',receivedPackage());
  const group = { ...mapping('source-break','our-break'),variants: [{ sourceId: 'source-standard',entryId: 'our-standard',
    price: money(1500),active: true,order: 0 }] };
  assert.throws(() => draft.command(intent({ items: [],packages: [group] })),/COMPONENT_UNREVIEWED/);
  assert.throws(() => draft.command(intent({ packages: [group] })),/SOURCE_UNREVIEWED/);
  draft.remember('item',receivedItem()); const value = draft.command(intent({ packages: [group] }));
  assert.equal(value.packages[0].variants[0].price.amountMinor,1500);
  assert.deepEqual(draft.retiring(intent({ packages: [group] })),[]);
  assert.throws(() => draft.command(intent({ packages: [{ ...group,variants: [{ ...group.variants[0],sourceId: 'foreign' }] }] })),
    /SOURCE_UNREVIEWED/);
});
test('rejection retains the earlier offer while deliberate empty publication previews only previously published own omissions',() => {
  const draft = createCateringPublicationReview(input());
  const rejected = intent({ decision: 'rejected',items: [] });
  assert.equal(draft.command(rejected).expectedPublicationRevision,1); assert.deepEqual(draft.retiring(rejected),[]);
  assert.deepEqual(draft.retiring(intent({ items: [] })).map((x) => x.entryId),['our-coffee','our-break']);
  assert.throws(() => draft.command(intent({ decision: 'rejected' })));
});
test('source fragments and canonical read observations are immutable and contradictory rereads cannot replace reviewed evidence',() => {
  const data = input(); const draft = createCateringPublicationReview(data); const source = receivedItem();
  const saved = draft.remember('item',source); source.providerPrice.amountMinor=999;
  assert.equal(saved.providerPrice.amountMinor,250); assert.equal(Object.isFrozen(saved.providerPrice),true);
  data.canonical.catalogue.cateringItems[0].name='Changed outside the captured review';
  data.current.sourceRevision=99;
  assert.equal(draft.candidates('item')[0].name,'our-coffee'); assert.equal(draft.command(intent()).expectedSourceRevision,3);
  assert.throws(() => draft.remember('item',source),/SOURCE_CHANGED/);
  assert.equal(draft.remember('item',receivedItem()).providerPrice.amountMinor,250);
  assert.throws(() => draft.remember('item',{ ...receivedItem(),name: '<unsafe>' }));
});
test('stale canonical/assignment observations, impossible ownership and unavailable review cannot build new intent',() => {
  for (const mutate of [(x) => { x.canonical.revision=3; },(x) => { x.assignments.currentCatalogueRevision=3; },
    (x) => { x.assignments.assignedCatalogueRevision=3; },(x) => { x.assignments.stale=true; },
    (x) => { x.assignments.assignments.pop(); },(x) => { x.bindings[0].entryId='absent'; },
    (x) => { x.bindings[1].variants[0].entryId='absent'; }]) {
    const value = input(); mutate(value); assert.throws(() => createCateringPublicationReview(value));
  }
  const unavailable = input(); unavailable.current.canReview=false;
  const draft = createCateringPublicationReview(unavailable); unavailable.current.canReview=true;
  assert.throws(() => draft.command(intent({ decision: 'rejected',items: [] })),/UNAVAILABLE/);
});
test('empty initial assignment state and full received-fragment bounds remain supported without partial overflow mutation',() => {
  const empty = input(); empty.current.assignmentRevision=0; empty.current.publicationRevision=0; empty.current.reviewRevision=0;
  empty.canonical.catalogue={ cateringItems: [],cateringPackages: [] }; empty.bindings=[];
  empty.assignments={ revision: 0,currentCatalogueRevision: 4,assignedCatalogueRevision: null,stale: true,assignments: [] };
  const draft = createCateringPublicationReview(empty);
  for (let i=0;i<300;i++) draft.remember('item',receivedItem(`source-${i}`));
  assert.throws(() => draft.remember('item',receivedItem('overflow')));
  const value = draft.command(intent({ items: [mapping('source-0','new-coffee')] }));
  assert.equal(value.expectedAssignmentRevision,0); assert.equal(value.expectedPublicationRevision,0);
  assert.deepEqual(draft.retiring(intent({ items: [mapping('source-0','new-coffee')] })),[]);
});

test('retained variant history cannot be overflowed by new mappings while an explicit existing variant remains reviewable',() => {
  const data = input(); data.canonical.catalogue.cateringPackages[0].variants=Array.from({ length: 20 },(_,i) => ({
    id: i === 0 ? 'our-standard' : `retained-${i}`,name: `Retained variant ${i}`,description: null,price: money(500),active: false,order: i,
  }));
  const draft = createCateringPublicationReview(data); draft.remember('item',receivedItem()); draft.remember('package',receivedPackage());
  const group = { ...mapping('source-break','our-break'),variants: [{ sourceId: 'source-standard',entryId: 'new-variant',
    price: money(500),active: true,order: 0 }] };
  assert.throws(() => draft.command(intent({ packages: [group] })),/VARIANT_LIMIT/);
  group.variants[0].entryId='our-standard'; assert.equal(draft.command(intent({ packages: [group] })).packages[0].variants.length,1);
});

test('new target allocation reserves every existing ID and never treats retired historical entries as free capacity',() => {
  const data=input(); const draft=createCateringPublicationReview(data);
  assert.deepEqual(draft.existingIds('item'),['our-coffee','other-fruit']);
  assert.equal(Object.isFrozen(draft.existingIds('item')),true);
  assert.throws(() => draft.existingIds('foreign'));
  for (let i=2;i<300;i++) {
    data.canonical.catalogue.cateringItems.push(canonicalItem(`retained-${i}`));
    data.assignments.assignments.push({kind:'item',entryId:`retained-${i}`,integrationId:id(3)});
  }
  const full=createCateringPublicationReview(data); full.remember('item',receivedItem());
  assert.throws(() => full.command(intent({items:[mapping('source-coffee','new-target')]})),/CAPACITY/);
  assert.equal(full.command(intent()).items[0].entryId,'our-coffee');
  assert.deepEqual(full.command(intent({decision:'rejected',items:[]})).items,[]);
});
