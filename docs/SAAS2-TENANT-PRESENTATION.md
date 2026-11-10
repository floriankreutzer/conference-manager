# SaaS 2 effective Tenant presentation

## Scope and ownership

The effective Tenant presentation is a minimized, read-only projection for every authenticated Employee, Conference Manager, and Tenant Admin. Platform owns the transport adapter, in-memory revision lifecycle, and application-shell rendering. Tenant Admin continues to own Organization editing. Core owns the existing language and locale-aware formatting contract.

The browser presentation is not an authorization boundary. Tenant configuration writes and managed-brand authorization remain server-side controls. Production never falls back to Demo fixtures, browser-stored Tenant authority, a remote image, or tenant-controlled CSS.

PAVUREL is the code-shipped product-default visual identity. The product name remains **Conference Manager**. A Tenant may select an explicitly allowlisted, code-shipped managed branding preset without changing the product-default identity or weakening the same-origin asset boundary.

## Shared authenticated read contract

Customer Demo and Production use `createTenantPresentationApi` through the shared Composition Root in [`src/app.js`](../src/app.js). The existing same-origin authenticated API client reads `GET /api/v1/tenant/presentation` with its normal no-store, redirect rejection, response-size, and session protections. The response must match this exact versioned envelope:

```json
{
  "schemaVersion": 1,
  "revision": 1,
  "presentation": {
    "displayName": "Example Tenant",
    "defaultLocale": "de-DE",
    "defaultCurrency": "EUR",
    "branding": {
      "logoPreset": "product-default",
      "accentToken": "default"
    }
  }
}
```

Allowed values are deliberately bounded:

- `defaultLocale`: `de-DE` or `en-GB`;
- `defaultCurrency`: `CHF`, `EUR`, `GBP`, or `USD`;
- `logoPreset`: `product-default` or `conference-manager-mark`;
- `accentToken`: `default` only.

Unknown fields, unsupported schema versions, non-positive revisions, unsafe display names, remote references, arbitrary URLs, data URLs, custom styles, and unknown presets invalidate the complete response. Transport and response-validation failures apply the product-owned fallback: Conference Manager, German, EUR, the approved PAVUREL product-default signet, and revision `0`. If the local PAVUREL asset itself cannot load, the shell degrades to the safe `CM.` text mark. Neither fallback activates Demo data or authority.

## Organization write and branding contract

The Organization form provides a native bounded select with two choices: no Tenant-specific managed logo, which resolves to the PAVUREL product default, or the reviewed legacy Conference Manager managed mark. It never accepts a raw reference, URL, upload, or style value. The only non-null wire reference is:

```text
managed-brand:conference-manager-mark-v1
```

The browser maps the effective `conference-manager-mark` preset only to `assets/brand/conference-manager-mark.svg`, a code-shipped same-origin asset permitted by the existing CSP. The `product-default` preset maps only to the approved local PAVUREL signet. If either configured local mark cannot load, the safe product text mark remains the final visual fallback. The adjacent Organization display name remains the accessible textual identity, so decorative images use empty alternative text and do not change heading, navigation, or focus semantics.

Uploads are intentionally unsupported in this milestone. Therefore upload MIME, filename, size, malware-scanning, and storage tests are not applicable. Adding uploads later requires a separately approved managed-asset service and its complete server-side security controls.

## Locale, currency, and revision behavior

Language precedence is:

1. a valid explicit User language preference stored through the existing profile language control;
2. the effective Tenant default locale;
3. German as the safe product fallback.

Tenant defaults never overwrite or persist themselves as a User preference. The active Tenant currency drives the existing locale-aware `formatMoney` contract and the initial currency of newly added Catalogue entries. Existing Catalogue prices retain their explicit ISO 4217 currency.

The presentation runtime stores only the current validated snapshot in memory. It performs a fresh no-store read on bootstrap and after a successful Organization write. Monotonically increasing revisions invalidate the applied presentation; stale lower revisions fail to the safe product presentation rather than silently reapplying stale branding. A successful refresh updates the shell in-session without changing semantic structure or focus ownership.

## Demo and reset behavior

Customer Demo derives the projection from the selected Tenant's server-persisted Organization settings through the same authenticated presentation API. Only the validated browser projection is held in memory. The old in-memory Organization/presentation adapters remain isolated compatibility or test fixtures; they do not own the active shared Demo state. See [ADR-010](ADR-010-SHARED-SERVER-BACKED-DEMO-RUNTIME.md).

An Organization save refreshes the effective presentation in the current page lifecycle. A Demo role or Tenant switch establishes the server-authorized context and reloads its current presentation; it does not reset Organization settings or force revision `1`. A supported server-side Demo reset restores the versioned canonical seed and invalidates Customer and Platform Demo sessions. After a new session is established, the shell reads the restored Tenant's presentation. Display name, locale, currency, branding and revision follow that Tenant's seed or later persisted configuration, not a universal browser fixture.

The [permanent Demo scenario contract](SAAS-3.7-SCENARIO-ACCEPTANCE.md) owns canonical seed/reset expectations. A valid explicit User language preference remains a non-authoritative browser preference and continues to take precedence over the Tenant default.

## Verification

Focused unit coverage validates exact envelopes, unknown fields, unsafe/remote values, safe fallback, stale revisions, ordered async refresh, User-language precedence, Tenant currency and semantic mark replacement. Tests of the legacy in-memory adapter's deterministic PAVUREL default prove that isolated fixture only. Mocked browser coverage exercises role combinations, Organization save refresh, Production fallback without Demo activation, narrow-viewport reflow and server-shaped Demo context switches on the configured Chromium and WebKit projects.

Shared-server persistence and reset acceptance require the separate canonical Demo browser gates against an immutable API counterpart. Unit fixtures and mocked browser responses do not establish the current hosted deployment or real Microsoft/Exchange acceptance.

Run:

```bash
node --test tests/tenant-presentation.test.js tests/pavurel-branding.test.js
npx playwright test tests/e2e/tenant-presentation.spec.js tests/e2e/demo-role-switch.spec.js
npm run check
npm run audit
```
