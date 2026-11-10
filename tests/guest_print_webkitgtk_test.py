"""Offline H boundaries; no real GUI, network, privilege or host-trust mutation."""
import contextlib
import copy
import errno
import hashlib
import html
import importlib.util
import io
import json
import os
from pathlib import Path
import tempfile
import unittest
from unittest.mock import MagicMock, patch

SOURCE = Path(__file__).resolve().parents[1] / "scripts" / "probe-webkitgtk-guest-print.py"
SPEC = importlib.util.spec_from_file_location("cm_guest_print_test", SOURCE)
H = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(H)
BINDING = {"productSourceSha": "a" * 40, "productTreeSha": "b" * 40,
           "captureSourceSha": "c" * 40, "captureTreeSha": "d" * 40}
FIELDS = ["A private event", "Public room", "Public site", "Public address", "Public building",
          "Public city", "Public reception", "guest@example.test", "+49 30 555 0100",
          "Credentials provided on arrival"]
ENVIRONMENT = {
    "CI": "true", "GITHUB_ACTIONS": "true", "RUNNER_ENVIRONMENT": "github-hosted",
    "RUNNER_OS": "Linux", "ImageOS": "ubuntu26", "GITHUB_REPOSITORY": "floriankreutzer/conference-manager",
    "CM_PROBE_SOURCE_SHA": "c" * 40, "CM_GUEST_PRODUCT_SOURCE_SHA": "a" * 40,
}


def public_document(language):
    return ('<!DOCTYPE html>\n<html lang="' + language + '"><head><meta charset="utf-8">'
            '<meta name="viewport" content="width=device-width, initial-scale=1">'
            '<meta name="referrer" content="no-referrer">'
            '<meta http-equiv="Content-Security-Policy" content="' + html.escape(H.CSP, quote=True) + '">'
            '<title>Public guest information</title>'
            + "".join('<link rel="stylesheet" href="' + H.ORIGIN + '/' + name + '">' for name in H.STYLES)
            + '</head><body class="guest-print-document"><button type="button" class="print-action">Print</button>'
            '<header><h1>' + html.escape(FIELDS[0]) + '</h1></header><main>'
            + "".join("<p>" + html.escape(value) + "</p>" for value in FIELDS[1:])
            + '<a href="https://www.openstreetmap.org/" target="_blank" rel="noopener noreferrer">Route</a>'
            '</main></body></html>')


