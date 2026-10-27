#!/usr/bin/env python3
"""Build a bounded, local SVG asset draft. No network or product integration."""
from __future__ import annotations

import csv
import hashlib
import json
import re
from pathlib import Path
import xml.etree.ElementTree as ET

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT.parent / "pavurel-icons-source"
REF = "e34cb7c2b039f92e2c054711c55a9125c0645d86"
SOURCE_REPO = "https://github.com/floriankreutzer/conference-manager-website"
INK = "#171717"
ACCENT = "#7A1F3D"
SVG_NS = "http://www.w3.org/2000/svg"
ET.register_namespace("", SVG_NS)

# Verified against the GitHub source bytes and Git blob identities before building.
ORIGINAL_SHA256 = {
    "request": "e543456cf2445ad83f38202e5ecaed688ce7d466e49fdb626febf772edfccb41",
    "participants": "32eea7718747426b0106d318c9e12132c308018a1b6743b30f9aabe1acf0a904",
    "room-equipment": "3fdfbc028d8b8d01ecf46e4ca86629ea73072d6df26c67c628d7287f6df20519",
    "catering": "0feb46703e891a35ec972cb749b6e40b64cc7e3173d42e2f6d4b002059be5f18",
    "changes": "65532164a892895bef0fef6da9297e8f9266cb3d79aca17db5bc9c96fb6e5b0a",
    "coordination": "b82bd25ee75bfc377c2364d7c48fb535d666762247c9e75b951ac8e9c3010ea7",
}

