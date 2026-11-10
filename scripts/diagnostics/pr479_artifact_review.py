"""One-use CO-317 inspection of fixed PR481 print artifacts; never an acceptance gate.

Only synthetic original PNG bytes and rendered original Chromium PDF pages may
leave the runner through its bounded log. No target artwork, trace, HAR, HTML,
cookies, raw report text or signed download URL is printed. The only selector is
one fixed output group; artifact identities and source checks remain pinned.
"""
import base64
import hashlib
import io
import json
import math
import os
from pathlib import Path, PurePosixPath
import re
import resource
import stat
import struct
import subprocess
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request
import zipfile
import zlib

REPOSITORY = "floriankreutzer/conference-manager"
BRANCH = "CO-320-pr479-88ed5f-artifact-review"
HEAD = "28a864ea6b1d4f5ae0e0066a072f6012e059358d"
CHECKOUT = "e69984b2b569ef00045923540e4c41af953fab16"
TREE = "5ec76c98c20bcbbe06cfe582c9578ceeafbccf68"
BASE = "cd935478e9c441e6bbd5bddb36b1090d70554124"
API_COMMIT = "2b9a7f4fbeaba3688877d045337a1c00e3eda5de"
RUN = 42759055183
CHROMIUM_JOB = 129640639590
SHARED_JOB = 129640639558
ARTIFACTS = {
    "chromium": (13738005676, "playwright-report-chromium-desktop", 29548207,
                 "029168d8105c0309d04cb16c3297ee627950ad1d678343c594eb2dfe0ae1086f"),
    "zoom": (13738035243, "manager-worklist-browser-zoom-evidence", 1779056,
             "ab04adf3d963b72ee6a68cf0d5474373370d17367ca731aba6abc0ecbde0a79e"),
}
MIB = 1024 * 1024
MAX_MEMBER = 32 * MIB
MAX_EXPANDED = 160 * MIB
IMAGE_COUNTS = {"primary": 27, "targeted": 55, "chromium-original-pdf": 4,
                "actual-chromium-tab-zoom": 22}
MAX_IMAGES = 108
MAX_IMAGE_TOTAL = 20 * MIB
OUTPUT_GROUPS = 8
MAX_GROUP_BYTES = 3 * MIB
MAX_METADATA_BYTES = 2 * MIB
PRINT_OUTPUT_GROUPS = (2, 3, 4, 5)
PRINT_PAGES = {
    "guest-multipage-de-pdf-page-1": ("de", 1, 82),
    "guest-multipage-de-pdf-page-2": ("de", 2, 83),
    "guest-multipage-en-pdf-page-1": ("en", 1, 84),
    "guest-multipage-en-pdf-page-2": ("en", 2, 85),
}
PRIMARY = {
    "01": ("welcome", 1280), "02": ("schedule", 1366),
    "03": ("filtered-room-selection", 1366),
    "04": ("selected-service-and-equipment", 1280),
    "05": ("selected-package-items-and-quantities", 1280),
    "06": ("allocation-and-authoritative-cost-preview", 640),
    "07": ("complete-rich-request-review", 640),
    "08": ("compact-before-expansion", 1366),
    "09": ("populated-long-title-calendar", 1366),
    "10": ("read-only-profile", 1366),
    "11": ("contact-explicitly-unavailable", 1366),
    "12": ("published-public-information", 1280),
    "13": ("detached-print-screen", 1280),
    "14": ("compact-before-expansion", 1366),
    "15": ("work-window-timeline", 1366),
    "16": ("complete-after-reset", 1366),
    "17": ("room-editor-before-edit", 1280),
    "18": ("draft-summary-and-retained-unknown-scope", 1280),
    "19": ("catalogue-status-and-authoritative-summary", 1366),
    "20": ("setup-with-unavailable-section", 1366),
    "21": ("organization-before-edit", 1280),
    "22": ("filtered-technical-room-details", 1280),
    "23": ("saved-policy-with-retained-reference", 1366),
    "24": ("filtered-cost-center-before-edit", 1280),
    "25": ("synthetic-four-check-candidates", 1366),
    "26": ("events-after-filter-reset", 1366),
    "27": ("independent-group-and-direct-roles", 375),
}
ZOOM_PNGS = {
    "manager-worklist-200-percent.png", "manager-worklist-last-action-200-percent.png",
    "manager-room-navigation-200-percent.png", "manager-business-help-200-percent.png",
} | {
    f"{stem}-{language}-200-percent.png"
    for language in ("de", "en")
    for stem in ("manager-room-media", "manager-room-price-action", "request-submission-notice")
} | {
    f"request-{part}-{view}-{language}-200-percent.png"
    for part in ("summary", "details", "action")
    for view in ("requests", "manager") for language in ("de", "en")
}
ZOOM_JSONS = {
    "manager-worklist-zoom-evidence.json", "manager-room-media-zoom-evidence.json",
    "request-cards-zoom-evidence.json",
    "request-submission-notice-de-200-percent-geometry.json",
    "request-submission-notice-en-200-percent-geometry.json",
}
COMPOSITIONS = {
    "routed-protocol-fixture", "isolated-component-fixture",
    "isolated-component-routed-protocol-fixture",
    "isolated-component-routed-media-fixture",
}
ROLES = {"employee", "conference_manager", "tenant_admin"}


