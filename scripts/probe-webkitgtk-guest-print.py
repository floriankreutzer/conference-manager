#!/usr/bin/env python3
"""CO-317 H: render captured original public Guest DOM with actual GTK PrintOperation."""
import base64
import contextlib
import errno
import hashlib
from html.parser import HTMLParser
import http.server
import importlib.util
import json
import os
from pathlib import Path
import re
import selectors
import signal
import socket
import ssl
import stat
import struct
import subprocess
import sys
import tempfile
import threading
import time
import zlib

ROOT = Path(__file__).resolve().parents[1]
PHASE_ONE_COMMIT = "ab3760a8bd22bcfc2147c1e8f0718a74e1872aa9"
PHASE_ONE_SHA256 = "7e28b93c561bc235c050319b3fff8deccf8d65be681bbff7256d0d4c5fd44df7"
PHASE_ONE = ROOT / "scripts" / "probe-webkitgtk-print.py"
if PHASE_ONE.is_symlink() or hashlib.sha256(PHASE_ONE.read_bytes()).hexdigest() != PHASE_ONE_SHA256:
    raise RuntimeError("PHASE_ONE_SOURCE_MISMATCH")
SPEC = importlib.util.spec_from_file_location("cm_guest_phase_one", PHASE_ONE)
PROBE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PROBE)
ORIGIN = "https://conference.test"
DOCUMENT_PATH = "/src/shared/detached-print.html"
DOCUMENT_URL = ORIGIN + DOCUMENT_PATH
STYLES = ("assets/tokens.css", "assets/employee-ux.css")
PROJECTS = ("chromium-desktop", "webkit-mobile")
CAPTURE_CASES = tuple(project + "-" + language for project in PROJECTS for language in ("de", "en"))
CSP = "; ".join((
    "default-src 'none'", "script-src 'none'",
    "style-src " + " ".join(ORIGIN + "/" + name for name in STYLES),
    "style-src-attr 'none'", "img-src 'none'", "font-src 'none'", "connect-src 'none'",
    "media-src 'none'", "object-src 'none'", "frame-src 'none'", "child-src 'none'",
    "worker-src 'none'", "manifest-src 'none'", "base-uri 'none'", "form-action 'none'",
))
PRIVATE_FIXTURES = (
    "66666666-6666-4666-8666-666666666666", "11111111-1111-4111-8111-111111111111",
    "22222222-2222-4222-8222-222222222222", "CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC",
    "PRIVATE_REQUEST_REQUIREMENTS_SENTINEL", "PRIVATE_DIETARY_SENTINEL",
)
PRIVACY_CHECKS = [
    "request-id", "user-id", "tenant-id", "csrf-fixture",
    "private-request-requirements", "private-dietary-requirements",
]
HARNESS_PATHS = {
    ".github/workflows/guest-print-evidence.yml", ".github/workflows/webkitgtk-print-probe.yml",
    "docs/GUEST-PRINT-WEBKITGTK-EVIDENCE.md", "docs/WEBKITGTK-SYNTHETIC-PRINT-PROBE.md",
    "playwright.guest-print-capture.config.js", "scripts/probe-webkitgtk-print.py",
    "scripts/probe-webkitgtk-guest-print.py", "tests/e2e/fixtures/guest-print-evidence.js",
    "tests/e2e/fixtures/guest-print-source-capture.js", "tests/guest-print-source-capture.test.js",
    "tests/guest_print_webkitgtk_test.py", "tests/webkitgtk-print-probe.test.js",
    "tests/webkitgtk_print_probe_test.py",
}
CAPTURES = ROOT / "test-results" / "guest-print-capture"
OUTPUT = ROOT / "test-results" / "guest-print-webkitgtk"


def require(condition, code="GUEST_CAPTURE_REJECTED"):
    PROBE.require(condition, code)


def strict_json(data):
    def unique(pairs):
        result = {}
        for key, value in pairs:
            require(key not in result, "JSON_DUPLICATE_KEY")
            result[key] = value
        return result

    def constant(_value):
        raise PROBE.ProbeError("JSON_NONFINITE")

    try:
        return json.loads(data, object_pairs_hook=unique, parse_constant=constant)
    except (ValueError, UnicodeError, RecursionError):
        raise PROBE.ProbeError("JSON_INVALID") from None


def bounded_file(path, maximum):
    path = Path(path)
    info = path.lstat()
    require(stat.S_ISREG(info.st_mode) and 0 < info.st_size <= maximum, "FILE_BOUNDARY")
    data = path.read_bytes()
    require(len(data) == info.st_size, "FILE_CHANGED")
    return data


def git(*arguments):
    return PROBE.command(["git", "-C", str(ROOT), *arguments], timeout=10)


def source_binding():
    product = os.environ.get("CM_GUEST_PRODUCT_SOURCE_SHA", "")
    capture = os.environ.get("CM_PROBE_SOURCE_SHA", "")
    require(re.fullmatch(r"[a-f0-9]{40}", product) is not None
            and re.fullmatch(r"[a-f0-9]{40}", capture) is not None, "SOURCE_SHA_REQUIRED")
    require(git("rev-parse", "HEAD").decode().strip() == capture, "CAPTURE_SOURCE_MISMATCH")
    git("merge-base", "--is-ancestor", product, capture)
    git("diff", "--quiet", "HEAD", "--")
    changed = git("diff", "--name-only", "--no-renames", product, capture, "--").decode().splitlines()
    require(bool(changed) and set(changed) <= HARNESS_PATHS, "PRODUCT_SOURCE_CHANGED")
    return {
        "productSourceSha": product, "productTreeSha": git("rev-parse", product + "^{tree}").decode().strip(),
        "captureSourceSha": capture, "captureTreeSha": git("rev-parse", capture + "^{tree}").decode().strip(),
    }


