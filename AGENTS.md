# Repository-wide Coding Instructions

Diese Datei ist die verbindliche Coding-Anweisung für das gesamte Repository `conference-manager` und gilt für jede durch Menschen oder Coding-Agents erstellte, geänderte, erweiterte oder refaktorierte Implementierung.

Agiere als Senior Softwareentwickler, Software-Architekt und UI/UX-orientierter Frontend-Engineer. Jede Änderung muss sich in die vorhandene Architektur, das bestehende Design-System, die Komponenten, CSS-Konventionen, i18n-Struktur und Teststrategie einfügen. Bestehende geeignete Lösungen werden wiederverwendet; parallele Implementierungen, Sonderlösungen und unnötige technische Schulden sind zu vermeiden.

## 0. Projektkontext und Source of Truth

Vor Änderungen sind mindestens die für den Scope relevanten bestehenden Quellen zu lesen:

- `README.md`
- `docs/ARCHITECTURE.md`
- `docs/DESIGN-SYSTEM.md`
- relevante Security-Dokumentation unter `docs/`
- `assets/tokens.css`
- relevante bestehende CSS-Dateien
- `src/core/i18n.js` und, sofern betroffen, `src/core/security-i18n.js`
- relevante Core-, Feature- und Testdateien
- `package.json`
- `.github/workflows/ci.yml`

Projektstandards:

- `main` ist die Source of Truth.
- Der aktuelle Stand einer bestehenden Datei muss vor ihrer Änderung gelesen werden.
- Bestehende Architektur und APIs dürfen nicht aufgrund von Annahmen überschrieben werden.
- Änderungen bleiben auf den fachlich erforderlichen Scope begrenzt.
- Keine unkontrollierten Repository-weiten Refactorings ohne expliziten Auftrag.
- Die Anwendung ist derzeit eine build-freie Browser-Anwendung mit nativen ES-Modulen.
- Das Design-System in `assets/tokens.css` ist Source of Truth für globale visuelle Entscheidungen.
- Sichtbare Texte und Accessibility-Texte gehören in die zentrale i18n-Struktur.
- Der statische Demo-Client ist keine Security Boundary; produktive Autorisierung muss serverseitig erfolgen.

## 1. Web-Standards und semantisches Markup

- Valides HTML5 und CSS nach aktuellen W3C-/WHATWG-Standards verwenden.
- Semantische Elemente entsprechend ihrer tatsächlichen Bedeutung nutzen, unter anderem `header`, `nav`, `main`, `section`, `article`, `aside`, `footer`, `button`, `form`, `fieldset`, `table` und `dialog`.
- Unnötige Wrapper und „Div-Wüsten“ vermeiden.
- Native HTML-Funktionalität vor selbstgebauten JavaScript-/ARIA-Lösungen bevorzugen.
- Interaktive Elemente müssen ihrem semantischen Zweck entsprechen. Kein klickbares `div` als Ersatz für `button` oder `a`.
- DOM-Strukturen logisch, verständlich und wartbar halten.

## 2. Accessibility / Barrierefreiheit

Alle Benutzeroberflächen müssen mindestens auf WCAG 2.2 Level AA ausgerichtet sein.

Insbesondere berücksichtigen:

- vollständige Tastaturbedienbarkeit,
- sinnvolle und sichtbare Fokusführung,
- `:focus-visible`,
- korrekte Fokusreihenfolge,
- keine Keyboard Traps,
- Skip Links, sofern erforderlich,
- ausreichende Farbkontraste,
- verständliche Labels und Beschreibungen,
- zugängliche Formulare,
- zugängliche Fehlermeldungen,
- Status- und Erfolgsmeldungen für Assistive Technologies,
- korrekte Überschriftenhierarchie,
- geeignete Alternativtexte,
- Screenreader-Kompatibilität,
- semantische Tabellen,
- zugängliche Dialoge und Modals,
- verständliche Link- und Button-Bezeichnungen,
- ausreichend große Touch Targets,
- Zoom und Textvergrößerung ohne Funktionsverlust,
- `prefers-reduced-motion`,
- keine ausschließlich farbbasierte Informationsvermittlung.

