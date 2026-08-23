const SECURITY_MESSAGES = Object.freeze({
  de: Object.freeze({
    title: 'Demo-Modus',
    text: 'Kein SSO · keine serverseitige Berechtigung · Daten nur in diesem Browser',
    roleLabel: 'Demo-Rolle',
    roleEmployee: 'Mitarbeiter',
    roleManager: 'Conference Manager',
    roleHint: 'Wechselt nur die sichtbare Demo-Perspektive und ersetzt keine echte Berechtigung.',
    reset: 'Demo-Daten löschen',
    resetConfirm: 'Alle lokal gespeicherten Conference-Manager-Demodaten in diesem Browser löschen?',
    resetDone: 'Lokale Demodaten wurden gelöscht.',
    storageWarning: 'Lokale Demodaten konnten nicht zuverlässig gelesen oder gespeichert werden. Bitte prüfen Sie den Browserspeicher und versuchen Sie es erneut.',
  }),
  en: Object.freeze({
    title: 'Demo mode',
    text: 'No SSO · no server-side authorization · data only in this browser',
    roleLabel: 'Demo role',
    roleEmployee: 'Employee',
    roleManager: 'Conference Manager',
    roleHint: 'Changes only the visible demo perspective and does not replace real authorization.',
    reset: 'Clear demo data',
    resetConfirm: 'Delete all locally stored Conference Manager demo data in this browser?',
    resetDone: 'Local demo data has been cleared.',
    storageWarning: 'Local demo data could not be read or saved reliably. Check browser storage and try again.',
  }),
});

export function securityMessages(language) {
  return SECURITY_MESSAGES[language] || SECURITY_MESSAGES.de;
}
