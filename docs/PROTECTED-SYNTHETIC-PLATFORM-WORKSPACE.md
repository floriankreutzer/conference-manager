# Protected Platform synthetic workspace

SaaS1 tracking: application issue351, milestone2. This component prepares the
protected DEV/INT Platform presentation. It does not activate an entrypoint,
Microsoft client, provider, passkey mode, sender or deployment.

## Authority and lifecycle

The central feature registry keeps `platform.synthetic-workspace` OFF. Protected
HTML builders accept fixed distinct HTTPS Customer/Platform origins and explicit
presentation metadata. Missing, duplicate or invalid protected/environment markers
leave flags OFF. Synthetic presentation is rejected for PROD. Metadata grants no
server permission: the server still verifies current deployment custody, normal
MFA, actual keys, Actor version, own generation and exact request-bound proof.

An authorized Platform lifecycle operator explicitly opens their own workspace.
Reading it cannot create data. Creation and reset require a separate confirmation
and a fresh passkey assertion. The UI preserves the canonical Northwind ACTIVE,
Contoso READY and Fabrikam ONBOARDING states, shows the 32-generation retention
bound and server cooldown, and links to ordinary lifecycle administration.
Reset disclosures explain retention of previous history. Simulated integrations
are explicitly described. An uncertain mutation result requires an independent
current-state check; neither mutation nor assertion is automatically replayed.

A signed pending browser intent is probed once after normal login, including after
the login query is scrubbed. It only opens confirmation. The operator separately
chooses the known slot and Customer role, then signs the exact handoff. Native
form navigation uses the fixed endpoint and current ordinary-session CSRF.
Customer completion remains a separate explicit confirmation on the Customer
surface. A Tenant Operator never acquires Platform permissions.

The existing passkey operation queue owns all privileged ceremonies. The new
workspace receives the undecorated same-origin API transport inside that queue,
preventing recursive queue acquisition. Native navigation keeps the queue pinned
until pagehide/stop or explicit current-state checking. The latter cancels the
pending form and independently refreshes the ordinary session before releasing
other operations. Reads remain independent. No reusable elevated cookie,
client-side identity, query grant, local storage or caller-selected owner exists.

## Public boundaries

The existing central Platform feature metadata is an import-free presentation
contract shared only with the explicit Customer/Platform bootstrap entrypoints.
The native form contract is also import-free. Boundary checks permit only the
specific workspace client to consume that contract and reject other surface
imports. Production artifact manifests enumerate actual reachable modules;
closed Demo does not include the workspace or protected identity adapters.

## Browser evidence and limits

The isolated browser fixture uses software credentials and the actual pinned
WebAuthn serializer configured with logical `platform.cm-transport.test`. Its
loopback document cannot prove actual document RP binding, physical keys,
Microsoft primary authentication or real backend proof acceptance. Production
DNS/default-port WebAuthn requirements are unchanged.

The transport fixture performs an actual HTTPS native POST and fixed303 between
127.0.0.1 ports4173 and4174, with the protected document's counterpart form-action
and same-origin referrer policy. These are different origins on the same site;
this proves document navigation/CSP serialization, not cross-site SameSite
behavior. It preloads only a fixture Platform cookie, creates no Customer cookie
or identity, and is not a backend integration fixture.

Initial local browser failures remain historical: qualified production WebAuthn
correctly rejected IP/explicit-port configuration; a select locator was corrected
to its semantic combobox name; the alternate127.0.0.2 fixture encountered managed
TLS failure. The supported single-loopback/two-port fixture replaces that address
without proxy or TLS guard changes. Enlarged-text reflow findings are fixed by
wrapping actual labels/controls and constraining grid minimums, without hiding
content. Full CI Chromium/WebKit, permanent three-customer/two-reset gates and
protected roots/provider/operating acceptance remain required.

Current local evidence:18 focused workspace/queue/boundary/metadata/flag tests and
9 unchanged ordinary operation-client tests pass. All3 isolated WebKit journeys
pass, including explicit keyboard reset, unknown outcome/no replay, read-only
operator denial, actual native two-origin303, no Customer session grant and
200-percent text at320/1280px with unchanged overflow assertions. Architecture239,
lint495, whitespace495 and design-token checks pass. Full frozen local check and
fresh main-target CI remain pending at this source checkpoint. No local Chromium
acceptance is claimed because that managed installation is unusable.