# Every entry has one stable meaning; visible labels remain owned by each surface.
ITEMS = [
    ("request", "Anfrage", "Request", "workflow", "Document with a folded corner and a plus sign.", "Eine fachliche Besprechungsanfrage; kein allgemeiner Hinzufügen-Button."),
    ("participants", "Teilnehmer", "Participants", "workflow", "Two people.", "Personen oder Teilnehmende; Kundenorganisationen verwenden customers."),
    ("room-equipment", "Raum und Ausstattung", "Room and equipment", "workflow", "A room outline containing a display.", "Raum und Ausstattung gemeinsam; keine Server- oder Systemübersicht."),
    ("catering", "Catering", "Catering", "workflow", "A water carafe beside a cup.", "Verpflegung und Bewirtungsbedarf; keine beliebige Integration."),
    ("changes", "Änderungsverlauf", "Change history", "workflow", "A document beside a clock.", "Änderungen im Zeitverlauf; technische Auditereignisse verwenden audit."),
    ("coordination", "Teamkoordination", "Team coordination", "workflow", "A shared request card above two people.", "Zusammenarbeit am gemeinsamen Vorgang; keine Nutzer- oder Kundenverwaltung."),
    ("dashboard", "Übersicht", "Overview", "navigation", "Four arranged overview panels.", "Bereichsübersicht; zeigt selbst keinen Gesundheitszustand."),
    ("customers", "Kundenorganisationen", "Customer organisations", "navigation", "An office building with windows and an entrance.", "Organisation oder Mandant; Personen verwenden participants."),
    ("integrations", "Verbindungen", "Integrations", "navigation", "Two linked open chain shapes joined by a diagonal line.", "Verbindungen zu anderen Systemen; keine Anbieter- oder Microsoft-Marke."),
    ("system", "System und Laufzeit", "System and runtime", "navigation", "Two equipment units with indicator lights.", "Technischer System- oder Laufzeitbereich; kein automatisch gesundes System."),
    ("usage", "Nutzung", "Usage", "navigation", "Three bars above a baseline.", "Verbrauch oder Nutzung; Balken sind ein Symbol, keine gemessenen Werte."),
    ("delivery", "Bereitstellung", "Delivery", "navigation", "An open package with an upward arrow.", "Softwarebereitstellung oder Auslieferung; nicht Einladung versendet."),
    ("audit", "Auditprotokoll", "Audit log", "navigation", "A clipboard with event lines and a check mark.", "Nachvollziehbare Auditereignisse; das Symbol beweist keine gültige Signatur."),
    ("diagnostics", "Diagnose", "Diagnostics", "navigation", "A monitor displaying a diagnostic pulse line.", "Systemdiagnose; allgemeine Suche verwendet search."),
    ("recovery", "Wiederherstellung", "Recovery", "action", "A return arrow around an open circular path.", "Explizite Wiederherstellung; nicht allgemeines Neu laden oder Zurück."),
    ("settings", "Einstellungen", "Settings", "navigation", "A gear with a circular centre.", "Einstellungen; Berechtigungsstatus niemals allein aus dem Symbol ableiten."),
    ("search", "Suchen", "Search", "action", "A magnifying glass.", "Informationen suchen; nicht technische Diagnose."),
    ("filter", "Filtern", "Filter", "action", "A funnel with a narrow lower section.", "Ergebnismenge filtern; aktiven Filter zusätzlich textlich anzeigen."),
    ("add", "Hinzufügen", "Add", "action", "A plus sign.", "Neues Element hinzufügen; Ziel im Buttontext benennen."),
    ("close", "Schließen", "Close", "action", "Two crossing diagonal strokes.", "Ansicht oder Dialog schließen; nicht Löschen oder fachlich Ablehnen."),
    ("chevron-right", "Geschlossener Unterbereich", "Collapsed section", "direction", "An angled line pointing right.", "Aufklapphinweis eines geschlossenen Unterbereichs; kein externer Link."),
    ("chevron-down", "Geöffneter Unterbereich", "Expanded section", "direction", "An angled line pointing down.", "Aufklapphinweis eines geöffneten Unterbereichs; Semantik am Bedienelement."),
    ("arrow-left", "Zurück", "Back", "direction", "A horizontal arrow pointing left.", "Rückwärtsnavigation; nicht Wiederherstellung."),
    ("arrow-right", "Weiter", "Next", "direction", "A horizontal arrow pointing right.", "Vorwärtsnavigation; nicht automatisch außerhalb der Anwendung."),
    ("external-link", "Externes Ziel", "External destination", "direction", "An arrow leaving the upper-right corner of a frame.", "Verlassen des aktuellen Anwendungskontexts; Ziel sichtbar benennen."),
    ("menu", "Menü", "Menu", "action", "Three horizontal strokes.", "Navigation öffnen; Sichtbarkeit und aria-expanded am Button führen."),
    ("check", "Bestätigt", "Confirmed", "status", "A check mark.", "Bestätigung oder Erfolg nur bei belegtem Zustand plus Text; kein pauschales gesund."),
    ("warning", "Hinweis mit Handlungsbedarf", "Attention required", "status", "A triangle containing an exclamation mark.", "Begründeten Handlungsbedarf anzeigen; Ursache und Schwere separat benennen."),
    ("info", "Information", "Information", "status", "A circle containing an information mark.", "Erläuterung oder Hilfe; kein Fehlerzustand."),
    ("lock", "Geschützter Zugang", "Protected access", "status", "A closed padlock.", "Zugangs- oder Schutzkontext; kein Sicherheitszertifikat oder Berechtigungsbeweis."),
    ("calendar", "Kalender und Termin", "Calendar and date", "workflow", "A calendar page with one highlighted date cell.", "Termin oder Datumswahl; keine Microsoft-365-Marke."),
    ("sign-out", "Abmelden", "Sign out", "action", "An arrow leaving an open doorway.", "Aktuelle Sitzung abmelden; nicht allgemeines Zurück oder Dialog schließen."),
]