class Rejected(Exception):
    """Public, bounded rejection code; never include network or artifact payloads."""


def require(condition, code):
    if not condition:
        raise Rejected(code)


def sha(data):
    return hashlib.sha256(data).hexdigest()


def json_object(data, limit=MAX_MEMBER):
    require(isinstance(data, (bytes, str)) and len(data) <= limit, "json-size")
    try:
        value = json.loads(data)
    except (ValueError, UnicodeError, RecursionError):
        raise Rejected("json-invalid") from None
    require(isinstance(value, dict), "json-object")
    return value


def safe_name(name):
    require(isinstance(name, str) and 0 < len(name) <= 240, "path-size")
    require(not any(ord(c) < 32 or ord(c) == 127 for c in name), "path-control")
    require("\\" not in name and ":" not in name and not name.startswith("/"), "path-root")
    stripped = name[:-1] if name.endswith("/") else name
    require(all(part not in ("", ".", "..") for part in stripped.split("/")), "path-traversal")
    return stripped


def archive(data, maximum=40 * MIB):
    require(isinstance(data, bytes) and 0 < len(data) <= maximum, "archive-size")
    try:
        source = zipfile.ZipFile(io.BytesIO(data))
        entries = source.infolist()
    except (ValueError, zipfile.BadZipFile):
        raise Rejected("archive-invalid") from None
    require(0 < len(entries) <= 3000, "archive-members")
    names, expanded = set(), 0
    for entry in entries:
        name = safe_name(entry.filename)
        require(name not in names, "archive-duplicate")
        names.add(name)
        mode = stat.S_IFMT(entry.external_attr >> 16)
        require(mode in (0, stat.S_IFREG, stat.S_IFDIR), "archive-special")
        require(not entry.flag_bits & 1, "archive-encrypted")
        require(entry.compress_type in (zipfile.ZIP_STORED, zipfile.ZIP_DEFLATED), "archive-compression")
        require(0 <= entry.file_size <= MAX_MEMBER, "member-size")
        require(entry.file_size <= max(1, entry.compress_size) * 1000, "archive-expansion")
        expanded += entry.file_size
    require(expanded <= MAX_EXPANDED, "archive-expanded-size")
    return source


def member(source, name, limit=MAX_MEMBER):
    safe_name(name)
    try:
        info = source.getinfo(name)
        require(not info.is_dir() and 0 < info.file_size <= limit, "member-read-size")
        with source.open(info) as stream:
            value = stream.read(limit + 1)
    except (KeyError, ValueError, OSError, RuntimeError, zipfile.BadZipFile):
        raise Rejected("member-unreadable") from None
    require(len(value) == info.file_size, "member-length")
    return value


