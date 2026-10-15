import test from 'node:test';
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { PLATFORM_ADMIN_MESSAGES } from '../src/core/i18n-platform-admin-messages.js';

const PLATFORM_ADMIN_SOURCE_ROOT = fileURLToPath(new URL('../src/platform-admin/', import.meta.url));

const DYNAMIC_PLATFORM_ADMIN_KEYS = Object.freeze([
  ...['positive', 'neutral', 'negative'].map((id) => `platformAdmin.productDelivery.sentiment.${id}`),
  ...['onboarding_started', 'onboarding_completed', 'request_started', 'request_submitted',
    'request_abandoned', 'time_to_submit', 'manager_decisions', 'manager_decision_time',
    'transition_failures', 'recovery_completed', 'recovery_failed', 'recovery_failure_rate', 'change_lead_time',
    'deployment_frequency', 'failed_deployment_recovery_time', 'change_failure_rate',
    'deployment_rework_rate'].map((id) => `platformAdmin.productDelivery.metric.${id}`),
  ...['available', 'incomplete_source', 'missing_start_clock', 'empty_denominator',
    'unresolved_recovery', 'missing_classification', 'not_configured']
    .map((id) => `platformAdmin.productDelivery.reason.${id}`),
  ...['fresh', 'stale', 'unknown'].map((id) => `platformAdmin.productDelivery.freshness.${id}`),
  ...['application', 'api', 'website'].map((id) => `platformAdmin.productDelivery.component.${id}`),
  ...['demo', 'production'].map((id) => `platformAdmin.productDelivery.environment.${id}`),
  ...['not_collected', 'operator_snapshot'].map((id) => `platformAdmin.productDelivery.mode.${id}`),
  ...['not_configured', 'protected_operator_registry'].map((id) => `platformAdmin.productDelivery.feedbackSource.${id}`),
  ...['total', 'open', 'highSeverity'].map((id) => `platformAdmin.productDelivery.feedback.${id}`),
  ...['usability', 'correctness', 'performance', 'accessibility', 'integration'].map((id) => `platformAdmin.productDelivery.category.${id}`),
  ...['onboarding', 'request', 'manager', 'recovery'].map((id) => `platformAdmin.productDelivery.workflow.${id}`),
  ...['unverified', 'break_glass'].map((value) => `platformAdmin.assurance.${value}`),
  ...['directory', 'readiness', 'integration-health', 'platform-audit', 'runtime-status']
    .map((value) => `platformAdmin.fleetView.${value}.description`),
  ...[
    'pass', 'fail', 'unknown', 'verified', 'missing', 'invalid', 'success', 'failure', 'retired',
    'updated', 'idempotent', 'unchanged', 'configured', 'complete', 'partial', 'not_ready',
    'mismatch', 'fresh', 'connected',
  ].map((value) => `platformAdmin.state.${value}`),
  'platformAdmin.action.effect.entitlement_apply',
  'platformAdmin.quota.state.configured',
  'platformAdmin.quota.state.not_configured',
  'platformAdmin.readiness.enabledEntitlementsOne',
  'platformAdmin.readiness.enabledEntitlementsMany',
  'platformAdmin.readiness.checkCountOne',
  'platformAdmin.readiness.checkCountMany',
]);

function placeholders(value) {
  return [...new Set([...value.matchAll(/\{(\w+)\}/g)].map((match) => match[1]))].sort();
}

test('Platform Admin messages have synchronized German and English keys and placeholders', () => {
  const deKeys = Object.keys(PLATFORM_ADMIN_MESSAGES.de).sort();
  const enKeys = Object.keys(PLATFORM_ADMIN_MESSAGES.en).sort();
  assert.deepEqual(deKeys, enKeys);
  for (const key of deKeys) {
    assert.deepEqual(placeholders(PLATFORM_ADMIN_MESSAGES.de[key]), placeholders(PLATFORM_ADMIN_MESSAGES.en[key]), key);
  }
});

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const target = join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(target);
    return entry.name.endsWith('.js') ? [target] : [];
  });
}

function referencedMessageKeys() {
  const result = new Set(DYNAMIC_PLATFORM_ADMIN_KEYS);
  for (const file of sourceFiles(PLATFORM_ADMIN_SOURCE_ROOT)) {
    const source = readFileSync(file, 'utf8');
    for (const match of source.matchAll(/\bt\(\s*['"]([^'"]+)['"]/g)) result.add(match[1]);
    for (const match of source.matchAll(/(?:titleKey|descriptionKey):\s*['"]([^'"]+)['"]/g)) result.add(match[1]);
  }
  return [...result].filter((key) => key.startsWith('platformAdmin.')).sort();
}

test('every referenced and closed-set dynamic Platform Admin UI key has non-empty DE and EN text', () => {
  for (const key of referencedMessageKeys()) {
    assert.equal(Object.hasOwn(PLATFORM_ADMIN_MESSAGES.de, key), true, `missing DE message: ${key}`);
    assert.equal(Object.hasOwn(PLATFORM_ADMIN_MESSAGES.en, key), true, `missing EN message: ${key}`);
    assert.notEqual(PLATFORM_ADMIN_MESSAGES.de[key].trim(), '', `blank DE message: ${key}`);
    assert.notEqual(PLATFORM_ADMIN_MESSAGES.en[key].trim(), '', `blank EN message: ${key}`);
  }
});
