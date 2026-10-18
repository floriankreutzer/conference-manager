import { button, el } from '../core/ui.js';

// Local presentation state stays with the owning provider/product view.
export function renderInsightTabs({ id, label, tabs, activeTab = 'overview', onTabChange = () => {} }) {
  const selected = tabs.some((tab) => tab.id === activeTab) ? activeTab : tabs[0].id;
  const controls = new Map();
  const panels = new Map();
  const tablist = el('div', { className: 'platform-admin-insights-tabs',
    attrs: { role: 'tablist', 'aria-label': label } });

  function activate(tabId, focus = false) {
    controls.forEach((control, candidate) => {
      control.setAttribute('aria-selected', String(candidate === tabId));
      control.tabIndex = candidate === tabId ? 0 : -1;
      panels.get(candidate).hidden = candidate !== tabId;
    });
    onTabChange(tabId);
    if (focus) controls.get(tabId).focus();
  }

  tabs.forEach((tab, index) => {
    const controlId = `${id}-tab-${tab.id}`;
    const panelId = `${id}-panel-${tab.id}`;
    const control = button(tab.label, { id: controlId, className: 'platform-admin-insights-tab',
      dataset: { insightsTab: tab.id }, attrs: { role: 'tab', 'aria-controls': panelId,
        'aria-selected': String(tab.id === selected), tabindex: tab.id === selected ? '0' : '-1' } });
    const panel = el('section', { id: panelId, className: 'platform-admin-insights-panel',
      dataset: { insightsPanel: tab.id }, attrs: { role: 'tabpanel', 'aria-labelledby': controlId, tabindex: '0' } },
    Array.isArray(tab.content) ? tab.content : [tab.content]);
    panel.hidden = tab.id !== selected;
    controls.set(tab.id, control);
    panels.set(tab.id, panel);
    control.addEventListener('click', () => activate(tab.id));
    control.addEventListener('keydown', (event) => {
      const rtl = control.ownerDocument.defaultView.getComputedStyle(tablist).direction === 'rtl';
      let next;
      if (event.key === 'Home') next = 0;
      else if (event.key === 'End') next = tabs.length - 1;
      else if (event.key === 'ArrowRight') next = index + (rtl ? -1 : 1);
      else if (event.key === 'ArrowLeft') next = index + (rtl ? 1 : -1);
      else return;
      event.preventDefault();
      activate(tabs[(next + tabs.length) % tabs.length].id, true);
    });
    tablist.append(control);
  });
  return el('div', { className: 'platform-admin-insights', dataset: { insightsTabs: id } },
    [tablist, ...panels.values()]);
}
