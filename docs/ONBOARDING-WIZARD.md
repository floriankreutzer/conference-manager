# Tenant Admin Onboarding Wizard

## Runtime and presentation contract

There are three onboarding compositions. Their provider, persistence and
activation boundaries must remain distinct when reviewing the UI or recording
acceptance evidence.

| Composition | Presentation | Authoritative state and evidence boundary |
| --- | --- | --- |
| REAL Microsoft 365 | Seven-step Microsoft onboarding wizard | The trusted session and same-origin APIs own connection, room mappings, capability health and readiness. Microsoft acceptance requires the actual reviewed provider integration. |
| Ordinary Customer Demo, including Fabrikam | The same seven-step Microsoft-shaped wizard | The Hosted Demo uses the server-backed application and a Demo-only simulated provider connection. Saved settings, imported rooms and readiness survive reload. This proves the Demo journey, not a real Microsoft connection. |
| Protected DEV/INT synthetic calendar | Four server-derived readiness checks, candidate import and explicit lifecycle actions | A protected optional composition selects the synthetic provider only from validated server classification. It does not execute Microsoft consent or establish Microsoft capability health. |

The ordinary Hosted Demo and protected synthetic calendar are different paths.
Neither the number of visible steps nor a browser flag establishes provider or
Tenant authority. Screen 25 in the
[Customer QA screen contract](CUSTOMER-QA-SCREEN-CONTRACT.md) must be evaluated
against the actual composition under review.

## Seven-step Microsoft presentation

1. Confirm organization identity.
2. Connect Microsoft 365 and complete admin consent.
3. Verify the connection and required read permissions.
4. Discover Microsoft 365 rooms.
5. Select and import rooms into tenant master data.
6. Verify calendar free/busy through the server-side Microsoft calendar provider.
7. Review server-derived readiness for separate operator activation.

The shared presentation is implemented by
[`onboarding-wizard.js`](../src/tenant-admin/onboarding-wizard.js) and the
[Microsoft 365 section](../src/tenant-admin/sections/microsoft365/index.js).
The composed
[`microsoft365-onboarding-runtime.js`](../src/platform/microsoft365-onboarding-runtime.js)
delegates to the injected connection, onboarding and catalogue APIs; it does not
store an authoritative browser-side progress record. Its `isDemo` property alone
must not be used to infer whether the injected provider is real or simulated.

### REAL authority

Production state is reconstructed from same-origin server APIs and the trusted production session. Tenant ID, User ID, roles, permissions, connection state, mappings, capability health and pilot readiness are never accepted from LocalStorage, query parameters or browser-selected values as authorization authority.

Room discovery and import use the tenant-scoped Microsoft integration APIs. Free/busy verification must execute through the server-side mapped-room calendar provider so successful verification records authoritative capability health. Tenant Admins can read readiness but cannot activate a tenant or grant commercial/operator entitlements.

Before the browser starts Microsoft admin consent, the connection step explains the reviewed least-privilege purpose of `Place.Read.All` and `Calendars.ReadBasic.All` and identifies calendar write as a separate optional pilot capability. The browser redirects only after this explanation is present and the Tenant Admin explicitly starts the connection action.

Public, machine-readable backend error codes are mapped to recovery guidance for expired/revoked sessions, missing Tenant Admin authority, denied consent, revoked provider access, missing Graph permissions, throttling, provider unavailability and stale connection state. Provider payloads, secrets, request details and arbitrary server text are never reflected into the page. Unknown errors retain the operation-specific generic fail-closed message. The adapters are
[`microsoft365-connection-api.js`](../src/platform/microsoft365-connection-api.js)
and [`microsoft365-onboarding-api.js`](../src/platform/microsoft365-onboarding-api.js).

### Ordinary Hosted Demo and Fabrikam

[`demo-bootstrap.js`](../src/platform/demo-bootstrap.js) composes the common
customer application with Demo authentication and
[`demo-microsoft365-connection-api.js`](../src/platform/demo-microsoft365-connection-api.js).
The connection adapter accepts only the exact same-origin HTTPS callback path
and its bounded consent parameters. The API still owns session, CSRF, one-time
state and provider-Tenant binding. The Demo provider simulates consent,
discovery and calendar verification without real Microsoft credentials.

This hosted composition is **not an in-memory onboarding simulation**. Fabrikam
starts in onboarding with no imported rooms, progresses through organization,
connection, discovery, selection, import and free/busy verification, and reloads
the saved server state. Completing these steps does not silently activate the
Tenant. The deterministic in-memory implementation exposed through
[`demo-onboarding.js`](../src/tenant-admin/demo-onboarding.js) is a separate
compatibility/test facade; it is not the Hosted Demo bootstrap.

The permanent [Fabrikam scenario](../tests/e2e-saas37/fabrikam-scenario.js)
exercises this server-backed flow. Its successful execution can establish Demo
persistence and progression only. It must not be cited as Microsoft, Entra,
Graph, real email or Production provider acceptance.

