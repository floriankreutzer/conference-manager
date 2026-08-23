# Phase 2 Slice 1 — Characterization Before Extraction

Responsibility protected before changing runtime consumers:

- Employee request editing/session state.
- Draft payload and restore semantics.
- Room-availability ordering and conflict behavior.
- Request cost composition.
- Repeat/change editing state reconstruction.
- Submit/resubmit/cancel transitions.
- Employee request-list filtering.
- Manager confirm/change/reject transitions.

The runtime still uses the existing `src/app.js` implementation at this slice. The new modules are characterization targets first; switching runtime consumers occurs only after these tests pass in CI.
