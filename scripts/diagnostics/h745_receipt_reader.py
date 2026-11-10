"""One-use CO-317 diagnosis of fixed failed H745 receipts; never an acceptance gate.

Reuse the unchanged checked reader at ed79b9463def653f66689dcf74e0460c6ab4d331.
No archive extraction, GTK, trust mutation or original HTML/text output.
Read the same failed receipts, inspect the fixed original PDF with Poppler and
transport all its freshly rendered 96dpi pages. Never reclassify the failed H run.
"""
import base64
import contextlib
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import re
import signal
import stat
import subprocess
import sys
import tempfile
import urllib.error
import urllib.request

BASE_PATH = Path(__file__).with_name("pr479_artifact_review.py")
BASE_BYTES = BASE_PATH.read_bytes()
BASE_BLOB = "70b0a967ce6b62b1bf4b4ac3179028594fa54713"
if BASE_PATH.is_symlink() or hashlib.sha1(
        b"blob " + str(len(BASE_BYTES)).encode("ascii") + b"\0" + BASE_BYTES).hexdigest() != BASE_BLOB:
    raise RuntimeError("READER_SOURCE_MISMATCH")
SPEC = importlib.util.spec_from_file_location("cm_fixed_artifact_reader", BASE_PATH)
BASE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(BASE)
require = BASE.require
Rejected = BASE.Rejected
REPOSITORY = BASE.REPOSITORY
BRANCH = "CO-317-h745-receipt-inspection"
HEAD = "74589584b5a8c24b6a8120ef20bbf9caf23b6a70"
TREE = "c134b2eeeaf6ead8b4f12bddbe8b6626f4488f0c"
PRODUCT = "0b89158a98332415a7bdfe4d74c6a6bb945dd055"
PRODUCT_TREE = "b962db71e4df7a17dd01139cd4c3f040d38b80ac"
BINDING = {"productSourceSha": PRODUCT, "productTreeSha": PRODUCT_TREE,
           "captureSourceSha": HEAD, "captureTreeSha": TREE}
RUN = 42751545181
JOB = 129616076072
ARTIFACT = 13733956560
ARTIFACT_BYTES = 2926453
ARTIFACT_SHA256 = "e4efa9fb29312dd15dbc187f78e47c9e09c68d3749db556a7dcdd369b71d7b20"
ARTIFACT_NAME = "guest-print-webkitgtk-" + HEAD
CASES = tuple(project + "-" + language for project in ("chromium-desktop", "webkit-mobile")
              for language in ("de", "en"))
TLS_CASES = ("unknown-ca", "wrong-san", "expired", "name-constraint", "valid-de", "valid-en")
PHASES = frozenset(("arguments", "gi-import", "gtk-init", "print-backend", "tls-policy",
                   "sandbox-policy", "view-init", "navigation", "tls-handshake", "document",
                   "sandbox-process", "print-settings", "print-operation", "cleanup", "protocol"))
