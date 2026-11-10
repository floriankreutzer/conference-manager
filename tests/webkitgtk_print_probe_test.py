"""Offline regression/progression checks; no GUI, network or system trust mutation."""
import contextlib
import importlib.util
from html.parser import HTMLParser
import io
import json
import os
from pathlib import Path
import shutil
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

SOURCE = Path(__file__).resolve().parents[1] / "scripts" / "probe-webkitgtk-print.py"
SPEC = importlib.util.spec_from_file_location("webkitgtk_probe", SOURCE)
PROBE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(PROBE)
PDF_INFO = "Pages: 2\nPage 1 size: 595.276 x 841.89 pts (A4)\nPage 2 size: 595.276 x 841.89 pts (A4)\n"


class DocumentParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.elements = []

    def handle_starttag(self, tag, attributes):
        self.elements.append((tag, dict(attributes)))


class PureBoundaryTests(unittest.TestCase):
    def test_both_languages_are_fixed_semantic_two_page_patterns(self):
        for language in ("de", "en"):
            with self.subTest(language=language):
                document = PROBE.synthetic_document(language, "https://conference.test:4173").decode()
                parser = DocumentParser()
                parser.feed(document)
                self.assertEqual(sum(tag == "section" for tag, _ in parser.elements), 2)
                self.assertEqual(sum(tag == "main" for tag, _ in parser.elements), 1)
                self.assertEqual([attrs["lang"] for tag, attrs in parser.elements if tag == "html"],
                                 [language])
                links = [attrs["href"] for tag, attrs in parser.elements if tag == "link"]
                self.assertEqual(links, ["https://conference.test:4173/assets/probe-base.css",
                                         "https://conference.test:4173/assets/probe-print.css"])
                self.assertFalse(any(tag in ("script", "style", "iframe", "form", "img")
                                     or "style" in attrs for tag, attrs in parser.elements))
                self.assertIn("default-src 'none'", document)
                self.assertIn("style-src-attr 'none'", document)
                self.assertNotIn("unsafe-inline", document)
                self.assertIn("CM-PROBE-" + language.upper() + "-2", document)

    def test_untrusted_document_parameters_are_rejected(self):
        for language, origin in [
            ("fr", "https://conference.test:4173"),
            ("de", "http://conference.test:4173"),
            ("en", "https://outside.invalid:4173"),
            ("de", "https://conference.test:65536"),
            ("de", "https://conference.test:4173/path"),
            ("de", 'https://conference.test:4173" onload="alert(1)'),
        ]:
            with self.subTest(language=language, origin=origin):
                with self.assertRaises(PROBE.ProbeError):
                    PROBE.synthetic_document(language, origin)

    def test_a4_requires_both_real_page_records(self):
        self.assertEqual(PROBE.inspect_pdf_info(PDF_INFO), {"pages": 2, "allPagesA4": True})
        for text in [
            PDF_INFO.replace("Pages: 2", "Pages: 1"),
            PDF_INFO.split("Page 2")[0],
            PDF_INFO.replace("595.276", "419.53"),
            PDF_INFO.replace("841.89", "595.276"),
            PDF_INFO.replace("Page 2", "Page 1"),
        ]:
            with self.subTest(text=text), self.assertRaises(PROBE.ProbeError):
                PROBE.inspect_pdf_info(text)

    def test_runtime_and_child_environment_fail_closed(self):
        environment = {
            "CI": "true", "GITHUB_ACTIONS": "true", "RUNNER_ENVIRONMENT": "github-hosted",
            "RUNNER_OS": "Linux", "ImageOS": "ubuntu26",
            "GITHUB_REPOSITORY": "floriankreutzer/conference-manager",
            "CM_PROBE_SOURCE_SHA": "a" * 40,
        }
        with patch.object(PROBE.os, "geteuid", return_value=1001):
            PROBE.runtime_guard(environment)
            for key in environment:
                with self.subTest(missing=key), self.assertRaises(PROBE.ProbeError):
                    PROBE.runtime_guard({name: value for name, value in environment.items() if name != key})
            with self.assertRaises(PROBE.ProbeError):
                PROBE.runtime_guard({**environment, "WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS": "1"})
        with patch.object(PROBE.os, "geteuid", return_value=0), self.assertRaises(PROBE.ProbeError):
            PROBE.runtime_guard(environment)
        child = PROBE.worker_environment({**environment, "GITHUB_TOKEN": "fixture",
                                           "SSL_CERT_FILE": "fixture", "UNRELATED": "fixture"})
        self.assertNotIn("GITHUB_TOKEN", child)
        self.assertNotIn("SSL_CERT_FILE", child)
        self.assertNotIn("UNRELATED", child)


