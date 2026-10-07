# SaaS 3.7 Demo-Medien

23 künstlich erzeugte Bilder (11 Räume, 4 Catering-Pakete, 8 Catering-Artikel) und 11 schematische Raumpläne. Die Räume von Northwind haben je ein Bild und einen Plan; Paris Atelier hat beides. Paris Studio bleibt absichtlich ohne Bild und Plan, Fabrikam hat beim Start noch keine Räume.

Alle Bilder zeigen fiktive Räume und Speisen. Die Pläne sind illustrative Sitzordnungen und keine Gebäude-, Brandschutz- oder Barrierefreiheitsnachweise. Angaben zu Zutaten, Allergenen und tatsächlicher Lieferfähigkeit dürfen daraus nicht abgeleitet werden.

`manifest.json` ordnet Dateien ihren stabilen Asset-IDs, Namen, Alternativtexten, SHA-256-Prüfsummen und Größen zu. Die kanonische, auf `main` integrierte SaaS-3.7-Demo-Fixture im Repository `conference-manager-api` speichert die Dateien mandantengebunden mit Eigentümer und SHA-256-Prüfsumme. Der Reset prüft die gespeicherten Bytes und Raumplan-Referenzen vor dem Commit. Der Demo-Kundenserver liefert sie nur an angemeldete Benutzer des jeweiligen Mandanten aus; der Mitarbeiter-Editor zeigt die Bilder und Pläne an.
