import assert from 'node:assert/strict';
import test from 'node:test';
import {
  DETACHED_PRINT_CSP,
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

  append(...children) { this.children.push(...children); }

  replaceChildren(...children) { this.children = children; }

  setAttribute(name, value) { this.attributes.set(name, String(value)); }

  getAttribute(name) { return this.attributes.get(name) ?? null; }
}

function fakeDocument() {
  const document = {
    title: '',
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
    document,
    closeCount: 0,
    clearedBeforeClose: false,
    close() {
      this.closeCount += 1;
      this.clearedBeforeClose = document.documentElement.children.length === 0;
    },
  };
}

test('detached print documents detach before access and install a restrictive inline-only surface', () => {
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
  const style = document.head.children.find((node) => node.tagName === 'STYLE');
  assert.match(style.textContent, /--print-text:/);
  assert.match(style.textContent, /@media print/);
  assert.doesNotMatch(style.textContent, /url\s*\(|@import|https?:/iu);

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
