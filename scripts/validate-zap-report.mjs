import { readFileSync, statSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const readJson = (path, label) => {
  let source;
  try {
    source = readFileSync(path, 'utf8');
  } catch (error) {
    throw new Error(`${label} is unavailable: ${error.message}`);
  }
  try {
    return JSON.parse(source);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${error.message}`);
  }
};

const readRows = (source) => source
  .split('\n')
  .filter((line) => line.trim() && !line.trimStart().startsWith('#'));

const REGEX_META = new Set('\\^$.*+?()[]{}|');

export const exactUrlPattern = (url) => `^${url.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')}$`;

const exactUrlFromPattern = (pattern, label) => {
  if (!pattern.startsWith('^') || !pattern.endsWith('$')) {
    throw new Error(`${label} must use a fully anchored exact URL.`);
  }
  const body = pattern.slice(1, -1);
  let url = '';
  for (let index = 0; index < body.length; index += 1) {
    const character = body[index];
    if (character === '\\') {
      const escaped = body[index + 1];
      if (!escaped || !REGEX_META.has(escaped)) {
        throw new Error(`${label} has a non-canonical URL escape.`);
      }
      url += escaped;
      index += 1;
      continue;
    }
    if (REGEX_META.has(character)) {
      throw new Error(`${label} contains a URL wildcard or expression.`);
    }
    url += character;
  }
  let parsed;
  try {
    parsed = new URL(url);
  } catch (error) {
    throw new Error(`${label} does not encode a valid URL: ${error.message}`);
  }
  if (parsed.protocol !== 'https:'
      || parsed.username
      || parsed.password
      || parsed.hash
      || parsed.href !== url
      || exactUrlPattern(url) !== pattern) {
    throw new Error(`${label} must encode one canonical HTTPS URL.`);
  }
  return url;
};

export const exactUrlUnionPattern = (urls) => {
  if (!Array.isArray(urls) || urls.length === 0) {
    throw new Error('A summary policy requires at least one exact URL.');
  }
  const canonicalUrls = [...new Set(urls)].sort();
  for (const url of canonicalUrls) {
    if (exactUrlFromPattern(exactUrlPattern(url), 'Summary URL') !== url) {
      throw new Error('A summary policy URL is not canonical.');
    }
  }
  const bodies = canonicalUrls.map((url) => exactUrlPattern(url).slice(1, -1));
  return bodies.length === 1 ? `^${bodies[0]}$` : `^(?:${bodies.join('|')})$`;
};

export const readPolicyRows = (source) => readRows(source).map((line, index) => {
  const columns = line.split('\t');
  if (columns.length !== 3) {
    throw new Error(`Exact-policy row ${index + 1} must have exactly three tab-separated columns.`);
  }
  const [alertRef, action, pattern] = columns;
  if (!/^\d+(?:-\d+)?$/.test(alertRef)) {
    throw new Error(`Exact-policy row ${index + 1} has an invalid alertRef.`);
  }
  if (action !== 'OUTOFSCOPE') {
    throw new Error(`Exact-policy row ${index + 1} must use OUTOFSCOPE.`);
  }
  const label = `Exact-policy row ${index + 1}`;
  return {
    alertRef,
    pattern,
    url: exactUrlFromPattern(pattern, label),
  };
});

export const readSummaryPolicyRows = (source) => readRows(source).map((line, index) => {
  const columns = line.split('\t');
  if (columns.length !== 3) {
    throw new Error(`Summary-policy row ${index + 1} must have exactly three tab-separated columns.`);
  }
  const [pluginId, action, pattern] = columns;
  if (!/^\d+$/.test(pluginId)) {
    throw new Error(`Summary-policy row ${index + 1} must use an unsuffixed numeric plugin ID.`);
  }
  if (action !== 'INFO') {
    throw new Error(`Summary-policy row ${index + 1} must use INFO.`);
  }
  if (!pattern.startsWith('^') || !pattern.endsWith('$')) {
    throw new Error(`Summary-policy row ${index + 1} must use a fully anchored URL union.`);
  }
  try {
    new RegExp(pattern);
  } catch (error) {
    throw new Error(`Summary-policy row ${index + 1} has an invalid URL union: ${error.message}`);
  }
  return {
    pluginId,
    pattern,
  };
});

const yamlScalar = (source) => {
  const value = source.trim();
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replaceAll("''", "'");
  }
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      return JSON.parse(value);
    } catch {
      throw new Error('The generated ZAP plan contains an invalid quoted value.');
    }
  }
  return value;
};

const splitAutomationJobs = (lines, jobsIndex) => {
  const jobs = [];
  let current = null;
  for (const line of lines.slice(jobsIndex + 1)) {
    if (line.startsWith('- ')) {
      if (current) jobs.push(current);
      current = [line];
      continue;
    }
    if (!current || (!line.startsWith('  ') && line.trim())) {
      throw new Error('The generated ZAP plan has an invalid jobs structure.');
    }
    current.push(line);
  }
  if (current) jobs.push(current);
  return jobs;
};

const jobType = (job) => {
  const matches = job
    .map((line) => line.match(/^  type:\s*(.*)$/))
    .filter(Boolean);
  if (matches.length !== 1) {
    throw new Error('Every generated ZAP job must contain one direct type field.');
  }
  return yamlScalar(matches[0][1]);
};

const jobParameters = (job, type) => {
  if (job[0] !== '- parameters:' || job.at(-1) !== `  type: ${type}`) {
    throw new Error(`The generated ZAP ${type} job has an invalid structure.`);
  }
  const parameters = {};
  for (const line of job.slice(1, -1)) {
    const match = line.match(/^    ([A-Za-z][A-Za-z0-9]*):\s*(.*)$/);
    if (!match || Object.hasOwn(parameters, match[1])) {
      throw new Error(`The generated ZAP ${type} parameters are invalid.`);
    }
    parameters[match[1]] = yamlScalar(match[2]);
  }
  return parameters;
};

export const validateAutomationPlan = (source, target, summaryPolicyRows) => {
  if (source.includes('\t')) {
    throw new Error('The generated ZAP plan must not contain tabs.');
  }
  let targetUrl;
  try {
    targetUrl = new URL(target);
  } catch (error) {
    throw new Error(`The ZAP target is invalid: ${error.message}`);
  }
  const normalizedTarget = targetUrl.href;
  const originRoot = `${targetUrl.origin}/`;
  const contextUrls = normalizedTarget === originRoot
    ? [normalizedTarget]
    : [normalizedTarget, originRoot];
  const expectedEnvironment = [
    'env:',
    '  contexts:',
    '  - excludePaths: []',
    '    name: baseline',
    '    urls:',
    ...contextUrls.map((url) => `    - ${url}`),
    '  parameters:',
    '    failOnError: true',
    '    progressToStdout: false',
  ];
  const lines = source
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .filter((line) => line.trim() && !line.trimStart().startsWith('#'));
  const jobsIndices = lines
    .map((line, index) => (line === 'jobs:' ? index : -1))
    .filter((index) => index >= 0);
  if (jobsIndices.length !== 1) {
    throw new Error('The generated ZAP plan must contain exactly one jobs collection.');
  }
  const jobsIndex = jobsIndices[0];
  if (jobsIndex !== expectedEnvironment.length
      || expectedEnvironment.some((line, index) => lines[index] !== line)) {
    throw new Error('The generated ZAP plan environment does not match the scan target.');
  }

  const jobs = splitAutomationJobs(lines, jobsIndex);
  const typedJobs = jobs.map((job) => ({ job, type: jobType(job) }));
  const expectedJobTypes = [
    'passiveScan-config',
    'spider',
    'passiveScan-wait',
    'outputSummary',
    'report',
    'report',
    'report',
  ];
  if (typedJobs.length !== expectedJobTypes.length
      || typedJobs.some(({ type }, index) => type !== expectedJobTypes[index])) {
    throw new Error('The generated ZAP jobs do not match the fail-closed raw-report order.');
  }

  const passiveConfigParameters = jobParameters(typedJobs[0].job, 'passiveScan-config');
  if (Object.keys(passiveConfigParameters).length !== 2
      || passiveConfigParameters.enableTags !== 'false'
      || passiveConfigParameters.maxAlertsPerRule !== '10') {
    throw new Error('The generated ZAP passiveScan-config job is invalid.');
  }

  const spiderParameters = jobParameters(typedJobs[1].job, 'spider');
  if (Object.keys(spiderParameters).length !== 2
      || spiderParameters.maxDuration !== '1'
      || spiderParameters.url !== originRoot) {
    throw new Error('The generated ZAP spider target does not match the scan target.');
  }

  const passiveWaitParameters = jobParameters(typedJobs[2].job, 'passiveScan-wait');
  if (Object.keys(passiveWaitParameters).length !== 1
      || passiveWaitParameters.maxDuration !== '0') {
    throw new Error('The generated ZAP passiveScan-wait job is invalid.');
  }

  const expectedOutputSummaryJob = [
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
  ];
  if (typedJobs[3].job.length !== expectedOutputSummaryJob.length
      || typedJobs[3].job.some((line, index) => line !== expectedOutputSummaryJob[index])) {
    throw new Error('The generated ZAP outputSummary job is invalid.');
  }

  const expectedReports = [
    ['traditional-html', 'report_html.html'],
    ['traditional-md', 'report_md.md'],
    ['traditional-json', 'report_json.json'],
  ];
  for (let index = 0; index < expectedReports.length; index += 1) {
    const parameters = jobParameters(typedJobs[index + 4].job, 'report');
    const [template, reportFile] = expectedReports[index];
    if (Object.keys(parameters).length !== 5
        || parameters.reportDescription !== ''
        || parameters.reportDir !== '/zap/wrk/'
        || parameters.reportFile !== reportFile
        || parameters.reportTitle !== 'ZAP Scanning Report'
        || parameters.template !== template) {
      throw new Error(`The generated ZAP ${template} report job is invalid.`);
    }
  }
};

const readFreshText = (path, label, startedAtMs) => {
  let metadata;
  let source;
  try {
    metadata = statSync(path);
    source = readFileSync(path, 'utf8');
  } catch (error) {
    throw new Error(`${label} is unavailable: ${error.message}`);
  }
  if (!metadata.isFile() || metadata.size === 0) throw new Error(`${label} is empty.`);
  if (Number.isFinite(startedAtMs) && metadata.mtimeMs + 1000 < startedAtMs) {
    throw new Error(`${label} predates this scan.`);
  }
  return source;
};

const basePluginId = (alertRef) => alertRef.split('-', 1)[0];

const validatePolicyProjection = ({ policyRows, summaryPolicyRows, maxRiskByAlertRef }) => {
  const configuredRows = policyRows.map(({ alertRef, url }) => `${alertRef}\u0000${url}`);
  if (new Set(configuredRows).size !== configuredRows.length) {
    throw new Error('The exact DAST policy contains a duplicate alert-reference and URL pair.');
  }
  const configuredRefs = [...new Set(policyRows.map(({ alertRef }) => alertRef))];
  const reviewedRefs = Object.keys(maxRiskByAlertRef);
  if (configuredRefs.length !== reviewedRefs.length
      || configuredRefs.some((alertRef) => !Object.hasOwn(maxRiskByAlertRef, alertRef))) {
    throw new Error('The exact TSV alert references and reviewed risk policy differ.');
  }

  for (const [alertRef, maximum] of Object.entries(maxRiskByAlertRef)) {
    if (!/^\d+(?:-\d+)?$/.test(alertRef)
        || !Number.isInteger(maximum)
        || maximum < 0
        || maximum > 3) {
      throw new Error(`The reviewed maximum risk for ${alertRef} must be an integer from 0 to 3.`);
    }
  }

  const summaryIds = summaryPolicyRows.map(({ pluginId }) => pluginId);
  if (new Set(summaryIds).size !== summaryIds.length) {
    throw new Error('The ZAP summary compatibility policy contains duplicate plugin IDs.');
  }
  const exactPluginIds = [...new Set(configuredRefs.map(basePluginId))];
  if (summaryIds.length !== exactPluginIds.length
      || summaryIds.some((pluginId) => !exactPluginIds.includes(pluginId))) {
    throw new Error('The summary plugin IDs are not an exact projection of the reviewed alert references.');
  }

  for (const summaryRow of summaryPolicyRows) {
    const exactUrls = policyRows
      .filter(({ alertRef }) => basePluginId(alertRef) === summaryRow.pluginId)
      .map(({ url }) => url);
    if (summaryRow.pattern !== exactUrlUnionPattern(exactUrls)) {
      throw new Error(`Summary plugin ${summaryRow.pluginId} is not the canonical exact-URL projection.`);
    }
  }
};

const validateReportSite = (site, targetUrl) => {
  const expectedOrigin = targetUrl.origin;
  const expectedPort = targetUrl.port || '443';
  if (site?.['@name'] !== expectedOrigin
      || site?.['@host'] !== targetUrl.hostname
      || site?.['@port'] !== expectedPort
      || site?.['@ssl'] !== 'true') {
    throw new Error('The ZAP report site metadata does not match the exact HTTPS scan target.');
  }
  if (!Array.isArray(site.alerts)) {
    throw new Error('The ZAP report has an invalid alerts collection.');
  }
};

export const validateZapReport = ({
  report,
  policyRows,
  summaryPolicyRows,
  riskPolicy,
  surface,
  target,
  automationPlan,
}) => {
  let targetUrl;
  try {
    targetUrl = new URL(target);
  } catch {
    throw new Error('The ZAP scan target is not a valid URL.');
  }
  if (targetUrl.protocol !== 'https:'
      || targetUrl.username
      || targetUrl.password
      || targetUrl.hash
      || targetUrl.href !== target) {
    throw new Error('The ZAP scan target must be one canonical uncredentialed HTTPS URL.');
  }

  const surfacePolicy = riskPolicy?.surfaces?.[surface];
  if (riskPolicy?.schemaVersion !== 1 || !surfacePolicy) {
    throw new Error(`No reviewed risk policy exists for ${surface}.`);
  }
  if (surfacePolicy.origin !== targetUrl.origin) {
    throw new Error(`The reviewed origin for ${surface} does not match the scan target.`);
  }
  const maxRiskByAlertRef = surfacePolicy.maxRiskByAlertRef;
  if (!maxRiskByAlertRef || Array.isArray(maxRiskByAlertRef) || typeof maxRiskByAlertRef !== 'object') {
    throw new Error(`The reviewed risk policy for ${surface} is invalid.`);
  }

  for (const { alertRef, url } of policyRows) {
    if (new URL(url).origin !== targetUrl.origin) {
      throw new Error(`The exact DAST policy URL for ${alertRef} escaped the reviewed origin.`);
    }
  }
  validatePolicyProjection({ policyRows, summaryPolicyRows, maxRiskByAlertRef });
  validateAutomationPlan(automationPlan, target, summaryPolicyRows);

  if (!Array.isArray(report?.site) || report.site.length !== 1) {
    throw new Error('The ZAP report must contain exactly one scanned site.');
  }
  const [site] = report.site;
  validateReportSite(site, targetUrl);

  let instanceCount = 0;
  for (const alert of site.alerts) {
    const { alertRef } = alert ?? {};
    if (typeof alertRef !== 'string' || !Object.hasOwn(maxRiskByAlertRef, alertRef)) {
      throw new Error(`Unreviewed ZAP alert reference: ${String(alertRef)}.`);
    }
    const pluginId = alert.pluginid;
    if (typeof pluginId !== 'string' || !/^\d+$/.test(pluginId)
        || basePluginId(alertRef) !== pluginId) {
      throw new Error(`Alert ${alertRef} has an inconsistent plugin ID.`);
    }
    if (typeof alert.riskcode !== 'string' || !/^[0-3]$/.test(alert.riskcode)) {
      throw new Error(`Alert ${alertRef} has an invalid canonical risk code.`);
    }
    const riskCode = Number(alert.riskcode);
    if (riskCode > maxRiskByAlertRef[alertRef]) {
      throw new Error(`Alert ${alertRef} exceeds its reviewed risk.`);
    }
    if (typeof alert.confidence !== 'string' || !/^[1-4]$/.test(alert.confidence)) {
      throw new Error(`Alert ${alertRef} is not an unfiltered raw finding.`);
    }
    if (!Array.isArray(alert.instances) || alert.instances.length === 0) {
      throw new Error(`Alert ${alertRef} has no reviewable instances.`);
    }
    for (const instance of alert.instances) {
      instanceCount += 1;
      if (instance?.method !== 'GET' || typeof instance.uri !== 'string') {
        throw new Error(`Alert ${alertRef} has an invalid public-static instance.`);
      }
      let instanceUrl;
      try {
        instanceUrl = new URL(instance.uri);
      } catch {
        throw new Error(`Alert ${alertRef} has an invalid instance URL.`);
      }
      if (instanceUrl.origin !== targetUrl.origin || instanceUrl.username || instanceUrl.password) {
        throw new Error(`Alert ${alertRef} escaped the reviewed origin.`);
      }
      const matches = policyRows.filter((row) => row.alertRef === alertRef
        && row.url === instance.uri);
      if (matches.length !== 1) {
        throw new Error(`Alert ${alertRef} at ${instance.uri} matched ${matches.length} exact-policy rows.`);
      }
    }
  }
  return { instanceCount, surface };
};

export const runZapReportValidation = ({ env = process.env } = {}) => {
  const required = [
    'ZAP_REPORT_PATH',
    'ZAP_POLICY_PATH',
    'ZAP_SUMMARY_POLICY_PATH',
    'ZAP_RISK_POLICY_PATH',
    'ZAP_AUTOMATION_PLAN_PATH',
    'ZAP_SURFACE',
    'ZAP_TARGET',
    'ZAP_SCAN_STARTED_AT_MS',
  ];
  for (const name of required) {
    if (!env[name]) throw new Error(`Missing required environment variable ${name}.`);
  }
  const startedAtMs = Number(env.ZAP_SCAN_STARTED_AT_MS);
  if (!Number.isFinite(startedAtMs)) throw new Error('ZAP_SCAN_STARTED_AT_MS must be numeric.');
  const reportSource = readFreshText(env.ZAP_REPORT_PATH, 'ZAP JSON report', startedAtMs);
  const planSource = readFreshText(env.ZAP_AUTOMATION_PLAN_PATH, 'ZAP automation plan', startedAtMs);
  let report;
  try {
    report = JSON.parse(reportSource);
  } catch (error) {
    throw new Error(`ZAP JSON report is not valid JSON: ${error.message}`);
  }
  const policyRows = readPolicyRows(readFreshText(env.ZAP_POLICY_PATH, 'ZAP exact policy', Number.NaN));
  const summaryPolicyRows = readSummaryPolicyRows(readFreshText(
    env.ZAP_SUMMARY_POLICY_PATH,
    'ZAP summary compatibility policy',
    Number.NaN,
  ));
  const riskPolicy = readJson(env.ZAP_RISK_POLICY_PATH, 'ZAP reviewed risk policy');
  return validateZapReport({
    report,
    policyRows,
    summaryPolicyRows,
    riskPolicy,
    surface: env.ZAP_SURFACE,
    target: env.ZAP_TARGET,
    automationPlan: planSource,
  });
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = runZapReportValidation();
    console.log(`Validated ${result.instanceCount} raw exact ZAP alert instances for ${result.surface}.`);
  } catch (error) {
    console.error(`::error::${error.message}`);
    process.exitCode = 1;
  }
}
