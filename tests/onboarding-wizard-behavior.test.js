import assert from 'node:assert/strict';
import test from 'node:test';

class FixtureNode {
  constructor() {
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
}

function dataName(attribute) {
  return attribute.slice(5).replace(/-([a-z])/g, (_match, character) => character.toUpperCase());
}

function matches(element, selector) {
  if (!(element instanceof FixtureElement)) return false;
  if (selector === 'button') return element.tagName === 'BUTTON';
  if (selector === '[data-onboarding-step]') return element.dataset.onboardingStep !== undefined;
  if (selector === 'input[type="checkbox"]:not([disabled])') {
    return element.tagName === 'INPUT' && element.type === 'checkbox' && !element.disabled;
  }
  const attribute = selector.match(/^\[([^=\]]+)(?:="([^"]*)")?\]$/);
  if (attribute) {
    if (attribute[1].startsWith('data-')) {
      const value = element.dataset[dataName(attribute[1])];
      return value !== undefined && (attribute[2] === undefined || value === attribute[2]);
    }
    const value = element.getAttribute(attribute[1]);
    return value !== null && (attribute[2] === undefined || value === attribute[2]);
  }
  return element.tagName === selector.toUpperCase();
}

class FixtureElement extends FixtureNode {
  constructor(tagName, ownerDocument) {
    super();
    this.tagName = tagName.toUpperCase();
    this.ownerDocument = ownerDocument;
    this.attributes = new Map();
    this.dataset = {};
    this.listeners = new Map();
    this.className = '';
    this.id = '';
    this.type = '';
    this.value = '';
    this.disabled = false;
    this.checked = false;
    this._text = '';
  }

  get textContent() {
    return this._text + this.childNodes.map((child) => child.textContent).join('');
  }

  set textContent(value) {
    this.replaceChildren();
    this._text = String(value ?? '');
  }

  get isConnected() {
    let current = this;
    while (current) {
      if (current === this.ownerDocument.body) return true;
      current = current.parentNode;
    }
    return false;
  }

  setAttribute(name, value) {
    const normalized = String(value);
    this.attributes.set(name, normalized);
    if (name === 'id') this.id = normalized;
    if (name === 'type') this.type = normalized;
  }

  getAttribute(name) {
    return this.attributes.has(name) ? this.attributes.get(name) : null;
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

  focus() {
    this.ownerDocument.activeElement = this;
  }

  querySelectorAll(selector) {
    const result = [];
    const visit = (node) => {
      node.childNodes.forEach((child) => {
        if (matches(child, selector)) result.push(child);
        visit(child);
      });
    };
    visit(this);
    return result;
  }

  querySelector(selector) {
    return this.querySelectorAll(selector)[0] || null;
  }
}

class FixtureInput extends FixtureElement {}
class FixtureTextArea extends FixtureElement {}

class FixtureText extends FixtureNode {
  constructor(text) {
    super();
    this.textContent = text;
  }
}

class FixtureDocument {
  constructor() {
    this.body = new FixtureElement('body', this);
    this.documentElement = new FixtureElement('html', this);
    this.activeElement = this.body;
  }

  createElement(tagName) {
    if (tagName === 'input') return new FixtureInput(tagName, this);
    if (tagName === 'textarea') return new FixtureTextArea(tagName, this);
    return new FixtureElement(tagName, this);
  }

  createTextNode(text) {
    return new FixtureText(String(text));
  }

  getElementById(id) {
    return this.body.querySelectorAll(`[id="${id}"]`)[0] || null;
  }

