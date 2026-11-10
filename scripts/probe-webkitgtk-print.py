#!/usr/bin/env python3
"""CO-317: synthetic WebKitGTK capability probe for one disposable hosted VM."""
import contextlib
import hashlib
import http.server
import json
import os
from pathlib import Path
import re
import secrets
import selectors
import signal
import socket
import ssl
import subprocess
import sys
import tempfile
import threading
import time

HOSTS = Path("/etc/hosts")
CA_DIRECTORY = Path("/usr/local/share/ca-certificates")
CA_BUNDLE = Path("/etc/ssl/certs/ca-certificates.crt")
CASES = {
    "unknown-ca": ("conference.test", "de", 1),
    "wrong-san": ("conference.test", "de", 2),
    "expired": ("conference.test", "de", 8),
    "name-constraint": ("outside.invalid", "de", 64),
    "valid-de": ("conference.test", "de", 0),
    "valid-en": ("conference.test", "en", 0),
}
WORKER_OUTPUT_LIMIT = 16_384
WORKER_PHASES = frozenset((
    "arguments", "gi-import", "gtk-init", "print-backend", "tls-policy",
    "sandbox-policy", "view-init", "navigation", "tls-handshake", "document",
    "sandbox-process", "print-settings", "print-operation", "cleanup",
))
WORKER_FAILURES = frozenset((
    "CASE_REJECTED", "WORKER_OUTPUT_REJECTED", "GTK_DISPLAY_UNAVAILABLE",
    "TLS_POLICY_NOT_FAIL", "SANDBOX_ENABLE_UNAVAILABLE", "NEGATIVE_CERTIFICATE_ACCEPTED",
    "TLS_UNVERIFIED", "SYNTHETIC_DOCUMENT_UNVERIFIED", "ACTUAL_WEBPROCESS_SANDBOX_UNVERIFIED",
    "STALE_PDF_REJECTED", "PRINT_OPERATION_UNAVAILABLE", "PROBE_INTERRUPTED",
    "PRINT_FAILED", "LOAD_FAILED", "WEBPROCESS_TERMINATED", "GTK_DEADLINE",
    "ModuleNotFoundError", "ImportError", "AttributeError", "TypeError", "ValueError",
    "PermissionError", "FileNotFoundError", "OSError", "RuntimeError", "KeyError",
    "WORKER_EXCEPTION",
))
NAME_CONSTRAINTS = (
    "critical,permitted;DNS:conference.test,"
    "excluded;IP:0.0.0.0/0.0.0.0,excluded;IP:0:0:0:0:0:0:0:0/0:0:0:0:0:0:0:0"
)
BASE_CSS = "body { font-family: sans-serif; } h1 { font-size: 18pt; }"
PRINT_CSS = "@page { size: A4; margin: 12mm; } section + section { break-before: page; }"


class ProbeError(RuntimeError):
    pass


def require(condition, code):
    if not condition:
        raise ProbeError(code)


def digest(data):
    return hashlib.sha256(data).hexdigest()


def command(arguments, timeout=20):
    """No shell; bounded subprocess group; never emit command output or secrets."""
    with subprocess.Popen(arguments, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                          start_new_session=True) as child:
        try:
            stdout, _stderr = child.communicate(timeout=timeout)
        except subprocess.TimeoutExpired:
            os.killpg(child.pid, signal.SIGKILL)
            child.wait()
            raise ProbeError("COMMAND_DEADLINE") from None
    require(child.returncode == 0, "COMMAND_FAILED_" + Path(arguments[0]).name)
    return stdout


def runtime_guard(environment):
    expected = {
        "CI": "true", "GITHUB_ACTIONS": "true", "RUNNER_ENVIRONMENT": "github-hosted",
        "RUNNER_OS": "Linux", "ImageOS": "ubuntu26",
        "GITHUB_REPOSITORY": "floriankreutzer/conference-manager",
    }
    require(all(environment.get(key) == value for key, value in expected.items()),
            "DISPOSABLE_PUBLIC_RUNNER_REQUIRED")
    require(os.geteuid() != 0, "BROWSER_MUST_NOT_RUN_AS_ROOT")
    require(re.fullmatch(r"[0-9a-f]{40}", environment.get("CM_PROBE_SOURCE_SHA", "")),
            "EXACT_SOURCE_REQUIRED")
    forbidden = ("WEBKIT_", "G_TLS_", "GNUTLS_", "SSL_CERT_", "LD_")
    require(not any(key.startswith(forbidden) for key in environment), "RUNTIME_OVERRIDE_REJECTED")


