# SaaS 2 effective Tenant presentation

## Scope and ownership

The effective Tenant presentation is a minimized, read-only projection for every authenticated Employee, Conference Manager, and Tenant Admin. Platform owns the transport adapter, in-memory revision lifecycle, and application-shell rendering. Tenant Admin continues to own Organization editing. Core owns the existing language and locale-aware formatting contract.

The browser presentation is not an authorization boundary. Tenant configuration writes and managed-brand authorization remain server-side controls. Production never falls back to Demo fixtures, browser-stored Tenant authority, a remote image, or tenant-controlled CSS.

PAVUREL is the code-shipped product-default visual identity. The product name remains **Conference Manager**. A Tenant may select an explicitly allowlisted, code-shipped managed branding preset without changing the product-default identity or weakening the same-origin asset boundary.

## Production read contract

The existing same-origin authenticated API client reads `GET /api/v1/tenant/presentation` with its normal no-store, redirect rejection, response-size, and session protections. The response must match this exact versioned envelope:

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

Demo derives the projection from the same in-memory Organization adapter used by Tenant Admin. The normal fixture is deterministic: **Conference Manager**, German, EUR, and `product-default`, which renders the code-shipped PAVUREL signet at revision `1`. It does not select the legacy managed Conference Manager mark by default.

An Organization save refreshes the effective presentation in the current page lifecycle. A Demo role change or explicit reset reloads and reconstructs the same PAVUREL product-default fixture, so the shell must not revert to a former sample Tenant name or managed-logo preset. The reset retains a valid explicit User language preference, which continues to win over the Tenant default.

## Verification

Focused unit coverage validates exact envelopes, unknown fields, unsafe/remote values, safe fallback, stale revisions, ordered async reset refresh, User-language precedence, Tenant currency, semantic mark replacement, and the deterministic PAVUREL Demo default before and after reset. Browser coverage exercises all canonical role combinations, Organization save refresh, Production fallback without Demo activation, narrow-viewport reflow, and PAVUREL identity retention across Demo role-switch reloads on both configured Chromium and WebKit projects.

Run:

```bash
node --test tests/tenant-presentation.test.js tests/pavurel-branding.test.js
npx playwright test tests/e2e/tenant-presentation.spec.js tests/e2e/demo-role-switch.spec.js
npm run check
npm run audit
```
