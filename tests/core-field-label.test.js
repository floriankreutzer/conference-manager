import assert from 'node:assert/strict';
import test from 'node:test';

class FakeNode {
  constructor(tagName = '') {
    this.tagName = tagName.toUpperCase();
    this.children = [];
    this.ownText = '';
  }

  set textContent(value) { this.ownText = String(value); this.children = []; }
  get textContent() { return this.ownText + this.children.map((child) => child.textContent).join(''); }
  append(...children) { this.children.push(...children); }
  hasAttribute() { return false; }
}

test('optional field labels separate the label and translated status', async () => {
  const previousDocument = globalThis.document;
  const previousNode = globalThis.Node;
  const previousInput = globalThis.HTMLInputElement;
  const previousTextarea = globalThis.HTMLTextAreaElement;
  try {
    globalThis.Node = FakeNode;
    globalThis.HTMLInputElement = class extends FakeNode {};
    globalThis.HTMLTextAreaElement = class extends FakeNode {};
    globalThis.document = {
      documentElement: new FakeNode('html'),
      createElement: (tag) => new FakeNode(tag),
      createTextNode: (value) => { const node = new FakeNode(); node.textContent = value; return node; },
    };
    const { field } = await import('../src/core/ui.js');
    const label = field({ id: 'notes', label: 'Notes', control: new FakeNode('textarea'), optional: true });
    assert.equal(label.htmlFor, 'notes');
    assert.equal(label.children[0].textContent, 'Notes optional');
    assert.equal(label.children[1].id, 'notes');
  } finally {
    globalThis.document = previousDocument;
    globalThis.Node = previousNode;
    globalThis.HTMLInputElement = previousInput;
    globalThis.HTMLTextAreaElement = previousTextarea;
  }
});
