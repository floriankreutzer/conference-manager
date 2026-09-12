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
  exactUrlPattern,
  exactUrlUnionPattern,
  readPolicyRows,
  readSummaryPolicyRows,
  runZapReportValidation,
  validateAutomationPlan,
  validateZapReport,
} from '../scripts/validate-zap-report.mjs';
import { generateZapAutomationPlan } from '../scripts/generate-zap-plan.mjs';

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
  const planGenerator = read('scripts/generate-zap-plan.mjs');
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
  assert.match(dast, /pull_request:[\s\S]*\.zap\/\*\*[\s\S]*scripts\/generate-zap-plan[.]mjs[\s\S]*scripts\/validate-zap-report[.]mjs/);
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
  assert.doesNotMatch(dast, /rules_file_name:|zaproxy\/action-baseline/);
  assert.doesNotMatch(dast, /continue-on-error:/);
  assert.match(dast, /node scripts\/generate-zap-plan[.]mjs/);
  assert.match(dast, /docker image inspect --format '\{\{[.]Id\}\}'/);
  assert.match(dast, /--volume "\$GITHUB_WORKSPACE\/zap-evidence:\/zap\/wrk\/:rw"/);
  assert.doesNotMatch(dast, /--volume "\$GITHUB_WORKSPACE:\/zap\/wrk\/:rw"/);
  assert.match(dast, /zap[.]sh -cmd -autorun \/zap\/wrk\/zap[.]yaml/);
  assert.match(dast, /actions\/upload-artifact@043fb46d1a93c77aae656e7c1c64a875d1fc6a0a/);
  assert.match(dast, /ZAP_POLICY_PATH: \$\{\{ matrix\.exact_policy \}\}/);
  assert.match(dast, /ZAP_SUMMARY_POLICY_PATH: \$\{\{ matrix\.summary_rules \}\}/);
  assert.match(dast, /rm -rf -- zap-evidence[\s\S]*install -d -m 0777 zap-evidence/);
  assert.match(dast, /install -d -m 0777 zap-evidence/);
  assert.match(dast, /test ! -L zap-evidence/);
  assert.match(dast, /realpath -- "\$GITHUB_WORKSPACE"/);
  assert.match(dast, /test "\$actual_evidence_path" = "\$expected_evidence_path"/);
  assert.match(dast, /if: always\(\)[\s\S]*node scripts\/validate-zap-report[.]mjs/);
  assert.match(planGenerator, /maxAlertsPerRule: 0/);
  assert.doesNotMatch(planGenerator, /maxAlertsPerRule: 10/);

  const policies = [
    ['floriankreutzer.github.io', readPolicyRows(staticRules), readSummaryPolicyRows(staticSummaryRules)],
    ['conference-manager-demo.onrender.com', readPolicyRows(customerRules), readSummaryPolicyRows(customerSummaryRules)],
    ['conference-manager-ops-demo.onrender.com', readPolicyRows(platformRules), readSummaryPolicyRows(platformSummaryRules)],
  ];
  for (const [host, rows, summaryRows] of policies) {
    const rowKeys = rows.map(({ alertRef, url }) => `${alertRef}\u0000${url}`);
    assert.equal(new Set(rowKeys).size, rowKeys.length);
    for (const { alertRef, pattern, url } of rows) {
      assert.notEqual(alertRef, '*');
      assert.match(alertRef, /^\d+(?:-\d+)?$/);
      assert.equal(new URL(url).hostname, host);
      assert.equal(pattern, exactUrlPattern(url));
    }
    for (const { pluginId, pattern } of summaryRows) {
      const urls = rows
        .filter(({ alertRef }) => alertRef.split('-', 1)[0] === pluginId)
        .map(({ url }) => url);
      assert.equal(pattern, exactUrlUnionPattern(urls));
    }
  }

  const uniqueRefs = (rules) => [...new Set(readPolicyRows(rules).map(({ alertRef }) => alertRef))];
  assert.deepEqual(uniqueRefs(customerRules), [
    '10015', '10049-2', '10055-12', '90005-1', '90005-2', '90005-3', '90005-4',
  ]);
  assert.deepEqual(uniqueRefs(platformRules), [
    '10015', '10049-2', '10055-12', '90005-1', '90005-2', '90005-3', '90005-4',
  ]);
  assert.deepEqual(uniqueRefs(staticRules), [
    '10015', '10020-1', '10021', '10035-1', '10049-3', '10050-1', '10050-2',
    '10055-6', '10055-12', '10055-13', '10063-1', '10094-3', '10098',
    '90004-2', '90004-3', '90005-1', '90005-2', '90005-3', '90005-4',
  ]);
  assert.doesNotMatch(`${staticRules}\n${customerRules}\n${platformRules}`, /^(?:10049|10055|90004|90005)\t/m);
  assert.doesNotMatch(`${staticRules}\n${customerRules}\n${platformRules}`, /^(?:10003|10010|10011|10017|10019|10038|10054|10062|10105|10202)\t/m);

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

