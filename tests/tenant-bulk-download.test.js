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
    this.documentElement = { lang: '' };
    this.downloads = [];
    this.body = new FixtureElement('body', this);
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

test('template and export buttons download trusted JSON blobs and revoke their object URLs', async (context) => {
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
    return `blob:https://conference.test/download-${created.length}`;
  };
  URL.revokeObjectURL = (url) => { revoked.push(url); };

  context.after(() => {
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    Object.entries(previous).forEach(([name, value]) => {
      if (value === undefined) delete globalThis[name];
      else globalThis[name] = value;
    });
  });

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
      download: 'sites-template.json',
      href: 'blob:https://conference.test/download-1',
    },
    {
      connected: true,
      download: 'sites-revision-7.json',
      href: 'blob:https://conference.test/download-2',
    },
  ]);
  assert.equal(document.body.childNodes.length, 0);
  assert.equal(created.length, 2);
  assert.equal(await created[0].text(), `${JSON.stringify(templateDocument, null, 2)}\n`);
  assert.equal(await created[1].text(), `${JSON.stringify(exportDocument, null, 2)}\n`);

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
  assert.equal(elementsByTag(panel, 'p').at(-1).textContent, 'Die JSON-Datei konnte nicht sicher heruntergeladen werden.');

  const deferred = () => {
    let resolve;
    const promise = new Promise((settle) => { resolve = settle; });
    return { promise, resolve };
  };
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
  const sitesFile = { size: 20, async text() { return JSON.stringify(sitesDocument); } };
  const roomsFile = { size: 20, async text() { return JSON.stringify(roomsDocument); } };

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
