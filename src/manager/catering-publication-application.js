import { createCateringPublicationEditor } from './catering-publication-editor.js';
import { createCateringPublicationReview } from './catering-publication-review.js';
import { createCateringSourceTerms } from './catering-source-presentation.js';
import { formatDateTime,formatNumber,t } from '../core/i18n.js';
import { button,el,field } from '../core/ui.js';
import { authorityFailureCode } from '../shared/authority-failure.js';

const label = (key,values) => t(`cateringPublication.${key}`,values);
const sourceLabel = (key,values) => t(`cateringSource.${key}`,values);
const reference = (id) => `${id.slice(0,8)}…${id.slice(-8)}`;
const bindingKey = (value) => `${value.kind}:${value.entryId}`;
const contextBasis = (value) => JSON.stringify(Object.fromEntries(Object.entries(value)
  .filter(([key]) => !['bindings','nextAfterBinding'].includes(key))));
function changed() { throw new Error('CATERING_PUBLICATION_OBSERVATIONS_CHANGED'); }
function assertSourcePage(value,receipt) {
  if (!receipt || value.revision !== receipt.revision || value.configurationRevision !== receipt.configurationRevision
    || value.reference !== receipt.reference || value.recordedAt !== receipt.recordedAt
    || value.sourceVersion !== receipt.summary.sourceVersion || value.itemCount !== receipt.summary.itemCount
    || value.packageCount !== receipt.summary.packageCount || JSON.stringify(value.terms) !== JSON.stringify(receipt.summary.terms)) changed();
}

