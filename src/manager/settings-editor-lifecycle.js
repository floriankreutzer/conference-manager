// A Manager form may save room data, a price or an image independently. Keep
// baselines per control so a successful partial write never clears other drafts.
// Everything is scoped to this connected form; no draft enters browser storage.
export function settingsControlValue(control) {
  if (control.type === 'checkbox' || control.type === 'radio') return control.checked;
  if (control.type === 'file') {
    return Array.from(control.files || [], (file) => [file.name, file.size, file.lastModified]);
  }
  if (control.multiple) return Array.from(control.selectedOptions, (option) => option.value);
  return control.value;
}

export function createManagerSettingsEditor({ form, interactionRoot = form, isCurrent, registerEditor }) {
  const isDraftControl = (control) => control.type !== 'search'
    && control.dataset?.editorPresentation !== 'true';
  const fields = () => Array.from(form.querySelectorAll('input, select, textarea'))
    .filter(isDraftControl);
  const baselines = new Map();
  let mutation = null;

  function saved(controls = fields(), { removeMissing = false } = {}) {
    for (const control of controls) {
      if (isDraftControl(control)) baselines.set(control, settingsControlValue(control));
    }
    if (removeMissing) {
      for (const control of baselines.keys()) {
        if (!form.contains(control)) baselines.delete(control);
      }
    }
  }

  function dirty() {
    const current = fields();
    return current.some((control) => {
      const value = settingsControlValue(control);
      // New catalogue entries also add an empty image picker. Only a selected
      // file is an independent upload draft after the entry itself is saved.
      if (!baselines.has(control)) return control.type !== 'file' || value.length > 0;
      return JSON.stringify(value) !== JSON.stringify(baselines.get(control));
    })
      || Array.from(baselines.keys()).some((control) => !current.includes(control));
  }

  saved();
  registerEditor({ read: dirty, isCurrent, isPending: () => mutation !== null });

  function beginMutation() {
    if (mutation || !isCurrent()) return null;
    const owned = {};
    mutation = owned;
    const controls = Array.from(interactionRoot.querySelectorAll('input, select, textarea, button'));
    const disabled = controls.map((control) => control.disabled);
    const focused = form.ownerDocument.activeElement;
    controls.forEach((control) => { control.disabled = true; });
    form.setAttribute('aria-busy', 'true');
    return Object.freeze({
      finish() {
        if (mutation !== owned) return;
        mutation = null;
        if (!isCurrent()) return;
        controls.forEach((control, index) => { control.disabled = disabled[index]; });
        form.removeAttribute('aria-busy');
        if (form.contains(focused) && form.ownerDocument.activeElement === form.ownerDocument.body) {
          focused.focus();
        }
      },
    });
  }

  return Object.freeze({
    beginMutation,
    pending: () => mutation !== null,
    saved,
    rebase(control, transform) {
      if (baselines.has(control)) baselines.set(control, transform(baselines.get(control)));
    },
  });
}