# Finite diagnostic codes from the exact H745 and unchanged Phase 1 sources.
FAILURES = frozenset("""
ACTUAL_WEBPROCESS_SANDBOX_UNVERIFIED ALL_PDF_PAGES_REQUIRED ARGUMENTS_REJECTED AttributeError
BROWSER_MUST_NOT_RUN_AS_ROOT CAPTURE_CASE CAPTURE_DIRECTORY CAPTURE_DOCUMENT CAPTURE_DOCUMENT_DIGEST
CAPTURE_DOCUMENT_ENCODING CAPTURE_ENGINE_LANGUAGE CAPTURE_FILES CAPTURE_INVENTORY
CAPTURE_ORIGINAL_CASE CAPTURE_ORIGINAL_SERIALIZATION CAPTURE_PRIVACY_CHECKS CAPTURE_PUBLIC_FIELDS
CAPTURE_ROOT CAPTURE_SCHEMA CAPTURE_SCOPE CAPTURE_SOURCE CAPTURE_SOURCE_MISMATCH CAPTURE_STYLE
CAPTURE_STYLE_COUNT CAPTURE_STYLE_SOURCE CAPTURE_TITLE CAPTURE_VERSION CASE_REJECTED
CA_ALREADY_EXISTS CA_REMAINS CA_REMOVE CHECKOUT_SOURCE_MISMATCH CLEANUP_UNVERIFIED COMMAND_DEADLINE
COMMAND_FAILED_dpkg-query COMMAND_FAILED_git COMMAND_FAILED_openssl COMMAND_FAILED_pdfinfo
COMMAND_FAILED_pdftoppm COMMAND_FAILED_pdftotext COMMAND_FAILED_sudo
DISPOSABLE_PUBLIC_RUNNER_REQUIRED DOCUMENT_ATTRIBUTE DOCUMENT_BODY DOCUMENT_BODY_CLASS
DOCUMENT_CLASS DOCUMENT_COMMENT DOCUMENT_DECLARATION DOCUMENT_DEPTH DOCUMENT_DOCTYPE
DOCUMENT_DUPLICATE_ATTRIBUTE DOCUMENT_ELEMENT_BOUND DOCUMENT_HEAD DOCUMENT_INCOMPLETE
DOCUMENT_LANGUAGE DOCUMENT_NESTING DOCUMENT_OUTSIDE_TEXT DOCUMENT_POLICY DOCUMENT_PRINT_ACTION
DOCUMENT_PRIVACY DOCUMENT_PRIVATE_ATTRIBUTE DOCUMENT_PROCESSING_INSTRUCTION DOCUMENT_PUBLIC_FIELDS
DOCUMENT_ROOT DOCUMENT_ROUTE DOCUMENT_SECTION DOCUMENT_SELF_CLOSING DOCUMENT_STRUCTURE
DOCUMENT_STYLES DOCUMENT_TAG EXACT_SOURCE_REQUIRED FILE_BOUNDARY FILE_CHANGED FRESH_OUTPUT_REQUIRED
FileNotFoundError GTK_DEADLINE GTK_DISPLAY_UNAVAILABLE GUEST_CAPTURE_REJECTED
GUEST_CLEANUP_UNVERIFIED GUEST_DOCUMENT_UNVERIFIED GUEST_PRINT_WORKER_FAILED GUEST_PROBE_FAILED
HOSTS_CHANGED HOSTS_NOT_RESTORED HOSTS_RESTORE HOSTS_SYMLINK_REJECTED HOSTS_WRITE_UNVERIFIED
HOST_ALREADY_CONFIGURED ImportError JSON_DUPLICATE_KEY JSON_INVALID JSON_NONFINITE KeyError
KeyboardInterrupt LANGUAGE_REJECTED LOAD_FAILED LOOPBACK_RESOLUTION_REQUIRED ModuleNotFoundError
NEGATIVE_CERTIFICATE_ACCEPTED OSError OUTPUT_PARENT_SYMLINK PDF_ACTIVE_CONTENT PDF_EMPTY_PAGE
PDF_FILE_INVALID PDF_NOT_A4 PDF_PAGE_COUNT PDF_PAGE_TEXT_INCOMPLETE PDF_PRIVACY PDF_PUBLIC_FIELDS
PDF_RENDER_FAILED PDF_TEXT_INCOMPLETE PHASE_ONE_ALL_CASES_REQUIRED PHASE_ONE_CLEANUP_REQUIRED
PHASE_ONE_OUTPUT_REJECTED PHASE_ONE_PACKAGES PHASE_ONE_SOURCE_MISMATCH PHASE_ONE_SOURCE_REQUIRED
PHASE_ONE_WORKER_METADATA PHASE_ONE_WORKER_REQUIRED PRINT_FAILED PRINT_OPERATION_UNAVAILABLE
PROBE_INTERRUPTED PRODUCT_SOURCE_CHANGED PermissionError READBACK REQUEST_BOUNDARY_FAILED
RUNTIME_OVERRIDE_REJECTED RuntimeError SANDBOX_ENABLE_UNAVAILABLE SERVER_CERTIFICATE_DIRECTORY
SERVER_CLEANUP_FAILED SERVER_IRREVERSIBLE_DROP_UNAVAILABLE SERVER_ORIGINAL_ID_REQUIRED
SERVER_PID_CHANGED SERVER_PORT_NOT_CLOSED SERVER_PRIVILEGE_DROP_REQUIRED
SERVER_PRIVILEGE_DROP_REVERSIBLE SERVER_READY_BOUND SERVER_READY_DEADLINE SERVER_READY_IDENTITY
SERVER_READY_MISSING SERVER_READY_PROTOCOL SERVER_REQUEST_BOUNDARY SERVER_STOP_PROTOCOL
SOURCE_SHA_REQUIRED STALE_PDF_REJECTED STALE_PNG_REJECTED SYNTHETIC_DOCUMENT_UNVERIFIED
SYNTHETIC_ORIGIN_REJECTED SystemExit TLS_POLICY_NOT_FAIL TLS_UNVERIFIED TRUST_NOT_RESTORED
TRUST_REFRESH TypeError VM_TRUST_CLEANUP_FAILED ValueError WEBKIT_CASE_FAILED WEBKIT_VERSION_CHANGED
WEBPROCESS_TERMINATED WORKER_CAPTURE_FAILED WORKER_DEADLINE WORKER_EXCEPTION WORKER_EXIT_MISMATCH
WORKER_JSON_INVALID WORKER_NO_RESULT WORKER_OUTPUT_BOUND WORKER_OUTPUT_REJECTED
WORKER_SCHEMA_INVALID
""".split())
PHASE_ONE_RECEIPT = "webkitgtk-probe/receipt.json"
GUEST_RECEIPT = "guest-print-webkitgtk/receipt.json"
MANIFESTS = tuple("guest-print-capture/" + case + "/manifest.json" for case in CASES)
CAPTURE_FILES = {
    "guest-print-capture/" + case + "/" + name
    for case in CASES for name in ("manifest.json", "document.html", "tokens.css", "employee-ux.css")
}
ALLOWED_FILES = CAPTURE_FILES | {PHASE_ONE_RECEIPT, GUEST_RECEIPT} | {
    "webkitgtk-probe/" + language + suffix for language in ("de", "en")
    for suffix in (".pdf", "-page-1.png", "-page-2.png")
} | {
    "guest-print-webkitgtk/" + case + suffix for case in CASES
    for suffix in (".pdf", "-page-1.png", "-page-2.png", "-page-3.png", "-page-4.png")
}
MAX_JSON = 131072
MAX_OUTPUT = 65536
CAPTURE_STEP = "Run the four unchanged original multipage cases and capture their actual popup DOM"
PRINT_STEP = "Require all six original synthetic cases, then print all four actual Guest documents"
IMAGE_STEP = "Transport only the complete original PDF page rasters through the bounded native log"