# Original simple geometry drawn for this draft, not imported from an icon library.
SHAPES = {
    "dashboard": [
        '<rect x="3.5" y="3.5" width="7" height="9" rx="1"/>',
        '<rect x="13.5" y="3.5" width="7" height="5" rx="1"/>',
        '<rect x="3.5" y="16.5" width="7" height="4" rx="1"/>',
        '<rect x="13.5" y="12.5" width="7" height="8" rx="1" stroke="#7A1F3D"/>',
    ],
    "customers": [
        '<rect x="5.5" y="3.5" width="13" height="17" rx="1.5"/>',
        '<path d="M3 20.5h18M9 7.5h1M14 7.5h1M9 11.5h1M14 11.5h1"/>',
        '<path d="M10 20.5v-5h4v5" stroke="#7A1F3D"/>',
    ],
    "integrations": [
        '<path d="M10 6.5l2-2a4 4 0 0 1 5.5 5.8l-2 2"/>',
        '<path d="M14 17.5l-2 2a4 4 0 0 1-5.5-5.8l2-2"/>',
        '<path d="M8.5 15.5l7-7" stroke="#7A1F3D"/>',
    ],
    "system": [
        '<rect x="3.5" y="4.5" width="17" height="6" rx="1.5"/>',
        '<rect x="3.5" y="13.5" width="17" height="6" rx="1.5"/>',
        '<path d="M10 7.5h7.5M10 16.5h7.5"/>',
        '<circle cx="6.5" cy="16.5" r="0.5"/>',
        '<circle cx="6.5" cy="7.5" r="0.5" stroke="#7A1F3D"/>',
    ],
    "usage": [
        '<path d="M3 20.5h18"/>',
        '<rect x="5" y="12" width="3" height="8.5" rx="0.5"/>',
        '<rect x="10.5" y="8" width="3" height="12.5" rx="0.5"/>',
        '<rect x="16" y="3.5" width="3" height="17" rx="0.5" stroke="#7A1F3D"/>',
    ],
    "delivery": [
        '<path d="M4 9.5l8 4 8-4M4 9.5v10l8 3 8-3v-10M12 13.5v9M4 9.5l4-2M16 7.5l4 2"/>',
        '<path d="M12 10V2.5M8.5 6 12 2.5 15.5 6" stroke="#7A1F3D"/>',
    ],
    "audit": [
        '<path d="M8 4.5H5.5v17h13v-17H16"/>',
        '<rect x="8" y="2.5" width="8" height="4" rx="1"/>',
        '<path d="M8.5 10h7M8.5 13.5h3"/>',
        '<path d="m12 17 2 2 4-4" stroke="#7A1F3D"/>',
    ],
    "diagnostics": [
        '<rect x="3" y="4" width="18" height="13" rx="1.5"/>',
        '<path d="M12 17v4M8 21h8"/>',
        '<path d="M6 11h3l2-4 3 7 2-3h2" stroke="#7A1F3D"/>',
    ],
    "recovery": [
        '<path d="M5 8a8 8 0 1 1-1 8"/>',
        '<path d="M5 3v5h5" stroke="#7A1F3D"/>',
    ],
    "settings": [
        '<path d="M10 3h4l.5 2.3 2 1.2 2.2-.7 2 3.4-1.7 1.6v2.4l1.7 1.6-2 3.4-2.2-.7-2 1.2L14 21h-4l-.5-2.3-2-1.2-2.2.7-2-3.4L5 13.2v-2.4L3.3 9.2l2-3.4 2.2.7 2-1.2L10 3Z"/>',
        '<circle cx="12" cy="12" r="3" stroke="#7A1F3D"/>',
    ],
    "search": [
        '<circle cx="10" cy="10" r="6.5"/>',
        '<path d="m14.5 14.5 6 6" stroke="#7A1F3D"/>',
    ],
    "filter": [
        '<path d="M3.5 5.5h17L14 13h-4L3.5 5.5Z"/>',
        '<path d="M10 13v7l4-2v-5" stroke="#7A1F3D"/>',
    ],
    "add": [
        '<path d="M5 12h14"/>',
        '<path d="M12 5v14" stroke="#7A1F3D"/>',
    ],
    "close": [
        '<path d="m6 6 12 12"/>',
        '<path d="M18 6 6 18" stroke="#7A1F3D"/>',
    ],
    "chevron-right": [
        '<path d="m9 5 7 7"/>',
        '<path d="m16 12-7 7" stroke="#7A1F3D"/>',
    ],
    "chevron-down": [
        '<path d="m5 9 7 7"/>',
        '<path d="m12 16 7-7" stroke="#7A1F3D"/>',
    ],
    "arrow-left": [
        '<path d="M20 12H4"/>',
        '<path d="m10 6-6 6 6 6" stroke="#7A1F3D"/>',
    ],
    "arrow-right": [
        '<path d="M4 12h16"/>',
        '<path d="m14 6 6 6-6 6" stroke="#7A1F3D"/>',
    ],
    "external-link": [
        '<path d="M11 4H5a1 1 0 0 0-1 1v14a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-6"/>',
        '<path d="M14 3h7v7M21 3 12 12" stroke="#7A1F3D"/>',
    ],
    "menu": [
        '<path d="M4 6h16M4 18h16"/>',
        '<path d="M4 12h16" stroke="#7A1F3D"/>',
    ],
    "check": [
        '<path d="m5 12 4.5 5"/>',
        '<path d="M9.5 17 20 6" stroke="#7A1F3D"/>',
    ],
    "warning": [
        '<path d="m12 3.5 10 17H2l10-17Z"/>',
        '<path d="M12 9v5M12 17.2v.1" stroke="#7A1F3D"/>',
    ],
    "info": [
        '<circle cx="12" cy="12" r="9"/>',
        '<path d="M12 10.5v6M12 7.3v.1" stroke="#7A1F3D"/>',
    ],
    "lock": [
        '<rect x="5" y="10.5" width="14" height="10" rx="2"/>',
        '<path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/>',
        '<path d="M12 14v3.5" stroke="#7A1F3D"/>',
    ],
    "calendar": [
        '<rect x="3.5" y="5" width="17" height="16" rx="2"/>',
        '<path d="M8 3v4M16 3v4M3.5 9.5h17M7.5 13.5h2M7.5 17h2M13.5 17h2"/>',
        '<rect x="13.5" y="12.5" width="3" height="2.5" rx="0.25" stroke="#7A1F3D"/>',
    ],
    "sign-out": [
        '<path d="M10 3.5H5a1.5 1.5 0 0 0-1.5 1.5v14A1.5 1.5 0 0 0 5 20.5h5M9 12h12"/>',
        '<path d="m16 7 5 5-5 5" stroke="#7A1F3D"/>',
    ],
}


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def new_svg(name: str, label: str, description: str) -> bytes:
    body = "\n".join("  " + shape for shape in SHAPES[name])
    result = (
        f'<svg xmlns="{SVG_NS}" width="24" height="24" viewBox="0 0 24 24" '
        f'fill="none" stroke="{INK}" stroke-width="1.6" stroke-linecap="round" '
        f'stroke-linejoin="round" role="img" aria-labelledby="pavurel-{name}-title '
        f'pavurel-{name}-desc" focusable="false" xml:lang="en">\n'
        f'  <title id="pavurel-{name}-title">{label}</title>\n'
        f'  <desc id="pavurel-{name}-desc">{description}</desc>\n'
        f'{body}\n</svg>\n'
    )
    return result.encode("utf-8")


