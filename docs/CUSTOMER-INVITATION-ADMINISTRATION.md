# Customer invitation administration candidate

The existing Tenant Admin Users section owns a separate invitation panel when
its explicitly injected adapter supplies the invitation client. This extends the
approved Users information architecture; it adds no new settings section or role.
Ordinary User role/access administration and last-admin protection remain with
their existing owners. Tenant Operator continues to mean the existing Tenant
Admin role and never grants Platform authority.

Production composition has an explicit factory port. The central
`customer.invitations` presentation flag defaults OFF, so neither current
Production nor either closed Demo activates this panel. The real Customer
invitation client cannot enter the Customer Demo dependency graph, including
through an intermediary. The shared view/controller consume injected ports and
have no provider destination, session issuance or browser persistence. Turning
on presentation does not authorize the backend or activate protected INT.

The form supports one through20 individually labeled recipients, each with its
own existing elevated role selection and DE/EN email language. Employee is the
implicit baseline. Add/remove use native controls and move focus to the affected
email field. Drafts survive a same-section language rerender in memory. Recipients,
roles and command IDs are never written to browser storage or logs.

The client uses only the fixed Customer invitation API through the existing
session/CSRF transport, with a bounded deadline. It rejects unknown command fields,
invented roles, invalid revisions, oversized/sparse batches, duplicate recipients,
private/contradictory receipts and unordered/foreign-page results. These checks
protect presentation and transport; current session, Tenant, role, lifecycle,
object/revision authority and audit remain exclusively backend responsibilities.

Initial issuance keeps one immutable in-memory command ID/body if its response is
uncertain. Only the explicit recovery action can retry that exact command. It
cannot create a second command while pending, and it reloads current list state
after the original receipt succeeds. Reissue/revoke bind the loaded invitation ID
and revision; uncertainty requires a read refresh before any further mutation,
without automatic write replay. A reload loses unsent/recovery commands; current
server invitation state remains authoritative. Disposal fences late read updates.

Status distinguishes open/accepted/revoked/expired invitations from queued,
processing, provider-accepted, failed or cancelled email. Provider acceptance is
explicitly not delivery confirmation. Dates/counts use existing localization.
Recipient labels use safe DOM text; per-object action names identify their target.
Native forms/fieldsets/labels, status/alert semantics and keyboard focus are reused.
Scoped CSS in the existing Tenant Admin operations stylesheet fixes nested
fieldset intrinsic widths and wraps legends/role labels without clipping content.
No dependency, color token, stylesheet layer or alternative component system is added.

Validation checkpoint: the full local check passed815 tests; dependency audit
reported zero vulnerabilities. Twenty-one focused client/controller/flag/Demo
boundary tests passed. Three isolated HTTPS-loopback WebKit/iPhone browser cases
passed for multi-person role/language selection, reissue/revoke, keyboard focus,
language draft preservation,320/1280 widths with200% root text, exact-command
recovery and read-only recovery after lost mutation response. The initial reflow
case failed on nested native fieldset widths; scoped CSS corrected it, and the
original overflow assertion remains. Browser fixtures use synthetic data and
block all non-loopback destinations; they neither send real mail nor prove
deployed TLS, live session/CSRF or actual server admission.

Current-head GitHub Chromium/WebKit, permanent three-customer/two-reset-cycle
acceptance, review, paired API composition and protected INT activation remain
separate gates. This candidate follows Customer email-login PR361 and the API
invitation/custody/admission/HTTP candidates. SaaS1 issues350/351/352/355 remain
open until their complete acceptance criteria and external gates are satisfied.