class CaptureTests(unittest.TestCase):
    def setUp(self):
        self.temporary = tempfile.TemporaryDirectory(prefix="cm-h-offline-")
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.css = {name: ("/* public original " + name + " */\n").encode() for name in H.STYLES}

    def fixture(self, case):
        directory = self.root / case
        directory.mkdir()
        language, project = case[-2:], case[:-3]
        source = public_document(language).encode()
        (directory / "document.html").write_bytes(source)
        styles = []
        for name, data in self.css.items():
            (directory / Path(name).name).write_bytes(data)
            styles.append({
                "sourcePath": name, "url": H.ORIGIN + "/" + name, "file": Path(name).name,
                "bytes": len(data), "sha256": H.PROBE.digest(data),
                "gitBlob": hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest(),
            })
        manifest = {
            "schemaVersion": 1, "scope": "actual-guest-dom-capture", "productAcceptance": False,
            **BINDING, "project": project, "browserName": "chromium" if project == H.PROJECTS[0] else "webkit",
            "browserVersion": "26.0", "playwrightVersion": "1.64.1", "language": language,
            "testTitle": "CO-317: EMP-14 EMP-15 bounded public content keeps every field in multipage A4 and print CSS in " + language,
            "document": {"file": "document.html", "url": H.DOCUMENT_URL, "sha256": H.PROBE.digest(source),
                         "bytes": len(source), "title": "Public guest information", "csp": H.CSP},
            "styles": styles, "expectedPublicFields": FIELDS.copy(), "privacyChecks": H.PRIVACY_CHECKS.copy(),
        }
        self.save(directory, manifest)
        return directory, manifest

    @staticmethod
    def save(directory, manifest, source=None):
        if source is not None:
            data = source.encode()
            (directory / "document.html").write_bytes(data)
            manifest["document"].update(bytes=len(data), sha256=H.PROBE.digest(data))
        (directory / "manifest.json").write_text(json.dumps(manifest), encoding="utf-8")

    def validate(self, directory, case):
        return H.validate_capture(directory, case, BINDING, self.css.__getitem__)

    def test_four_original_engine_language_cases_keep_exact_resources(self):
        for case in H.CAPTURE_CASES:
            with self.subTest(case=case):
                directory, manifest = self.fixture(case)
                observed, resources = self.validate(directory, case)
                self.assertEqual(observed, manifest)
                self.assertEqual(set(resources), {H.DOCUMENT_PATH, "/assets/tokens.css", "/assets/employee-ux.css"})
                self.assertEqual(resources[H.DOCUMENT_PATH][1], (directory / "document.html").read_bytes())

    def test_manifest_scope_source_language_paths_and_inventory_are_not_relaxed(self):
        case = H.CAPTURE_CASES[0]
        directory, original = self.fixture(case)
        mutations = [
            lambda value: value.update(productSourceSha="f" * 40),
            lambda value: value.update(language="fr"),
            lambda value: value.update(project="webkit-mobile"),
            lambda value: value.update(productAcceptance=True),
            lambda value: value.update(schemaVersion=True),
            lambda value: value.update(expectedPublicFields=FIELDS[:-1]),
            lambda value: value.update(privacyChecks=H.PRIVACY_CHECKS[:-1]),
            lambda value: value.update(extra="untrusted"),
            lambda value: value["document"].update(url=H.DOCUMENT_URL.replace("conference.test", "conference.test:4443")),
            lambda value: value["document"].update(file="../document.html"),
            lambda value: value["styles"].reverse(),
        ]
        for mutate in mutations:
            with self.subTest(mutate=mutate):
                manifest = copy.deepcopy(original)
                mutate(manifest)
                self.save(directory, manifest)
                with self.assertRaises(H.PROBE.ProbeError):
                    self.validate(directory, case)

    def test_css_rehash_cannot_substitute_an_altered_product_blob(self):
        case = H.CAPTURE_CASES[0]
        directory, manifest = self.fixture(case)
        data = b"body { color: red; }\n"
        (directory / "tokens.css").write_bytes(data)
        manifest["styles"][0].update(bytes=len(data), sha256=H.PROBE.digest(data),
            gitBlob=hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest())
        self.save(directory, manifest)
        with self.assertRaisesRegex(H.PROBE.ProbeError, "CAPTURE_STYLE_SOURCE"):
            self.validate(directory, case)

    def test_active_markup_extra_policy_and_invalid_nesting_are_rejected(self):
        case = H.CAPTURE_CASES[0]
        directory, original = self.fixture(case)
        initial = public_document("de")
        changes = [
            initial.replace("</body>", "<script>1</script></body>"),
            initial.replace("</body>", "<style>body{}</style></body>"),
            initial.replace("</body>", "<iframe></iframe></body>"),
            initial.replace("</head>", '<meta http-equiv="refresh" content="0"></head>'),
            initial.replace("</head>", '<link rel="stylesheet" href="https://outside.invalid/a.css"></head>'),
            initial.replace("<main>", '<main style="color:red">'),
            initial.replace("<main>", '<main onclick="alert(1)">'),
            initial.replace("<header>", "<head>").replace("</header>", "</head>"),
        ]
        for source in changes:
            with self.subTest(source=source[-80:]):
                manifest = copy.deepcopy(original)
                self.save(directory, manifest, source)
                with self.assertRaises(H.PROBE.ProbeError):
                    self.validate(directory, case)

    def test_six_original_privacy_fields_are_rejected_without_banning_public_private_word(self):
        case = H.CAPTURE_CASES[0]
        directory, original = self.fixture(case)
        self.validate(directory, case)
        initial = public_document("de")
        for private in H.PRIVATE_FIXTURES:
            for source in (
                initial.replace("</main>", "<p>" + private + "</p></main>"),
                initial.replace("<header>", '<header class="' + private + '">'),
            ):
                manifest = copy.deepcopy(original)
                self.save(directory, manifest, source)
                with self.assertRaises(H.PROBE.ProbeError):
                    self.validate(directory, case)

    def test_duplicate_json_oversize_and_symlink_inputs_fail_closed(self):
        case = H.CAPTURE_CASES[0]
        directory, manifest = self.fixture(case)
        with self.assertRaises(H.PROBE.ProbeError):
            H.strict_json('{"a":1,"a":2}')
        with self.assertRaises(H.PROBE.ProbeError):
            H.strict_json('{"a":NaN}')
        (directory / "manifest.json").write_bytes(b"x" * 32_769)
        with self.assertRaises(H.PROBE.ProbeError):
            self.validate(directory, case)
        self.save(directory, manifest)
        link = directory / "tokens.css"
        link.unlink()
        target = self.root / "external.css"
        target.write_bytes(self.css[H.STYLES[0]])
        link.symlink_to(target)
        with self.assertRaises(H.PROBE.ProbeError):
            self.validate(directory, case)


    def test_capture_inventory_requires_exactly_four_original_cases(self):
        for case in H.CAPTURE_CASES:
            self.fixture(case)
        with patch.object(H, "CAPTURES", self.root), patch.object(H, "ROOT", self.root), \
                patch.object(H, "git", side_effect=lambda _show, name: self.css[name.split(":", 1)[1]]):
            for case in H.CAPTURE_CASES:
                H.load_capture(case, BINDING)
            first = self.root / H.CAPTURE_CASES[0]
            renamed = self.root / "unexpected-case"
            first.rename(renamed)
            with self.assertRaisesRegex(H.PROBE.ProbeError, "CAPTURE_INVENTORY"):
                H.load_capture(H.CAPTURE_CASES[0], BINDING)
            renamed.rename(first)
            (self.root / "unrequested-data").write_text("not captured")
            with self.assertRaisesRegex(H.PROBE.ProbeError, "CAPTURE_INVENTORY"):
                H.load_capture(H.CAPTURE_CASES[0], BINDING)