def strict_json(data):
    require(isinstance(data, bytes) and 0 < len(data) <= MAX_JSON, "json-size")

    def unique(pairs):
        result = {}
        for key, value in pairs:
            require(key not in result, "json-duplicate")
            result[key] = value
        return result

    def constant(_value):
        raise Rejected("json-nonfinite")

    try:
        result = json.loads(data.decode("utf-8"), object_pairs_hook=unique, parse_constant=constant)
    except (UnicodeError, ValueError, RecursionError):
        raise Rejected("json-invalid") from None

    def bounds(value, depth=0):
        require(depth <= 12, "json-depth")
        if isinstance(value, dict):
            require(len(value) <= 100, "json-keys")
            for key, item in value.items():
                require(isinstance(key, str) and len(key) <= 160, "json-key")
                bounds(item, depth + 1)
        elif isinstance(value, list):
            require(len(value) <= 64, "json-list")
            for item in value:
                bounds(item, depth + 1)
        elif isinstance(value, str):
            require(len(value) <= 2048, "json-string")
        else:
            require(value is None or type(value) in (bool, int), "json-scalar")

    require(type(result) is dict, "json-object")
    bounds(result)
    return result


def digest(value):
    require(type(value) is str and re.fullmatch(r"[a-f0-9]{64}", value), "digest")
    return value


def boolean(value):
    require(type(value) is bool, "boolean")
    return value


def number(value, low=0, high=2 * 1024 * 1024):
    require(type(value) is int and low <= value <= high, "number")
    return value


def code(value):
    require(type(value) is str and value in FAILURES, "failure-code")
    return value


def verify_source(repository, run, job, commit):
    require(repository.get("full_name") == REPOSITORY and repository.get("private") is False
            and repository.get("visibility") == "public", "repository-source")
    require(run.get("id") == RUN and run.get("head_sha") == HEAD and run.get("run_attempt") == 1
            and run.get("head_branch") == "CO-317-guest-print-webkitgtk-evidence"
            and run.get("event") == "push" and run.get("status") == "completed"
            and run.get("conclusion") == "failure"
            and run.get("path") == ".github/workflows/guest-print-evidence.yml", "failed-run-source")
    require(commit.get("sha") == HEAD and commit.get("tree", {}).get("sha") == TREE, "commit-source")
    require(job.get("id") == JOB and job.get("run_id") == RUN and job.get("head_sha") == HEAD
            and job.get("name") == "actual-guest-print" and job.get("status") == "completed"
            and job.get("conclusion") == "failure", "failed-job-source")
    steps = job.get("steps", [])
    for name, conclusion in ((CAPTURE_STEP, "success"), (PRINT_STEP, "failure"), (IMAGE_STEP, "skipped")):
        matches = [step for step in steps if step.get("name") == name]
        require(len(matches) == 1 and matches[0].get("status") == "completed"
                and matches[0].get("conclusion") == conclusion, "producer-step-source")


def source_gate(token):
    prefix = "/repos/" + REPOSITORY
    verify_source(BASE.api(prefix, token), BASE.api(prefix + "/actions/runs/" + str(RUN), token),
                  BASE.api(prefix + "/actions/jobs/" + str(JOB), token),
                  BASE.api(prefix + "/git/commits/" + HEAD, token))


def artifact_identity(metadata):
    require(metadata.get("id") == ARTIFACT and metadata.get("name") == ARTIFACT_NAME
            and metadata.get("size_in_bytes") == ARTIFACT_BYTES and metadata.get("expired") is False
            and metadata.get("digest") == "sha256:" + ARTIFACT_SHA256, "artifact-identity")
    require(metadata.get("workflow_run", {}).get("id") == RUN
            and metadata["workflow_run"].get("head_sha") == HEAD, "artifact-source")


def download(token):
    prefix = "/repos/" + REPOSITORY + "/actions/artifacts/" + str(ARTIFACT)
    artifact_identity(BASE.api(prefix, token))
    location = BASE.api(prefix + "/zip", token, redirect=True)
    # Reuse the original host/redirect/TLS and bounded read; never forward the token.
    request = urllib.request.Request(location, headers={"Accept": "application/zip"})
    try:
        with urllib.request.build_opener(BASE.NoRedirect).open(request, timeout=60) as response:
            require(response.status == 200, "archive-http-status")
            data = BASE.bounded_response(response, ARTIFACT_BYTES)
    except (urllib.error.URLError, TimeoutError, OSError):
        raise Rejected("archive-transport") from None
    require(len(data) == ARTIFACT_BYTES and BASE.sha(data) == ARTIFACT_SHA256, "archive-identity")
    return data


def read_archive(data):
    source = BASE.archive(data, maximum=ARTIFACT_BYTES)
    entries = source.infolist()
    require(len(entries) <= 64, "archive-inventory-size")
    files = [entry for entry in entries if not entry.is_dir()]
    names = {entry.filename for entry in files}
    require(len(files) == 25 and names <= ALLOWED_FILES
            and CAPTURE_FILES | {PHASE_ONE_RECEIPT} <= names, "archive-inventory")
    require(sum(entry.file_size for entry in files) <= 16 * 1024 * 1024
            and all(0 < entry.file_size <= 2 * 1024 * 1024 for entry in files), "archive-bounds")
    directories = {name.rsplit("/", 1)[0] for name in ALLOWED_FILES} | {
        "guest-print-capture", "guest-print-webkitgtk", "webkitgtk-probe"}
    require(all(not entry.is_dir() or entry.filename.rstrip("/") in directories for entry in entries),
            "archive-directory")
    selected = {}
    inventory = []
    for entry in files:
        # Read every bounded member to enforce ZIP CRC, including bytes never emitted.
        raw = BASE.member(source, entry.filename, 2 * 1024 * 1024)
        inventory.append({"file": entry.filename, "bytes": len(raw), "sha256": BASE.sha(raw)})
        if entry.filename == PDF_PATH:
            selected[entry.filename] = (raw, BASE.sha(raw))
        if entry.filename in (*MANIFESTS, PHASE_ONE_RECEIPT, GUEST_RECEIPT):
            selected[entry.filename] = (strict_json(raw), BASE.sha(raw))
    return selected, sorted(inventory, key=lambda item: item["file"])


