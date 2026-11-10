"""Positive and adversarial offline tests for the one-use artifact inspector."""
import base64
import contextlib
import copy
import io
import json
import stat
import struct
import unittest
from unittest.mock import patch
import warnings
import zipfile
import zlib

import pr479_artifact_review as review


def make_zip(items):
    output = io.BytesIO()
    with warnings.catch_warnings():
        warnings.simplefilter("ignore", UserWarning)
        with zipfile.ZipFile(output, "w", zipfile.ZIP_DEFLATED) as target:
            for name, data in items:
                target.writestr(name, data)
    return output.getvalue()


def png(width=1, height=1):
    def chunk(kind, data):
        return struct.pack(">I", len(data)) + kind + data + struct.pack(">I", zlib.crc32(kind + data) & 0xffffffff)
    header = struct.pack(">IIBBBBB", width, height, 8, 2, 0, 0, 0)
    pixels = zlib.compress((b"\x00" + b"\xff\xff\xff" * width) * height)
    return b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", header) + chunk(b"IDAT", pixels) + chunk(b"IEND", b"")


def valid_report():
    return {"stats": {"total": 609, "expected": 609, "unexpected": 0, "skipped": 0, "flaky": 0, "ok": True},
            "projectNames": ["chromium-desktop"], "errors": [], "files": [{"fileId": "a" * 20}]}


def output_images():
    return [({"capture": f"image-{index:03d}", "reviewGroup": kind}, png())
            for index, kind in enumerate(kind for kind, count in review.IMAGE_COUNTS.items() for _ in range(count))]


def context():
    return {"frontend": {"checkoutCommit": review.CHECKOUT, "githubSha": review.CHECKOUT,
                         "trackedWorkingTree": "clean"}, "apiCommit": None,
            "composition": "routed-protocol-fixture", "project": "chromium-desktop", "engine": "chromium",
            "screen": "19", "state": "catalogue-status-and-authoritative-summary", "language": "de",
            "roles": ["employee", "conference_manager"], "viewport": {"width": 390, "height": 900}}


