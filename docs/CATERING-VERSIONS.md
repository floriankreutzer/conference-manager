# Reviewed Catering versions

The Manager owns a new optional version panel under the existing default-off
server-backed Catering delivery capability. It consumes minimized authorized
version context and 20-entry history from the API; it does not infer authority
from a browser snapshot. Platform owns wire validation and same-origin transport.
No framework, storage key, dependency, rollout flag or outbound destination is added.

The panel distinguishes the latest proposed version from the latest fully
confirmed effective supplier order, including its separate supplier cost. A
change uses a newer confirmed conference; an exception reviews a changed supplier
quote on the confirmed source; cancellation remains an explicit supplier action
even after the conference itself is cancelled. The server advertises the eligible
operations. The Manager selects one and supplies justification; nothing is
preselected, sent or cancelled by proposing it.

After proposal, the Manager records a fresh supplier quote, explicitly decides on
its exact cost, queues the approved version and records actual manual transmission
and complete supplier outcomes through the existing factual workflow. Incomplete,
partial or substitution responses do not replace the effective order. Supplier
substitution acceptance and changed positions remain separate work.

Quote/decision commands now bind the displayed order version. For initial version1
the wire omits the new field for rolling compatibility, while acknowledgement
validation still requires version1. Later versions explicitly include it. Backend
omission means version1 only, preventing stale revision counters from approving a
different order version. Historical detail links send the explicit version query,
validate the returned version and render a read-only detail without quote,
decision, delivery, manual-fact or document actions. Returning to current state
reloads authority; keyboard focus moves to the detail heading.

Panel reads have their own busy state and restore focus only for their own
trigger. Unchanged read refresh preserves justification; changed request/basis or
failed/stale reads remove the proposal form. Detached responses cannot repaint.
Parent-owned mutations lock all order writes. A conflicting or uncertain write
requires explicit current-order reload, with no automatic retry. Existing authority
failure handling locks the workspace. Justification stays in memory, is submitted
once and is rendered as text, never HTML. Tenant audit learns the minimized version
proposal action without justification/session/actor security data.

Native forms, required selection and justification, labelled controls, live
status, semantic history, central DE/EN translations, locale number/date/currency
formatting and existing design tokens are reused. Browser evidence must cover both
required engines, keyboard/focus, phone/landscape reflow, full version review versus
historical commitment, source change/cancellation, read/write failures, authority
loss, detachment, existing Catering regressions, actual Chromium200% zoom and the
unchanged full three-customer/two-reset acceptance against an immutable API ref.

The following branch increment adds [local unsent withdrawal and reviewed first
physical replacements](CATERING-UNSENT-ORDERS.md), with its acceptance status recorded
separately. This UI does not complete new provider order creation, changed supplier positions, published catalogue/availability/cutoffs,
real provider credentials/adapters, supplier qualification or release gates.
