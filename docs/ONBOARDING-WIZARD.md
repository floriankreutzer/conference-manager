# Tenant Admin Onboarding Wizard

The Tenant Admin onboarding experience uses the same seven-step presentation model in Demo and Production while keeping the trust boundaries different.

1. Confirm organization identity.
2. Connect Microsoft 365 and complete admin consent.
3. Verify the connection and required read permissions.
4. Discover Microsoft 365 rooms.
5. Select and import rooms into tenant master data.
6. Verify calendar free/busy through the server-side Microsoft calendar provider.
7. Review server-derived readiness for separate operator activation.

## Production authority

Production state is reconstructed from same-origin server APIs and the trusted production session. Tenant ID, User ID, roles, permissions, connection state, mappings, capability health and pilot readiness are never accepted from LocalStorage, query parameters or browser-selected values as authorization authority.

Room discovery and import use the tenant-scoped Microsoft integration APIs. Free/busy verification must execute through the server-side mapped-room calendar provider so successful verification records authoritative capability health. Tenant Admins can read readiness but cannot activate a tenant or grant commercial/operator entitlements.

Before the browser starts Microsoft admin consent, the connection step explains the reviewed least-privilege purpose of `Place.Read.All` and `Calendars.ReadBasic.All` and identifies calendar write as a separate optional pilot capability. The browser redirects only after this explanation is present and the Tenant Admin explicitly starts the connection action.

Public, machine-readable backend error codes are mapped to recovery guidance for expired/revoked sessions, missing Tenant Admin authority, denied consent, revoked provider access, missing Graph permissions, throttling, provider unavailability and stale connection state. Provider payloads, secrets, request details and arbitrary server text are never reflected into the page. Unknown errors retain the operation-specific generic fail-closed message.

## Demo boundary

Demo presents the same seven-step UI using an in-memory Microsoft simulation. Demo state is intentionally non-authoritative, uses no real Microsoft credentials or tenant data and is visibly labelled as simulated. Demo completion is presentation evidence only and must never be cited as Microsoft, Entra, Graph or production acceptance evidence.

## Accessibility and recovery

The wizard uses native controls, visible step status, `aria-current`, live status/error announcements and keyboard-operable actions. Site, room-selection and capacity errors set `aria-invalid`, reference one visible status message through `aria-describedby` and move focus to the first control that needs correction. Successful async step transitions restore focus to the new current-step heading. Production completion is derived from server state, so a browser restart or sign-out does not create a trusted client-side progress checkpoint. Provider errors remain recoverable through retry/reconnect/re-consent rather than client-side state overrides.
