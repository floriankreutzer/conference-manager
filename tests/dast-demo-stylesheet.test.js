import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  readPolicyRows, readSummaryPolicyRows, validateZapReport,
} from '../scripts/validate-zap-report.mjs';
import { generateZapAutomationPlan } from '../scripts/generate-zap-plan.mjs';

const TARGET = 'https://conference-manager-demo.onrender.com/';
const ASSET = `${TARGET}assets/demo-security.css?v=20260830-77`;
const rows = readPolicyRows(readFileSync('.zap/customer-demo.tsv', 'utf8'));
const summary = readSummaryPolicyRows(readFileSync('.zap/customer-demo-summary.tsv', 'utf8'));
const riskPolicy = JSON.parse(readFileSync('.zap/reviewed-alert-risks.json', 'utf8'));

function validate({ uri = ASSET, alertRef = '90005-2', riskcode = '0', method = 'GET' } = {}) {
  return validateZapReport({
    surface: 'customer-demo', target: TARGET, policyRows: rows,
    summaryPolicyRows: summary, riskPolicy,
    automationPlan: generateZapAutomationPlan({ target: TARGET, summaryPolicyRows: summary }),
    addonManifest: [
      'Passive Scan Rules (Beta)\tpscanrulesBeta\tv1.2.3\tbeta\tSynthetic test manifest',
      'Passive Scan Rules (Alpha)\tpscanrulesAlpha\tv1.2.3\talpha\tSynthetic test manifest',
    ].join('\n'),
    report: { site: [{
      '@name': new URL(TARGET).origin, '@host': new URL(TARGET).hostname,
      '@port': '443', '@ssl': 'true',
      alerts: [{ pluginid: alertRef.split('-')[0], alertRef, riskcode, confidence: '3',
        instances: [{ uri, method }] }],
    }] },
  });
}

test('the known informational ZAP crawler observation is limited to the exact Demo stylesheet URL', () => {
  assert.deepEqual(rows.filter((row) => row.url === ASSET).map((row) => row.alertRef), ['90005-2', '10049-2', '90005-3', '90005-4', '90005-1']);
  for (const alertRef of ['90005-1', '90005-2', '90005-3', '90005-4', '10049-2']) {
    assert.equal(riskPolicy.surfaces['customer-demo'].maxRiskByAlertRef[alertRef], 0);
    assert.deepEqual(validate({ alertRef }), { instanceCount: 1, surface: 'customer-demo' });
    assert.throws(() => validate({ alertRef, riskcode: '1' }));
    assert.throws(() => validate({ alertRef, riskcode: '2' }));
    assert.throws(() => validate({ alertRef, method: 'POST' }));
    assert.throws(() => validate({ alertRef, uri: ASSET.replace('20260830-77', 'changed') }));
    assert.throws(() => validate({ alertRef, uri: ASSET.replace('conference-manager-demo', 'conference-manager-ops-demo') }));
  }
});

test('the stylesheet observation never accepts other URLs, alert subtypes, methods or higher risk', () => {
  for (const options of [
    { uri: `${TARGET}assets/demo-security.css?v=changed` },
    { uri: `${TARGET}api/v1/demo/session` },
    { uri: ASSET.replace('conference-manager-demo', 'conference-manager-ops-demo') },
    { alertRef: '90005-5' }, { alertRef: '10049-3' }, { riskcode: '1' }, { riskcode: '2' }, { method: 'POST' },
  ]) assert.throws(() => validate(options));
});

test('the deployed Manager stylesheet accepts only its reviewed informational findings', () => {
  const manager = `${TARGET}assets/manager-layout.css?v=20260919-92`;
  const refs = ['10049-2', '90005-1', '90005-2', '90005-3', '90005-4'];
  assert.deepEqual(rows.filter((row) => row.url === manager).map((row) => row.alertRef), refs);
  for (const alertRef of refs) {
    assert.deepEqual(validate({ uri: manager, alertRef }), { instanceCount: 1, surface: 'customer-demo' });
    assert.throws(() => validate({ uri: manager, alertRef, riskcode: '1' }));
    assert.throws(() => validate({ uri: manager, alertRef, method: 'POST' }));
    assert.throws(() => validate({ uri: manager.replace('20260919-92', 'changed'), alertRef }));
    assert.throws(() => validate({ uri: manager.replace('conference-manager-demo', 'conference-manager-ops-demo'), alertRef }));
  }
  for (const alertRef of ['10049-3', '90005-5', '10094-3', '10038']) {
    assert.throws(() => validate({ uri: manager, alertRef }));
  }
});
