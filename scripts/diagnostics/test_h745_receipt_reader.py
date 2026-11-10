"""Offline positive and adversarial checks for the fixed, read-only H receipt reader."""
import base64
import contextlib
import copy
import io
import json
from pathlib import Path
import subprocess
import tempfile
import stat
import struct
import unittest
from unittest.mock import patch
import warnings
import zipfile

import h745_receipt_reader as reader
from test_pr479_artifact_review import png


def encoded(value):
    return (json.dumps(value, sort_keys=True) + "\n").encode("utf-8")


def archive(items, compression=zipfile.ZIP_DEFLATED):
    output = io.BytesIO()
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", UserWarning)
        with zipfile.ZipFile(output, "w", compression=compression) as target:
            for path, data in items:
                target.writestr(path, data)
    return output.getvalue()


def worker(case="valid-de"):
    flags = dict(zip(reader.TLS_CASES, (1, 2, 8, 64, 0, 0)))
    return {"case": case, "passed": True,
            "phase": "print-operation" if case.startswith("valid-") else "tls-handshake",
            "exitCode": 0, "stdoutBytes": 350, "stderrBytes": 0, "sandboxEnabled": True,
            "tlsPolicy": "FAIL", "webkit": "2.52.6", "tlsFlags": flags[case],
            "result": "PRINT_FINISHED" if case.startswith("valid-") else "TLS_REJECTED",
            "sandbox": [{"noNewPrivileges": True, "seccompFilter": True, "mountNamespaceIsolated": True}]}


def fixture():
    entries = {}
    for case in reader.CASES:
        project, language = case.rsplit("-", 1)
        prefix = "guest-print-capture/" + case + "/"
        document = b"PRIVATE_RAW_HTML_MUST_NOT_BE_OUTPUT"
        style_data = b"ORIGINAL_CRC_SENTINEL"
        entries[prefix + "document.html"] = document
        for name in ("tokens.css", "employee-ux.css"):
            entries[prefix + name] = style_data
        manifest = {"schemaVersion": 1, "scope": "actual-guest-dom-capture",
                    "productAcceptance": False, **reader.BINDING,
                    "project": project, "language": language, "browserVersion": "156.0.8078.4",
                    "browserName": "chromium" if project == "chromium-desktop" else "webkit",
                    "playwrightVersion": "1.64.1",
                    "document": {"sha256": reader.BASE.sha(document), "bytes": len(document)},
                    "expectedPublicFields": ["PRIVATE_FIXTURE_VALUE_MUST_NOT_BE_OUTPUT"] * 10,
                    "privacyChecks": ["request-id", "user-id", "tenant-id", "csrf-fixture",
                                      "private-request-requirements", "private-dietary-requirements"],
                    "styles": [{"file": name, "sha256": reader.BASE.sha(style_data), "bytes": len(style_data)}
                               for name in ("tokens.css", "employee-ux.css")]}
        entries[prefix + "manifest.json"] = encoded(manifest)
    clean = {"complete": True, "failures": [], "originalTrustSha256": "a" * 64}
    phase = {"schemaVersion": 1, "scope": "synthetic-capability-only", "productAcceptance": False,
             "sourceSha": reader.HEAD, "treeSha": reader.TREE,
             "scriptSha256": "7e28b93c561bc235c050319b3fff8deccf8d65be681bbff7256d0d4c5fd44df7",
             "passed": True, "cleanup": clean, "cases": [worker(case) for case in reader.TLS_CASES]}
    entries[reader.PHASE_ONE_RECEIPT] = encoded(phase)
    first_manifest = entries[reader.MANIFESTS[0]]
    guest = {"schemaVersion": 1, "scope": "actual-guest-dom-webkitgtk-print", "productAcceptance": False,
             **reader.BINDING, "phaseOneReceiptSha256": reader.BASE.sha(entries[reader.PHASE_ONE_RECEIPT]),
             "scriptSha256": "b" * 64, "passed": False, "failure": "PDF_PAGE_COUNT", "cleanup": clean,
             "documents": [{"captureCase": reader.CASES[0], "worker": worker(),
                            "captureManifestSha256": reader.BASE.sha(first_manifest),
                            "documentSha256": json.loads(first_manifest)["document"]["sha256"],
                            "server": {"port": 443, "privilegeDropped": True, "stopped": True,
                                       "exitCode": 0, "stdoutBytes": 300, "stderrBytes": 0,
                                       "requests": {"/src/shared/detached-print.html": 1,
                                                    "/assets/tokens.css": 1, "/assets/employee-ux.css": 1}}}]}
    entries[reader.GUEST_RECEIPT] = encoded(guest)
    for language in ("de", "en"):
        for suffix in (".pdf", "-page-1.png", "-page-2.png"):
            entries["webkitgtk-probe/" + language + suffix] = b"bounded original bytes"
    entries["guest-print-webkitgtk/" + reader.CASES[0] + ".pdf"] = b"bounded original PDF"
    return entries