class PrivilegeTests(unittest.TestCase):
    @contextlib.contextmanager
    def identity(self, reversible=False, saved_root=False):
        state = {"uid": (0, 0, 0), "gid": (0, 0, 0), "groups": [0]}
        calls = []

        def groups(values):
            calls.append(("groups", values))
            state["groups"] = values

        def gids(*values):
            calls.append(("gids", values))
            state["gid"] = values

        def uids(*values):
            calls.append(("uids", values))
            state["uid"] = (values[0], values[1], 0) if saved_root else values

        def regain(value):
            calls.append(("regain", value))
            if reversible:
                state["uid"] = (0, 0, 0)
                return
            raise PermissionError

        with patch.dict(H.os.environ, {"SUDO_UID": "1001", "SUDO_GID": "1002"}, clear=True), \
                patch.object(H.os, "geteuid", side_effect=lambda: state["uid"][1]), \
                patch.object(H.os, "getegid", side_effect=lambda: state["gid"][1]), \
                patch.object(H.os, "getresuid", side_effect=lambda: state["uid"]), \
                patch.object(H.os, "getresgid", side_effect=lambda: state["gid"]), \
                patch.object(H.os, "getgroups", side_effect=lambda: state["groups"]), \
                patch.object(H.os, "setgroups", side_effect=groups), \
                patch.object(H.os, "setresgid", side_effect=gids), \
                patch.object(H.os, "setresuid", side_effect=uids), \
                patch.object(H.os, "setuid", side_effect=regain):
            yield state, calls

    def test_drop_removes_groups_then_all_group_and_user_ids_and_cannot_regain_root(self):
        with self.identity() as (state, calls):
            H.drop_server_privileges(1001, 1002)
            self.assertEqual(calls, [("groups", []), ("gids", (1002, 1002, 1002)),
                                    ("uids", (1001, 1001, 1001)), ("regain", 0)])
            self.assertEqual(state["groups"], [])

    def test_wrong_original_identity_or_root_destination_does_not_change_ids(self):
        for uid, gid in ((0, 1002), (1001, 0), (1003, 1002), (True, 1002)):
            with self.subTest(uid=uid, gid=gid), self.identity() as (_state, calls):
                with self.assertRaises(H.PROBE.ProbeError):
                    H.drop_server_privileges(uid, gid)
                self.assertEqual(calls, [])

    def test_reversible_or_saved_root_state_cannot_pass(self):
        for settings in ({"reversible": True}, {"saved_root": True}):
            with self.subTest(settings=settings), self.identity(**settings):
                with self.assertRaises(H.PROBE.ProbeError):
                    H.drop_server_privileges(1001, 1002)

    def test_fixed_loopback_bind_precedes_drop_and_collision_has_no_fallback(self):
        listener = MagicMock()
        order = []
        listener.bind.side_effect = lambda address: order.append(("bind", address))
        with patch.dict(H.os.environ, {**ENVIRONMENT, "UNTRUSTED_EXTRA": "discard"}, clear=True), \
                patch.object(H.socket, "socket", return_value=listener), \
                patch.object(H, "drop_server_privileges", side_effect=lambda uid, gid: order.append(("drop", uid, gid))), \
                patch.object(H.PROBE, "runtime_guard", side_effect=lambda _env: order.append(("guard",))):
            self.assertIs(H.prepare_server_socket(1001, 1002), listener)
            self.assertEqual(order, [("bind", ("127.0.0.1", 443)), ("drop", 1001, 1002), ("guard",)])
            self.assertNotIn("UNTRUSTED_EXTRA", H.os.environ)
        listener.reset_mock()
        listener.bind.side_effect = OSError("occupied")
        with patch.dict(H.os.environ, ENVIRONMENT, clear=True), \
                patch.object(H.socket, "socket", return_value=listener), \
                patch.object(H, "drop_server_privileges") as drop:
            with self.assertRaises(OSError):
                H.prepare_server_socket(1001, 1002)
            drop.assert_not_called()
            listener.close.assert_called_once()

    def test_unverified_drop_stops_before_tls_or_http_processing(self):
        listener = MagicMock()
        with patch.object(H, "prepare_server_socket", return_value=listener), \
                patch.object(H, "require_unprivileged", side_effect=H.PROBE.ProbeError("DROP_NOT_PROVEN")), \
                patch.object(H.ssl, "SSLContext") as tls:
            with self.assertRaises(H.PROBE.ProbeError):
                H.serve_capture(H.CAPTURE_CASES[0], Path("/synthetic-unused"), 1001, 1002)
            tls.assert_not_called()
            listener.close.assert_called_once()

    def test_ready_pid_must_descend_from_the_started_wrapper_with_exact_ids_and_no_groups(self):
        statuses = {
            "/proc/101/status": "PPid:\t102\nUid:\t1001 1001 1001 1001\nGid:\t1002 1002 1002 1002\nGroups:\t\n",
            "/proc/102/status": "PPid:\t103\n",
        }
        with patch.object(Path, "read_text", lambda path: statuses[str(path)]):
            self.assertTrue(H.server_descends_from(101, 103, 1001, 1002))
            self.assertFalse(H.server_descends_from(101, 103, 0, 1002))
            statuses["/proc/101/status"] = statuses["/proc/101/status"].replace("Groups:\t\n", "Groups:\t27\n")
            self.assertFalse(H.server_descends_from(101, 103, 1001, 1002))
            self.assertFalse(H.server_descends_from(True, 103, 1001, 1002))


