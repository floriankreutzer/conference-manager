import assert from 'node:assert/strict';
import test from 'node:test';

class FixtureNode {
  constructor(ownerDocument = null) {
    this.ownerDocument = ownerDocument;
    this.parentNode = null;
    this.childNodes = [];
  }

  append(...children) {
    children.forEach((child) => this.appendChild(child));
  }

  appendChild(child) {
    child.parentNode = this;
    this.childNodes.push(child);
    return child;
  }

  replaceChildren(...children) {
    this.childNodes.forEach((child) => { child.parentNode = null; });
    this.childNodes = [];
    this.append(...children);
  }

  remove() {
    if (!this.parentNode) return;
    const index = this.parentNode.childNodes.indexOf(this);
    if (index >= 0) this.parentNode.childNodes.splice(index, 1);
    this.parentNode = null;
  }

  contains(target) {
    return this === target || this.childNodes.some((child) => child.contains(target));
  }

  querySelectorAll(selector) {
    const tags = selector.split(',').map((tag) => tag.trim().toUpperCase());
    const matches = [];
    const visit = (node) => node.childNodes.forEach((child) => {
      if (tags.includes(child.tagName)) matches.push(child);
      visit(child);
    });
    visit(this);
    return matches;
  }
}

class FixtureText extends FixtureNode {
  constructor(text, ownerDocument) {
    super(ownerDocument);
    this.textContent = text;
  }
}

class FixtureElement extends FixtureNode {
  constructor(tagName, ownerDocument) {
    super(ownerDocument);
    this.tagName = tagName.toUpperCase();
    this.attributes = new Map();
    this.dataset = {};
    this.listeners = new Map();
    this.className = '';
    this.id = '';
    this.type = '';
    this.value = '';
    this.name = '';
    this.disabled = false;
    this.checked = false;
    this.hidden = false;
    this.href = '';
    this.download = '';
    this._text = '';
  }

  get textContent() {
    return this._text + this.childNodes.map((child) => child.textContent).join('');
  }

  set textContent(value) {
    this.replaceChildren();
    this._text = String(value ?? '');
  }

  setAttribute(name, value) {
    this.attributes.set(name, String(value));
  }

  hasAttribute(name) {
    return this.attributes.has(name);
  }

  removeAttribute(name) {
    this.attributes.delete(name);
  }

  addEventListener(type, listener) {
    const listeners = this.listeners.get(type) || [];
    listeners.push(listener);
    this.listeners.set(type, listeners);
  }

  async dispatch(type) {
    for (const listener of this.listeners.get(type) || []) {
      await listener({ currentTarget: this, target: this, preventDefault() {} });
    }
  }

  click() {
    this.ownerDocument.downloads.push({
      connected: this.parentNode === this.ownerDocument.body,
      download: this.download,
      href: this.href,
    });
  }
}

class FixtureInput extends FixtureElement {}
class FixtureTextArea extends FixtureElement {}

class FixtureDocument {
  constructor() {
    this.documentElement = { lang: '', dataset: {} };
    this.downloads = [];
    this.body = new FixtureElement('body', this);
    this.activeElement = this.body;
  }

  createElement(tagName) {
    if (tagName === 'input') return new FixtureInput(tagName, this);
    if (tagName === 'textarea') return new FixtureTextArea(tagName, this);
    return new FixtureElement(tagName, this);
  }

  createTextNode(text) {
    return new FixtureText(String(text), this);
  }

  getElementById() {
    return null;
  }
}

function elementsByTag(root, tagName) {
  const result = [];
  const visit = (node) => {
    node.childNodes.forEach((child) => {
      if (child.tagName === tagName.toUpperCase()) result.push(child);
      visit(child);
    });
  };
  visit(root);
  return result;
}

function installDownloadFixture(context) {
  const previous = {
    HTMLInputElement: globalThis.HTMLInputElement,
    HTMLTextAreaElement: globalThis.HTMLTextAreaElement,
    Node: globalThis.Node,
    document: globalThis.document,
    localStorage: globalThis.localStorage,
    window: globalThis.window,
  };
  const originalCreateObjectURL = URL.createObjectURL;
  const originalRevokeObjectURL = URL.revokeObjectURL;
  const document = new FixtureDocument();
  const created = [];
  const revoked = [];
  const cleanups = new Map();

  globalThis.Node = FixtureNode;
  globalThis.HTMLInputElement = FixtureInput;
  globalThis.HTMLTextAreaElement = FixtureTextArea;
  globalThis.document = document;
  globalThis.localStorage = { getItem: () => null, setItem() {} };
  globalThis.window = {
    location: { href: 'https://conference.test/', origin: 'https://conference.test' },
  };
  URL.createObjectURL = (blob) => {
    created.push(blob);
    const url = `blob:https://conference.test/download-${created.length}`;
    cleanups.set(url, deferred());
    return url;
  };
  URL.revokeObjectURL = (url) => { revoked.push(url); cleanups.get(url)?.resolve(); };

  context.after(async () => {
    await Promise.all(Array.from(cleanups.values(), (entry) => entry.promise));
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    Object.entries(previous).forEach(([name, value]) => {
      if (value === undefined) delete globalThis[name];
      else globalThis[name] = value;
    });
  });
  return { document, created, revoked };
}