def metadata():
    repository = {"full_name": reader.REPOSITORY, "private": False, "visibility": "public"}
    run = {"id": reader.RUN, "head_sha": reader.HEAD, "run_attempt": 1,
           "head_branch": "CO-317-guest-print-webkitgtk-evidence", "event": "push",
           "status": "completed", "conclusion": "failure", "path": ".github/workflows/guest-print-evidence.yml"}
    job = {"id": reader.JOB, "run_id": reader.RUN, "head_sha": reader.HEAD, "name": "actual-guest-print",
           "status": "completed", "conclusion": "failure",
           "steps": [{"name": name, "status": "completed", "conclusion": conclusion}
                     for name, conclusion in ((reader.CAPTURE_STEP, "success"),
                                              (reader.PRINT_STEP, "failure"), (reader.IMAGE_STEP, "skipped"))]}
    commit = {"sha": reader.HEAD, "tree": {"sha": reader.TREE}}
    return repository, run, job, commit


class ReceiptReaderTests(unittest.TestCase):
    def test_complete_fixed_inventory_preserves_failure_without_raw_content(self):
        selected, inventory = reader.read_archive(archive(fixture().items()))
        value = reader.report(selected, inventory)
        output = reader.encoded_report(value)
        self.assertEqual(len(value["captures"]), 4)
        self.assertEqual(len(value["phaseOne"]["cases"]), 6)
        self.assertEqual(value["guest"]["failure"], "PDF_PAGE_COUNT")
        self.assertFalse(value["guest"]["passed"])
        self.assertEqual(value["producerConclusion"], "failure")
        self.assertEqual(value["guest"]["documents"][0]["server"]["requestCount"], 3)
        for secret in ("PRIVATE_RAW_HTML", "PRIVATE_FIXTURE_VALUE", "ORIGINAL_CRC_SENTINEL", "BEGIN PRIVATE KEY"):
            self.assertNotIn(secret, output)

    def test_source_requires_exact_failed_run_and_successful_capture(self):
        reader.verify_source(*metadata())
        for index, key, value in ((0, "private", True), (1, "head_sha", "a" * 40),
                                  (1, "run_attempt", 2), (1, "conclusion", "success"),
                                  (1, "status", "in_progress"), (2, "run_id", 1),
                                  (3, "tree", {"sha": "a" * 40})):
            values = list(metadata())
            values[index][key] = value
            with self.subTest(key=key), self.assertRaises(reader.Rejected):
                reader.verify_source(*values)
        values = list(metadata())
        values[2]["steps"][0]["conclusion"] = "failure"
        with self.assertRaises(reader.Rejected):
            reader.verify_source(*values)
        values = list(metadata())
        values[2]["steps"].append(copy.deepcopy(values[2]["steps"][0]))
        with self.assertRaises(reader.Rejected):
            reader.verify_source(*values)

    def test_artifact_identity_binds_id_size_digest_and_source(self):
        value = {"id": reader.ARTIFACT, "name": reader.ARTIFACT_NAME, "size_in_bytes": reader.ARTIFACT_BYTES,
                 "expired": False, "digest": "sha256:" + reader.ARTIFACT_SHA256,
                 "workflow_run": {"id": reader.RUN, "head_sha": reader.HEAD}}
        reader.artifact_identity(value)
        for key, changed in (("id", 1), ("name", "other"), ("size_in_bytes", 1), ("expired", True),
                              ("digest", "sha256:" + "a" * 64), ("workflow_run", {"id": reader.RUN, "head_sha": "a" * 40})):
            with self.subTest(key=key), self.assertRaises(reader.Rejected):
                reader.artifact_identity({**value, key: changed})

    def test_download_preserves_byte_digest_bounds_and_never_forwards_token(self):
        location = "https://productionresultssa1.blob.core.windows.net/actions-results/fixed"
        for data, accepted in ((b"abc", True), (b"abd", False), (b"ab", False), (b"abcd", False)):
            response = io.BytesIO(data)
            response.status = 200
            response.headers = {}
            metadata_ = {"id": reader.ARTIFACT, "name": reader.ARTIFACT_NAME, "size_in_bytes": 3,
                         "expired": False, "digest": "sha256:" + reader.BASE.sha(b"abc"),
                         "workflow_run": {"id": reader.RUN, "head_sha": reader.HEAD}}
            with patch.object(reader, "ARTIFACT_BYTES", 3), \
                    patch.object(reader, "ARTIFACT_SHA256", reader.BASE.sha(b"abc")), \
                    patch.object(reader.BASE, "api", side_effect=[metadata_, location]) as api, \
                    patch.object(reader.urllib.request, "build_opener") as build:
                build.return_value.open.return_value = response
                if accepted:
                    self.assertEqual(reader.download("TOKEN_MUST_NOT_LEAVE_GITHUB"), b"abc")
                else:
                    with self.assertRaises(reader.Rejected):
                        reader.download("TOKEN_MUST_NOT_LEAVE_GITHUB")
                request = build.return_value.open.call_args.args[0]
                self.assertIsNone(request.get_header("Authorization"))
                self.assertEqual(request.full_url, location)
                self.assertEqual(api.call_args.kwargs, {"redirect": True})

    def test_member_and_total_expansion_limits_are_applied_before_reading(self):
        entries = fixture()
        entries["guest-print-webkitgtk/" + reader.CASES[0] + ".pdf"] = b"x" * (2 * 1024 * 1024 + 1)
        with self.assertRaisesRegex(reader.Rejected, "archive-bounds"):
            reader.read_archive(archive(entries.items(), compression=zipfile.ZIP_STORED))
        entries = fixture()
        payload = bytes(range(256)) * 8192
        names = [name for name in entries if not name.endswith((".json", ".html"))][:9]
        for name in names:
            entries[name] = payload
        with self.assertRaisesRegex(reader.Rejected, "archive-bounds"):
            reader.read_archive(archive(entries.items()))

    def test_strict_json_rejects_duplicate_nonfinite_multiple_invalid_and_large(self):
        for data in (b'{"passed":true,"passed":false}', b'{"x":NaN}', b'{"x":Infinity}',
                     b'{}{}', b"\xff", b"[]", b'{"x":1.5}', b"x" * (reader.MAX_JSON + 1)):
            with self.subTest(data=data[:40]), self.assertRaises(reader.Rejected):
                reader.strict_json(data)
        self.assertEqual(reader.strict_json(b'{"passed":false}'), {"passed": False})

    def test_json_structure_depth_list_and_string_are_bounded(self):
        for value in ({"x": [0] * 65}, {"x": "x" * 2049}, {"x": [[[[[[[[[[[[[1]]]]]]]]]]]]]}):
            with self.assertRaises(reader.Rejected):
                reader.strict_json(encoded(value))

    def test_zip_rejects_traversal_duplicates_links_unknown_and_missing_files(self):
        entries = fixture()
        link = zipfile.ZipInfo("guest-print-webkitgtk/link")
        link.create_system = 3
        link.external_attr = (stat.S_IFLNK | 0o777) << 16
        bad = [
            [("../outside", b"x")], [(link, b"../outside")],
            list(entries.items()) + [(reader.MANIFESTS[0], b"{}")],
            list(entries.items()) + [("secret.pem", b"secret")],
            [(name, data) for name, data in entries.items() if name != reader.MANIFESTS[0]],
        ]
        for items in bad:
            with self.assertRaises(reader.Rejected):
                reader.read_archive(archive(items))

    def test_all_members_are_crc_checked_even_when_never_output(self):
        data = bytearray(archive(fixture().items(), compression=zipfile.ZIP_STORED))
        index = data.index(b"ORIGINAL_CRC_SENTINEL")
        data[index] ^= 1
        with self.assertRaises(reader.Rejected):
            reader.read_archive(bytes(data))

    def test_receipt_source_and_capture_bytes_cannot_drift(self):
        selected, inventory = reader.read_archive(archive(fixture().items()))
        for mutate in (
            lambda rows, _files: rows[reader.GUEST_RECEIPT][0].update(captureSourceSha="a" * 40),
            lambda rows, _files: rows[reader.GUEST_RECEIPT][0].update(phaseOneReceiptSha256="c" * 64),
            lambda rows, _files: rows[reader.MANIFESTS[0]][0].update(language="en"),
            lambda _rows, files: files[0].update(sha256="d" * 64),
            lambda rows, _files: rows[reader.GUEST_RECEIPT][0]["documents"][0].update(documentSha256="e" * 64),
        ):
            rows, files = copy.deepcopy(selected), copy.deepcopy(inventory)
            mutate(rows, files)
            with self.assertRaises(reader.Rejected):
                reader.report(rows, files)

    def test_worker_failure_and_server_cleanup_failure_remain_visible(self):
        entries = fixture()
        guest = json.loads(entries[reader.GUEST_RECEIPT])
        guest["failure"] = "SERVER_CLEANUP_FAILED"
        guest["documents"][0]["server"].update(stopped=False, failure="SERVER_CLEANUP_FAILED", exitCode=1)
        guest["documents"][0]["worker"] = {"case": "valid-de", "passed": False, "phase": "protocol",
                                          "failure": "WORKER_NO_RESULT", "exitCode": -9,
                                          "stdoutBytes": 0, "stderrBytes": 100}
        entries[reader.GUEST_RECEIPT] = encoded(guest)
        selected, inventory = reader.read_archive(archive(entries.items()))
        result = reader.report(selected, inventory)["guest"]
        self.assertEqual(result["failure"], "SERVER_CLEANUP_FAILED")
        self.assertEqual(result["documents"][0]["worker"]["failure"], "WORKER_NO_RESULT")
        self.assertFalse(result["documents"][0]["server"]["stopped"])

    def test_no_raw_error_or_private_field_can_enter_diagnostics(self):
        for value in ("https://private.example/?token=x", "BEGIN_PRIVATE_KEY", "PRIVATE_DIETARY_SENTINEL"):
            with self.assertRaises(reader.Rejected):
                reader.code(value)
        with self.assertRaises(reader.Rejected):
            reader.worker({**worker(), "stderr": "a private value"})
        with self.assertRaises(reader.Rejected):
            reader.cleanup({"complete": False, "failures": ["private detail"]})

    def test_output_bound_is_checked_before_any_stdout(self):
        buffer = io.StringIO()
        with contextlib.redirect_stdout(buffer), patch.object(reader, "MAX_OUTPUT", 1):
            with self.assertRaises(reader.Rejected):
                reader.encoded_report({"scope": "read-only"})
        self.assertEqual(buffer.getvalue(), "")

    def test_reused_download_rejects_other_hosts_and_traversal_before_network(self):
        for location in ("http://productionresultssa1.blob.core.windows.net/actions-results/a",
                         "https://api.github.com/actions-results/a",
                         "https://token@productionresultssa1.blob.core.windows.net/actions-results/a",
                         "https://productionresultssa1.blob.core.windows.net/other/a"):
            with self.assertRaises(reader.Rejected):
                reader.BASE.download_location(location)