const automationPlanFixture = ({
  target = 'https://example.test/',
  summaryRows = readSummaryPolicyRows(`10049\tINFO\t${exactUrlPattern('https://example.test/')}`),
  jsonReportBeforeSpider = false,
} = {}) => {
  const targetUrl = new URL(target);
  const normalizedTarget = targetUrl.href;
  const passiveConfigJob = [
    '- parameters:',
    '    enableTags: false',
    '    maxAlertsPerRule: 0',
    '  type: passiveScan-config',
  ];
  const spiderJob = [
    '- parameters:',
    '    maxDuration: 1',
    '    subtreeOnly: true',
    `    url: ${normalizedTarget}`,
    '  type: spider',
  ];
  const passiveWaitJob = [
    '- parameters:',
    '    maxDuration: 0',
    '  type: passiveScan-wait',
  ];
  const outputSummaryJob = [
    '- parameters:',
    '    format: Long',
    '    summaryFile: /home/zap/zap_out.json',
    '  rules:',
    ...summaryRows.flatMap(({ pluginId }) => [
      '  - action: INFO',
      "    customMessage: ''",
      `    id: ${pluginId}`,
    ]),
    '  type: outputSummary',
  ];
  const reportJob = (template, reportFile) => [
    '- parameters:',
    "    reportDescription: ''",
    '    reportDir: /zap/wrk/',
    `    reportFile: ${reportFile}`,
    '    reportTitle: ZAP Scanning Report',
    `    template: ${template}`,
    '  type: report',
  ];
  const htmlReportJob = reportJob('traditional-html', 'report_html.html');
  const markdownReportJob = reportJob('traditional-md', 'report_md.md');
  const jsonReportJob = reportJob('traditional-json', 'report_json.json');
  const jobs = jsonReportBeforeSpider
    ? [passiveConfigJob, jsonReportJob, spiderJob, passiveWaitJob,
      outputSummaryJob, htmlReportJob, markdownReportJob]
    : [passiveConfigJob, spiderJob, passiveWaitJob,
      outputSummaryJob, htmlReportJob, markdownReportJob, jsonReportJob];
  return [
    'env:',
    '  contexts:',
    '  - excludePaths: []',
    '    name: baseline',
    '    urls:',
    `    - ${normalizedTarget}`,
    '  parameters:',
    '    failOnError: true',
    '    progressToStdout: false',
    'jobs:',
    ...jobs.flat(),
    '',
  ].join('\n');
};

test('repository-generated ZAP plans preserve every passive finding', () => {
  const summaryRows = readSummaryPolicyRows(
    `10049\tINFO\t${exactUrlPattern('https://example.test/')}`,
  );
  const plan = generateZapAutomationPlan({
    target: 'https://example.test/',
    summaryPolicyRows: summaryRows,
  });
  assert.equal(plan, automationPlanFixture({ summaryRows }));
  assert.doesNotThrow(() => validateAutomationPlan(
    plan,
    'https://example.test/',
    summaryRows,
  ));
  assert.throws(
    () => validateAutomationPlan(
      plan.replace('maxAlertsPerRule: 0', 'maxAlertsPerRule: 10'),
      'https://example.test/',
      summaryRows,
    ),
    /unlimited alert evidence/,
  );
});

