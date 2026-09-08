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

const compileUrlPattern = (pattern, label) => {
  if (!pattern.startsWith('^https://') || !pattern.endsWith('$') || pattern.includes('.*')) {
    throw new Error(`${label} must use a fully anchored HTTPS URL without a wildcard.`);
  }
  try {
    return new RegExp(pattern);
  } catch (error) {
    throw new Error(`${label} has an invalid URL expression: ${error.message}`);
  }
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
  return {
    alertRef,
    pattern,
    urlPattern: compileUrlPattern(pattern, `Exact-policy row ${index + 1}`),
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
  return {
    pluginId,
    pattern,
    urlPattern: compileUrlPattern(pattern, `Summary-policy row ${index + 1}`),
  };
});

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
  const configuredRefs = policyRows.map(({ alertRef }) => alertRef);
  if (new Set(configuredRefs).size !== configuredRefs.length) {
    throw new Error('The exact DAST policy contains duplicate alert references.');
  }
  const reviewedRefs = Object.keys(maxRiskByAlertRef);
  if (configuredRefs.length !== reviewedRefs.length
      || configuredRefs.some((alertRef) => !Object.hasOwn(maxRiskByAlertRef, alertRef))) {
    throw new Error('The exact TSV alert references and reviewed risk policy differ.');
  }

  for (const [alertRef, maximum] of Object.entries(maxRiskByAlertRef)) {
    if (!Number.isInteger(maximum) || maximum < 0 || maximum > 3) {
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
    const exactPatterns = new Set(policyRows
      .filter(({ alertRef }) => basePluginId(alertRef) === summaryRow.pluginId)
      .map(({ pattern }) => pattern));
    if (exactPatterns.size !== 1 || !exactPatterns.has(summaryRow.pattern)) {
      throw new Error(`Summary plugin ${summaryRow.pluginId} does not preserve one exact reviewed URL pattern.`);
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
  if (targetUrl.protocol !== 'https:' || targetUrl.username || targetUrl.password) {
    throw new Error('The ZAP scan target must be an uncredentialed HTTPS URL.');
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

  validatePolicyProjection({ policyRows, summaryPolicyRows, maxRiskByAlertRef });
  if (automationPlan.includes('alertFilter')) {
    throw new Error('The generated ZAP plan must not filter or rewrite the raw report.');
  }

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
        && row.urlPattern.test(instance.uri));
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
