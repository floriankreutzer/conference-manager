# Immutable protected hosting artifacts

SaaS1 issue351/milestone2. `scripts/build-protected-frontend.mjs` prepares the
separate Customer and Platform browser artifacts for the API's owned protected
static responder. It does not deploy, fetch source, send mail or provision a
service. Existing ordinary and closed Demo artifacts remain unchanged.

Run from the exact clean reviewed frontend checkout after a locked install:
`node scripts/build-protected-frontend.mjs /absolute/api/.protected-frontend`.
The output directory must not exist. Supply full PROTECTED_API_COMMIT and
PROTECTED_FRONTEND_COMMIT, PROTECTED_ENVIRONMENT and both fixed canonical HTTPS
PROTECTED_CUSTOMER_ORIGIN / PROTECTED_PLATFORM_ORIGIN. Synthetic presentation
is explicitly PROTECTED_SYNTHETIC_ENABLED=true only for DEV/INT. Optional
PROTECTED_PRESENTATION_MICROSOFT_ENABLED and
PROTECTED_PRESENTATION_INVITATIONS_ENABLED defaultfalse. These are public
presentation choices, never authorization or operating-readiness evidence.
No runtime credentials belong in a frontend build.

The CLI checks actual HEAD and a clean checkout before reading browser source.
The reusable builder captures the existing production reachable Customer graph
and existing independent Platform production inventory, applying the established
protected HTML builders. It excludes build/test/deployment files, the other
surface and asset documentation. Neither framework nor bundler is introduced.
Each manifest binds its source pair, origins, environment, presentation flags
and every ordered file path/length/SHA256. Limits match the API:512 files,
2MiB/file and16MiB/surface. The CLI outputs each surface's public manifest SHA256.

Configure the reviewed API pair with PROTECTED_HOSTED_FRONTEND_ENABLED=true and
only that surface's PROTECTED_HOSTED_FRONTEND_SHA256. The API checks the external
pin, complete metadata and every byte at startup. It has no runtime path/source
override and returns no manifest through HTTP. Default-off API-only startup is
preserved. The existing two hosting services can retain same-origin API routing;
actual provider configuration, immutable build records and whole-fleet credential/
UUID traffic-blocked cutover remain separate operating work.

The qualified browser suite now writes these exact generated artifacts before
starting the real two roots with their individual manifest pins. Its TLS edge
forwards every static/API request unchanged to the matching process and serves
no browser file itself. Normal certificate trust, different actual HTTPS sites,
native forms, cookie separation, current private Room images, fresh operation
proofs, full Tenant audit verification and both browser engines remain mandatory.
Chromium uses native virtual CTAP2; WebKit's software assertion bridge remains
explicitly qualified. Microsoft primary, physical keys, recovery and actual
deployment remain unproved. Existing full/permanent/zoom/security gates remain
unchanged; no additional spend or live provider is activated.

Build-only presentation flags must be supplied inline to the build command or
in its isolated build environment. Do not copy them into protected runtime
configuration: unknown PROTECTED_ keys remain rejected by the owned loaders.
The qualified journey now invokes the real clean-checkout CLI with explicit
nonsecret build inputs and compares its output refs/manifest pins with the
independently captured module bytes before starting either root. This covers
the deployable command path, not merely the underlying writer function.