function deferred() {
  let resolve;
  const promise = new Promise((settle) => { resolve = settle; });
  return { promise, resolve };
}

test('template and export buttons download trusted CSV blobs and revoke their object URLs', async (context) => {
  const { document, created, revoked } = installDownloadFixture(context);

  const { createBulkTransferPanel } = await import(
    '../src/shared/tenant-bulk-transfer-panel.js?trusted-download-regression'
  );
  const templateDocument = { schemaVersion: 1, type: 'sites', rows: [] };
  const exportDocument = {
    schemaVersion: 1,
    type: 'sites',
    rows: [{ id: 'site-a', name: 'Site A' }],
  };
  let downloadType = null;
  let releaseSuppressedTemplate = () => {};
  let suppressTemplate = false;
  const adapter = {
    async loadBulkTemplate() {
      if (suppressTemplate) {
        await new Promise((resolve) => { releaseSuppressedTemplate = resolve; });
      }
      return templateDocument;
    },
    async exportBulk() {
      downloadType.value = 'rooms';
      return { revision: 7, document: exportDocument };
    },
    async validateBulk() { throw new Error('UNEXPECTED_VALIDATE'); },
    async applyBulk() { throw new Error('UNEXPECTED_APPLY'); },
  };
  let downloadCurrent = true;
  const panel = createBulkTransferPanel({
    adapter,
    types: ['sites', 'rooms'],
    rerender() {},
    isCurrent: () => downloadCurrent,
  });
  downloadType = elementsByTag(panel, 'select')[0];
  downloadType.value = 'sites';
  const [templateButton, exportButton] = elementsByTag(panel, 'button');

  await templateButton.dispatch('click');
  await exportButton.dispatch('click');

  assert.deepEqual(document.downloads, [
    {
      connected: true,
      download: 'sites-template.csv',
      href: 'blob:https://conference.test/download-1',
    },
    {
      connected: true,
      download: 'sites-revision-7.csv',
      href: 'blob:https://conference.test/download-2',
    },
  ]);
  assert.equal(document.body.childNodes.length, 0);
  assert.equal(created.length, 2);
  assert.equal(await created[0].text(), '"id","name","active","timeZone","address"\r\n');
  assert.equal(await created[1].text(),
    '"id","name","active","timeZone","address"\r\n"site-a","Site A","","",""\r\n');

  await new Promise((resolve) => { setTimeout(resolve, 5); });
  assert.deepEqual(revoked, [
    'blob:https://conference.test/download-1',
    'blob:https://conference.test/download-2',
  ]);

  suppressTemplate = true;
  downloadType.value = 'sites';
  const suppressedDownload = templateButton.dispatch('click');
  await new Promise((resolve) => { setTimeout(resolve, 0); });
  downloadCurrent = false;
  releaseSuppressedTemplate();
  await suppressedDownload;
  assert.equal(document.downloads.length, 2);
  downloadCurrent = true;
  suppressTemplate = false;
  adapter.loadBulkTemplate = async () => { throw new Error('download failed'); };
  await templateButton.dispatch('click');
  assert.equal(templateButton.disabled, false);
  assert.equal(elementsByTag(panel, 'p').at(-1).textContent, 'Die CSV-Datei konnte nicht sicher heruntergeladen werden.');

  const validations = [];
  const applications = [];
  const applyGate = deferred();
  let rerenders = 0;
  const raceAdapter = {
    async loadBulkTemplate() { throw new Error('UNEXPECTED_TEMPLATE'); },
    async exportBulk() { throw new Error('UNEXPECTED_EXPORT'); },
    async validateBulk(selectedType, value) {
      const gate = deferred();
      validations.push({ selectedType, value, gate });
      return gate.promise;
    },
    async applyBulk(selectedType, value, receiptId) {
      applications.push({ selectedType, value, receiptId });
      await applyGate.promise;
    },
  };
  const racePanel = createBulkTransferPanel({
    adapter: raceAdapter,
    types: ['sites', 'rooms'],
    rerender() { rerenders += 1; },
    isCurrent: () => true,
  });
  const raceType = elementsByTag(racePanel, 'select')[0];
  const raceFile = elementsByTag(racePanel, 'input')[0];
  const [, , validate, apply] = elementsByTag(racePanel, 'button');
  const sitesDocument = { schemaVersion: 1, type: 'sites', rows: [] };
  const roomsDocument = { schemaVersion: 1, type: 'rooms', rows: [] };
  const sitesFile = { size: 20, async arrayBuffer() { return new TextEncoder().encode('"id"\r\n').buffer; } };
  const roomsFile = { size: 20, async arrayBuffer() { return new TextEncoder().encode('"id"\r\n').buffer; } };

  raceType.value = 'sites';
  raceFile.files = [sitesFile];
  const firstValidation = validate.dispatch('click');
  await new Promise((resolve) => { setTimeout(resolve, 0); });
  assert.equal(validations.length, 1);

  raceType.value = 'rooms';
  await raceType.dispatch('change');
  raceFile.files = [roomsFile];
  await raceFile.dispatch('change');
  const secondValidation = validate.dispatch('click');
  await new Promise((resolve) => { setTimeout(resolve, 0); });
  assert.equal(validations.length, 2);

  validations[1].gate.resolve({
    valid: true,
    changed: true,
    errors: [],
    receipt: { id: 'rooms-receipt' },
  });
  await secondValidation;
  assert.equal(apply.disabled, false);
  validations[0].gate.resolve({
    valid: true,
    changed: true,
    errors: [],
    receipt: { id: 'stale-sites-receipt' },
  });
  await firstValidation;
  assert.equal(apply.disabled, false);

  const application = apply.dispatch('click');
  assert.equal(validate.disabled, true);
  await validate.dispatch('click');
  assert.equal(validations.length, 2);
  assert.deepEqual(applications, [{
    selectedType: 'rooms',
    value: roomsDocument,
    receiptId: 'rooms-receipt',
  }]);
  applyGate.resolve();
  await application;
  assert.equal(rerenders, 1);
  assert.equal(validate.disabled, false);
  assert.equal(apply.disabled, true);
});