def worker_environment(environment):
    names = ("CI", "GITHUB_ACTIONS", "RUNNER_ENVIRONMENT", "RUNNER_OS", "ImageOS",
             "GITHUB_REPOSITORY", "CM_PROBE_SOURCE_SHA", "DISPLAY", "XAUTHORITY",
             "DBUS_SESSION_BUS_ADDRESS", "XDG_RUNTIME_DIR")
    return {"PATH": "/usr/bin:/bin", "LANG": "C.UTF-8", "LC_ALL": "C",
            **{name: environment[name] for name in names if name in environment}}


def worker_error_code(error):
    code = str(error) if isinstance(error, ProbeError) else type(error).__name__
    return code if code in WORKER_FAILURES else "WORKER_EXCEPTION"


def collect_worker_output(child):
    """Bound both pipes while reading; retain no raw native diagnostics in receipts."""
    buffers = {child.stdout: bytearray(), child.stderr: bytearray()}
    deadline = time.monotonic() + 35
    failure = None

    def stop():
        # Descendants can retain the pipes after their worker leader has exited.
        with contextlib.suppress(ProcessLookupError):
            os.killpg(child.pid, signal.SIGKILL)
        child.wait()

    try:
        with selectors.DefaultSelector() as selector:
            for stream in buffers:
                selector.register(stream, selectors.EVENT_READ)
            while selector.get_map() and failure is None:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    failure = "WORKER_DEADLINE"
                    break
                for key, _events in selector.select(remaining):
                    buffer = buffers[key.fileobj]
                    chunk = os.read(key.fd, min(4096, WORKER_OUTPUT_LIMIT + 1 - len(buffer)))
                    if not chunk:
                        selector.unregister(key.fileobj)
                    else:
                        buffer.extend(chunk)
                        if len(buffer) > WORKER_OUTPUT_LIMIT:
                            failure = "WORKER_OUTPUT_BOUND"
                            break
        if failure:
            stop()
        else:
            try:
                child.wait(timeout=max(0, deadline - time.monotonic()))
            except subprocess.TimeoutExpired:
                stop()
                failure = "WORKER_DEADLINE"
    except BaseException:
        stop()
        raise
    return bytes(buffers[child.stdout]), bytes(buffers[child.stderr]), failure


def parse_worker_output(case, exit_code, stdout, stderr, collection_failure=None):
    """Accept one exact result schema; malformed output can only produce a fixed failure."""
    require(case in CASES, "CASE_REJECTED")
    observation = {"case": case, "passed": False, "phase": "protocol",
                   "exitCode": exit_code if type(exit_code) is int and -64 <= exit_code <= 255 else None,
                   "stdoutBytes": min(len(stdout), WORKER_OUTPUT_LIMIT + 1),
                   "stderrBytes": min(len(stderr), WORKER_OUTPUT_LIMIT + 1)}

    def rejected(code):
        return {**observation, "failure": code}

    def unique_object(pairs):
        result = {}
        for key, value in pairs:
            if key in result:
                raise ValueError("DUPLICATE_KEY")
            result[key] = value
        return result

    def reject_constant(_value):
        raise ValueError("NON_JSON_CONSTANT")

    if collection_failure is not None:
        return rejected(collection_failure if collection_failure in (
            "WORKER_DEADLINE", "WORKER_OUTPUT_BOUND") else "WORKER_CAPTURE_FAILED")
    if len(stdout) > WORKER_OUTPUT_LIMIT or len(stderr) > WORKER_OUTPUT_LIMIT:
        return rejected("WORKER_OUTPUT_BOUND")
    if not stdout.strip():
        return rejected("WORKER_NO_RESULT")
    try:
        result = json.loads(stdout.decode("utf-8"), object_pairs_hook=unique_object,
                            parse_constant=reject_constant)
    except (ValueError, UnicodeError, RecursionError):
        return rejected("WORKER_JSON_INVALID")
    common = {"case", "passed", "phase"}
    valid = (type(result) is dict and result.get("case") == case
             and type(result.get("passed")) is bool and type(result.get("phase")) is str
             and result["phase"] in WORKER_PHASES)
    if not valid:
        return rejected("WORKER_SCHEMA_INVALID")
    if "failure" in result:
        valid = (set(result) == common | {"failure"} and result["passed"] is False
                 and type(result["failure"]) is str and result["failure"] in WORKER_FAILURES)
    else:
        required = common | {"sandboxEnabled", "tlsPolicy", "webkit", "result"}
        valid = (required <= set(result) <= required | {"tlsFlags", "sandbox"}
                 and result.get("sandboxEnabled") is True and result.get("tlsPolicy") == "FAIL"
                 and isinstance(result.get("webkit"), str)
                 and re.fullmatch(r"[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}", result["webkit"]) is not None
                 and type(result.get("result")) is str
                 and result["result"] in WORKER_FAILURES | {"TLS_REJECTED", "PRINT_FINISHED"})
        if "tlsFlags" in result:
            valid = valid and type(result["tlsFlags"]) is int and 0 <= result["tlsFlags"] <= 127
        if "sandbox" in result:
            valid = valid and type(result["sandbox"]) is list and bool(result["sandbox"]) and all(
                type(item) is dict and set(item) == {
                    "noNewPrivileges", "seccompFilter", "mountNamespaceIsolated"}
                and all(value is True for value in item.values()) for item in result["sandbox"])
        if valid and result["passed"]:
            flag = CASES[case][2]
            valid = ("tlsFlags" in result and (
                flag != 0 and result["result"] == "TLS_REJECTED" and result["phase"] == "tls-handshake"
                and bool(result["tlsFlags"] & flag)
                or flag == 0 and result["result"] == "PRINT_FINISHED" and result["phase"] == "print-operation"
                and result["tlsFlags"] == 0 and "sandbox" in result))
    if not valid:
        return rejected("WORKER_SCHEMA_INVALID")
    if type(exit_code) is not int or exit_code != (0 if result["passed"] else 1):
        return rejected("WORKER_EXIT_MISMATCH")
    return {**observation, **result}


