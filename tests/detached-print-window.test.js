import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DETACHED_PRINT_CSP,
  detachedPrintStylesReady,
  waitForDetachedPrintDocument,
  closeDetachedPrintWindow,
  closeDetachedPrintWindows,
  initializeDetachedPrintDocument,
  openDetachedPrintWindow,
  registerDetachedPrintWindow,
} from '../src/shared/detached-print-window.js';

class FakeElement {
  constructor(tagName) {
    this.tagName = tagName.toUpperCase();
    this.attributes = new Map();
    this.children = [];
    this.textContent = '';
  }

  addEventListener() {}

  append(...children) { this.children.push(...children); }

  replaceChildren(...children) { this.children = children; }

  setAttribute(name, value) { this.attributes.set(name, String(value)); }

  getAttribute(name) { return this.attributes.get(name) ?? null; }
}

function fakeDocument() {
  const document = {
    title: '',
    openCount: 0,
    closeCount: 0,
    open() { this.openCount += 1; },
    close() { this.closeCount += 1; },
    createElement: (tagName) => new FakeElement(tagName),
  };
  document.documentElement = new FakeElement('html');
  document.documentElement.replaceChildren = (...children) => {
    document.documentElement.children = children;
    [document.head, document.body] = children;
  };
  document.documentElement.replaceChildren(
    document.createElement('head'),
    document.createElement('body'),
  );
  return document;
}

function fakeOwner(printWindows = []) {
  const listeners = new Map();
  return {
    addEventListener(type, listener) { listeners.set(type, listener); },
    dispatch(type) { listeners.get(type)?.(); },
    open() { return printWindows.shift() || null; },
  };
}

function fakePrintWindow() {
  const document = fakeDocument();
  return {
    opener: {},
    location: { href: new URL('../src/shared/detached-print.html', import.meta.url).href },
    document,
    listeners: new Map(),
    addEventListener(type, handler) { this.listeners.set(type, handler); },
    removeEventListener(type) { this.listeners.delete(type); },
    closeCount: 0,
    timeoutCallback: null,
    setTimeout(callback, delay) { this.timeoutCallback = callback; this.timeoutDelay = delay; return 1; },
    clearTimeout(id) { this.clearedTimer = id; },
    clearedBeforeClose: false,
    close() {
      this.closeCount += 1;
      this.clearedBeforeClose = document.documentElement.children.length === 0;
    },
  };
}

test('detached print documents detach and allow only the fixed application stylesheets', () => {
  closeDetachedPrintWindows();
  const popup = fakePrintWindow();
  const owner = fakeOwner([popup]);
  const opened = openDetachedPrintWindow({ windowRoot: owner });
  assert.equal(opened, popup);
  assert.equal(popup.opener, null);

  const document = initializeDetachedPrintDocument(popup, {
    lang: 'de',
    title: 'Besuchsinformation',
  });
  assert.equal(document.title, 'Besuchsinformation');
  assert.equal(document.documentElement.lang, 'de');
  const csp = document.head.children.find(
    (node) => node.getAttribute('http-equiv') === 'Content-Security-Policy',
  );
  assert.equal(csp.getAttribute('content'), DETACHED_PRINT_CSP);
  for (const directive of [
    "default-src 'none'",
    "script-src 'none'",
    "img-src 'none'",
    "font-src 'none'",
    "connect-src 'none'",
    "frame-src 'none'",
    "object-src 'none'",
    "form-action 'none'",
  ]) assert.match(csp.getAttribute('content'), new RegExp(directive.replaceAll("'", "\\'")));
  const links = document.head.children.filter((node) => node.tagName === 'LINK');
  assert.equal(links.length, 2);
  assert.deepEqual(links.map((node) => node.getAttribute('href')), [
    new URL('../assets/tokens.css', import.meta.url).href,
    new URL('../assets/employee-ux.css', import.meta.url).href,
  ]);
  assert.equal(document.head.children.some((node) => node.tagName === 'STYLE'), false);
  assert.equal(document.body.className, 'guest-print-document');
  assert.doesNotMatch(DETACHED_PRINT_CSP, /unsafe-inline|https?:\/\/(?!127)/);

  owner.dispatch('pagehide');
  assert.equal(popup.closeCount, 1);
  assert.equal(popup.clearedBeforeClose, true);
  assert.equal(document.documentElement.children.length, 0);
});

