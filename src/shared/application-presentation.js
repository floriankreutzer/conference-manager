import { el } from '../core/ui.js';

export function inputControl(type, value, options = {}) {
  const input = el('input', {
    type,
    value: value ?? '',
    placeholder: options.placeholder || '',
    attrs: {},
  });
  if (options.min !== undefined) input.min = String(options.min);
  if (options.max !== undefined) input.max = String(options.max);
  if (options.step !== undefined) input.step = String(options.step);
  if (options.required) input.required = true;
  return input;
}

export function sectionHeading(title, description) {
  return el('header', { className: 'section-heading' }, [
    el('h2', { text: title }),
    description ? el('p', { text: description }) : null,
  ]);
}

export function kpi(label, value) {
  return el('article', { className: 'kpi' }, [
    el('span', { text: label }),
    el('strong', { text: String(value) }),
  ]);
}