def synthetic_document(language, origin):
    require(language in ("de", "en"), "LANGUAGE_REJECTED")
    require(re.fullmatch(r"https://conference\.test:[1-9][0-9]{0,4}", origin),
            "SYNTHETIC_ORIGIN_REJECTED")
    require(int(origin.rsplit(":", 1)[1]) <= 65535, "SYNTHETIC_ORIGIN_REJECTED")
    heading = {"de": "Druck-Testmuster", "en": "Print test pattern"}[language]
    policy = ("default-src 'none'; script-src 'none'; style-src "
              + origin + "/assets/probe-base.css " + origin + "/assets/probe-print.css;"
              " style-src-attr 'none'; img-src 'none'; font-src 'none'; connect-src 'none';"
              " base-uri 'none'; form-action 'none'; object-src 'none'")
    return (
        '<!doctype html><html lang="' + language + '"><head><meta charset="utf-8">'
        '<meta http-equiv="Content-Security-Policy" content="' + policy + '">'
        '<meta name="referrer" content="no-referrer"><title>CM probe ' + language + '</title>'
        '<link rel="stylesheet" href="' + origin + '/assets/probe-base.css">'
        '<link rel="stylesheet" href="' + origin + '/assets/probe-print.css">'
        '</head><body><main><section><h1>' + heading + '</h1><p>CM-PROBE-'
        + language.upper() + '-1</p></section><section><h2>' + heading
        + '</h2><p>CM-PROBE-' + language.upper() + '-2</p></section></main></body></html>'
    ).encode("utf-8")


