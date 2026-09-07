const SECURITY_MESSAGES = Object.freeze({
  de: Object.freeze({
    title: 'Demo-Modus',
    text: 'Synthetische Daten · gemeinsamer Demo-Server · keine Produktividentität',
    tenantLabel: 'Demo-Tenant',
    roleLabel: 'Demo-Persona',
    roleEmployee: 'Mitarbeiter',
    roleManager: 'Conference Manager',
    roleTenantAdmin: 'Tenant Admin',
    roleDual: 'Conference Manager & Tenant Admin',
    roleHint: 'Der Demo-Server stellt danach eine neue Tenant-gebundene Session mit wirksamen Berechtigungen aus.',
    applyContext: 'Demo-Kontext anwenden',
    applyingContext: 'Demo-Kontext wird gewechselt …',
    contextApplied: 'Demo-Kontext wurde gewechselt. Die Anwendung wird neu geladen.',
    contextError: 'Der Demo-Kontext konnte nicht gewechselt werden. Bitte laden Sie die Anwendung neu und versuchen Sie es erneut.',
    unavailable: 'Der gemeinsame Demo-Server ist nicht verfügbar. Es wird kein lokaler Ersatz verwendet.',
  }),
  en: Object.freeze({
    title: 'Demo mode',
    text: 'Synthetic data · shared Demo server · no Production identity',
    tenantLabel: 'Demo tenant',
    roleLabel: 'Demo persona',
    roleEmployee: 'Employee',
    roleManager: 'Conference Manager',
    roleTenantAdmin: 'Tenant Admin',
    roleDual: 'Conference Manager & Tenant Admin',
    roleHint: 'The Demo server then issues a new tenant-bound session with effective permissions.',
    applyContext: 'Apply Demo context',
    applyingContext: 'Changing Demo context …',
    contextApplied: 'The Demo context changed. The application is reloading.',
    contextError: 'The Demo context could not be changed. Reload the application and try again.',
    unavailable: 'The shared Demo server is unavailable. No local substitute is used.',
  }),
});

export function securityMessages(language) {
  return SECURITY_MESSAGES[language] || SECURITY_MESSAGES.de;
}
