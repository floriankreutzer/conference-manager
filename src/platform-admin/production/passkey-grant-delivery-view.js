import { t } from '../../core/i18n.js';
import { button, clear, el, field } from '../../core/ui.js';
import { createPlatformPasskeyGrantDelivery } from './passkey-grant-delivery.js';

// User-selected local files only. The public request may be shared with the
// independent issuer; the returned ciphertext is decrypted only in this window.
export function createPlatformPasskeyGrantDeliveryView({ controller, onChange } = {}) {
  const element = el('section', { attrs: { 'aria-labelledby': 'platformPasskeyDeliveryTitle' } });
  let delivery = null; let requestUrl = null; let busy = false; let failed = false;
  function dispose() {
    delivery?.dispose(); delivery = null;
    if (requestUrl) URL.revokeObjectURL(requestUrl); requestUrl = null;
  }
  async function prepare() {
    if (busy || requestUrl || controller.snapshot().busy) return;
    busy = true; failed = false; render();
    try {
      delivery = createPlatformPasskeyGrantDelivery({ origin: globalThis.location.origin });
      const request = await delivery.prepare();
      requestUrl = URL.createObjectURL(new Blob([request], { type: 'application/json' }));
      onChange();
    } catch { dispose(); failed = true; }
    finally { busy = false; render(); }
  }
  async function consume(file) {
    if (busy || !requestUrl || controller.snapshot().busy) return;
    busy = true; failed = false; render();
    try {
      if (!file || file.size < 1 || file.size > 8192) throw new Error();
      const current = await controller.load();
      // A failed or already completed request is never blindly submitted again.
      if (current.error || current.phase !== 'enrollment_required') throw new Error();
      const result = await delivery.consume(await file.text(), grant => controller.startEnrollment(grant));
      if (result.error || result.phase !== 'registration_required') throw new Error();
      dispose(); onChange();
    } catch { failed = true; }
    finally { busy = false; render(); }
  }
  function render() {
    const active = document.activeElement; const hadFocus = element.contains(active); clear(element);
    element.append(el('h3', { id: 'platformPasskeyDeliveryTitle', text: t('platformAdmin.passkey.delivery.title') }),
      el('p', { text: t('platformAdmin.passkey.delivery.description') }));
    if (failed) element.append(el('p', { attrs: { role: 'alert' }, text: t('platformAdmin.passkey.delivery.failed') }));
    if (busy) element.append(el('p', { attrs: { role: 'status' }, text: t('platformAdmin.passkey.delivery.busy') }));
    if (!requestUrl) {
      const prepareButton = button(t('platformAdmin.passkey.delivery.prepare'), { disabled: busy || controller.snapshot().busy });
      prepareButton.addEventListener('click', () => { void prepare(); }); element.append(prepareButton);
    } else {
      element.append(el('p', { attrs: { role: 'status' }, text: t('platformAdmin.passkey.delivery.keepOpen') }),
        el('a', { href: requestUrl, className: 'primary button-link', text: t('platformAdmin.passkey.delivery.download'),
          attrs: { download: 'platform-passkey-recipient.json' } }));
      const input = el('input', { type: 'file', attrs: { accept: '.json,application/json', required: 'required' } });
      input.disabled = busy || controller.snapshot().busy;
      const submit = button(t('platformAdmin.passkey.delivery.use'), { type: 'submit', disabled: input.disabled });
      const form = el('form', {}, [field({ id: 'platformPasskeyEncryptedDelivery',
        label: t('platformAdmin.passkey.delivery.file'), control: input, required: true }), submit]);
      form.addEventListener('submit', event => {
        event.preventDefault(); if (form.reportValidity()) void consume(input.files?.[0]);
      }); element.append(form);
    }
    if (hadFocus && active?.isConnected === false) element.querySelector('button:not(:disabled), a, input:not(:disabled)')?.focus();
    return element;
  }
  return Object.freeze({ render, hasRequest: () => requestUrl !== null, dispose });
}