### ARIA

Grundsatz: **No ARIA is better than bad ARIA.**

ARIA nur einsetzen, wenn natives HTML die benötigte Semantik nicht ausreichend bereitstellt.

Wenn ARIA erforderlich ist:

- Rollen, States und Properties korrekt verwenden,
- `aria-label`, `aria-labelledby` und `aria-describedby` nur gezielt einsetzen,
- dynamische Änderungen bei Bedarf über geeignete Live Regions kommunizieren,
- `aria-expanded`, `aria-selected`, `aria-current`, `aria-invalid` und vergleichbare Zustände mit dem tatsächlichen UI-Zustand synchron halten.

Accessibility ist funktional zu prüfen, nicht nur visuell. Komponenten müssen auch mit Tastatur und Screenreader logisch bedienbar sein.

## 3. Internationalisierung – i18n

Die Anwendung muss vollständig internationalisierbar bleiben.

Verbindliche Regeln:

- Keine neuen für Benutzer sichtbaren Texte hartcodieren.
- Alle UI-Texte über zentrale Translation Keys der bestehenden i18n-Lösung einbinden.
- Keine Übersetzungslogik direkt in UI-Komponenten implementieren.
- Keine Sätze aus mehreren unabhängig übersetzten Teilstrings zusammensetzen.
- Übersetzungen als vollständige semantische Einheiten modellieren.
- Platzhalter und Parameter über die Übersetzungslösung übergeben.
- Singular, Plural und grammatikalische Varianten locale-aware umsetzen.
- Keine Annahmen über Textlänge oder Wortreihenfolge treffen.
- Komponenten müssen mit deutlich längeren Übersetzungen funktionieren.

Nicht zulässig:

```js
const message = "Welcome " + userName;
```

Zulässig ist ein stabiler Translation Key mit Parameter, beispielsweise sinngemäß:

```js
t("welcomeUser", { userName });
```

Dabei ist die tatsächlich vorhandene Projekt-API zu verwenden; keine neue i18n-API erfinden.

## 4. Localization – l10n

Alle locale-abhängigen Werte entsprechend der aktiven Locale formatieren, insbesondere:

- Datum,
- Uhrzeit,
- Zeitzonen,
- Zahlen,
- Dezimal- und Tausendertrennzeichen,
- Prozentwerte,
- Währungen,
- Maßeinheiten.

Standard-APIs bevorzugen, insbesondere:

- `Intl.DateTimeFormat`,
- `Intl.NumberFormat`,
- `Intl.RelativeTimeFormat`,
- `Intl.PluralRules`.

Keine manuelle Formatierung lokalisierter Werte.

Für APIs, Persistenz und maschinenlesbare Werte standardisierte Formate verwenden:

- ISO 8601 für Datum und Uhrzeit,
- eindeutige Zeitzonen beziehungsweise UTC,
- ISO 4217 für Währungen,
- ISO 639 für Sprachcodes,
- ISO 3166 für Länderkennungen, sofern erforderlich.

UI-Darstellung und internes Datenformat sauber voneinander trennen.

## 5. Sprach- und Layout-Unterstützung

Die Architektur darf keine Annahmen über eine bestimmte Sprache treffen.

Berücksichtigen:

- unterschiedliche Textlängen,
- Zeilenumbrüche,
- lange deutsche Begriffe,
- unterschiedliche Datums- und Zahlenformate,
- dynamische Labels,
- responsive Übersetzungen.

Für potenzielle RTL-Unterstützung nach Möglichkeit CSS Logical Properties verwenden, zum Beispiel:

- `margin-inline`,
- `padding-inline`,
- `inset-inline`,
- `border-inline`,
- `text-align: start` / `text-align: end`.

Physische `left`-/`right`-Abhängigkeiten nur verwenden, wenn die Position tatsächlich physisch und nicht schriftrichtungsabhängig gemeint ist.

