import { MANAGER_SETTINGS_MESSAGES } from '../../src/core/i18n-manager-settings-messages.js';
import { observeLocalDemoNetwork } from './local-demo-network-diagnostics.js';

const PHASES = Object.freeze(Object.fromEntries([
  ['saved', 'room.priceSaved'], ['uploaded', 'room.mediaUploaded'],
  ['error', 'error'], ['conflict', 'conflict'], ['saving', 'saving'],
].map(([phase, key]) => [phase, ['de', 'en'].map((locale) => MANAGER_SETTINGS_MESSAGES[locale][`managerSettings.${key}`])])));

// Serialized into the local synthetic browser only. Observe native events and
// fixed scalar states; never read values, IDs, image URLs or arbitrary text into
// evidence. No focus, validation, scroll, click or mutation is initiated here.
export function roomPriceBrowserProbe(root, { command, phases }) {
  const key = '__cmLocalRoomPriceProbe';
  if (root.ownerDocument.location.origin !== 'https://customer.demo.test:4443') return { available: false };
  if (command === 'snapshot') return root[key]?.snapshot() || { available: false };
  if (command === 'dispose') { root[key]?.dispose(); delete root[key]; return; }
  if (command !== 'start') return { available: false };
  const document = root.ownerDocument;
  const view = document.defaultView;
  const started = view.performance.now();
  const records = [];
  let overflow = false;
  const scalar = (value) => Number.isFinite(value) ? Math.max(-100_000, Math.min(100_000, Math.round(value))) : null;
  const box = (node) => {
    if (!node?.isConnected) return null;
    const bounds = node.getBoundingClientRect();
    return Object.fromEntries(['x', 'y', 'width', 'height'].map((key) => [key, scalar(bounds[key])]));
  };
  const controls = () => {
    const room = root.querySelector('[data-manager-room-id="contoso-paris-room-2"]');
    return { room, form: room?.closest('form'),
      button: room?.querySelector('[data-manager-room-price] button'),
      amount: room?.querySelector('input[id^="manager-room-price-amount-"]'),
      currency: room?.querySelector('select[id^="manager-room-price-currency-"]') };
  };
  const validity = (node) => node ? Object.fromEntries([
    'valid', 'badInput', 'stepMismatch', 'rangeUnderflow', 'rangeOverflow', 'valueMissing', 'customError',
  ].map((key) => [key, node.validity[key] === true])) : null;
  function state() {
    const { room, form, button, amount, currency } = controls();
    const toast = root.querySelector('#toast')?.textContent || '';
    return { present: Boolean(room), busy: form?.getAttribute('aria-busy') === 'true',
      buttonDisabled: button ? button.disabled === true : null, button: box(button), amount: box(amount),
      amountValidity: validity(amount), currencyValidity: validity(currency),
      phase: Object.entries(phases).find(([, values]) => values.includes(toast))?.[0] || (toast ? 'other' : 'empty'),
      scroll: { x: scalar(view.scrollX), y: scalar(view.scrollY),
        smooth: view.getComputedStyle(root).scrollBehavior === 'smooth' },
      images: Array.from(room?.querySelectorAll('[data-manager-room-media-previews] img') || []).slice(0, 20)
        .map((image) => ({ loaded: image.complete && image.naturalWidth > 0, box: box(image) })),
    };
  }
  function record(event, target = 'none', point = null) {
    if (records.length >= 32) { overflow = true; return; }
    let ui = { available: false };
    try { ui = state(); } catch { /* Observers must never introduce a page error. */ }
    records.push({ event, target, point, elapsedMs: Math.min(300_000, Math.max(0, Math.round(view.performance.now() - started))), ui });
  }
  function observed(event) {
    try {
      const { room, button, amount, currency } = controls();
      const target = event.target;
      if (['load', 'error'].includes(event.type) && !(room?.contains(target) && target?.tagName === 'IMG')) return;
      const kind = button?.contains(target) ? 'price-button' : target === amount ? 'amount' : target === currency ? 'currency'
        : room?.contains(target) ? (target.tagName === 'IMG' ? 'room-image' : 'room') : 'other';
      record(event.type, kind, ['pointerdown', 'pointerup', 'click'].includes(event.type)
        ? { x: scalar(event.clientX), y: scalar(event.clientY) } : null);
    } catch { /* A detached target must not affect the native event. */ }
  }
  const events = ['pointerdown', 'pointerup', 'click', 'input', 'change', 'invalid', 'load', 'error'];
  const observer = new view.MutationObserver(() => record('phase'));
  root[key] = {
    snapshot: () => ({ available: true, overflow, records, current: state() }),
    dispose() {
      observer.disconnect();
      for (const event of events) document.removeEventListener(event, observed, true);
    },
  };
  try {
    for (const event of events) document.addEventListener(event, observed, { capture: true, passive: true });
    const { form } = controls();
    if (form) observer.observe(form, { subtree: true, attributes: true, attributeFilter: ['aria-busy', 'disabled'] });
    const toast = root.querySelector('#toast');
    if (toast) observer.observe(toast, { subtree: true, childList: true, characterData: true });
    record('start');
  } catch { root[key].dispose(); delete root[key]; }
}

export async function observeLocalRoomPrice(page, enabled) {
  const network = observeLocalDemoNetwork(page, enabled, 'room-price');
  if (!network) return null;
  let pageErrors = 0;
  const errored = () => { pageErrors = Math.min(64, pageErrors + 1); };
  page.on('pageerror', errored);
  const probe = (command) => page.locator('html').evaluate(roomPriceBrowserProbe, { command, phases: PHASES }, { timeout: 1_000 });
  network.start();
  try { await probe('start'); } catch { /* Keep network evidence if the document retired. */ }
  return Object.freeze({
    async snapshot() {
      let ui = { available: false };
      try { ui = await probe('snapshot'); } catch { /* Never replace the action failure. */ }
      return { network: network.snapshot(), pageErrors, ui };
    },
    async dispose() {
      network.dispose(); page.off('pageerror', errored);
      try { await probe('dispose'); } catch { /* The retired document owns its observers. */ }
    },
  });
}

export async function withLocalRoomPriceDiagnostics(page, enabled, action, attach) {
  let diagnostic;
  try { diagnostic = await observeLocalRoomPrice(page, enabled); } catch { /* Observation must not prevent the action. */ }
  try { return await action(); }
  catch (error) {
    if (diagnostic) {
      try { await attach(await diagnostic.snapshot()); } catch { /* Preserve the original action failure. */ }
    }
    throw error;
  } finally {
    try { await diagnostic?.dispose(); } catch { /* Preserve the action result. */ }
  }
}