class GuestDocument(HTMLParser):
    """Independent passive-DOM guard; preserve original bytes instead of rewriting."""
    TAGS = frozenset(("html", "head", "meta", "title", "link", "body", "button", "header",
                      "small", "h1", "h2", "p", "main", "section", "article", "dl", "dt", "dd", "div", "a"))
    ATTRIBUTES = {
        "html": {"lang"}, "meta": {"charset", "name", "http-equiv", "content"},
        "link": {"rel", "href"}, "button": {"type"}, "a": {"href", "target", "rel"},
    }

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.stack = []
        self.elements = []
        self.text = []
        self.declarations = 0

    def handle_decl(self, declaration):
        require(declaration == "DOCTYPE html" and not self.elements and self.declarations == 0,
                "DOCUMENT_DOCTYPE")
        self.declarations += 1

    def handle_starttag(self, tag, attributes):
        require(tag in self.TAGS and self.declarations == 1, "DOCUMENT_TAG")
        attrs = dict(attributes)
        require(len(attrs) == len(attributes), "DOCUMENT_DUPLICATE_ATTRIBUTE")
        require(all(name in self.ATTRIBUTES.get(tag, set()) | {"class"}
                    and isinstance(value, str) and len(value) <= 2048
                    for name, value in attributes), "DOCUMENT_ATTRIBUTE")
        require(all(private not in value for _, value in attributes for private in PRIVATE_FIXTURES),
                "DOCUMENT_PRIVATE_ATTRIBUTE")
        if "class" in attrs:
            require(re.fullmatch(r"[A-Za-z0-9 _-]{0,160}", attrs["class"]) is not None, "DOCUMENT_CLASS")
        if tag == "html":
            require(not self.stack and not self.elements, "DOCUMENT_ROOT")
        elif tag in ("head", "body"):
            require(self.stack == ["html"], "DOCUMENT_SECTION")
        elif tag in ("meta", "title", "link"):
            require(self.stack == ["html", "head"], "DOCUMENT_HEAD")
        else:
            require("body" in self.stack and "head" not in self.stack, "DOCUMENT_BODY")
        self.elements.append((tag, attrs))
        require(len(self.elements) <= 256, "DOCUMENT_ELEMENT_BOUND")
        if tag not in ("meta", "link"):
            self.stack.append(tag)
            require(len(self.stack) <= 16, "DOCUMENT_DEPTH")

    def handle_endtag(self, tag):
        require(bool(self.stack) and self.stack[-1] == tag, "DOCUMENT_NESTING")
        self.stack.pop()

    def handle_startendtag(self, _tag, _attributes):
        raise PROBE.ProbeError("DOCUMENT_SELF_CLOSING")

    def handle_comment(self, _data):
        raise PROBE.ProbeError("DOCUMENT_COMMENT")

    def unknown_decl(self, _data):
        raise PROBE.ProbeError("DOCUMENT_DECLARATION")

    def handle_pi(self, _data):
        raise PROBE.ProbeError("DOCUMENT_PROCESSING_INSTRUCTION")

    def handle_data(self, data):
        require(bool(self.stack) or not data.strip(), "DOCUMENT_OUTSIDE_TEXT")
        self.text.append(data)

    def verify(self, source, language, title, public_fields):
        require(not self.stack and self.declarations == 1, "DOCUMENT_INCOMPLETE")
        for tag in ("html", "head", "body", "main", "h1", "title"):
            require(sum(name == tag for name, _ in self.elements) == 1, "DOCUMENT_STRUCTURE")
        selected = lambda tag: [attrs for name, attrs in self.elements if name == tag]
        require(selected("html") == [{"lang": language}], "DOCUMENT_LANGUAGE")
        require(selected("body") == [{"class": "guest-print-document"}], "DOCUMENT_BODY_CLASS")
        require(selected("button") == [{"type": "button", "class": "print-action"}], "DOCUMENT_PRINT_ACTION")
        require(selected("link") == [{"rel": "stylesheet", "href": ORIGIN + "/" + name} for name in STYLES],
                "DOCUMENT_STYLES")
        require(selected("meta") == [
            {"charset": "utf-8"}, {"name": "viewport", "content": "width=device-width, initial-scale=1"},
            {"name": "referrer", "content": "no-referrer"},
            {"http-equiv": "Content-Security-Policy", "content": CSP},
        ], "DOCUMENT_POLICY")
        require(all(attrs == {"href": "https://www.openstreetmap.org/", "target": "_blank",
                              "rel": "noopener noreferrer"} for attrs in selected("a")), "DOCUMENT_ROUTE")
        text = "".join(self.text)
        require(title in text and all(field in text for field in public_fields), "DOCUMENT_PUBLIC_FIELDS")
        require(all(private not in source and private not in text for private in PRIVATE_FIXTURES),
                "DOCUMENT_PRIVACY")


def validate_capture(directory, case, binding, read_source):
    require(case in CAPTURE_CASES, "CAPTURE_CASE")
    directory = Path(directory)
    require(directory.is_dir() and not directory.is_symlink(), "CAPTURE_DIRECTORY")
    require({path.name for path in directory.iterdir()} == {
        "document.html", "tokens.css", "employee-ux.css", "manifest.json"}, "CAPTURE_FILES")
    manifest = strict_json(bounded_file(directory / "manifest.json", 32_768))
    required = {
        "schemaVersion", "scope", "productAcceptance", *binding, "project", "browserName",
        "browserVersion", "language", "playwrightVersion", "testTitle", "document", "styles",
        "expectedPublicFields", "privacyChecks",
    }
    require(type(manifest) is dict and set(manifest) == required, "CAPTURE_SCHEMA")
    language = case[-2:]
    project = case[:-3]
    require(type(manifest["schemaVersion"]) is int and manifest["schemaVersion"] == 1
            and manifest["scope"] == "actual-guest-dom-capture"
            and manifest["productAcceptance"] is False, "CAPTURE_SCOPE")
    require(all(manifest[key] == value for key, value in binding.items()), "CAPTURE_SOURCE")
    require(manifest["project"] == project and manifest["language"] == language
            and manifest["browserName"] == ("chromium" if project == PROJECTS[0] else "webkit"),
            "CAPTURE_ENGINE_LANGUAGE")
    for key in ("browserVersion", "playwrightVersion"):
        require(type(manifest[key]) is str
                and re.fullmatch(r"[0-9]{1,3}(?:\.[0-9]{1,6}){1,3}", manifest[key]) is not None,
                "CAPTURE_VERSION")
    require(manifest["testTitle"] == "CO-317: EMP-14 EMP-15 bounded public content keeps every field in multipage A4 and print CSS in " + language,
            "CAPTURE_ORIGINAL_CASE")
    fields = manifest["expectedPublicFields"]
    require(type(fields) is list and len(fields) == 10 and all(
        type(value) is str and 0 < len(value) <= 512 for value in fields), "CAPTURE_PUBLIC_FIELDS")
    require(manifest["privacyChecks"] == PRIVACY_CHECKS, "CAPTURE_PRIVACY_CHECKS")
    doc = manifest["document"]
    require(type(doc) is dict and set(doc) == {"file", "url", "sha256", "bytes", "title", "csp"}
            and doc["file"] == "document.html" and doc["url"] == DOCUMENT_URL and doc["csp"] == CSP,
            "CAPTURE_DOCUMENT")
    require(type(doc["title"]) is str and 0 < len(doc["title"]) <= 256, "CAPTURE_TITLE")
    html = bounded_file(directory / "document.html", 65_536)
    require(type(doc["bytes"]) is int and doc["bytes"] == len(html)
            and doc["sha256"] == PROBE.digest(html), "CAPTURE_DOCUMENT_DIGEST")
    try:
        text = html.decode("utf-8")
    except UnicodeError:
        raise PROBE.ProbeError("CAPTURE_DOCUMENT_ENCODING") from None
    require(text.startswith("<!DOCTYPE html>\n<html"), "CAPTURE_ORIGINAL_SERIALIZATION")
    parser = GuestDocument()
    parser.feed(text)
    parser.close()
    parser.verify(text, language, doc["title"], fields)
    styles = manifest["styles"]
    require(type(styles) is list and len(styles) == 2, "CAPTURE_STYLE_COUNT")
    resources = {DOCUMENT_PATH: ("text/html; charset=utf-8", html)}
    for source_path, style in zip(STYLES, styles):
        require(type(style) is dict and set(style) == {"sourcePath", "url", "sha256", "gitBlob", "bytes", "file"}
                and style["sourcePath"] == source_path and style["url"] == ORIGIN + "/" + source_path
                and style["file"] == Path(source_path).name, "CAPTURE_STYLE")
        data = bounded_file(directory / style["file"], 524_288)
        original = read_source(source_path)
        blob = hashlib.sha1(b"blob " + str(len(data)).encode("ascii") + b"\0" + data).hexdigest()
        require(data == original and type(style["bytes"]) is int and style["bytes"] == len(data)
                and style["sha256"] == PROBE.digest(data) and style["gitBlob"] == blob, "CAPTURE_STYLE_SOURCE")
        resources["/" + source_path] = ("text/css; charset=utf-8", data)
    return manifest, resources


