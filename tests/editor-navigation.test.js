import assert from 'node:assert/strict';
import test from 'node:test';
import { createEditorNavigation } from '../src/shared/editor-navigation.js';

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

test('CO-307 completing a save preserves pending navigation until the dialog settles', () => {
  for (const discard of [true, false]) {
    let value = 'original'; let answer; let retries = 0; let stays = 0; let prompts = 0;
    const guard = createEditorNavigation({ confirmDiscard: (done) => { answer = done; prompts += 1; },
      onStay: () => { stays += 1; } });
    const editor = guard.register({ read: () => value, isCurrent: () => true });
    value = 'edited';
    assert.equal(guard.allow(() => { retries += 1; }), false);
    editor.saved();
    assert.equal(guard.dirty(), false);
    assert.equal(guard.allow(() => { retries += 100; }), false);
    assert.equal(prompts, 1);
    answer(discard); answer(discard);
    assert.equal(retries, discard ? 1 : 0);
    assert.equal(stays, discard ? 0 : 1);
    assert.equal(guard.allow(() => {}), true);
  }
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

test('CO-306 an active write blocks navigation and unload even for an unchanged form', () => {
  let current = true; let pending = false; let notices = 0; let prompts = 0;
  const guard = createEditorNavigation({ confirmDiscard: () => { prompts += 1; },
    onPending: () => { notices += 1; } });
  guard.register({ read: () => 'unchanged', isCurrent: () => current, isPending: () => pending });
  pending = true;
  assert.equal(guard.dirty(), true);
  assert.equal(guard.allow(() => assert.fail('A pending write must not navigate')), false);
  assert.equal(notices, 1); assert.equal(prompts, 0);
  current = false;
  assert.equal(guard.dirty(), false);
  assert.equal(guard.allow(() => {}), true, 'Security invalidation cannot be vetoed');
  current = true; pending = false;
  assert.equal(guard.dirty(), false);
  assert.equal(guard.allow(() => {}), true);
});
