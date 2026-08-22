# Conference Manager Design System

## Design direction

The application uses a restrained consulting-style visual language: high contrast, clear hierarchy, compact business surfaces and limited decorative effects. The product retains its own identity through Bordeaux and Camel rather than copying another brand.

- Bordeaux is the primary action and selection color.
- Camel remains an intentional surface color for contextual information, selected business summaries, calendar items and selected KPI surfaces.
- Black/anthracite, white and warm neutral greys form the main application canvas.
- Manager dashboard structure is preserved; styling is refined rather than functionally redesigned.
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

### Typography and density

Typography, spacing, control height and layout density are controlled via `--font-*`, `--space-*`, `--control-height` and layout tokens.

For manager screens specifically:

- `--manager-content-max-width`: maximum width of the operational manager workspace
- `--manager-control-gap`: spacing between tab/filter controls
- `--manager-section-gap`: spacing between manager sections
- `--control-padding-inline`: horizontal control padding
- `--button-min-inline-size`: default inline action size
- `--responsive-table-label-width`: label column used by mobile report cards

### Shape and elevation

The consulting-style UI deliberately uses small radii and restrained shadows. Adjust `--radius-*` and `--shadow-*` centrally if the visual language changes later.

## CSS responsibilities

- `assets/tokens.css`: global design decisions only.
- `assets/styles.css`: shared application components, forms, navigation, requests, calendar and dialogs.
- `assets/feature-parity.css`: Manager, reporting, room-planning, catering image and administration components.
- `assets/manager-layout.css`: responsive Manager containment, normalized controls, button groups, timeline scrolling and mobile report cards.
- `assets/demo-security.css`: demo disclosure component only.

Component styles should not introduce new brand hex values. Use semantic tokens instead.

## Manager responsive rules

Manager screens use one bounded content column. Tabs, filters, toolbars and cards must never increase the page width beyond that column.

- Manager tabs use equal-width grid cells instead of free-width buttons.
- Quick filters use equal-height grid controls.
- Room planning defaults to the list representation on small screens; the timeline remains available and scrolls only inside its own container.
- Report and room-plan tables remain semantic tables on larger screens. On small screens the table is hidden from the accessibility tree and an equivalent article/card representation is rendered from the same table content.
- New Manager features should reuse the existing layout tokens and `manager-surface` boundary instead of adding feature-specific widths.

## Accessibility

Do not reduce focus contrast, form border contrast or status distinguishability when changing tokens. Color is not the only state indicator: selected states also use borders, text and/or inset markers.

Responsive replacements must preserve equivalent content and reading order. Wide two-dimensional content such as the room timeline may scroll horizontally inside its own bounded region; the page itself should continue to reflow without horizontal scrolling.