class ServerCleanupTests(unittest.TestCase):
    @contextlib.contextmanager
    def server(self, connection=errno.ECONNREFUSED, collection_error=None, change=None):
        child = MagicMock()
        child.pid = 4321
        child.returncode = 0
        stopped = {"event": "stopped", "passed": True, "privilegeDropped": True,
                   "rejected": False, "deadline": False,
                   "requests": {H.DOCUMENT_PATH: 1, "/assets/tokens.css": 1, "/assets/employee-ux.css": 1}}
        if change is not None:
            change(stopped)
        check = MagicMock()
        check.__enter__.return_value = check
        check.connect_ex.return_value = connection
        with patch.object(H.os, "geteuid", return_value=1001), \
                patch.object(H.os, "getegid", return_value=1002), \
                patch.object(H.subprocess, "Popen", return_value=child), \
                patch.object(H, "server_ready", return_value=1234), \
                patch.object(H.os, "pidfd_open", return_value=55), \
                patch.object(H, "server_descends_from", return_value=True), \
                patch.object(H.signal, "pidfd_send_signal") as send, \
                patch.object(H.os, "close") as close, \
                patch.object(H.socket, "socket", return_value=check), \
                patch.object(H.PROBE, "collect_worker_output",
                             side_effect=collection_error,
                             return_value=(json.dumps(stopped).encode(), b"", None)):
            yield child, send, close, check

    def test_native_server_stop_uses_pidfd_and_requires_a_closed_original_port(self):
        evidence = {}
        with self.server() as (_child, send, close, check):
            with H.original_origin_server(H.CAPTURE_CASES[0], Path("/unused"), evidence):
                self.assertTrue(evidence["privilegeDropped"])
            send.assert_called_once_with(55, H.signal.SIGTERM)
            close.assert_called_once_with(55)
            check.connect_ex.assert_called_once_with(("127.0.0.1", 443))
        self.assertTrue(evidence["stopped"])
        self.assertEqual(sum(evidence["requests"].values()), 3)

    def test_open_or_unreachable_port_cannot_be_relabelled_as_cleaned_up(self):
        for connection in (0, errno.ETIMEDOUT):
            evidence = {}
            with self.subTest(connection=connection), self.server(connection=connection):
                with self.assertRaisesRegex(H.PROBE.ProbeError, "SERVER_CLEANUP_FAILED"):
                    with H.original_origin_server(H.CAPTURE_CASES[0], Path("/unused"), evidence):
                        pass
            self.assertFalse(evidence["stopped"])
            self.assertEqual(evidence["failure"], "SERVER_CLEANUP_FAILED")

    def test_cleanup_failure_does_not_mask_the_original_render_failure(self):
        evidence = {}
        with self.server(collection_error=OSError("not retained")) as (_child, send, _close, _check):
            with self.assertRaisesRegex(H.PROBE.ProbeError, "ORIGINAL_RENDER_FAILED"):
                with H.original_origin_server(H.CAPTURE_CASES[0], Path("/unused"), evidence):
                    raise H.PROBE.ProbeError("ORIGINAL_RENDER_FAILED")
            self.assertEqual(send.call_args_list[-1].args, (55, H.signal.SIGKILL))
        self.assertFalse(evidence["stopped"])
        self.assertEqual(evidence["failure"], "SERVER_CLEANUP_FAILED")


    def test_failed_or_ambiguous_stop_receipt_cannot_qualify_cleanup(self):
        changes = [
            lambda value: value.update(passed=False),
            lambda value: value.update(privilegeDropped=False),
            lambda value: value.update(rejected=True),
            lambda value: value.update(deadline=True),
            lambda value: value.update(extra="not accepted"),
            lambda value: value.update(requests={}),
            lambda value: value["requests"].update({H.DOCUMENT_PATH: True}),
            lambda value: value["requests"].update({H.DOCUMENT_PATH: 16}),
        ]
        for change in changes:
            evidence = {}
            with self.subTest(change=change), self.server(change=change):
                with self.assertRaisesRegex(H.PROBE.ProbeError, "SERVER_CLEANUP_FAILED"):
                    with H.original_origin_server(H.CAPTURE_CASES[0], Path("/unused"), evidence):
                        pass
            self.assertFalse(evidence["stopped"])