def png_dimensions(data):
    require(isinstance(data, bytes) and 33 <= len(data) <= 4 * MIB, "png-size")
    require(data[:8] == b"\x89PNG\r\n\x1a\n" and data[12:16] == b"IHDR", "png-type")
    width, height = struct.unpack(">II", data[16:24])
    require(0 < width <= 4096 and 0 < height <= 32768 and width * height <= 50_000_000, "png-dimensions")
    offset, chunks, image_bytes, ended = 8, 0, 0, False
    while offset < len(data):
        require(offset + 12 <= len(data), "png-chunk-header")
        length = struct.unpack(">I", data[offset:offset + 4])[0]
        kind = data[offset + 4:offset + 8]
        require(length <= 4 * MIB and offset + 12 + length <= len(data), "png-chunk-size")
        payload = data[offset + 8:offset + 8 + length]
        checksum = struct.unpack(">I", data[offset + 8 + length:offset + 12 + length])[0]
        require(zlib.crc32(kind + payload) & 0xffffffff == checksum, "png-crc")
        require(chunks == 0 or kind != b"IHDR", "png-second-header")
        require(chunks != 0 or (kind == b"IHDR" and length == 13), "png-first-header")
        if kind == b"IDAT":
            image_bytes += length
        if kind == b"IEND":
            require(length == 0 and offset + 12 == len(data), "png-end")
            ended = True
        offset += length + 12
        chunks += 1
        require(chunks <= 1024, "png-chunk-count")
    require(ended and image_bytes > 0, "png-complete")
    return {"width": width, "height": height}


def artifact_identity(metadata, key):
    artifact_id, name, size, digest = ARTIFACTS[key]
    require(metadata.get("id") == artifact_id and metadata.get("name") == name, "artifact-identity")
    require(metadata.get("size_in_bytes") == size and metadata.get("expired") is False, "artifact-size-expiry")
    require(metadata.get("digest") == "sha256:" + digest, "artifact-digest-metadata")
    source = metadata.get("workflow_run", {})
    require(source.get("id") == RUN and source.get("head_sha") == HEAD, "artifact-source")


def artifact_bytes(data, key):
    _, _, size, digest = ARTIFACTS[key]
    require(len(data) == size, "artifact-byte-size")
    require(sha(data) == digest, "artifact-digest-bytes")


class NoRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        return None


def bounded_response(response, limit):
    declared = response.headers.get("Content-Length")
    require(declared is None or (declared.isdecimal() and int(declared) <= limit), "http-declared-size")
    chunks, length = [], 0
    while True:
        chunk = response.read(min(65536, limit + 1 - length))
        if not chunk:
            break
        length += len(chunk)
        require(length <= limit, "http-response-size")
        chunks.append(chunk)
    return b"".join(chunks)


def api(path, token, redirect=False):
    require(path == f"/repos/{REPOSITORY}" or path.startswith(f"/repos/{REPOSITORY}/"), "api-repository")
    headers = {"Accept": "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28"}
    # Public repo/PR metadata needs no added pull-requests token permission.
    if path not in (f"/repos/{REPOSITORY}", f"/repos/{REPOSITORY}/pulls/481"):
        headers["Authorization"] = "Bearer " + token
    request = urllib.request.Request("https://api.github.com" + path, headers=headers)
    opener = urllib.request.build_opener(NoRedirect)
    try:
        with opener.open(request, timeout=30) as response:
            require(not redirect and response.status == 200, "api-response")
            return json_object(bounded_response(response, 2 * MIB))
    except urllib.error.HTTPError as error:
        if redirect and error.code == 302:
            location = error.headers.get("Location", "")
            return download_location(location)
        raise Rejected("api-request") from None
    except (urllib.error.URLError, TimeoutError, OSError):
        raise Rejected("api-transport") from None


def download_location(location):
    try:
        parsed = urllib.parse.urlsplit(location)
        valid = (parsed.scheme == "https" and parsed.username is None and parsed.password is None
                 and parsed.port is None and re.fullmatch(r"productionresultssa[0-9]+\.blob\.core\.windows\.net",
                                                         parsed.hostname or "") is not None)
    except ValueError:
        raise Rejected("artifact-download-host") from None
    require(valid, "artifact-download-host")
    require(parsed.path.startswith("/actions-results/"), "artifact-download-path")
    return location


def download(key, token):
    artifact_id = ARTIFACTS[key][0]
    metadata = api(f"/repos/{REPOSITORY}/actions/artifacts/{artifact_id}", token)
    artifact_identity(metadata, key)
    location = api(f"/repos/{REPOSITORY}/actions/artifacts/{artifact_id}/zip", token, redirect=True)
    # The ephemeral storage URL receives no GitHub Authorization header.
    request = urllib.request.Request(location, headers={"Accept": "application/zip"})
    try:
        with urllib.request.build_opener(NoRedirect).open(request, timeout=60) as response:
            require(response.status == 200, "archive-http-status")
            data = bounded_response(response, ARTIFACTS[key][2])
    except (urllib.error.URLError, TimeoutError, OSError):
        raise Rejected("archive-transport") from None
    artifact_bytes(data, key)
    return archive(data)