class ArtifactReviewTests(unittest.TestCase):
    def test_archive_and_member_success(self):
        source = review.archive(make_zip([("data/", b""), ("data/a.png", png())]))
        self.assertEqual(review.png_dimensions(review.member(source, "data/a.png")), {"width": 1, "height": 1})

    def test_path_rejections(self):
        for name in ("../a", "/a", "a/../b", "a//b", "a\\b", "C:a", "a:\nb", "a/\x00b", "./a", ""):
            with self.subTest(name=repr(name)), self.assertRaises(review.Rejected):
                review.safe_name(name)

    def test_archive_rejects_traversal_duplicate_symlink_and_corruption(self):
        link = zipfile.ZipInfo("link")
        link.create_system = 3
        link.external_attr = (stat.S_IFLNK | 0o777) << 16
        for data in (make_zip([("../outside", b"x")]), make_zip([("a", b"x"), ("a", b"y")]),
                     make_zip([(link, b"../outside")]), b"not a zip"):
            with self.subTest(length=len(data)), self.assertRaises(review.Rejected):
                review.archive(data)

    def test_archive_member_total_count_and_expansion_limits(self):
        with patch.object(review, "MAX_MEMBER", 8), self.assertRaises(review.Rejected):
            review.archive(make_zip([("large", b"x" * 9)]))
        with patch.object(review, "MAX_EXPANDED", 10), self.assertRaises(review.Rejected):
            review.archive(make_zip([("a", b"123456"), ("b", b"123456")]))
        with self.assertRaises(review.Rejected):
            review.archive(make_zip([("bomb", b"x" * 2_000_000)]))
        with self.assertRaises(review.Rejected):
            review.archive(make_zip([(str(i), b"x") for i in range(3001)]))

    def test_member_missing_and_declared_read_limit(self):
        source = review.archive(make_zip([("a", b"123456")]))
        for name, limit in (("missing", 8), ("a", 5)):
            with self.subTest(name=name), self.assertRaises(review.Rejected):
                review.member(source, name, limit)

    def test_png_rejects_wrong_type_dimensions_crc_and_trailing_bytes(self):
        self.assertEqual(review.png_dimensions(png()), {"width": 1, "height": 1})
        damaged = bytearray(png())
        damaged[30] ^= 1
        for data in (b"not png", png(4097, 1), bytes(damaged), png() + b"extra", png()[:-12]):
            with self.subTest(length=len(data)), self.assertRaises(review.Rejected):
                review.png_dimensions(data)

    def test_metadata_rejects_source_digest_identity_size_or_expiry_drift(self):
        artifact_id, name, size, digest = review.ARTIFACTS["chromium"]
        metadata = {"id": artifact_id, "name": name, "size_in_bytes": size, "expired": False,
                    "digest": "sha256:" + digest, "workflow_run": {"id": review.RUN, "head_sha": review.HEAD}}
        review.artifact_identity(metadata, "chromium")
        variants = [dict(metadata, **{key: value}) for key, value in (
            ("id", 1), ("name", "other"), ("size_in_bytes", size - 1), ("expired", True), ("digest", "sha256:bad"))]
        variants.extend([dict(metadata, workflow_run={"id": review.RUN + 1, "head_sha": review.HEAD}),
                         dict(metadata, workflow_run={"id": review.RUN, "head_sha": "0" * 40})])
        for changed in variants:
            with self.assertRaises(review.Rejected):
                review.artifact_identity(changed, "chromium")

    def test_artifact_bytes_require_exact_length_and_digest(self):
        data = make_zip([("a", b"abc")])
        with patch.dict(review.ARTIFACTS, {"test": (1, "test", len(data), review.sha(data))}):
            review.artifact_bytes(data, "test")
            for changed in (data + b"x", data[:-1] + bytes([data[-1] ^ 1])):
                with self.assertRaises(review.Rejected):
                    review.artifact_bytes(changed, "test")

    def test_download_url_rejects_foreign_host_credentials_non_https_and_other_path(self):
        accepted = "https://productionresultssa7.blob.core.windows.net/actions-results/a?opaque=synthetic"
        self.assertEqual(review.download_location(accepted), accepted)
        for value in ("http://productionresultssa7.blob.core.windows.net/actions-results/a",
                      "https://productionresultssa7.blob.core.windows.net.evil.invalid/actions-results/a",
                      "https://user@productionresultssa7.blob.core.windows.net/actions-results/a",
                      "https://productionresultssa7.blob.core.windows.net:443/actions-results/a",
                      "https://productionresultssa7.blob.core.windows.net/other/a",
                      "https://127.0.0.1/actions-results/a", "file:///etc/passwd"):
            with self.subTest(url=value), self.assertRaises(review.Rejected):
                review.download_location(value)

    def test_json_rejects_non_object_invalid_and_oversize(self):
        for value, limit in (("[]", 8), ("{", 8), ('{"a":1}', 4)):
            with self.assertRaises(review.Rejected):
                review.json_object(value, limit)

    def test_full_suite_rejects_stale_canary_skipped_flaky_failed_or_other_project(self):
        report = valid_report()
        review.passed_report(report)
        variants = []
        for key, value in (("total", 1), ("expected", 581), ("unexpected", 1), ("skipped", 1), ("flaky", 1), ("ok", False)):
            changed = copy.deepcopy(report)
            changed["stats"][key] = value
            variants.append(changed)
        variants.extend([dict(report, errors=["synthetic"]), dict(report, projectNames=["webkit-mobile"])])
        for changed in variants:
            with self.assertRaises(review.Rejected):
                review.passed_report(changed)

    def test_actual_report_envelope_and_complete_test_inventory(self):
        tests = [{"testId": str(i), "outcome": "expected", "projectName": "chromium-desktop",
                  "results": [{"status": "passed", "retry": 0, "errors": [], "attachments": []}]} for i in range(609)]
        def outer(test_rows):
            payload = make_zip([("report.json", json.dumps(valid_report())),
                                ("a" * 20 + ".json", json.dumps({"tests": test_rows}))])
            html = b'<template id="playwrightReportBase64">data:application/zip;base64,' + base64.b64encode(payload) + b"</template>"
            return review.archive(make_zip([("index.html", html)]))
        self.assertEqual(len(review.attachments(outer(tests))), 609)
        for changed in (tests[:-1], tests[:-1] + [tests[0]]):
            with self.assertRaises(review.Rejected):
                review.attachments(outer(changed))
        retried = copy.deepcopy(tests)
        retried[0]["results"][0]["retry"] = 1
        with self.assertRaises(review.Rejected):
            review.attachments(outer(retried))

    def test_context_requires_clean_exact_source_and_synthetic_scope(self):
        original = context()
        review.context_gate(original)
        changes = [dict(original, **{key: value}) for key, value in (
            ("apiCommit", "real"), ("composition", "live"), ("language", "fr"),
            ("screen", "99"), ("roles", ["platform_admin"]), ("engine", "webkit"))]
        for key, value in (("checkoutCommit", "0" * 40), ("githubSha", "0" * 40), ("trackedWorkingTree", "modified")):
            changed = copy.deepcopy(original)
            changed["frontend"][key] = value
            changes.append(changed)
        for changed in changes:
            with self.assertRaises(review.Rejected):
                review.context_gate(changed)

    def test_existing_demo_catering_context_is_allowed_only_for_its_exact_recorded_scope(self):
        recorded = context()
        recorded.update({
            "composition": "isolated-demo-component-routed-media-fixture",
            "screen": "19", "state": "demo-catering-before-edit", "language": "en",
            "roles": ["conference_manager"], "viewport": {"width": 1280, "height": 900},
            "test": "CO-306 new Catering owner/image write locks the complete draft and retains unrelated unsaved entries",
        })
        review.context_gate(recorded)
        self.assertNotIn(recorded["composition"], review.COMPOSITIONS)
        for key, value in (("composition", "isolated-demo-component-routed-media-fixture-other"),
                           ("screen", "18"), ("state", "catalogue-status-and-authoritative-summary"),
                           ("language", "de"), ("roles", ["employee", "conference_manager"]),
                           ("viewport", {"width": 390, "height": 900}), ("test", "other test"),
                           ("apiCommit", review.API_COMMIT), ("engine", "webkit"),
                           ("project", "webkit-mobile")):
            with self.subTest(field=key), self.assertRaises(review.Rejected):
                review.context_gate(dict(recorded, **{key: value}))

    def test_primary_selector_requires_all_exact_states_once(self):
        captures = []
        for screen, (state, width) in review.PRIMARY.items():
            capture = "guest-welcome-screen" if screen == "13" else "screen-" + screen
            captures.append(({"screen": screen, "state": state, "viewport": {"width": width},
                              "language": "de", "capture": capture}, {}))
        self.assertEqual(len(review.selected_captures(captures)), 27)
        for changed in (captures[:-1], captures + [captures[0]]):
            with self.assertRaises(review.Rejected):
                review.selected_captures(changed)

    def test_attachment_type_and_path_rejections(self):
        source = review.archive(make_zip([("data/a.png", png())]))
        for attachment in ({"contentType": "text/html", "path": "data/a.png"},
                           {"contentType": "image/png", "path": "../a.png"},
                           {"contentType": "image/png", "path": "https://invalid.example/a.png"}):
            with self.assertRaises(review.Rejected):
                review.attachment_file(source, attachment, "image/png", "png")

    def test_geometry_minimizes_arbitrary_text_and_rejects_unbounded_values(self):
        minimized = review.numeric_geometry({"language": "de", "title": "private", "text": "private",
                                             "name": "private", "bounds": {"x": 1, "width": 44}, "other": "private"})
        self.assertNotIn("title", minimized)
        self.assertIsNone(minimized["other"])
        self.assertEqual(minimized["bounds"], {"x": 1, "width": 44})
        for value in (float("nan"), 1e10, list(range(301))):
            with self.assertRaises(review.Rejected):
                review.numeric_geometry(value)

    def test_pdf_rejects_active_encrypted_truncated_or_wrong_page_count(self):
        pdf = b"%PDF-1.4\n" + b"%padding\n" * 150 + b"/Type /Page\n/Type /Page\n%%EOF"
        self.assertEqual(review.pdf_pages(pdf), 2)
        for value in (pdf[:-5], pdf.replace(b"/Type /Page\n", b"", 1),
                      pdf.replace(b"%%EOF", b"/JavaScript %%EOF"), pdf.replace(b"%%EOF", b"/Encrypt %%EOF")):
            with self.assertRaises(review.Rejected):
                review.pdf_pages(value)

    def test_zoom_requires_22_originals_and_actual_factor_two(self):
        self.assertEqual(len(review.ZOOM_PNGS), 22)
        for value in ({"actualTabZoom": 1}, {"actualTabZoom": 1.999}, {"evidence": []}):
            source = review.archive(make_zip([("manager-worklist-zoom-evidence.json", json.dumps(value))]))
            with self.assertRaises(review.Rejected):
                review.zoom_images(source)

    def test_emit_rejects_over_budget_before_any_output(self):
        output = io.StringIO()
        with patch.object(review, "MAX_IMAGE_TOTAL", 1), contextlib.redirect_stdout(output), self.assertRaises(review.Rejected):
            review.emit(output_images(), {"captureInventory": []}, [], 0)
        self.assertEqual(output.getvalue(), "")


    def test_output_group_accepts_only_eight_fixed_decimal_selectors(self):
        for group in range(8):
            self.assertEqual(review.output_group(str(group)), group)
        for value in (None, True, 0, "", "8", "-1", "01", "+1", "1 ", " 1", "1\n"):
            with self.subTest(value=repr(value)), self.assertRaises(review.Rejected):
                review.output_group(value)

    def test_groups_cover_all_108_images_once_without_changing_bytes(self):
        images = output_images()
        manifest = {"captureInventory": [], "head": review.HEAD}
        seen, inventory_hashes = [], set()
        for group in range(8):
            output = io.StringIO()
            with contextlib.redirect_stdout(output):
                review.emit(images, manifest, [], group)
            lines = output.getvalue().splitlines()
            header = json.loads(lines[0].removeprefix("CM_REVIEW_MANIFEST "))
            self.assertEqual(header["outputGroup"], group)
            self.assertEqual(len(header["imageInventory"]), 108)
            inventory_hashes.add(header["inventorySha256"])
            current, encoded = None, ""
            for line in lines[1:]:
                if line.startswith("CM_IMAGE_BEGIN "):
                    current = json.loads(line.removeprefix("CM_IMAGE_BEGIN "))
                    encoded = ""
                    self.assertEqual(current["outputGroup"], group)
                elif line.startswith("CM_IMAGE_DATA "):
                    _, index, offset, chunk = line.split(" ", 3)
                    self.assertEqual(int(index), current["index"])
                    self.assertEqual(int(offset), len(encoded))
                    encoded += chunk
                elif line.startswith("CM_IMAGE_END "):
                    _, index, length = line.split(" ")
                    self.assertEqual((int(index), int(length)), (current["index"], len(encoded)))
                    original = images[int(index)][1]
                    self.assertEqual(base64.b64decode(encoded, validate=True), original)
                    self.assertEqual(current["imageSha256"], review.sha(original))
                    self.assertEqual(current["imageBytes"], len(original))
                    seen.append(int(index))
            completed = json.loads(lines[-1].removeprefix("CM_REVIEW_COMPLETE "))
            expected = [i for i in range(108) if i % 8 == group]
            self.assertEqual(completed["images"], len(expected))
            self.assertEqual(completed["binaryBytes"], sum(len(images[i][1]) for i in expected))
            self.assertLessEqual(completed["binaryBytes"], 3 * review.MIB)
        self.assertEqual(sorted(seen), list(range(108)))
        self.assertEqual(len(set(seen)), 108)
        self.assertEqual(len(inventory_hashes), 1)
        self.assertEqual(manifest, {"captureInventory": [], "head": review.HEAD})

    def test_invalid_group_and_incomplete_duplicate_or_corrupt_inventory_emit_nothing(self):
        images = output_images()
        variants = [images[:-1], images + [images[0]], images[:-1] + [images[0]],
                    images[:-1] + [(images[-1][0], b"not png")],
                    images[:-1] + [(dict(images[-1][0], reviewGroup="primary"), images[-1][1])]]
        for group, values in [(0, value) for value in variants] + [(group, images) for group in (-1, 8, True, "0", None)]:
            output = io.StringIO()
            with contextlib.redirect_stdout(output), self.assertRaises(review.Rejected):
                review.emit(values, {"captureInventory": []}, [], group)
            self.assertEqual(output.getvalue(), "")

    def test_actual_three_mib_group_overflow_rejects_before_output(self):
        images = output_images()
        padding, kind = b"x" * (3 * review.MIB), b"ruSt"
        chunk = struct.pack(">I", len(padding)) + kind + padding + struct.pack(">I", zlib.crc32(kind + padding) & 0xffffffff)
        oversized = png()[:-12] + chunk + png()[-12:]
        self.assertEqual(review.png_dimensions(oversized), {"width": 1, "height": 1})
        images[-1] = (images[-1][0], oversized)
        output = io.StringIO()
        with contextlib.redirect_stdout(output), self.assertRaisesRegex(review.Rejected, "image-group-budget"):
            review.emit(images, {"captureInventory": []}, [], 0)
        self.assertEqual(output.getvalue(), "")

    def test_nonselected_group_and_metadata_overflow_are_rejected_before_output(self):
        images = output_images()
        for constant, limit in (("MAX_GROUP_BYTES", len(png()) * 13), ("MAX_METADATA_BYTES", 1)):
            output = io.StringIO()
            with patch.object(review, constant, limit), contextlib.redirect_stdout(output), self.assertRaises(review.Rejected):
                review.emit(images, {"captureInventory": []}, [], 7)
            self.assertEqual(output.getvalue(), "")
        output = io.StringIO()
        with contextlib.redirect_stdout(output), self.assertRaises(review.Rejected):
            review.emit(images, {"captureInventory": []}, [{"capture": "geometry", "value": "x" * 200_001}], 7)
        self.assertEqual(output.getvalue(), "")

    def test_source_gate_rejects_private_repo_moved_head_or_failed_producer(self):
        prefix = f"/repos/{review.REPOSITORY}"
        responses = {
            prefix: {"private": False, "visibility": "public"},
            prefix + "/pulls/479": {"head": {"sha": review.HEAD}, "base": {"sha": review.BASE}},
            prefix + f"/actions/runs/{review.RUN}": {"id": review.RUN, "head_sha": review.HEAD,
                "event": "pull_request", "run_attempt": 1, "name": "CI", "status": "in_progress", "conclusion": None},
            prefix + f"/git/commits/{review.CHECKOUT}": {"tree": {"sha": review.TREE},
                "parents": [{"sha": review.BASE}, {"sha": review.HEAD}]},
        }
        for job_id, name in ((review.CHROMIUM_JOB, "browser-e2e (chromium-desktop)"), (review.SHARED_JOB, "shared-demo-e2e")):
            responses[prefix + f"/actions/jobs/{job_id}"] = {"run_id": review.RUN, "name": name,
                "status": "completed", "conclusion": "success"}
        def fake_api(path, token):
            return responses[path]
        with patch.object(review, "api", side_effect=fake_api):
            self.assertEqual(review.source_gate("synthetic")["head"], review.HEAD)
            changes = [(prefix, "private", True),
                       (prefix + f"/actions/jobs/{review.SHARED_JOB}", "conclusion", "failure")]
            for path, key, value in changes:
                previous = responses[path][key]
                responses[path][key] = value
                with self.assertRaises(review.Rejected):
                    review.source_gate("synthetic")
                responses[path][key] = previous
            responses[prefix + "/pulls/479"]["head"]["sha"] = "0" * 40
            with self.assertRaises(review.Rejected):
                review.source_gate("synthetic")


if __name__ == "__main__":
    unittest.main()
