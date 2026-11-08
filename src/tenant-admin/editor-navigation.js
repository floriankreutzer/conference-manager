// Ephemeral editor state; never persists values or grants authority.
export function createEditorNavigation({ confirmDiscard, onStay = () => {} }) {
  let editor = null;
  let pending = false;
  let epoch = 0;
  const dirty = () => Boolean(editor?.isCurrent() && editor.read() !== editor.baseline);
  function clear() { editor = null; pending = false; epoch += 1; }
  function register({ read, isCurrent }) {
    clear();
    const owned = { read, isCurrent, baseline: read() };
    editor = owned;
    return Object.freeze({
      saved() { if (editor === owned) owned.baseline = read(); },
      isDirty: () => editor === owned && dirty(),
    });
  }
  function allow(retry) {
    if (!dirty()) return true;
    if (pending) return false;
    pending = true;
    const expected = epoch;
    confirmDiscard((discard) => {
      if (expected !== epoch || !pending) return;
      pending = false;
      if (!editor?.isCurrent()) { clear(); return; }
      if (!discard) { onStay(); return; }
      clear();
      retry();
    });
    return false;
  }
  return Object.freeze({ register, allow, clear, dirty });
}