def source_gate(token):
    prefix = f"/repos/{REPOSITORY}"
    repository = api(prefix, token)
    require(repository.get("private") is False and repository.get("visibility") == "public", "repository-visibility")
    pr = api(prefix + "/pulls/481", token)
    require(pr.get("head", {}).get("sha") == HEAD and pr.get("base", {}).get("sha") == BASE, "current-pr-source")
    run = api(prefix + f"/actions/runs/{RUN}", token)
    require(run.get("id") == RUN and run.get("head_sha") == HEAD and run.get("event") == "pull_request"
            and run.get("run_attempt") == 1 and run.get("name") == "CI", "run-source")
    merge = api(prefix + f"/git/commits/{CHECKOUT}", token)
    require(merge.get("tree", {}).get("sha") == TREE
            and [p.get("sha") for p in merge.get("parents", [])] == [BASE, HEAD], "merge-source")
    for job_id, name in ((CHROMIUM_JOB, "browser-e2e (chromium-desktop)"), (SHARED_JOB, "shared-demo-e2e")):
        job = api(prefix + f"/actions/jobs/{job_id}", token)
        require(job.get("run_id") == RUN and job.get("name") == name
                and job.get("status") == "completed" and job.get("conclusion") == "success", "producer-job")
    return {"repository": REPOSITORY, "head": HEAD, "checkout": CHECKOUT, "tree": TREE,
            "run": RUN, "apiCommitForZoomOnly": API_COMMIT,
            "runStatus": run.get("status"), "runConclusion": run.get("conclusion")}


def passed_report(report):
    stats = report.get("stats", {})
    require(stats.get("total") == 609 and stats.get("expected") == 609 and stats.get("ok") is True
            and all(stats.get(key) == 0 for key in ("unexpected", "flaky", "skipped"))
            and report.get("errors") == [], "report-full-suite")
    require(report.get("projectNames") == ["chromium-desktop"], "report-project")


def attachments(source):
    html = member(source, "index.html")
    matches = re.findall(rb'<template id="playwrightReportBase64">data:application/zip;base64,([A-Za-z0-9+/=]+)</template>', html)
    require(len(matches) == 1 and len(matches[0]) <= 24 * MIB, "report-envelope")
    try:
        payload = base64.b64decode(matches[0], validate=True)
    except ValueError:
        raise Rejected("report-base64") from None
    inner = archive(payload, maximum=18 * MIB)
    require(all(re.fullmatch(r"(?:report|[a-f0-9]{20})\.json", n) for n in inner.namelist()), "report-member-types")
    report = json_object(member(inner, "report.json"))
    passed_report(report)
    tests, result = [], []
    for summary in report.get("files", []):
        file_id = summary.get("fileId")
        require(isinstance(file_id, str) and re.fullmatch(r"[a-f0-9]{20}", file_id), "report-file-id")
        file = json_object(member(inner, file_id + ".json"))
        tests.extend(file.get("tests", []))
    require(len(tests) == 609 and len({test.get("testId") for test in tests}) == 609, "report-inventory")
    for test in tests:
        require(test.get("outcome") == "expected" and test.get("projectName") == "chromium-desktop"
                and len(test.get("results", [])) == 1, "test-source")
        observed = test["results"][0]
        require(observed.get("status") == "passed" and observed.get("retry") == 0
                and not observed.get("errors"), "test-result")
        result.append(observed.get("attachments", []))
    return result


def attachment_json(source, attachment):
    require(attachment.get("contentType") == "application/json", "attachment-json-type")
    if "body" in attachment:
        return json_object(attachment["body"], limit=512 * 1024)
    path = attachment.get("path")
    require(isinstance(path, str) and re.fullmatch(r"data/[a-f0-9]{40}\.json", path), "attachment-json-path")
    return json_object(member(source, path, 512 * 1024))


def attachment_file(source, attachment, media_type, suffix):
    require(attachment.get("contentType") == media_type, "attachment-media-type")
    path = attachment.get("path")
    require(isinstance(path, str) and re.fullmatch(r"data/[a-f0-9]{40}\." + suffix, path), "attachment-media-path")
    return member(source, path, 4 * MIB)


