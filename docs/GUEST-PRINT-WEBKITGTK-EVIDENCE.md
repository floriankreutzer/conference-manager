# CO-317 actual Guest DOM and WebKitGTK PDF evidence

## Purpose and current boundary

This isolated H harness captures the actual public Guest popup produced by an
immutable frontend source F and exports it through the real WebKitGTK 4.1
PrintOperation API. It is intended to supply the missing native PDF evidence for
CO-317; a print-media PNG alone cannot supply that evidence.

The selected product source is
[F 28a864ea6b1d4f5ae0e0066a072f6012e059358d](https://github.com/floriankreutzer/conference-manager/commit/28a864ea6b1d4f5ae0e0066a072f6012e059358d),
tree 5ec76c98c20bcbbe06cfe582c9578ceeafbccf68. The separate H source and tree are
recorded from the exact checked-out workflow commit. Its branch name is a trigger,
not an immutable source identity.

This is evidence for public synthetic fixtures. It makes no product acceptance,
physical Safari, actual printer, manual screen-reader, real-user, deployed-service
or live-API claim. A successful harness does not qualify an otherwise failing F
candidate. Required frontend, API, release and product-acceptance gates remain
independent.

## Immutable product sources

The earlier F791 to F0b change preserved Guest production, stylesheet bytes and
the original multipage test definitions. F0b subsequently merged into Main
cd935478e9c441e6bbd5bddb36b1090d70554124 with the same product tree.

The current selected F is a bounded follow-up on that Main. It changes only the
print grouping rule in assets/employee-ux.css and adds a real group-fit geometry
check to the existing evidence helper. The physical A4 height remains unrounded
for the assertion; only the browser viewport uses integer pixels. Fonts, public
content limits, screen layout, security contracts and both original multipage
test definitions are preserved.

H preserves that entire product tree. Only the existing evidence helper receives
the same observation/capture hook as before. H history is retained as the first
parent and the selected F is an additional parent, so the real F ancestry check
continues to apply.

| Product responsibility | Selected F path | Git blob |
| --- | --- | --- |
| Guest public projection and print-document builder | src/employee/production-application.js | 8a987d1a3e809a2c7e486e6c16247ebace2f1db0 |
| Detached popup, exact CSP and stylesheet URLs | src/shared/detached-print-window.js | 3dddf157c47443bfe2a2f022a961cadf7e28d8cb |
| Original detached-document navigation target | src/shared/detached-print.html | c8df07a8124599a8c5e9faf2204ad3103cde63ba |
| Design tokens | assets/tokens.css | a68d3f272d3946b7de3644f5d119bb294230777d |
| Original Guest print CSS | assets/employee-ux.css | 73cf5aa7d3514bbde397eab820a4c8942c0856ff |
| Original test definitions, including both multipage cases | tests/e2e/production-application.spec.js | b1c62c4e06ca72f56b631f38f6f13cae32445732 |
| Original evidence helper before the H hook | tests/e2e/fixtures/guest-print-evidence.js | 98f28a02b7cc8c61752fb675adfb7db671d6e704 |

The source guard requires F to be an ancestor of H, an exact H checkout and a
clean tracked worktree. A no-renames Git comparison permits only the thirteen
declared harness, workflow, documentation and test paths. Any product-file or
original-test-definition change fails that boundary. Every captured CSS response
must equal the immutable F Git blob, not merely a current working copy.

## Four actual capture documents

The dedicated Playwright configuration selects exactly the two existing
"CO-317: EMP-14 EMP-15 bounded public content keeps every field in multipage A4
and print CSS" cases. It retains the original projects, one worker and zero
retries. It does not change the original test actions or assertions. Capture uses
normal HTTPS settings, disables trace output and does not start an alternative
application server.

| Capture input project | Language | PDF renderer |
| --- | --- | --- |
| chromium-desktop | de | WebKitGTK 4.1 PrintOperation |
| chromium-desktop | en | WebKitGTK 4.1 PrintOperation |
| webkit-mobile | de | WebKitGTK 4.1 PrintOperation |
| webkit-mobile | en | WebKitGTK 4.1 PrintOperation |

The existing fixture supplies the public application protocol responses. These
routed fixture responses are not an actual TLS or live-API observation. TLS is
verified separately during the real GTK render.

A response observer is installed before each selected test opens its popup. For
that exact popup it retains the two original stylesheet Response bodies and
their status, content type and redirect state. After the original helper has
completed its existing print checks and restored screen media and viewport, the
capture hook serializes the full current doctype and documentElement. It reads
the current title, language, CSP, ready state, detached opener and stylesheet
readiness in the same DOM snapshot. It does not rewrite the document.

The capture preserves the original default-port origin and navigation URL:

- https://conference.test
- https://conference.test/src/shared/detached-print.html
- https://conference.test/assets/tokens.css
- https://conference.test/assets/employee-ux.css

The original CSP contains those two absolute CSS URLs. It is not replaced by a
different origin, port, wildcard, inline-style permission or relaxed policy.
The separate GTK renderer consumes the captured original DOM bytes and exact
original CSS bytes. It is not a Playwright WebKit page.pdf implementation.

Each manifest records the F/H commit and tree, original engine/project/browser
version, Playwright version, language and original test title. HTML and CSS
lengths, SHA-256 digests and stylesheet Git blob identities bind the files.
All ten original public-field assertions and the six original fixture privacy
exclusions remain mandatory. Public text is not rejected merely because it
contains the ordinary word "private".

A separate Python parser rejects active markup, unexpected attributes, extra
policies or resources, invalid structure, duplicate JSON keys, unexpected files,
symlinks, path substitutions, malformed manifests and incorrect source bindings.
It requires exactly four case directories. These checks constrain this specific
capture protocol; they are not a general-purpose HTML upload sanitizer.

## Reused qualified synthetic foundation

The original five Phase 1 files are reused unchanged from
[ab3760a8bd22bcfc2147c1e8f0718a74e1872aa9](https://github.com/floriankreutzer/conference-manager/commit/ab3760a8bd22bcfc2147c1e8f0718a74e1872aa9).
The script SHA-256 is
7e28b93c561bc235c050319b3fff8deccf8d65be681bbff7256d0d4c5fd44df7.
The H module verifies that digest before importing the shared implementation.

The successful historical
[Phase 1 run 42741151357](https://github.com/floriankreutzer/conference-manager/actions/runs/42741151357)
completed all six original TLS cases and both synthetic two-page A4 PDFs.
Its artifact 13729836057 has ZIP SHA-256
794ca892c3d220b23cae02c2418baeef9f26cced17e34a7daf26b73586a192c2;
the receipt SHA-256 is
14d38a35db2220c0546e71d5725332cb0cf05722ee467eaef54a1c6d5d9bb0aa.
That evidence is synthetic capability only. The earlier failed attempts remain
historical failures in [the Phase 1 document](WEBKITGTK-SYNTHETIC-PRINT-PROBE.md).

The H workflow reruns all six original cases unchanged on its own fresh runner:
unknown CA, wrong SAN, expired leaf, outside NameConstraints, valid DE and valid
EN. H requires the current H-bound successful Phase 1 receipt, matching script
digest, all six semantically valid results, actual positive-case process sandbox
evidence and successful trust cleanup. The old successful receipt cannot replace
this current-run gate.

## Original-origin HTTPS and privilege boundary

The workload runs only on the existing public repository's standard disposable
Ubuntu 26.04 GitHub-hosted VM. It requests no paid runner, quota change, provider
setting or authentication flow. Checkout does not retain credentials. Print
processes receive a small explicit environment allowlist and no repository token
or application secret.

The unchanged Phase 1 certificate and finally-cleanup implementation creates a
fresh constrained test chain and normal VM trust entry. Critical NameConstraints
limit DNS trust to conference.test and exclude IP identities. The existing
negative cases prove actual rejection rather than inferring it from an
extension's presence. Hosts mapping is temporary and resolves the fixed test
names to loopback. Exact original hosts and trust-bundle readbacks are required
after cleanup.

For actual Guest documents, the server binds only 127.0.0.1:443. A narrowly
scoped process binds that socket, immediately removes all supplementary groups,
sets real/effective/saved GID and UID to the original non-root runner identity,
verifies the resulting identities and verifies that UID 0 cannot be regained.
Only after that drop may it create TLS state, load the leaf key, read captured
HTML or handle HTTP. A missing or ineffective drop fails closed.

Only the original document and two original stylesheet paths are served.
Methods, Host, paths and request counts are bounded. Port collision fails;
there is no fallback port or rewritten origin. The controller binds shutdown to
the verified descendant's PID file descriptor, checks the bounded stop receipt,
and requires ECONNREFUSED from the original loopback port. Cleanup errors cannot
turn a failed renderer into success or mask an existing render failure.

This mechanism does not install permanent capabilities, change sysctls, weaken
AppArmor or alter sandbox policy. It never changes a shared user or production
host. The single-use hosted VM remains the execution boundary.

## Real GTK PDF and page verification

Each document is rendered in a fresh non-root WebKitGTK worker. As in the
qualified Phase 1 code, it requires TLS FAIL policy, explicitly enables the
API 4.1 sandbox before any WebView, checks that setting and later inspects an
actual descendant WebProcess for NoNewPrivs=1, Seccomp=2 and a distinct mount
namespace. Configuration alone is insufficient.

The worker loads the exact original HTTPS URL and checks successful TLS, zero
certificate-error flags and the expected title. JavaScript remains disabled.
It prints every page through the GTK file backend to a fixed fresh PDF path
using portrait A4. An earlier failed signal is preserved even if a finished
signal follows.

Poppler verifies the complete page count, every physical A4 page size and all
ten public fields in extracted text. Whole-document field verification uses the
explicit -raw content-stream mode for this source-bound WebKitGTK/Cairo output.
The exact full-field substring predicate and whitespace normalization are
unchanged; the six private fixture values must still be absent. This does not
assert a human reading order. The separate per-page default extraction still
requires text on every page. Every page is rasterized once at 96 dpi. Original
PDF bytes and those raster bytes receive individual SHA-256 digests. The receipt
preserves the input engine separately from the actual GTK renderer version.

The [Poppler manual](https://manpages.ubuntu.com/manpages/resolute/man1/pdftotext.1.html)
describes default reading order, physical -layout and content-stream -raw. It
does not recommend -raw as the general reading-order default. Here that explicit
mode is limited to complete-field verification of this known two-column output;
all-page visual review and the independent pagination checks remain required.
The observed original failure and the separate product correction are recorded
below.

Bounds remain explicit:

| Boundary | Limit |
| --- | --- |
| Hosted job | 15 minutes |
| Overall Phase 1 / H controller | 300 seconds each |
| GTK worker | 25 seconds |
| Worker collection and original-origin server lifetime | 35 seconds |
| Server ready protocol | 10 seconds, 1 KiB, one exact JSON result |
| Worker output pipes | Existing 16 KiB limit per pipe |
| One captured HTML document | 64 KiB |
| One original CSS resource | 512 KiB |
| One actual Guest PDF | 2,000,000 bytes, 2–4 A4 pages |
| One retained Poppler raster | 4 MiB during PDF inspection |
| One raster transported through the log | 2 MiB |
| Complete log image inventory | At most 16 images and 3 MiB original PNG bytes |

No TLS, sandbox, assertion, retry or test-deadline relaxation is introduced.

## Bounded original-raster transport

The final read-only mode uses the existing CM_IMAGE_BEGIN, CM_IMAGE_DATA and
CM_IMAGE_END protocol from the public artifact reader Git blob
ac417698b89137cc36ae6fdcc5f0c707e29f03b9. Data chunks remain at most 3000 Base64
characters. The complete successful H receipt, all four original capture
manifests, source bindings, renderer results, cleanup state, PDFs and every
corresponding PNG are validated before the first image is emitted.

Each image record identifies its exact file, bytes and SHA-256, PDF digest,
page/count, F/H commits and trees, input engine/language, GTK renderer and
Poppler version. PNG signature, chunks, CRCs, dimensions and full inventory
are validated. These are the original retained Poppler files; the transport
does not render, resize, combine or replace pages.

A limit violation or incomplete inventory fails before any image is emitted.
There is no partial-image acceptance. A successful log transport only makes
the original pages available for inspection; it does not establish that a
person or agent actually viewed them or accepted their layout. Transport
failure also remains distinct from the underlying renderer result.

## Validation gates and historical preparation checkpoint

Preparation checkpoint, 2026-11-10: before the local environment became
unavailable, the earlier H draft passed 8 Node and 17 Python tests. Three
full source files survived exactly. The remaining new source and tests were
reconstructed as a new review candidate. Those earlier results do not qualify
the reconstructed bytes.

The first reconstructed candidate declared 9 Node checks and 27 H Python tests,
including the Node wrapper that executes the Python suite. The unchanged
Phase 1 offline suite was also required. At that preparation checkpoint these
were test-definition counts, not execution results. The later native outcomes
are recorded separately below; they do not qualify subsequent changed bytes.

The dedicated workflow requires, in order:

1. Exact F/H ancestry, tree, clean-source and bounded-diff checks.
2. Locked dependency installation and complete Python syntax compilation.
3. The full npm run check baseline, both offline suites and npm run audit.
4. Existing pinned Semgrep rule-policy validation and the unchanged SAST policy.
5. All four unchanged original Playwright multipage tests in both original engines.
6. All six unchanged native Phase 1 cases and successful cleanup.
7. All four actual Guest GTK PDFs, full page/text/privacy checks and successful cleanup.
8. Complete bounded original-raster log transport and retained source-bound artifacts.

Artifacts contain only public synthetic capture HTML/CSS/manifests, PDFs,
page rasters and bounded receipts. They exclude certificate/private-key
directories, raw native stderr, credentials, traces, HARs and unrelated
application reports. No current result may be inferred from an older
successful HTML report or from a cancelled or incomplete suite.

A release or product-acceptance claim requires actual successful native
evidence and actual review of the complete original page set, together with
all other applicable gates. This harness does not itself change Jira scope,
ticket status, acceptance, deployment or release configuration.


## Observed H discovery failure and bounded correction

The first H attempt,
[run 42749276004](https://github.com/floriankreutzer/conference-manager/actions/runs/42749276004),
[job 129608780502](https://github.com/floriankreutzer/conference-manager/actions/runs/42749276004/job/129608780502),
used ce5f018c86d653c533f7eb078f9614aabd01aa20, tree
a99af6b9366b4bba4bc1879c60238bb5e7fb1b2b. It failed on 2026-11-10 at 03:27:48 UTC.

The exact native baseline passed 1085/1085 Node tests with zero failures,
cancellations or skips. That includes the H Python wrapper executing the
27-method suite and the unchanged Phase 1 offline wrapper. Python compilation,
the source boundary, dependency audit (zero vulnerabilities) and existing
Semgrep policy (six rules, 290 targets, zero findings) also passed.

Capture then reported "No tests found" before executing a browser case. The six
native TLS cases, four actual Guest prints and image transport were not started.
No capture or PDF artifact was produced. This remains a genuine failed H run.

The cause was an incorrectly anchored leaf-title grep. The
[Playwright API contract](https://playwright.dev/docs/api/class-testconfig#test-config-grep)
matches a composed project/file/suite/test/tag title. The installed 1.64.1
implementation confirms that behavior in
[project-suite filtering](https://github.com/microsoft/playwright/blob/v1.64.1/packages/playwright/src/runner/loadUtils.ts)
and [test title construction](https://github.com/microsoft/playwright/blob/v1.64.1/packages/playwright/src/common/test.ts).
The existing file glob is valid: its
[file matcher](https://github.com/microsoft/playwright/blob/v1.64.1/packages/playwright/src/util.ts)
adds the recursive prefix for a bare filename.

The correction changes only the H grep to the exact two project names,
original filename and complete original DE/EN titles. A new offline Node test
uses the real installed Playwright CLI with list mode and its JSON reporter:
the corrected configuration must discover exactly those four project/title
pairs, and overriding it with the old anchored leaf pattern must produce zero
cases and exit 1. List mode does not execute browser assertions.

That correction declared ten H Node checks; its 27 Python methods and
GTK/security implementation were unchanged. Its actual native result is recorded
below. The failed discovery attempt remains failed, and no original test
definition, retry, deadline, privilege, TLS policy, sandbox check or acceptance
requirement was changed.

## Observed H745 PDF failure and source-bound follow-up

[H 74589584b5a8c24b6a8120ef20bbf9caf23b6a70](https://github.com/floriankreutzer/conference-manager/commit/74589584b5a8c24b6a8120ef20bbf9caf23b6a70),
tree c134b2eeeaf6ead8b4f12bddbe8b6626f4488f0c, ran against F
0b89158a98332415a7bdfe4d74c6a6bb945dd055, tree
b962db71e4df7a17dd01139cd4c3f040d38b80ac. Its
[native run 42751545181](https://github.com/floriankreutzer/conference-manager/actions/runs/42751545181)
passed 1086/1086 baseline tests, the actual four-case CLI discovery with the
legacy-zero negative, the 27-method H Python suite, unchanged Phase 1 offline
suite, audit and SAST. All four original capture cases and all six native Phase 1
TLS cases passed. The first actual Guest PDF then failed PDF_PUBLIC_FIELDS.
Only chromium-desktop-de.pdf was created; the remaining three actual Guest
prints and successful-image transport did not run. H745 remains a failure.

The [original artifact 13733956560](https://github.com/floriankreutzer/conference-manager/actions/runs/42751545181/artifacts/13733956560)
is 2,926,453 bytes with ZIP SHA-256
e4efa9fb29312dd15dbc187f78e47c9e09c68d3749db556a7dcdd369b71d7b20.
Its unchanged first Guest PDF is 1,481,138 bytes, SHA-256
ba44a9813239ff23bb9cd34e43c1a46d43c1a165997b89d42a8bb94b5d214da3.
The real GTK worker finished printing, with successful TLS, actual process
sandbox proof, original-origin server shutdown and trust cleanup. The failed
field assertion must not be relabeled as a TLS, sandbox or cleanup failure.

The separate read-only [diagnostic run 42756981227](https://github.com/floriankreutzer/conference-manager/actions/runs/42756981227/job/129633510084)
passed its own 1063-test baseline, 51 Python tests and audit. It downloaded the
pinned original artifact once and inspected the unchanged PDF without repeating
GTK. It found two A4 pages. Both the original H job and the diagnostic used
poppler-utils=26.01.0-2ubuntu0.3.

| Extraction mode | Complete original fields | Missing original field indices |
| --- | --- | --- |
| -layout | 3 of 10 | 2, 3, 4, 5, 6, 7, 8 |
| default | 3 of 10 | 2, 3, 4, 5, 6, 7, 8 |
| -raw | 9 of 10 | 4, address.line1 |

All six privacy sentinels were absent in all three extractions. The two complete
96 dpi rasters of the unchanged PDF were actually examined. The address and
contact cards split across the page boundary; the accessibility line was visibly
cut at the transition, and the card borders were open there. This is a separate
pagination defect, not a successful print hidden only by the extraction mode.
The original PDF's observed -raw output still fails the unchanged all-ten-field
predicate because field 4 is missing. No new execution or reclassification of
that original PDF is implied.

The selected F above addresses print-group pagination. This H follow-up changes
only its whole-PDF extraction mode and corresponding negative/progression tests,
then binds all captures and unchanged production bytes to that new F. It does
not change GTK page margins, original CSP/URLs, TLS, sandbox, Phase 1, deadlines,
retry policy, public-field limits or the all-page acceptance requirement.
New native baseline, all four captures, all six Phase 1 cases, all four actual
Guest PDFs and actual review of every new page remain mandatory. The previous
1086/27 and diagnostic 1063/51 results do not qualify this new source.

This follow-up retains the ten H Node test definitions and now declares 33 H
Python methods: the original 27 remain unchanged and six new methods cover full
DE/EN bounds, content-stream selection, missing or shortened middle fields,
wrapped privacy sentinels, rejected cross-mode fallback and empty pages. These
are definitions in the new source, not newly executed test results.
