"""Offline regression and rejection cases for the fixed Policy-EN reader."""
import contextlib
import copy
import io
import json
import unittest
from unittest.mock import patch

import pr479_artifact_review as core
import pr479_policy_failure as policy
from test_pr479_artifact_review import make_zip, png


def tree(value="366", invalid=None):
    attributes = {"id": policy.AMOUNT_ID, "__playwright_value_": value, "min": "0.0006944444444444445",
                  "max": "732", "step": "any"}
    if invalid is not None:
        attributes["aria-invalid"] = invalid
    return ["HTML", {}, ["INPUT", attributes], ["SELECT", {"id": policy.UNIT_ID},
            ["OPTION", {"value": "minutes", "__playwright_selected_": "false"}],
            ["OPTION", {"value": "days", "__playwright_selected_": "true"}]]]


def history(*roots):
    return [{"html": root, "nodes": policy.node_index(root)} for root in roots]


def records():
    test_rows = [{"testId": str(index), "outcome": "expected", "projectName": "webkit-mobile",
                  "results": [{"status": "passed", "retry": 0}]} for index in range(599)]
    failed = test_rows[-1]
    failed.update({"outcome": "unexpected", "title": policy.TEST_TITLE,
                   "location": {"file": policy.TEST_FILE, "line": 466},
                   "results": [{"status": "failed", "retry": 0}]})
    report = {"stats": {"total": 599, "expected": 598, "unexpected": 1, "flaky": 0, "skipped": 0, "ok": False},
              "projectNames": ["webkit-mobile"], "errors": []}
    return report, test_rows