test('all registered print windows are cleared and closed as one authority boundary', () => {
  closeDetachedPrintWindows();
  const first = fakePrintWindow();
  const second = fakePrintWindow();
  assert.equal(registerDetachedPrintWindow(first, { ownerWindow: fakeOwner() }), first);
  assert.equal(registerDetachedPrintWindow(second, { ownerWindow: fakeOwner() }), second);
  assert.equal(closeDetachedPrintWindows(), 2);
  assert.equal(first.closeCount, 1);
  assert.equal(second.closeCount, 1);
  assert.equal(first.clearedBeforeClose, true);
  assert.equal(second.clearedBeforeClose, true);
  assert.equal(closeDetachedPrintWindow(first), false);
  assert.equal(first.closeCount, 2);
});

test('a popup that refuses opener detachment is closed without document access', () => {
  closeDetachedPrintWindows();
  let documentAccessed = false;
  let closeCount = 0;
  const popup = {
    get opener() { return {}; },
    set opener(_value) {},
    get document() {
      documentAccessed = true;
      throw new Error('must not be read');
    },
    close() { closeCount += 1; },
  };
  assert.equal(registerDetachedPrintWindow(popup, { ownerWindow: fakeOwner() }), null);
  assert.equal(documentAccessed, false);
  assert.equal(closeCount, 1);
});


test('stalled print styles reject readiness within a bounded deadline', async () => {
  closeDetachedPrintWindows();
  const popup = fakePrintWindow();
  registerDetachedPrintWindow(popup, { ownerWindow: fakeOwner() });
  initializeDetachedPrintDocument(popup, { lang: 'en', title: 'Welcome' });
  assert.equal(popup.timeoutDelay, 15_000);
  const rejected = assert.rejects(detachedPrintStylesReady(popup), /DETACHED_PRINT_STYLE_TIMEOUT/);
  popup.timeoutCallback();
  await rejected;
  assert.equal(popup.clearedTimer, 1);
  closeDetachedPrintWindow(popup);
});


test('print preparation waits for the fixed same-origin shell and removes its listener', async () => {
  const popup = fakePrintWindow();
  popup.document.readyState = 'complete';
  registerDetachedPrintWindow(popup, { ownerWindow: fakeOwner() });
  await waitForDetachedPrintDocument(popup);
  assert.equal(popup.listeners.has('load'), false);
  closeDetachedPrintWindow(popup);
});

test('print preparation rejects a closed authority-bound surface before publishing data', async () => {
  const popup = fakePrintWindow();
  registerDetachedPrintWindow(popup, { ownerWindow: fakeOwner() });
  popup.closed = true;
  await assert.rejects(waitForDetachedPrintDocument(popup), /DETACHED_PRINT_DOCUMENT_CLOSED/);
  assert.equal(popup.listeners.has('load'), false);
  closeDetachedPrintWindow(popup);
});

test('print preparation times out without publishing data into a different document', async (context) => {
  context.mock.timers.enable({ apis: ['setTimeout'] });
  const popup = fakePrintWindow();
  popup.location.href = 'about:blank';
  popup.document.readyState = 'complete';
  registerDetachedPrintWindow(popup, { ownerWindow: fakeOwner() });
  const preparation = waitForDetachedPrintDocument(popup);
  context.mock.timers.tick(15_000);
  await assert.rejects(preparation, /DETACHED_PRINT_DOCUMENT_TIMEOUT/);
  assert.equal(popup.listeners.has('load'), false);
  closeDetachedPrintWindow(popup);
});
