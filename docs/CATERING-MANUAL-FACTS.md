# Manager manual delivery facts

This optional view is available with the existing default-off Catering delivery module.
It distinguishes a prepared document, an actual manual transmission record, and a supplier
response. Recording a fact sends no email and makes no provider request. The current
manual provider can expose an attestation form after the approved version is queued;
the API independently revalidates the historical manual operation and zero write attempts.

The Manager enters the actual past occurrence time on an explicitly labelled UTC clock, a channel
and a short ASCII business reference, and explicitly attests that the action happened.
Seconds/milliseconds remain available without ambiguous daylight-saving local hours. The browser validates canonical UTC and submits one fresh command UUID with the
displayed order version/state revision. Transmission has no receipt; supplier response
requires an explicit outcome for every sealed position. No confirmation is preselected.
A substitution proposal accepts no replacement or changed cost.

The API adapter validates closed minimized facts, complete position identities, consecutive
20-entry pages, exact scope and factual acknowledgements. A fact acknowledgment is followed
by an authoritative order reload. Read failures or stale read snapshots hide factual forms;
a conflicting or uncertain write blocks all writes until explicit source reload. There is
no browser retry. Authority loss uses the existing workspace lock and detached reads cannot
repaint another tab. Controls preserve focus without stealing focus after an unrelated move.

The effective-version summary is separate from current processing/order state. Only complete
supplier confirmation makes a version effective. Pending, partial, rejected and substitution
outcomes retain the earlier effective version. [Reviewed versions](CATERING-VERSIONS.md)
add nonbinding change/cancel/exception proposals over a fully confirmed supplier basis;
unsent-order replacement and changed supplier positions remain separate work.
Deferred automatic-job history remains visible with neutral wording after
manual facts are recorded, so it does not claim an outstanding initial manual send.

The view uses native forms, fieldsets, legends, required selects/attestation, semantic history
cards, existing design tokens, keyboard controls and central DE/EN messages. It stores no
factual draft in browser storage. Tenant Admin audit learns the two minimized manual actions;
actor/security/session details, channel, reference and full receipt are absent from audit summaries.
