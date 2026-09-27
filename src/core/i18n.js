import * as base from './i18n-base.js';
import { CAPABILITY_MESSAGES } from './i18n-capability-messages.js';
import { INACTIVITY_LOCK_MESSAGES } from './i18n-inactivity-lock-messages.js';
import { MANAGER_SETTINGS_MESSAGES } from './i18n-manager-settings-messages.js';
import { ONBOARDING_MESSAGES } from './i18n-onboarding-messages.js';
import { PLATFORM_ADMIN_MESSAGES } from './i18n-platform-admin-messages.js';
import { PRODUCTION_APPLICATION_MESSAGES } from './i18n-production-application-messages.js';
import { TENANT_ADMIN_OPERATIONS_MESSAGES } from './i18n-tenant-admin-operations-messages.js';
import { TENANT_ADMIN_SETTINGS_MESSAGES } from './i18n-tenant-admin-settings-messages.js';
import { TENANT_SETTINGS_DOMAIN_MESSAGES } from './i18n-tenant-settings-domain-messages.js';

function interpolate(template, values) {
  return String(template).replace(/\{(\w+)\}/g, (_match, token) => String(values[token] ?? ''));
}

function capabilityTemplate(targetLanguage, key) {
  const platformAdminMessages = PLATFORM_ADMIN_MESSAGES[targetLanguage] ?? PLATFORM_ADMIN_MESSAGES.de;
  if (platformAdminMessages?.[key] !== undefined) return platformAdminMessages[key];
  const tenantSettingsDomainMessages = TENANT_SETTINGS_DOMAIN_MESSAGES[targetLanguage]
    ?? TENANT_SETTINGS_DOMAIN_MESSAGES.de;
  if (tenantSettingsDomainMessages?.[key] !== undefined) return tenantSettingsDomainMessages[key];
  const operationsMessages = TENANT_ADMIN_OPERATIONS_MESSAGES[targetLanguage]
    ?? TENANT_ADMIN_OPERATIONS_MESSAGES.de;
  if (operationsMessages?.[key] !== undefined) return operationsMessages[key];
  const tenantAdminMessages = TENANT_ADMIN_SETTINGS_MESSAGES[targetLanguage]
    ?? TENANT_ADMIN_SETTINGS_MESSAGES.de;
  if (tenantAdminMessages?.[key] !== undefined) return tenantAdminMessages[key];
  const managerSettingsMessages = MANAGER_SETTINGS_MESSAGES[targetLanguage]
    ?? MANAGER_SETTINGS_MESSAGES.de;
  if (managerSettingsMessages?.[key] !== undefined) return managerSettingsMessages[key];
  const inactivityLockMessages = INACTIVITY_LOCK_MESSAGES[targetLanguage]
    ?? INACTIVITY_LOCK_MESSAGES.de;
  if (inactivityLockMessages?.[key] !== undefined) return inactivityLockMessages[key];
  const onboardingMessages = ONBOARDING_MESSAGES[targetLanguage] ?? ONBOARDING_MESSAGES.de;
  if (onboardingMessages?.[key] !== undefined) return onboardingMessages[key];
  const productionMessages = PRODUCTION_APPLICATION_MESSAGES[targetLanguage]
    ?? PRODUCTION_APPLICATION_MESSAGES.de;
  if (productionMessages?.[key] !== undefined) return productionMessages[key];
  const messages = CAPABILITY_MESSAGES[targetLanguage] ?? CAPABILITY_MESSAGES.de;
  return messages?.[key] ?? CAPABILITY_MESSAGES.de[key];
}

export {
  configureTenantLocalization,
  currency,
  formatDate,
  formatDateTime,
  formatMoney,
  formatNumber,
  formatTime,
  language,
  locale,
  setLanguage,
  supportedLanguages,
} from './i18n-base.js';

export function t(key, values = {}) {
  const template = capabilityTemplate(base.language(), key);
  return template === undefined ? base.t(key, values) : interpolate(template, values);
}

// Compatibility-only explicit-language lookup for bilingual persisted master-data defaults.
// Normal UI rendering must use t(), which follows the active locale and canonical fallback path.
export function tFor(targetLanguage, key, values = {}) {
  const template = capabilityTemplate(targetLanguage, key);
  if (template !== undefined) return interpolate(template, values);
  if ((targetLanguage === 'de' || targetLanguage === 'en') && targetLanguage === base.language()) {
    return base.t(key, values);
  }
  return key;
}
