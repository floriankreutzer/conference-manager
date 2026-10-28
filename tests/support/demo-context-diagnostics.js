import { securityMessages } from '../../src/core/security-i18n.js';
import { observeLocalDemoNetwork } from './local-demo-network-diagnostics.js';

const PHASE_MESSAGES = Object.freeze(Object.fromEntries([
  ['applying', 'applyingContext'], ['applied', 'contextApplied'], ['error', 'contextError'], ['unavailable', 'unavailable'],
].map(([phase, key]) => [phase, ['de', 'en'].map((locale) => securityMessages(locale)[key])])));

// Only fixed scalar UI states leave the local browser. No selected Tenant,
// persona value, status prose, session payload, URL, header or raw error is read
// into the attachment. Hosted/gated callers must pass the closed disabled scope.
export function observeLocalDemoContextSwitch(page, enabled) {
  const network = observeLocalDemoNetwork(page, enabled, 'context-switch');
  if (!network) return null;
  let domContentLoaded = 0;
  let pageErrors = 0;
  const loaded = () => { domContentLoaded = Math.min(64, domContentLoaded + 1); };
  const errored = () => { pageErrors = Math.min(64, pageErrors + 1); };
  page.on('domcontentloaded', loaded); page.on('pageerror', errored);
  network.start();
  return Object.freeze({
    async snapshot() {
      let ui = { available: false };
      try {
        ui = await page.locator('html').evaluate((root, phases) => {
          const panel = root.querySelector('[data-demo-security]');
          const apply = panel?.querySelector('button');
          const document = root.ownerDocument;
          const status = panel?.querySelector('[role="status"]')?.textContent?.slice(0, 500).trim() || '';
          const selection = (selector) => {
            const value = panel?.querySelector(selector)?.selectedIndex;
            return Number.isInteger(value) && value >= -1 && value <= 100 ? value : null;
          };
          return {
            available: true,
            readyState: ['loading', 'interactive', 'complete'].includes(document.readyState) ? document.readyState : 'unknown',
            panelPresent: Boolean(panel), applyPresent: Boolean(apply), applyDisabled: apply ? apply.disabled === true : null,
            applyFocused: Boolean(apply && document.activeElement === apply),
            switching: root.dataset.demoContextSwitching === 'true', locked: root.dataset.sessionLocked === 'true',
            tenantIndex: selection('#demoTenantSwitch'), personaIndex: selection('#demoPersonaSwitch'),
            statusPhase: Object.entries(phases).find(([, values]) => values.includes(status))?.[0] || (status ? 'other' : 'empty'),
          };
        }, PHASE_MESSAGES, { timeout: 1_000 });
      } catch { /* Preserve the primary failure if the document already retired. */ }
      return { network: network.snapshot(), domContentLoaded, pageErrors, ui };
    },
    dispose() { network.dispose(); page.off('domcontentloaded', loaded); page.off('pageerror', errored); },
  });
}