class WorkerProtocolTests(unittest.TestCase):
    def successful_result(self, case):
        flag = PROBE.CASES[case][2]
        result = {"case": case, "passed": True, "sandboxEnabled": True, "tlsPolicy": "FAIL",
                  "webkit": "2.52.6", "phase": "tls-handshake" if flag else "print-operation",
                  "result": "TLS_REJECTED" if flag else "PRINT_FINISHED", "tlsFlags": flag}
        if not flag:
            result["sandbox"] = [{"noNewPrivileges": True, "seccompFilter": True,
                                   "mountNamespaceIsolated": True}]
        return result

    def parse(self, result, exit_code=0, stderr=b""):
        return PROBE.parse_worker_output("valid-de", exit_code, json.dumps(result).encode(), stderr)

    def test_all_six_valid_results_preserve_observations_without_native_stderr(self):
        for case in PROBE.CASES:
            with self.subTest(case=case):
                result = self.successful_result(case)
                observed = PROBE.parse_worker_output(case, 0, json.dumps(result).encode(),
                                                     b"private-path native warning")
                self.assertTrue(observed["passed"])
                for key, value in result.items():
                    self.assertEqual(observed[key], value)
                self.assertEqual(observed["exitCode"], 0)
                self.assertEqual(observed["stderrBytes"], 27)
                self.assertNotIn("private-path", json.dumps(observed))

    def test_early_initialization_error_uses_the_same_json_channel(self):
        def unavailable(_case, _port, _output, progress):
            progress["phase"] = "print-backend"
            raise TypeError("private native package path and message")

        stdout = io.StringIO()
        with patch.object(PROBE, "gtk_worker", side_effect=unavailable), contextlib.redirect_stdout(stdout):
            exit_code = PROBE.run_worker("unknown-ca", 4173, Path("unused"))
        observed = PROBE.parse_worker_output("unknown-ca", exit_code, stdout.getvalue().encode(), b"")
        self.assertFalse(observed["passed"])
        self.assertEqual(observed["exitCode"], 1)
        self.assertEqual(observed["phase"], "print-backend")
        self.assertEqual(observed["failure"], "TypeError")
        self.assertNotIn("private", stdout.getvalue())

    def test_emitted_positive_worker_result_remains_successful(self):
        stdout = io.StringIO()
        result = self.successful_result("valid-de")
        with patch.object(PROBE, "gtk_worker", return_value=result), contextlib.redirect_stdout(stdout):
            exit_code = PROBE.run_worker("valid-de", 4173, Path("unused"))
        observed = PROBE.parse_worker_output("valid-de", exit_code, stdout.getvalue().encode(), b"")
        self.assertTrue(observed["passed"])
        self.assertEqual(observed["result"], "PRINT_FINISHED")

    def test_error_codes_are_allowlisted_without_exception_messages(self):
        self.assertEqual(PROBE.worker_error_code(PROBE.ProbeError("TLS_POLICY_NOT_FAIL")),
                         "TLS_POLICY_NOT_FAIL")
        self.assertEqual(PROBE.worker_error_code(PROBE.ProbeError("private native path")),
                         "WORKER_EXCEPTION")
        self.assertEqual(PROBE.worker_error_code(type("PrivateExceptionName", (Exception,), {})()),
                         "WORKER_EXCEPTION")

    def test_invalid_empty_duplicate_and_multiple_json_answers_fail_closed(self):
        valid = json.dumps(self.successful_result("valid-de")).encode()
        for stdout, expected in [
            (b"", "WORKER_NO_RESULT"), (b" \n", "WORKER_NO_RESULT"),
            (b"\xff", "WORKER_JSON_INVALID"), (b"native warning\n" + valid, "WORKER_JSON_INVALID"),
            (valid + valid, "WORKER_JSON_INVALID"),
            (b'{"passed":false,"passed":true}', "WORKER_JSON_INVALID"),
            (b'{"tlsFlags":NaN}', "WORKER_JSON_INVALID"),
        ]:
            with self.subTest(stdout=stdout):
                observed = PROBE.parse_worker_output("valid-de", 0, stdout, b"")
                self.assertFalse(observed["passed"])
                self.assertEqual(observed["failure"], expected)
                self.assertEqual(observed["phase"], "protocol")

    def test_strict_schema_rejects_expansion_wrong_types_and_missing_security_evidence(self):
        valid = self.successful_result("valid-de")
        invalid = [None, [], True, {},
                   {**valid, "unexpected": "private native text"}, {**valid, "case": "valid-en"},
                   {**valid, "phase": []}, {**valid, "phase": "untrusted"},
                   {**valid, "passed": 1}, {**valid, "result": []}, {**valid, "tlsFlags": True},
                   {**valid, "tlsFlags": 1}, {**valid, "sandboxEnabled": False},
                   {**valid, "tlsPolicy": "IGNORE"}, {**valid, "webkit": "/private/path"},
                   {**valid, "sandbox": []}, {**valid, "sandbox": [{"noNewPrivileges": True}]},
                   {**valid, "sandbox": [{"noNewPrivileges": True, "seccompFilter": False,
                                          "mountNamespaceIsolated": True}]},
                   {key: value for key, value in valid.items() if key != "sandbox"},
                   {"case": "valid-de", "passed": False, "phase": "gtk-init", "failure": []},
                   {"case": "valid-de", "passed": False, "phase": "gtk-init", "failure": "private text"}]
        for result in invalid:
            with self.subTest(result=result):
                observed = self.parse(result)
                self.assertFalse(observed["passed"])
                self.assertEqual(observed["failure"], "WORKER_SCHEMA_INVALID")
                self.assertNotIn("private", json.dumps(observed))

    def test_negative_case_requires_its_own_actual_tls_flag(self):
        result = self.successful_result("unknown-ca")
        for flag in (0, 2):
            result["tlsFlags"] = flag
            observed = PROBE.parse_worker_output("unknown-ca", 0, json.dumps(result).encode(), b"")
            self.assertFalse(observed["passed"])
            self.assertEqual(observed["failure"], "WORKER_SCHEMA_INVALID")

    def test_exit_code_must_agree_with_result(self):
        success = self.successful_result("valid-de")
        failure = {"case": "valid-de", "passed": False, "phase": "gi-import", "failure": "ImportError"}
        for result, exit_code in [(success, 1), (success, 2), (success, -6), (success, False),
                                  (failure, 0), (failure, 2), (failure, -9)]:
            with self.subTest(exit_code=exit_code, passed=result["passed"]):
                observed = self.parse(result, exit_code)
                self.assertFalse(observed["passed"])
                self.assertEqual(observed["failure"], "WORKER_EXIT_MISMATCH")

    def test_oversize_output_never_enters_a_receipt(self):
        valid = json.dumps(self.successful_result("valid-de")).encode()
        for stdout, stderr in [(b"x" * (PROBE.WORKER_OUTPUT_LIMIT + 1), b""),
                               (valid, b"private" * 10_000)]:
            observed = PROBE.parse_worker_output("valid-de", 0, stdout, stderr)
            self.assertFalse(observed["passed"])
            self.assertEqual(observed["failure"], "WORKER_OUTPUT_BOUND")
            self.assertLessEqual(observed["stderrBytes"], PROBE.WORKER_OUTPUT_LIMIT + 1)
            self.assertNotIn("private", json.dumps(observed))

    def test_real_child_pipes_are_collected_without_native_text_in_the_result(self):
        with subprocess.Popen([sys.executable, "-c", "import sys; print('answer'); sys.stderr.write('native')"],
                              stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True) as child:
            stdout, stderr, failure = PROBE.collect_worker_output(child)
        self.assertEqual((stdout, stderr, failure, child.returncode), (b"answer\n", b"native", None, 0))
        observed = PROBE.parse_worker_output("unknown-ca", child.returncode, stdout, stderr, failure)
        self.assertEqual(observed["failure"], "WORKER_JSON_INVALID")
        self.assertNotIn("native", json.dumps(observed))

    def test_real_oversize_child_is_stopped_with_bounded_buffers(self):
        for stream in ("stdout", "stderr"):
            with self.subTest(stream=stream):
                code = "import sys; sys." + stream + ".buffer.write(b'x'*65536); sys." + stream + ".flush()"
                with subprocess.Popen([sys.executable, "-c", code], stdout=subprocess.PIPE,
                                      stderr=subprocess.PIPE, start_new_session=True) as child:
                    stdout, stderr, failure = PROBE.collect_worker_output(child)
                self.assertEqual(failure, "WORKER_OUTPUT_BOUND")
                self.assertLessEqual(len(stdout), PROBE.WORKER_OUTPUT_LIMIT + 1)
                self.assertLessEqual(len(stderr), PROBE.WORKER_OUTPUT_LIMIT + 1)
                self.assertIsNotNone(child.returncode)

    def test_existing_worker_deadline_stops_the_child_and_cannot_pass(self):
        with subprocess.Popen([sys.executable, "-c", "import sys; sys.stdin.read()"], stdin=subprocess.PIPE,
                              stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True) as child:
            with patch.object(PROBE.time, "monotonic", side_effect=[0, 36]):
                stdout, stderr, failure = PROBE.collect_worker_output(child)
        observed = PROBE.parse_worker_output("unknown-ca", child.returncode, stdout, stderr, failure)
        self.assertEqual(observed["failure"], "WORKER_DEADLINE")
        self.assertFalse(observed["passed"])
        self.assertIsNotNone(child.returncode)

    def test_deadline_stops_descendant_pipe_after_exited_worker_leader(self):
        descendant = "import sys; sys.stdin.buffer.read()"
        leader = ("import subprocess,sys; subprocess.Popen([sys.executable,'-c',"
                  + repr(descendant) + "]); print('spawned',flush=True)")
        with subprocess.Popen([sys.executable, "-c", leader], stdin=subprocess.PIPE,
                              stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True) as child:
            try:
                self.assertEqual(child.wait(timeout=5), 0)
                self.assertEqual(os.read(child.stdout.fileno(), 64), b"spawned\n")
                with PROBE.selectors.DefaultSelector() as ready:
                    ready.register(child.stdout, PROBE.selectors.EVENT_READ)
                    self.assertFalse(ready.select(0), "The descendant must still hold the inherited pipe")
                    with patch.object(PROBE.time, "monotonic", side_effect=[0, 36]):
                        stdout, stderr, failure = PROBE.collect_worker_output(child)
                    self.assertEqual(failure, "WORKER_DEADLINE")
                    self.assertEqual(child.returncode, 0, "The leader has already exited normally")
                    self.assertTrue(ready.select(2), "The deadline must close the descendant-held pipe")
                    self.assertEqual(os.read(child.stdout.fileno(), 1), b"")
                observed = PROBE.parse_worker_output("unknown-ca", child.returncode, stdout, stderr, failure)
                self.assertFalse(observed["passed"])
                self.assertEqual(observed["failure"], "WORKER_DEADLINE")
            finally:
                with contextlib.suppress(ProcessLookupError):
                    os.killpg(child.pid, PROBE.signal.SIGKILL)

    def test_abnormal_exit_without_json_is_preserved_as_a_failed_case(self):
        observed = PROBE.parse_worker_output("unknown-ca", -6, b"", b"native abort private path")
        self.assertEqual(observed["failure"], "WORKER_NO_RESULT")
        self.assertEqual(observed["exitCode"], -6)
        self.assertEqual(observed["phase"], "protocol")
        self.assertFalse(observed["passed"])
        self.assertNotIn("private", json.dumps(observed))


class CertificateFixtureTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temporary = tempfile.TemporaryDirectory(prefix="cm-gtk-unit-")
        cls.addClassCleanup(cls.temporary.cleanup)
        cls.directory = Path(cls.temporary.name)
        os.umask(0o077)
        PROBE.create_certificates(cls.directory)

    def verify(self, name, hostname):
        certificate = "unknown-ca.pem" if name == "unknown-ca" else name + ".crt"
        return subprocess.run(
            ["openssl", "verify", "-verify_hostname", hostname, "-CAfile",
             str(self.directory / "root.crt"), "-untrusted", str(self.directory / "issuer.crt"),
             str(self.directory / certificate)],
            capture_output=True, timeout=10, check=False,
        )

    def test_valid_leaf_has_a_real_trusted_chain(self):
        self.assertEqual(self.verify("valid", "conference.test").returncode, 0)
        self.assertFalse((self.directory / "root.key").exists())
        self.assertFalse((self.directory / "issuer.key").exists())

    def test_each_bad_leaf_fails_for_its_intended_reason(self):
        for name, hostname, reason in [
            ("unknown-ca", "conference.test", "self-signed"),
            ("wrong-san", "conference.test", "hostname mismatch"),
            ("expired", "conference.test", "certificate has expired"),
            ("name-constraint", "outside.invalid", "permitted subtree violation"),
        ]:
            with self.subTest(case=name):
                observed = self.verify(name, hostname)
                self.assertNotEqual(observed.returncode, 0)
                self.assertIn(reason, (observed.stdout + observed.stderr).decode().lower())

    def test_constraints_are_critical_in_root_and_intermediate(self):
        for name in ("root", "issuer"):
            text = subprocess.check_output(
                ["openssl", "x509", "-in", str(self.directory / (name + ".crt")),
                 "-noout", "-ext", "nameConstraints"], timeout=10,
            ).decode()
            self.assertIn("Name Constraints: critical", text)
            self.assertIn("DNS:conference.test", text)


class TrustCleanupTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="cm-gtk-cleanup-unit-")
        self.directory = Path(self.temporary.name)
        self.hosts = self.directory / "hosts"
        self.bundle = self.directory / "bundle"
        self.authorities = self.directory / "authorities"
        self.authorities.mkdir()
        self.hosts.write_bytes(b"127.0.0.1 localhost\n")
        self.bundle.write_bytes(b"original trust")
        (self.directory / "root.crt").write_bytes(b"synthetic certificate fixture")
        self.refreshes = 0
        self.fail_refresh = None
        self.patches = [
            patch.multiple(PROBE, HOSTS=self.hosts, CA_BUNDLE=self.bundle, CA_DIRECTORY=self.authorities),
            patch.object(PROBE, "command", side_effect=self.fake_command),
            patch.object(PROBE.socket, "getaddrinfo",
                         return_value=[(2, 1, 6, "", ("127.0.0.1", 0))]),
        ]
        for item in self.patches:
            item.start()

    def tearDown(self):
        for item in reversed(self.patches):
            item.stop()
        self.temporary.cleanup()

    def fake_command(self, arguments, **_options):
        self.assertEqual(arguments[:2], ["sudo", "-n"])
        if arguments[2] == "install":
            shutil.copyfile(arguments[-2], arguments[-1])
        elif arguments[2] == "rm":
            Path(arguments[-1]).unlink(missing_ok=True)
        elif arguments[2] == "update-ca-certificates":
            self.refreshes += 1
            if self.refreshes == self.fail_refresh:
                raise PROBE.ProbeError("REFRESH_FIXTURE_FAILURE")
            self.bundle.write_bytes(b"original trust" + b"".join(
                item.read_bytes() for item in sorted(self.authorities.glob("*.crt"))
            ))
        else:
            self.fail("Unexpected privileged operation")
        return b""

    def assert_restored(self, trust):
        self.assertTrue(trust.evidence["complete"])
        self.assertFalse(trust.certificate.exists())
        self.assertEqual(self.hosts.read_bytes(), b"127.0.0.1 localhost\n")
        self.assertEqual(self.bundle.read_bytes(), b"original trust")

    def test_normal_exit_restores_exact_original_state(self):
        trust = PROBE.TemporaryVmTrust(self.directory)
        with trust:
            self.assertTrue(trust.certificate.exists())
            self.assertIn(b"conference.test", self.hosts.read_bytes())
        self.assert_restored(trust)

    def test_body_failure_is_preserved_and_cleanup_still_runs(self):
        trust = PROBE.TemporaryVmTrust(self.directory)
        with self.assertRaisesRegex(PROBE.ProbeError, "ORIGINAL_FAILURE"):
            with trust:
                raise PROBE.ProbeError("ORIGINAL_FAILURE")
        self.assert_restored(trust)

    def test_rejected_worker_result_still_restores_original_trust(self):
        trust = PROBE.TemporaryVmTrust(self.directory)
        with self.assertRaisesRegex(PROBE.ProbeError, "WEBKIT_CASE_FAILED"):
            with trust:
                observed = PROBE.parse_worker_output("unknown-ca", 1, b"", b"private native failure")
                self.assertEqual(observed["failure"], "WORKER_NO_RESULT")
                PROBE.require(observed["passed"], "WEBKIT_CASE_FAILED")
        self.assert_restored(trust)

    def test_partial_install_failure_also_cleans_up(self):
        self.fail_refresh = 1
        trust = PROBE.TemporaryVmTrust(self.directory)
        with self.assertRaisesRegex(PROBE.ProbeError, "REFRESH_FIXTURE_FAILURE"):
            with trust:
                self.fail("The failed setup must never start a browser")
        self.assert_restored(trust)

    def test_cleanup_failure_cannot_pass(self):
        self.fail_refresh = 2
        trust = PROBE.TemporaryVmTrust(self.directory)
        with self.assertRaisesRegex(PROBE.ProbeError, "VM_TRUST_CLEANUP_FAILED"):
            with trust:
                pass
        self.assertFalse(trust.evidence["complete"])
        self.assertIn("TRUST_REFRESH", trust.evidence["failures"])

    def test_unrelated_hosts_change_is_not_overwritten(self):
        trust = PROBE.TemporaryVmTrust(self.directory)
        with self.assertRaisesRegex(PROBE.ProbeError, "VM_TRUST_CLEANUP_FAILED"):
            with trust:
                self.hosts.write_bytes(self.hosts.read_bytes() + b"127.0.0.1 unrelated.invalid\n")
        self.assertIn(b"unrelated.invalid", self.hosts.read_bytes())
        self.assertFalse(trust.evidence["complete"])


if __name__ == "__main__":
    unittest.main()