test('repository-generated ZAP plans do not broaden a path target to its origin root', () => {
  const summaryRows = readSummaryPolicyRows(
    `10049\tINFO\t${exactUrlPattern('https://example.test/application/')}`,
  );
  const plan = generateZapAutomationPlan({
    target: 'https://example.test/application/',
    summaryPolicyRows: summaryRows,
  });
  assert.match(plan, /    - https:\/\/example[.]test\/application\//);
  assert.match(plan, /    url: https:\/\/example[.]test\/application\//);
  assert.doesNotMatch(plan, /^    - https:\/\/example[.]test\/$/m);
  assert.doesNotThrow(() => validateAutomationPlan(
    plan,
    'https://example.test/application/',
    summaryRows,
  ));
});

const exactPolicyFixture = () => ({
  rows: readPolicyRows(`10049-2\tOUTOFSCOPE\t${exactUrlPattern('https://example.test/')}`),
  summaryRows: readSummaryPolicyRows(`10049\tINFO\t${exactUrlPattern('https://example.test/')}`),
  riskPolicy: {
    schemaVersion: 1,
    surfaces: {
      example: {
        origin: 'https://example.test',
        maxRiskByAlertRef: { '10049-2': 0 },
      },
    },
  },
  plan: automationPlanFixture(),
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

test('generated ZAP plan binds ordered unfiltered summary evidence after the scan', () => {
  const pattern = exactUrlPattern('https://example.test/');
  const summaryRows = readSummaryPolicyRows([
    `10049\tINFO\t${pattern}`,
    `10055\tINFO\t${pattern}`,
  ].join('\n'));
  const plan = automationPlanFixture({ summaryRows });
  assert.doesNotThrow(() => validateAutomationPlan(plan, 'https://example.test/', summaryRows));

  const reversedRules = automationPlanFixture({ summaryRows: [...summaryRows].reverse() });
  assert.throws(
    () => validateAutomationPlan(reversedRules, 'https://example.test/', summaryRows),
    /outputSummary job/,
  );
  const missingRule = plan.replace(
    "  - action: INFO\n    customMessage: ''\n    id: 10055\n",
    '',
  );
  assert.throws(
    () => validateAutomationPlan(missingRule, 'https://example.test/', summaryRows),
    /outputSummary job/,
  );
  const extraRule = plan.replace(
    '  type: outputSummary',
    "  - action: INFO\n    customMessage: ''\n    id: 99999\n  type: outputSummary",
  );
  assert.throws(
    () => validateAutomationPlan(extraRule, 'https://example.test/', summaryRows),
    /outputSummary job/,
  );
});

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

  const wrongPlanUrl = automationPlanFixture({ target: 'https://example.test/wrong/' });
  assert.throws(() => validateFixture(reportFixture(), { automationPlan: wrongPlanUrl }), /environment/);

  const alertFilterPlan = exactPolicyFixture().plan.replace('  type: spider', '  type: alertFilter');
  assert.throws(
    () => validateFixture(reportFixture(), { automationPlan: alertFilterPlan }),
    /raw-report order/,
  );

  const earlyReportPlan = automationPlanFixture({ jsonReportBeforeSpider: true });
  assert.throws(
    () => validateFixture(reportFixture(), { automationPlan: earlyReportPlan }),
    /raw-report order/,
  );

  const disabledPassivePlan = exactPolicyFixture().plan.replace('    enableTags: false', '    enableTags: true');
  assert.throws(
    () => validateFixture(reportFixture(), { automationPlan: disabledPassivePlan }),
    /passiveScan-config job/,
  );

  const truncatedSpiderPlan = exactPolicyFixture().plan.replace('    maxDuration: 1', '    maxDuration: 0');
  assert.throws(
    () => validateFixture(reportFixture(), { automationPlan: truncatedSpiderPlan }),
    /spider target/,
  );

  const unboundedSpiderPlan = exactPolicyFixture().plan.replace('    subtreeOnly: true\n', '');
  assert.throws(
    () => validateFixture(reportFixture(), { automationPlan: unboundedSpiderPlan }),
    /subtree boundary/,
  );

  const disabledSubtreePlan = exactPolicyFixture().plan.replace('    subtreeOnly: true', '    subtreeOnly: false');
  assert.throws(
    () => validateFixture(reportFixture(), { automationPlan: disabledSubtreePlan }),
    /subtree boundary/,
  );

  const truncatedWaitPlan = exactPolicyFixture().plan.replace(
    '  type: passiveScan-wait',
    '    unexpected: true\n  type: passiveScan-wait',
  );
  assert.throws(
    () => validateFixture(reportFixture(), { automationPlan: truncatedWaitPlan }),
    /passiveScan-wait job/,
  );

  const rewrittenSummaryPlan = exactPolicyFixture().plan.replace('  - action: INFO', '  - action: WARN');
  assert.throws(
    () => validateFixture(reportFixture(), { automationPlan: rewrittenSummaryPlan }),
    /outputSummary job/,
  );

  const earlyJsonTargetPlan = exactPolicyFixture().plan.replace(
    '    reportFile: report_json.json',
    '    reportFile: report_json_early.json',
  );
  assert.throws(
    () => validateFixture(reportFixture(), { automationPlan: earlyJsonTargetPlan }),
    /traditional-json report job/,
  );

  const bareRows = readPolicyRows(`10049\tOUTOFSCOPE\t${exactUrlPattern('https://example.test/')}`);
  assert.throws(() => validateFixture(reportFixture(), { policyRows: bareRows }), /differ/);

  const duplicateRows = [...exactPolicyFixture().rows, ...exactPolicyFixture().rows];
  assert.throws(() => validateFixture(reportFixture(), { policyRows: duplicateRows }), /duplicate/);

  const badMaximum = exactPolicyFixture().riskPolicy;
  badMaximum.surfaces.example.maxRiskByAlertRef['10049-2'] = null;
  assert.throws(() => validateFixture(reportFixture(), { riskPolicy: badMaximum }), /maximum risk/);

  const driftedSummary = readSummaryPolicyRows(`10055\tINFO\t${exactUrlPattern('https://example.test/')}`);
  assert.throws(() => validateFixture(reportFixture(), { summaryPolicyRows: driftedSummary }), /exact projection/);
  const changedPatternSummary = readSummaryPolicyRows(
    `10049\tINFO\t${exactUrlPattern('https://example.test/path')}`,
  );
  assert.throws(
    () => validateFixture(reportFixture(), { summaryPolicyRows: changedPatternSummary }),
    /canonical exact-URL projection/,
  );
  const overbroadSummary = readSummaryPolicyRows('10049\tINFO\t^https://example\\.test/(?:.)+$');
  assert.throws(
    () => validateFixture(reportFixture(), { summaryPolicyRows: overbroadSummary }),
    /canonical exact-URL projection/,
  );
  assert.throws(
    () => readSummaryPolicyRows(`10049-2\tINFO\t${exactUrlPattern('https://example.test/')}`),
    /unsuffixed/,
  );
  assert.throws(
    () => readSummaryPolicyRows(`10049\tIGNORE\t${exactUrlPattern('https://example.test/')}`),
    /must use INFO/,
  );

  const broadPolicy = '10049-2\tOUTOFSCOPE\t^https://example\\.test/(?:.)+$';
  assert.throws(() => readPolicyRows(broadPolicy), /wildcard or expression/);
  const alternationPolicy = '10049-2\tOUTOFSCOPE\t^https://example\\.test/$|^https://other\\.test/$';
  assert.throws(() => readPolicyRows(alternationPolicy), /wildcard or expression/);

  const secondUrl = 'https://example.test/second';
  const multiRows = readPolicyRows([
    `10049-2\tOUTOFSCOPE\t${exactUrlPattern('https://example.test/')}`,
    `10049-2\tOUTOFSCOPE\t${exactUrlPattern(secondUrl)}`,
  ].join('\n'));
  const multiSummaryRows = readSummaryPolicyRows(
    `10049\tINFO\t${exactUrlUnionPattern(multiRows.map(({ url }) => url))}`,
  );
  const multiPlan = automationPlanFixture({ summaryRows: multiSummaryRows });
  assert.deepEqual(
    validateFixture(reportFixture({ uri: secondUrl }), {
      policyRows: multiRows,
      summaryPolicyRows: multiSummaryRows,
      automationPlan: multiPlan,
    }),
    { instanceCount: 1, surface: 'example' },
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
    writeFileSync(paths.rules, `10049-2\tOUTOFSCOPE\t${exactUrlPattern('https://example.test/')}`);
    writeFileSync(paths.summaryRules, `10049\tINFO\t${exactUrlPattern('https://example.test/')}`);
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
