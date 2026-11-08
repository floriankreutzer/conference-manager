import assert from 'node:assert/strict';
import test from 'node:test';
import { createEditorNavigation } from '../src/tenant-admin/editor-navigation.js';

test('CO-307 unchanged and saved editors navigate; stay retains edits and discard retries once', () => {
  let value = 'original'; let answer; let prompts = 0; let retries = 0; let stays = 0;
  const guard = createEditorNavigation({ confirmDiscard: (done) => { prompts += 1; answer = done; },
    onStay: () => { stays += 1; } });
  const editor = guard.register({ read: () => value, isCurrent: () => true });
  assert.equal(guard.allow(() => {}), true);
  value = 'edited';
  assert.equal(guard.allow(() => { retries += 1; }), false);
  assert.equal(guard.allow(() => { retries += 100; }), false);
  assert.equal(prompts, 1);
  answer(false);
  assert.equal(stays, 1); assert.equal(guard.dirty(), true); assert.equal(value, 'edited');
  editor.saved(); assert.equal(guard.dirty(), false);
  value = 'second edit';
  guard.allow(() => { retries += 1; }); answer(true); answer(true);
  assert.equal(retries, 1); assert.equal(guard.dirty(), false);
});

test('CO-307 revoked or replaced editors cannot resume a pending navigation', () => {
  let current = true; let value = 'original'; let answer; let retries = 0;
  const guard = createEditorNavigation({ confirmDiscard: (done) => { answer = done; } });
  guard.register({ read: () => value, isCurrent: () => current }); value = 'edit';
  guard.allow(() => { retries += 1; }); current = false; answer(true);
  assert.equal(retries, 0); assert.equal(guard.dirty(), false);
  current = true; guard.register({ read: () => value, isCurrent: () => current }); value = 'other';
  guard.allow(() => { retries += 1; }); guard.clear(); answer(true);
  assert.equal(retries, 0);
});
