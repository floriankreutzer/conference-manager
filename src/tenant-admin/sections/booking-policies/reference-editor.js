import { t } from '../../../core/i18n.js';
import { el } from '../../../core/ui.js';
import { mergePolicySelection } from './reference-selection.js';

export function createPolicyReferenceEditor({ label, savedIds, options = null, disabled = false }) {
  const values = options || [];
  const node = el('fieldset', { className: 'policy-references', disabled }, [el('legend', { text: label })]);
  node.appendChild(el('p', { className: 'field-hint', text: t(options === null
    ? 'tenantSettings.policyReferences.unavailable' : 'tenantSettings.policyReferences.emptyMeansAll') }));
  const controls = values.map((option) => {
    const control = el('input', { type: 'checkbox', value: option.id, checked: savedIds.includes(option.id) });
    node.appendChild(el('label', { className: 'policy-reference-choice' }, [control, el('span', { text: option.name })]));
    return control;
  });
  const unknown = savedIds.filter((id) => !values.some((option) => option.id === id));
  if (unknown.length) node.appendChild(el('details', {}, [
    el('summary', { text: t('tenantSettings.policyReferences.preserved') }),
    el('ul', {}, unknown.map((id) => el('li', {}, el('code', { text: id })))),
  ]));
  const read = () => mergePolicySelection(savedIds, values, controls.filter((control) => control.checked).map((control) => control.value));
  return Object.freeze({ node, read });
}