async function managerBulkFixture(context, overrides) {
  const { document } = installDownloadFixture(context);
  const { createBulkTransferPanel } = await import('../src/shared/tenant-bulk-transfer-panel.js');
  const { createManagerSettingsEditor } = await import('../src/manager/settings-editor-lifecycle.js');
  const root = document.createElement('section');
  const form = document.createElement('form');
  const price = document.createElement('input');
  price.value = '10';
  const limit = document.createElement('button');
  limit.disabled = true;
  form.append(price, limit);
  root.append(form);
  document.body.append(root);
  let current = true;
  let navigation;
  const isCurrent = () => current && root.parentNode === document.body
    && document.documentElement.dataset.sessionLocked !== 'true';
  const editor = createManagerSettingsEditor({ form, interactionRoot: root, isCurrent,
    registerEditor: (value) => { navigation = value; } });
  const applications = [];
  const panel = createBulkTransferPanel({
    adapter: {
      async loadBulkTemplate() { return { schemaVersion: 1, type: 'rooms', rows: [] }; },
      async exportBulk() { return { revision: 7, document: { schemaVersion: 1, type: 'rooms', rows: [] } }; },
      async validateBulk() { throw new Error('UNEXPECTED_VALIDATE'); },
      async applyBulk(type, value, receiptId) { applications.push({ type, value, receiptId }); },
      ...overrides,
    },
    types: ['rooms'], rerender() {}, isCurrent,
    setControlDisabled: editor.setControlDisabled,
  });
  root.append(panel);
  elementsByTag(panel, 'select')[0].value = 'rooms';
  const file = elementsByTag(panel, 'input')[0];
  file.files = [{ size: 6, async arrayBuffer() { return new TextEncoder().encode('"id"\r\n').buffer; } }];
  const [template, exportButton, validate, apply] = elementsByTag(panel, 'button');
  return { document, root, form, price, limit, editor, navigation, applications,
    template, exportButton, validate, apply, revoke: () => { current = false; } };
}

