import { localSharedDemoDiagnosticsEnabled, observeLocalDemoNetwork } from './local-demo-network-diagnostics.js';

const PHASES = new Set(['initial', 'rooms', 'services', 'equipment', 'catering-items', 'catering-packages']);

export function localCsvDiagnosticsEnabled(options) { return localSharedDemoDiagnosticsEnabled(options); }

// Preserve the established CSV diagnostic shape while sharing only the bounded,
// credential-free local network observer with context-switch evidence.
export function observeLocalCsvBootstrap(page, enabled) {
  const network = observeLocalDemoNetwork(page, enabled, 'csv-bootstrap');
  if (!network) return null;
  let phase = 'initial';
  return Object.freeze({
    start(value) {
      if (!PHASES.has(value)) throw new Error('CSV_DIAGNOSTIC_PHASE_INVALID');
      phase = value; network.start();
    },
    stop: network.stop,
    snapshot() {
      const { overflow, requests } = network.snapshot();
      return { phase, overflow, requests: requests.map(({ method: _method, ...entry }) => entry) };
    },
    dispose: network.dispose,
  });
}

// Attempt every cleanup independently. A reset failure must neither hide the
// journey failure nor prevent either browser context from being closed.
export async function cleanupCsvContexts({ seeded, reset, customer, platform }) {
  const result = { reset: 'not_needed', customer: 'failed', platform: 'failed' };
  if (seeded) {
    try { await reset(platform); result.reset = 'passed'; }
    catch { result.reset = 'failed'; }
  }
  for (const [name, context] of [['customer', customer], ['platform', platform]]) {
    try { await context.close(); result[name] = 'passed'; }
    catch { result[name] = 'failed'; }
  }
  return result;
}

export function csvTestFailure(primaryError, cleanup, diagnosticFailed = false) {
  if (primaryError !== undefined) return primaryError;
  if (Object.values(cleanup).includes('failed')) return new Error('CSV_CLEANUP_NOT_VERIFIED');
  if (diagnosticFailed) return new Error('CSV_DIAGNOSTIC_ATTACHMENT_FAILED');
  return undefined;
}
