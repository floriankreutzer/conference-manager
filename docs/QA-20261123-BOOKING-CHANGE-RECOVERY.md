# CO-299 booking-change recovery

## Behavior and boundary

A persisted `applying` proposal was visible after refresh but had no usable
recovery action and disappeared from Action required. The API already supports
resuming approval with the same request/change identity and persisted attempt.
The Manager now offers **Resume change / Umsetzung fortsetzen** for this state,
through the existing decision persistence and mutation tracker. Pending proposals
retain their separate approve/reject controls. Applying proposals cannot be
rejected or replaced. No automatic write/retry, new endpoint, role, browser
authority, storage, dependency or CSS is introduced.

The existing per-request mutation tracker disables the resume action while a
decision is in flight, including after refresh. Success still requires the
validated authoritative response. Authority loss and navigation handling remain
in the existing decision path. The action-required list retains pending and
applying work until terminal readback.

The companion API correction binds room-move create to the selected provider
resource. Frontend recovery alone cannot repair a provider or reconcile an
unknown external result; backend validation and recovery remain authoritative.

## Design coverage

Reviewed source: `automatic-engineering-design-skills` at
`3f7f7bcd7dc5949b9867119a353d480eb87f9f71`. Current application requirements
override marketing defaults. The scoped surface is the Manager booking card.

| Catalog entries | Assessment and decision |
| --- | --- |
| pavurel-app-design, impeccable | Applied: explicit unfinished state, one recovery action, truthful server-confirmed success; reuse native button/info-box. |
| design-taste-frontend | Applied: precise DE/EN action copy, existing action hierarchy/type/spacing; no marketing imagery, heroes or decorative effects. |
| emil-design-eng, apple-design | Applied: immediate semantic keyboard/click action, disabled in-flight state, interruption/refresh safety; no new motion. |
| break-ui | Applied: persisted applying state, missing/terminal status, slow response, refresh, duplicate activation and DE/EN fixtures. No production test toggle. |
| mobile-native | Applied: existing responsive button row and touch target; Chromium/WebKit checks are emulation, not physical-device evidence. |
| pick-ui-library | Applied: existing native controls and persistence path suffice; no library. |
| 21st-design-research | Applied: metadata-only search on 23 November for inline error/retry/loading patterns; Action Button 43933 and Error Empty State 19376. Existing native control is sufficient; no code/media retrieved or adopted. |
| pavurel-web-design | Not applicable: authenticated application, no marketing page. |
| prototype | Not applicable: existing action contract, no unresolved design alternatives. |
| find-animation-opportunities, animate, review-animations, animation-performance, improve-animations, animation-vocabulary | Not applicable: bounded recovery behavior, no motion exploration, transition or animation changes/review. |
| ask-sonner, animate-expo, write-swift | Not applicable: native web DOM; no Sonner, Expo or Swift. |

## Validation scope

The added browser cases exercise DE/EN keyboard activation, one decision with
CSRF, disabled state across refresh, and final authoritative readback in both
configured engines. Existing applying-state tests continue to forbid fresh
approve/reject controls. The model test keeps applying work discoverable and
excludes terminal/unknown changes. These fixtures do not prove live provider,
physical Safari or deployed recovery. Full repository and paired release gates
remain required independently; native CI records their actual results.
