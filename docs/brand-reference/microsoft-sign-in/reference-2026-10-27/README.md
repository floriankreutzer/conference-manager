# Microsoft manufacturer reference and verification

The unchanged original SVG payloads are in
[assets/brand/microsoft-sign-in/reference-2026-10-27](../../../../assets/brand/microsoft-sign-in/reference-2026-10-27/README.md).
Follow the [shared usage contract](../../../ICON-SYSTEM.md#microsoft-authentication-control).

- [Original manifest](manifest.json) records the pinned Microsoft source commit,
  immutable URLs, Git blob SHA, SHA-256, dimensions and byte lengths.
- [Original SHA256SUMS](SHA256SUMS) retains the source filenames and values.
  Resolve SVG filenames against the canonical asset directory; the redline PNG
  remains in this directory. Do not assume all four files are colocated.
- [Original redlines](sign-in-with-microsoft-redlines.png) are unchanged Microsoft
  layout/color guidance, not a Pavurel-authored button specification.
- [Reference SVG](preview/microsoft-reference.svg) and [PNG](preview/microsoft-reference.png)
  show the complete unmodified English light/dark buttons at 2x with separate
  German annotations. They are manufacturer references, not integrated live UI.
  Original SVG documents are embedded verbatim with their viewBoxes and paths;
  annotation text explicitly uses DejaVu Sans as a system font. The PNG was
  rendered with Inkscape 1.2.2 and opened for readability inspection.

Source commit: `MicrosoftDocs/entra-docs@56c0d47471fc07150fecec425f6884270499ae63`.
[Official German guidance](https://learn.microsoft.com/de-de/entra/identity-platform/howto-add-branding-in-apps)
and [English guidance](https://learn.microsoft.com/en-us/entra/identity-platform/howto-add-branding-in-apps)
remain the manufacturer references. Original bytes and all four original hashes
are unchanged. No Pavurel license is applied to these Microsoft third-party
assets and no trademark or other rights are granted by this reference package.
