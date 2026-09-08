import assert from 'node:assert/strict';
import {
  mkdtempSync,
  readFileSync,
  rmSync,
  utimesSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import {
  readPolicyRows,
  readSummaryPolicyRows,
  runZapReportValidation,
  validateZapReport,
} from '../scripts/validate-zap-report.mjs';

const read = (path) => readFileSync(new URL(`../${path}`, import.meta.url), 'utf8');

test('Demo automatic image and QR paths cannot use a cross-origin network source', () => {
  const index = read('index.html');
  const parityData = read('src/shared/parity-data.js');
  const welcomePrint = read('src/employee/welcome-print.js');
  const routeCode = read('assets/demo/route-openstreetmap.svg');
  const runtimeSources = `${index}\n${parityData}\n${welcomePrint}`;

  const csp = index.match(/http-equiv="Content-Security-Policy" content="([^"]+)"/)?.[1];
  assert.ok(csp, 'The Customer Demo artifact must declare a CSP.');
  const imageDirective = csp.match(/(?:^|;)\s*img-src\s+([^;]+)/)?.[1].trim().split(/\s+/);
  assert.deepEqual(imageDirective, ["'self'", 'data:']);
  assert.match(csp, /(?:^|;)\s*connect-src 'self'(?:;|$)/);

  assert.doesNotMatch(runtimeSources, /images\.unsplash\.com/i);
  assert.doesNotMatch(runtimeSources, /api\.qrserver\.com/i);
  assert.match(parityData, /data:image\/svg\+xml;charset=UTF-8,/);
  assert.match(welcomePrint, /assets\/demo\/route-openstreetmap\.svg/);
  assert.match(routeCode, /<svg[^>]+viewBox="0 0 33 33"/);
});