## Protected synthetic calendar

The centralized `customer.synthetic-onboarding` flag defaults off.
[`feature-flags.js`](../src/platform/feature-flags.js) permits the presentation
only for the exact protected DEV/INT document markers.
[`production-bootstrap.js`](../src/platform/production-bootstrap.js) then
injects the optional classifier. Those document markers grant no API authority.

[`synthetic-onboarding-api.js`](../src/platform/synthetic-onboarding-api.js)
requires a validated current `v1/tenant/runtime` response. A positively validated
REAL classification selects the existing Microsoft section. An unknown,
unavailable or malformed classification produces a bounded error state, never
a Microsoft fallback. Authority failures use the application invalidation path.
The synthetic section replaces Microsoft onboarding and omits the unrelated
capability section, real invitations and Microsoft group-role mapping in this
composition.

The [synthetic calendar section](../src/tenant-admin/sections/synthetic-calendar/index.js)
shows these four checks from the server response:

| Check | Required meaning |
| --- | --- |
| `roomsImported` | At least one room has been imported. |
| `calendarResourcesBound` | At least one room exists and every imported room has its synthetic calendar binding. |
| `directoryEntitled` | The server reports the required directory entitlement. |
| `calendarEntitled` | The server reports the required calendar entitlement. |

Readiness is true only when all four checks are true. The browser validates
these relationships against the reported room counts; it does not grant
entitlements. Calendar-write entitlement is displayed separately.

Reading the view does not provision rooms. Import is an explicit action over
the bounded named candidate inventory, carrying `expectedRevision` and selected
candidate keys. Already imported candidates remain visible as imported and are
not selectable again. Readiness and the Tenant lifecycle are separate:
`onboarding` to `ready`, then `ready` to `active`, are explicit API-backed actions
with the expected revision and status. These permitted synthetic actions do not
change the REAL operator-activation boundary.

After an unconfirmed write, further mutations remain unavailable until an
explicit successful state read; the browser does not automatically replay the
write. The active-state application link performs a same-origin navigation for
a fresh session view. The bounded candidate selection is temporary UI state,
not persistent authorization or a trusted completion checkpoint.

## Accessibility and recovery

The seven-step wizard uses native controls, visible step status, `aria-current`,
live status/error announcements and keyboard-operable actions. Site,
room-selection and capacity errors set `aria-invalid`, reference one visible
status message through `aria-describedby` and move focus to the first control
that needs correction. Successful async transitions restore focus to the new
current-step heading. Provider errors remain recoverable through explicit
retry/reconnect/re-consent rather than client-side state overrides.

The synthetic section uses native candidate checkboxes and buttons, a captioned
inventory table inside a bounded scroll region, live status/error feedback and
focus on the refreshed heading. Candidate selection survives language rerender
within the mounted section and drops candidates that are no longer available.
Both compositions must preserve DE/EN wording, keyboard access, narrow-screen
reflow and distinguish unavailable state from incomplete setup.

## Verification and evidence scope

| Contract | Source tests to execute for the relevant candidate |
| --- | --- |
| Seven-step rendering, validation and focus | [`onboarding-ui-contract.test.js`](../tests/onboarding-ui-contract.test.js), [`onboarding-wizard-behavior.test.js`](../tests/onboarding-wizard-behavior.test.js), [`onboarding-error.test.js`](../tests/onboarding-error.test.js), and the Production onboarding cases in [`production-application.spec.js`](../tests/e2e/production-application.spec.js). |
| REAL connection and onboarding API boundaries | [`microsoft365-connection-api.test.js`](../tests/microsoft365-connection-api.test.js) and [`microsoft365-onboarding-api.test.js`](../tests/microsoft365-onboarding-api.test.js). Protocol fixtures are not real provider acceptance. |
| Server-backed Demo connection, persistence and reset | [`demo-microsoft365-connection-api.test.js`](../tests/demo-microsoft365-connection-api.test.js), [`fabrikam-scenario.js`](../tests/e2e-saas37/fabrikam-scenario.js), and the full [`three-customer-scenarios.spec.js`](../tests/e2e-saas37/three-customer-scenarios.spec.js). Preserve the [permanent scenario contract](SAAS-3.7-SCENARIO-ACCEPTANCE.md). |
| Protected synthetic classification, four checks and lifecycle | [`synthetic-onboarding-api.test.js`](../tests/synthetic-onboarding-api.test.js), [`synthetic-onboarding.spec.js`](../tests/e2e/synthetic-onboarding.spec.js), and the paired protected [`customer-onboarding.spec.js`](../tests/e2e-protected/customer-onboarding.spec.js). |

These references identify coverage, not an executed result. Jira owns product
acceptance and dated evidence. Record the exact frontend/API pair, runtime mode,
browser, language and actual outcome there; keep simulated provider, protected
synthetic and real provider evidence separate.