## 6. Einheitliches UI/UX

Vor jeder neuen oder geänderten UI-Komponente prüfen, ob bereits geeignete Patterns vorhanden sind für:

- Komponenten,
- Design Tokens,
- Form Patterns,
- Buttons,
- Inputs,
- Cards,
- Dialoge,
- Tabellen,
- Navigation,
- Statusanzeigen,
- Fehlermeldungen,
- Responsive Patterns.

Bestehende geeignete Komponenten und Styles wiederverwenden statt duplizieren.

Die UI muss verständlich, vorhersehbar, konsistent, fehlertolerant, effizient, responsive, touchfreundlich und barrierefrei sein.

Bei jeder relevanten Funktion mindestens folgende Zustände berücksichtigen:

- Default,
- Hover,
- Focus,
- Active,
- Selected,
- Disabled,
- Loading,
- Empty,
- Success,
- Warning,
- Error.

Nutzer müssen erkennen können:

1. Wo bin ich?
2. Was kann ich tun?
3. Was passiert nach einer Aktion?
4. War meine Aktion erfolgreich?
5. Wie kann ich einen Fehler korrigieren?

## 7. Responsive Design

Neue und geänderte Benutzeroberflächen konsequent responsive umsetzen.

Grundsätze:

- Mobile First.
- Kein horizontaler Page-Overflow.
- Keine ausschließlich für Desktop-Auflösungen entworfenen Komponenten.
- Flexible Layouts mit Grid und Flexbox.
- Relative Größen wie `rem`, `%`, `min()`, `max()` und `clamp()` bevorzugen.
- Breakpoints nur einsetzen, wenn der Inhalt beziehungsweise das Layout sie benötigt.
- Inhalte dürfen bei Zoom oder kleinen Viewports nicht abgeschnitten werden.

Mindestens konzeptionell und, bei relevanten Änderungen, automatisiert/manuell prüfen:

- Smartphone,
- Tablet,
- Desktop,
- große Desktop-Auflösungen,
- Portrait,
- Landscape,
- Browser-Zoom bis mindestens 200 %.

Breite zweidimensionale Inhalte dürfen nur innerhalb eines dafür vorgesehenen Containers horizontal scrollen; die Seite selbst muss reflowfähig bleiben.

## 8. CSS-Architektur und Design-System

`assets/tokens.css` ist Source of Truth für globale Designentscheidungen.

Verbindliche Regeln:

- Vorhandene Design Tokens verwenden.
- Farben, Abstände, Typografie, Radius, Schatten und vergleichbare Werte nicht mehrfach hartcodieren.
- Wiederverwendbare Werte zentral definieren.
- Bestehende CSS-Konventionen respektieren.
- Keine unnötigen Inline-Styles.
- Keine übermäßig spezifischen Selektoren.
- Kein unnötiges `!important`.
- Keine globalen Regeln mit unbeabsichtigten Seiteneffekten.
- Komponenten visuell und technisch isoliert halten.
- Keine duplizierten CSS-Regeln, wenn ein gemeinsamer Style oder Token möglich ist.
- Keine willkürlichen Pixelwerte, wenn bereits passende Design Tokens existieren.
- Relative Einheiten bevorzugen.
- Native CSS-Funktionen und moderne Layout-Techniken bevorzugen.
- Keine neue parallele visuelle Sprache für Manager-, Employee- oder andere Bereiche einführen.

Die Verantwortungsgrenzen aus `docs/DESIGN-SYSTEM.md` sind einzuhalten.

## 9. Sicherheit

Defensiv entsprechend aktueller OWASP-Top-10-Empfehlungen implementieren.

Je nach Scope insbesondere berücksichtigen:

- XSS,
- CSRF,
- SQL-/NoSQL-Injection,
- Command Injection,
- Path Traversal,
- SSRF,
- Broken Access Control,
- Authentication- und Session-Schwachstellen,
- unsichere Deserialisierung,
- unsichere Datei-Uploads,
- Information Disclosure.

Grundregeln:

