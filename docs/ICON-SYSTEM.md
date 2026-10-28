# Shared icon and Microsoft brand references

## Authority, source and status

This is the canonical cross-repository usage reference for the versioned brand
assets in this repository's [assets/brand](../assets/brand/README.md). Website,
Customer and Platform contributors refer here instead of defining another icon
system. Root `AGENTS.md`, [coding standards](CODING-STANDARDS.md),
[design system](DESIGN-SYSTEM.md), `assets/tokens.css` and the owning repository's
architecture, localization, security and acceptance gates remain authoritative.
The internal Brand Master Assets documentation holds the review package; this
public reference contains no internal documentation URL.

The Pavurel functional set is **v0.1, an asset working draft**: 32 motifs in three
variants, 96 SVG files. Repository storage and successful asset checks do not
establish UI integration, accessibility acceptance or live deployment. MS-01 in
[#399](https://github.com/floriankreutzer/conference-manager/issues/399) and IC-01 in
[#400](https://github.com/floriankreutzer/conference-manager/issues/400) retain the
separate implementation and acceptance scope. Existing logos, tokens and product
naming remain unchanged: **Conference Manager**, with subordinate **by Pavurel**.

## Canonical assets

| Reference | Content | Ownership and status |
| --- | --- | --- |
| [Pavurel v0.1](../assets/brand/pavurel-icons/v0.1/README.md) | `light`, `mono`, `inverse`; stable names and DE/EN meanings | Six unchanged Website originals plus 26 newly drawn motifs; working draft |
| [Microsoft reference](../assets/brand/microsoft-sign-in/reference-2026-10-27/README.md) | Unchanged official symbol and complete English light/dark button SVGs | Separate third-party Microsoft branding; no Pavurel license applies |
| [Review and reproduction material](brand-reference/README.md) | Manifests, hashes, semantic CSV, reference PNGs and offline reproduction sources | Documentation/review material; outside browser assets |

The six original light icons retain the exact bytes from Website commit
`e34cb7c2b039f92e2c054711c55a9125c0645d86`. That historical source establishes
provenance; ongoing shared usage references this repository. Consumers select an
explicit reviewed version and immutable source commit, retain provenance and
hashes, and vendor the required assets locally. Do not fetch GitHub, a Website
host, a CDN or another repository at runtime. Website Astro and native Customer/
Platform rendering remain local to their repositories; no shared runtime package,
framework, new CSS system or alternative i18n mechanism is introduced.

## Functional icon use

- Preserve each [stable meaning](../assets/brand/pavurel-icons/v0.1/SEMANTICS.md).
  An icon supplements a visible localized label. A check, lock, chart or audit
  motif alone proves no permission, delivery, current measurement or valid audit.
- Use the existing 24 by 24 viewBox, 1.6 stroke, round caps/joins and unfilled
  geometry. The light variant uses Ink with one Bordeaux accent; inverse uses
  white. The preview includes actual 24 px examples. 16/20 px optical acceptance
  remains open and must not be inferred from scaling a contact sheet.
- For decorative external images, use an empty `alt`, hide them from assistive
  technology and let the named native control carry the meaning. Preserve visible
  focus, keyboard behavior, target size and status text.
- The standalone SVGs contain English title/description metadata. Informative
  inline use needs central DE/EN text and unique per-instance IDs; decorative
  inline use must avoid duplicate static IDs and redundant announcements. Keep
  safe DOM construction and the existing CSP; no arbitrary SVG/HTML injection.
- `currentColor` in an external SVG loaded with `img` does not inherit its parent
  HTML color. Select fixed light/inverse files for that use. Dynamic color needs
  a deliberately reviewed, repo-local safe inline renderer. Do not silently add
  a renderer, external sprite loader or new dependency through this reference.
- Pavurel signets and vendor logos remain separate from functional icons. Keep
  original geometry, source notices and usage limits; no icon-library or public
  MIT license is invented for this set.

## Microsoft authentication control

Use the [official Microsoft guidance](https://learn.microsoft.com/en-us/entra/identity-platform/howto-add-branding-in-apps)
and its [German version](https://learn.microsoft.com/de-de/entra/identity-platform/howto-add-branding-in-apps)
with the unchanged [versioned originals](../assets/brand/microsoft-sign-in/reference-2026-10-27/README.md).
The [MS-01 renderer](MICROSOFT-SIGN-IN-CONTROL.md) is a deliberately
scoped vendor component: retain the manufacturer's symbol, light/dark treatment,
typography and spacing instead of applying the general Bordeaux button and
Manrope/Inter styling to the vendor lockup. This exception does not change global
product tokens. Any required scoped semantic tokens or design-check handling
must be reviewed with the implementation; existing validators remain mandatory.

The supplied complete button SVGs contain English outlined text. A localized
control combines the unchanged official symbol with central DE/EN text. This
project selects **Mit Microsoft anmelden** / **Sign in with Microsoft** for its
sign-in action. Microsoft's German guidance contains both `Bei Microsoft anmelden`
and `Mit Microsoft anmelden`; this project choice is not presented as the only
manufacturer-permitted translation. The redlines recommend 41 px height, 12 px
outer horizontal padding and symbol/text gap, and Segoe UI 15 px/600. The 215 px
width belongs to the supplied English asset, not a universal localized width.
Preserve text reflow, focus contrast and accessible naming during implementation.

Keep normal sign-in, organizational admin consent and additional authentication
for one protected operation distinct. For the latter, describe the customer,
intended action, purpose and return to the application in the dialog, alongside
the Microsoft control. For example, `Einladungen für Northwind Demo laden` is
operation context, not a replacement vendor wordmark. The branding article does
not establish a universal prohibition of every alternative step-up label; the
conservative vendor-control treatment here is a project decision. A completed
Microsoft redirect is neither business success nor proof of granted consent.
Existing permission, one-use proof, cancellation and neutral completion contracts
remain unchanged.

## Packaging and verification boundary

The current Customer builder recursively includes non-Markdown files below
`assets/`; the Platform artifact uses its explicit reviewed inventory. Therefore
only the SVG payloads and Markdown entry points live in the new `assets/brand`
subdirectories. Machine-readable JSON/CSV/checksum files, reference images and
reproduction scripts live under `docs/brand-reference/`. The protected API reader
rejects unapproved asset extensions, including JSON and CSV. Do not widen that
reader, the CSP, file limits or Platform inventory merely to store documentation.

Storing SVGs here increases a future Customer artifact's static file/byte count
under the existing builder even when no UI imports them. It does not activate
icons or Microsoft controls in a view and does not deploy any artifact. Review
both built manifests and the unchanged API reader against the exact source pair.
Retain hashes, source commits, actual commands/results and the distinction between
asset verification, browser acceptance and deployed evidence. Required repository
checks and cross-repository gates continue to apply.