class PolicyFailureTests(unittest.TestCase):
    def test_only_exact_one_failure_from_complete_native_suite_is_selected(self):
        report, rows = records()
        self.assertIs(policy.failure_test(report, rows), rows[-1]["results"][0])
        for key, value in (("title", "different test"), ("projectName", "chromium-desktop"),
                           ("location", {"file": policy.TEST_FILE, "line": 467})):
            changed = copy.deepcopy(rows)
            changed[-1][key] = value
            with self.assertRaises(core.Rejected):
                policy.failure_test(report, changed)
        for key, value in (("expected", 599), ("unexpected", 0), ("skipped", 1), ("flaky", 1)):
            changed = copy.deepcopy(report)
            changed["stats"][key] = value
            with self.assertRaises(core.Rejected):
                policy.failure_test(changed, rows)
        changed = copy.deepcopy(rows)
        changed[-1]["results"][0]["retry"] = 1
        with self.assertRaises(core.Rejected):
            policy.failure_test(report, changed)

    def test_snapshot_postorder_references_preserve_actual_value_and_unit(self):
        first = tree()
        # INPUT=0, first OPTION=1, second OPTION=2, SELECT=3, HTML=4.
        second = ["HTML", {}, [[1, 0]], [[1, 3]]]
        snapshots = history(first, second)
        fields = policy.snapshot_fields(snapshots, 1)
        self.assertEqual(fields["amount"]["value"], "366")
        self.assertEqual(fields["unit"], "days")
        self.assertIsNone(fields["amount"]["ariaInvalid"])
        self.assertFalse(fields["amount"]["nativeValidityRecorded"])
        third = ["HTML", {}, ["INPUT", {"id": policy.AMOUNT_ID, "__playwright_value_": "0.001",
                                       "aria-invalid": "true"}], [[2, 3]]]
        snapshots.append({"html": third, "nodes": policy.node_index(third)})
        fields = policy.snapshot_fields(snapshots, 2)
        self.assertEqual((fields["amount"]["value"], fields["amount"]["ariaInvalid"], fields["unit"]),
                         ("0.001", "true", "days"))

    def test_snapshot_rejects_forward_out_of_range_cycles_and_duplicate_fields(self):
        for root in (["HTML", {}, [[1, 0]]], ["HTML", {}, [[0, 9000]]], ["HTML", {}, [[0, 0]]],
                     ["HTML", {}, ["INPUT", {"id": policy.AMOUNT_ID}], ["INPUT", {"id": policy.AMOUNT_ID}]]):
            with self.assertRaises(core.Rejected):
                policy.snapshot_fields(history(root), 0)

    def test_snapshot_rejects_non_numeric_field_data(self):
        for value in ("private@example.invalid", "https://invalid.example", "Bearer synthetic", "1" * 31):
            with self.assertRaises(core.Rejected):
                policy.snapshot_fields(history(tree(value)), 0)

    def test_aria_minimization_keeps_active_role_and_numeric_values_only(self):
        value = [{"role": "heading", "name": "Booking policies", "active": True, "url": "https://private.invalid"},
                 {"role": "spinbutton", "name": "Private name", "text": "366", "invalid": True},
                 {"role": "text", "text": "private@example.invalid"}]
        result = policy.minimized_aria(value)
        self.assertEqual(result["active"], [{"role": "heading", "bookingPolicyHeading": True}])
        self.assertEqual(result["spinbuttons"][0]["value"], "366")
        self.assertTrue(result["spinbuttons"][0]["invalid"])
        self.assertNotIn("private", json.dumps(result).lower())
        self.assertNotIn("url", json.dumps(result))

    def test_action_classifier_does_not_emit_unrelated_selectors(self):
        self.assertEqual(policy.action_kind({"method": "fill", "params": {"selector": "#" + policy.AMOUNT_ID}}),
                         "duration-amount")
        self.assertEqual(policy.action_kind({"method": "selectOption", "params": {"selector": "#" + policy.UNIT_ID}}),
                         "duration-unit")
        self.assertIsNone(policy.action_kind({"method": "fill", "params": {"selector": "#email"}}))

    def test_write_projection_preserves_only_revision_and_integer_minutes(self):
        payload = {"expectedRevision": 5, "configuration": {"versions": [{"rules": {"maximumAdvanceMinutes": 527040,
                                                                                  "private": "excluded"}}]},
                   "secret": "excluded"}
        result = policy.write_payload(payload)
        self.assertEqual(result, {"payloadRecorded": True, "expectedRevision": 5, "maximumAdvanceMinutes": 527040})
        for value in (1.44, 0, 1054081, "527040"):
            changed = copy.deepcopy(payload)
            changed["configuration"]["versions"][0]["rules"]["maximumAdvanceMinutes"] = value
            with self.assertRaises(core.Rejected):
                policy.write_payload(changed)
        self.assertEqual(policy.write_payload(None), {"payloadRecorded": False})

    def test_resource_traversal_and_external_references_are_rejected(self):
        trace = core.archive(make_zip([("safe", b"data")]))
        for reference in ("../outside", "https://invalid.example", "resources/../../outside"):
            with self.assertRaises(core.Rejected):
                policy.resource_json(trace, {"_file": reference})

    def test_lines_reject_invalid_or_non_object_events(self):
        for data in (b"invalid", b"[]\n", b'{"a":1}\nnull\n'):
            with self.assertRaises(core.Rejected):
                policy.json_lines(data)

    def test_end_to_end_synthetic_trace_preserves_timeline_without_raw_payloads(self):
        events = [{"type": "context-options", "origin": "library", "version": 10,
                   "browserName": "webkit", "playwrightVersion": "1.64.1"},
                  {"type": "before", "callId": "call@1", "startTime": 100, "method": "fill",
                   "params": {"selector": "#" + policy.AMOUNT_ID, "value": "0.001"}},
                  {"type": "frame-snapshot", "snapshot": {"frameId": "frame@1", "callId": "call@1",
                   "isMainFrame": True, "frameUrl": "https://conference.test/", "timestamp": 101,
                   "phase": "action", "html": tree()}},
                  {"type": "aria-snapshot", "callId": "call@1", "phase": "after", "timestamp": 102,
                   "file": "aria/call@1-after.json"},
                  {"type": "after", "callId": "call@1", "endTime": 103}]
        body = {"expectedRevision": 5, "configuration": {"versions": [{"rules": {"maximumAdvanceMinutes": 527040}}]}}
        network = {"type": "resource-snapshot", "snapshot": {"_monotonicTime": 50,
                   "request": {"method": "PUT", "url": "https://conference.test" + policy.POLICY_PATH,
                               "headers": [{"name": "Authorization", "value": "Never emit this"}],
                               "postData": {"text": json.dumps(body)}},
                   "response": {"status": 200}}}
        trace = core.archive(make_zip([
            ("trace.trace", "\n".join(json.dumps(event) for event in events)),
            ("trace.network", json.dumps(network)),
            ("aria/call@1-after.json", json.dumps([{"role": "heading", "name": "Booking policies", "active": True},
                                                 {"role": "spinbutton", "text": "366"}])),
        ]))
        with contextlib.redirect_stdout(io.StringIO()):
            actions, dom, aria, requests = policy.trace_evidence(trace)
        self.assertEqual(actions[0]["requestedValue"], "0.001")
        self.assertEqual(dom[0]["amount"]["value"], "366")
        self.assertTrue(aria[0]["active"][0]["bookingPolicyHeading"])
        self.assertEqual(requests[0]["maximumAdvanceMinutes"], 527040)
        encoded = json.dumps([actions, dom, aria, requests])
        for prohibited in ("https://", "Authorization", "Never emit this", "headers"):
            self.assertNotIn(prohibited, encoded)

    def test_error_context_minimization_does_not_emit_unrelated_text(self):
        item = {"name": "error-context", "contentType": "text/markdown",
                "body": '- heading "Booking policies" [active] [level=2]\n- spinbutton "Value": 366\n- text: private@example.invalid'}
        result = policy.error_context(None, [item])
        self.assertEqual(result["activeRoles"], ["heading"])
        self.assertEqual(result["numericSpinbuttonValues"], ["366"])
        self.assertNotIn("private", json.dumps(result))

    def test_source_run_and_job_must_both_retain_native_failure(self):
        with patch.object(core, "source_gate", return_value={"runStatus": "completed", "runConclusion": "success"}):
            with self.assertRaises(core.Rejected):
                policy.download_failure("synthetic")
        with patch.object(core, "source_gate", return_value={"runStatus": "completed", "runConclusion": "failure"}), \
             patch.object(core, "api", return_value={"run_id": core.RUN, "name": "browser-e2e (webkit-mobile)",
                                                   "status": "completed", "conclusion": "success"}):
            with self.assertRaises(core.Rejected):
                policy.download_failure("synthetic")


    def test_wrong_artifact_metadata_never_reaches_download(self):
        job = {"run_id": core.RUN, "name": "browser-e2e (webkit-mobile)",
               "status": "completed", "conclusion": "failure"}
        metadata = {"id": policy.ARTIFACT, "name": "playwright-report-webkit-mobile",
                    "size_in_bytes": policy.ARTIFACT_BYTES, "expired": False,
                    "digest": "sha256:" + policy.ARTIFACT_DIGEST,
                    "workflow_run": {"id": core.RUN, "head_sha": core.HEAD}}
        for key, value in (("id", policy.ARTIFACT + 1), ("size_in_bytes", policy.ARTIFACT_BYTES - 1),
                           ("expired", True), ("digest", "sha256:" + "0" * 64),
                           ("workflow_run", {"id": core.RUN, "head_sha": "0" * 40})):
            changed = {**metadata, key: value}
            with self.subTest(key=key), \
                 patch.object(core, "source_gate", return_value={"runStatus": "completed", "runConclusion": "failure"}), \
                 patch.object(core, "api", side_effect=[job, changed]) as api, \
                 patch.object(policy.urllib.request, "build_opener") as opener:
                with self.assertRaises(core.Rejected):
                    policy.download_failure("synthetic")
                self.assertEqual(api.call_count, 2)
                opener.assert_not_called()

    def test_small_original_image_is_emitted_without_replacement(self):
        picture = png()
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            policy.emit({}, "0" * 64, [], [], [], [], {}, picture)
        text = output.getvalue()
        self.assertIn("CM_POLICY_IMAGE_BEGIN ", text)
        self.assertIn('"imageSha256":"' + core.sha(picture) + '"', text)
        self.assertIn("CM_POLICY_IMAGE_END ", text)
        self.assertNotIn("CM_POLICY_IMAGE_OMITTED ", text)

    def test_large_original_image_is_metadata_only(self):
        picture = png()
        output = io.StringIO()
        with patch.object(policy, "MAX_IMAGE_OUTPUT", len(picture) - 1), contextlib.redirect_stdout(output):
            policy.emit({}, "0" * 64, [], [], [], [], {}, picture)
        text = output.getvalue()
        self.assertIn("CM_POLICY_IMAGE_OMITTED ", text)
        self.assertIn('"imageSha256":"' + core.sha(picture) + '"', text)
        self.assertNotIn("CM_POLICY_IMAGE_DATA ", text)
        self.assertIn('"images": 0', text)


    def test_valid_context_remains_silent_and_exact(self):
        event = {"version": 10, "browserName": "webkit", "playwrightVersion": "1.64.1"}
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            policy.require_browser_context(event, "0-trace.trace")
        self.assertEqual(output.getvalue(), "")

    def test_rejected_context_exposes_only_bounded_format_metadata(self):
        valid = {"version": 10, "browserName": "webkit", "playwrightVersion": "1.64.1"}
        for field, value in (("version", 9), ("version", 999999), ("browserName", ""),
                             ("browserName", "https://private.invalid/?token=secret"),
                             ("playwrightVersion", "1.64.2"), ("playwrightVersion", "private@example.invalid")):
            event = {**valid, field: value, "options": {"token": "never-emit", "user": "private@example.invalid"}}
            output = io.StringIO()
            with self.subTest(field=field, value=value), contextlib.redirect_stdout(output):
                with self.assertRaisesRegex(core.Rejected, "^policy-trace-version$"):
                    policy.require_browser_context(event, "0-trace.trace")
            text = output.getvalue()
            self.assertTrue(text.startswith("CM_POLICY_REJECTION_CONTEXT "))
            metadata = json.loads(text.split(" ", 1)[1])
            self.assertEqual(set(metadata), {"artifactId", "traceVersion", "engineClass", "originClass", "runtimeVersion",
                                            "expectedPlaywrightVersion", "streamClass", "numberedStream"})
            self.assertEqual(metadata["artifactId"], policy.ARTIFACT)
            self.assertTrue(metadata["numberedStream"])
            self.assertEqual(metadata["streamClass"], "trace")
            for prohibited in ("https://", "secret", "never-emit", "private@example", "options"):
                self.assertNotIn(prohibited, text)


    def test_trace_shape_keeps_only_presence_counts_and_known_phase_classes(self):
        events = [
            {"type": "context-options", "origin": "library", "version": 9, "browserName": "webkit",
             "playwrightVersion": "1.64.1", "options": {"private": "never-emit"}},
            {"type": "frame-snapshot", "snapshot": {"snapshotName": "before@private-value", "frameUrl": "https://private.invalid",
             "frameId": "private-frame", "html": ["HTML", {}, "private@example.invalid"], "timestamp": 123}},
            {"type": "frame-snapshot", "snapshot": {"callId": "private-call", "phase": "after", "isMainFrame": True}},
            {"type": "aria-snapshot", "callId": "private-call", "phase": "action", "file": "private-resource"},
            {"type": "aria-snapshot", "phase": "private-unknown", "snapshotName": "private-unknown"},
        ]
        output = io.StringIO()
        with contextlib.redirect_stdout(output):
            policy.emit_trace_shape([("0-trace.trace", events)])
        text = output.getvalue()
        shape = json.loads(text.split(" ", 1)[1])
        self.assertEqual(shape["frames"]["total"], 2)
        self.assertEqual(shape["frames"]["present"]["callId"], 1)
        self.assertEqual(shape["frames"]["snapshotNamePrefixes"]["before"], 1)
        self.assertEqual(shape["frames"]["phases"]["after"], 1)
        self.assertEqual(shape["aria"]["phases"]["action"], 1)
        self.assertEqual(shape["aria"]["phases"]["other"], 1)
        for prohibited in ("https://", "private", "never-emit", "123"):
            self.assertNotIn(prohibited, text)


if __name__ == "__main__":
    unittest.main()
