# Microsoft sign-in reference assets

These three SVG files are unchanged official Microsoft assets. Keep them separate
from Pavurel functional icons and do not redraw, recolor or replace their symbol,
path text or geometry. Follow the [shared Microsoft control contract](../../../../docs/ICON-SYSTEM.md#microsoft-authentication-control)
and [official manufacturer guidance](https://learn.microsoft.com/en-us/entra/identity-platform/howto-add-branding-in-apps).

| File | Purpose | Original dimensions |
| --- | --- | --- |
| `ms-symbollockup_mssymbol_19.svg` | Official symbol; 19 by 19 colored geometry within a 21 by 21 canvas | 21 by 21 |
| `ms-symbollockup_signin_light.svg` | Complete English light sign-in button | 215 by 41 |
| `ms-symbollockup_signin_dark.svg` | Complete English dark sign-in button | 215 by 41 |

The complete buttons contain English outlined text. Localized DE/EN controls use
the unchanged symbol plus localized text under the manufacturer guidance; the
English asset width is not a universal localized width. This reference does not
integrate or deploy a control and does not change authentication authority.

Source: [MicrosoftDocs/entra-docs at 56c0d47471fc07150fecec425f6884270499ae63](https://github.com/MicrosoftDocs/entra-docs/tree/56c0d47471fc07150fecec425f6884270499ae63/docs/identity-platform/media/howto-add-branding-in-apps).
[Manifest, original hashes, redlines and preview](../../../../docs/brand-reference/microsoft-sign-in/reference-2026-10-27/README.md)
are stored outside browser assets. The three SVG payloads retain their original
Git blob identities and SHA-256 values. These third-party Microsoft marks do not
receive a Pavurel MIT license, and inclusion does not grant trademark or other
rights. Follow applicable Microsoft terms.