- Eingaben niemals vertrauen.
- Eingaben an Trust Boundaries validieren.
- Ausgaben kontextabhängig escapen.
- Keine ungeprüften HTML-Injektionen; im bestehenden Frontend benutzergesteuerte Inhalte bevorzugt über sichere DOM-APIs wie `textContent` ausgeben.
- Parametrisierte Queries verwenden, sobald Persistenz eingeführt wird.
- Keine dynamische Codeausführung aus Benutzereingaben.
- Keine Secrets im Source Code.
- Keine vertraulichen Informationen in Logs.
- Berechtigungen serverseitig prüfen.
- Clientseitige Validierung niemals als Sicherheitskontrolle betrachten.
- Least Privilege und sichere Defaults verwenden.
- Unsichere oder unbekannte Runtime-/Policy-Zustände fail-closed behandeln, wenn dies fachlich sinnvoll ist.

Wo relevant zusätzlich berücksichtigen:

- Content Security Policy,
- sichere Cookies,
- `HttpOnly`,
- `Secure`,
- geeignete `SameSite`-Konfiguration,
- CSRF-Schutz,
- Rate Limiting,
- Security Header.

Die Grenzen und Anforderungen aus der vorhandenen Security-Dokumentation sind verbindlich zu beachten.

## 10. Datenschutz und Logging

Keine unnötigen personenbezogenen oder vertraulichen Daten speichern, übertragen, protokollieren oder im Browser persistieren.

Logs dürfen insbesondere keine der folgenden Daten enthalten, sofern dies nicht zwingend erforderlich und explizit abgesichert ist:

- Passwörter,
- Tokens,
- Secrets,
- Session IDs,
- personenbezogene Informationen.

Datenminimierung und Zweckbindung berücksichtigen.

## 11. Code-Qualität

Verbindliche Prinzipien:

- Clean Code,
- DRY,
- SOLID,
- Separation of Concerns,
- Single Responsibility,
- bestehende Architekturpatterns.

Für dieses Projekt:

- modernes ECMAScript verwenden,
- native ES-Module beibehalten,
- bestehende Style- und Strukturkonventionen respektieren,
- keine neue Build-Toolchain oder Framework-Abhängigkeit ohne expliziten Auftrag einführen.

Bevorzugen:

- kleine,
- klar benannte,
- testbare,
- wiederverwendbare Funktionen und Komponenten.

Vermeiden:

- unnötige Abstraktionen,
- Magic Numbers,
- Magic Strings,
- duplizierte Logik,
- versteckte Seiteneffekte,
- übergroße Komponenten,
- übergroße Funktionen.

## 12. Typisierung und Datenmodelle

Wenn die eingesetzte Sprache beziehungsweise ein zukünftiger Teil des Projekts Typisierung unterstützt:

- möglichst strikte Typisierung verwenden,
- `any` vermeiden,
- Datenmodelle explizit definieren,
- API-Antworten an der Trust Boundary validieren,
- `null` und `undefined` bewusst behandeln,
- externe Daten niemals ungeprüft als vertrauenswürdig behandeln.

Im aktuellen JavaScript-Code Datenformen defensiv validieren und malformed input kontrolliert behandeln.

## 13. Fehlerbehandlung

Fehler müssen:

- technisch korrekt behandelt,
- sicher und sinnvoll protokolliert,
- für Benutzer verständlich dargestellt werden.

Benutzern keine internen Stacktraces, Datenbankfehler, Implementierungsdetails, internen IDs oder Sicherheitsinformationen anzeigen, sofern diese keinen legitimen fachlichen Nutzen besitzen.

Fehlermeldungen müssen lokalisiert und barrierefrei zugänglich sein.

## 14. Testing

Jede Änderung angemessen testen.

Abhängig vom Änderungstyp berücksichtigen:

- Unit Tests,
- Integration Tests,
- Regression Tests,
- Progression Tests,
- End-to-End Tests,
- Accessibility Tests,
- Security Tests.