def create_certificates(directory):
    """Fresh constrained chain; only its root is trusted; no keys enter evidence."""
    directory = Path(directory)
    root = directory / "root"
    issuer = directory / "issuer"
    subject = "/CN=CM GTK synthetic " + secrets.token_hex(12)
    command(["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
             "-subj", subject, "-keyout", str(root) + ".key", "-out", str(root) + ".crt",
             "-addext", "basicConstraints=critical,CA:TRUE,pathlen:1",
             "-addext", "keyUsage=critical,keyCertSign,cRLSign",
             "-addext", "nameConstraints=" + NAME_CONSTRAINTS])
    command(["openssl", "req", "-newkey", "rsa:2048", "-nodes", "-subj", subject + " issuer",
             "-keyout", str(issuer) + ".key", "-out", str(issuer) + ".csr"])
    extensions = directory / "issuer.cnf"
    extensions.write_text("basicConstraints=critical,CA:TRUE,pathlen:0\n"
                          "keyUsage=critical,keyCertSign,cRLSign\n"
                          "subjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid,issuer\n"
                          "nameConstraints=" + NAME_CONSTRAINTS + "\n")
    command(["openssl", "x509", "-req", "-in", str(issuer) + ".csr",
             "-CA", str(root) + ".crt", "-CAkey", str(root) + ".key", "-CAcreateserial",
             "-days", "1", "-extfile", str(extensions), "-out", str(issuer) + ".crt"])
    (directory / "index").write_text("")
    (directory / "serial").write_text("1000\n")
    config = directory / "ca.cnf"
    config.write_text(
        "[ca]\ndefault_ca=local\n[local]\ndatabase=" + str(directory / "index")
        + "\nserial=" + str(directory / "serial") + "\nnew_certs_dir=" + str(directory)
        + "\ncertificate=" + str(issuer) + ".crt\nprivate_key=" + str(issuer)
        + ".key\ndefault_md=sha256\ndefault_days=1\nunique_subject=no\npolicy=policy\n"
        "[policy]\ncommonName=supplied\n"
    )
    command(["openssl", "req", "-newkey", "rsa:2048", "-nodes", "-subj", "/CN=CM fixture",
             "-keyout", str(directory / "leaf.key"), "-out", str(directory / "leaf.csr")])
    for name, hostname in (("valid", "conference.test"), ("wrong-san", "other.conference.test"),
                           ("expired", "conference.test"), ("name-constraint", "outside.invalid")):
        leaf_extensions = directory / "leaf.cnf"
        leaf_extensions.write_text(
            "[leaf]\nbasicConstraints=critical,CA:FALSE\n"
            "keyUsage=critical,digitalSignature,keyEncipherment\nextendedKeyUsage=serverAuth\n"
            "subjectKeyIdentifier=hash\nauthorityKeyIdentifier=keyid,issuer\n"
            "subjectAltName=DNS:" + hostname + "\n"
        )
        arguments = ["openssl", "ca", "-batch", "-config", str(config), "-extfile",
                     str(leaf_extensions), "-extensions", "leaf", "-in",
                     str(directory / "leaf.csr"), "-out", str(directory / (name + ".crt")),
                     "-notext"]
        if name == "expired":
            arguments += ["-startdate", "20200101000000Z", "-enddate", "20200102000000Z"]
        command(arguments)
        (directory / (name + ".pem")).write_bytes(
            (directory / (name + ".crt")).read_bytes() + (directory / "issuer.crt").read_bytes()
        )
    command(["openssl", "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "1",
             "-subj", "/CN=CM unknown fixture", "-keyout", str(directory / "unknown-ca.key"),
             "-out", str(directory / "unknown-ca.pem"),
             "-addext", "basicConstraints=critical,CA:FALSE",
             "-addext", "subjectAltName=DNS:conference.test"])
    # Signing keys are unnecessary once the fixed leaves have been issued.
    (directory / "root.key").unlink()
    (directory / "issuer.key").unlink()