def context_gate(context):
    require(context.get("frontend", {}).get("checkoutCommit") == CHECKOUT
            and context.get("frontend", {}).get("githubSha") == CHECKOUT
            and context.get("frontend", {}).get("trackedWorkingTree") == "clean", "capture-source")
    # One additional existing F88 fixture: local adapters and routed Demo media,
    # not the shared server-backed Demo. Keep this exception bound to its sole
    # recorded context; the normal Screen19 primary selector remains unchanged.
    known_demo_catering = (
        context.get("composition") == "isolated-demo-component-routed-media-fixture"
        and context.get("screen") == "19" and context.get("state") == "demo-catering-before-edit"
        and context.get("language") == "en" and context.get("roles") == ["conference_manager"]
        and context.get("viewport") == {"width": 1280, "height": 900}
        and context.get("test") == "CO-306 new Catering owner/image write locks the complete draft and retains unrelated unsaved entries"
    )
    require(context.get("apiCommit") is None and (context.get("composition") in COMPOSITIONS or known_demo_catering)
            and context.get("project") == "chromium-desktop" and context.get("engine") == "chromium", "capture-composition")
    require(context.get("screen") in PRIMARY and context.get("language") in ("de", "en"), "capture-language-screen")
    require(isinstance(context.get("roles"), list) and 0 < len(context["roles"]) <= 3
            and set(context["roles"]) <= ROLES, "capture-roles")
    require(isinstance(context.get("state"), str) and re.fullmatch(r"[a-z0-9-]{1,90}", context["state"]), "capture-state")
    viewport = context.get("viewport", {})
    require(type(viewport.get("width")) is int and 320 <= viewport["width"] <= 1920
            and type(viewport.get("height")) is int and 300 <= viewport["height"] <= 1440, "capture-viewport")


def numeric_geometry(value, depth=0):
    require(depth <= 12, "geometry-depth")
    if value is None or isinstance(value, bool):
        return value
    if isinstance(value, (int, float)):
        require(math.isfinite(value) and abs(value) <= 1e9, "geometry-number")
        return value
    if isinstance(value, str):
        return value if value in ("de", "en", "manager", "requests", "loaded", "unavailable", "left", "right", "contain", "auto") else None
    if isinstance(value, list):
        require(len(value) <= 300, "geometry-list")
        return [numeric_geometry(item, depth + 1) for item in value]
    require(isinstance(value, dict) and len(value) <= 100, "geometry-object")
    return {key: numeric_geometry(item, depth + 1) for key, item in value.items()
            if re.fullmatch(r"[A-Za-z][A-Za-z0-9]{0,63}", key)
            and key not in {"text", "title", "name", "id", "limits", "composition", "test"}}


def capture_index(source, groups):
    captures, pdfs, geometry = [], {}, []
    for group in groups:
        names = {}
        for item in group:
            name = item.get("name")
            if isinstance(name, str):
                names.setdefault(name, []).append(item)
        for name, candidates in names.items():
            if name.endswith("-context") and name.startswith(("customer-screen-", "welcome-", "profile-", "help-",
                    "schedule-", "room-selection-", "guest-", "tenant-overview-", "policy-",
                    "test-calendar-", "audit-", "users-readonly-refresh-")):
                require(len(candidates) == 1, "capture-context-duplicate")
                context = attachment_json(source, candidates[0])
                context_gate(context)
                stem = name[:-8]
                screenshot_name = stem + "-screen" if context["screen"] == "13" else stem
                pictures = names.get(screenshot_name, [])
                require(len(pictures) == 1, "capture-picture-pair")
                context = {key: context[key] for key in ("screen", "state", "language", "viewport", "roles", "composition")}
                require(re.fullmatch(r"[a-zA-Z0-9_.-]{1,180}", screenshot_name), "capture-name")
                context["capture"] = screenshot_name
                captures.append((context, pictures[0]))
            if re.fullmatch(r"guest-multipage-(de|en)-pdf", name):
                require(len(candidates) == 1 and name not in pdfs, "pdf-duplicate")
                structures = names.get(name + "-structure", [])
                require(len(structures) == 1, "pdf-structure-pair")
                pdfs[name] = (candidates[0], attachment_json(source, structures[0]))
            if (re.fullmatch(r"(?:catalogue-(?:de|en)-(?:390|768|1366)|audit-(?:de|en)-(?:390|768)-(?:left|right))-geometry", name)
                    or name == "late-room-image-geometry"):
                for candidate in candidates:
                    geometry.append({"capture": name, "geometry": numeric_geometry(attachment_json(source, candidate))})
    require(len(captures) <= 300, "capture-count")
    require(set(pdfs) == {"guest-multipage-de-pdf", "guest-multipage-en-pdf"}, "pdf-language-pair")
    return captures, pdfs, geometry