def cleanup(value):
    require(type(value) is dict and set(value) <= {"complete", "failures", "originalTrustSha256"},
            "cleanup-schema")
    result = {"complete": boolean(value.get("complete"))}
    failures = value.get("failures", [])
    require(type(failures) is list and len(failures) <= 4
            and all(item in ("CA_REMOVE", "TRUST_REFRESH", "HOSTS_RESTORE", "READBACK") for item in failures),
            "cleanup-failures")
    result["failures"] = failures
    if "originalTrustSha256" in value:
        result["originalTrustSha256"] = digest(value["originalTrustSha256"])
    return result


def worker(value):
    require(type(value) is dict, "worker-object")
    if not value:
        return {"observed": False}
    allowed = {"case", "passed", "phase", "failure", "exitCode", "stdoutBytes", "stderrBytes",
               "sandboxEnabled", "tlsPolicy", "webkit", "result", "tlsFlags", "sandbox"}
    require(set(value) <= allowed and value.get("case") in TLS_CASES
            and value.get("phase") in PHASES, "worker-schema")
    result = {"observed": True, "case": value["case"], "phase": value["phase"],
              "passed": boolean(value.get("passed"))}
    for key in ("failure", "result"):
        if key in value:
            result[key] = (value[key] if key == "result" and value[key] in ("TLS_REJECTED", "PRINT_FINISHED")
                           else code(value[key]))
    for key in ("exitCode", "stdoutBytes", "stderrBytes", "tlsFlags"):
        if key in value:
            if key == "exitCode" and value[key] is None:
                result[key] = None
            else:
                result[key] = number(value[key], -64 if key == "exitCode" else 0,
                                     255 if key == "exitCode" else (127 if key == "tlsFlags" else 16385))
    if "sandboxEnabled" in value:
        result["sandboxEnabled"] = boolean(value["sandboxEnabled"])
    if "tlsPolicy" in value:
        require(value["tlsPolicy"] == "FAIL", "worker-tls-policy")
        result["tlsPolicy"] = "FAIL"
    if "webkit" in value:
        require(re.fullmatch(r"[0-9]{1,3}(?:\.[0-9]{1,3}){2}", value["webkit"]), "worker-version")
        result["webkit"] = value["webkit"]
    if "sandbox" in value:
        require(type(value["sandbox"]) is list and 1 <= len(value["sandbox"]) <= 8, "sandbox-count")
        result["sandbox"] = []
        for item in value["sandbox"]:
            require(type(item) is dict and set(item) == {
                "noNewPrivileges", "seccompFilter", "mountNamespaceIsolated"}, "sandbox-schema")
            result["sandbox"].append({key: boolean(flag) for key, flag in item.items()})
    return result


def phase_one(value):
    require(type(value.get("schemaVersion")) is int and value.get("schemaVersion") == 1 and value.get("scope") == "synthetic-capability-only"
            and value.get("productAcceptance") is False and value.get("sourceSha") == HEAD
            and value.get("treeSha") == TREE
            and value.get("scriptSha256") == "7e28b93c561bc235c050319b3fff8deccf8d65be681bbff7256d0d4c5fd44df7",
            "phase-one-source")
    result = {"passed": boolean(value.get("passed")), "cleanup": cleanup(value.get("cleanup")),
              "scriptSha256": digest(value.get("scriptSha256"))}
    cases = value.get("cases", [])
    require(type(cases) is list and len(cases) <= 6
            and [item.get("case") for item in cases] == list(TLS_CASES[:len(cases)]), "phase-one-cases")
    result["cases"] = [worker(item) for item in cases]
    if "failure" in value:
        result["failure"] = code(value["failure"])
    return result