class TemporaryVmTrust:
    """Same install/finally/remove/refresh pattern as test-hosted-transport.mjs."""
    def __init__(self, directory):
        self.directory = Path(directory)
        self.certificate = CA_DIRECTORY / ("cm-gtk-probe-" + secrets.token_hex(16) + ".crt")
        self.original_hosts = HOSTS.read_bytes()
        self.original_bundle = digest(CA_BUNDLE.read_bytes())
        require(not HOSTS.is_symlink(), "HOSTS_SYMLINK_REJECTED")
        require(not re.search(rb"(?<![\w.-])(?:conference\.test|outside\.invalid)(?![\w.-])",
                              self.original_hosts), "HOST_ALREADY_CONFIGURED")
        require(not self.certificate.exists(), "CA_ALREADY_EXISTS")
        self.expected_hosts = self.original_hosts + b"\n127.0.0.1 conference.test outside.invalid\n"
        self.installed = False
        self.hosts_written = False
        self.evidence = {"complete": False, "failures": []}

    def __enter__(self):
        try:
            self.installed = True
            command(["sudo", "-n", "install", "-m", "0644",
                     str(self.directory / "root.crt"), str(self.certificate)])
            command(["sudo", "-n", "update-ca-certificates"])
            prepared = self.directory / "hosts.probe"
            prepared.write_bytes(self.expected_hosts)
            self.hosts_written = True
            command(["sudo", "-n", "install", "-m", "0644", str(prepared), str(HOSTS)])
            require(HOSTS.read_bytes() == self.expected_hosts, "HOSTS_WRITE_UNVERIFIED")
            for hostname in ("conference.test", "outside.invalid"):
                addresses = {item[4][0] for item in socket.getaddrinfo(hostname, None, socket.AF_INET)}
                require(addresses == {"127.0.0.1"}, "LOOPBACK_RESOLUTION_REQUIRED")
            return self
        except BaseException:
            self.cleanup()
            raise

    def cleanup(self):
        failures = []
        operations = []
        if self.installed:
            operations += [
                ("CA_REMOVE", ["sudo", "-n", "rm", "-f", "--", str(self.certificate)]),
                ("TRUST_REFRESH", ["sudo", "-n", "update-ca-certificates"]),
            ]
        for label, arguments in operations:
            try:
                command(arguments)
            except Exception:
                failures.append(label)
        if self.hosts_written:
            try:
                current = HOSTS.read_bytes()
                require(current in (self.original_hosts, self.expected_hosts), "HOSTS_CHANGED")
                restore = self.directory / "hosts.restore"
                restore.write_bytes(self.original_hosts)
                command(["sudo", "-n", "install", "-m", "0644", str(restore), str(HOSTS)])
            except Exception:
                failures.append("HOSTS_RESTORE")
        try:
            require(not self.certificate.exists(), "CA_REMAINS")
            require(HOSTS.read_bytes() == self.original_hosts, "HOSTS_NOT_RESTORED")
            require(digest(CA_BUNDLE.read_bytes()) == self.original_bundle, "TRUST_NOT_RESTORED")
        except Exception:
            failures.append("READBACK")
        self.evidence.update(complete=not failures, failures=failures,
                             originalTrustSha256=self.original_bundle)
        return not failures

    def __exit__(self, exception_type, exception, traceback):
        cleaned = self.cleanup()
        if not cleaned and exception is None:
            raise ProbeError("VM_TRUST_CLEANUP_FAILED")
        return False