def selected_captures(captures):
    selected = []
    for screen, (state, width) in PRIMARY.items():
        candidates = [(c, a) for c, a in captures if c["screen"] == screen and c["state"] == state
                      and c["language"] == "de" and c["viewport"]["width"] == width
                      and (screen != "13" or c["capture"] == "guest-welcome-screen")]
        require(len(candidates) == 1, "primary-capture-selector-" + screen)
        c, a = candidates[0]
        selected.append(({**c, "reviewGroup": "primary"}, a))
    for context, attachment in captures:
        screen, state, width = context["screen"], context["state"], context["viewport"]["width"]
        changed = (screen in ("11", "19", "20") and width in (390, 768, 1366)
                   and state in ("contact-explicitly-unavailable", "contact-unavailability-explanation",
                                 "catalogue-status-and-authoritative-summary", "setup-with-unavailable-section"))
        changed |= screen == "26" and width in (390, 768) and state in (
            "events-left-columns", "events-right-columns", "selected-event-technical-details")
        changed |= screen == "17" and state in ("late-image-loaded-single-pointer-and-keyboard-price",
                                                "late-image-unavailable-single-pointer-and-keyboard-price")
        changed |= screen in ("08", "14") and state == "two-complete-summaries-in-workspace"
        changed |= screen == "15" and state == "keyboard-preview"
        changed |= screen == "21" and state in ("unsaved-navigation-dialog", "draft-retained-after-stay")
        if changed and not any(c["capture"] == context["capture"] for c, _ in selected):
            selected.append(({**context, "reviewGroup": "targeted"}, attachment))
    require(len(selected) <= 94, "selected-capture-count")
    return selected


def pdf_pages(data):
    require(1000 < len(data) < MIB and data.startswith(b"%PDF-") and data.rstrip().endswith(b"%%EOF"), "pdf-envelope")
    require(not re.search(rb"/(?:Encrypt|JavaScript|JS|Launch|EmbeddedFile|OpenAction|AA)\b", data), "pdf-active-content")
    pages = re.findall(rb"/Type\s*/Page\b", data)
    require(len(pages) == 2, "pdf-two-pages")
    return len(pages)


def restrict_renderer():
    for kind, value in ((resource.RLIMIT_CPU, 45), (resource.RLIMIT_AS, 768 * MIB),
                        (resource.RLIMIT_FSIZE, 4 * MIB), (resource.RLIMIT_NOFILE, 64),
                        (resource.RLIMIT_CORE, 0)):
        resource.setrlimit(kind, (value, value))


def render_pdf(data, name, structure):
    count = pdf_pages(data)
    require(structure.get("pageCount") == count and len(structure.get("cardFrames", [])) == count, "pdf-structure")
    with tempfile.TemporaryDirectory(prefix="cm-pr479-pdf-") as directory:
        source = Path(directory) / "original.pdf"
        source.write_bytes(data)
        command = ["/usr/bin/pdftoppm", "-png", "-r", "150", "-f", "1", "-l", "2",
                   str(source), str(Path(directory) / "page")]
        try:
            subprocess.run(command, check=True, timeout=60, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                           env={"PATH": "/usr/bin:/bin", "LC_ALL": "C.UTF-8"}, preexec_fn=restrict_renderer)
        except (OSError, subprocess.SubprocessError):
            raise Rejected("pdf-renderer") from None
        pages = sorted(Path(directory).glob("page-*.png"))
        require(len(pages) == count, "pdf-render-count")
        result = []
        for number, page in enumerate(pages, 1):
            require(page.is_file() and not page.is_symlink() and page.stat().st_size <= 4 * MIB, "pdf-render-size")
            image = page.read_bytes()
            dimensions = png_dimensions(image)
            require(1200 <= dimensions["width"] <= 1250 and 1740 <= dimensions["height"] <= 1770, "pdf-a4-render")
            result.append(({"capture": name + f"-page-{number}", "reviewGroup": "chromium-original-pdf",
                            "language": "de" if "-de-" in name else "en", "page": number, "pageCount": count,
                            "pdfSha256": sha(data), "pdfBytes": len(data),
                            "renderer": "Poppler pdftoppm 150dpi"}, image))
        return result