for (const method of ['loadBulkTemplate', 'exportBulk']) {
  for (const first of ['download', 'mutation']) {
    test(`CO-306 ${method} stays usable when ${first} completes first`, async (context) => {
      const started = deferred(), completed = deferred();
      let requests = 0;
      const value = { schemaVersion: 1, type: 'rooms', rows: [] };
      const fixture = await managerBulkFixture(context, {
        async [method]() {
          requests += 1;
          if (requests === 1) { started.resolve(); await completed.promise; }
          return method === 'loadBulkTemplate' ? value : { revision: 7, document: value };
        },
      });
      const control = method === 'loadBulkTemplate' ? fixture.template : fixture.exportButton;
      const download = control.dispatch('click');
      await started.promise;
      assert.equal(control.disabled, true);
      const mutation = fixture.editor.beginMutation();
      assert.ok(mutation);
      let duringMutation;
      if (first === 'download') {
        completed.resolve(); await download;
        duringMutation = control.disabled;
        mutation.finish();
      } else {
        mutation.finish();
        assert.equal(control.disabled, true, 'The independent download is still pending');
        completed.resolve(); await download;
      }
      assert.equal(control.disabled, false, 'A completed download remains usable after the save');
      if (first === 'download') assert.equal(duringMutation, true, 'The save still blocks interaction');
      assert.equal(fixture.price.disabled, false);
      assert.equal(fixture.limit.disabled, true, 'A pre-existing business restriction survives');
      assert.equal(fixture.apply.disabled, true, 'No CSV has been validated');
      assert.equal(fixture.navigation.read(), false);
      await control.dispatch('click');
      assert.equal(requests, 2, 'The same download action works again without navigation');
      assert.equal(fixture.document.downloads.length, 2);
      assert.ok(fixture.document.downloads.every((entry) => entry.connected
        && entry.download === (method === 'loadBulkTemplate' ? 'rooms-template.csv' : 'rooms-revision-7.csv')));
    });
  }
}

for (const valid of [true, false]) {
  for (const first of ['validation', 'mutation']) {
    test(`CO-306 ${valid ? 'valid' : 'invalid'} CSV keeps its result when ${first} completes first`, async (context) => {
      const started = deferred(), completed = deferred();
      const fixture = await managerBulkFixture(context, {
        async validateBulk() { started.resolve(); return completed.promise; },
      });
      const validation = fixture.validate.dispatch('click');
      await started.promise;
      const mutation = fixture.editor.beginMutation();
      assert.ok(mutation);
      const result = { valid, changed: valid, errors: [], receipt: valid ? { id: 'rooms-receipt' } : null };
      let duringMutation;
      if (first === 'validation') {
        completed.resolve(result); await validation;
        duringMutation = fixture.apply.disabled;
        mutation.finish();
      } else {
        mutation.finish();
        assert.equal(fixture.apply.disabled, true, 'Validation has not supplied a usable receipt');
        completed.resolve(result); await validation;
      }
      assert.equal(fixture.apply.disabled, !valid, 'The current validation owns Apply eligibility');
      if (first === 'validation') assert.equal(duringMutation, true, 'Validation cannot unlock a pending save');
      assert.equal(fixture.price.disabled, false);
      assert.equal(fixture.limit.disabled, true);
      if (valid) {
        await fixture.apply.dispatch('click');
        assert.deepEqual(fixture.applications, [{ type: 'rooms',
          value: { schemaVersion: 1, type: 'rooms', rows: [] }, receiptId: 'rooms-receipt' }]);
        assert.equal(fixture.validate.disabled, false);
        assert.equal(fixture.apply.disabled, true, 'A consumed receipt cannot be applied twice');
      } else assert.deepEqual(fixture.applications, []);
    });
  }
}

for (const invalidation of ['context', 'detached', 'session-lock']) {
  test(`CO-306 ${invalidation} prevents late CSV work and save completion from unlocking stale controls`, async (context) => {
    const downloadStarted = deferred(), downloadCompleted = deferred();
    const validationStarted = deferred(), validationCompleted = deferred();
    const fixture = await managerBulkFixture(context, {
      async loadBulkTemplate() { downloadStarted.resolve(); return downloadCompleted.promise; },
      async validateBulk() { validationStarted.resolve(); return validationCompleted.promise; },
    });
    const download = fixture.template.dispatch('click');
    const validation = fixture.validate.dispatch('click');
    await Promise.all([downloadStarted.promise, validationStarted.promise]);
    const mutation = fixture.editor.beginMutation();
    assert.ok(mutation);
    if (invalidation === 'context') fixture.revoke();
    else if (invalidation === 'detached') fixture.root.remove();
    else fixture.document.documentElement.dataset.sessionLocked = 'true';
    downloadCompleted.resolve({ schemaVersion: 1, type: 'rooms', rows: [] });
    validationCompleted.resolve({ valid: true, changed: true, errors: [], receipt: { id: 'stale' } });
    await Promise.all([download, validation]);
    mutation.finish();
    assert.ok(fixture.root.querySelectorAll('input, select, textarea, button').every((control) => control.disabled));
    assert.deepEqual(fixture.document.downloads, []);
    assert.deepEqual(fixture.applications, []);
    assert.equal(fixture.editor.beginMutation(), null);
  });
}