// Manager-owned orchestration. These observations prepare a proposal only; the
// trusted API repeats authorization, all version/ownership checks and publication.
export async function renderCateringCataloguePublications({ root,adapter,catalogue,locations,createId,defaultCurrencyFor,
  isCurrent,onAuthorityFailure }) {
  const panel = el('section',{ className: 'card',dataset: { cateringPublications: 'true' } });
  const select = el('select'); const status = el('p',{ attrs: { role: 'status','aria-live': 'polite' } });
  const reload = button(label('reload')); const firstConnections = button(sourceLabel('firstConnections'));
  const nextConnections = button(sourceLabel('nextConnections')); const history = el('section');
  const basis = el('section'); const paging = el('div',{ className: 'button-row' }); const editorHost = el('section');
  panel.append(el('p',{ text: label('description') }),el('p',{ className: 'field-hint',text: label('notice') }),
    field({ id: 'catering-publication-connection',label: sourceLabel('connection'),control: select }),
    el('div',{ className: 'button-row' },[firstConnections,nextConnections,reload]),status,history,basis,paging,editorHost);
  root.appendChild(panel);
  let busy = false; let blocked = false; let page = null; let selected = null; let observation = null;
  let receipt = null; let editor = null; let sourcePage = null;
  const current = () => isCurrent() && panel.isConnected;
  function setBusy(value) {
    busy=value; panel.setAttribute('aria-busy',String(value));
    for (const control of panel.querySelectorAll('button,select')) {
      if (editor?.root.contains(control)) continue;
      control.disabled=value || control.dataset.publicationUnavailable === 'true';
    }
    select.disabled=value || editor !== null || !page?.connections.length;
    firstConnections.disabled=value || editor !== null || page === null;
    nextConnections.disabled=value || editor !== null || !page?.nextAfterIntegrationId;
    for (const control of paging.querySelectorAll('button')) {
      control.disabled=value || blocked || control.dataset.publicationUnavailable === 'true';
    }
    editor?.setDisabled(value || blocked);
  }
  function clearReview() {
    editor=null; observation=null; receipt=null; sourcePage=null; blocked=false;
    editorHost.replaceChildren(); basis.replaceChildren(); paging.replaceChildren(); history.replaceChildren();
  }
  function failure(error) {
    if (!current()) return;
    if (authorityFailureCode(error)) {
      clearReview(); select.replaceChildren(); page=null; selected=null; setBusy(false);
      onAuthorityFailure(error); return;
    }
    blocked=true; status.textContent=label('error'); setBusy(false);
  }
  function showHistory(value) {
    const heading = el('h3',{ text: label('history'),attrs: { tabindex: '-1' } }); history.replaceChildren(heading);
    for (const entry of value.revisions) history.appendChild(el('section',{ className: 'card' },[
      el('h4',{ text: label('historyEntry',{ revision: formatNumber(entry.revision),source: formatNumber(entry.sourceRevision),
        decision: label(entry.decision) }) }),el('p',{ text: formatDateTime(entry.recordedAt) }),el('p',{ text: entry.justification }),
    ]));
    if (!value.revisions.length) history.appendChild(el('p',{ text: label('emptyHistory') }));
    const first = button(label('firstHistory')); const next = button(label('nextHistory'),{
      dataset: { publicationUnavailable: String(value.nextBeforeRevision === null) } });
    first.addEventListener('click',() => { void loadHistory(); });
    next.addEventListener('click',() => { if (value.nextBeforeRevision) void loadHistory(value.nextBeforeRevision); });
    history.appendChild(el('div',{ className: 'button-row' },[first,next]));
    return heading;
  }
  async function loadHistory(beforeRevision = null) {
    if (busy || !current() || !selected) return;
    setBusy(true);
    try {
      const value = await adapter.loadPublicationHistory({ integrationId: selected,beforeRevision }); if (!current()) return;
      if (observation && value.currentRevision !== observation.reviewRevision) changed();
      const heading=showHistory(value); setBusy(false); heading.focus();
    } catch (error) { failure(error); }
  }
  function showSourcePage(value) {
    sourcePage=value; editor.showPage(value.section === 'items' ? 'item' : 'package',value.entries); paging.replaceChildren();
    const items = button(label('sourceItems')); const packages = button(label('sourcePackages')); const first = button(label('firstPage'));
    const next = button(label('nextPage'),{ dataset: { publicationUnavailable: String(value.nextAfterEntryId === null) } });
    items.addEventListener('click',() => { void loadSourcePage('items'); });
    packages.addEventListener('click',() => { void loadSourcePage('packages'); });
    first.addEventListener('click',() => { void loadSourcePage(sourcePage.section); });
    next.addEventListener('click',() => { if (sourcePage.nextAfterEntryId) void loadSourcePage(sourcePage.section,sourcePage.nextAfterEntryId); });
    paging.append(items,packages,first,next);
  }
  async function loadSourcePage(section,afterEntryId = null) {
    if (busy || blocked || !current() || !editor || !receipt) return;
    setBusy(true); status.textContent=label('loading');
    try {
      const value = await adapter.loadSourceDetails({ integrationId: selected,revision: receipt.revision,section,afterEntryId });
      if (!current()) return; assertSourcePage(value,receipt); showSourcePage(value); status.textContent=''; setBusy(false);
    } catch (error) { failure(error); }
  }
  async function allBindings(initial) {
    const bindings=[...initial.bindings]; const seen=new Set(bindings.map(bindingKey));
    const sources=new Set(bindings.map((value) => `${value.kind}:${value.sourceId}`)); let cursor=initial.nextAfterBinding;
    while (cursor !== null) {
      if (!current()) return null;
      if (bindings.length>=400) changed();
      const value=await adapter.loadPublicationContext({ integrationId: selected,afterBinding: cursor,
        publicationRevision: initial.publicationRevision });
      if (!current()) return null;
      if (contextBasis(value) !== contextBasis(initial) || value.bindings.length === 0) changed();
      for (const binding of value.bindings) {
        const key=bindingKey(binding); const sourceKey=`${binding.kind}:${binding.sourceId}`;
        if (seen.has(key) || sources.has(sourceKey) || key<=bindingKey(cursor)) changed();
        seen.add(key); sources.add(sourceKey); bindings.push(binding);
      }
      if (bindings.length>400) changed(); cursor=value.nextAfterBinding;
    }
    return bindings;
  }
  async function prepare({ focus = false } = {}) {
    if (busy || !current() || !selected) return;
    clearReview(); setBusy(true); status.textContent=label('loading');
    try {
      const [context,canonical,assignments,locationSnapshot,sourceHistory,reviewHistory] = await Promise.all([
        adapter.loadPublicationContext({ integrationId: selected }),catalogue.loadCatalogue(),adapter.loadAssignments(),
        locations.loadLocations({ schemaVersion: 3 }),adapter.loadSourceHistory({ integrationId: selected }),
        adapter.loadPublicationHistory({ integrationId: selected }),
      ]);
      if (!current()) return;
      if (context.sourceRevision !== sourceHistory.currentRevision || context.configurationRevision !== sourceHistory.configurationRevision
        || context.reviewRevision !== reviewHistory.currentRevision) changed();
      observation=context; showHistory(reviewHistory);
      if (!context.canReview) { status.textContent=label('blocked'); setBusy(false); return; }
      receipt=sourceHistory.revisions.find((entry) => entry.revision === context.sourceRevision); if (!receipt) changed();
      const bindings=await allBindings(context); if (!current() || bindings === null) return;
      const draft=createCateringPublicationReview({ current: context,canonical,assignments,bindings });
      const value=await adapter.loadSourceDetails({ integrationId: selected,revision: receipt.revision,section: 'items' });
      if (!current()) return; assertSourcePage(value,receipt);
      basis.append(el('h3',{ text: label('basis',{ source: formatNumber(context.sourceRevision),catalogue: formatNumber(context.catalogueRevision),
        assignment: formatNumber(context.assignmentRevision),publication: formatNumber(context.publicationRevision) }) }),
      el('p',{ text: receipt.reference }),el('p',{ text: formatDateTime(receipt.recordedAt) }),createCateringSourceTerms(value.terms));
      editor=createCateringPublicationEditor({ draft,locations: locationSnapshot.configuration,createId,
        defaultCurrency: defaultCurrencyFor(canonical.catalogue),prefix: 'catering-publication-review',
        onCancel() { if (!busy && current()) { clearReview(); setBusy(false); status.textContent=''; reload.focus(); } },
        async onSubmit(command) {
          if (busy || blocked || !current()) return;
          setBusy(true); status.textContent=label('saving');
          try {
            const saved=await adapter.reviewCatalogue({ integrationId: selected,command }); if (!current()) return;
            setBusy(false); await prepare();
            if (current() && !blocked && observation?.reviewRevision>=saved.reviewRevision) {
              status.textContent=label('saved',{ revision: formatNumber(saved.reviewRevision) });
            }
          } catch (error) {
            if (!current()) return;
            if (authorityFailureCode(error)) { failure(error); return; }
            if (['HTTP_400','HTTP_413'].includes(error?.code)) {
              status.textContent=label(error.code === 'HTTP_413' ? 'tooLarge' : 'invalidInput'); setBusy(false); return;
            }
            blocked=true; status.textContent=label('writeUncertain'); setBusy(false);
          }
        } });
      editorHost.replaceChildren(editor.root); showSourcePage(value); status.textContent=''; setBusy(false);
      if (focus) editor.focus();
    } catch (error) { failure(error); }
  }
  async function loadConnections(afterIntegrationId = null,{ focus = false } = {}) {
    if (busy || !current()) return;
    clearReview(); selected=null; select.replaceChildren(); setBusy(true); status.textContent=label('loading');
    try {
      const value=await adapter.listSourceConnections({ afterIntegrationId }); if (!current()) return; page=value;
      select.appendChild(el('option',{ value: '',text: sourceLabel('choose') }));
      for (const entry of value.connections) select.appendChild(el('option',{ value: entry.integrationId,
        text: sourceLabel('connectionReference',{ reference: reference(entry.integrationId) }) }));
      select.value=''; status.textContent=sourceLabel(value.connections.length ? 'choose' : 'emptyConnections'); setBusy(false);
      if (focus) select.focus();
    } catch (error) { page=null; failure(error); }
  }
  select.addEventListener('change',() => {
    if (busy || editor) return; selected=select.value || null; clearReview();
    if (selected) void prepare(); else status.textContent=sourceLabel('choose');
  });
  reload.addEventListener('click',() => { if (selected) void prepare({ focus: true }); else void loadConnections(null,{ focus: true }); });
  firstConnections.addEventListener('click',() => { void loadConnections(null,{ focus: true }); });
  nextConnections.addEventListener('click',() => { if (page?.nextAfterIntegrationId) void loadConnections(page.nextAfterIntegrationId,{ focus: true }); });
  await loadConnections();
}