class PdfTests(unittest.TestCase):
    def test_each_original_page_must_exist_and_remain_portrait_a4(self):
        for count in (2, 3, 4):
            text = "Pages: " + str(count) + "\n" + "".join(
                "Page " + str(page) + " size: 595.276 x 841.89 pts (A4)\n" for page in range(1, count + 1))
            self.assertEqual(H.verify_pdf_info(text), {"pages": count, "allPagesA4": True})
            with self.assertRaises(H.PROBE.ProbeError):
                H.verify_pdf_info(text.replace("Page 1 size:", "Missing first size:"))
            with self.assertRaises(H.PROBE.ProbeError):
                H.verify_pdf_info(text.replace("595.276", "841.89"))
        for count in (0, 1, 5, 1000):
            with self.assertRaises(H.PROBE.ProbeError):
                H.verify_pdf_info("Pages: " + str(count) + "\n")

    def test_pdf_retains_all_public_fields_across_line_wraps_and_excludes_private_fixture_values(self):
        text = "\n".join(field.replace(" ", "\n") for field in FIELDS)
        H.verify_pdf_text(text, FIELDS)
        with self.assertRaises(H.PROBE.ProbeError):
            H.verify_pdf_text("\n".join(FIELDS[:-1]), FIELDS)
        for private in H.PRIVATE_FIXTURES:
            with self.assertRaises(H.PROBE.ProbeError):
                H.verify_pdf_text(text + "\n" + private, FIELDS)


    @staticmethod
    def maximum_fields(language):
        # Match the unchanged original DE/EN multipage E2E values and full limits.
        def long_value(label, maximum):
            return label + " " + "W" * (maximum - len(label) - 5) + " End"
        return [
            long_value("Public meeting", 160), long_value("Public room", 160),
            long_value("Public site", 160), long_value("Public address", 160),
            long_value("Public building", 160), long_value("Public city", 120),
            long_value("Public reception", 160),
            "g" * 64 + "@" + ("w" * 63 + ".") * 2 + "w" * 56 + ".test",
            "+49 30 555 0100",
            "Zugangsdaten bei Ankunft" if language == "de" else "Credentials provided on arrival",
        ]

    @staticmethod
    def wrapped_fields(fields):
        return "\n".join("\n\t\f\u00a0".join(field[offset:offset + 19]
                         for offset in range(0, len(field), 19)) for field in fields)

    def test_all_ten_maximum_fields_accept_only_whitespace_wraps_in_both_languages(self):
        for language in ("de", "en"):
            with self.subTest(language=language):
                fields = self.maximum_fields(language)
                self.assertEqual([len(field) for field in fields],
                                 [160, 160, 160, 160, 160, 120, 160, 254, 15, 24 if language == "de" else 31])
                H.verify_pdf_text(self.wrapped_fields(list(reversed(fields))), fields)
                interleaved = fields.copy()
                interleaved[3] = fields[3][:80] + fields[7] + fields[3][80:]
                with self.assertRaisesRegex(H.PROBE.ProbeError, "^PDF_PUBLIC_FIELDS$"):
                    H.verify_pdf_text("\n".join(interleaved), fields)

    def test_missing_or_shortened_middle_fields_never_qualify_nine_of_ten(self):
        for language in ("de", "en"):
            fields = self.maximum_fields(language)
            for index in (3, 7):
                for missing in (True, False):
                    with self.subTest(language=language, index=index, missing=missing):
                        changed = fields.copy()
                        if missing:
                            changed.pop(index)
                        else:
                            middle = len(fields[index]) // 2
                            changed[index] = fields[index][:middle] + fields[index][middle + 1:]
                        with self.assertRaisesRegex(H.PROBE.ProbeError, "^PDF_PUBLIC_FIELDS$"):
                            H.verify_pdf_text(self.wrapped_fields(changed), fields)

    def test_every_private_fixture_is_rejected_even_when_split_by_whitespace(self):
        for language in ("de", "en"):
            fields = self.maximum_fields(language)
            for private in H.PRIVATE_FIXTURES:
                with self.subTest(language=language, private=private):
                    split = "\n\t\f\u00a0".join(private[offset:offset + 7]
                                             for offset in range(0, len(private), 7))
                    with self.assertRaisesRegex(H.PROBE.ProbeError, "^PDF_PRIVACY$"):
                        H.verify_pdf_text(self.wrapped_fields(fields) + "\n" + split, fields)

    @contextlib.contextmanager
    def inspection(self, language, raw_text, non_raw_text, page_texts=("page one", "page two")):
        """Mocked command boundary only; this fixture is not native PDF evidence."""
        with tempfile.TemporaryDirectory(prefix="cm-h-pdf-offline-") as temporary:
            root = Path(temporary)
            case = "chromium-desktop-" + language
            pdf = root / (case + ".pdf")
            pdf.write_bytes(b"%PDF-1.7\n" + b"bounded public envelope\n" * 60 + b"%%EOF\n")
            calls = []

            def command(arguments):
                calls.append(arguments)
                if arguments[0] == "pdfinfo":
                    return (b"Pages: 2\nPage 1 size: 595.276 x 841.89 pts\n"
                            b"Page 2 size: 595.276 x 841.89 pts\n")
                if arguments[0] == "pdftotext":
                    if "-f" in arguments:
                        page = int(arguments[arguments.index("-f") + 1])
                        return page_texts[page - 1].encode("utf-8")
                    return (raw_text if "-raw" in arguments else non_raw_text).encode("utf-8")
                if arguments[0] == "pdftoppm":
                    Path(arguments[-1] + ".png").write_bytes(png_fixture())
                    return b""
                raise AssertionError("Unexpected PDF inspection command")

            def inspect():
                return H.inspect_guest_pdf(case, {"expectedPublicFields": self.maximum_fields(language)})

            with patch.object(H, "OUTPUT", root), patch.object(H.PROBE, "command", side_effect=command):
                yield inspect, calls

    def test_inspection_uses_complete_raw_fields_and_keeps_all_individual_page_checks(self):
        for language in ("de", "en"):
            fields = self.maximum_fields(language)
            text = self.wrapped_fields(fields)
            with self.subTest(language=language), self.inspection(language, text, "interleaved columns") as (inspect, calls):
                result = inspect()
                self.assertTrue(result["publicFieldsPresent"])
                self.assertTrue(result["privateFixtureFieldsAbsent"])
                self.assertEqual(result["textSha256"], H.PROBE.digest(text.encode("utf-8")))
                self.assertEqual([image["page"] for image in result["images"]], [1, 2])
                page_calls = [args for args in calls if args[0] == "pdftotext" and "-f" in args]
                self.assertEqual([args[args.index("-f") + 1] for args in page_calls], ["1", "2"])

    def test_incomplete_or_private_raw_text_cannot_fall_back_to_complete_other_mode(self):
        for language in ("de", "en"):
            fields = self.maximum_fields(language)
            complete = self.wrapped_fields(fields)
            shortened = fields.copy()
            shortened[3] = fields[3][:80] + fields[3][81:]
            cases = (
                (self.wrapped_fields(fields[:3] + fields[4:]), "PDF_PUBLIC_FIELDS"),
                (self.wrapped_fields(shortened), "PDF_PUBLIC_FIELDS"),
                (complete + "\n" + "\n".join(H.PRIVATE_FIXTURES[-1]), "PDF_PRIVACY"),
            )
            for text, code in cases:
                with self.subTest(language=language, code=code), \
                        self.inspection(language, text, complete) as (inspect, calls):
                    with self.assertRaisesRegex(H.PROBE.ProbeError, "^" + code + "$"):
                        inspect()
                    self.assertFalse(any(args[0] == "pdftoppm" for args in calls))

    def test_complete_raw_text_does_not_qualify_an_empty_individual_page(self):
        for language in ("de", "en"):
            text = self.wrapped_fields(self.maximum_fields(language))
            with self.subTest(language=language), \
                    self.inspection(language, text, text, ("page one", "\n\t\f")) as (inspect, _calls):
                with self.assertRaisesRegex(H.PROBE.ProbeError, "^PDF_EMPTY_PAGE$"):
                    inspect()



