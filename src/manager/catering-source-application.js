import { createCateringSourceTerms,createCateringSourceProduct } from './catering-source-presentation.js';
import { createCateringSourceEditor } from './catering-source-editor.js';
import { formatDateTime, formatNumber, t } from '../core/i18n.js';
import { button, el, field } from '../core/ui.js';
import { authorityFailureCode } from '../shared/authority-failure.js';

const KEY = 'cateringSource';
const label = (suffix, values) => t(`${KEY}.${suffix}`,values);
const reference = (id) => `${id.slice(0,8)}…${id.slice(-8)}`;

export async function renderCateringProviderCatalogues({ root,adapter,isCurrent,onAuthorityFailure }) {
  const panel = el('section',{ className: 'card',dataset: { cateringSources: 'true' } });
  const status = el('p',{ attrs: { role: 'status','aria-live': 'polite' } });
  const reload = button(label('reload'));
  const firstConnections = button(label('firstConnections')); const nextConnections = button(label('nextConnections'));
  const select = el('select');
  const history = el('section'); const details = el('section'); const editorHost = el('section');
  let editor = null; let writeBlocked = false;
  panel.append(el('p',{ text: label('description') }),el('p',{ className: 'field-hint',text: label('pending') }),
    field({ id: 'catering-source-connection',label: label('connection'),control: select }),
    el('div',{ className: 'button-row' },[firstConnections,nextConnections,reload]),status,history,editorHost,details);
  root.appendChild(panel);
  let busy = false; let connectionPage = null; let selected = null; let snapshot = null;
  const current = () => isCurrent() && panel.isConnected;
  function setBusy(value) {
    busy = value; panel.setAttribute('aria-busy',String(value));
    for (const control of panel.querySelectorAll('button,select')) {
      control.disabled = value || control.dataset.sourceUnavailable === 'true'
        || (editor !== null && !editor.root.contains(control) && !(control === reload && writeBlocked));
    }
    if (editor) editor.fields.disabled = value || writeBlocked;
    firstConnections.disabled = value || editor !== null || connectionPage === null;
    nextConnections.disabled = value || editor !== null || !connectionPage?.nextAfterIntegrationId;
    select.disabled = value || editor !== null || !connectionPage?.connections.length;
  }
  function failure(error) {
    if (!current()) return;
    if (authorityFailureCode(error)) { onAuthorityFailure(error); return; }
    snapshot = null; history.replaceChildren(); details.replaceChildren();
    status.textContent = label('error'); setBusy(false);
  }
  async function loadDetail(revision,section = 'items',afterEntryId = null) {
    if (busy || !current() || !selected || !snapshot) return;
    setBusy(true); status.textContent = label('loading'); details.replaceChildren();
    try {
      const value = await adapter.loadSourceDetails({ integrationId: selected,revision,section,afterEntryId });
      if (!current()) return;
      const expected = snapshot.revisions.find((entry) => entry.revision === revision);
      if (!expected || value.configurationRevision !== expected.configurationRevision || value.reference !== expected.reference
        || value.recordedAt !== expected.recordedAt || value.sourceVersion !== expected.summary.sourceVersion
        || value.itemCount !== expected.summary.itemCount || value.packageCount !== expected.summary.packageCount
        || JSON.stringify(value.terms) !== JSON.stringify(expected.summary.terms)) {
        throw new Error('CATERING_SOURCE_SNAPSHOT_CHANGED');
      }
      const heading = el('h3',{ text: label('revision',{ revision: formatNumber(value.revision) }),attrs: { tabindex: '-1' } });
      details.append(heading,el('p',{ text: value.reference }),el('p',{ text: formatDateTime(value.recordedAt) }),
        el('p',{ text: label('pending') }),createCateringSourceTerms(value.terms));
      const items = button(label('items')); const packages = button(label('packages')); const first = button(label('firstEntries'));
      const next = button(label('nextEntries'),{ dataset: { sourceUnavailable: String(value.nextAfterEntryId === null) } });
      items.addEventListener('click',() => { void loadDetail(revision,'items'); });
      packages.addEventListener('click',() => { void loadDetail(revision,'packages'); });
      first.addEventListener('click',() => { void loadDetail(revision,section); });
      next.addEventListener('click',() => { if (value.nextAfterEntryId) void loadDetail(revision,section,value.nextAfterEntryId); });
      details.append(el('div',{ className: 'button-row' },[items,packages,first,next]),el('h4',{ text: label(section) }));
      for (const entry of value.entries) details.appendChild(createCateringSourceProduct(entry));
      if (!value.entries.length) details.appendChild(el('p',{ text: label('emptyEntries') }));
      status.textContent = label('detailLoaded'); setBusy(false); next.disabled = value.nextAfterEntryId === null; heading.focus();
    } catch (error) { failure(error); }
  }
  function beginReceipt() {
    if (busy || !current() || !snapshot?.canReceive || editor !== null) return;
    details.replaceChildren();
    editor = createCateringSourceEditor({ prefix: 'catering-source-receipt',
      onCancel() { editorHost.replaceChildren(); editor = null; writeBlocked = false; setBusy(false); reload.focus(); },
      async onSubmit(intent) {
        if (busy || writeBlocked || !current() || !snapshot?.canReceive) return;
        let command;
        try { command = adapter.validateSourceReceipt({ schemaVersion: 1,commandId: globalThis.crypto.randomUUID(),
          expectedRevision: snapshot.currentRevision,expectedConfigurationRevision: snapshot.configurationRevision,...intent }); }
        catch { editor.report('invalidInput'); return; }
        setBusy(true); status.textContent = label('recording');
        try {
          const saved = await adapter.receiveSource({ integrationId: selected,command }); if (!current()) return;
          editorHost.replaceChildren(); editor = null; writeBlocked = false; setBusy(false);
          await loadHistory(null,{ focus: true });
          if (current() && snapshot?.currentRevision >= saved.revision) status.textContent = label('recorded',{ revision: formatNumber(saved.revision) });
        } catch (error) {
          if (!current()) return;
          if (authorityFailureCode(error)) { onAuthorityFailure(error); return; }
          if (['HTTP_400','HTTP_413'].includes(error?.code)) {
            const message = error.code === 'HTTP_413' ? 'tooLarge' : 'invalidInput';
            editor.report(message); status.textContent = label(message); setBusy(false); return;
          }
          writeBlocked = true; editor.report('writeUncertain'); status.textContent = label('writeUncertain'); setBusy(false);
        }
      } });
    editorHost.replaceChildren(editor.root); setBusy(false); editor.focus();
  }
  async function loadHistory(beforeRevision = null,{ focus = false } = {}) {
    if (busy || !current() || !selected) return;
    editorHost.replaceChildren(); editor = null; writeBlocked = false;
    setBusy(true); status.textContent = label('loading'); history.replaceChildren(); details.replaceChildren(); snapshot = null;
    try {
      const value = await adapter.loadSourceHistory({ integrationId: selected,beforeRevision });
      if (!current()) return; snapshot = value;
      const heading = el('h3',{ text: label('history'),attrs: { tabindex: '-1' } });
      history.append(heading,el('p',{ text: label(value.canReceive ? 'manualEnabled' : 'manualDisabled') }));
      if (value.canReceive && typeof adapter.validateSourceReceipt === 'function' && typeof adapter.receiveSource === 'function') {
        const record = button(label('recordTitle')); record.addEventListener('click',beginReceipt); history.appendChild(record);
      }
      for (const entry of value.revisions) {
        const open = button(label('open',{ revision: formatNumber(entry.revision) }));
        open.addEventListener('click',() => { void loadDetail(entry.revision); });
        history.appendChild(el('section',{ className: 'card' },[
          el('h4',{ text: label('revision',{ revision: formatNumber(entry.revision) }) }),el('p',{ text: entry.reference }),
          el('p',{ text: formatDateTime(entry.recordedAt) }),el('p',{ text: label('counts',{
            items: formatNumber(entry.summary.itemCount),packages: formatNumber(entry.summary.packageCount) }) }),open,
        ]));
      }
      if (!value.revisions.length) history.appendChild(el('p',{ text: label('emptyHistory') }));
      const first = button(label('firstHistory'));
      const next = button(label('nextHistory'),{ dataset: { sourceUnavailable: String(value.nextBeforeRevision === null) } });
      first.addEventListener('click',() => { void loadHistory(null,{ focus: true }); });
      next.addEventListener('click',() => { if (value.nextBeforeRevision) void loadHistory(value.nextBeforeRevision,{ focus: true }); });
      history.appendChild(el('div',{ className: 'button-row' },[first,next]));
      status.textContent = label('historyLoaded'); setBusy(false); next.disabled = value.nextBeforeRevision === null;
      if (focus) heading.focus();
    } catch (error) { failure(error); }
  }
  async function loadConnections(afterIntegrationId = null,{ focus = false } = {}) {
    if (busy || !current()) return;
    setBusy(true); status.textContent = label('loading'); snapshot = null; selected = null;
    history.replaceChildren(); details.replaceChildren(); select.replaceChildren();
    try {
      const value = await adapter.listSourceConnections({ afterIntegrationId }); if (!current()) return; connectionPage = value;
      select.appendChild(el('option',{ value: '',text: label('choose') }));
      for (const entry of value.connections) select.appendChild(el('option',{ value: entry.integrationId,
        text: label('connectionReference',{ reference: reference(entry.integrationId) }) }));
      select.value = ''; status.textContent = label(value.connections.length ? 'choose' : 'emptyConnections'); setBusy(false);
      if (focus) select.focus();
    } catch (error) { connectionPage = null; failure(error); }
  }
  select.addEventListener('change',() => {
    selected = select.value || null; snapshot = null; history.replaceChildren(); details.replaceChildren();
    if (selected) void loadHistory(); else status.textContent = label('choose');
  });
  firstConnections.addEventListener('click',() => { void loadConnections(null,{ focus: true }); });
  nextConnections.addEventListener('click',() => { if (connectionPage?.nextAfterIntegrationId) {
    void loadConnections(connectionPage.nextAfterIntegrationId,{ focus: true });
  } });
  reload.addEventListener('click',() => { if (selected) void loadHistory(null,{ focus: true }); else void loadConnections(null,{ focus: true }); });
  await loadConnections();
}
