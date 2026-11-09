import { formatNumber, locale, t } from '../core/i18n.js';
import { button, el } from '../core/ui.js';
import { formatProductionDateTime } from '../core/production-time.js';

export function roomPlanPreview({ openRequest }) {
  const heading = el('h3', { id: 'managerRoomPlanPreviewTitle', attrs: { tabindex: '-1' } });
  const details = el('dl', { className: 'request-business-details' });
  const open = button(t('production.manager.roomPlan.open'));
  const close = button(t('production.manager.roomPlan.close'));
  const node = el('section', { id: 'managerRoomPlanPreview', className: 'report-card', attrs: {
    hidden: 'hidden', 'aria-labelledby': heading.id,
  } }, [heading, details, el('div', { className: 'request-actions' }, [open, close])]);
  let selected = null;
  let restoringFocus = false;
  const clear = () => {
    selected?.control.setAttribute('aria-expanded', 'false');
    selected = null;
    node.hidden = true;
    heading.textContent = '';
    details.replaceChildren();
  };
  const dismiss = () => {
    const control = selected?.control;
    clear();
    restoringFocus = true;
    control?.focus();
    restoringFocus = false;
  };
  const escape = (event) => {
    if (event.key !== 'Escape' || node.hidden) return;
    event.preventDefault();
    event.stopPropagation();
    dismiss();
  };
  close.addEventListener('click', dismiss);
  node.addEventListener('keydown', escape);
  open.addEventListener('click', () => { if (selected) openRequest(selected.request.id); });
  const bind = (control, request, room, timeZone) => {
    control.setAttribute('aria-controls', node.id);
    control.setAttribute('aria-expanded', 'false');
    const show = (moveFocus = false) => {
      if (restoringFocus) return;
      if (selected?.control !== control) {
        // Hover must never replace the action currently being used with the keyboard.
        if (!moveFocus && node.contains(document.activeElement)) return;
        selected?.control.setAttribute('aria-expanded', 'false');
        selected = { control, request };
        heading.textContent = request.details?.title || t('production.common.requestId', { id: request.id });
        const time = (value) => formatProductionDateTime(value, { locale: locale(), timeZone });
        details.replaceChildren(...[
          ['production.employee.room', room.name],
          ['production.employee.start', time(request.startsAt)],
          ['production.employee.end', time(request.endsAt)],
          ['production.common.status', t(`status.${request.status}`)],
          ['production.manager.roomPlan.participants', formatNumber(request.internalParticipants + request.externalParticipants)],
        ].map(([key, value]) => el('div', {}, [el('dt', { text: t(key) }), el('dd', { text: value })])));
      }
      node.hidden = false;
      control.setAttribute('aria-expanded', 'true');
      if (moveFocus) {
        const previousFocus = document.activeElement;
        heading.focus();
        // Touch activation can finish native button focus after the click handler.
        // Restore the requested preview focus only while that activation still owns it.
        requestAnimationFrame(() => {
          if (selected?.control !== control || !node.isConnected || node.hidden
            || document.documentElement.dataset.sessionLocked === 'true') return;
          if (document.activeElement === control || document.activeElement === document.body
            || document.activeElement === previousFocus) heading.focus();
        });
      }
    };
    control.addEventListener('focus', () => show());
    control.addEventListener('pointerenter', (event) => { if (event.pointerType === 'mouse') show(); });
    control.addEventListener('click', () => show(true));
    control.addEventListener('keydown', escape);
  };
  return Object.freeze({ node, bind, clear });
}
