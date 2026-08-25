# Conference Manager Design System

## Design direction

The application uses one restrained consulting-style visual language across employee and manager experiences: high contrast, clear hierarchy, compact business surfaces and limited decorative effects. The product retains its own identity through Bordeaux and Camel rather than copying another brand.

- Bordeaux is the primary action and selection color.
- Camel remains an intentional surface color for contextual information, selected business summaries, calendar items and selected KPI surfaces.
- Black/anthracite, white and warm neutral greys form the main application canvas.
- Employee and Manager views use the same content width, control height, spacing and responsive behavior.
- Manager dashboard information architecture is preserved; styling is refined rather than functionally redesigned.
- The guest welcome/print experience may remain more emotional than the operational application UI.

## Where to change the design

All global decisions live in `assets/tokens.css`.

### Brand

Change these tokens to update the identity globally:

- `--color-bordeaux-600`
- `--color-bordeaux-700`
- `--color-camel-500`
- `--color-camel-200`
- `--color-camel-100`

### Surfaces

- `--color-canvas`: application background
- `--color-surface`: primary white surface
- `--color-surface-subtle`: neutral secondary surface
- `--color-surface-camel`: soft Camel surface
- `--color-surface-camel-strong`: stronger Camel surface

### Typography, controls and density

Typography, spacing, control height and layout density are controlled via `--font-*`, `--space-*`, `--control-height` and layout tokens.

The typography contract deliberately combines two sans-serif families rather than replacing the functional UI typeface globally:

- `--font-family-display`: **Manrope** first, then the complete functional UI fallback chain. Use this token for brand/display typography, semantic H1-H3 headings, onboarding headlines and selected prominent KPI values. Hero and H1 surfaces use 700; normal H2/H3 and onboarding headings use the existing 600 weight token. H4 remains on the functional UI family unless a component has a specific justified display role.
- `--font-family-sans`: **Inter** first, followed by system UI fallbacks. Body text, descriptions, navigation, forms, labels, inputs, buttons, tables, dense operational views, supporting information and status text continue to inherit this token.
- Component styles consume these semantic family tokens. Literal font-family stacks outside `assets/tokens.css` are rejected by `npm run check:design`.

Manrope is self-hosted as the official Google Fonts variable TrueType asset at `assets/fonts/Manrope[wght].ttf`; its SHA-256 is `d0639be45d0af36e798172419d7bd173c4bd4f29e2b76cbb69db1d11bf8b0a40`. The repository ships the accompanying SIL Open Font License 1.1 and FONTLOG provenance metadata. The browser loads the font from the application origin only, consistent with the existing `font-src 'self'` CSP, and `index.html` preloads the file because a display heading is present on every application view. `font-display: swap` keeps text visible during loading; if Manrope cannot be loaded, the display token falls back through Inter and the existing system UI stack. No Google Fonts CDN request, third-party JavaScript or new runtime dependency is introduced.

The self-hosted variable TTF is intentionally kept byte-identical to the reviewed upstream Google Fonts asset rather than introducing a local conversion pipeline or an independently generated binary. It is one cacheable 165 KB font file and exposes only the approved 500-700 weight range through `@font-face`. A future switch to an equally provenance-controlled WOFF2 artifact may reduce transfer size, but it must preserve the same licensing, CSP, fallback and regression guarantees.

This typography change does not alter the established font sizes, line heights or spacing scale. Display typography must continue to wrap naturally in German and English, remain usable at responsive breakpoints and reflow under zoom/text enlargement; do not truncate meaningful headings to compensate for font metrics. Inter remains the default for compact controls and dense data surfaces so scanability is preserved.

Application-wide layout tokens:

- `--app-content-max-width`: maximum width of the operational application workspace
- `--app-control-gap`: spacing inside button/filter/segmented-control groups
- `--app-section-gap`: spacing between structured sections and cards
- `--app-card-padding`: shared card and wizard padding
- `--app-mobile-gutter`: mobile content/dialog gutter
- `--control-height`: standard interactive control height
- `--step-control-height`: fixed wizard step height
- `--control-padding-inline`: horizontal control padding
- `--button-min-inline-size`: default inline action size
- `--responsive-table-label-width`: label column used by mobile table cards

Manager layout tokens are aliases of the application-wide tokens. Manager features must not create a second visual system.

### Shape and elevation

The consulting-style UI deliberately uses small radii and restrained shadows. Adjust `--radius-*` and `--shadow-*` centrally if the visual language changes later.

## CSS responsibilities

- `assets/tokens.css`: global design decisions only.
- `assets/styles.css`: base application components, forms, navigation, requests, calendar and dialogs.
- `assets/feature-parity.css`: reporting, room-planning, catering image and administration feature components shared by the enhanced application.
- `assets/app-layout.css`: application-wide content containment, normalized controls, cards, wizard behavior, actions, dialogs and mobile reflow.
- `assets/employee-ux.css`: all Employee-specific first-use, request-wizard, accessibility and responsive presentation enhancements.
- `assets/manager-layout.css`: all Manager-specific layout, first-use guidance, operational filters, review/dialog presentation, readiness help, room planning and responsive report/table behavior.
- `assets/demo-security.css`: demo disclosure component only.

Do not introduce separate `*-polish.css`, readiness, first-use or operational override stylesheets. Extend the responsible file above and reuse semantic tokens. The architecture quality gate enforces these ownership boundaries.

Component styles should not introduce new brand hex values. Use semantic tokens instead.

## Application responsive rules

Every operational screen uses the same bounded content column. Employee and Manager views must remain inside the available content area and the document itself must not require horizontal scrolling.

- Global navigation uses equal-height controls and a predictable two-column layout on standard phone widths.
- Welcome actions, request actions, wizard actions, segmented controls and modal actions use the same control height and gap tokens.
- The six-step request wizard reflows to two equal columns on phones while retaining explicit step labels and focus semantics.
- Forms, room/service/catering selections, cost allocation, review cards and request metadata reflow to one column when two-dimensional density is no longer useful.
- Request and allocation headers stack instead of forcing text or controls outside the viewport.
- Calendar tables retain their two-dimensional structure and may scroll horizontally only inside the calendar container.
- Dialogs are bounded by the dynamic viewport and retain safe gutters on iPhone/WebKit.
- At very narrow widths, grouped actions reduce to one column rather than shrinking controls below practical touch sizes.

## Manager responsive rules

Manager screens use the same bounded application content column and global control system.

- Manager tabs use equal-width grid cells instead of free-width buttons.
- Quick filters use equal-height grid controls without accidental label wrapping.
- Room planning defaults to the list representation on small screens; the timeline remains available and scrolls only inside its own container.
- Report and room-plan tables remain semantic tables on larger screens. On small screens the table is hidden and an equivalent article/card representation is rendered from the same table content.
- New Manager features should reuse the application layout tokens and `manager-surface` boundary instead of adding feature-specific widths.

## Accessibility

Do not reduce focus contrast, form border contrast or status distinguishability when changing tokens. Color is not the only state indicator: selected states also use borders, text and/or inset markers.

Responsive replacements must preserve equivalent content and reading order. Wide two-dimensional content such as calendars and the room timeline may scroll horizontally inside their own bounded region; the page itself must continue to reflow without horizontal scrolling.