def zoom_images(source):
    pictures, geometry = {}, []
    for name in source.namelist():
        leaf = PurePosixPath(name).name
        if leaf in ZOOM_PNGS:
            require(leaf not in pictures, "zoom-picture-duplicate")
            data = member(source, name, 4 * MIB)
            dimensions = png_dimensions(data)
            width = 1280 if leaf.startswith("manager-") else 1366
            require(dimensions == {"width": width, "height": 900}, "zoom-visible-surface")
            pictures[leaf] = data
        elif leaf in ZOOM_JSONS:
            value = json_object(member(source, name, 512 * 1024))
            if "evidence" in value:
                require(isinstance(value["evidence"], list) and value["evidence"]
                        and all(row.get("actualTabZoom") == 2 for row in value["evidence"]), "zoom-factor")
            else:
                require(value.get("actualTabZoom") == 2, "zoom-factor")
            geometry.append({"capture": leaf, "geometry": numeric_geometry(value)})
    require(set(pictures) == ZOOM_PNGS and len(geometry) == len(ZOOM_JSONS), "zoom-inventory")
    return [({"capture": name, "reviewGroup": "actual-chromium-tab-zoom",
              "actualTabZoom": 2, "apiCommit": API_COMMIT,
              "language": "en" if "-en-" in name else "de"}, data)
            for name, data in sorted(pictures.items())], geometry


def output_group(value):
    require(type(value) is str and value in tuple(str(i) for i in range(OUTPUT_GROUPS)), "output-group")
    return int(value)


def emit(images, manifest, geometry, group, *, print_only=False):
    require(type(group) is int and 0 <= group < OUTPUT_GROUPS, "output-group")
    require(type(print_only) is bool, "print-output-mode")
    require(not print_only or group in PRINT_OUTPUT_GROUPS, "print-output-group")
    require(len(images) == MAX_IMAGES, "image-count")
    require(sum(len(data) for _, data in images) <= MAX_IMAGE_TOTAL, "image-total")
    checked, names = [], set()
    counts = dict.fromkeys(IMAGE_COUNTS, 0)
    for index, (metadata, data) in enumerate(images):
        name = metadata["capture"]
        require(re.fullmatch(r"[a-zA-Z0-9_.-]{1,180}", name) and name not in names, "image-name")
        names.add(name)
        require(metadata.get("reviewGroup") in counts, "image-review-group")
        counts[metadata["reviewGroup"]] += 1
        checked.append(({**metadata, "index": index, "outputGroup": index % OUTPUT_GROUPS,
                         "imageBytes": len(data), "imageSha256": sha(data), **png_dimensions(data)}, data))
    require(counts == IMAGE_COUNTS, "image-inventory")
    sizes = [sum(len(data) for metadata, data in checked if metadata["outputGroup"] == number)
             for number in range(OUTPUT_GROUPS)]
    require(all(0 < size <= MAX_GROUP_BYTES for size in sizes), "image-group-budget")
    selected = [(metadata, data) for metadata, data in checked if metadata["outputGroup"] == group]
    if print_only:
        pages = [metadata for metadata, _ in checked if metadata["reviewGroup"] == "chromium-original-pdf"]
        require({page["capture"] for page in pages} == set(PRINT_PAGES), "print-output-inventory")
        for page in pages:
            language, number, index = PRINT_PAGES[page["capture"]]
            require((page.get("language"), page.get("page"), page.get("index"), page.get("pageCount"))
                    == (language, number, index, 2), "print-output-page")
        selected = [(metadata, data) for metadata, data in selected if metadata["capture"] in PRINT_PAGES]
        require(len(selected) == 1, "print-output-count")
    image_inventory = [metadata for metadata, _ in checked]
    inventory_sha = sha(json.dumps(image_inventory, separators=(",", ":"), sort_keys=True).encode("utf-8"))
    inventory = manifest["captureInventory"]
    output_manifest = {key: value for key, value in manifest.items() if key != "captureInventory"}
    output_manifest.update({"outputGroup": group, "outputGroups": OUTPUT_GROUPS,
                            "groupBytes": sizes, "imageInventory": image_inventory,
                            "inventorySha256": inventory_sha,
                            "emissionScope": "chromium-original-pdf-only" if print_only else "full-inventory",
                            "emittedIndices": [metadata["index"] for metadata, _ in selected]})
    lines = ["CM_REVIEW_MANIFEST " + json.dumps(output_manifest, separators=(",", ":"), sort_keys=True)]
    for context in inventory:
        lines.append("CM_CAPTURE_CONTEXT " + json.dumps(context, separators=(",", ":"), sort_keys=True))
    for item in geometry:
        encoded = json.dumps(item, separators=(",", ":"), sort_keys=True)
        require(len(encoded) <= 200_000, "geometry-output-size")
        for offset in range(0, len(encoded), 3000):
            lines.append("CM_GEOMETRY_CHUNK " + json.dumps({"capture": item["capture"], "offset": offset,
                                                           "text": encoded[offset:offset + 3000]}, separators=(",", ":")))
        lines.append("CM_GEOMETRY_END " + json.dumps({"capture": item["capture"], "length": len(encoded)}))
    require(sum(len(line.encode("utf-8")) + 1 for line in lines) <= MAX_METADATA_BYTES, "metadata-output-size")
    # Check every image, group and metadata bound before any output. All jobs
    # retain the full inventory; the first selected group repeats metadata.
    for line in (lines if group == (PRINT_OUTPUT_GROUPS[0] if print_only else 0) else lines[:1]):
        print(line)
    for metadata, data in selected:
        index = metadata["index"]
        print("CM_IMAGE_BEGIN " + json.dumps(metadata, separators=(",", ":"), sort_keys=True))
        encoded = base64.b64encode(data).decode("ascii")
        for offset in range(0, len(encoded), 3000):
            print(f"CM_IMAGE_DATA {index} {offset} " + encoded[offset:offset + 3000])
        print(f"CM_IMAGE_END {index} {len(encoded)}")
    print("CM_REVIEW_COMPLETE " + json.dumps({"group": group, "groups": OUTPUT_GROUPS,
          "images": len(selected), "binaryBytes": sum(len(data) for _, data in selected), "inventoryImages": len(checked),
          "inventorySha256": inventory_sha}))


