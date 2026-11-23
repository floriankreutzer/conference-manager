# CO-299: participant reduction without selected catering

## Cause and scope

The request wizard may retain a catering headcount when neither a package nor
individual items are selected. A confirmed booking with ten participants and an
unused catering count of ten could not be reduced to six: the unchanged strict
request-wire validator rejected the composed draft before its POST.

The shared draft composer now bounds only that inherited, unselected count to
the new participant total. It preserves already-valid counts, selected packages,
individual items, explicit catering overrides and the original request object.
Malformed participant values and invalid source counts still fail at the wire
boundary. No API schema, authorization, price, persistence, migration, dependency,
UI text, form control or design token changes.

## Verification boundary

The regression reproduced `PRODUCTION_REQUEST_DRAFT_INVALID` on the unchanged
baseline. Five focused tests then passed with the correction, including selected
catering, explicit overrides, malformed inputs and source immutability. The
existing application model suite also passed (41 tests). Dependency audit found
zero vulnerabilities. The ordinary browser fixture adds both Employee Requests
and Manager paths with a persisted unused headcount; it asserts one CSRF-bearing
write and the resulting request version and participants.

Local browser execution could not launch the pinned engines. The normal
Playwright installer was unable to download the pinned Chromium archive from
the official CDN in this environment. This is not a passing browser result.
Native candidate/Main CI, paired browser/security gates and an immutable rollout
with fresh authenticated acceptance remain required before release completion.

## Design applicability

This is a pure request-data composition correction behind unchanged existing
controls, not a layout, component, copy, navigation, motion or visual-design task.
The design catalog was assessed: pavurel-web-design, pavurel-app-design,
impeccable, design-taste-frontend, emil-design-eng, break-ui, mobile-native,
21st-design-research, apple-design, pick-ui-library, prototype,
find-animation-opportunities, animate, review-animations, animation-performance,
improve-animations and animation-vocabulary are not applicable to this bounded
data-only implementation. ask-sonner, animate-expo and write-swift are not
applicable to the native-ES-module stack. Existing browser/focus/security tests
remain mandatory independently of that design classification.
