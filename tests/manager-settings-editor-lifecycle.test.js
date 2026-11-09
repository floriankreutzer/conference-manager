import assert from 'node:assert/strict';
import test from 'node:test';
import { createEditorNavigation } from '../src/shared/editor-navigation.js';
import { createManagerSettingsEditor } from '../src/manager/settings-editor-lifecycle.js';

function fixture() {
  const name = { type: 'text', value: 'Room', disabled: false };
  const price = { type: 'number', value: '10', disabled: false };
  const search = { type: 'search', value: '', disabled: false };
  const file = { type: 'file', files: [], disabled: false };
  const media = { multiple: true, selectedOptions: [{ value: 'first' }], disabled: false };
  const save = { tagName: 'BUTTON', disabled: false };
  const limit = { tagName: 'BUTTON', disabled: true };
  const controls = [name, price, search, file, media, save, limit];
  let current = true;
  const attributes = new Map();
  const ownerDocument = { body: {}, activeElement: null };
  const form = { ownerDocument,
    querySelectorAll: (query) => controls.filter((control) => query.includes('button') || control.tagName !== 'BUTTON'),
    contains: (control) => controls.includes(control),
    setAttribute: (key, value) => attributes.set(key, value),
    removeAttribute: (key) => attributes.delete(key),
  };
  const navigation = createEditorNavigation({ confirmDiscard: () => {} });
  const editor = createManagerSettingsEditor({ form, isCurrent: () => current, registerEditor: navigation.register });
  return { controls, attributes, name, price, search, file, media, save, limit, editor, navigation,
    revoke: () => { current = false; navigation.clear(); } };
}

test('CO-306 partial saves preserve other room, price, selection and file drafts; search is transient', () => {
  const { name, price, search, file, media, editor, navigation } = fixture();
  search.value = 'No match';
  assert.equal(navigation.dirty(), false);
  name.value = 'Unsaved room'; price.value = '20';
  media.selectedOptions = [{ value: 'second' }];
  file.files = [{ name: 'image.webp', size: 10, lastModified: 2 }];
  editor.saved([price]);
  assert.equal(navigation.dirty(), true);
  editor.saved([name, media]);
  assert.equal(navigation.dirty(), true, 'An unuploaded selection is still a draft');
  file.files = []; editor.saved([file]);
  assert.equal(navigation.dirty(), false);
});

test('CO-306 additions and deletions stay dirty across an unrelated partial write', () => {
  const { controls, name, price, editor, navigation } = fixture();
  controls.splice(controls.indexOf(name), 1);
  editor.saved([price]);
  assert.equal(navigation.dirty(), true, 'Saving a price cannot acknowledge a removed entry');
  editor.saved(undefined, { removeMissing: true });
  assert.equal(navigation.dirty(), false);
  controls.push({ type: 'text', value: 'New variant', disabled: false });
  assert.equal(navigation.dirty(), true);
  editor.saved(undefined, { removeMissing: true });
  assert.equal(navigation.dirty(), false);
});

test('CO-306 saving a newly added item ignores its empty picker but retains an actual unuploaded file', () => {
  const { controls, editor, navigation } = fixture();
  const item = { type: 'text', value: 'Saved new item', disabled: false };
  const picker = { type: 'file', files: [], disabled: false };
  controls.push(item, picker);
  assert.equal(navigation.dirty(), true);
  editor.saved([item]);
  assert.equal(navigation.dirty(), false, 'An empty new picker is not a pending upload');
  picker.files = [{ name: 'tea.png', size: 25, lastModified: 3 }];
  assert.equal(navigation.dirty(), true);
  editor.saved([item]);
  assert.equal(navigation.dirty(), true, 'Saving item data must not acknowledge the selected file');
  picker.files = [];
  assert.equal(navigation.dirty(), false, 'Clearing an unuploaded selection restores the saved form');
});

test('CO-306 attachment baseline rebase preserves a pending removal without discarding the uploaded asset', () => {
  const { media, editor, navigation } = fixture();
  media.selectedOptions = [{ value: 'uploaded' }];
  editor.rebase(media, (baseline) => [...baseline, 'uploaded']);
  assert.equal(navigation.dirty(), true, 'The original attachment removal has not been saved');
  media.selectedOptions = [{ value: 'first' }, { value: 'uploaded' }];
  assert.equal(navigation.dirty(), false);
});

test('CO-306 only one mutation owns a form; completion restores prior disabled states', () => {
  const { controls, attributes, save, limit, editor, navigation } = fixture();
  const mutation = editor.beginMutation();
  assert.ok(mutation);
  assert.equal(editor.beginMutation(), null);
  assert.equal(editor.pending(), true);
  assert.equal(navigation.dirty(), true);
  assert.equal(attributes.get('aria-busy'), 'true');
  assert.ok(controls.every((control) => control.disabled));
  mutation.finish(); mutation.finish();
  assert.equal(save.disabled, false); assert.equal(limit.disabled, true);
  assert.equal(editor.pending(), false); assert.equal(navigation.dirty(), false);
  assert.equal(attributes.has('aria-busy'), false);
});

test('CO-306 an authority-invalidated write cannot re-enable a stale form', () => {
  const { controls, editor, navigation, revoke } = fixture();
  const mutation = editor.beginMutation();
  revoke(); mutation.finish();
  assert.ok(controls.every((control) => control.disabled));
  assert.equal(navigation.dirty(), false);
  assert.equal(editor.beginMutation(), null);
});
