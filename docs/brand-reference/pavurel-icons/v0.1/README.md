# Pavurel v0.1 review and reproduction material

The canonical SVG payloads and semantic entry points are in
[assets/brand/pavurel-icons/v0.1](../../../../assets/brand/pavurel-icons/v0.1/README.md).
The [shared usage contract](../../../ICON-SYSTEM.md) governs consumption.

- `manifest.json`, `semantics.csv` and `validation-report.json` retain the original
  27 October 2026 draft metadata/evidence unchanged. Manifest file paths resolve
  relative to the canonical asset directory, not this documentation directory.
- [Contact sheet SVG](preview/contact-sheet.svg) and [PNG](preview/contact-sheet.png)
  are review previews, not live UI. They show all 32 motifs at 48 px plus 18 actual
  24 px variant examples. Preview labels use DejaVu Sans, a system font, rather
  than claiming product Manrope/Inter typography. 16/20 px acceptance remains open.
- `reproduction/` preserves the offline generator, validator and six independent
  original source SVGs unchanged. The source README and Astro renderer are retained
  as historical provenance; no Astro runtime is introduced into this application.

## Reproduce without touching product assets

Copy `reproduction/` to a disposable local directory and run, from that copy:

```sh
python pavurel-icons-v0.1/scripts/build_icons.py
python pavurel-icons-v0.1/scripts/validate_icons.py
```

The generator requires only Python's standard library, reads the sibling
`pavurel-icons-source/` directory, verifies its six fixed original hashes and writes
into that disposable `pavurel-icons-v0.1/` directory. Compare its 96 generated SVGs
byte-for-byte with the canonical asset directory and compare the manifest hashes.
It performs no network request. Do not run generation over approved product assets
without a reviewed asset change. The validator writes a fresh validation report
in the disposable copy; it must not overwrite the retained dated evidence here.

The PNG preview was rendered using Inkscape 1.2.2 and visually inspected for legible
labels, complete motifs, correct light/inverse contrast and clipping. This is
asset review evidence, not formal WCAG, keyboard, screen-reader or live-release
acceptance. Geometry, safe XML elements/attributes, no external references,
variant equivalence, six original hashes and all 96 manifest hashes were checked.
