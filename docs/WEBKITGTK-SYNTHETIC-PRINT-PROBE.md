# CO-317: synthetic WebKitGTK print capability probe

## Status and scope

The initial candidate b89feefd934d7b4d901d7b00029ab7eb274d6d88 ran once after review on
[2026-11-10](https://github.com/floriankreutzer/conference-manager/actions/runs/42734320630).
Its native repository baseline passed 1,018 tests and its dependency audit found no
vulnerabilities. Package provisioning passed, but the probe failed before recording its
first case: the parent could not decode an early worker response. The original receipt
records JSONDecodeError, zero case/PDF results and successful exact trust/hosts cleanup.
It establishes no WebKit TLS, sandbox or PDF capability.

The diagnostic follow-up is prepared for review only. Publishing its exact candidate or
starting another native run requires implementation review; no second run is claimed here.

This Phase 1 checks whether one fresh, disposable, standard Ubuntu 26.04 GitHub-hosted VM
can run the distribution's WebKitGTK 4.1 / GTK 3 file-print backend with normal TLS
verification and the default WebKit sandbox. It produces two fixed synthetic documents
(DE and EN), each with exactly two A4 pages. It does not open the application, use accounts,
load customer data, contact an API or alter production code.

A successful probe proves only the observed capability on its recorded source and runner.
It does not accept CO-317, qualify a frontend release, prove the actual Guest print document,
or establish physical Safari/AirPrint, screen-reader or formal PDF-accessibility behavior.
Playwright's bundled WebKit and distribution WebKitGTK are different renderer builds.

## Existing pattern and implementation boundary

The temporary CA lifecycle follows the existing [transport test setup at the reviewed
Main baseline](https://github.com/floriankreutzer/conference-manager/blob/983d04d60b253b2b8bcac64751c1416fb941c7dc/scripts/test-hosted-transport.mjs):
install a fresh test CA for loopback test traffic, execute the bounded tests, then remove
that exact certificate and refresh trust in cleanup. The probe additionally verifies
the original trust-bundle digest and hosts-file bytes after cleanup.

The current Main baseline for preparation is
983d04d60b253b2b8bcac64751c1416fb941c7dc. No existing application, dependency lockfile,
required check, workflow budget or browser assertion is changed. The helper imports only
Python's standard library until its separate GTK worker starts. Distribution packages
provide GI/GTK/WebKitGTK and Poppler; their installed versions enter the receipt.
The new offline tests also require Python 3 and OpenSSL, which are already used by the
repository's CI security/transport tooling and are present on the selected standard runner.
No Python package is installed from PyPI for this probe.

The new workflow listens only for a push to the dedicated
CO-317-webkitgtk-capability-probe branch in this existing public repository.
It has read-only repository permissions, no configured secrets and no retained checkout
credentials. It uses a standard hosted VM, with no larger runner, plan, quota or provider
change. Creating the reviewed branch is the deliberate start boundary; there is no schedule
and no automatic retry. Existing normal CI and merge requirements remain authoritative.

## Execution order

1. Checkout the exact candidate with credential persistence disabled.
2. Install locked npm dependencies without lifecycle scripts.
3. Run the unchanged npm run check baseline, including the new Node entry point for
   the offline Python regression/progression tests. Run the unchanged npm run audit.
   Any failure prevents package provisioning and the native probe.
4. Install the named GTK/GI, Poppler, Xvfb and DBus packages from the runner's existing
   trusted Ubuntu repositories. Do not change APT trust or add a package source.
5. Start the probe with a small explicit environment. No repository credential, application
   secret, proxy override, TLS override or WebKit sandbox override enters the print process.
6. Generate a new one-day root and intermediate with critical DNS NameConstraints for
   conference.test and excluded IP names. The intermediate has path length zero. Install
   only the constrained root. Delete both signing keys immediately after issuing the fixed
   test leaves; retain leaf keys only in a private temporary directory until cleanup.
7. Map only conference.test and the negative-test name outside.invalid to loopback for
   this disposable VM. Servers bind 127.0.0.1 on fresh high ports, with no privileged
   browser or server process. Serve only fixed HTML and two exact same-origin CSS paths.
8. Run each case in a fresh WebKitGTK worker. Require the default sandbox and TLS FAIL
   policy. The positive cases also inspect a real descendant WebProcess for NoNewPrivs,
   Seccomp filtering and a distinct mount namespace.
9. Print through WebKit PrintOperation with the GTK file backend, an explicit PDF URI
   and A4 paper. Preserve failure before finished; finished alone is not a pass.
10. Use Poppler to check both page sizes, expected text on each page and independent
    rasterization of both pages. A screenshot or print-media emulation is not this PDF.
11. Stop servers and workers, remove the exact temporary CA, refresh trust, and restore
    the exact original hosts file. A cleanup failure fails the probe. A concurrent foreign
    hosts-file change is reported instead of being overwritten.
12. Retain only the bounded JSON receipt, synthetic PDFs and their page PNGs. No certificate,
    signing key, leaf key, private temporary directory or application content is uploaded.

The script has a 300-second overall bound, 25-second GTK deadlines and bounded subprocesses.
A forced VM termination cannot establish a successful cleanup receipt; that outcome remains
unverified. The disposable VM is never reused as a user or production host. No fallback may
disable TLS checks, accept certificate exceptions, disable the sandbox or run the browser
as root.

## Required positive and negative observations

| Case | Required observation |
| --- | --- |
| Valid DE / EN | Real HTTPS response, no TLS error flags, expected synthetic document, actual sandbox, real PDF, two A4 pages and corresponding text on each page |
| Unknown CA | WebKit TLS-error signal with UNKNOWN_CA; no HTTP document request accepted |
| Wrong SAN | WebKit TLS-error signal with BAD_IDENTITY; no HTTP document request accepted |
| Expired leaf | WebKit TLS-error signal with EXPIRED; no HTTP document request accepted |
| Outside NameConstraints | The correctly named outside.invalid leaf is rejected with the GnuTLS-backed generic certificate-constraint error; no HTTP document request accepted |
| Cleanup failure | Non-success exit and incomplete cleanup receipt; no capability claim |

The offline tests verify the actual generated chains with OpenSSL, including the intended
reason for each invalid leaf. They also cover fixed document semantics/CSP, rejected
parameters, both-page A4 parsing, credential-free child environment, partial installation,
original-error preservation, cleanup failure and concurrent hosts-file changes. The initial
12 offline checks passed in the first native baseline. The follow-up adds strict worker
protocol and bounded-process regression/progression tests; that candidate requires its own
recorded validation and native evidence.

A root extension alone is not treated as proof that a client enforces NameConstraints:
the intermediate repeats the critical constraints, and the actual WebKit negative case is
mandatory. A generic timeout, HTTP failure or worker crash cannot satisfy a TLS-negative case.

## Evidence and next boundary

The receipt binds the checked-out commit, tree, script digest, runner image, package
versions, WebKit library version, individual TLS outcomes, actual sandbox observations,
PDF digests and cleanup result. Success requires all six cases and both PDFs.

Every worker uses one JSON result on stdout, including early initialization failures.
The parent accepts only the exact schema, fixed phase/error enums, bounded numeric/version
fields and matching exit status. It rejects duplicate keys, multiple answers, malformed JSON,
unexpected fields and missing TLS/sandbox evidence. Both output pipes are capped while read;
only byte counts enter the receipt. Native stderr, exception messages and package paths do
not. A missing or invalid response becomes a failed case with its exit status and protocol
classification, followed by the same mandatory cleanup. The 35-second worker deadline,
TLS validation, sandbox requirements and six required cases remain unchanged.

Only after a successful, reviewed Phase 1 may a separate scoped implementation capture
the actual production Guest popup DOM from each existing Playwright project and DE/EN case.
That later work must bind the product source and capture-helper source separately, retain
the original DOM/CSP and both original CSS byte streams, preserve their HTTPS origin and
verify the real document's public-content/privacy requirements. It needs fresh evidence for
the then-current frontend candidate; this synthetic probe cannot replace it.

## Primary API references

- [WebKitGTK PrintOperation](https://webkitgtk.org/reference/webkit2gtk/stable/class.PrintOperation.html)
- [Non-interactive print operation and failure semantics](https://webkitgtk.org/reference/webkit2gtk/stable/method.PrintOperation.print.html)
- [Default sandbox observation](https://webkitgtk.org/reference/webkit2gtk/stable/method.WebContext.get_sandbox_enabled.html)
- [TLS policy](https://webkitgtk.org/reference/webkit2gtk/stable/method.WebsiteDataManager.get_tls_errors_policy.html)
- [Actual TLS-error signal](https://webkitgtk.org/reference/webkit2gtk/stable/signal.WebView.load-failed-with-tls-errors.html)
- [GIO certificate error flags](https://docs.gtk.org/gio/flags.TlsCertificateFlags.html)
- [GTK file-print backend selection](https://docs.gtk.org/gtk3/property.Settings.gtk-print-backends.html)
- [Ubuntu 26.04 WebKitGTK GI package](https://packages.ubuntu.com/resolute/gir1.2-webkit2-4.1)
- [Poppler pdfinfo](https://manpages.ubuntu.com/manpages/resolute/man1/pdfinfo.1.html)
- [Standard GitHub-hosted runners](https://docs.github.com/en/actions/reference/runners/github-hosted-runners)
