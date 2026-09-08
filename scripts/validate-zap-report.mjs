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
  const targetOrigin = new URL(target).origin;
  if (surfacePolicy.origin !== targetOrigin) {
    throw new Error(`The reviewed origin for ${surface} does not match the scan target.`);
  }
  const maxRiskByAlertRef = surfacePolicy.maxRiskByAlertRef;
  if (!maxRiskByAlertRef || Array.isArray(maxRiskByAlertRef) || typeof maxRiskByAlertRef !== 'object') {
    throw new Error(`The reviewed risk policy for ${surface} is invalid.`);
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
  for (const { alertRef } of policyRows) {
    const escaped = alertRef.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (!new RegExp(`\\bruleId:\\s*['\"]?${escaped}['\"]?\\s*$`, 'm').test(automationPlan)) {
      throw new Error(`The generated ZAP plan is missing exact alertRef ${alertRef}.`);
    }
  }

  if (!Array.isArray(report?.site) || report.site.length === 0) {
    throw new Error('The ZAP report does not contain a scanned site.');
  }
  let instanceCount = 0;
  for (const site of report.site) {
    if (!Array.isArray(site?.alerts)) throw new Error('The ZAP report has an invalid alerts collection.');
    for (const alert of site.alerts) {
      const { alertRef } = alert ?? {};
      if (typeof alertRef !== 'string' || !Object.hasOwn(maxRiskByAlertRef, alertRef)) {
        throw new Error(`Unreviewed ZAP alert reference: ${String(alertRef)}.`);
      }
      const pluginId = String(alert.pluginid ?? '');
      if (!alertRef.startsWith(`${pluginId}-`) && alertRef !== pluginId) {
        throw new Error(`Alert ${alertRef} has an inconsistent plugin ID.`);
      }
      const riskCode = Number(alert.riskcode);
      if (!Number.isInteger(riskCode) || riskCode > maxRiskByAlertRef[alertRef]) {
        throw new Error(`Alert ${alertRef} exceeds its reviewed risk.`);
      }
      if (String(alert.confidence) !== '0') {
        throw new Error(`Alert ${alertRef} was not classified by the exact Automation Framework filter.`);
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