@contextlib.contextmanager
def serve_fixture(directory, case):
    hostname, language, _ = CASES[case]
    certificate = "valid" if case.startswith("valid-") else case
    key = "unknown-ca.key" if case == "unknown-ca" else "leaf.key"
    requests = []
    tls = ssl.SSLContext(ssl.PROTOCOL_TLS_SERVER)
    tls.minimum_version = ssl.TLSVersion.TLSv1_2
    tls.load_cert_chain(str(directory / (certificate + ".pem")), str(directory / key))

    class Handler(http.server.BaseHTTPRequestHandler):
        def log_message(self, _format, *arguments):
            pass

        def do_GET(self):
            requests.append(self.path)
            origin = "https://conference.test:" + str(self.server.server_port)
            resources = {"/": ("text/html; charset=utf-8", synthetic_document(language, origin)),
                         "/assets/probe-base.css": ("text/css", BASE_CSS.encode()),
                         "/assets/probe-print.css": ("text/css", PRINT_CSS.encode())}
            allowed = (len(requests) <= 16 and self.path in resources
                       and self.headers.get("Host") == hostname + ":" + str(self.server.server_port))
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
            connection, address = self.socket.accept()
            connection.settimeout(5)
            try:
                return tls.wrap_socket(connection, server_side=True), address
            except BaseException:
                connection.close()
                raise

        def handle_error(self, _request, _address):
            pass

    server = Server(("127.0.0.1", 0), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield server.server_port, requests
    finally:
        server.shutdown()
        server.server_close()
        thread.join(timeout=2)
        require(not thread.is_alive(), "SERVER_CLEANUP_FAILED")


def sandbox_evidence():
    """Observe a real descendant WebProcess; configuration alone is insufficient."""
    processes = {}
    for entry in Path("/proc").iterdir():
        if not entry.name.isdecimal():
            continue
        try:
            values = dict(line.split(":", 1) for line in (entry / "status").read_text().splitlines())
            processes[int(entry.name)] = (int(values["PPid"].strip()), values, entry)
        except (OSError, ValueError, KeyError):
            continue
    descendants = {os.getpid()}
    for _ in range(16):
        descendants |= {pid for pid, (parent, _, _) in processes.items() if parent in descendants}
    observations = []
    own_namespace = os.readlink("/proc/self/ns/mnt")
    for pid, (_, values, entry) in processes.items():
        if pid not in descendants or not values.get("Name", "").strip().startswith("WebKitWeb"):
            continue
        observations.append({
            "noNewPrivileges": values.get("NoNewPrivs", "").strip() == "1",
            "seccompFilter": values.get("Seccomp", "").strip() == "2",
            "mountNamespaceIsolated": os.readlink(entry / "ns/mnt") != own_namespace,
        })
    require(bool(observations) and all(all(item.values()) for item in observations),
            "ACTUAL_WEBPROCESS_SANDBOX_UNVERIFIED")
    return observations


def gtk_worker(case, port, output, progress):
    require(case in CASES and 1 <= port <= 65535, "CASE_REJECTED")
    expected_output = Path.cwd().resolve() / "test-results" / "webkitgtk-probe"
    require(output == expected_output and output.is_dir() and not output.is_symlink(),
            "WORKER_OUTPUT_REJECTED")
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
    hostname, language, expected_flag = CASES[case]
    uri = "https://" + hostname + ":" + str(port) + "/"
    result = {"case": case, "passed": False, "sandboxEnabled": True, "tlsPolicy": "FAIL",
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
        finish(failing_uri == uri and bool(expected_flag) and bool(int(flags) & expected_flag),
               "TLS_REJECTED")
        return False

    def loaded(_view, event):
        if finished or event != WebKit2.LoadEvent.FINISHED:
            return
        try:
            progress["phase"] = "document"
            require(expected_flag == 0, "NEGATIVE_CERTIFICATE_ACCEPTED")
            secure, certificate, flags = view.get_tls_info()
            require(secure and certificate is not None and int(flags) == 0, "TLS_UNVERIFIED")
            require(view.get_title() == "CM probe " + language, "SYNTHETIC_DOCUMENT_UNVERIFIED")
            progress["phase"] = "sandbox-process"
            result.update(tlsFlags=0, sandbox=sandbox_evidence())
            progress["phase"] = "print-settings"
            pdf = output / (language + ".pdf")
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
            finish(False, worker_error_code(error))

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


def run_worker(case, port, output):
    require(case in CASES, "CASE_REJECTED")
    progress = {"phase": "arguments"}
    try:
        result = gtk_worker(case, port, output, progress)
    except Exception as error:
        result = {"case": case, "passed": False, "phase": progress["phase"],
                  "failure": worker_error_code(error)}
    print(json.dumps(result, sort_keys=True))
    return 0 if result["passed"] else 1


def inspect_pdf_info(text):
    count = re.search(r"^Pages:\s+(\d+)\s*$", text, re.MULTILINE)
    sizes = re.findall(r"^Page\s+(\d+)\s+size:\s+([\d.]+)\s+x\s+([\d.]+)\s+pts",
                       text, re.MULTILINE)
    require(count is not None and count.group(1) == "2", "PDF_PAGE_COUNT")
    require([item[0] for item in sizes] == ["1", "2"], "ALL_PDF_PAGES_REQUIRED")
    require(all(abs(float(width) - 595.276) < 1 and abs(float(height) - 841.890) < 1
                for _, width, height in sizes), "PDF_NOT_A4")
    return {"pages": 2, "allPagesA4": True}


def inspect_pdf(output, language):
    path = output / (language + ".pdf")
    data = path.read_bytes()
    require(not path.is_symlink() and 64 < len(data) < 2_000_000 and data.startswith(b"%PDF-"),
            "PDF_FILE_INVALID")
    result = inspect_pdf_info(command(["pdfinfo", "-f", "1", "-l", "2", "-box", str(path)]).decode())
    text = command(["pdftotext", "-enc", "UTF-8", "-layout", str(path), "-"]).decode("utf-8")
    require(all("CM-PROBE-" + language.upper() + "-" + str(page) in text for page in (1, 2)),
            "PDF_TEXT_INCOMPLETE")
    for page in (1, 2):
        page_text = command(["pdftotext", "-f", str(page), "-l", str(page),
                             "-enc", "UTF-8", str(path), "-"]).decode("utf-8")
        require("CM-PROBE-" + language.upper() + "-" + str(page) in page_text,
                "PDF_PAGE_TEXT_INCOMPLETE")
        stem = output / (language + "-page-" + str(page))
        command(["pdftoppm", "-f", str(page), "-l", str(page), "-r", "36", "-png",
                 "-singlefile", str(path), str(stem)])
        image = stem.with_suffix(".png").read_bytes()
        require(len(image) > 64 and image.startswith(b"\x89PNG\r\n\x1a\n"), "PDF_RENDER_FAILED")
    result.update(sha256=digest(data), bytes=len(data), syntheticTextPresent=True)
    return result


def run_probe():
    runtime_guard(os.environ)
    os.umask(0o077)
    require(command(["git", "rev-parse", "HEAD"]).decode().strip() == os.environ["CM_PROBE_SOURCE_SHA"],
            "CHECKOUT_SOURCE_MISMATCH")
    root = Path.cwd().resolve()
    parent = root / "test-results"
    require(not parent.is_symlink(), "OUTPUT_PARENT_SYMLINK")
    parent.mkdir(exist_ok=True)
    output = parent / "webkitgtk-probe"
    require(not output.exists() and not output.is_symlink(), "FRESH_OUTPUT_REQUIRED")
    output.mkdir(mode=0o700)
    receipt = {"schemaVersion": 1, "scope": "synthetic-capability-only", "productAcceptance": False,
               "sourceSha": os.environ["CM_PROBE_SOURCE_SHA"],
               "treeSha": command(["git", "rev-parse", "HEAD^{tree}"]).decode().strip(),
               "scriptSha256": digest(Path(__file__).read_bytes()),
               "runnerImage": os.environ.get("ImageVersion", "unknown"),
               "passed": False, "cases": [], "pdfs": {}, "cleanup": {"complete": False}}
    trust = None
    try:
        package_format = "-f=" + "$" + "{Package}=" + "$" + "{Version}\n"
        receipt["packages"] = command([
            "dpkg-query", "-W", package_format, "gir1.2-webkit2-4.1",
            "libwebkit2gtk-4.1-0", "libgtk-3-0t64", "python3-gi", "poppler-utils",
        ]).decode().splitlines()
        with tempfile.TemporaryDirectory(prefix="cm-gtk-probe-") as temporary:
            directory = Path(temporary)
            create_certificates(directory)
            trust = TemporaryVmTrust(directory)
            try:
                with trust:
                    for case in CASES:
                        with serve_fixture(directory, case) as (port, requests):
                            arguments = ["/usr/bin/python3", str(Path(__file__).resolve()),
                                         "--worker", case, str(port), str(output)]
                            with subprocess.Popen(arguments, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                                                  start_new_session=True, env=worker_environment(os.environ)) as child:
                                stdout, stderr, collection_failure = collect_worker_output(child)
                            observed = parse_worker_output(case, child.returncode, stdout, stderr,
                                                           collection_failure)
                            receipt["cases"].append(observed)
                            require(child.returncode == 0 and observed.get("passed") is True,
                                    "WEBKIT_CASE_FAILED")
                            expected = {"/", "/assets/probe-base.css", "/assets/probe-print.css"}
                            require(set(requests) == (expected if case.startswith("valid-") else set()),
                                    "REQUEST_BOUNDARY_FAILED")
                            if case.startswith("valid-"):
                                receipt["pdfs"][CASES[case][1]] = inspect_pdf(output, CASES[case][1])
            finally:
                receipt["cleanup"] = trust.evidence
        require(receipt["cleanup"]["complete"], "CLEANUP_UNVERIFIED")
        receipt["passed"] = True
    except BaseException as error:
        receipt["failure"] = str(error) if isinstance(error, ProbeError) else type(error).__name__
        if trust is not None:
            receipt["cleanup"] = trust.evidence
    finally:
        (output / "receipt.json").write_text(json.dumps(receipt, indent=2, sort_keys=True) + "\n")
    return 0 if receipt["passed"] else 1


def interrupted(_signal, _frame):
    raise ProbeError("PROBE_INTERRUPTED")


if __name__ == "__main__":
    try:
        runtime_guard(os.environ)
        signal.signal(signal.SIGTERM, interrupted)
        signal.signal(signal.SIGINT, interrupted)
        signal.signal(signal.SIGALRM, interrupted)
        signal.alarm(300)
        if len(sys.argv) == 5 and sys.argv[1] == "--worker":
            status = run_worker(sys.argv[2], int(sys.argv[3]), Path(sys.argv[4]).resolve())
        else:
            require(len(sys.argv) == 1, "ARGUMENTS_REJECTED")
            status = run_probe()
        raise SystemExit(status)
    except Exception as error:
        code = str(error) if isinstance(error, ProbeError) else type(error).__name__
        print(json.dumps({"passed": False, "failure": code}), file=sys.stderr)
        raise SystemExit(1) from None