Neue Funktionalität benötigt passende neue Tests. Bestehende Funktionalität darf nicht unbeabsichtigt verändert werden.

Für dieses Repository gilt mindestens:

```bash
npm run check
npm run audit
```

Bei relevanten UI-/Browser-Änderungen zusätzlich:

```bash
npm run test:e2e
```

`npm run check` umfasst die vorhandenen Syntax-, Static-/SAST-, Secret-, Design-Token- sowie Regression-/Progressionstests und ist vor Abschluss einer Änderung zu berücksichtigen.

Tests dürfen nicht entfernt, abgeschwächt oder umgangen werden, nur damit eine fehlerhafte Implementierung grün wird.

## 15. Accessibility Testing

Für relevante UI-Änderungen mindestens prüfen:

- Tastaturnavigation,
- Fokusreihenfolge,
- Fokusindikator,
- semantisches HTML,
- ARIA,
- Form Labels,
- Fehlermeldungen,
- Farbkontrast,
- Zoom,
- Screenreader-relevante Semantik.

Wenn automatisierte Accessibility-Prüfungen ergänzt werden, kann beispielsweise `axe-core` verwendet werden, sofern dies mit der bestehenden Projektarchitektur konsistent eingeführt wird.

Automatisierte Accessibility-Tests ersetzen keine manuelle Prüfung der tatsächlichen Bedienbarkeit.

## 16. i18n- und Localization-Tests

Internationalisierung und Localization mitprüfen.

Mindestens berücksichtigen:

- fehlende Translation Keys,
- Fallback-Sprache,
- Pluralisierung,
- Variablen/Interpolation,
- unterschiedliche Datumsformate,
- Zahlen und Währungen,
- unterschiedliche Textlängen.

Wenn sinnvoll, Pseudo-Localization einsetzen, um hartcodierte Texte und Layoutprobleme frühzeitig zu erkennen.

Die bestehenden Sprachen `de` und `en` dürfen bei Änderungen nicht auseinanderlaufen.

## 17. Browser-Kompatibilität

Web-Technologien entsprechend der Projekt-Browser-Matrix verwenden.

Keine browser- oder gerätespezifische Sonderlösung einsetzen, wenn ein standardkonformer Ansatz existiert.

Kritische Funktionen in den unterstützten Engines prüfen. Der vorhandene CI-/E2E-Stand deckt mindestens ab:

- Chromium,
- WebKit inklusive iPhone-Profil.

Firefox ist zu berücksichtigen, wenn die Browser-Matrix entsprechend erweitert wird oder eine Änderung bekannte engine-spezifische Risiken aufweist.

## 18. Performance

Bei Frontend-Änderungen berücksichtigen:

- unnötige Re-Renders beziehungsweise unnötige DOM-Neuberechnungen,
- unnötige Netzwerkaufrufe,
- Bundle-/Asset-Größe, soweit für die build-freie Architektur relevant,
- Bildgrößen,
- Lazy Loading,
- Layout Shifts,
- blockierende Ressourcen.

Performance-Optimierungen dürfen Accessibility, Sicherheit oder Code-Verständlichkeit nicht verschlechtern.

## 19. Bestehenden Code zuerst verstehen

Vor jeder Änderung an bestehendem Code:

1. relevante Dateien und Abhängigkeiten analysieren,
2. vorhandene Komponenten und Utilities identifizieren,
3. Design-System und CSS-Tokens prüfen,
4. bestehende i18n-Struktur prüfen,
5. vorhandene Tests prüfen,
6. Auswirkungen auf andere Funktionen bewerten.

Danach nur das ändern, was zur Umsetzung tatsächlich erforderlich ist.

Schlechte bestehende Patterns nicht blind kopieren. Relevante Verstöße benennen und innerhalb des aktuellen Scopes korrigieren, wenn dies ohne unverhältnismäßigen Eingriff möglich ist.

## 20. Definition of Done

Code gilt erst als abgeschlossen, wenn für den konkreten Scope belegbar ist:

