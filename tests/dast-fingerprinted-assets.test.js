import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { readPolicyRows, readSummaryPolicyRows, validateZapReport } from '../scripts/validate-zap-report.mjs';
import { generateZapAutomationPlan } from '../scripts/generate-zap-plan.mjs';

const riskPolicy = JSON.parse(readFileSync('.zap/reviewed-alert-risks.json', 'utf8'));
const addonManifest = [
  'Passive Scan Rules (Beta)\tpscanrulesBeta\tv1.2.3\tbeta\tSynthetic test manifest',
  'Passive Scan Rules (Alpha)\tpscanrulesAlpha\tv1.2.3\talpha\tSynthetic test manifest',
].join('\n');

for (const surface of ['customer-demo', 'platform-demo']) {
  const target = `${riskPolicy.surfaces[surface].origin}/`;
  const policyRows = readPolicyRows(readFileSync(`.zap/${surface}.tsv`, 'utf8'));
  const summaryPolicyRows = readSummaryPolicyRows(readFileSync(`.zap/${surface}-summary.tsv`, 'utf8'));
  const uri = policyRows.find((row) => row.alertRef === '10049-3').url;
  const validate = (changes = {}, riskcode = '0') => validateZapReport({
    surface, target, policyRows, summaryPolicyRows, riskPolicy, addonManifest,
    automationPlan: generateZapAutomationPlan({ target, summaryPolicyRows }),
    report: { site: [{
      '@name': new URL(target).origin, '@host': new URL(target).hostname,
      '@port': '443', '@ssl': 'true',
      alerts: [{ pluginid: '10049', alertRef: '10049-3', riskcode, confidence: '3',
        instances: [{ uri, method: 'GET', evidence: 'max-age=31536000', param: '', attack: '', ...changes }] }],
    }] },
  });

  test(`${surface} immutable cache review rejects changed content, evidence and authority`, () => {
    for (const row of policyRows.filter((candidate) => candidate.alertRef === '10049-3')) {
      assert.deepEqual(validate({ uri: row.url }), { instanceCount: 1, surface });
    }
    for (const changes of [
      { uri: uri.replace(/sha256=.{64}$/, `sha256=${'f'.repeat(64)}`) },
      { uri: uri.split('?')[0] }, { uri: `${target}api/v1/demo/session` },
      { evidence: 'max-age=31536001' }, { evidence: '' }, { evidence: undefined },
      { param: 'token' }, { attack: 'secret' }, { method: 'POST' },
    ]) assert.throws(() => validate(changes));
    assert.throws(() => validate({}, '1'));
    assert.throws(() => validate({}, '2'));
  });
}
