# Platform audit segment presentation

The existing Platform audit fleet view accepts the version 2 audit response from
the independently configured trusted API. Version 1 remains compatible with the
unchanged Demo/legacy view. The browser does not verify HMAC signatures or choose
the authoritative segment, deployment, scope, actor or verification result.

Version 2 includes an explicit current-segment verification result and the retained
legacy event count with `verification: 'unavailable'`. The existing view displays
both messages, even when its current page is empty. It must never imply that a
verified current segment authenticates the retained prefix. Unknown fields,
invented legacy verification, prefix events and invalid ordering fail closed.
The audit-only offline genesis is a fact, not an operator principal or permission.

The export control is presented only with the existing operation-proof port and
the operator's audit-export permission. The API independently enforces permission,
target scope and an exact fresh passkey proof. The control requests at most 100
current events through the existing `loadAudit` port. JSON includes the version 2
verification context and contains only that bounded response, not all history or
an accumulated displayed page. No browser storage or external URL receives the
download. The temporary object URL is revoked.

German and English messages, locale-aware counts/dates, existing semantic list,
button, status/error and design-token patterns are reused. The implementation
extends the existing view; it does not introduce another audit viewer or a
browser segment-administration path. Both Platform artifact inventories retain
the shared download module; unchanged Demo responses do not display the export.

Regression/progression coverage includes the version 1 contract, version 2
validation, unavailable legacy status, malformed/accessor input, bounded download
and object-URL cleanup. The browser suite covers the actual authenticated fleet
view, exact export proof, downloaded context, DE/EN, keyboard activation and
desktop/mobile reflow. These browser fixtures are not live identity, HMAC,
database concurrency, native passkey or deployed operational acceptance evidence.