  querySelectorAll(selector) {
    return this.body.querySelectorAll(selector);
  }
}

function installDomFixture() {
  const previous = {
    Node: globalThis.Node,
    HTMLElement: globalThis.HTMLElement,
    HTMLInputElement: globalThis.HTMLInputElement,
    HTMLTextAreaElement: globalThis.HTMLTextAreaElement,
    document: globalThis.document,
    window: globalThis.window,
    location: globalThis.location,
    requestAnimationFrame: globalThis.requestAnimationFrame,
  };
  const document = new FixtureDocument();
  let redirectedTo = null;
  const location = {
    href: 'https://conference.test/',
    origin: 'https://conference.test',
    assign(value) { redirectedTo = value; },
  };
  globalThis.Node = FixtureNode;
  globalThis.HTMLElement = FixtureElement;
  globalThis.HTMLInputElement = FixtureInput;
  globalThis.HTMLTextAreaElement = FixtureTextArea;
  globalThis.document = document;
  globalThis.location = location;
  globalThis.window = { location };
  globalThis.requestAnimationFrame = (callback) => callback();
  const alertRegion = document.createElement('div');
  alertRegion.id = 'alertRegion';
  alertRegion.setAttribute('id', 'alertRegion');
  document.body.appendChild(alertRegion);
  return {
    document,
    redirectedTo: () => redirectedTo,
    restore() {
      Object.entries(previous).forEach(([name, value]) => {
        if (value === undefined) delete globalThis[name];
        else globalThis[name] = value;
      });
    },
  };
}

function readiness(overrides = {}) {
  return {
    ready: false,
    checks: {
      tenantIdentityClaimed: true,
      microsoft365Connected: false,
      placesPermissionGranted: false,
      calendarPermissionGranted: false,
      roomImported: false,
      freeBusyVerified: false,
      directoryEntitled: true,
      calendarEntitled: true,
      ...overrides,
    },
    entitlements: {
      microsoftDirectory: true,
      microsoftCalendar: true,
      microsoftCalendarWrite: false,
    },
  };
}

function elementByText(root, tagName, text) {
  return root.querySelectorAll(tagName).find((element) => element.textContent.includes(text));
}

function deferred() {
  let resolve;
  const promise = new Promise((settle) => { resolve = settle; });
  return { promise, resolve };
}

test('production onboarding explains permissions before consent and maps recoverable provider failures', async () => {
  const fixture = installDomFixture();
  try {
    const { createTenantOnboardingWizard } = await import('../src/tenant-admin/onboarding-wizard.js');
    const root = fixture.document.createElement('div');
    fixture.document.body.appendChild(root);
    const runtime = {
      isDemo: false,
      listSites: async () => [{ id: 'berlin', name: 'Berlin' }],
      getConnection: async () => ({
        state: 'revoked',
        reason: 'provider_authorization_failed',
        permissions: { place: 'missing', calendars: 'missing' },
      }),
      listMappings: async () => [],
      getReadiness: async () => readiness(),
      connect: async () => { throw Object.assign(new Error('blocked'), { serverCode: 'FORBIDDEN' }); },
      disconnect: async () => ({}),
      verify: async () => {
        throw Object.assign(new Error('graph down'), { serverCode: 'MICROSOFT365_CONNECTION_UNAVAILABLE' });
      },
      discoverRooms: async () => [],
      importRooms: async () => {},
      verifyFreeBusy: async () => {},
    };
    await createTenantOnboardingWizard({ runtime }).renderInto(root);

    assert.match(root.textContent, /Place\.Read\.All.*Places-Lesezugriff/);
    assert.match(root.textContent, /Calendars\.ReadBasic\.All.*Kalender-Basislesezugriff/);
    assert.match(root.textContent, /Berechtigung wurde widerrufen/);

    await elementByText(root, 'button', 'Erneut verbinden').dispatch('click');
    assert.match(root.textContent, /mandantenweite Admin-Zustimmung nicht erteilen/);

    await elementByText(root, 'button', 'Verbindung und Berechtigungen prüfen').dispatch('click');
    assert.match(root.textContent, /Microsoft Graph oder die sichere Verbindung ist vorübergehend nicht verfügbar/);
  } finally {
    fixture.restore();
  }
});

test('production onboarding keeps permission rationale visible before a successful consent redirect', async () => {
  const fixture = installDomFixture();
  try {
    const { createTenantOnboardingWizard } = await import('../src/tenant-admin/onboarding-wizard.js');
    const root = fixture.document.createElement('div');
    fixture.document.body.appendChild(root);
    const authorizationUrl = 'https://login.microsoftonline.com/organizations/v2.0/adminconsent?client_id=test';
    const runtime = {
      isDemo: false,
      listSites: async () => [{ id: 'berlin', name: 'Berlin' }],
      getConnection: async () => ({
        state: 'disconnected',
        reason: null,
        permissions: { place: 'unknown', calendars: 'unknown' },
      }),
      listMappings: async () => [],
      getReadiness: async () => readiness(),
      connect: async () => ({ authorizationUrl }),
      disconnect: async () => ({}),
      verify: async () => ({}),
      discoverRooms: async () => [],
      importRooms: async () => {},
      verifyFreeBusy: async () => {},
    };
    await createTenantOnboardingWizard({ runtime }).renderInto(root);
    assert.match(root.textContent, /Place\.Read\.All.*Places-Lesezugriff/);
    await elementByText(root, 'button', 'Microsoft 365 verbinden').dispatch('click');
    assert.equal(fixture.redirectedTo(), authorizationUrl);
  } finally {
    fixture.restore();
  }
});

test('production onboarding load failure exposes session recovery without reflecting server details', async () => {
  const fixture = installDomFixture();
  try {
    const { createTenantOnboardingWizard } = await import('../src/tenant-admin/onboarding-wizard.js');
    const root = fixture.document.createElement('div');
    fixture.document.body.appendChild(root);
    const secret = 'provider-secret-detail';
    const sessionError = Object.assign(new Error(secret), { code: 'HTTP_401' });
    const runtime = {
      listSites: async () => { throw sessionError; },
      getConnection: async () => ({}),
      listMappings: async () => [],
      getReadiness: async () => readiness(),
      disconnect: async () => ({}),
      verifyFreeBusy: async () => ({}),
    };
    await createTenantOnboardingWizard({ runtime }).renderInto(root);
    assert.match(root.textContent, /sichere Sitzung ist abgelaufen oder wurde widerrufen/);
    assert.doesNotMatch(root.textContent, new RegExp(secret));
  } finally {
    fixture.restore();
  }
});

test('production onboarding links validation guidance and focuses site, room and capacity failures', async () => {
  const fixture = installDomFixture();
  try {
    const { createTenantOnboardingWizard } = await import('../src/tenant-admin/onboarding-wizard.js');
    const root = fixture.document.createElement('div');
    fixture.document.body.appendChild(root);
    const runtime = {
      isDemo: false,
      listSites: async () => [{ id: 'berlin', name: 'Berlin' }],
      getConnection: async () => ({
        state: 'connected',
        reason: null,
        permissions: { place: 'granted', calendars: 'granted' },
      }),
      listMappings: async () => [],
      getReadiness: async () => readiness({
        microsoft365Connected: true,
        placesPermissionGranted: true,
        calendarPermissionGranted: true,
      }),
      connect: async () => ({}),
      disconnect: async () => ({}),
      verify: async () => ({}),
      discoverRooms: async () => [{
        id: 'provider-room-1',
        name: 'Raum 1',
        capacity: 8,
        building: 'Haus A',
        floorLabel: '1',
        address: 'Berlin',
      }],
      importRooms: async () => {},
      verifyFreeBusy: async () => {},
    };
    await createTenantOnboardingWizard({ runtime }).renderInto(root);
    await elementByText(root, 'button', 'Räume aus Microsoft 365 laden').dispatch('click');

    const site = root.querySelector('select');
    const checkbox = root.querySelector('input[type="checkbox"]:not([disabled])');
    const capacity = root.querySelectorAll('input').find((input) => input.type === 'number');
    const roomList = root.querySelector('fieldset');
    const importButton = elementByText(root, 'button', 'Ausgewählte Räume importieren');

    site.value = '';
    await site.dispatch('change');
    await importButton.dispatch('click');
    assert.equal(site.getAttribute('aria-invalid'), 'true');
    assert.equal(site.getAttribute('aria-describedby'), 'onboarding-import-message');
    assert.equal(fixture.document.activeElement, site);

    site.value = 'berlin';
    await site.dispatch('change');
    checkbox.checked = false;
    await checkbox.dispatch('change');
    await importButton.dispatch('click');
    assert.equal(roomList.getAttribute('aria-invalid'), 'true');
    assert.equal(roomList.getAttribute('aria-describedby'), 'onboarding-import-message');
    assert.equal(fixture.document.activeElement, checkbox);

    checkbox.checked = true;
    await checkbox.dispatch('change');
    capacity.value = '0';
    await capacity.dispatch('input');
    await importButton.dispatch('click');
    assert.equal(capacity.getAttribute('aria-invalid'), 'true');
    assert.equal(capacity.getAttribute('aria-describedby'), 'onboarding-import-message');
    assert.equal(fixture.document.activeElement, capacity);
  } finally {
    fixture.restore();
  }
});

test('production onboarding serializes mutations across every step card', async () => {
  const fixture = installDomFixture();
  try {
    const { createTenantOnboardingWizard } = await import('../src/tenant-admin/onboarding-wizard.js');
    const root = fixture.document.createElement('div');
    fixture.document.body.appendChild(root);
    const verification = deferred();
    let disconnectCalls = 0;
    const runtime = {
      isDemo: false,
      listSites: async () => [{ id: 'berlin', name: 'Berlin' }],
      getConnection: async () => ({
        state: 'connected',
        reason: null,
        permissions: { place: 'granted', calendars: 'granted' },
      }),
      listMappings: async () => [],
      getReadiness: async () => readiness({
        microsoft365Connected: true,
        placesPermissionGranted: true,
        calendarPermissionGranted: true,
      }),
      connect: async () => ({}),
      disconnect: async () => { disconnectCalls += 1; },
      verify: async () => verification.promise,
      discoverRooms: async () => [],
      importRooms: async () => {},
      verifyFreeBusy: async () => {},
    };
    await createTenantOnboardingWizard({ runtime }).renderInto(root);

    const verify = elementByText(root, 'button', 'Verbindung und Berechtigungen prüfen');
    const disconnect = elementByText(root, 'button', 'Microsoft 365 trennen');
    const pendingVerification = verify.dispatch('click');
    await Promise.resolve();

    assert.equal(root.querySelectorAll('[data-onboarding-mutation]').every((control) => control.disabled), true);
    await disconnect.dispatch('click');
    assert.equal(disconnectCalls, 0);

    verification.resolve({});
    await pendingVerification;
    assert.equal(disconnectCalls, 0);
    assert.equal(elementByText(root, 'button', 'Microsoft 365 trennen').disabled, false);
  } finally {
    fixture.restore();
  }
});
