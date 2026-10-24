# Separate Pavurel authentication entry

## Contract

Authentication is placed before the existing applications. Signed-out Customer
and Platform views use the same presentation-only frame: login on the left,
a same-origin Pavurel conference-lounge photograph on the right. Below the
content-driven desktop breakpoint the login takes priority and the decorative
image is omitted. German/English text, semantic headings, native labels, skip
navigation, visible keyboard focus and document reflow remain required.

The frame hides the existing application shell only while authentication is
shown, preserves its previous hidden state and skip-link target, and restores
both on disposal. An authenticated session enters the existing application
without forcing sign-in on every navigation. The frame has no network, session,
role, credential or persistence authority. Its only imports are canonical Core
presentation and i18n. The architecture gate enforces that narrow shared boundary.

Customer retains its existing invitation-bound Microsoft/email-code controls
and protocol. Platform retains compatibility with the currently deployed passkey
profile while the paired API's explicit Microsoft-MFA replacement is qualified.
A missing passkey endpoint in the replacement profile renders the existing
Microsoft-only sign-in state, not an enrollment requirement. Protected insight
ports support exact `microsoft_mfa` report identity as well as the existing
application-passkey identity, without accepting the closed Demo's authority.

This branch changes no Customer business screen, role assignment, invitation
transport, three-customer seed/reset semantics, API authorization or live service.
The broader owner/Customer role and synthetic-access cutover is incomplete;
this entry-page change must not be described as that complete release.

## Image provenance

`assets/brand/pavurel-login-lounge.webp` is an AI-generated decorative project
asset, created with the built-in image-generation tool on 24 October 2026 and
exported to a 900px-wide WebP. It contains no person, logo, text or customer data.
Approved Pavurel signet geometry remains unchanged.

Generation brief: editorial architectural photograph of a modern European
conference lounge and meeting room; warm oak, camel upholstery, subtle deep
Bordeaux accents, glass partitions and natural daylight; calm business hospitality;
portrait composition; no people, computer screens, typography, logos or watermark.
