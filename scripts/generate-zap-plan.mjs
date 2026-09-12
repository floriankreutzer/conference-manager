import { readFileSync, writeFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { exactUrlPattern, readSummaryPolicyRows } from './validate-zap-report.mjs';

const reportJob = (template, reportFile) => [
  '- parameters:',
  "    reportDescription: ''",
  '    reportDir: /zap/wrk/',
  `    reportFile: ${reportFile}`,
  '    reportTitle: ZAP Scanning Report',
  `    template: ${template}`,
  '  type: report',
];

export const generateZapAutomationPlan = ({ target, summaryPolicyRows }) => {
  let targetUrl;
  try {
    targetUrl = new URL(target);
  } catch (error) {
    throw new Error(`The ZAP target is invalid: ${error.message}`);
  }
  if (targetUrl.protocol !== 'https:'
      || targetUrl.username
      || targetUrl.password
      || targetUrl.hash
      || targetUrl.href !== target) {
    throw new Error('The ZAP target must be one canonical uncredentialed HTTPS URL.');
  }
  if (!Array.isArray(summaryPolicyRows) || summaryPolicyRows.length === 0) {
    throw new Error('The ZAP summary policy must contain at least one reviewed plugin.');
  }

  const normalizedTarget = targetUrl.href;
  const subtreePattern = `${exactUrlPattern(normalizedTarget).slice(0, -1)}.*$`;
  const jobs = [
    '- parameters:',
    '    enableTags: false',
    // Zero is ZAP's documented unlimited value. Exact evidence must never be truncated.
    '    maxAlertsPerRule: 0',
    '  rules:',
    '  - id: 90004',
    '    threshold: Medium',
    '  - id: 90005',
    '    threshold: Medium',
    '  type: passiveScan-config',
    '- parameters:',
    '    context: baseline',
    '    maxDuration: 1',
    `    url: ${normalizedTarget}`,
    '  type: spider',
    '- parameters:',
    '    maxDuration: 0',
    '  type: passiveScan-wait',
    '- parameters:',
    '    format: Long',
    '    summaryFile: /home/zap/zap_out.json',
    '  rules:',
    ...summaryPolicyRows.flatMap(({ pluginId }) => [
      '  - action: INFO',
      "    customMessage: ''",
      `    id: ${pluginId}`,
    ]),
    '  type: outputSummary',
    ...reportJob('traditional-html', 'report_html.html'),
    ...reportJob('traditional-md', 'report_md.md'),
    ...reportJob('traditional-json', 'report_json.json'),
  ];

  return [
    'env:',
    '  contexts:',
    '  - excludePaths: []',
    '    includePaths:',
    `    - ${subtreePattern}`,
    '    name: baseline',
    '    urls:',
    `    - ${normalizedTarget}`,
    '  parameters:',
    '    failOnError: true',
    '    progressToStdout: false',
    'jobs:',
    ...jobs,
    '',
  ].join('\n');
};

export const runZapPlanGeneration = ({ env = process.env } = {}) => {
  for (const name of ['ZAP_TARGET', 'ZAP_SUMMARY_POLICY_PATH', 'ZAP_AUTOMATION_PLAN_PATH']) {
    if (!env[name]) throw new Error(`Missing required environment variable ${name}.`);
  }
  const summaryPolicyRows = readSummaryPolicyRows(readFileSync(
    env.ZAP_SUMMARY_POLICY_PATH,
    'utf8',
  ));
  const plan = generateZapAutomationPlan({ target: env.ZAP_TARGET, summaryPolicyRows });
  writeFileSync(env.ZAP_AUTOMATION_PLAN_PATH, plan, { encoding: 'utf8', flag: 'wx' });
  return env.ZAP_AUTOMATION_PLAN_PATH;
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    console.log(`Generated uncapped ZAP Automation Framework plan at ${runZapPlanGeneration()}.`);
  } catch (error) {
    console.error(`::error::${error.message}`);
    process.exitCode = 1;
  }
}
