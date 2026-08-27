import * as base from './i18n-base.js';
import { CAPABILITY_MESSAGES } from './i18n-capability-messages.js';
import { ONBOARDING_MESSAGES } from './i18n-onboarding-messages.js';
import { PRODUCTION_APPLICATION_MESSAGES } from './i18n-production-application-messages.js';
import { TENANT_ADMIN_OPERATIONS_MESSAGES } from './i18n-tenant-admin-operations-messages.js';
import { TENANT_ADMIN_SETTINGS_MESSAGES } from './i18n-tenant-admin-settings-messages.js';
import { TENANT_SETTINGS_DOMAIN_MESSAGES } from './i18n-tenant-settings-domain-messages.js';

const LEGACY_KEY_ALIASES = Object.freeze({
  'parity.admin.accessibility': 'manager.accessibility',
  'parity.admin.active': 'manager.active',
  'parity.admin.address': 'manager.address',
  'parity.admin.addRoom': 'manager.addRoom',
  'parity.admin.addService': 'manager.addService',
  'parity.admin.capacity': 'manager.capacity',
  'parity.admin.contact': 'manager.contact',
  'parity.admin.description': 'manager.description',
  'parity.admin.equipment': 'manager.equipment',
  'parity.admin.floor': 'room.floor',
  'parity.admin.location': 'manager.location',
  'parity.admin.locations': 'manager.sites',
  'parity.admin.parking': 'manager.parking',
  'parity.admin.price': 'manager.price',
  'parity.admin.rooms': 'manager.rooms',
  'parity.admin.services': 'manager.services',
  'parity.admin.sites': 'manager.sites',
  'parity.admin.unit': 'manager.unit',
  'parity.admin.wifiPassword': 'guest.code',
  'parity.manager.all': 'common.all',
  'parity.manager.open': 'manager.final.open',
  'parity.manager.tentative': 'manager.ux.tentative',
  'parity.manager.today': 'common.today',
  'parity.pdf.accessibility': 'manager.accessibility',
  'parity.pdf.ask': 'guest.askOrganizer',
  'parity.pdf.date': 'schedule.date',
  'parity.pdf.location': 'schedule.location',
  'parity.pdf.network': 'guest.network',
  'parity.pdf.parking': 'manager.parking',
  'parity.pdf.route': 'guest.route',
  'parity.pdf.title': 'nav.welcome',
  'parity.pdf.wifiCode': 'guest.code',
  'parity.report.cateringBookings': 'manager.cateringBookings',
  'parity.report.confirmed': 'manager.confirmedBookings',
  'parity.report.package': 'manager.catering',
  'parity.report.participants': 'manager.totalParticipants',
  'parity.report.referenceDate': 'manager.referenceDate',
  'parity.report.roomBookings': 'manager.bookings',
  'parity.roomPlan.allLocations': 'manager.allLocations',
  'parity.roomPlan.date': 'schedule.date',
  'parity.roomPlan.event': 'manager.experience.event',
  'parity.roomPlan.list': 'requests.list',
  'parity.roomPlan.location': 'manager.location',
  'parity.roomPlan.participants': 'manager.totalParticipants',
  'parity.roomPlan.room': 'manager.final.room',
  'parity.roomPlan.status': 'manager.status',
});

const LEGACY_PREFIXES = Object.freeze([
  ['parity.admin.', 'manager.admin.'],
  ['parity.manager.', 'manager.operational.'],
  ['parity.report.', 'manager.report.'],
  ['parity.roomPlan.', 'manager.roomPlan.'],
  ['parity.pdf.', 'welcome.print.'],
  ['parity.floorplan.', 'room.floorplan.'],
  ['parity.catering.', 'catering.'],
]);

function canonicalKey(key) {
  if (Object.hasOwn(LEGACY_KEY_ALIASES, key)) return LEGACY_KEY_ALIASES[key];
  for (const [legacyPrefix, canonicalPrefix] of LEGACY_PREFIXES) {
    if (key.startsWith(legacyPrefix)) return `${canonicalPrefix}${key.slice(legacyPrefix.length)}`;
  }
  return key;
}

function interpolate(template, values) {
  return String(template).replace(/\{(\w+)\}/g, (_match, token) => String(values[token] ?? ''));
}

function capabilityTemplate(targetLanguage, key) {
  const tenantSettingsDomainMessages = TENANT_SETTINGS_DOMAIN_MESSAGES[targetLanguage]
    ?? TENANT_SETTINGS_DOMAIN_MESSAGES.de;
  if (tenantSettingsDomainMessages?.[key] !== undefined) return tenantSettingsDomainMessages[key];
  const operationsMessages = TENANT_ADMIN_OPERATIONS_MESSAGES[targetLanguage]
    ?? TENANT_ADMIN_OPERATIONS_MESSAGES.de;
  if (operationsMessages?.[key] !== undefined) return operationsMessages[key];
  const tenantAdminMessages = TENANT_ADMIN_SETTINGS_MESSAGES[targetLanguage]
    ?? TENANT_ADMIN_SETTINGS_MESSAGES.de;
  if (tenantAdminMessages?.[key] !== undefined) return tenantAdminMessages[key];
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
  const resolvedKey = canonicalKey(key);
  const template = capabilityTemplate(base.language(), resolvedKey);
  return template === undefined ? base.t(resolvedKey, values) : interpolate(template, values);
}

// Compatibility-only explicit-language lookup for bilingual persisted master-data defaults.
// Normal UI rendering must use t(), which follows the active locale and canonical fallback path.
export function tFor(targetLanguage, key, values = {}) {
  const resolvedKey = canonicalKey(key);
  const template = capabilityTemplate(targetLanguage, resolvedKey);
  if (template !== undefined) return interpolate(template, values);
  if ((targetLanguage === 'de' || targetLanguage === 'en') && targetLanguage === base.language()) {
    return base.t(resolvedKey, values);
  }
  return resolvedKey;
}
