import assert from 'node:assert/strict';
import test from 'node:test';

test('CO-300: clearing transient feedback invalidates a queued announcement without suppressing new feedback', async () => {
  const previousDocument = globalThis.document;
  const previousFrame = globalThis.requestAnimationFrame;
  const frames = [];
  const status = { textContent: '' };
  const alert = { textContent: '' };
  const toast = { textContent: 'Old success', classList: { remove() {} } };
  const documentRoot = {
    documentElement: { dataset: {} },
    getElementById: id => ({ statusRegion: status, alertRegion: alert, toast })[id],
  };
  try {
    globalThis.document = documentRoot;
    globalThis.requestAnimationFrame = callback => frames.push(callback);
    const { announce, clearTransientFeedback } = await import('../src/core/ui.js');
    announce('Previous language');
    announce('Previous error', { assertive: true });
    clearTransientFeedback(documentRoot, {});
    frames.splice(0).forEach(callback => callback());
    assert.equal(status.textContent, '');
    assert.equal(alert.textContent, '');
    assert.equal(toast.textContent, '');
    announce('Current language');
    frames.splice(0).forEach(callback => callback());
    assert.equal(status.textContent, 'Current language');
    documentRoot.documentElement.dataset.sessionLocked = 'true';
    announce('Must stay hidden', { assertive: true });
    assert.equal(frames.length, 0);
    assert.equal(alert.textContent, '');
  } finally {
    globalThis.document = previousDocument;
    globalThis.requestAnimationFrame = previousFrame;
  }
});
