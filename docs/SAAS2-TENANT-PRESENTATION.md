# SaaS 2 effective Tenant presentation

## Scope and ownership

The effective Tenant presentation is a minimized, read-only projection for every authenticated Employee, Conference Manager, and Tenant Admin. Platform owns the transport adapter, in-memory revision lifecycle, and application-shell rendering. Tenant Admin continues to own Organization editing. Core owns the existing language and locale-aware formatting contract.

The browser presentation is not an authorization boundary. Tenant configuration writes and managed-brand authorization remain server-side controls. Production never falls back to Demo fixtures, browser-stored Tenant authority, a remote image, or tenant-controlled CSS.

## Production read contract

The existing same-origin authenticated API client reads `GET /api/v1/tenant/presentation` with its normal no-store, redirect rejection, response-size, and session protections. The response must match this exact versioned envelope:

```json
{
  "schemaVersion": 1,
  "revision": 1,
  "presentation": {
    "displayName": "Northstar Events",
    "defaultLocale": "de-DE",
    "defaultCurrency": "EUR",
    "branding": {
      "logoPreset": "conference-manager-mark",
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

Unknown fields, unsupported schema versions, non-positive revisions, unsafe display names, remote references, arbitrary URLs, data URLs, custom styles, and unknown presets invalidate the complete response. Transport and response-validation failures apply the product-owned fallback: Conference Manager, German, EUR, the default text mark, and revision `0`. That fallback does not activate Demo data or authority.

## Organization write and branding contract

The Organization form provides a native bounded select with two choices: no Tenant logo or the reviewed Conference Manager mark. It never accepts a raw reference, URL, upload, or style value. The only non-null wire reference is:

```text
managed-brand:conference-manager-mark-v1
```

The browser maps the effective `conference-manager-mark` preset only to `assets/brand/conference-manager-mark.svg`, a code-shipped same-origin asset permitted by the existing CSP. If that asset cannot load, the existing product text mark remains the visual fallback. The adjacent Organization display name remains the accessible textual identity, so the decorative image has empty alternative text and does not change heading, navigation, or focus semantics.

Uploads are intentionally unsupported in this milestone. Therefore upload MIME, filename, size, malware-scanning, and storage tests are not applicable. Adding uploads later requires a separately approved managed-asset service and its complete server-side security controls.

## Locale, currency, and revision behavior

Language precedence is:

1. a valid explicit User language preference stored through the existing profile language control;
2. the effective Tenant default locale;
3. German as the safe product fallback.

Tenant defaults never overwrite or persist themselves as a User preference. The active Tenant currency drives the existing locale-aware `formatMoney` contract and the initial currency of newly added Catalogue entries. Existing Catalogue prices retain their explicit ISO 4217 currency.

The presentation runtime stores only the current validated snapshot in memory. It performs a fresh no-store read on bootstrap and after a successful Organization write. Monotonically increasing revisions invalidate the applied presentation; stale lower revisions fail to the safe product presentation rather than silently reapplying stale branding. A successful refresh updates the shell in-session without changing semantic structure or focus ownership.

## Demo and reset behavior

Demo derives the projection from the same in-memory Organization adapter used by Tenant Admin. The normal fixture is deterministic: Northstar Events, German, EUR, and the code-shipped managed mark at revision `1`. An Organization save refreshes the effective presentation in the current page lifecycle. A Demo role change or explicit reset reloads and reconstructs the same deterministic fixture. The reset retains a valid explicit User language preference, which continues to win over the Tenant default.

## Verification

Focused unit coverage validates exact envelopes, unknown fields, unsafe/remote values, safe fallback, stale revisions, ordered async reset refresh, User-language precedence, Tenant currency, and semantic mark replacement. Browser coverage exercises all canonical role combinations, Organization save refresh, Production fallback without Demo activation, and narrow-viewport reflow on both configured Chromium and WebKit projects.

Run:

```bash
node --test tests/tenant-presentation.test.js
npx playwright test tests/e2e/tenant-presentation.spec.js
npm run check
npm run audit
```
