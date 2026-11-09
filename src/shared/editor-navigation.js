// Ephemeral editor state; never persists values or grants authority.
export function createEditorNavigation({ confirmDiscard, onStay = () => {}, onPending = () => {} }) {
  let editor = null;
  let pending = false;
  let epoch = 0;
  const writing = () => Boolean(editor?.isCurrent() && editor.isPending());
  const dirty = () => writing() || Boolean(editor?.isCurrent() && editor.read() !== editor.baseline);
  function clear() { editor = null; pending = false; epoch += 1; }
  function register({ read, isCurrent, isPending = () => false }) {
    clear();
    const owned = { read, isCurrent, isPending, baseline: read() };
    editor = owned;
    return Object.freeze({
      saved() { if (editor === owned) owned.baseline = read(); },
      isDirty: () => editor === owned && dirty(),
    });
  }
  function allow(retry) {
    if (pending) return false;
    if (writing()) { onPending(); return false; }
    if (!dirty()) return true;
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