def load_capture(case, binding):
    require(not (ROOT / "test-results").is_symlink() and CAPTURES.is_dir()
            and not CAPTURES.is_symlink(), "CAPTURE_ROOT")
    require({path.name for path in CAPTURES.iterdir()} == set(CAPTURE_CASES), "CAPTURE_INVENTORY")
    return validate_capture(CAPTURES / case, case, binding,
                            lambda name: git("show", binding["productSourceSha"] + ":" + name))


def require_unprivileged(uid, gid):
    require(type(uid) is int and type(gid) is int and uid > 0 and gid > 0
            and os.geteuid() == uid and os.getegid() == gid
            and os.getresuid() == (uid, uid, uid) and os.getresgid() == (gid, gid, gid)
            and os.getgroups() == [], "SERVER_PRIVILEGE_DROP_REQUIRED")


def drop_server_privileges(uid, gid):
    require(type(uid) is int and type(gid) is int and 1 <= uid < 2**31 and 1 <= gid < 2**31
            and os.geteuid() == 0 and os.environ.get("SUDO_UID") == str(uid)
            and os.environ.get("SUDO_GID") == str(gid), "SERVER_ORIGINAL_ID_REQUIRED")
    require(all(hasattr(os, name) for name in ("setresuid", "setresgid", "getresuid", "getresgid")),
            "SERVER_IRREVERSIBLE_DROP_UNAVAILABLE")
    os.setgroups([])
    os.setresgid(gid, gid, gid)
    os.setresuid(uid, uid, uid)
    require_unprivileged(uid, gid)
    try:
        os.setuid(0)
    except PermissionError:
        pass
    else:
        raise PROBE.ProbeError("SERVER_PRIVILEGE_DROP_REVERSIBLE")
    require_unprivileged(uid, gid)


def prepare_server_socket(uid, gid):
    require(all(os.environ.get(key) == value for key, value in {
        "CI": "true", "GITHUB_ACTIONS": "true", "RUNNER_ENVIRONMENT": "github-hosted",
        "RUNNER_OS": "Linux", "ImageOS": "ubuntu26",
        "GITHUB_REPOSITORY": "floriankreutzer/conference-manager",
    }.items()), "DISPOSABLE_PUBLIC_RUNNER_REQUIRED")
    listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        listener.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        # This is the sole operation requiring the elevated bind process.
        listener.bind(("127.0.0.1", 443))
        drop_server_privileges(uid, gid)
        environment = PROBE.worker_environment(os.environ)
        environment["CM_GUEST_PRODUCT_SOURCE_SHA"] = os.environ.get("CM_GUEST_PRODUCT_SOURCE_SHA", "")
        os.environ.clear()
        os.environ.update(environment)
        PROBE.runtime_guard(os.environ)
        return listener
    except BaseException:
        listener.close()
        raise


def serve_capture(case, directory, uid, gid):
    listener = prepare_server_socket(uid, gid)
    try:
        # No TLS context, key, HTML or HTTP handler is touched while privileged.
        require_unprivileged(uid, gid)
        binding = source_binding()
        _manifest, resources = load_capture(case, binding)
        directory = Path(directory)
        info = directory.lstat()
        require(stat.S_ISDIR(info.st_mode) and directory.parent == Path(tempfile.gettempdir())
                and directory.name.startswith("cm-gtk-guest-") and info.st_uid == uid
                and info.st_mode & 0o077 == 0, "SERVER_CERTIFICATE_DIRECTORY")
        bounded_file(directory / "valid.pem", 32_768)
        bounded_file(directory / "leaf.key", 16_384)
        tls = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
        tls.minimum_version = ssl.TLSVersion.TLSv1_2
        tls.load_cert_chain(str(directory / "valid.pem"), str(directory / "leaf.key"))
        counts = {name: 0 for name in resources}
        rejected, deadline = [False], [False]
        counts_lock = threading.Lock()

        class Handler(http.server.BaseHTTPRequestHandler):
            def log_message(self, _format, *arguments):
                pass

            def send_error(self, code, _message=None, _explain=None):
                rejected[0] = True
                self.send_response(code)
                self.send_header("Content-Length", "0")
                self.send_header("Connection", "close")
                self.end_headers()
                self.close_connection = True

            def do_GET(self):
                require_unprivileged(uid, gid)
                with counts_lock:
                    allowed = (self.path in resources and sum(counts.values()) < 16
                               and self.headers.get_all("Host") in (["conference.test"], ["conference.test:443"]))
                    if allowed:
                        counts[self.path] += 1
                if not allowed:
                    self.send_error(403)
                    return
                media_type, body = resources[self.path]
                self.send_response(200)
                self.send_header("Content-Type", media_type)
                self.send_header("Content-Length", str(len(body)))
                self.send_header("Cache-Control", "no-store")
                self.send_header("X-Content-Type-Options", "nosniff")
                self.end_headers()
                self.wfile.write(body)

        class Server(http.server.ThreadingHTTPServer):
            daemon_threads = True

            def get_request(self):
                require_unprivileged(uid, gid)
                connection, address = self.socket.accept()
                connection.settimeout(5)
                try:
                    return tls.wrap_socket(connection, server_side=True), address
                except BaseException:
                    connection.close()
                    raise

            def handle_error(self, _request, _address):
                rejected[0] = True

        server = Server(("127.0.0.1", 443), Handler, bind_and_activate=False)
        server.socket.close()
        server.socket = listener
        server.server_address = ("127.0.0.1", 443)
        server.server_activate()

        def stop(signum, _frame):
            if signum == signal.SIGALRM:
                deadline[0] = True
            threading.Thread(target=server.shutdown, daemon=True).start()

        signal.signal(signal.SIGTERM, stop)
        signal.signal(signal.SIGALRM, stop)
        print(json.dumps({"event": "ready", "pid": os.getpid(), "privilegeDropped": True}, sort_keys=True), flush=True)
        try:
            server.serve_forever(poll_interval=0.1)
        finally:
            server.server_close()
            signal.alarm(0)
        passed = (not rejected[0] and not deadline[0] and all(1 <= count <= 16 for count in counts.values())
                  and sum(counts.values()) <= 16)
        print(json.dumps({"event": "stopped", "passed": passed, "privilegeDropped": True,
                          "requests": counts, "rejected": rejected[0], "deadline": deadline[0]}, sort_keys=True), flush=True)
        return 0 if passed else 1
    finally:
        listener.close()


