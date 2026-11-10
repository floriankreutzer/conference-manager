"""Offline regression/progression checks; no GUI, network or system trust mutation."""
import importlib.util
from html.parser import HTMLParser
import os
from pathlib import Path
import shutil
import subprocess
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
