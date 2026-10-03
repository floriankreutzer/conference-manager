import assert from 'node:assert/strict';
import { beforeEach, test } from 'node:test';

// Minimal connected-DOM double for render/focus ordering. Actual keyboard,
// native validation and 200% zoom remain covered by unchanged browser gates.
class RenderNode {
  constructor(tagName = 'div') {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.dataset = {};
    this.attributes = new Map();
    this.parentNode = null;
    this.connected = true;
    this.focusCount = 0;
  }
  get isConnected() {
    return this.connected && (!this.parentNode || this.parentNode.isConnected);
  }
  append(...children) { children.forEach((child) => this.appendChild(child)); }
  appendChild(child) {
    child.parentNode = this;
    child.connected = true;
    this.children.push(child);
    return child;
  }
  replaceChildren(...children) {
    this.children.forEach((child) => { child.connected = false; child.parentNode = null; });
    this.children = [];
    this.append(...children);
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.get(name) ?? null; }
  addEventListener() {}
  focus() { this.focusCount += 1; document.activeElement = this; }
}

globalThis.document = { documentElement: { lang: 'de', dataset: {} } };
const { createManagerBusinessSettingsApplication } = await import('../src/manager/business-settings-application.js');
let heading;
let frames;

beforeEach(() => {
  globalThis.Node = RenderNode;
  heading = new RenderNode('h1');
  frames = [];
  globalThis.requestAnimationFrame = (callback) => { frames.push(callback); return frames.length; };
  globalThis.document = {
    documentElement: { lang: 'de', dataset: {} },
    activeElement: null,
    createElement: (tagName) => new RenderNode(tagName),
    createTextNode: (value) => Object.assign(new RenderNode('#text'), { textContent: value }),
    getElementById: (id) => id === 'viewTitle' ? heading : null,
  };
});

const locationSnapshot = () => ({ revision: 1, configuration: { sites: [], rooms: [] } });
function fixture(loadLocations = async () => locationSnapshot()) {
  const appRoot = new RenderNode();
  const unexpectedWrite = async () => { assert.fail('Navigation must not write business data'); };
  const application = createManagerBusinessSettingsApplication({
    appRoot,
    setPageHeading: (title) => { heading.textContent = title; },
    locations: { loadLocations, listLocationsHistory: async () => [], saveLocations: unexpectedWrite },
    catalogue: {
      loadCatalogue: async () => ({ revision: 1, catalogue: {
        roomPrices: [], services: [], equipment: [], cateringItems: [], cateringPackages: [],
      } }),
      listCatalogueHistory: async () => ({ revisions: [] }),
      saveCatalogue: unexpectedWrite,
    },
    onAuthorityFailure: (error) => { throw error; },
  });
  return { application, appRoot };
}

test('Manager navigation completes focus before accepting the next field interaction', async () => {
  const { application } = fixture();
  await application.renderManagerSettings({ focusHeading: true });
  assert.equal(document.activeElement, heading);
  assert.equal(heading.focusCount, 1);
  assert.equal(frames.length, 0, 'No deferred heading focus may interrupt the next key');
  const input = new RenderNode('input');
  input.focus();
  frames.forEach((callback) => callback());
  assert.equal(document.activeElement, input);
});

test('Manager initial rendering does not request navigation focus', async () => {
  const { application } = fixture();
  await application.renderManagerSettings();
  assert.equal(heading.focusCount, 0);
  assert.equal(frames.length, 0);
});

for (const state of ['locked', 'detached']) {
  test(`Manager ${state} rendering cannot focus its heading`, async () => {
    let resolveLocations;
    const pendingLocations = new Promise((resolve) => { resolveLocations = resolve; });
    const { application, appRoot } = fixture(() => pendingLocations);
    const render = application.renderManagerSettings({ focusHeading: true });
    if (state === 'locked') document.documentElement.dataset.sessionLocked = 'true';
    else appRoot.connected = false;
    resolveLocations(locationSnapshot());
    await render;
    assert.equal(heading.focusCount, 0);
    assert.equal(frames.length, 0);
  });
}

test('An obsolete Manager render cannot reclaim focus from the current view', async () => {
  let resolveFirst;
  let reads = 0;
  const firstLocations = new Promise((resolve) => { resolveFirst = resolve; });
  const { application } = fixture(() => ++reads === 1 ? firstLocations : Promise.resolve(locationSnapshot()));
  const obsolete = application.renderManagerSettings({ focusHeading: true });
  await application.renderManagerSettings({ focusHeading: true });
  assert.equal(heading.focusCount, 1);
  const input = new RenderNode('input');
  input.focus();
  resolveFirst(locationSnapshot());
  await obsolete;
  assert.equal(document.activeElement, input);
  assert.equal(heading.focusCount, 1);
  assert.equal(frames.length, 0);
});
