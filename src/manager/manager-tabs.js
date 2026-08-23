const MANAGER_TAB_IDS = Object.freeze(['BOOKINGS', 'ROOM_PLAN', 'REPORTS', 'ADMIN']);

export function ensureManagerTabIdentity() {
  const controls = [...document.querySelectorAll('.manager-tabs > button')];
  controls.forEach((control, index) => {
    const tab = MANAGER_TAB_IDS[index];
    if (control instanceof HTMLButtonElement && tab) control.dataset.managerTab = tab;
  });
}

export function currentManagerTab() {
  const active = document.querySelector('.manager-tabs > button[data-manager-tab][aria-pressed="true"]');
  if (!(active instanceof HTMLButtonElement)) return null;
  const tab = active.dataset.managerTab || '';
  return MANAGER_TAB_IDS.includes(tab) ? tab : null;
}

export function managerTabControl(tab) {
  if (!MANAGER_TAB_IDS.includes(tab)) return null;
  const control = document.querySelector(`.manager-tabs > button[data-manager-tab="${tab}"]`);
  return control instanceof HTMLButtonElement ? control : null;
}
