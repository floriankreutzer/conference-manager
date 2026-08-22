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

### Shape and elevation

The consulting-style UI deliberately uses small radii and restrained shadows. Adjust `--radius-*` and `--shadow-*` centrally if the visual language changes later.

## CSS responsibilities

- `assets/tokens.css`: global design decisions only.
- `assets/styles.css`: shared application components, forms, navigation, requests, calendar and dialogs.
- `assets/feature-parity.css`: Manager, reporting, room-planning, catering image and administration components.
- `assets/demo-security.css`: demo disclosure component only.

Component styles should not introduce new brand hex values. Use semantic tokens instead.

## Accessibility

Do not reduce focus contrast, form border contrast or status distinguishability when changing tokens. Color is not the only state indicator: selected states also use borders, text and/or inset markers.
