# Private Product & Delivery view

The independent Operations view presents Product Outcomes, structured Pilot Feedback
and four weekly DORA windows for application/API/website. Provider/FinOps and technical
availability remain separate. It uses the trusted API's
[source and calculation contract](https://github.com/floriankreutzer/conference-manager-api/blob/main/docs/PRODUCT-DELIVERY.md).

The browser only validates/renders the closed projection; it does not calculate
business outcomes, accept arbitrary events, infer missing clocks or provide authority.
The same-origin Demo adapter makes a fixed bounded GET. Customer roles and presentation
flags do not grant private access. Production composition rejects this Demo adapter.
No browser persistence, tracking service, session replay, free-text feedback or new
runtime dependency is introduced.

platform.product-delivery defaults OFF in the canonical registry; the Operations Demo
override enables presentation. Deployment manifests include the exact reachable modules
and keep the Customer, Production adapter and Demo adapter boundaries separate.

Unknowns are explicit; known zero requires a complete applicable source. Source mode,
observation/window, freshness, fingerprint and unresolved recoveries remain visible.
Refresh reloads the saved operator aggregate, not live provider/source collection.
German/English text and number/date formatting use the existing central i18n layer;
UTC windows, semantic definition lists, native keyboard details and the existing design
tokens/layout preserve mobile reflow. Supported-source and collection limitations are
part of the API contract; no Demo result is a Production DORA claim.

Controlled browser fixtures cover unknown/known snapshots, safe failures, language and
keyboard changes, 200% text-size reflow and screenshots in both configured engines.
They are synthetic test data, not real Pilot evidence. Native full browser and permanent
three-customer/two-reset CI plus the exact API counterpart are required before acceptance.
