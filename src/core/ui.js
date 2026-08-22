import { t } from './i18n.js';

const BLOCKED_ATTRIBUTES = new Set(['srcdoc', 'style']);
const URL_ATTRIBUTES = new Set(['href', 'src', 'action', 'formaction', 'poster', 'xlink:href']);
const EVENT_ATTRIBUTE_PATTERN = /^on/i;

function applyAttribute(node, key, value) {
  const normalizedKey = String(key || '').trim();
  const lowerKey = normalizedKey.toLowerCase();
  if (!normalizedKey || EVENT_ATTRIBUTE_PATTERN.test(normalizedKey) || BLOCKED_ATTRIBUTES.has(lowerKey)) return;
  if (URL_ATTRIBUTES.has(lowerKey)) {
    const safeValue = safeNavigationUrl(value);
    if (safeValue) node.setAttribute(normalizedKey, safeValue);
    return;
  }
  node.setAttribute(normalizedKey, String(value));
}

function enforceBlankTargetIsolation(node) {
  if (node.target !== '_blank') return;
  const relTokens = new Set(String(node.rel || '').split(/\s+/).filter(Boolean));
  relTokens.delete('opener');
  relTokens.add('noopener');
  relTokens.add('noreferrer');
  node.rel = [...relTokens].join(' ');
}

export function el(tagName, options = {}, children = []) {
  const node = document.createElement(tagName);
  if (options.className) node.className = options.className;
  if (options.id) node.id = options.id;
  if (options.text !== undefined) node.textContent = options.text;
  if (options.type) node.type = options.type;
  if (options.value !== undefined) node.value = options.value;
  if (options.name) node.name = options.name;
  if (options.href) {
    const href = safeNavigationUrl(options.href);
    if (href) node.href = href;
  }
  if (options.target) node.target = options.target;
  if (options.rel) node.rel = options.rel;
  if (options.placeholder) node.placeholder = options.placeholder;
  if (options.dataset) Object.entries(options.dataset).forEach(([key, value]) => { node.dataset[key] = String(value); });
  if (options.attrs) Object.entries(options.attrs).forEach(([key, value]) => applyAttribute(node, key, value));
  enforceBlankTargetIsolation(node);
  if (options.disabled !== undefined) node.disabled = Boolean(options.disabled);
  if (options.checked !== undefined) node.checked = Boolean(options.checked);
  const normalizedChildren = Array.isArray(children) ? children : [children];
  normalizedChildren.filter((child) => child !== null && child !== undefined).forEach((child) => {
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  });
  return node;
}

export function clear(node) {
  node?.replaceChildren();
}

export function button(label, options = {}) {
  return el('button', { type: 'button', text: label, className: options.className || 'secondary', ...options });
}

export function field({ id, label, control, hint, required = false, optional = false }) {
  const wrapper = el('label', { className: 'field' });
  const labelText = el('span', { className: 'field-label', text: `${label}${required ? ' *' : ''}` });
  if (optional) labelText.append(el('span', { className: 'optional-chip', text: t('common.optional') }));
  control.id = id;
  wrapper.htmlFor = id;
  wrapper.append(labelText, control);
  if (hint) wrapper.append(el('small', { className: 'field-hint', text: hint }));
  return wrapper;
}

export function announce(message, { assertive = false } = {}) {
  const region = document.getElementById(assertive ? 'alertRegion' : 'statusRegion');
  if (!region) return;
  region.textContent = '';
  requestAnimationFrame(() => { region.textContent = message; });
}

export function showToast(message) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(window.__cmToastTimer);
  window.__cmToastTimer = setTimeout(() => toast.classList.remove('show'), 3200);
}

export function safeNavigationUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value, window.location.href);
    if (url.protocol === 'https:') return url.href;
    if (url.origin === window.location.origin && url.protocol === 'http:') return url.href;
    return null;
  } catch {
    return null;
  }
}

export function safeHttpsUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value, window.location.href);
    return url.protocol === 'https:' ? url.href : null;
  } catch {
    return null;
  }
}

export function openDialog({ title, description = '', content, actions = [], labelledById = 'dialogTitle' }) {
  const dialog = el('dialog', { className: 'modal-dialog', attrs: { 'aria-labelledby': labelledById } });
  const header = el('header', { className: 'modal-header' });
  const heading = el('h2', { id: labelledById, text: title });
  header.appendChild(heading);
  if (description) header.append(el('p', { text: description }));
  const body = el('section', { className: 'modal-body' });
  if (content) body.append(content);
  const footer = el('footer', { className: 'modal-actions' });
  actions.forEach((action) => footer.appendChild(action));
  dialog.append(header, body, footer);
  document.body.appendChild(dialog);
  const previousFocus = document.activeElement;
  dialog.addEventListener('close', () => {
    dialog.remove();
    if (previousFocus instanceof HTMLElement) previousFocus.focus();
  }, { once: true });
  dialog.addEventListener('cancel', (event) => {
    event.preventDefault();
    dialog.close();
  });
  dialog.showModal();
  const firstFocusable = dialog.querySelector('input,select,textarea,button:not([disabled]),a[href]');
  firstFocusable?.focus();
  return dialog;
}

export function validationSummary(panel, message) {
  document.querySelectorAll('.validation-summary').forEach((node) => node.remove());
  const section = el('section', { className: 'validation-summary', attrs: { role: 'alert', 'aria-live': 'assertive' } }, [
    el('strong', { text: t('validation.heading') }),
    el('p', { text: message }),
  ]);
  panel?.prepend(section);
  return section;
}

export function setFieldInvalid(fieldId, invalid) {
  const node = document.getElementById(fieldId);
  if (!node) return;
  if (invalid) node.setAttribute('aria-invalid', 'true');
  else node.removeAttribute('aria-invalid');
}

export function clearValidation() {
  document.querySelectorAll('[aria-invalid="true"]').forEach((node) => node.removeAttribute('aria-invalid'));
  document.querySelectorAll('.validation-summary').forEach((node) => node.remove());
}