def pdf_info(pages=2):
    return "Pages: " + str(pages) + "\n" + "".join(
        "Page " + str(page) + " size: 595.276 x 841.89 pts (A4)\n"
        for page in range(1, pages + 1))


def sample_images(pages=2):
    data = png(794, 1123)
    return [({"capture": "h745-chromium-desktop-de-page-" + str(page) + ".png",
              "page": page, "pageCount": pages, "imageBytes": len(data), "imageSha256": reader.BASE.sha(data),
              "width": 794, "height": 1123}, data) for page in range(1, pages + 1)]


def image_diagnosis():
    return {"producerConclusion": "failure", "productAcceptance": False,
            "pdfInspection": {"pageCount": 2, "sourceFailure": "PDF_PUBLIC_FIELDS", "productAcceptance": False,
                              "originalPdfSha256": reader.PDF_SHA256, "originalPdfBytes": reader.PDF_BYTES}}


class PdfInspectionTests(unittest.TestCase):
    def test_original_pdf_identity_and_active_content_are_not_relaxed(self):
        original = b"%PDF-1.7\nsynthetic unit fixture\n%%EOF\n"
        with patch.object(reader, "PDF_BYTES", len(original)), patch.object(reader, "PDF_SHA256", reader.BASE.sha(original)):
            reader.verify_original_pdf(original)
            for changed in (original + b"x", original.replace(b"fixture", b"changed")):
                with self.assertRaises(reader.Rejected):
                    reader.verify_original_pdf(changed)
        for data in (b"invalid PDF", b"%PDF-1.7\n/JavaScript hidden\n%%EOF\n", b"%PDF-1.7\n/Encrypt 1\n%%EOF\n"):
            with patch.object(reader, "PDF_BYTES", len(data)), patch.object(reader, "PDF_SHA256", reader.BASE.sha(data)):
                with self.assertRaises(reader.Rejected):
                    reader.verify_original_pdf(data)

    def test_actual_poppler_version_is_minimized_and_ambiguous_or_invalid_output_is_rejected(self):
        value = b"pdftotext version 26.01.0\nCopyright public upstream text\n"
        self.assertEqual(reader.parse_poppler_version(value), "26.01.0")
        self.assertEqual(reader.parse_poppler_package(b"poppler-utils=26.01.0-2ubuntu0.3\n"),
                         "poppler-utils=26.01.0-2ubuntu0.3")
        for package in (b"other-package=1", b"poppler-utils=private url", b"poppler-utils=1\npoppler-utils=2"):
            with self.assertRaises(reader.Rejected):
                reader.parse_poppler_package(package)
        for value in (b"", b"\xff", b"other tool 26.01.0\n",
                      b"pdftotext version secret\n", b"pdftotext version 26.01.0\npdftotext version 27.0.0\n",
                      b"x" * (reader.MAX_TOOL_STDERR + 1)):
            with self.assertRaises(reader.Rejected):
                reader.parse_poppler_version(value)

    def test_pdf_info_requires_all_two_to_four_real_a4_records(self):
        for pages in (2, 3, 4):
            value = reader.pdf_a4_metadata(pdf_info(pages), pages)
            self.assertEqual([item["page"] for item in value], list(range(1, pages + 1)))
            self.assertEqual(value[0]["widthPoints"], 595.276)
        for text in ("Pages: 1\n", pdf_info() + "Pages: 2\n",
                     pdf_info().replace("595.276", "612"), pdf_info().replace("Page 2", "Page 3"),
                     "Pages: 2\nPage 1 size: 595.276 x 841.89 pts\n"):
            with self.assertRaises(reader.Rejected):
                reader.pdf_a4_metadata(text, 2)

    def test_layout_and_raw_are_independent_and_keep_the_existing_whitespace_rule(self):
        fields = ["public-field-" + str(index) for index in range(10)]
        layout, raw = " ".join(fields[1:]), " ".join(fields)
        reading = " ".join(fields[:-1])
        result = reader.field_presence(fields, layout, raw, reading)
        self.assertEqual([item["index"] for item in result], list(range(1, 11)))
        self.assertFalse(result[0]["layoutPresent"])
        self.assertTrue(result[0]["rawPresent"])
        self.assertTrue(result[0]["defaultPresent"])
        self.assertFalse(result[-1]["defaultPresent"])
        self.assertTrue(result[-1]["rawPresent"])
        self.assertTrue(all(item["layoutPresent"] for item in result[1:]))
        self.assertEqual(result[0]["expectedSha256"], reader.BASE.sha(fields[0].encode()))
        self.assertNotIn(fields[0], json.dumps(result))
        spaced = " \n ".join(fields[0]) + " " + " ".join(fields[1:])
        self.assertTrue(reader.field_presence(fields, spaced, raw, raw)[0]["layoutPresent"])
        altered = fields[0].replace("public", "pub-lic") + " " + " ".join(fields[1:])
        self.assertFalse(reader.field_presence(fields, altered, raw, raw)[0]["layoutPresent"])

    def test_all_six_private_fixture_values_block_rendering_even_with_split_whitespace(self):
        fields = ["public-field-" + str(index) for index in range(10)]
        for private in reader.PRIVATE_FIXTURES:
            for position in range(3):
                modes = [" ".join(fields)] * 3
                modes[position] = " \n ".join(private)
                with self.subTest(privateLength=len(private), mode=position), self.assertRaises(reader.Rejected):
                    reader.field_presence(fields, *modes)
        for fields_ in (fields[:-1], fields + ["extra"], [None] + fields[1:]):
            with self.assertRaises(reader.Rejected):
                reader.field_presence(fields_, "", "", "")

    def test_exact_original_pdf_is_read_and_every_page_is_rendered_once_at_96dpi(self):
        original = b"%PDF-1.7\nsynthetic unit fixture\n%%EOF\n"
        fields = ["public-field-" + str(index) for index in range(10)]
        selected = {reader.PDF_PATH: (original, reader.BASE.sha(original)),
                    reader.PHASE_ONE_RECEIPT: ({"packages": ["poppler-utils=26.01.0-2ubuntu0.3"]}, "c" * 64),
                    reader.MANIFESTS[0]: ({"expectedPublicFields": fields}, "a" * 64)}
        diagnosis = {"producerConclusion": "failure", "guest": {"passed": False, "failure": "PDF_PUBLIC_FIELDS"}}
        calls = []

        def tool(arguments, _directory):
            calls.append(arguments)
            if arguments[0].endswith("pdfinfo"):
                return pdf_info().encode()
            if tuple(arguments) == reader.POPPLER_PACKAGE_COMMAND:
                return b"poppler-utils=26.01.0-2ubuntu0.3\n"
            if arguments == ["/usr/bin/pdftotext", "-v"]:
                return b"26.01.0"
            if arguments[0].endswith("pdftotext"):
                return " ".join(fields[1:] if "-layout" in arguments else fields).encode()
            self.assertIn("-r", arguments)
            self.assertEqual(arguments[arguments.index("-r") + 1], "96")
            self.assertEqual(arguments[arguments.index("-f") + 1], arguments[arguments.index("-l") + 1])
            Path(arguments[-1]).with_suffix(".png").write_bytes(png(794, 1123))
            return b""

        with patch.object(reader, "PDF_BYTES", len(original)), patch.object(reader, "PDF_SHA256", reader.BASE.sha(original)), \
                patch.object(reader, "pdf_tool", side_effect=tool):
            result, images = reader.inspect_original_pdf(selected, diagnosis)
        rendered = [arguments for arguments in calls if arguments[0].endswith("pdftoppm")]
        self.assertEqual([arguments[arguments.index("-f") + 1] for arguments in rendered], ["1", "2"])
        self.assertEqual(result["pageCount"], 2)
        self.assertEqual(len(images), 2)
        self.assertFalse(result["fields"][0]["layoutPresent"])
        self.assertTrue(result["fields"][0]["rawPresent"])
        self.assertTrue(result["fields"][0]["defaultPresent"])
        self.assertEqual(result["inspectionPopplerVersion"], "26.01.0")
        self.assertEqual(result["inspectionPopplerPackage"], "poppler-utils=26.01.0-2ubuntu0.3")
        self.assertTrue(result["originalLayoutAssertionReproduced"])
        self.assertEqual(result["sourcePopplerPackage"], "poppler-utils=26.01.0-2ubuntu0.3")
        text_modes = [arguments for arguments in calls if arguments[0].endswith("pdftotext") and "-v" not in arguments]
        self.assertEqual(len(text_modes), 3)
        self.assertEqual(sum("-layout" not in arguments and "-raw" not in arguments for arguments in text_modes), 1)
        self.assertFalse(result["productAcceptance"])

    def test_private_pdf_text_fails_before_any_raster_command(self):
        original = b"%PDF-1.7\nsynthetic unit fixture\n%%EOF\n"
        selected = {reader.PDF_PATH: (original, reader.BASE.sha(original)),
                    reader.PHASE_ONE_RECEIPT: ({"packages": ["poppler-utils=26.01.0-2ubuntu0.3"]}, "c" * 64),
                    reader.MANIFESTS[0]: ({"expectedPublicFields": ["field"] * 10}, "a" * 64)}
        diagnosis = {"producerConclusion": "failure", "guest": {"passed": False, "failure": "PDF_PUBLIC_FIELDS"}}
        calls = []

        def tool(arguments, _directory):
            calls.append(arguments[0])
            if tuple(arguments) == reader.POPPLER_PACKAGE_COMMAND:
                return b"poppler-utils=26.01.0-2ubuntu0.3\n"
            if arguments == ["/usr/bin/pdftotext", "-v"]:
                return b"26.01.0"
            return (pdf_info().encode() if arguments[0].endswith("pdfinfo")
                    else reader.PRIVATE_FIXTURES[0].encode())

        with patch.object(reader, "PDF_BYTES", len(original)), patch.object(reader, "PDF_SHA256", reader.BASE.sha(original)), \
                patch.object(reader, "pdf_tool", side_effect=tool):
            with self.assertRaisesRegex(reader.Rejected, "pdf-private-fixture"):
                reader.inspect_original_pdf(selected, diagnosis)
        self.assertNotIn("/usr/bin/pdftoppm", calls)

    def test_pdf_tool_uses_bounded_file_sinks_and_fixed_environment(self):
        class Child:
            pid = 123456
            def __enter__(self): return self
            def __exit__(self, *_args): return False
            def wait(self, timeout=None): return 0

        for output_bytes, error_bytes, accepted in ((3, 0, True), (reader.MAX_TOOL_STDOUT + 1, 0, False),
                                                    (0, reader.MAX_TOOL_STDERR + 1, False)):
            def start(_arguments, **options):
                self.assertEqual(options["env"], {"PATH": "/usr/bin:/bin", "LC_ALL": "C.UTF-8"})
                self.assertIs(options["preexec_fn"], reader.BASE.restrict_renderer)
                self.assertIs(options["start_new_session"], True)
                for field, size in (("stdout", output_bytes), ("stderr", error_bytes)):
                    if size:
                        options[field].seek(size - 1)
                        options[field].write(b"x")
                        options[field].flush()
                return Child()
            with tempfile.TemporaryDirectory() as directory, patch.object(reader.subprocess, "Popen", side_effect=start):
                if accepted:
                    self.assertEqual(len(reader.pdf_tool(["/usr/bin/pdfinfo", "fixed.pdf"], directory)), 3)
                else:
                    with self.assertRaisesRegex(reader.Rejected, "pdf-tool-output-bound"):
                        reader.pdf_tool(["/usr/bin/pdfinfo", "fixed.pdf"], directory)

    def test_pdf_tool_deadline_kills_the_started_process_group_and_emits_no_native_text(self):
        class Child:
            pid = 123456
            waits = 0
            def __enter__(self): return self
            def __exit__(self, *_args): return False
            def wait(self, timeout=None):
                self.waits += 1
                if self.waits == 1:
                    raise subprocess.TimeoutExpired("fixed-poppler", timeout)
                return -9

        captured = io.StringIO()
        with tempfile.TemporaryDirectory() as directory, patch.object(reader.subprocess, "Popen", return_value=Child()), \
                patch.object(reader.os, "killpg") as kill, contextlib.redirect_stdout(captured):
            with self.assertRaisesRegex(reader.Rejected, "pdf-tool-deadline"):
                reader.pdf_tool(["/usr/bin/pdfinfo", "fixed.pdf"], directory)
        kill.assert_called_once_with(123456, reader.signal.SIGKILL)
        self.assertEqual(captured.getvalue(), "")

    def test_bounded_transport_preserves_every_png_byte_and_failure_provenance(self):
        images = sample_images()
        diagnosis = image_diagnosis()
        captured = io.StringIO()
        with contextlib.redirect_stdout(captured):
            reader.emit_diagnosis(diagnosis, images, "e" * 40, 123)
        lines = captured.getvalue().splitlines()
        self.assertEqual(len([line for line in lines if line.startswith("CM_IMAGE_BEGIN ")]), 2)
        for index, (_metadata, expected) in enumerate(images):
            pieces = [line.split(" ", 3)[3] for line in lines if line.startswith("CM_IMAGE_DATA " + str(index) + " ")]
            self.assertEqual(base64.b64decode("".join(pieces), validate=True), expected)
        for line in lines:
            if line.startswith("CM_IMAGE_BEGIN "):
                item = json.loads(line[len("CM_IMAGE_BEGIN "):])
                self.assertEqual(item["producerConclusion"], "failure")
                self.assertEqual(item["sourceFailure"], "PDF_PUBLIC_FIELDS")
                self.assertEqual(item["originalPdfSha256"], reader.PDF_SHA256)
                self.assertFalse(item["productAcceptance"])
                self.assertEqual(item["renderer"], "Poppler pdftoppm 96dpi")

    def test_bad_later_image_or_any_output_budget_fails_before_first_output(self):
        diagnosis = image_diagnosis()
        changed = sample_images()
        broken = bytearray(changed[1][1]); broken[30] ^= 1
        changed[1] = (changed[1][0], bytes(broken))
        expanded = sample_images()
        expanded[1][0]["unexpectedPrivateText"] = "must not print"
        for images in (changed, expanded, sample_images()[:1]):
            captured = io.StringIO()
            with contextlib.redirect_stdout(captured), self.assertRaises(reader.Rejected):
                reader.emit_diagnosis(diagnosis, images, "e" * 40, 123)
            self.assertEqual(captured.getvalue(), "")
        for bound in ("MAX_PAGE_TOTAL", "MAX_PAGE_BYTES", "MAX_OUTPUT"):
            captured = io.StringIO()
            with patch.object(reader, bound, 1), contextlib.redirect_stdout(captured), self.assertRaises(reader.Rejected):
                reader.emit_diagnosis(diagnosis, sample_images(), "e" * 40, 123)
            self.assertEqual(captured.getvalue(), "")


if __name__ == "__main__":
    unittest.main()