def server_descends_from(pid, ancestor, uid, gid):
    if type(pid) is not int or not 1 < pid < 2**31 or pid == ancestor:
        return False
    current = pid
    try:
        for index in range(12):
            values = dict(line.split(":", 1) for line in (Path("/proc") / str(current) / "status").read_text().splitlines())
            if index == 0:
                if ([int(value) for value in values["Uid"].split()] != [uid] * 4
                        or [int(value) for value in values["Gid"].split()] != [gid] * 4
                        or values["Groups"].strip()):
                    return False
            parent = int(values["PPid"].strip())
            if parent == ancestor:
                return True
            if parent <= 1 or parent == current:
                return False
            current = parent
    except (OSError, ValueError, KeyError):
        return False
    return False


def server_ready(child, uid, gid):
    data = bytearray()
    deadline = time.monotonic() + 10
    with selectors.DefaultSelector() as selector:
        selector.register(child.stdout, selectors.EVENT_READ)
        while b"\n" not in data:
            remaining = deadline - time.monotonic()
            require(remaining > 0 and bool(selector.select(remaining)), "SERVER_READY_DEADLINE")
            chunk = os.read(child.stdout.fileno(), min(1025 - len(data), 1025))
            require(bool(chunk), "SERVER_READY_MISSING")
            data.extend(chunk)
            require(len(data) <= 1024, "SERVER_READY_BOUND")
    require(data.endswith(b"\n") and data.count(b"\n") == 1, "SERVER_READY_PROTOCOL")
    result = strict_json(bytes(data))
    require(type(result) is dict and set(result) == {"event", "pid", "privilegeDropped"}
            and result["event"] == "ready" and result["privilegeDropped"] is True
            and server_descends_from(result["pid"], child.pid, uid, gid), "SERVER_READY_IDENTITY")
    return result["pid"]


