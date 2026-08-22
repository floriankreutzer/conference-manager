# Conference Manager

Frontend-MVP für interne Konferenzanfragen mit Mitarbeiter- und Conference-Management-Sicht.

## Funktionsumfang

- 6-stufiger Mitarbeiter-Workflow: Termin → Raum → Services → Catering → Kosten → Prüfung
- finale Raumvalidierung gegen Standort, Kapazität, Aktivstatus und simulierte Kalenderbelegung
- vorläufige Reservierung, Bestätigung, Änderungsanforderung, Ablehnung und Storno
- Bearbeiten und erneutes Einreichen von Änderungsanforderungen
- Catering-Pakete, Einzeloptionen, abweichende Catering-Personenzahl und Ernährungsanforderungen
- Kostenstellenverteilung mit 0–100-%- und Summenvalidierung
- Liste, Kalender, Buchungsverlauf, Gästeinformationen und druckbare Welcome-Ansicht
- Manager Cockpit mit Buchungen, Raumplanung, Reports und Stammdatenpflege
- Deutsch / English über zentrale i18n-Keys
- LocalStorage-Persistenz für den statischen MVP

## Repository-Struktur

```text
.
├── .github/
│   ├── dependabot.yml
│   └── workflows/ci.yml
├── assets/
│   ├── tokens.css
│   ├── styles.css
│   ├── feature-parity.css
│   └── demo-security.css
├── docs/
│   ├── ARCHITECTURE.md
│   ├── DEMO-SECURITY.md
│   └── DESIGN-SYSTEM.md
├── scripts/
│   ├── check-design.mjs
│   ├── check-secrets.mjs
│   ├── check-static.mjs
│   └── check-syntax.mjs
├── src/
│   ├── app.js
│   ├── core/
│   └── features/
├── tests/
│   ├── e2e/
│   └── *.test.js
├── index.html
├── package.json
└── README.md
```

## Design-System

Die operative Anwendung verwendet eine reduzierte Consulting-/Business-Ästhetik mit Bordeaux als Primärakzent und Camel als bewusster Flächenfarbe. Das Manager-Dashboard behält seine Informationsarchitektur; die druckbare Gäste-Welcome-Ansicht darf emotionaler gestaltet sein.

Globale Designentscheidungen werden ausschließlich in `assets/tokens.css` gepflegt. Dort lassen sich Farben, Flächen, Typografie, Abstände, Radien und Schatten zentral ändern. `assets/styles.css` und `assets/feature-parity.css` verwenden semantische Tokens und sollen keine neuen Brand-Hexfarben enthalten.

Details und Wartungsregeln: `docs/DESIGN-SYSTEM.md`.

## Lokal starten

ES-Module benötigen einen HTTP-Server. Beispielsweise:

```bash
python -m http.server 8080
```

Danach `http://localhost:8080` öffnen.

## Quality Gate

```bash
npm run check
```

Das Quality Gate führt aus:

1. JavaScript-Syntaxprüfung aller Source-, Test- und Script-Dateien
2. statischen Defensive-Code-Check auf verbotene Konstrukte wie `eval`, `document.write`, `innerHTML`-Zuweisungen und `javascript:`-URLs
3. Secret-Scan des Repository-Inhalts
4. Design-Token-Check gegen neue hartcodierte Hexfarben in Komponenten-CSS
5. Regression- und Progressionstests der Domainlogik mit Node Test Runner

Zusätzlich laufen `npm audit` sowie die Playwright-E2E-Suite auf Chromium und WebKit/iPhone-Profil über GitHub Actions.

## Accessibility und Internationalisierung

Die Anwendung verwendet semantisches HTML, native Form Controls und native `<dialog>`-Elemente. Sichtbare Texte, Validierungsmeldungen und Accessibility-Texte werden zentral über `src/core/i18n.js` verwaltet. Aktuell unterstützt werden `de` und `en`; weitere Sprachpakete können über denselben Key-Satz ergänzt werden.

Die Implementierung zielt auf WCAG 2.2 AA. Eine formale Konformitätserklärung erfordert zusätzlich einen vollständigen manuellen Accessibility-Audit mit unterstützenden Technologien und Zielbrowsern.

## Security-Grenze des MVP

Der aktuelle Stand ist eine statische Demo. Daten, Demo-Rolle und Sprache werden clientseitig gespeichert. Der Demo-Rollenwechsel ist **keine Autorisierung** und darf nicht für einen produktiven Zugriffsschutz verwendet werden.

Für einen Produktivbetrieb sind mindestens erforderlich:

- SSO über Microsoft Entra ID oder eine vergleichbare Identity-Plattform
- serverseitige Authentifizierung und rollenbasierte Autorisierung
- Backend-Persistenz statt LocalStorage
- serverseitige Validierung aller schreibenden Operationen
- Audit Trail und transaktionale Verarbeitung
- sichere Kalenderintegration, z. B. Microsoft Graph
- Schutzmechanismen für die konkrete Backend-Architektur, einschließlich CSRF-Schutz bei cookie-basierter Authentifizierung

Weitere Details: `docs/DEMO-SECURITY.md`.

## Kalenderintegration

Im MVP wird die Belegung anhand der gespeicherten Anfragen simuliert. Für Microsoft 365 bieten sich insbesondere Microsoft Graph `getSchedule` bzw. `calendarView` sowie eine serverseitig kontrollierte Event-Erstellung/-Aktualisierung an.