def main():
    require(sys.argv == [sys.argv[0]], "no-runtime-inputs")
    require(os.environ.get("GITHUB_REPOSITORY") == REPOSITORY
            and os.environ.get("GITHUB_REF") == "refs/heads/" + BRANCH
            and os.environ.get("GITHUB_EVENT_NAME") == "push", "execution-scope")
    group = output_group(os.environ.get("CM_REVIEW_GROUP"))
    require(group in PRINT_OUTPUT_GROUPS, "print-output-group")
    token = os.environ.get("GH_TOKEN", "")
    require(bool(token), "read-token-required")
    identity = source_gate(token)
    chromium, zoom = download("chromium", token), download("zoom", token)
    groups = attachments(chromium)
    captures, pdfs, geometry = capture_index(chromium, groups)
    selected = selected_captures(captures)
    images = [({**context, "artifactId": ARTIFACTS["chromium"][0]},
               attachment_file(chromium, attachment, "image/png", "png"))
              for context, attachment in selected]
    for name, (attachment, structure) in sorted(pdfs.items()):
        data = attachment_file(chromium, attachment, "application/pdf", "pdf")
        geometry.append({"capture": name + "-structure", "geometry": numeric_geometry(structure)})
        images.extend(render_pdf(data, name, structure))
    zoom_pictures, zoom_geometry = zoom_images(zoom)
    images.extend(({**meta, "artifactId": ARTIFACTS["zoom"][0]}, data) for meta, data in zoom_pictures)
    geometry.extend(zoom_geometry)
    manifest = {**identity, "fullChromium": {"passed": 609, "failed": 0, "skipped": 0, "flaky": 0},
                "artifacts": {key: {"id": value[0], "bytes": value[2], "sha256": value[3]} for key, value in ARTIFACTS.items()},
                "captureInventory": [context for context, _ in captures],
                "limits": ["Fixture captures have no real API counterpart.",
                           "Actual tab zoom covers only its named states, not all 27 targets.",
                           "Two original Chromium PDFs, two pages each; no WebKit PDF export.",
                           "No product acceptance, manual screen-reader or first-user claim."]}
    emit(images, manifest, geometry, group, print_only=True)


if __name__ == "__main__":
    try:
        main()
    except Rejected as error:
        print("CM_REVIEW_REJECTED " + str(error), file=sys.stderr)
        sys.exit(1)
    except Exception:
        print("CM_REVIEW_REJECTED unexpected-processing-error", file=sys.stderr)
        sys.exit(1)