def variant_svg(data: bytes, variant: str, label: str, description: str) -> bytes:
    colour = "currentColor" if variant == "mono" else "#FFFFFF"
    text = data.decode("utf-8").replace(INK, colour).replace(ACCENT, colour)
    # Original light files retain their exact descriptions; derived variants do not
    # assert the presence of a Bordeaux highlight after its deliberate removal.
    text = re.sub(r"(<desc\b[^>]*>).*?(</desc>)",
                  lambda m: m.group(1) + description + m.group(2), text, flags=re.S)
    return text.encode("utf-8")


def embedded_icon(name: str, variant: str, x: float, y: float, size: int = 48,
                  colour: str | None = None) -> str:
    svg = ET.fromstring((ROOT / variant / f"{name}.svg").read_bytes())
    for key in list(svg.attrib):
        if key not in {"viewBox", "fill", "stroke", "stroke-width",
                       "stroke-linecap", "stroke-linejoin"}:
            del svg.attrib[key]
    svg.set("x", str(x))
    svg.set("y", str(y))
    svg.set("width", str(size))
    svg.set("height", str(size))
    if colour:
        svg.set("color", colour)
    for child in list(svg):
        if child.tag.rsplit("}", 1)[-1] in {"title", "desc"}:
            svg.remove(child)
    return ET.tostring(svg, encoding="unicode")


