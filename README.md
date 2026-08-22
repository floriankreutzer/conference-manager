# Conference Manager MVP

Lauffähiger Frontend-Prototyp für interne Konferenzanfragen.

## Enthalten
- Mitarbeiter-Wizard: Termin → Raum → Services → Bewirtung → Kosten → Prüfung
- Raumfilter nach Standort und Teilnehmerzahl
- simulierte Kalender-Verfügbarkeitsprüfung
- tentative Reservierung beim Absenden
- manuelle Bestätigung / Ablehnung im Manager Cockpit
- Catering-Pakete und Einzeloptionen
- Kostenstellen-Verteilung mit 100-%-Validierung
- LocalStorage-Persistenz für Demo-Daten

## Start
Einfach `index.html` im Browser öffnen.

Alternativ lokal:
`python -m http.server 8080`
und danach `http://localhost:8080` öffnen.

## Für Produktivbetrieb zu ersetzen
Die Funktionen `mockCalendarBusy()` und `submitRequest()` enthalten die Stellen, an denen eine echte Microsoft-365-/Exchange-Integration angebunden werden sollte.

Empfohlene Microsoft-Graph-Integration:
1. Verfügbarkeit: `getSchedule` oder `calendarView`
2. Tentative Reservierung: Event im Raumkalender als `tentative`
3. Bestätigung: Event auf verbindlichen Status / tatsächliche Buchung umstellen
4. Ablehnung/Storno: tentative Event löschen
5. Authentifizierung: Microsoft Entra ID / SSO

Für einen echten produktiven Einsatz sollte zusätzlich ein Backend für Persistenz, Berechtigungen, Audit Trail und Transaktionssicherheit ergänzt werden.