def guest(value, phase_digest):
    require(type(value.get("schemaVersion")) is int and value.get("schemaVersion") == 1 and value.get("scope") == "actual-guest-dom-webkitgtk-print"
            and value.get("productAcceptance") is False
            and all(value.get(key) == expected for key, expected in BINDING.items())
            and value.get("phaseOneReceiptSha256") == phase_digest, "guest-source")
    result = {"passed": boolean(value.get("passed")), "cleanup": cleanup(value.get("cleanup")),
              "scriptSha256": digest(value.get("scriptSha256")), "documents": []}
    if "failure" in value:
        result["failure"] = code(value["failure"])
    entries = value.get("documents", [])
    require(type(entries) is list and len(entries) <= 4
            and [entry.get("captureCase") for entry in entries] == list(CASES[:len(entries)]), "guest-cases")
    for entry in entries:
        case = entry["captureCase"]
        item = {"captureCase": case, "worker": worker(entry.get("worker", {}))}
        server = entry.get("server", {})
        require(type(server) is dict and set(server) <= {
            "port", "privilegeDropped", "stopped", "exitCode", "stdoutBytes", "stderrBytes", "requests", "failure"},
            "server-schema")
        item["server"] = {key: boolean(server[key]) for key in ("privilegeDropped", "stopped") if key in server}
        for key in ("port", "exitCode", "stdoutBytes", "stderrBytes"):
            if key in server:
                item["server"][key] = number(server[key], -64 if key == "exitCode" else 0, 65535)
        if "failure" in server:
            item["server"]["failure"] = code(server["failure"])
        requests = server.get("requests", {})
        require(type(requests) is dict and set(requests) <= {
            "/src/shared/detached-print.html", "/assets/tokens.css", "/assets/employee-ux.css"}, "server-requests")
        item["server"]["requestCount"] = sum(number(count, 0, 16) for count in requests.values())
        if "pdf" in entry:
            pdf = entry["pdf"]
            item["pdf"] = {"pages": number(pdf.get("pages"), 0, 4),
                           "allPagesA4": boolean(pdf.get("allPagesA4")), "sha256": digest(pdf.get("sha256")),
                           "publicFieldsPresent": boolean(pdf.get("publicFieldsPresent")),
                           "privateFixtureFieldsAbsent": boolean(pdf.get("privateFixtureFieldsAbsent"))}
        result["documents"].append(item)
    return result


def capture(value, case):
    project, language = case.rsplit("-", 1)
    require(type(value.get("schemaVersion")) is int and value.get("schemaVersion") == 1 and value.get("scope") == "actual-guest-dom-capture"
            and value.get("productAcceptance") is False and value.get("project") == project
            and value.get("language") == language
            and all(value.get(key) == expected for key, expected in BINDING.items()), "capture-source")
    document = value.get("document", {})
    fields = value.get("expectedPublicFields")
    require(type(fields) is list and len(fields) == 10
            and all(type(field) is str and 0 < len(field) <= 512 for field in fields), "capture-public-count")
    require(value.get("privacyChecks") == ["request-id", "user-id", "tenant-id", "csrf-fixture",
            "private-request-requirements", "private-dietary-requirements"], "capture-privacy-checks")
    styles = value.get("styles", [])
    require(type(styles) is list and [style.get("file") for style in styles] == ["tokens.css", "employee-ux.css"],
            "capture-styles")
    require(value.get("browserName") == ("chromium" if project == "chromium-desktop" else "webkit")
            and type(value.get("browserVersion")) is str
            and re.fullmatch(r"[0-9]{1,3}(?:\.[0-9]{1,5}){1,3}", value["browserVersion"])
            and value.get("playwrightVersion") == "1.64.1", "capture-engine")
    return {"captureCase": case, "browserVersion": value["browserVersion"],
            "documentSha256": digest(document.get("sha256")),
            "documentBytes": number(document.get("bytes"), 1, 65536), "publicFieldCount": len(fields),
            "privacyCheckCount": 6, "styles": [{"file": style["file"], "sha256": digest(style.get("sha256")),
              "bytes": number(style.get("bytes"), 1, 524288)} for style in styles]}


def report(selected, inventory):
    phase_value, phase_digest = selected[PHASE_ONE_RECEIPT]
    result = {"scope": "read-only-failed-H-receipts", "productAcceptance": False,
              "producerRun": RUN, "producerJob": JOB, "producerAttempt": 1, "producerConclusion": "failure",
              "captureStep": "success", "printStep": "failure", "imageStep": "skipped",
              **BINDING, "artifactId": ARTIFACT, "artifactBytes": ARTIFACT_BYTES,
              "artifactSha256": ARTIFACT_SHA256, "phaseOneReceiptSha256": phase_digest,
              "phaseOne": phase_one(phase_value), "captures": [], "inventory": inventory}
    files = {item["file"]: item for item in inventory}
    for case, path in zip(CASES, MANIFESTS):
        value, digest_ = selected[path]
        item = {**capture(value, case), "manifestSha256": digest_}
        prefix = "guest-print-capture/" + case + "/"
        document = files[prefix + "document.html"]
        require(item["documentSha256"] == document["sha256"] and item["documentBytes"] == document["bytes"],
                "capture-document-bytes")
        for style in item["styles"]:
            original = files[prefix + style["file"]]
            require(style["sha256"] == original["sha256"] and style["bytes"] == original["bytes"],
                    "capture-style-bytes")
        result["captures"].append(item)
    if GUEST_RECEIPT in selected:
        value, digest_ = selected[GUEST_RECEIPT]
        result["guest"] = {**guest(value, phase_digest), "receiptSha256": digest_}
        for entry, captured in zip(value["documents"], result["captures"]):
            require(entry.get("captureManifestSha256") == captured["manifestSha256"]
                    and entry.get("documentSha256") == captured["documentSha256"], "guest-capture-digest")
    else:
        result["guest"] = {"receiptPresent": False}
    return result


def encoded_report(value):
    encoded = json.dumps(value, separators=(",", ":"), sort_keys=True, allow_nan=False)
    require(len(encoded.encode("utf-8")) <= MAX_OUTPUT, "output-bound")
    return "CM_H745_RECEIPTS " + encoded