@contextlib.contextmanager
def original_origin_server(case, directory, evidence):
    uid, gid = os.geteuid(), os.getegid()
    require(uid > 0 and gid > 0, "BROWSER_MUST_NOT_RUN_AS_ROOT")
    names = (
        "CI", "GITHUB_ACTIONS", "RUNNER_ENVIRONMENT", "RUNNER_OS", "ImageOS",
        "GITHUB_REPOSITORY", "CM_PROBE_SOURCE_SHA", "CM_GUEST_PRODUCT_SOURCE_SHA",
    )
    arguments = ["sudo", "-n", "--preserve-env=" + ",".join(names),
                 "/usr/bin/python3", "-I", "-S", str(Path(__file__).resolve()),
                 "--serve", case, str(directory), str(uid), str(gid)]
    child = subprocess.Popen(arguments, stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
    pidfd = None
    original_error = None
    evidence.update(port=443, privilegeDropped=False, stopped=False)
    try:
        pid = server_ready(child, uid, gid)
        pidfd = os.pidfd_open(pid)
        require(server_descends_from(pid, child.pid, uid, gid), "SERVER_PID_CHANGED")
        evidence["privilegeDropped"] = True
        yield
    except BaseException as error:
        original_error = error
        raise
    finally:
        try:
            if pidfd is not None:
                signal.pidfd_send_signal(pidfd, signal.SIGTERM)
            elif child.poll() is None:
                child.terminate()
            stdout, stderr, failure = PROBE.collect_worker_output(child)
            evidence.update(exitCode=child.returncode, stdoutBytes=len(stdout), stderrBytes=len(stderr))
            require(failure is None and child.returncode == 0, "SERVER_CLEANUP_FAILED")
            result = strict_json(stdout)
            require(type(result) is dict and set(result) == {
                "event", "passed", "privilegeDropped", "requests", "rejected", "deadline"}
                and result["event"] == "stopped" and result["passed"] is True
                and result["privilegeDropped"] is True and result["rejected"] is False
                and result["deadline"] is False, "SERVER_STOP_PROTOCOL")
            counts = result["requests"]
            require(type(counts) is dict and set(counts) == {DOCUMENT_PATH, *("/" + name for name in STYLES)}
                    and all(type(count) is int and 1 <= count <= 16 for count in counts.values())
                    and sum(counts.values()) <= 16, "SERVER_REQUEST_BOUNDARY")
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as check:
                check.settimeout(2)
                require(check.connect_ex(("127.0.0.1", 443)) == errno.ECONNREFUSED, "SERVER_PORT_NOT_CLOSED")
            evidence.update(stopped=True, requests=counts)
        except BaseException:
            evidence["failure"] = "SERVER_CLEANUP_FAILED"
            if pidfd is not None:
                with contextlib.suppress(OSError):
                    signal.pidfd_send_signal(pidfd, signal.SIGKILL)
            if original_error is None:
                raise PROBE.ProbeError("SERVER_CLEANUP_FAILED") from None
        finally:
            if pidfd is not None:
                with contextlib.suppress(OSError):
                    os.close(pidfd)
            for stream in (child.stdout, child.stderr):
                with contextlib.suppress(OSError):
                    stream.close()


def gtk_guest_worker(case, progress):
    require(case in CAPTURE_CASES, "CASE_REJECTED")
    manifest, _resources = load_capture(case, source_binding())
    output = OUTPUT
    require(output.is_dir() and not output.is_symlink(), "WORKER_OUTPUT_REJECTED")
    progress["phase"] = "gi-import"
    import gi
    gi.require_version("Gtk", "3.0")
    gi.require_version("WebKit2", "4.1")
    from gi.repository import GLib, Gtk, WebKit2
    progress["phase"] = "gtk-init"
    require(Gtk.init_check([])[0], "GTK_DISPLAY_UNAVAILABLE")
    progress["phase"] = "print-backend"
    Gtk.Settings.get_default().set_property("gtk-print-backends", "file")
    progress["phase"] = "tls-policy"
    manager = WebKit2.WebsiteDataManager.new_ephemeral()
    require(manager.get_tls_errors_policy() == WebKit2.TLSErrorsPolicy.FAIL, "TLS_POLICY_NOT_FAIL")
    progress["phase"] = "sandbox-policy"
    context = WebKit2.WebContext.new_with_website_data_manager(manager)
    # API 4.1 requires explicit opt-in before any WebView can spawn a process.
    context.set_sandbox_enabled(True)
    require(context.get_sandbox_enabled(), "SANDBOX_ENABLE_UNAVAILABLE")
    progress["phase"] = "view-init"
    view = WebKit2.WebView.new_with_context(context)
    view.get_settings().set_enable_javascript(False)
    window = Gtk.Window()
    window.add(view)
    window.show_all()
    loop = GLib.MainLoop()
    language = manifest["language"]
    uri = DOCUMENT_URL
    result = {"case": "valid-" + language, "passed": False, "sandboxEnabled": True, "tlsPolicy": "FAIL",
              "webkit": ".".join(str(value) for value in (
                  WebKit2.get_major_version(), WebKit2.get_minor_version(), WebKit2.get_micro_version()))}
    finished = False
    operations = []

    def finish(passed, code):
        nonlocal finished
        if not finished:
            finished = True
            result.update(passed=passed, result=code, phase=progress["phase"])
            GLib.idle_add(loop.quit)
        return False

    def tls_failed(_view, failing_uri, _certificate, flags):
        progress["phase"] = "tls-handshake"
        result["tlsFlags"] = int(flags)
        finish(False, "TLS_UNVERIFIED")
        return False

    def loaded(_view, event):
        if finished or event != WebKit2.LoadEvent.FINISHED:
            return
        try:
            progress["phase"] = "document"
            secure, certificate, flags = view.get_tls_info()
            require(secure and certificate is not None and int(flags) == 0, "TLS_UNVERIFIED")
            require(view.get_uri() == uri and view.get_title() == manifest["document"]["title"],
                    "GUEST_DOCUMENT_UNVERIFIED")
            progress["phase"] = "sandbox-process"
            result.update(tlsFlags=0, sandbox=PROBE.sandbox_evidence())
            progress["phase"] = "print-settings"
            pdf = output / (case + ".pdf")
            require(not pdf.exists() and not pdf.is_symlink(), "STALE_PDF_REJECTED")
            settings = Gtk.PrintSettings.new()
            settings.set_printer("Print to File")
            settings.set_print_pages(Gtk.PrintPages.ALL)
            settings.set_n_copies(1)
            settings.set_number_up(1)
            settings.set("output-file-format", "pdf")
            settings.set("output-uri", pdf.as_uri())
            setup = Gtk.PageSetup.new()
            setup.set_paper_size(Gtk.PaperSize.new(Gtk.PAPER_NAME_A4))
            setup.set_orientation(Gtk.PageOrientation.PORTRAIT)
            progress["phase"] = "print-operation"
            operation = WebKit2.PrintOperation.new(view)
            operation.set_print_settings(settings)
            operation.set_page_setup(setup)
            operation.connect("failed", lambda _operation, _error: finish(False, "PRINT_FAILED"))
            operation.connect("finished", lambda _operation: finish(True, "PRINT_FINISHED"))
            operations.append(operation)
            print_call = getattr(operation, "print_", None) or getattr(operation, "print", None)
            require(callable(print_call), "PRINT_OPERATION_UNAVAILABLE")
            print_call()
        except Exception as error:
            finish(False, PROBE.worker_error_code(error))

    view.connect("load-failed-with-tls-errors", tls_failed)
    view.connect("load-failed", lambda *_arguments: finish(False, "LOAD_FAILED"))
    view.connect("web-process-terminated", lambda *_arguments: finish(False, "WEBPROCESS_TERMINATED"))
    view.connect("load-changed", loaded)
    GLib.timeout_add_seconds(25, lambda: finish(False, "GTK_DEADLINE"))
    progress["phase"] = "navigation"
    view.load_uri(uri)
    loop.run()
    progress["phase"] = "cleanup"
    view.stop_loading()
    window.destroy()
    return result



def run_guest_worker(case):
    require(case in CAPTURE_CASES, "CASE_REJECTED")
    progress = {"phase": "arguments"}
    try:
        result = gtk_guest_worker(case, progress)
    except Exception as error:
        result = {"case": "valid-" + case[-2:], "passed": False, "phase": progress["phase"],
                  "failure": PROBE.worker_error_code(error)}
    print(json.dumps(result, sort_keys=True))
    return 0 if result["passed"] else 1


def verify_pdf_info(text):
    count = re.search(r"^Pages:\s+(\d+)\s*$", text, re.MULTILINE)
    require(count is not None and 2 <= int(count.group(1)) <= 4, "PDF_PAGE_COUNT")
    pages = int(count.group(1))
    sizes = re.findall(r"^Page\s+(\d+)\s+size:\s+([\d.]+)\s+x\s+([\d.]+)\s+pts", text, re.MULTILINE)
    require([int(item[0]) for item in sizes] == list(range(1, pages + 1)), "ALL_PDF_PAGES_REQUIRED")
    require(all(abs(float(width) - 595.276) < 1 and abs(float(height) - 841.890) < 1
                for _, width, height in sizes), "PDF_NOT_A4")
    return {"pages": pages, "allPagesA4": True}


def verify_pdf_text(text, public_fields):
    compact = re.sub(r"\s+", "", text)
    require(all(re.sub(r"\s+", "", field) in compact for field in public_fields), "PDF_PUBLIC_FIELDS")
    require(all(private not in compact for private in PRIVATE_FIXTURES), "PDF_PRIVACY")


def inspect_guest_pdf(case, manifest):
    require(case in CAPTURE_CASES, "CAPTURE_CASE")
    pdf = OUTPUT / (case + ".pdf")
    data = bounded_file(pdf, 2_000_000)
    require(len(data) > 1000 and data.startswith(b"%PDF-") and data.rstrip().endswith(b"%%EOF"), "PDF_FILE_INVALID")
    require(re.search(rb"/(?:Encrypt|JavaScript|JS|Launch|EmbeddedFile|OpenAction|AA)\b", data) is None,
            "PDF_ACTIVE_CONTENT")
    initial = PROBE.command(["pdfinfo", str(pdf)]).decode("utf-8")
    count = re.search(r"^Pages:\s+(\d+)\s*$", initial, re.MULTILINE)
    require(count is not None and 2 <= int(count.group(1)) <= 4, "PDF_PAGE_COUNT")
    pages = int(count.group(1))
    result = verify_pdf_info(PROBE.command([
        "pdfinfo", "-f", "1", "-l", str(pages), "-box", str(pdf),
    ]).decode("utf-8"))
    # Check complete semantic fields in this pinned GTK producer's content-stream order.
    # Physical layout still requires every A4 page and its original raster to be reviewed.
    text = PROBE.command(["pdftotext", "-enc", "UTF-8", "-raw", str(pdf), "-"]).decode("utf-8")
    verify_pdf_text(text, manifest["expectedPublicFields"])
    images = []
    for page in range(1, pages + 1):
        page_text = PROBE.command([
            "pdftotext", "-f", str(page), "-l", str(page), "-enc", "UTF-8", str(pdf), "-",
        ]).decode("utf-8")
        require(bool(page_text.strip()), "PDF_EMPTY_PAGE")
        stem = OUTPUT / (case + "-page-" + str(page))
        require(not stem.with_suffix(".png").exists() and not stem.with_suffix(".png").is_symlink(),
                "STALE_PNG_REJECTED")
        PROBE.command(["pdftoppm", "-f", str(page), "-l", str(page), "-r", "96", "-png",
                       "-singlefile", str(pdf), str(stem)])
        image = bounded_file(stem.with_suffix(".png"), 4 * 1024 * 1024)
        require(len(image) > 64 and image.startswith(b"\x89PNG\r\n\x1a\n"), "PDF_RENDER_FAILED")
        images.append({"file": stem.name + ".png", "page": page, "bytes": len(image),
                       "sha256": PROBE.digest(image), "renderer": "Poppler pdftoppm 96dpi"})
    result.update(file=pdf.name, bytes=len(data), sha256=PROBE.digest(data),
                  textSha256=PROBE.digest(text.encode("utf-8")), publicFieldsPresent=True,
                  privateFixtureFieldsAbsent=True, images=images)
    return result


def require_phase_one(binding):
    path = ROOT / "test-results" / "webkitgtk-probe" / "receipt.json"
    require(not path.parent.is_symlink(), "PHASE_ONE_OUTPUT_REJECTED")
    raw = bounded_file(path, 65_536)
    receipt = strict_json(raw)
    require(type(receipt) is dict and receipt.get("schemaVersion") == 1
            and receipt.get("scope") == "synthetic-capability-only"
            and receipt.get("productAcceptance") is False and receipt.get("passed") is True
            and receipt.get("sourceSha") == binding["captureSourceSha"]
            and receipt.get("treeSha") == binding["captureTreeSha"]
            and receipt.get("scriptSha256") == PHASE_ONE_SHA256, "PHASE_ONE_SOURCE_REQUIRED")
    entries = receipt.get("cases")
    require(type(entries) is list and [entry.get("case") for entry in entries if type(entry) is dict] == list(PROBE.CASES)
            and len(entries) == 6, "PHASE_ONE_ALL_CASES_REQUIRED")
    for entry in entries:
        require(type(entry) is dict and type(entry.get("exitCode")) is int
                and all(type(entry.get(key)) is int and 0 <= entry[key] <= PROBE.WORKER_OUTPUT_LIMIT
                        for key in ("stdoutBytes", "stderrBytes")), "PHASE_ONE_WORKER_METADATA")
        original = {key: value for key, value in entry.items() if key not in ("exitCode", "stdoutBytes", "stderrBytes")}
        observed = PROBE.parse_worker_output(entry["case"], entry["exitCode"],
                                            json.dumps(original).encode("utf-8"), b"")
        require(observed.get("passed") is True, "PHASE_ONE_WORKER_REQUIRED")
    cleanup = receipt.get("cleanup")
    require(type(cleanup) is dict and cleanup.get("complete") is True and cleanup.get("failures") == []
            and cleanup.get("originalTrustSha256") == PROBE.digest(PROBE.CA_BUNDLE.read_bytes()),
            "PHASE_ONE_CLEANUP_REQUIRED")
    require(type(receipt.get("packages")) is list and len(receipt["packages"]) == 5
            and all(type(value) is str and re.fullmatch(r"[a-z0-9.+:-]+=[a-zA-Z0-9.+:~_-]{1,100}", value)
                    for value in receipt["packages"]), "PHASE_ONE_PACKAGES")
    return receipt, PROBE.digest(raw)


def bounded_failure(error):
    code = str(error) if isinstance(error, PROBE.ProbeError) else type(error).__name__
    return code if re.fullmatch(r"[A-Za-z][A-Za-z0-9_]{0,63}", code) else "GUEST_PROBE_FAILED"


def run_guest_probe():
    PROBE.runtime_guard(os.environ)
    os.umask(0o077)
    binding = source_binding()
    phase_one, phase_one_digest = require_phase_one(binding)
    for case in CAPTURE_CASES:
        load_capture(case, binding)
    require(not OUTPUT.parent.is_symlink() and not OUTPUT.exists() and not OUTPUT.is_symlink(),
            "FRESH_OUTPUT_REQUIRED")
    OUTPUT.mkdir(mode=0o700)
    receipt = {
        "schemaVersion": 1, "scope": "actual-guest-dom-webkitgtk-print", "productAcceptance": False,
        **binding, "scriptSha256": PROBE.digest(Path(__file__).read_bytes()),
        "reusedPhaseOneSource": PHASE_ONE_COMMIT, "reusedPhaseOneScriptSha256": PHASE_ONE_SHA256,
        "phaseOneReceiptSha256": phase_one_digest, "renderer": "WebKitGTK 4.1 PrintOperation",
        "runnerImage": os.environ.get("ImageVersion", "unknown"), "packages": phase_one["packages"],
        "passed": False, "documents": [], "cleanup": {"complete": False},
    }
    trust = None
    try:
        with tempfile.TemporaryDirectory(prefix="cm-gtk-guest-") as temporary:
            directory = Path(temporary)
            PROBE.create_certificates(directory)
            trust = PROBE.TemporaryVmTrust(directory)
            try:
                with trust:
                    for case in CAPTURE_CASES:
                        manifest, _resources = load_capture(case, binding)
                        entry = {
                            "captureCase": case, "inputProject": manifest["project"],
                            "inputBrowserVersion": manifest["browserVersion"], "language": manifest["language"],
                            "captureManifestSha256": PROBE.digest(bounded_file(CAPTURES / case / "manifest.json", 32_768)),
                            "documentSha256": manifest["document"]["sha256"], "server": {},
                        }
                        receipt["documents"].append(entry)
                        with original_origin_server(case, directory, entry["server"]):
                            environment = PROBE.worker_environment(os.environ)
                            environment["CM_GUEST_PRODUCT_SOURCE_SHA"] = binding["productSourceSha"]
                            arguments = ["/usr/bin/python3", str(Path(__file__).resolve()), "--worker", case]
                            with subprocess.Popen(arguments, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                                  start_new_session=True, env=environment) as child:
                                stdout, stderr, collection_failure = PROBE.collect_worker_output(child)
                            observed = PROBE.parse_worker_output("valid-" + manifest["language"], child.returncode,
                                                                stdout, stderr, collection_failure)
                            entry["worker"] = observed
                            require(observed.get("passed") is True, "GUEST_PRINT_WORKER_FAILED")
                            require(observed.get("webkit") == phase_one["cases"][-1]["webkit"], "WEBKIT_VERSION_CHANGED")
                        # Keep the server's unchanged deadline independent of PDF rasterization.
                        entry["pdf"] = inspect_guest_pdf(case, manifest)
            finally:
                receipt["cleanup"] = trust.evidence
        require(receipt["cleanup"].get("complete") is True and len(receipt["documents"]) == 4
                and all(entry["server"].get("stopped") is True for entry in receipt["documents"]),
                "GUEST_CLEANUP_UNVERIFIED")
        receipt["passed"] = True
    except BaseException as error:
        receipt["failure"] = bounded_failure(error)
        if trust is not None:
            receipt["cleanup"] = trust.evidence
    finally:
        (OUTPUT / "receipt.json").write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n", encoding="utf-8")
    return 0 if receipt["passed"] else 1



MIB = 1024 * 1024
MAX_IMAGES = 16
MAX_IMAGE_BYTES = 2 * MIB
MAX_IMAGE_TOTAL = 3 * MIB

# Preserve the existing bounded native image-reader protocol and PNG validation.
# Source: scripts/diagnostics/pr479_artifact_review.py, Git blob
# ac417698b89137cc36ae6fdcc5f0c707e29f03b9. No network/archive code is reused.

def png_dimensions(data):
    require(isinstance(data, bytes) and 33 <= len(data) <= MAX_IMAGE_BYTES, "png-size")
    require(data[:8] == b"\x89PNG\r\n\x1a\n" and data[12:16] == b"IHDR", "png-type")
    width, height = struct.unpack(">II", data[16:24])
    require(0 < width <= 4096 and 0 < height <= 32768 and width * height <= 50_000_000, "png-dimensions")
    offset, chunks, image_bytes, ended = 8, 0, 0, False
    while offset < len(data):
        require(offset + 12 <= len(data), "png-chunk-header")
        length = struct.unpack(">I", data[offset:offset + 4])[0]
        kind = data[offset + 4:offset + 8]
        require(length <= MAX_IMAGE_BYTES and offset + 12 + length <= len(data), "png-chunk-size")
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



def collect_guest_page_images(binding, phase_one, phase_one_digest):
    require(OUTPUT.is_dir() and not OUTPUT.is_symlink() and not OUTPUT.parent.is_symlink(),
            "IMAGE_OUTPUT_DIRECTORY")
    raw = bounded_file(OUTPUT / "receipt.json", 131_072)
    receipt = strict_json(raw)
    keys = {
        "schemaVersion", "scope", "productAcceptance", *binding, "scriptSha256",
        "reusedPhaseOneSource", "reusedPhaseOneScriptSha256", "phaseOneReceiptSha256",
        "renderer", "runnerImage", "packages", "passed", "documents", "cleanup",
    }
    require(type(receipt) is dict and set(receipt) == keys
            and type(receipt["schemaVersion"]) is int and receipt["schemaVersion"] == 1
            and receipt["scope"] == "actual-guest-dom-webkitgtk-print"
            and receipt["productAcceptance"] is False and receipt["passed"] is True,
            "IMAGE_SUCCESSFUL_GUEST_RECEIPT_REQUIRED")
    require(all(receipt[key] == value for key, value in binding.items())
            and receipt["scriptSha256"] == PROBE.digest(Path(__file__).read_bytes())
            and receipt["reusedPhaseOneSource"] == PHASE_ONE_COMMIT
            and receipt["reusedPhaseOneScriptSha256"] == PHASE_ONE_SHA256
            and receipt["phaseOneReceiptSha256"] == phase_one_digest
            and receipt["packages"] == phase_one["packages"]
            and receipt["renderer"] == "WebKitGTK 4.1 PrintOperation", "IMAGE_SOURCE_BINDING")
    require(receipt["cleanup"] == phase_one["cleanup"], "IMAGE_CLEANUP_REQUIRED")
    documents = receipt["documents"]
    require(type(documents) is list and len(documents) == 4
            and [entry.get("captureCase") for entry in documents if type(entry) is dict] == list(CAPTURE_CASES),
            "IMAGE_FOUR_DOCUMENTS_REQUIRED")
    poppler = [value for value in receipt["packages"] if value.startswith("poppler-utils=")]
    require(len(poppler) == 1, "IMAGE_POPPLER_VERSION")
    images, contexts, allowed_files = [], [], {"receipt.json"}
    total = 0
    for entry in documents:
        require(set(entry) == {
            "captureCase", "inputProject", "inputBrowserVersion", "language",
            "captureManifestSha256", "documentSha256", "server", "worker", "pdf",
        }, "IMAGE_DOCUMENT_SCHEMA")
        case = entry["captureCase"]
        manifest, _resources = load_capture(case, binding)
        require(entry["inputProject"] == manifest["project"]
                and entry["inputBrowserVersion"] == manifest["browserVersion"]
                and entry["language"] == manifest["language"]
                and entry["captureManifestSha256"] == PROBE.digest(bounded_file(CAPTURES / case / "manifest.json", 32_768))
                and entry["documentSha256"] == manifest["document"]["sha256"], "IMAGE_CAPTURE_BINDING")
        server = entry["server"]
        require(type(server) is dict and set(server) == {
            "port", "privilegeDropped", "stopped", "exitCode", "stdoutBytes", "stderrBytes", "requests"}
            and server["port"] == 443 and server["privilegeDropped"] is True and server["stopped"] is True
            and type(server["exitCode"]) is int and server["exitCode"] == 0
            and all(type(server[key]) is int and 0 <= server[key] <= PROBE.WORKER_OUTPUT_LIMIT
                    for key in ("stdoutBytes", "stderrBytes")), "IMAGE_SERVER_CLEANUP")
        counts = server["requests"]
        require(type(counts) is dict and set(counts) == {DOCUMENT_PATH, *("/" + name for name in STYLES)}
                and all(type(count) is int and 1 <= count <= 16 for count in counts.values())
                and sum(counts.values()) <= 16, "IMAGE_SERVER_BOUNDARY")
        worker = entry["worker"]
        require(type(worker) is dict and all(type(worker.get(key)) is int
                and 0 <= worker[key] <= PROBE.WORKER_OUTPUT_LIMIT
                for key in ("stdoutBytes", "stderrBytes")), "IMAGE_WORKER_METADATA")
        payload = {key: value for key, value in worker.items() if key not in ("exitCode", "stdoutBytes", "stderrBytes")}
        observed = PROBE.parse_worker_output("valid-" + entry["language"], worker.get("exitCode"),
                                            json.dumps(payload).encode("utf-8"), b"")
        require(observed.get("passed") is True and observed.get("webkit") == phase_one["cases"][-1]["webkit"],
                "IMAGE_REAL_PRINT_WORKER_REQUIRED")
        pdf = entry["pdf"]
        require(type(pdf) is dict and set(pdf) == {
            "pages", "allPagesA4", "file", "bytes", "sha256", "textSha256",
            "publicFieldsPresent", "privateFixtureFieldsAbsent", "images"}
            and type(pdf["pages"]) is int and 2 <= pdf["pages"] <= 4
            and pdf["allPagesA4"] is True and pdf["publicFieldsPresent"] is True
            and pdf["privateFixtureFieldsAbsent"] is True and pdf["file"] == case + ".pdf"
            and type(pdf["textSha256"]) is str and re.fullmatch(r"[a-f0-9]{64}", pdf["textSha256"]) is not None,
            "IMAGE_PDF_SCHEMA")
        data = bounded_file(OUTPUT / pdf["file"], 2_000_000)
        require(type(pdf["bytes"]) is int and pdf["bytes"] == len(data) and pdf["sha256"] == PROBE.digest(data)
                and len(data) > 1000 and data.startswith(b"%PDF-") and data.rstrip().endswith(b"%%EOF"),
                "IMAGE_ORIGINAL_PDF")
        allowed_files.add(pdf["file"])
        page_images = pdf["images"]
        require(type(page_images) is list and len(page_images) == pdf["pages"], "IMAGE_ALL_PAGES")
        for number, item in enumerate(page_images, 1):
            name = case + "-page-" + str(number) + ".png"
            require(type(item) is dict and set(item) == {"file", "page", "bytes", "sha256", "renderer"}
                    and item["file"] == name and type(item["page"]) is int and item["page"] == number
                    and item["renderer"] == "Poppler pdftoppm 96dpi", "IMAGE_PAGE_SCHEMA")
            image = bounded_file(OUTPUT / name, MAX_IMAGE_BYTES)
            require(type(item["bytes"]) is int and item["bytes"] == len(image)
                    and item["sha256"] == PROBE.digest(image), "IMAGE_ORIGINAL_RASTER")
            dimensions = png_dimensions(image)
            require(793 <= dimensions["width"] <= 795 and 1122 <= dimensions["height"] <= 1124,
                    "IMAGE_A4_RASTER")
            total += len(image)
            require(total <= MAX_IMAGE_TOTAL, "image-total")
            allowed_files.add(name)
            metadata = {
                "capture": name, "reviewGroup": "actual-guest-webkitgtk-pdf",
                "language": entry["language"], "page": number, "pageCount": pdf["pages"],
                "inputProject": entry["inputProject"], "inputBrowserVersion": entry["inputBrowserVersion"],
                "pdfSha256": pdf["sha256"], "pdfBytes": pdf["bytes"],
                "documentSha256": entry["documentSha256"], "captureManifestSha256": entry["captureManifestSha256"],
                "renderer": item["renderer"], "pdfRenderer": receipt["renderer"],
                "webkitGTKVersion": worker["webkit"], "popplerPackage": poppler[0], **binding,
            }
            images.append((metadata, image))
        contexts.append({
            "captureCase": case, "inputProject": entry["inputProject"], "inputBrowserVersion": entry["inputBrowserVersion"],
            "language": entry["language"], "documentSha256": entry["documentSha256"],
            "captureManifestSha256": entry["captureManifestSha256"],
            "pdfFile": pdf["file"], "pdfSha256": pdf["sha256"], "pages": pdf["pages"],
        })
    require(8 <= len(images) <= MAX_IMAGES
            and {path.name for path in OUTPUT.iterdir()} == allowed_files, "IMAGE_COMPLETE_INVENTORY")
    manifest = {
        **binding, "receiptSha256": PROBE.digest(raw), "phaseOneReceiptSha256": phase_one_digest,
        "scope": "original-public-guest-pdf-raster-transport", "productAcceptance": False,
        "pdfRenderer": receipt["renderer"], "renderer": "Poppler pdftoppm 96dpi",
        "captureInventory": contexts, "maxImages": MAX_IMAGES, "maxPngBytes": MAX_IMAGE_TOTAL,
        "limits": [
            "Four actual popup DOM captures; source engine and GTK PDF renderer remain distinct.",
            "Original existing Poppler raster bytes only; no new rendering, scaling or page assembly.",
            "Transport completion is not visual, product, physical Safari or screen-reader acceptance.",
        ],
    }
    return images, manifest


def emit(images, manifest, geometry):
    require(0 < len(images) <= MAX_IMAGES, "image-count")
    require(sum(len(data) for _, data in images) <= MAX_IMAGE_TOTAL, "image-total")
    checked = []
    for metadata, data in images:
        require(re.fullmatch(r"[a-zA-Z0-9_.-]{1,180}", metadata["capture"]), "image-name")
        checked.append(({**metadata, "imageBytes": len(data), "imageSha256": PROBE.digest(data),
                         **png_dimensions(data)}, data))
    # Validate the complete output before the first image is emitted.
    inventory = manifest.pop("captureInventory")
    print("CM_REVIEW_MANIFEST " + json.dumps(manifest, separators=(",", ":"), sort_keys=True))
    for context in inventory:
        print("CM_CAPTURE_CONTEXT " + json.dumps(context, separators=(",", ":"), sort_keys=True))
    for item in geometry:
        encoded = json.dumps(item, separators=(",", ":"), sort_keys=True)
        require(len(encoded) <= 200_000, "geometry-output-size")
        for offset in range(0, len(encoded), 3000):
            print("CM_GEOMETRY_CHUNK " + json.dumps({"capture": item["capture"], "offset": offset,
                                                    "text": encoded[offset:offset + 3000]}, separators=(",", ":")))
        print("CM_GEOMETRY_END " + json.dumps({"capture": item["capture"], "length": len(encoded)}))
    for index, (metadata, data) in enumerate(checked):
        print("CM_IMAGE_BEGIN " + json.dumps({"index": index, **metadata}, separators=(",", ":"), sort_keys=True))
        encoded = base64.b64encode(data).decode("ascii")
        for offset in range(0, len(encoded), 3000):
            print(f"CM_IMAGE_DATA {index} {offset} " + encoded[offset:offset + 3000])
        print(f"CM_IMAGE_END {index} {len(encoded)}")
    print("CM_REVIEW_COMPLETE " + json.dumps({"images": len(checked), "binaryBytes": sum(len(d) for _, d in checked)}))



def emit_guest_page_images():
    PROBE.runtime_guard(os.environ)
    binding = source_binding()
    phase_one, phase_one_digest = require_phase_one(binding)
    images, manifest = collect_guest_page_images(binding, phase_one, phase_one_digest)
    # emit() validates every image and the complete <=3 MiB inventory before printing.
    emit(images, manifest, [])
    return 0


if __name__ == "__main__":
    try:
        if len(sys.argv) == 6 and sys.argv[1] == "--serve":
            signal.signal(signal.SIGTERM, PROBE.interrupted)
            signal.signal(signal.SIGALRM, PROBE.interrupted)
            signal.alarm(35)
            status = serve_capture(sys.argv[2], Path(sys.argv[3]), int(sys.argv[4]), int(sys.argv[5]))
        else:
            PROBE.runtime_guard(os.environ)
            signal.signal(signal.SIGTERM, PROBE.interrupted)
            signal.signal(signal.SIGINT, PROBE.interrupted)
            signal.signal(signal.SIGALRM, PROBE.interrupted)
            signal.alarm(300)
            if len(sys.argv) == 3 and sys.argv[1] == "--worker":
                status = run_guest_worker(sys.argv[2])
            elif len(sys.argv) == 2 and sys.argv[1] == "--emit-images":
                status = emit_guest_page_images()
            else:
                require(len(sys.argv) == 1, "ARGUMENTS_REJECTED")
                status = run_guest_probe()
        raise SystemExit(status)
    except Exception as error:
        print(json.dumps({"passed": False, "failure": bounded_failure(error)}, sort_keys=True), file=sys.stderr)
        raise SystemExit(1) from None