def contact_sheet() -> None:
    width, height = 1600, 1490
    parts = [
        f'<svg xmlns="{SVG_NS}" width="{width}" height="{height}" viewBox="0 0 {width} {height}">',
        '<title>Pavurel icon draft, version 0.1: 32 motifs and three colour variants</title>',
        '<desc>Six website originals and 26 newly drawn draft symbols. Not a product screenshot or a shipped implementation.</desc>',
        '<rect width="1600" height="1490" fill="#F3F2F0"/>',
        '<path d="M48 42h1504" stroke="#7A1F3D" stroke-width="3"/>',
        '<g font-family="DejaVu Sans, sans-serif" fill="#171717">',
        '<text x="48" y="89" font-size="29" font-weight="700">Pavurel Icons · Arbeitsfassung v0.1</text>',
        '<text x="48" y="120" font-size="16" fill="#62666B">32 Motive · 6 Websiteoriginale + 26 neue Entwürfe · noch nicht in Website oder Anwendung integriert</text>',
    ]
    cell_w, cell_h, grid_top = 376, 113, 151
    for i, (name, de, en, category, description, rule) in enumerate(ITEMS):
        col, row = i % 4, i // 4
        x, y = 48 + col * cell_w, grid_top + row * cell_h
        parts.append(f'<rect x="{x}" y="{y}" width="{cell_w - 13}" height="{cell_h - 13}" rx="4" fill="#FFFFFF" stroke="#D9D5D0"/>')
        parts.append(embedded_icon(name, "light", x + 15, y + 24))
        parts.append(f'<text x="{x + 78}" y="{y + 27}" font-size="14" font-weight="700">{name}</text>')
        parts.append(f'<text x="{x + 78}" y="{y + 51}" font-size="15">{de}</text>')
        parts.append(f'<text x="{x + 78}" y="{y + 72}" font-size="12" fill="#62666B">{en}</text>')
        source_tag = "Websiteoriginal" if name in ORIGINAL_SHA256 else "Neuer Entwurf"
        parts.append(f'<text x="{x + 78}" y="{y + 90}" font-size="10" fill="#7A1F3D">{source_tag}</text>')
    parts.extend([
        '<text x="48" y="1100" font-size="21" font-weight="700">Varianten · Originalgröße 24 px</text>',
        '<text x="48" y="1126" font-size="14" fill="#62666B">Gleiche Geometrie. Farbe unterscheidet weder Berechtigung noch fachlichen Zustand.</text>',
    ])
    sample_names = ["dashboard", "customers", "search", "filter", "check", "lock"]
    panels = [
        ("light", 48, "#FFFFFF", "#171717", "Light", "Ink + Bordeaux auf heller Fläche", None),
        ("mono", 554, "#F8F7F5", "#171717", "Mono", "currentColor · hier inline in Bordeaux", "#7A1F3D"),
        ("inverse", 1060, "#171717", "#FFFFFF", "Inverse", "Alle Striche weiß auf dunkler Fläche", None),
    ]
    for variant, x, bg, fg, title, description, colour in panels:
        parts.append(f'<rect x="{x}" y="1150" width="492" height="174" rx="4" fill="{bg}" stroke="#D9D5D0"/>')
        parts.append(f'<text x="{x + 22}" y="1183" font-size="17" font-weight="700" fill="{fg}">{title}</text>')
        parts.append(f'<text x="{x + 22}" y="1208" font-size="13" fill="{fg}">{description}</text>')
        for i, name in enumerate(sample_names):
            parts.append(embedded_icon(name, variant, x + 29 + i * 75, 1238, 24, colour))
            parts.append(f'<text x="{x + 41 + i * 75}" y="1290" font-size="10" fill="{fg}" text-anchor="middle">{name}</text>')
    parts.extend([
        '<text x="48" y="1371" font-size="14" fill="#62666B">Hinweis: currentColor in einer externen SVG-Datei erbt nicht die Farbe des umgebenden img-Elements.</text>',
        '<text x="48" y="1396" font-size="14" fill="#62666B">Für feste Farben Light/Inverse wählen; für dynamische Farbe einen lokalen, kontrollierten Inline-Renderer verwenden.</text>',
        '<text x="48" y="1444" font-size="12" fill="#62666B">Quellbasis: conference-manager-website · e34cb7c2b039f92e2c054711c55a9125c0645d86 · eigenständiger Assetentwurf, kein Runtime-Package</text>',
        '</g></svg>',
    ])
    (ROOT / "preview" / "contact-sheet.svg").write_text("\n".join(parts) + "\n", encoding="utf-8")