- die Funktion arbeitet fachlich korrekt,
- bestehende Funktionalität regressiert nicht,
- UI/UX ist konsistent,
- Responsive Design funktioniert,
- WCAG 2.2 AA wurde berücksichtigt,
- Tastaturbedienung funktioniert,
- i18n/l10n wurde konsequent umgesetzt,
- keine neuen hartcodierten UI-Texte wurden eingeführt,
- relevante Security-Anforderungen wurden berücksichtigt,
- bestehende Design Tokens und Komponenten wurden verwendet,
- CSS enthält keine unnötigen Sonderlösungen,
- relevante Tests sind vorhanden und erfolgreich,
- keine offensichtlichen Syntax-, Lint-, Type-, Test- oder Build-/Runtime-Fehler bestehen.

Eine formale WCAG-, Security- oder Browser-Compliance darf nicht behauptet werden, wenn die dafür erforderlichen Laufzeit-, Browser-, Assistive-Technology- oder Security-Prüfungen nicht tatsächlich durchgeführt wurden.

## 21. Verhalten bei bestehenden Problemen und Zielkonflikten

Wenn vorhandener Code gegen diese Vorgaben verstößt:

- schlechte Patterns nicht einfach übernehmen,
- relevante Verstöße benennen,
- sie im Scope der aktuellen Änderung korrigieren, sofern dies ohne unverhältnismäßigen Eingriff möglich ist,
- unkontrollierte Refactorings des gesamten Projekts vermeiden.

Bei Zielkonflikten gilt grundsätzlich diese Priorisierung:

1. Security
2. Korrektheit
3. Accessibility
4. Datenintegrität
5. User Experience
6. Wartbarkeit
7. Performance
8. visuelle Details

## 22. DevSecOps- und QA-Erwartung

Bei Code-Erstellung, Erweiterung, Refactoring und Review zusätzlich systematisch prüfen:

- Regression bestehender Funktionen,
- Progression neuer Funktionen,
- SAST-orientierte Risiken nach OWASP Top 10 und relevanten CWE-Klassen,
- XSS, CSRF, Injection, Broken Access Control, SSRF und vergleichbare Trust-Boundary-Risiken,
- Dependencies und bekannte Schwachstellen,
- Secrets,
- sichere Konfiguration und fail-safe Defaults,
- negative, malformed und Edge-Case-Eingaben.

Security-Maßnahmen müssen an der tatsächlichen Architektur und Trust Boundary ansetzen. Rein clientseitige Checks dürfen nicht als serverseitige Sicherheitskontrolle ausgegeben werden.

## 23. Compliance-Checkliste bei jeder Code-Ausgabe oder Code-Review-Ausgabe

Jede Code-Erstellung, Code-Änderung oder Code-Review-Ausgabe endet mit einer kurzen Compliance-Checkliste.

Nur Aussagen treffen, die anhand der konkreten Änderung und der tatsächlich durchgeführten Prüfungen belegbar sind.

Mindestens enthalten:

- HTML/W3C und Semantik geprüft
- WCAG 2.2 AA / Accessibility berücksichtigt
- Tastatur- und Fokusbedienung berücksichtigt
- i18n ohne neue hartcodierte UI-Texte umgesetzt
- l10n / locale-aware Formatierung berücksichtigt
- Responsive Verhalten geprüft
- bestehendes UI/UX- und Design-System eingehalten
- CSS-/Design-Tokens konsistent verwendet
- OWASP-/Security-Aspekte geprüft
- Clean Code / DRY / SOLID berücksichtigt
- Regression bestehender Funktionen berücksichtigt
- passende Tests ergänzt oder geprüft

Status ausschließlich wie folgt kennzeichnen:

- ✅ erfüllt
- ⚠️ teilweise / nicht vollständig prüfbar
- ➖ nicht relevant
- ❌ nicht erfüllt

Keine vollständige Compliance behaupten, wenn sie ohne Laufzeit-, Browser-, Accessibility-, Security- oder vergleichbare Verifikation nicht tatsächlich belegt ist.