PDF_PATH = "guest-print-webkitgtk/chromium-desktop-de.pdf"
PDF_BYTES = 1481138
PDF_SHA256 = "ba44a9813239ff23bb9cd34e43c1a46d43c1a165997b89d42a8bb94b5d214da3"
MAX_PAGE_BYTES = 2 * 1024 * 1024
MAX_PAGE_TOTAL = 3 * 1024 * 1024
MAX_TOOL_STDOUT = 2 * 1024 * 1024
MAX_TOOL_STDERR = 65536
PRIVATE_FIXTURES = (
    "66666666-6666-4666-8666-666666666666", "11111111-1111-4111-8111-111111111111",
    "22222222-2222-4222-8222-222222222222", "CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC",
    "PRIVATE_REQUEST_REQUIREMENTS_SENTINEL", "PRIVATE_DIETARY_SENTINEL",
)


def verify_original_pdf(data):
    require(isinstance(data, bytes) and len(data) == PDF_BYTES and BASE.sha(data) == PDF_SHA256,
            "original-pdf-identity")
    require(data.startswith(b"%PDF-") and data.rstrip().endswith(b"%%EOF")
            and re.search(rb"/(?:Encrypt|JavaScript|JS|Launch|EmbeddedFile|OpenAction|AA)\b", data) is None,
            "original-pdf-envelope")


POPPLER_PACKAGE_COMMAND = (
    "/usr/bin/dpkg-query", "-W", "-f=" + "$" + "{Package}=" + "$" + "{Version}\n", "poppler-utils",
)


def parse_poppler_package(data):
    require(isinstance(data, bytes) and 0 < len(data) <= 256, "poppler-package-size")
    try:
        value = data.decode("ascii").strip()
    except UnicodeError:
        raise Rejected("poppler-package-encoding") from None
    require(re.fullmatch(r"poppler-utils=[a-zA-Z0-9.+:~_-]{1,80}", value) is not None, "poppler-package")
    return value


def parse_poppler_version(data):
    require(isinstance(data, bytes) and 0 < len(data) <= MAX_TOOL_STDERR, "poppler-version-size")
    try:
        text = data.decode("utf-8")
    except UnicodeError:
        raise Rejected("poppler-version-encoding") from None
    versions = re.findall(r"^pdftotext version ([0-9]{1,3}(?:\.[0-9]{1,3}){1,2})[ \t]*$",
                          text, re.MULTILINE)
    require(len(versions) == 1, "poppler-version")
    return versions[0]


def pdf_tool(arguments, directory):
    """The existing reader's Poppler limits, with file sinks bounded before reading."""
    require(arguments[0] in ("/usr/bin/pdfinfo", "/usr/bin/pdftotext", "/usr/bin/pdftoppm")
            or tuple(arguments) == POPPLER_PACKAGE_COMMAND, "pdf-tool")
    with tempfile.TemporaryFile(dir=directory) as stdout, tempfile.TemporaryFile(dir=directory) as stderr:
        try:
            with subprocess.Popen(arguments, stdin=subprocess.DEVNULL, stdout=stdout, stderr=stderr,
                                  env={"PATH": "/usr/bin:/bin", "LC_ALL": "C.UTF-8"},
                                  preexec_fn=BASE.restrict_renderer, start_new_session=True) as child:
                try:
                    status = child.wait(timeout=60)
                except subprocess.TimeoutExpired:
                    with contextlib.suppress(ProcessLookupError):
                        os.killpg(child.pid, signal.SIGKILL)
                    child.wait()
                    raise Rejected("pdf-tool-deadline") from None
        except (OSError, ValueError, subprocess.SubprocessError):
            raise Rejected("pdf-tool-execution") from None
        require(status == 0, "pdf-tool-exit")
        require(os.fstat(stdout.fileno()).st_size <= MAX_TOOL_STDOUT
                and os.fstat(stderr.fileno()).st_size <= MAX_TOOL_STDERR, "pdf-tool-output-bound")
        if arguments == ["/usr/bin/pdftotext", "-v"]:
            stderr.seek(0)
            return parse_poppler_version(stderr.read(MAX_TOOL_STDERR + 1)).encode("ascii")
        stdout.seek(0)
        return stdout.read(MAX_TOOL_STDOUT + 1)


def pdf_count(text):
    counts = re.findall(r"^Pages:\s+([0-9]{1,2})\s*$", text, re.MULTILINE)
    require(len(counts) == 1 and 2 <= int(counts[0]) <= 4, "original-pdf-page-count")
    return int(counts[0])


def pdf_a4_metadata(text, pages):
    require(pdf_count(text) == pages, "original-pdf-count-drift")
    sizes = re.findall(r"^Page\s+([0-9]+)\s+size:\s+([0-9]+(?:\.[0-9]+)?)\s+x\s+"
                       r"([0-9]+(?:\.[0-9]+)?)\s+pts", text, re.MULTILINE)
    require([int(item[0]) for item in sizes] == list(range(1, pages + 1)), "original-pdf-all-pages")
    result = [{"page": int(index), "widthPoints": float(width), "heightPoints": float(height)}
              for index, width, height in sizes]
    require(all(abs(item["widthPoints"] - 595.276) < 1 and abs(item["heightPoints"] - 841.890) < 1
                for item in result), "original-pdf-not-a4")
    return result