def documentation(records: list[dict]) -> None:
    original_links = "\n".join(
        f"- [{name}.svg]({SOURCE_REPO}/blob/{REF}/public/assets/icons/{name}.svg)"
        for name in ORIGINAL_SHA256
    )
    provenance = f"""# Herkunft und Status

## Verifizierte Websiteoriginale

Repository: {SOURCE_REPO}

Unveränderter Quellstand: {REF}

Die sechs Light-Dateien sind byteidentisch aus public/assets/icons übernommen.
Ihre UTF-8-Bytes wurden zuerst gegen die Git-Blob-SHAs des Quellbaums geprüft.
Die daraus berechneten SHA-256-Werte stehen unverändert im Manifest und im Validator.

{original_links}

Die [Quell-README]({SOURCE_REPO}/blob/{REF}/public/assets/icons/README.md) beschreibt
sechs originale Linienicons und die Owner-Freigabe ihrer Websiteverwendung am
19. Oktober 2026. Diese README wurde mit Website-PR #89 / Commit
0dc03deef2c8cb24b5edf1c5614cd9681c51e9d6 eingeführt.

Ein eigener öffentlicher Icon-Lizenztext oder SPDX-Lizenzbezeichner ist in diesen
Quellen nicht dokumentiert. Dieses Paket vergibt keine MIT- oder andere
Open-Source-Lizenz und behauptet keine Herkunft aus Lucide, Heroicons oder einer
anderen Fremdbibliothek. Schriftlizenzen aus dem Website-Repository gelten nicht
automatisch für diese Icons.

## Neu gezeichnete Motive

Die 26 ergänzten Motive wurden am 27. Oktober 2026 für den aktuellen
Conference-Manager-Auftrag als einfache eigene SVG-Geometrien erstellt.
Die Formbeschreibungen, Semantik und Zeichnungen befinden sich im Manifest und
im reproduzierbaren Buildskript. Es wurden keine Logos, Fremd-Icondateien oder
Elemente des Pavurel-Signets übernommen.

Die gemeinsame Verwendung innerhalb Website, Customer und Platform ist Ziel
des aktuellen Auftrags. Die vorhandene Websitefreigabe wird dadurch nicht als
allgemeine öffentliche Weiterverwendungslizenz ausgegeben. Ein endgültiger
Eigentümer-/Nutzungsrechtsvermerk gehört zur späteren Assetintegration.

## Abgeleitete Varianten

- Light: Ink #171717 und ein Bordeaux-Akzent #7A1F3D; sechs Originale unverändert.
- Mono: gleiche Geometrie, alle Striche currentColor.
- Inverse: gleiche Geometrie, alle Striche #FFFFFF.

Die Mono-/Inverse-Varianten sind technische Ableitungen dieses Entwurfs.
Die Kontaktübersicht enthält nur eingebettete Geometrie und lokale Textlabels.
Ihre Systemschrift ist eine Vorschauhilfe, keine Änderung der Produktfonts.

## Grenzen

Arbeitsfassung v0.1, nicht integriert, nicht live. Keine Code-, Laufzeit-,
Sicherheits-, Lizenz- oder Releasefreigabe wird aus dieser Grafik abgeleitet.
Die Website bleibt Astro; Customer und Platform behalten ihre lokalen nativen
Renderer. Es wird kein gemeinsames Runtime- oder Designsystem-Package eingeführt.
Ein solches Package würde nach Website-Architektur §18 eine ADR benötigen.
"""
    (ROOT / "PROVENANCE.md").write_text(provenance, encoding="utf-8")
    semantic_rows = "\n".join(
        f"| {r['name']} | {r['meaning']['de']} | {r['meaning']['en']} | {r['usage_rule_de']} |"
        for r in records
    )
    readme = f"""# Pavurel Icons · Arbeitsfassung v0.1

Wiederverwendbarer SVG-Entwurf für Conference Manager Website, Customer und
Platform. Genau **32 Motive** in je drei Varianten, insgesamt **96 Icondateien**.
Noch nicht in eine Produktoberfläche integriert und keine neue Runtime-Library.

## Inhalt

- light/: 32 SVGs für helle Flächen; sechs Websiteoriginale byteidentisch.
- mono/: 32 SVGs mit currentColor; geeignet für einen kontrollierten Inline-Renderer.
- inverse/: 32 SVGs mit weißen Strichen für dunkle Flächen.
- preview/contact-sheet.svg und preview/contact-sheet.png: Kontaktübersicht mit allen
  Motiven sowie Light-/Mono-/Inverse-Beispielen bei 24 px.
- manifest.json: Namen, DE/EN-Bedeutung, Einsatzregeln, Herkunft und SHA-256 je Datei.
- semantics.csv: dieselbe Bedeutungszuordnung als lesbare Tabelle.
- PROVENANCE.md: Quellen und Grenzen; keine erfundene Open-Source-Lizenz.
- scripts/: lokale, netzwerkfreie Erzeugung und Validierung.
- validation-report.json: Ergebnis der tatsächlichen Assetprüfung.

## Stil

24 × 24 Viewbox und Ausgabegröße; 1,6 px Strich; runde Enden und Verbindungen;
keine gefüllten Flächen. Ink #171717 und genau ein zurückhaltendes
Bordeaux-Akzentelement #7A1F3D in jeder Light-Datei.
Die sechs bestehenden SVG-Pfade sind in Light unverändert. Neue Motive sind
einfache eigene Linienzeichnungen. Das Pavurel-Signet und Anbieterlogos
gehören nicht in diesen Funktionssatz.

## Einsatzregeln

1. Ein Name behält eine feste Bedeutung. Kundengesellschaften, Personen und
   gemeinsame Koordination verwenden bewusst verschiedene Motive.
2. Text führt die Bedienung. Icons ergänzen sichtbare Beschriftungen.
   Ein Icon allein beweist keine Berechtigung, Zustellung, gültige Auditsignatur,
   aktuelle Messung oder erfolgreiche Wiederherstellung.
3. Bei dekorativer Einbindung mit img leeres alt und aria-hidden verwenden.
   Die Komponentenbeschriftung beziehungsweise ein benannter Button trägt
   die lokale DE/EN-Semantik.
4. Die eigenständigen SVG-Dateien enthalten englische title/desc-Texte.
   Beim Inline-Einsatz dekorative Metadaten entfernen oder für informative
   Verwendung lokalisierte, instanzweise eindeutige Titel-/Beschreibungs-IDs
   vergeben. Die statischen IDs niemals mehrfach ungeprüft in ein Dokument kopieren.
5. **currentColor in einer externen SVG-Datei, die per img geladen wird,
   erbt nicht die Farbe des umgebenden HTML-Elements.** Für feste Farben
   Light/Inverse auswählen. Dynamisches Theming braucht einen sicheren,
   repo-lokalen Inline-Renderer oder bewusst erzeugte feste Varianten.
6. 24 px ist die hier geprüfte Zeichnungsgröße. Die Kontaktübersicht vergrößert
   die Motive auf 48 px und zeigt zusätzlich echte 24-px-Beispiele.
   16/20 px sind noch keine optisch abgenommenen Größen.
7. Statusfarbe bleibt semantisch und wird zusätzlich mit Text erklärt.
   Einen Funktionsicon-Akzent nicht als Erfolgs-/Warnzustand interpretieren.
8. Keine Laufzeitabrufe vom Websitehost oder GitHub. Versionierte Assets
   mit dem jeweiligen Produkt ausliefern; Quellcommit und Hashes festhalten.
9. Astro und native App-Renderer bleiben in ihren Repositories.
   Dieser Entwurf trifft keine neue gemeinsame Package-/Frameworkentscheidung.

## Eindeutige Bedeutungen

| Name | Deutsch | English | Abgrenzung / Einsatz |
| --- | --- | --- | --- |
{semantic_rows}

## Reproduktion und Prüfung

Das Buildskript liest ausschließlich den bereitgestellten lokalen Ordner
pavurel-icons-source neben diesem Paket. Es prüft die sechs Originalhashes,
erzeugt die Varianten und die Vektorkontaktübersicht.

    python scripts/build_icons.py
    python scripts/validate_icons.py

Die PNG-Vorschau wird mit einem lokalen SVG-Vektorrenderer aus der
Kontaktübersicht erzeugt. Es gibt keine Imagegen-/Screenshot- oder
Fremdbibliotheksgrundlage für die Icongeometrie.

## Quellen und Stand

Website-Baseline: [{REF}]({SOURCE_REPO}/tree/{REF}).
Details und fehlender öffentlicher Lizenzbezeichner: PROVENANCE.md.
Diese Arbeitsfassung verändert keine Repositorydateien und keine Liveoberfläche.
"""
    (ROOT / "README.md").write_text(readme, encoding="utf-8")
    with (ROOT / "semantics.csv").open("w", encoding="utf-8", newline="") as handle:
        writer = csv.writer(handle)
        writer.writerow(["name", "meaning_de", "meaning_en", "category", "usage_rule_de"])
        for record in records:
            writer.writerow([record["name"], record["meaning"]["de"], record["meaning"]["en"],
                             record["category"], record["usage_rule_de"]])


