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

export const readPolicyRows = (source) => source
  .split('\n')
  .filter((line) => line && !line.startsWith('#'))
  .map((line, index) => {
    const columns = line.split('\t');
    if (columns.length !== 3) {
      throw new Error(`Policy row ${index + 1} must have exactly three tab-separated columns.`);
    }
    const [alertRef, action, pattern] = columns;
    if (!/^\d+(?:-\d+)?$/.test(alertRef)) {
      throw new Error(`Policy row ${index + 1} has an invalid alertRef.`);
    }
    if (action !== 'OUTOFSCOPE') {
      throw new Error(`Policy row ${index + 1} must use OUTOFSCOPE.`);
    }
    if (!pattern.startsWith('^https://') || !pattern.endsWith('$') || pattern.includes('.*')) {
      throw new Error(`Policy row ${index + 1} must use a fully anchored URL without a wildcard.`);
    }
    let urlPattern;
    try {
      urlPattern = new RegExp(pattern);
    } catch (error) {
      throw new Error(`Policy row ${index + 1} has an invalid URL expression: ${error.message}`);
    }
    return { alertRef, pattern, urlPattern };
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

export const readAutomationAlertFilters = (source) => {
  const lines = source.split(/\r?\n/);
  const headers = lines
    .map((line, index) => (/^(\s*)(?:-\s+)?alertFilters:\s*$/.test(line) ? index : -1))
    .filter((index) => index >= 0);
  if (headers.length !== 1) {
    throw new Error('The generated ZAP plan must contain exactly one alertFilters collection.');
  }

  const headerIndex = headers[0];
  const headerIndent = lines[headerIndex].match(/^\s*/)[0].length;
  const supportedFields = new Set(['newRisk', 'ruleId', 'url', 'urlRegex']);
  const filters = [];
  let current = null;
  let entryIndent = -1;

  const setField = (key, value) => {
    if (Object.hasOwn(current, key)) {
      throw new Error(`The generated ZAP plan repeats ${key} in an alert filter.`);
    }
    current[key] = yamlScalar(value);
  };

  for (let index = headerIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (!line.trim() || line.trimStart().startsWith('#')) continue;
    const indent = line.match(/^\s*/)[0].length;
    const firstField = line.match(/^\s*-\s+([A-Za-z][A-Za-z0-9]*):\s*(.*)$/);
    if (firstField && indent >= headerIndent && supportedFields.has(firstField[1])) {
      if (current) filters.push(current);
      current = {};
      entryIndent = indent;
      setField(firstField[1], firstField[2]);
      continue;
    }

    const nextField = line.match(/^\s+([A-Za-z][A-Za-z0-9]*):\s*(.*)$/);
    if (current && indent > entryIndent && nextField && supportedFields.has(nextField[1])) {
      setField(nextField[1], nextField[2]);
      continue;
    }

    if (current) filters.push(current);
    current = null;
    break;
  }
  if (current) filters.push(current);
  return filters;
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

export const validateZapReport = ({
  report,
  policyRows,
  riskPolicy,
  surface,
  target,
  automationPlan,
}) => {
  const surfacePolicy = riskPolicy?.surfaces?.[surface];
  if (riskPolicy?.schemaVersion !== 1 || !surfacePolicy) {
    throw new Error(`No reviewed risk policy exists for ${surface}.`);
  }
  const targetUrl = new URL(target);
  const targetOrigin = targetUrl.origin;
  if (surfacePolicy.origin !== targetOrigin) {
    throw new Error(`The reviewed origin for ${surface} does not match the scan target.`);
  }
  const maxRiskByAlertRef = surfacePolicy.maxRiskByAlertRef;
  if (!maxRiskByAlertRef || Array.isArray(maxRiskByAlertRef) || typeof maxRiskByAlertRef !== 'object') {
    throw new Error(`The reviewed risk policy for ${surface} is invalid.`);
  }
  for (const [alertRef, maxRisk] of Object.entries(maxRiskByAlertRef)) {
    if (!/^\d+(?:-\d+)?$/.test(alertRef)
        || !Number.isInteger(maxRisk)
        || maxRisk < 0
        || maxRisk > 3) {
      throw new Error(`The reviewed risk policy for ${alertRef} is invalid.`);
    }
  }

  const configuredRefs = policyRows.map(({ alertRef }) => alertRef);
  if (new Set(configuredRefs).size !== configuredRefs.length) {
    throw new Error('The DAST policy contains duplicate alert references. Combine their URL patterns.');
  }
  const reviewedRefs = Object.keys(maxRiskByAlertRef);
  if (configuredRefs.length !== reviewedRefs.length
      || configuredRefs.some((alertRef) => !Object.hasOwn(maxRiskByAlertRef, alertRef))) {
    throw new Error('The TSV alert references and reviewed risk policy differ.');
  }
  if (!/\btype:\s*alertFilter\b/.test(automationPlan)) {
    throw new Error('The generated ZAP plan does not prove Automation Framework alert filtering.');
  }
  const automationFilters = readAutomationAlertFilters(automationPlan);
  if (automationFilters.length !== policyRows.length) {
    throw new Error('The generated ZAP plan and reviewed policy contain different alert-filter counts.');
  }
  for (const { alertRef, pattern } of policyRows) {
    const matches = automationFilters.filter((filter) => filter.ruleId === alertRef
      && filter.newRisk === 'False Positive'
      && filter.url === pattern
      && filter.urlRegex === 'true');
    if (matches.length !== 1) {
      throw new Error(`The generated ZAP plan does not contain one exact filter for ${alertRef}.`);
    }
  }
  if (!Array.isArray(report?.site) || report.site.length !== 1) {
    throw new Error('The ZAP report must contain exactly one scanned site.');
  }
  const expectedPort = targetUrl.port || (targetUrl.protocol === 'https:' ? '443' : '80');
  let instanceCount = 0;
  for (const site of report.site) {
    if (site?.['@name'] !== targetOrigin
        || site?.['@host'] !== targetUrl.hostname
        || site?.['@port'] !== expectedPort
        || site?.['@ssl'] !== (targetUrl.protocol === 'https:' ? 'true' : 'false')) {
      throw new Error('The ZAP report site identity does not match the scan target.');
    }
    if (!Array.isArray(site?.alerts)) throw new Error('The ZAP report has an invalid alerts collection.');
    for (const alert of site.alerts) {
      const { alertRef } = alert ?? {};
      if (typeof alertRef !== 'string' || !Object.hasOwn(maxRiskByAlertRef, alertRef)) {
        throw new Error(`Unreviewed ZAP alert reference: ${String(alertRef)}.`);
      }
      const pluginId = alert.pluginid;
      if (typeof pluginId !== 'string' || !/^\d+$/.test(pluginId)) {
        throw new Error(`Alert ${alertRef} has an invalid plugin ID.`);
      }
      if (!alertRef.startsWith(`${pluginId}-`) && alertRef !== pluginId) {
        throw new Error(`Alert ${alertRef} has an inconsistent plugin ID.`);
      }
      if (typeof alert.riskcode !== 'string' || !/^[0-3]$/.test(alert.riskcode)) {
        throw new Error(`Alert ${alertRef} has an invalid risk code.`);
      }
      const riskCode = Number(alert.riskcode);
      if (riskCode > maxRiskByAlertRef[alertRef]) {
        throw new Error(`Alert ${alertRef} exceeds its reviewed risk.`);
      }
      if (alert.confidence !== '0') {
        throw new Error(`Alert ${alertRef} was not classified by the exact Automation Framework filter.`);
      }
      if (!Array.isArray(alert.instances)) {
        throw new Error(`Alert ${alertRef} has an invalid instances collection.`);
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
        if (instanceUrl.origin !== targetOrigin) {
          throw new Error(`Alert ${alertRef} escaped the reviewed origin.`);
        }
        const matches = policyRows.filter((row) => row.alertRef === alertRef
          && row.urlPattern.test(instance.uri));
        if (matches.length !== 1) {
          throw new Error(`Alert ${alertRef} at ${instance.uri} matched ${matches.length} policy rows.`);
        }
      }
    }
  }
  return { instanceCount, surface };
};

export const runZapReportValidation = ({ env = process.env } = {}) => {
  const required = [
    'ZAP_REPORT_PATH',
    'ZAP_POLICY_PATH',
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
  const policyRows = readPolicyRows(readFreshText(env.ZAP_POLICY_PATH, 'ZAP policy', Number.NaN));
  const riskPolicy = readJson(env.ZAP_RISK_POLICY_PATH, 'ZAP reviewed risk policy');
  return validateZapReport({
    report,
    policyRows,
    riskPolicy,
    surface: env.ZAP_SURFACE,
    target: env.ZAP_TARGET,
    automationPlan: planSource,
  });
};

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    const result = runZapReportValidation();
    console.log(`Validated ${result.instanceCount} exact ZAP alert instances for ${result.surface}.`);
  } catch (error) {
    console.error(`::error::${error.message}`);
    process.exitCode = 1;
  }
}