class SourceAndProtocolTests(unittest.TestCase):
    def test_source_binding_requires_exact_checkout_ancestry_cleanliness_and_declared_paths(self):
        calls = []

        def git(*arguments):
            calls.append(arguments)
            if arguments == ("rev-parse", "HEAD"):
                return (BINDING["captureSourceSha"] + "\n").encode()
            if arguments == ("rev-parse", BINDING["productSourceSha"] + "^{tree}"):
                return (BINDING["productTreeSha"] + "\n").encode()
            if arguments == ("rev-parse", BINDING["captureSourceSha"] + "^{tree}"):
                return (BINDING["captureTreeSha"] + "\n").encode()
            if arguments[:2] == ("diff", "--name-only"):
                return b"scripts/probe-webkitgtk-guest-print.py\n"
            return b""

        with patch.dict(H.os.environ, ENVIRONMENT, clear=True), patch.object(H, "git", side_effect=git):
            self.assertEqual(H.source_binding(), BINDING)
        self.assertIn(("merge-base", "--is-ancestor", BINDING["productSourceSha"], BINDING["captureSourceSha"]), calls)
        self.assertIn(("diff", "--quiet", "HEAD", "--"), calls)
        self.assertIn(("diff", "--name-only", "--no-renames", BINDING["productSourceSha"], BINDING["captureSourceSha"], "--"), calls)

        for changed in (b"", b"src/employee/production-application.js\n",
                        b"scripts/probe-webkitgtk-guest-print.py\nassets/tokens.css\n"):
            def changed_git(*arguments):
                return changed if arguments[:2] == ("diff", "--name-only") else git(*arguments)
            with self.subTest(changed=changed), patch.dict(H.os.environ, ENVIRONMENT, clear=True), \
                    patch.object(H, "git", side_effect=changed_git):
                with self.assertRaises(H.PROBE.ProbeError):
                    H.source_binding()
        with patch.dict(H.os.environ, {**ENVIRONMENT, "CM_GUEST_PRODUCT_SOURCE_SHA": "main"}, clear=True), \
                patch.object(H, "git") as never:
            with self.assertRaises(H.PROBE.ProbeError):
                H.source_binding()
            never.assert_not_called()

    def test_ready_protocol_accepts_fragmented_complete_output_but_no_ambiguity_or_overflow(self):
        child = MagicMock()
        child.pid = 4321
        child.stdout.fileno.return_value = 7
        valid = json.dumps({"event": "ready", "pid": 1234, "privilegeDropped": True}).encode() + b"\n"

        def read(chunks, descendant=True):
            selector = MagicMock()
            selector.__enter__.return_value = selector
            selector.select.return_value = [(object(), object())]
            with patch.object(H.selectors, "DefaultSelector", return_value=selector), \
                    patch.object(H.os, "read", side_effect=chunks), \
                    patch.object(H, "server_descends_from", return_value=descendant):
                return H.server_ready(child, 1001, 1002)

        self.assertEqual(read([valid[:11], valid[11:25], valid[25:]]), 1234)
        invalid = [
            [b""], [b"x" * 1025], [valid + valid],
            [b'{"event":"ready","pid":1234,"privilegeDropped":true,"raw":"discard"}\n'],
            [b'{"event":"ready","pid":1234,"pid":5678,"privilegeDropped":true}\n'],
        ]
        for chunks in invalid:
            with self.subTest(chunks=chunks), self.assertRaises(H.PROBE.ProbeError):
                read(chunks)
        with self.assertRaises(H.PROBE.ProbeError):
            read([valid], descendant=False)


def phase_one_receipt(bundle):
    entries = []
    for case, (_host, _language, flag) in H.PROBE.CASES.items():
        entry = {
            "case": case, "passed": True, "phase": "tls-handshake" if flag else "print-operation",
            "exitCode": 0, "stdoutBytes": 268, "stderrBytes": 472, "sandboxEnabled": True,
            "tlsPolicy": "FAIL", "webkit": "2.52.6", "result": "TLS_REJECTED" if flag else "PRINT_FINISHED",
            "tlsFlags": flag,
        }
        if not flag:
            entry["sandbox"] = [{"noNewPrivileges": True, "seccompFilter": True, "mountNamespaceIsolated": True}]
        entries.append(entry)
    return {
        "schemaVersion": 1, "scope": "synthetic-capability-only", "productAcceptance": False,
        "passed": True, "sourceSha": BINDING["captureSourceSha"], "treeSha": BINDING["captureTreeSha"],
        "scriptSha256": H.PHASE_ONE_SHA256, "cases": entries,
        "packages": ["gir1.2-webkit2-4.1=2.52.6", "libgtk-3-0t64=3.24.52",
                     "libwebkit2gtk-4.1-0=2.52.6", "poppler-utils=26.01.0-2", "python3-gi=3.56.2-1"],
        "cleanup": {"complete": True, "failures": [], "originalTrustSha256": H.PROBE.digest(bundle)},
    }


class PhaseOneReceiptTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="cm-h-phase-one-")
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.path = self.root / "test-results" / "webkitgtk-probe" / "receipt.json"
        self.path.parent.mkdir(parents=True)
        self.bundle = self.root / "bundle"
        self.bundle.write_bytes(b"offline public test trust bytes")
        self.receipt = phase_one_receipt(self.bundle.read_bytes())

    def read(self, receipt):
        self.path.write_text(json.dumps(receipt), encoding="utf-8")
        with patch.object(H, "ROOT", self.root), patch.object(H.PROBE, "CA_BUNDLE", self.bundle):
            return H.require_phase_one(BINDING)

    def test_six_original_tls_cases_and_real_process_evidence_are_required(self):
        observed, digest = self.read(self.receipt)
        self.assertEqual(observed, self.receipt)
        self.assertEqual(digest, H.PROBE.digest(self.path.read_bytes()))
        changes = [
            lambda value: value.update(cases=value["cases"][:-1]),
            lambda value: value["cases"][0].update(tlsFlags=0),
            lambda value: value["cases"][3].update(result="PRINT_FINISHED"),
            lambda value: value["cases"][-1].update(sandboxEnabled=False),
            lambda value: value["cases"][-1].update(sandbox=[]),
            lambda value: value["cases"][-1]["sandbox"][0].update(seccompFilter=False),
            lambda value: value["cases"][-1].update(exitCode=1),
            lambda value: value["cases"][0].update(rawStderr="must never be accepted"),
        ]
        for mutate in changes:
            value = copy.deepcopy(self.receipt)
            mutate(value)
            with self.subTest(mutate=mutate), self.assertRaises(H.PROBE.ProbeError):
                self.read(value)

    def test_stale_source_failed_cleanup_and_wrong_script_cannot_qualify_h(self):
        changes = [
            lambda value: value.update(sourceSha="f" * 40),
            lambda value: value.update(treeSha="f" * 40),
            lambda value: value.update(scriptSha256="0" * 64),
            lambda value: value.update(productAcceptance=True),
            lambda value: value.update(passed=False),
            lambda value: value["cleanup"].update(complete=False),
            lambda value: value["cleanup"].update(failures=["HOSTS_RESTORE"]),
            lambda value: value["cleanup"].update(originalTrustSha256="0" * 64),
        ]
        for mutate in changes:
            value = copy.deepcopy(self.receipt)
            mutate(value)
            with self.subTest(mutate=mutate), self.assertRaises(H.PROBE.ProbeError):
                self.read(value)


def png_fixture(width=794, height=1123):
    def chunk(name, payload):
        return H.struct.pack(">I", len(payload)) + name + payload + H.struct.pack(">I", H.zlib.crc32(name + payload) & 0xffffffff)
    scanlines = (b"\0" + b"\xff\xff\xff" * width) * height
    return (b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", H.struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0))
            + chunk(b"IDAT", H.zlib.compress(scanlines)) + chunk(b"IEND", b""))