def main() -> None:
    names = [i[0] for i in ITEMS]
    assert len(names) == len(set(names)) == 32
    assert set(names) == set(ORIGINAL_SHA256) | set(SHAPES)
    assert len(SHAPES) == 26
    for directory in ("light", "mono", "inverse", "preview"):
        (ROOT / directory).mkdir(parents=True, exist_ok=True)
    records = []
    for name, de, en, category, description, rule in ITEMS:
        if name in ORIGINAL_SHA256:
            light = (SOURCE / f"{name}.svg").read_bytes()
            assert sha256(light) == ORIGINAL_SHA256[name]
            source = {
                "kind": "website-original",
                "repository": SOURCE_REPO,
                "commit": REF,
                "path": f"public/assets/icons/{name}.svg",
                "url": f"{SOURCE_REPO}/blob/{REF}/public/assets/icons/{name}.svg",
                "original_sha256": ORIGINAL_SHA256[name],
                "light_byte_identical": True,
            }
        else:
            light = new_svg(name, en, description)
            source = {
                "kind": "new-original-draft",
                "created": "2026-10-27",
                "basis": "Own simple vector geometry matching the six source icons; no third-party icon library.",
                "light_byte_identical": False,
            }
        files = {}
        for variant in ("light", "mono", "inverse"):
            data = light if variant == "light" else variant_svg(light, variant, en, description)
            path = ROOT / variant / f"{name}.svg"
            path.write_bytes(data)
            files[variant] = {"path": path.relative_to(ROOT).as_posix(), "sha256": sha256(data),
                              "bytes": len(data)}
        records.append({"name": name, "meaning": {"de": de, "en": en}, "category": category,
                        "shape_description_en": description, "usage_rule_de": rule,
                        "source": source, "files": files})
    manifest = {
        "name": "Pavurel icon asset draft",
        "version": "0.1-draft",
        "status": "local working draft; not integrated or deployed",
        "created": "2026-10-27",
        "icon_count": 32,
        "variant_count": 3,
        "icon_file_count": 96,
        "source_baseline": {"repository": SOURCE_REPO, "commit": REF},
        "geometry": {"width": 24, "height": 24, "viewBox": "0 0 24 24", "stroke_width": 1.6,
                     "stroke_linecap": "round", "stroke_linejoin": "round", "fill": "none"},
        "variants": {
            "light": {"base": INK, "accent": ACCENT, "accent_element_count": 1},
            "mono": {"all_strokes": "currentColor", "external_img_inherits_parent_color": False},
            "inverse": {"all_strokes": "#FFFFFF"},
        },
        "license": {"spdx": None, "status": "No public icon license assigned by this draft.",
                    "provenance": "PROVENANCE.md"},
        "distribution": "Versioned local assets and repo-local renderers; no new shared runtime package.",
        "icons": records,
    }
    (ROOT / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    documentation(records)
    contact_sheet()
    print(f"Built {len(records)} motifs in 3 variants at {ROOT}")


if __name__ == "__main__":
    main()