def field_presence(public_fields, layout, raw, reading):
    require(type(public_fields) is list and len(public_fields) == 10
            and all(type(field) is str and 0 < len(field) <= 512 for field in public_fields),
            "pdf-public-fields-schema")
    require(all(type(value) is str and len(value.encode("utf-8")) <= MAX_TOOL_STDOUT
                for value in (layout, raw, reading)), "pdf-text-bound")
    compact_layout, compact_raw, compact_reading = (re.sub(r"\s+", "", value) for value in (layout, raw, reading))
    require(all(value not in text for value in PRIVATE_FIXTURES
                for text in (compact_layout, compact_raw, compact_reading)),
            "pdf-private-fixture")
    return [{"index": index, "expectedSha256": BASE.sha(field.encode("utf-8")),
             "characters": len(field), "utf8Bytes": len(field.encode("utf-8")),
             "compactCharacters": len(re.sub(r"\s+", "", field)),
             "layoutPresent": re.sub(r"\s+", "", field) in compact_layout,
             "rawPresent": re.sub(r"\s+", "", field) in compact_raw,
             "defaultPresent": re.sub(r"\s+", "", field) in compact_reading}
            for index, field in enumerate(public_fields, 1)]


def inspect_original_pdf(selected, diagnosis):
    require(diagnosis["producerConclusion"] == "failure"
            and diagnosis["guest"].get("failure") == "PDF_PUBLIC_FIELDS"
            and diagnosis["guest"].get("passed") is False, "original-failure-required")
    data = selected[PDF_PATH][0]
    verify_original_pdf(data)
    fields = selected[MANIFESTS[0]][0]["expectedPublicFields"]
    images = []
    with tempfile.TemporaryDirectory(prefix="cm-h745-original-pdf-") as directory:
        directory = Path(directory)
        source = directory / "original.pdf"
        source.write_bytes(data)
        version = pdf_tool(["/usr/bin/pdftotext", "-v"], directory).decode("ascii")
        package = parse_poppler_package(pdf_tool(list(POPPLER_PACKAGE_COMMAND), directory))
        count = pdf_count(pdf_tool(["/usr/bin/pdfinfo", str(source)], directory).decode("utf-8"))
        a4 = pdf_a4_metadata(pdf_tool(["/usr/bin/pdfinfo", "-f", "1", "-l", str(count), "-box", str(source)],
                                        directory).decode("utf-8"), count)
        layout = pdf_tool(["/usr/bin/pdftotext", "-enc", "UTF-8", "-layout", str(source), "-"],
                          directory).decode("utf-8")
        raw = pdf_tool(["/usr/bin/pdftotext", "-enc", "UTF-8", "-raw", str(source), "-"],
                       directory).decode("utf-8")
        reading = pdf_tool(["/usr/bin/pdftotext", "-enc", "UTF-8", str(source), "-"],
                           directory).decode("utf-8")
        presence = field_presence(fields, layout, raw, reading)
        total = 0
        for page in range(1, count + 1):
            stem = directory / ("page-" + str(page))
            target = stem.with_suffix(".png")
            require(not target.exists(), "original-raster-already-exists")
            pdf_tool(["/usr/bin/pdftoppm", "-f", str(page), "-l", str(page), "-r", "96",
                      "-png", "-singlefile", str(source), str(stem)], directory)
            info = target.lstat()
            require(stat.S_ISREG(info.st_mode) and 0 < info.st_size <= MAX_PAGE_BYTES, "original-raster-file")
            image = target.read_bytes()
            require(len(image) == info.st_size, "original-raster-size")
            dimensions = BASE.png_dimensions(image)
            require(793 <= dimensions["width"] <= 795 and 1122 <= dimensions["height"] <= 1124,
                    "original-raster-a4")
            total += len(image)
            require(total <= MAX_PAGE_TOTAL, "original-raster-total")
            images.append(({"capture": "h745-chromium-desktop-de-page-" + str(page) + ".png",
                            "page": page, "pageCount": count, "imageBytes": len(image),
                            "imageSha256": BASE.sha(image), **dimensions}, image))
        require(BASE.sha(source.read_bytes()) == PDF_SHA256, "original-pdf-changed")
        require({path.name for path in directory.iterdir()} == {"original.pdf"} | {
            "page-" + str(page) + ".png" for page in range(1, count + 1)}, "original-output-inventory")
    packages = selected[PHASE_ONE_RECEIPT][0].get("packages", [])
    original_poppler = [value for value in packages if type(value) is str and value.startswith("poppler-utils=")]
    require(len(original_poppler) == 1 and re.fullmatch(r"poppler-utils=[a-zA-Z0-9.+:~_-]{1,80}", original_poppler[0]),
            "source-poppler-package")
    inspection = {"originalPdfFile": PDF_PATH, "originalPdfSha256": PDF_SHA256, "originalPdfBytes": PDF_BYTES,
                  "sourceFailure": "PDF_PUBLIC_FIELDS", "productAcceptance": False,
                  "inspectionPopplerVersion": version, "inspectionPopplerPackage": package,
                  "sourcePopplerPackage": original_poppler[0],
                  "originalLayoutAssertionReproduced": not all(item["layoutPresent"] for item in presence),
                  "pageCount": count, "a4Pages": a4, "fields": presence, "privateFixtureFieldsAbsent": True,
                  "layoutTextSha256": BASE.sha(layout.encode("utf-8")), "layoutTextBytes": len(layout.encode("utf-8")),
                  "rawTextSha256": BASE.sha(raw.encode("utf-8")), "rawTextBytes": len(raw.encode("utf-8")),
                  "defaultTextSha256": BASE.sha(reading.encode("utf-8")), "defaultTextBytes": len(reading.encode("utf-8")),
                  "rasterRenderer": "Poppler pdftoppm 96dpi", "imageBytes": total}
    return inspection, images