test('GitHub Pages remains static while DAST covers every public Demo surface independently', () => {
  const demoSecurity = read('docs/DEMO-SECURITY.md');
  const productionSecurity = read('docs/PRODUCTION-SECURITY.md');
  const portal = read('demo-portal/index.html');
  const dast = read('.github/workflows/dast.yml');
  const staticRules = read('.zap/static-launchpad.tsv');
  const customerRules = read('.zap/customer-demo.tsv');
  const platformRules = read('.zap/platform-demo.tsv');
  const staticSummaryRules = read('.zap/static-launchpad-summary.tsv');
  const customerSummaryRules = read('.zap/customer-demo-summary.tsv');
  const platformSummaryRules = read('.zap/platform-demo-summary.tsv');
  for (const document of [demoSecurity, productionSecurity]) {
    assert.match(document, /GitHub Pages/i);
    assert.match(document, /static (?:GitHub Pages )?(?:Demo )?launchpad/i);
    assert.match(document, /Render/i);
  }
  assert.doesNotMatch(portal, /<script\b|<iframe\b|localStorage|sessionStorage|fetch\(/i);
  assert.match(portal, /https:\/\/conference-manager-demo\.onrender\.com/);
  assert.match(portal, /https:\/\/conference-manager-ops-demo\.onrender\.com/);
  assert.match(dast, /surface: static-launchpad/);
  assert.match(dast, /surface: customer-demo/);
  assert.match(dast, /surface: platform-demo/);
  assert.match(dast, /https:\/\/floriankreutzer\.github\.io\/conference-manager\//);
  assert.match(dast, /https:\/\/conference-manager-demo\.onrender\.com\//);
  assert.match(dast, /https:\/\/conference-manager-ops-demo\.onrender\.com\//);
  assert.match(dast, /pull_request:[\s\S]*\.zap\/\*\*[\s\S]*scripts\/validate-zap-report[.]mjs/);
  assert.match(dast, /push:[\s\S]*branches:[\s\S]*- main[\s\S]*\.zap\/\*\*/);
  assert.match(dast, /scripts\/validate-zap-report[.]mjs/);
  assert.match(dast, /Wait for public surface readiness/);
  assert.match(dast, /persist-credentials: false/);
  assert.match(dast, /--connect-timeout 10/);
  assert.match(dast, /--max-time 10/);
  assert.doesNotMatch(dast, /--location|(?:^|\s)-I(?:\s|$)/m);
  assert.match(dast, /https:\/\/conference-manager-demo\.onrender\.com\/api\/v1\/health\/ready/);
  assert.match(dast, /https:\/\/conference-manager-ops-demo\.onrender\.com\/api\/v1\/platform\/health\/ready/);
  assert.match(dast, /status.*== '200'/);
  assert.doesNotMatch(dast, /rules_file_name:/);
  assert.doesNotMatch(dast, /continue-on-error:/);
  assert.match(dast, /fail_action:\s*true/);
  assert.match(dast, /cmd_options: '-a --auto -c \$\{\{ matrix\.summary_rules \}\}'/);
  assert.match(dast, /ZAP_POLICY_PATH: \$\{\{ matrix\.exact_policy \}\}/);
  assert.match(dast, /ZAP_SUMMARY_POLICY_PATH: \$\{\{ matrix\.summary_rules \}\}/);
  assert.match(dast, /rm -f report_json[.]json zap[.]yaml/);
  assert.match(dast, /if: always\(\)[\s\S]*node scripts\/validate-zap-report[.]mjs/);

  const policyRows = (rules) => rules
    .trim()
    .split('\n')
    .filter((line) => line && !line.startsWith('#'))
    .map((line) => {
      const columns = line.split('\t');
      assert.equal(columns.length, 3);
      return columns;
    });

  const policies = [
    ['floriankreutzer[.]github[.]io', policyRows(staticRules)],
    ['conference-manager-demo[.]onrender[.]com', policyRows(customerRules)],
    ['conference-manager-ops-demo[.]onrender[.]com', policyRows(platformRules)],
  ];
  for (const [host, rows] of policies) {
    for (const [id, action, value] of rows) {
      assert.notEqual(id, '*');
      assert.match(id, /^\d+(?:-\d+)?$/);
      assert.equal(action, 'OUTOFSCOPE');
      assert.match(value, /^\^https:\/\//);
      assert.match(value, /\$$/);
      assert.ok(value.includes(host));
      assert.doesNotMatch(value, /\.\*/);
      assert.doesNotThrow(() => new RegExp(value));
    }
  }

  assert.deepEqual(policyRows(customerRules).map(([id]) => id), [
    '10015', '10049-2', '10055-12', '90005-1', '90005-2', '90005-3', '90005-4',
  ]);
  assert.deepEqual(policyRows(platformRules).map(([id]) => id), [
    '10015', '10049-2', '10055-12', '90005-1', '90005-2', '90005-3', '90005-4',
  ]);
  assert.deepEqual(policyRows(staticRules).map(([id]) => id), [
    '10015', '10020-1', '10021', '10035-1', '10049-3', '10050-1', '10050-2',
    '10055-6', '10055-12', '10055-13', '10063-1', '10094-3', '10098',
    '90004-2', '90004-3', '90005-1', '90005-2', '90005-3', '90005-4',
  ]);
  assert.doesNotMatch(`${staticRules}\n${customerRules}\n${platformRules}`, /^(?:10049|10055|90004|90005)\t/m);
  assert.doesNotMatch(`${staticRules}\n${customerRules}\n${platformRules}`, /^(?:10003|10010|10011|10017|10019|10038|10054|10062|10105|10202)\t/m);

  const summaryPolicies = [
    ['floriankreutzer[.]github[.]io', readSummaryPolicyRows(staticSummaryRules)],
    ['conference-manager-demo[.]onrender[.]com', readSummaryPolicyRows(customerSummaryRules)],
    ['conference-manager-ops-demo[.]onrender[.]com', readSummaryPolicyRows(platformSummaryRules)],
  ];
  for (const [host, rows] of summaryPolicies) {
    for (const { pluginId, pattern } of rows) {
      assert.match(pluginId, /^\d+$/);
      assert.ok(pattern.includes(host));
      assert.doesNotMatch(pattern, /\.\*/);
    }
  }
  assert.deepEqual(readSummaryPolicyRows(customerSummaryRules).map(({ pluginId }) => pluginId), [
    '10015', '10049', '10055', '90005',
  ]);
  assert.deepEqual(readSummaryPolicyRows(platformSummaryRules).map(({ pluginId }) => pluginId), [
    '10015', '10049', '10055', '90005',
  ]);
  assert.deepEqual(readSummaryPolicyRows(staticSummaryRules).map(({ pluginId }) => pluginId), [
    '10015', '10020', '10021', '10035', '10049', '10050',
    '10055', '10063', '10094', '10098', '90004', '90005',
  ]);
});

const exactPolicyFixture = () => ({
  rows: readPolicyRows('10049-2\tOUTOFSCOPE\t^https://example[.]test/$'),
  summaryRows: readSummaryPolicyRows('10049\tINFO\t^https://example[.]test/$'),
  riskPolicy: {
    schemaVersion: 1,
    surfaces: {
      example: {
        origin: 'https://example.test',
        maxRiskByAlertRef: { '10049-2': 0 },
      },
    },
  },
  plan: 'jobs:\n- type: spider\n',
});

const reportFixture = ({
  alertRef = '10049-2',
  pluginid = '10049',
  riskcode = '0',
  confidence = '2',
  uri = 'https://example.test/',
  method = 'GET',
  instances,
} = {}) => ({
  site: [{
    '@name': 'https://example.test',
    '@host': 'example.test',
    '@port': '443',
    '@ssl': 'true',
    alerts: [{
      pluginid,
      alertRef,
      riskcode,
      confidence,
      instances: instances ?? [{ uri, method }],
    }],
  }],
});

const validateFixture = (report, overrides = {}) => {
  const fixture = exactPolicyFixture();
  return validateZapReport({
    report,
    policyRows: fixture.rows,
    summaryPolicyRows: fixture.summaryRows,
    riskPolicy: fixture.riskPolicy,
    surface: 'example',
    target: 'https://example.test/',
    automationPlan: fixture.plan,
    ...overrides,
  });
};

test('exact ZAP policy accepts only the reviewed alert reference, URL and risk', () => {
  assert.deepEqual(validateFixture(reportFixture()), { instanceCount: 1, surface: 'example' });
  assert.throws(() => validateFixture(reportFixture({ alertRef: '10049-3' })), /Unreviewed/);
  assert.throws(() => validateFixture(reportFixture({ alertRef: '90005-5', pluginid: '90005' })), /Unreviewed/);
  assert.throws(() => validateFixture(reportFixture({ uri: 'https://example.test/new' })), /matched 0/);
  assert.throws(() => validateFixture(reportFixture({ confidence: '0' })), /unfiltered raw/);
  assert.throws(() => validateFixture(reportFixture({ confidence: 2 })), /unfiltered raw/);
  assert.throws(() => validateFixture(reportFixture({ riskcode: '1' })), /exceeds/);
  assert.throws(() => validateFixture(reportFixture({ riskcode: null })), /canonical risk/);
  assert.throws(() => validateFixture(reportFixture({ riskcode: '' })), /canonical risk/);
  assert.throws(() => validateFixture(reportFixture({ riskcode: '-1' })), /canonical risk/);
  assert.throws(() => validateFixture(reportFixture({ riskcode: '4' })), /canonical risk/);
  assert.throws(() => validateFixture(reportFixture({ uri: 'https://other.test/' })), /escaped/);
  assert.throws(() => validateFixture(reportFixture({ uri: 'https://example.test/?changed=1' })), /matched 0/);
  assert.throws(() => validateFixture(reportFixture({ instances: [] })), /no reviewable instances/);

  const cleanReport = reportFixture();
  cleanReport.site[0].alerts = [];
  assert.deepEqual(validateFixture(cleanReport), { instanceCount: 0, surface: 'example' });

  const wrongSite = structuredClone(cleanReport);
  wrongSite.site[0]['@name'] = 'https://wrong.example';
  wrongSite.site[0]['@host'] = 'wrong.example';
  assert.throws(() => validateFixture(wrongSite), /site metadata/);
  assert.throws(() => validateFixture({ site: [...cleanReport.site, ...cleanReport.site] }), /exactly one/);
  assert.throws(() => validateFixture(reportFixture(), {
    automationPlan: 'jobs:\n- type: alertFilter\n',
  }), /must not filter/);

  const bareRows = readPolicyRows('10049\tOUTOFSCOPE\t^https://example[.]test/$');
  assert.throws(() => validateFixture(reportFixture(), { policyRows: bareRows }), /differ/);

  const duplicateRows = [...exactPolicyFixture().rows, ...exactPolicyFixture().rows];
  assert.throws(() => validateFixture(reportFixture(), { policyRows: duplicateRows }), /duplicate/);

  const badMaximum = exactPolicyFixture().riskPolicy;
  badMaximum.surfaces.example.maxRiskByAlertRef['10049-2'] = null;
  assert.throws(() => validateFixture(reportFixture(), { riskPolicy: badMaximum }), /maximum risk/);

  const driftedSummary = readSummaryPolicyRows('10055\tINFO\t^https://example[.]test/$');
  assert.throws(() => validateFixture(reportFixture(), { summaryPolicyRows: driftedSummary }), /exact projection/);
  const changedPatternSummary = readSummaryPolicyRows('10049\tINFO\t^https://example[.]test/path$');
  assert.throws(() => validateFixture(reportFixture(), { summaryPolicyRows: changedPatternSummary }), /preserve/);
  assert.throws(
    () => readSummaryPolicyRows('10049-2\tINFO\t^https://example[.]test/$'),
    /unsuffixed/,
  );
  assert.throws(
    () => readSummaryPolicyRows('10049\tIGNORE\t^https://example[.]test/$'),
    /must use INFO/,
  );
});

test('ZAP report validation fails closed for missing, malformed and stale generated evidence', () => {
  const directory = mkdtempSync(join(tmpdir(), 'zap-policy-'));
  try {
    const fixture = exactPolicyFixture();
    const paths = {
      report: join(directory, 'report.json'),
      rules: join(directory, 'rules.tsv'),
      summaryRules: join(directory, 'summary-rules.tsv'),
      risks: join(directory, 'risks.json'),
      plan: join(directory, 'zap.yaml'),
    };
    writeFileSync(paths.rules, '10049-2\tOUTOFSCOPE\t^https://example[.]test/$');
    writeFileSync(paths.summaryRules, '10049\tINFO\t^https://example[.]test/$');
    writeFileSync(paths.risks, JSON.stringify(fixture.riskPolicy));
    writeFileSync(paths.plan, fixture.plan);
    const env = {
      ZAP_REPORT_PATH: paths.report,
      ZAP_POLICY_PATH: paths.rules,
      ZAP_SUMMARY_POLICY_PATH: paths.summaryRules,
      ZAP_RISK_POLICY_PATH: paths.risks,
      ZAP_AUTOMATION_PLAN_PATH: paths.plan,
      ZAP_SURFACE: 'example',
      ZAP_TARGET: 'https://example.test/',
      ZAP_SCAN_STARTED_AT_MS: String(Date.now() - 5_000),
    };
    assert.throws(() => runZapReportValidation({ env }), /report is unavailable/);
    writeFileSync(paths.report, '{');
    assert.throws(() => runZapReportValidation({ env }), /not valid JSON/);
    writeFileSync(paths.report, JSON.stringify(reportFixture()));
    assert.deepEqual(runZapReportValidation({ env }), { instanceCount: 1, surface: 'example' });

    const old = new Date(Date.now() - 60_000);
    utimesSync(paths.report, old, old);
    env.ZAP_SCAN_STARTED_AT_MS = String(Date.now());
    assert.throws(() => runZapReportValidation({ env }), /predates this scan/);

    writeFileSync(paths.report, JSON.stringify(reportFixture()));
    rmSync(paths.plan);
    env.ZAP_SCAN_STARTED_AT_MS = String(Date.now() - 5_000);
    assert.throws(() => runZapReportValidation({ env }), /automation plan is unavailable/);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