class ImageTransportTests(unittest.TestCase):
    def setUp(self):
        temporary = tempfile.TemporaryDirectory(prefix="cm-h-transport-")
        self.addCleanup(temporary.cleanup)
        self.root = Path(temporary.name)
        self.output = self.root / "guest-print-webkitgtk"
        self.output.mkdir()
        self.captures = self.root / "guest-print-capture"
        self.captures.mkdir()
        self.phase = phase_one_receipt(b"offline public trust bytes")
        self.phase_digest = "0" * 64
        self.manifests = {}
        self.png = png_fixture()
        documents = []
        for case in H.CAPTURE_CASES:
            directory = self.captures / case
            directory.mkdir()
            manifest = {"project": case[:-3], "browserVersion": "26.0", "language": case[-2:],
                        "document": {"sha256": H.PROBE.digest(b"original public DOM")}}
            self.manifests[case] = manifest
            raw = json.dumps(manifest).encode()
            (directory / "manifest.json").write_bytes(raw)
            # An offline transport envelope, not a rendered-PDF claim.
            data = b"%PDF-1.7\n" + b"bounded public envelope\n" * 60 + b"%%EOF\n"
            (self.output / (case + ".pdf")).write_bytes(data)
            images = []
            for page in (1, 2):
                filename = case + "-page-" + str(page) + ".png"
                (self.output / filename).write_bytes(self.png)
                images.append({"file": filename, "page": page, "bytes": len(self.png),
                               "sha256": H.PROBE.digest(self.png), "renderer": "Poppler pdftoppm 96dpi"})
            documents.append({
                "captureCase": case, "inputProject": manifest["project"], "inputBrowserVersion": manifest["browserVersion"],
                "language": manifest["language"], "captureManifestSha256": H.PROBE.digest(raw),
                "documentSha256": manifest["document"]["sha256"],
                "server": {"port": 443, "privilegeDropped": True, "stopped": True, "exitCode": 0,
                           "stdoutBytes": 200, "stderrBytes": 0,
                           "requests": {H.DOCUMENT_PATH: 1, "/assets/tokens.css": 1, "/assets/employee-ux.css": 1}},
                "worker": copy.deepcopy(next(entry for entry in self.phase["cases"] if entry["case"] == "valid-" + case[-2:])),
                "pdf": {"pages": 2, "allPagesA4": True, "file": case + ".pdf", "bytes": len(data),
                        "sha256": H.PROBE.digest(data), "textSha256": "1" * 64,
                        "publicFieldsPresent": True, "privateFixtureFieldsAbsent": True, "images": images},
            })
        self.receipt = {
            "schemaVersion": 1, "scope": "actual-guest-dom-webkitgtk-print", "productAcceptance": False,
            **BINDING, "scriptSha256": H.PROBE.digest(SOURCE.read_bytes()),
            "reusedPhaseOneSource": H.PHASE_ONE_COMMIT, "reusedPhaseOneScriptSha256": H.PHASE_ONE_SHA256,
            "phaseOneReceiptSha256": self.phase_digest, "renderer": "WebKitGTK 4.1 PrintOperation",
            "runnerImage": "offline", "packages": self.phase["packages"],
            "passed": True, "documents": documents, "cleanup": self.phase["cleanup"],
        }
        self.save(self.receipt)

    def save(self, receipt):
        (self.output / "receipt.json").write_text(json.dumps(receipt), encoding="utf-8")

    def collect(self):
        with patch.object(H, "OUTPUT", self.output), patch.object(H, "CAPTURES", self.captures), \
                patch.object(H, "load_capture", side_effect=lambda case, _binding: (self.manifests[case], {})):
            return H.collect_guest_page_images(BINDING, self.phase, self.phase_digest)

    def test_all_eight_original_rasters_round_trip_through_existing_chunk_protocol(self):
        images, manifest = self.collect()
        self.assertEqual(len(images), 8)
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            H.emit(images, manifest, [])
        lines = output.getvalue().splitlines()
        self.assertEqual(sum(line.startswith("CM_IMAGE_BEGIN ") for line in lines), 8)
        self.assertEqual(sum(line.startswith("CM_IMAGE_END ") for line in lines), 8)
        self.assertTrue(lines[-1].startswith("CM_REVIEW_COMPLETE "))
        buffers = {}
        for line in lines:
            if not line.startswith("CM_IMAGE_DATA "):
                continue
            _prefix, index, offset, encoded = line.split(" ", 3)
            self.assertLessEqual(len(encoded), 3000)
            current = buffers.setdefault(int(index), "")
            self.assertEqual(len(current), int(offset))
            buffers[int(index)] = current + encoded
        for index in range(8):
            self.assertEqual(H.base64.b64decode(buffers[index], validate=True), self.png)
            self.assertEqual(images[index][0]["captureSourceSha"], BINDING["captureSourceSha"])
            self.assertEqual(images[index][0]["productSourceSha"], BINDING["productSourceSha"])

    def test_oversized_or_invalid_complete_inventory_emits_no_partial_image(self):
        metadata = {"capture": "public-page.png"}
        for images, total in (
            ([(metadata, self.png)] * 17, H.MAX_IMAGE_TOTAL),
            ([(metadata, self.png)], len(self.png) - 1),
            ([(metadata, self.png), (metadata, b"invalid PNG")], H.MAX_IMAGE_TOTAL),
            ([(metadata, self.png + b"untrusted trailing bytes")], H.MAX_IMAGE_TOTAL),
        ):
            output = io.StringIO()
            with self.subTest(total=total), patch.object(H, "MAX_IMAGE_TOTAL", total), \
                    contextlib.redirect_stdout(output), self.assertRaises(H.PROBE.ProbeError):
                H.emit(images, {"captureInventory": []}, [])
            self.assertEqual(output.getvalue(), "")
        with self.assertRaises(H.PROBE.ProbeError):
            H.png_dimensions(b"x" * (H.MAX_IMAGE_BYTES + 1))

    def test_failed_stale_or_incomplete_h_receipts_cannot_release_images(self):
        changes = [
            lambda value: value.update(passed=False),
            lambda value: value.update(productAcceptance=True),
            lambda value: value.update(captureSourceSha="f" * 40),
            lambda value: value.update(scriptSha256="f" * 64),
            lambda value: value["cleanup"].update(complete=False),
            lambda value: value["documents"].pop(),
            lambda value: value["documents"][0]["server"].update(stopped=False),
            lambda value: value["documents"][0]["worker"]["sandbox"][0].update(seccompFilter=False),
            lambda value: value["documents"][0].update(captureManifestSha256="f" * 64),
            lambda value: value["documents"][0]["pdf"].update(pages=3),
            lambda value: value["documents"][0]["pdf"]["images"][0].update(sha256="f" * 64),
        ]
        for mutate in changes:
            value = copy.deepcopy(self.receipt)
            mutate(value)
            self.save(value)
            with self.subTest(mutate=mutate), self.assertRaises(H.PROBE.ProbeError):
                self.collect()

    def test_modified_missing_extra_or_symlink_rasters_are_rejected_without_rerendering(self):
        first = self.output / (H.CAPTURE_CASES[0] + "-page-1.png")
        first.write_bytes(self.png[:-1] + bytes([self.png[-1] ^ 1]))
        with self.assertRaises(H.PROBE.ProbeError):
            self.collect()
        first.unlink()
        with self.assertRaises(FileNotFoundError):
            self.collect()
        outside = self.root / "outside.png"
        outside.write_bytes(self.png)
        first.symlink_to(outside)
        with self.assertRaises(H.PROBE.ProbeError):
            self.collect()
        first.unlink()
        first.write_bytes(self.png)
        (self.output / "unexpected.txt").write_text("unrequested output")
        with self.assertRaises(H.PROBE.ProbeError):
            self.collect()


if __name__ == "__main__":
    unittest.main()
