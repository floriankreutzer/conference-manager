# Conference Manager Demo Runbook

## Purpose and status

This runbook describes the deterministic baseline that is available in the static Demo today. It is an operating aid, not evidence that every SaaS 2 milestone requirement is complete. The Demo has no backend, real identity provider, customer tenant or production authorization boundary. Use example data only.

The browser declares `conference-runtime=demo`. The visible role selector changes presentation perspective only; it does not grant a production role.

## Deterministic baseline

After an explicit Demo reset and reload, the following baseline is recreated:

| Surface | Baseline | Lifetime |
| --- | --- | --- |
| Language | The language selected immediately before reset is retained. German is the fallback when no valid preference exists. | Browser-local |
| Perspective | Employee | Browser-local |
| Profile | The example profile `Florian Kreutzer` is seeded when no profile exists. | Browser-local |
| Employee data | No saved requests, request draft or notifications. The built-in room, service, catering and site examples are seeded on first use. | Browser-local |
| Tenant settings and presentation | Organization, locations, catalogue, booking policies and cost allocation start in their normal fixtures at revision `1`. The effective presentation is Northstar Events, German, EUR and the code-shipped managed mark. | In memory for the page lifecycle |
| Microsoft 365 onboarding | Disconnected, unverified, no imported mappings and FreeBusy not verified. Calendar Write is not entitled in the current fixture. | In memory for the page lifecycle |
| Tenant users, audit and readiness | Deterministic example fixtures with fixed identifiers and timestamps. | In memory for the page lifecycle |
| Images and route code | Catering art is deterministic inline SVG. The baseline OpenStreetMap QR code is a repository-owned asset. Conference Manager image edits accept only bounded managed `assets/` paths or constrained inline SVG data; cross-origin sources are rejected before save. No external image or QR service is contacted automatically. | Repository-owned |

The capabilities/readiness panel is a separate read-only fixture in the current Demo. Do not infer that it changes in response to the Microsoft 365 onboarding controls.

## Reset and reseed

1. Select the language that should remain active.
2. Choose **Clear demo data** in the Demo Mode panel.
3. Confirm the browser prompt.
4. Wait for the automatic reload.
5. Verify that the role selector shows Employee and no saved request is present.
6. Switch to Tenant Admin only when the Tenant Admin baseline needs to be inspected.
7. Verify revision `1` in each settings section, the Northstar Events managed mark and a disconnected Microsoft 365 onboarding state.

The reset removes every `conference_*` key from both `localStorage` and `sessionStorage`, restores only the selected language, and reloads the page. The profile, reference catalogue and site examples are then seeded again by the normal Demo bootstrap. Tenant Admin adapters are newly constructed by the application composition root.

Changing the Demo role also reloads the page. Tenant Admin adapters are currently in memory, so an ordinary role change recreates their fixtures. Do not use a role switch as evidence that Tenant Admin configuration persists across perspectives.

## Current usable baseline scenarios

- Employee: create and submit an example conference request, inspect room and catering illustrations, and clear the browser-local result with the reset control.
- Conference Manager: inspect submitted requests, make the currently supported decisions, review room planning and reports, and edit the legacy browser-local reference examples.
- Tenant Admin: inspect and edit the normal in-memory fixtures for organization, locations, catalogue, booking policies and cost allocation; exercise the currently exposed Microsoft 365 connect, verify, room import and FreeBusy sequence; inspect example users, audit entries and readiness.
- Confirmed request print view: open the visitor information view. The baseline route link is external but is contacted only after deliberate navigation; its QR image is served by the Demo origin.

There is no supported end-user scenario selector for empty, conflict, history, recovery, degraded or revoked provider fixtures. Private adapter fixtures and test-only module construction are not a documented customer scenario.

## Tracked capabilities that are not complete

Do not present the following work as implemented by this runbook:

- [#126](https://github.com/floriankreutzer/conference-manager/issues/126): full productive request-contract parity. In particular, the Demo does not yet provide the complete confirmed-booking change lifecycle or make Tenant Settings the authoritative request catalogue and policy source.
- [#127](https://github.com/floriankreutzer/conference-manager/issues/127): governed master-data import/export, including dry-run validation, transactional commit, replay behavior and minimized export. No such Demo flow is available yet.

Those issues must add their own deterministic fixtures, reset behavior, documented acceptance steps and regression coverage before their capabilities can be added to the supported scenario list.

## Network and data-safety verification

The application CSP limits `img-src` to `'self'` and `data:` and sets `connect-src 'none'`. A route hyperlink may point to an external HTTPS site, but the Demo does not fetch it until the user deliberately follows the link.

Run the focused checks with:

```bash
node --test tests/demo-network-isolation.test.js
npx playwright test tests/e2e/demo-network-isolation.spec.js
npm run check:static
```

Use the repository-wide `npm run check`, `npm run audit` and full Chromium/WebKit Playwright suite before integration.