def emit_diagnosis(diagnosis, images, reader_sha, reader_run):
    require(re.fullmatch(r"[a-f0-9]{40}", reader_sha) is not None
            and type(reader_run) is int and reader_run > 0, "reader-output-identity")
    inspection = diagnosis["pdfInspection"]
    require(diagnosis.get("producerConclusion") == "failure" and diagnosis.get("productAcceptance") is False
            and inspection.get("sourceFailure") == "PDF_PUBLIC_FIELDS"
            and inspection.get("productAcceptance") is False
            and inspection.get("originalPdfSha256") == PDF_SHA256
            and inspection.get("originalPdfBytes") == PDF_BYTES, "failed-original-output-scope")
    require(type(inspection["pageCount"]) is int and 2 <= len(images) <= 4 and len(images) == inspection["pageCount"], "original-image-count")
    require(sum(len(data) for _, data in images) <= MAX_PAGE_TOTAL, "original-image-total")
    metadata = []
    for index, (item, data) in enumerate(images):
        dimensions = BASE.png_dimensions(data)
        require(set(item) == {"capture", "page", "pageCount", "imageBytes", "imageSha256", "width", "height"}
                and item["page"] == index + 1 and item["pageCount"] == len(images)
                and item["capture"] == "h745-chromium-desktop-de-page-" + str(index + 1) + ".png"
                and len(data) == item["imageBytes"] and len(data) <= MAX_PAGE_BYTES
                and BASE.sha(data) == item["imageSha256"]
                and dimensions == {"width": item["width"], "height": item["height"]},
                "original-image-binding")
        metadata.append({**item, "index": index, "scope": "failed-H745-original-PDF-inspection",
                         "productAcceptance": False, "sourceFailure": "PDF_PUBLIC_FIELDS",
                         "language": "de", "inputProject": "chromium-desktop", "inputBrowserVersion": "156.0.8078.4",
                         "renderer": "Poppler pdftoppm 96dpi", "pdfRenderer": "WebKitGTK 4.1 PrintOperation",
                         "webkitGTKVersion": "2.52.6", "originalPdfSha256": PDF_SHA256,
                         "originalPdfBytes": PDF_BYTES, "artifactId": ARTIFACT,
                         "artifactSha256": ARTIFACT_SHA256, "producerRun": RUN, "producerAttempt": 1,
                         "producerConclusion": "failure", "readerSourceSha": reader_sha, "readerRun": reader_run,
                         **BINDING})
    manifest = {"scope": "failed-H745-original-PDF-inspection", "productAcceptance": False,
                "sourceFailure": "PDF_PUBLIC_FIELDS", "originalPdfSha256": PDF_SHA256,
                "pageCount": len(images), "imageInventory": metadata, "maxPngBytes": MAX_PAGE_TOTAL,
                "limits": ["Original failed H745 PDF, newly rasterized once by this reader.",
                           "No new Guest capture, GTK operation, assertion change or acceptance."]}
    lines = [encoded_report(diagnosis), "CM_REVIEW_MANIFEST " + json.dumps(manifest, separators=(",", ":"), sort_keys=True)]
    require(sum(len(line.encode("utf-8")) + 1 for line in lines) <= MAX_OUTPUT, "complete-metadata-bound")
    # Canonical CM_IMAGE framing, unchanged original raster bytes, all validation before first output.
    for line in lines:
        print(line)
    for item, (_metadata, data) in zip(metadata, images):
        print("CM_IMAGE_BEGIN " + json.dumps(item, separators=(",", ":"), sort_keys=True))
        encoded = base64.b64encode(data).decode("ascii")
        for offset in range(0, len(encoded), 3000):
            print(f"CM_IMAGE_DATA {item['index']} {offset} " + encoded[offset:offset + 3000])
        print(f"CM_IMAGE_END {item['index']} {len(encoded)}")
    print("CM_REVIEW_COMPLETE " + json.dumps({"images": len(images),
          "binaryBytes": sum(len(data) for _, data in images), "producerConclusion": "failure",
          "scope": "failed-H745-original-PDF-inspection", "productAcceptance": False}))

def main():
    require(len(sys.argv) == 1 and os.environ.get("GITHUB_REPOSITORY") == REPOSITORY
            and os.environ.get("GITHUB_REF") == "refs/heads/" + BRANCH
            and os.environ.get("GITHUB_EVENT_NAME") == "push"
            and os.environ.get("GITHUB_RUN_ATTEMPT") == "1"
            and os.environ.get("RUNNER_ENVIRONMENT") == "github-hosted", "execution-scope")
    token = os.environ.get("GH_TOKEN", "")
    require(bool(token), "read-token-required")
    source_gate(token)
    selected, inventory = read_archive(download(token))
    diagnosis = report(selected, inventory)
    inspection, images = inspect_original_pdf(selected, diagnosis)
    diagnosis["pdfInspection"] = inspection
    reader_sha = os.environ.get("GITHUB_SHA", "")
    run_value = os.environ.get("GITHUB_RUN_ID", "")
    require(run_value.isdecimal(), "reader-run-required")
    emit_diagnosis(diagnosis, images, reader_sha, int(run_value))


if __name__ == "__main__":
    try:
        main()
    except Rejected as error:
        print("CM_H745_REJECTED " + str(error), file=sys.stderr)
        sys.exit(1)
    except Exception:
        print("CM_H745_REJECTED unexpected-processing-error", file=sys.stderr)
        sys.exit(1)
