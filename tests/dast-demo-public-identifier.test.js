import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import {
  readPolicyRows, readSummaryPolicyRows, validateZapReport,
} from '../scripts/validate-zap-report.mjs';
import { generateZapAutomationPlan } from '../scripts/generate-zap-plan.mjs';

const TARGET = 'https://conference-manager-demo.onrender.com/';
const ASSET = `${TARGET}src/platform/demo-bootstrap.js?v=20260919-92`;
const IDENTIFIER = 'createDemoMicrosoft365ConnectionApi';
const rows = readPolicyRows(readFileSync('.zap/customer-demo.tsv', 'utf8'));
const summary = readSummaryPolicyRows(readFileSync('.zap/customer-demo-summary.tsv', 'utf8'));
const riskPolicy = JSON.parse(readFileSync('.zap/reviewed-alert-risks.json', 'utf8'));

function validate({ uri = ASSET, alertRef = '10094-3', riskcode = '0', method = 'GET', evidence = IDENTIFIER, param = '', attack = '' } = {}) {
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
        instances: [{ uri, method, evidence, param, attack }] }],
    }] },
  });
}

test('the reviewed public identifier is informational and limited to its exact Customer asset', () => {
  assert.deepEqual(rows.filter((row) => row.url === ASSET).map((row) => row.alertRef), ['10094-3']);
  assert.equal(riskPolicy.surfaces['customer-demo'].maxRiskByAlertRef['10094-3'], 0);
  assert.equal(riskPolicy.surfaces['platform-demo'].maxRiskByAlertRef['10094-3'], undefined);
  assert.equal(riskPolicy.surfaces['static-launchpad'].maxRiskByAlertRef['10094-3'], undefined);
  assert.deepEqual(validate(), { instanceCount: 1, surface: 'customer-demo' });
});

test('changed Base64 evidence, request, URL, subtype or risk remains blocking', () => {
  for (const options of [
    { evidence: 'c2VjcmV0' }, { evidence: undefined }, { evidence: '' },
    { evidence: `${IDENTIFIER}X` }, { param: 'token' }, { attack: 'c2VjcmV0' },
    { uri: `${TARGET}src/platform/demo-bootstrap.js?v=changed` },
    { uri: `${TARGET}api/v1/demo/session` },
    { uri: ASSET.replace('conference-manager-demo', 'conference-manager-ops-demo') },
    { alertRef: '10094-1' }, { alertRef: '10094-2' }, { alertRef: '10094' },
    { riskcode: '1' }, { riskcode: '2' }, { method: 'POST' },
  ]) {
    // Explicit missing evidence must not fall back to the fixture default.
    if (Object.hasOwn(options, 'evidence') && options.evidence === undefined) options.evidence = null;
    assert.throws(() => validate(options));
  }
});
