"""Read one immutable synthetic Policy-EN failure; emit no raw trace/HTML/URL.

This is a one-use diagnostic, not an application test or release gate. Import
only the reviewed bounded archive/transport helpers from the sibling inspector.
"""
import base64
import json
import math
import os
import re
import resource
import sys
import urllib.error
import urllib.parse
import urllib.request

import pr479_artifact_review as core

BRANCH = "CO-306-pr479-88ed5f-policy-failure"
ARTIFACT = 13722349606
ARTIFACT_BYTES = 107045308
ARTIFACT_DIGEST = "385c9c14468b6a1b8df41088fe835551ce5adca1ad52ea509ada278514a22536"
JOB = 129519975843
MAX_IMAGE_OUTPUT = 256 * 1024
TEST_TITLE = "CO-306 policy duration units preserve minutes and reject fractional minutes in en"
TEST_FILE = "tenant-settings-production-composition.spec.js"
POLICY_PATH = "/api/v1/tenant/settings/booking-policies"
AMOUNT_ID = "tenant-policy-0-advance"
UNIT_ID = AMOUNT_ID + "-unit"
MIB = core.MIB
require = core.require


def number(value, maximum=1e12):
    require(type(value) in (int, float) and math.isfinite(value) and abs(value) <= maximum, "policy-number")
    return value


def numeric_text(value):
    if value is None:
        return None
    require(isinstance(value, str) and len(value) <= 30
            and re.fullmatch(r"(?:|-?[0-9]+(?:\.[0-9]*)?(?:[eE][+-]?[0-9]+)?)", value), "policy-numeric-text")
    return value


def trace_id(value):
    require(isinstance(value, str) and re.fullmatch(r"[A-Za-z0-9@_.-]{1,100}", value), "policy-trace-id")
    return value


def read_json(data, maximum=2 * MIB):
    require(isinstance(data, (bytes, str)) and len(data) <= maximum, "policy-json-size")
    try:
        return json.loads(data)
    except (ValueError, UnicodeError, RecursionError):
        raise core.Rejected("policy-json-invalid") from None


def json_lines(data):
    require(isinstance(data, bytes) and len(data) <= 24 * MIB, "policy-trace-size")
    lines = data.splitlines()
    require(0 < len(lines) <= 12000, "policy-event-count")
    result = []
    for line in lines:
        if not line:
            continue
        event = read_json(line, maximum=2 * MIB)
        require(isinstance(event, dict), "policy-event-object")
        result.append(event)
    return result


def download_failure(token):
    prefix = f"/repos/{core.REPOSITORY}"
    source = core.source_gate(token)
    require(source["runStatus"] == "completed" and source["runConclusion"] == "failure", "policy-source-run")
    job = core.api(prefix + f"/actions/jobs/{JOB}", token)
    require(job.get("run_id") == core.RUN and job.get("name") == "browser-e2e (webkit-mobile)"
            and job.get("status") == "completed" and job.get("conclusion") == "failure", "policy-source-job")
    metadata = core.api(prefix + f"/actions/artifacts/{ARTIFACT}", token)
    require(metadata.get("id") == ARTIFACT and metadata.get("name") == "playwright-report-webkit-mobile"
            and metadata.get("size_in_bytes") == ARTIFACT_BYTES and metadata.get("expired") is False
            and metadata.get("digest") == "sha256:" + ARTIFACT_DIGEST, "policy-artifact-metadata")
    require(metadata.get("workflow_run", {}).get("id") == core.RUN
            and metadata.get("workflow_run", {}).get("head_sha") == core.HEAD, "policy-artifact-source")
    location = core.api(prefix + f"/actions/artifacts/{ARTIFACT}/zip", token, redirect=True)
    request = urllib.request.Request(location, headers={"Accept": "application/zip"})
    try:
        with urllib.request.build_opener(core.NoRedirect).open(request, timeout=90) as response:
            require(response.status == 200, "policy-download-status")
            data = core.bounded_response(response, ARTIFACT_BYTES)
    except (urllib.error.URLError, OSError, TimeoutError):
        raise core.Rejected("policy-download-transport") from None
    require(len(data) == ARTIFACT_BYTES and core.sha(data) == ARTIFACT_DIGEST, "policy-artifact-bytes")
    return source, core.archive(data, maximum=ARTIFACT_BYTES)


def failure_test(report, tests):
    stats = report.get("stats", {})
    require(stats == {"total": 599, "expected": 598, "unexpected": 1, "flaky": 0, "skipped": 0, "ok": False}
            and report.get("projectNames") == ["webkit-mobile"] and report.get("errors") == [], "policy-report-stats")
    require(len(tests) == 599 and len({test.get("testId") for test in tests}) == 599, "policy-report-inventory")
    failed = [test for test in tests if test.get("outcome") != "expected"]
    require(len(failed) == 1, "policy-failure-count")
    test = failed[0]
    require(test.get("outcome") == "unexpected" and test.get("projectName") == "webkit-mobile"
            and test.get("title") == TEST_TITLE and test.get("location", {}).get("file") == TEST_FILE
            and test.get("location", {}).get("line") == 466, "policy-failure-identity")
    for entry in tests:
        require(entry.get("projectName") == "webkit-mobile", "policy-project-drift")
        observed = entry.get("results", [])
        require(len(observed) == 1 and observed[0].get("retry") == 0, "policy-no-retries")
        require(observed[0].get("status") == ("failed" if entry is test else "passed"), "policy-result-status")
    return test["results"][0]


def report_failure(source):
    html = core.member(source, "index.html")
    matches = re.findall(rb'<template id="playwrightReportBase64">data:application/zip;base64,([A-Za-z0-9+/=]+)</template>', html)
    require(len(matches) == 1 and len(matches[0]) <= 24 * MIB, "policy-report-envelope")
    try:
        payload = base64.b64decode(matches[0], validate=True)
    except ValueError:
        raise core.Rejected("policy-report-base64") from None
    packed = core.archive(payload, maximum=18 * MIB)
    require(all(re.fullmatch(r"(?:report|[a-f0-9]{20})\.json", name) for name in packed.namelist()), "policy-report-types")
    report = core.json_object(core.member(packed, "report.json"))
    tests = []
    for file in report.get("files", []):
        identifier = file.get("fileId")
        require(isinstance(identifier, str) and re.fullmatch(r"[a-f0-9]{20}", identifier), "policy-file-id")
        tests.extend(core.json_object(core.member(packed, identifier + ".json")).get("tests", []))
    return failure_test(report, tests)


def original_attachment(source, item, suffix, limit):
    path = item.get("path")
    require(isinstance(path, str) and re.fullmatch(r"data/[a-f0-9]{40}\." + suffix, path), "policy-attachment-path")
    return core.member(source, path, limit)


def node_index(html):
    nodes = []
    def visit(node, depth=0):
        require(depth <= 160, "policy-dom-depth")
        if isinstance(node, str):
            require(len(node) <= 2 * MIB, "policy-dom-text-size")
            nodes.append(node)
        elif isinstance(node, list) and node and isinstance(node[0], str):
            require(len(node) <= 5000, "policy-dom-children")
            for child in node[2:]:
                visit(child, depth + 1)
            nodes.append(node)
        else:
            require(isinstance(node, list) and len(node) == 1 and isinstance(node[0], list)
                    and len(node[0]) == 2 and all(type(v) is int for v in node[0]), "policy-dom-reference-shape")
        require(len(nodes) <= 15000, "policy-dom-node-count")
    visit(html)
    return nodes


def snapshot_fields(snapshots, index):
    found, visited = {}, [0]
    def visit(node, at, depth=0):
        visited[0] += 1
        require(depth <= 200 and visited[0] <= 40000, "policy-dom-expansion")
        if isinstance(node, str):
            return
        if isinstance(node, list) and node and isinstance(node[0], list):
            require(len(node) == 1 and len(node[0]) == 2, "policy-dom-reference-shape")
            delta, offset = node[0]
            require(type(delta) is int and type(offset) is int and delta >= 0
                    and 0 <= at - delta <= at and 0 <= offset < len(snapshots[at - delta]["nodes"]), "policy-dom-reference")
            return visit(snapshots[at - delta]["nodes"][offset], at - delta, depth + 1)
        require(isinstance(node, list) and node and isinstance(node[0], str), "policy-dom-node")
        attributes = node[1] if len(node) > 1 and isinstance(node[1], dict) else {}
        identifier = attributes.get("id")
        if identifier in (AMOUNT_ID, UNIT_ID):
            require(("amount" if identifier == AMOUNT_ID else "unit") not in found, "policy-dom-duplicate-field")
            if identifier == AMOUNT_ID:
                invalid = attributes.get("aria-invalid")
                require(invalid in (None, "", "true", "false"), "policy-dom-invalid")
                found["amount"] = {"value": numeric_text(attributes.get("__playwright_value_")),
                                   "ariaInvalid": invalid, "disabled": "disabled" in attributes,
                                   "minimum": numeric_text(attributes.get("min")),
                                   "maximum": numeric_text(attributes.get("max")),
                                   "step": attributes.get("step") if attributes.get("step") in ("any", "1") else None,
                                   "nativeValidityRecorded": False}
            else:
                options = []
                def option(child, source_index, level=0):
                    require(level <= 100, "policy-option-depth")
                    if isinstance(child, list) and child and isinstance(child[0], list):
                        delta, offset = child[0]
                        require(type(delta) is int and type(offset) is int and 0 <= source_index - delta <= source_index
                                and 0 <= offset < len(snapshots[source_index - delta]["nodes"]), "policy-option-reference")
                        return option(snapshots[source_index - delta]["nodes"][offset], source_index - delta, level + 1)
                    if isinstance(child, list) and child and isinstance(child[0], str):
                        attrs = child[1] if len(child) > 1 and isinstance(child[1], dict) else {}
                        if child[0].upper() == "OPTION" and attrs.get("__playwright_selected_") == "true":
                            require(attrs.get("value") in ("minutes", "hours", "days"), "policy-unit")
                            options.append(attrs["value"])
                        for descendant in child[2:]:
                            option(descendant, source_index, level + 1)
                option(node, at)
                require(len(options) <= 1, "policy-unit-count")
                found["unit"] = options[0] if options else None
        for child in node[2:]:
            visit(child, at, depth + 1)
    visit(snapshots[index]["html"], index)
    return found


def minimized_aria(value):
    require(isinstance(value, list), "policy-aria-root")
    active, spinbuttons, nodes = [], [], [0]
    allowed_roles = {"heading", "spinbutton", "button", "combobox", "textbox", "link", "document", "generic"}
    def visit(node, depth=0):
        nodes[0] += 1
        require(depth <= 100 and nodes[0] <= 10000, "policy-aria-size")
        if isinstance(node, str):
            return
        require(isinstance(node, dict), "policy-aria-node")
        role = node.get("role")
        if node.get("active") is True:
            active.append({"role": role if role in allowed_roles else "other",
                           "bookingPolicyHeading": role == "heading" and node.get("name") == "Booking policies"})
        if role == "spinbutton":
            text = node.get("text")
            numeric = text if isinstance(text, str) and re.fullmatch(r"-?[0-9]+(?:\.[0-9]+)?", text) else None
            spinbuttons.append({"ordinal": len(spinbuttons), "value": numeric_text(numeric),
                                "active": node.get("active") is True, "invalid": node.get("invalid") is True,
                                "disabled": node.get("disabled") is True})
        for child in node.get("children", []):
            visit(child, depth + 1)
    for node in value:
        visit(node)
    require(len(active) <= 8 and len(spinbuttons) <= 32, "policy-aria-results")
    return {"active": active, "spinbuttons": spinbuttons}


def action_kind(event):
    params, method = event.get("params", {}), event.get("method")
    selector = params.get("selector", "")
    if not isinstance(selector, str):
        return None
    if UNIT_ID in selector and method in ("selectOption", "expect"):
        return "duration-unit"
    if AMOUNT_ID in selector and method in ("fill", "expect", "focus"):
        return "duration-amount"
    if "booking-policies" in selector and 'button[type="submit"]' in selector and method == "click":
        return "policy-submit"
    return None


def resource_json(trace, descriptor):
    if not isinstance(descriptor, dict):
        return None
    if isinstance(descriptor.get("text"), str) and descriptor["text"]:
        return read_json(descriptor["text"], maximum=256 * 1024)
    reference = descriptor.get("_file") or descriptor.get("_sha1")
    if reference is None:
        return None
    require(isinstance(reference, str), "policy-body-reference")
    path = reference if reference.startswith("resources/") else "resources/" + reference
    require(re.fullmatch(r"resources/[a-f0-9]{40}(?:\.[a-z0-9]{1,10})?", path), "policy-body-resource")
    return read_json(core.member(trace, path, 256 * 1024), maximum=256 * 1024)


def write_payload(value):
    if value is None:
        return {"payloadRecorded": False}
    require(isinstance(value, dict) and type(value.get("expectedRevision")) is int
            and 0 <= value["expectedRevision"] <= 10000, "policy-write-revision")
    versions = value.get("configuration", {}).get("versions")
    require(isinstance(versions, list) and len(versions) == 1, "policy-write-versions")
    amount = versions[0].get("rules", {}).get("maximumAdvanceMinutes")
    require(type(amount) is int and 1 <= amount <= 1054080, "policy-write-minutes")
    return {"payloadRecorded": True, "expectedRevision": value["expectedRevision"], "maximumAdvanceMinutes": amount}


def trace_evidence(trace):
    names = trace.namelist()
    streams = [name for name in names if re.fullmatch(r"(?:[0-9]+-)?(?:trace|test)\.trace", name)]
    networks = [name for name in names if re.fullmatch(r"(?:[0-9]+-)?trace\.network", name)]
    require(1 <= len(streams) <= 6 and 1 <= len(networks) <= 4, "policy-trace-streams")
    actions, dom, aria, frames, library_contexts = {}, [], [], {}, []
    for stream in sorted(streams):
        events = json_lines(core.member(trace, stream, 24 * MIB))
        for event in events:
            kind = event.get("type")
            if kind == "context-options" and event.get("origin") == "library":
                require(event.get("version") == 10 and event.get("browserName") == "webkit"
                        and event.get("playwrightVersion") == "1.64.1", "policy-trace-version")
                library_contexts.append(True)
            if kind == "before" and action_kind(event):
                call = trace_id(event.get("callId"))
                require(call not in actions, "policy-action-duplicate")
                row = {"callId": call, "kind": action_kind(event), "method": event.get("method"),
                       "startTime": number(event.get("startTime")), "endTime": None, "error": None}
                if event.get("method") == "fill":
                    row["requestedValue"] = numeric_text(event.get("params", {}).get("value"))
                actions[call] = row
            elif kind == "after" and event.get("callId") in actions:
                actions[event["callId"]]["endTime"] = number(event.get("endTime"))
                actions[event["callId"]]["error"] = bool(event.get("error"))
            elif kind == "input" and event.get("callId") in actions:
                point = event.get("point")
                if isinstance(point, dict):
                    actions[event["callId"]]["point"] = {key: number(point.get(key), 100000) for key in ("x", "y")}
            elif kind == "frame-snapshot":
                snapshot = event.get("snapshot", {})
                frame = trace_id(snapshot.get("frameId"))
                key = (stream, frame)
                history = frames.setdefault(key, [])
                require(len(history) < 400, "policy-snapshot-count")
                html = snapshot.get("html")
                history.append({"html": html, "nodes": node_index(html)})
                if snapshot.get("isMainFrame") is not True:
                    continue
                url = urllib.parse.urlsplit(snapshot.get("frameUrl", ""))
                if url.scheme != "https" or url.netloc != "conference.test" or url.path != "/":
                    continue
                fields = snapshot_fields(history, len(history) - 1)
                if "amount" in fields:
                    phase = snapshot.get("phase")
                    require(phase in ("before", "action", "after"), "policy-snapshot-phase")
                    dom.append({"callId": trace_id(snapshot.get("callId")), "phase": phase,
                                "timestamp": number(snapshot.get("timestamp")), **fields})
            elif kind == "aria-snapshot":
                call, phase = trace_id(event.get("callId")), event.get("phase")
                require(phase in ("before", "action", "after"), "policy-aria-phase")
                path = f"aria/{call}-{phase}.json"
                require(event.get("file") == path, "policy-aria-file")
                value = read_json(core.member(trace, path, 2 * MIB))
                minimized = minimized_aria(value)
                if minimized["spinbuttons"]:
                    aria.append({"callId": call, "phase": phase, "timestamp": number(event.get("timestamp")), **minimized})
    require(library_contexts and 0 < len(actions) <= 100 and 0 < len(dom) <= 300 and len(aria) <= 300, "policy-trace-evidence")
    require(any(row.get("requestedValue") == "0.001" for row in actions.values()), "policy-fractional-fill")
    requests = []
    for name in sorted(networks):
        for event in json_lines(core.member(trace, name, 24 * MIB)):
            if event.get("type") != "resource-snapshot":
                continue
            snapshot = event.get("snapshot", {})
            request = snapshot.get("request", {})
            url = urllib.parse.urlsplit(request.get("url", ""))
            if url.scheme != "https" or url.netloc != "conference.test" or url.path != POLICY_PATH or url.query:
                continue
            method = request.get("method")
            require(method in ("GET", "PUT"), "policy-network-method")
            status = snapshot.get("response", {}).get("status")
            require(type(status) is int and 0 <= status <= 599, "policy-network-status")
            row = {"method": method, "kind": "policy-read" if method == "GET" else "policy-save",
                   "status": status, "monotonicTime": number(snapshot.get("_monotonicTime"))}
            if method == "PUT":
                row.update(write_payload(resource_json(trace, request.get("postData"))))
            else:
                value = resource_json(trace, snapshot.get("response", {}).get("content"))
                revision = value.get("revision") if isinstance(value, dict) else None
                require(revision is None or type(revision) is int and 0 <= revision <= 10000, "policy-read-revision")
                row["revision"] = revision
            requests.append(row)
    require(1 <= sum(row["method"] == "PUT" for row in requests) <= 4 and len(requests) <= 30, "policy-network-count")
    return sorted(actions.values(), key=lambda row: row["startTime"]), dom, aria, requests


def error_context(source, attachments):
    result = {"present": False, "activeRoles": [], "numericSpinbuttonValues": []}
    candidates = [a for a in attachments if a.get("name") == "error-context"]
    require(len(candidates) <= 1, "policy-error-context-count")
    if not candidates:
        return result
    item = candidates[0]
    require(item.get("contentType") in ("text/markdown", "text/plain"), "policy-error-context-type")
    text = item.get("body") if "body" in item else original_attachment(source, item, "md", 256 * 1024).decode("utf-8")
    require(isinstance(text, str) and len(text) <= 256 * 1024, "policy-error-context-size")
    result["present"] = True
    for line in text.splitlines():
        active = re.match(r'\s*-\s+(heading|spinbutton|button|combobox|textbox|link)\b.{0,300}\[active\]', line)
        if active:
            result["activeRoles"].append(active.group(1))
        value = re.match(r'\s*-\s+spinbutton\b[^:\n]{0,300}:\s*(-?[0-9]+(?:\.[0-9]+)?)\s*$', line)
        if value:
            result["numericSpinbuttonValues"].append(numeric_text(value.group(1)))
    require(len(result["activeRoles"]) <= 8 and len(result["numericSpinbuttonValues"]) <= 32, "policy-error-context-results")
    return result


def emit(source, trace_hash, actions, dom, aria, requests, context, screenshot):
    dimensions = core.png_dimensions(screenshot)
    require(dimensions["width"] <= 1500 and dimensions["height"] <= 3000, "policy-failure-image")
    manifest = {**source, "artifactId": ARTIFACT, "artifactBytes": ARTIFACT_BYTES,
                "artifactSha256": ARTIFACT_DIGEST, "traceSha256": trace_hash,
                "project": "webkit-mobile", "test": TEST_TITLE, "passed": 598, "failed": 1, "total": 599,
                "limits": ["Only one immutable synthetic failing test; no real API or customer data.",
                           "DOM snapshot has no native validity state or activeElement.",
                           "ARIA active markers, when present, are separate focus observations.",
                           "No rAF callback execution timestamp is recorded by this reader."]}
    print("CM_POLICY_MANIFEST " + json.dumps(manifest, separators=(",", ":"), sort_keys=True))
    for name, rows in (("ACTION", actions), ("DOM", dom), ("ARIA", aria), ("NETWORK", requests)):
        for row in rows:
            encoded = json.dumps(row, separators=(",", ":"), sort_keys=True)
            require(len(encoded) < 12000, "policy-output-row")
            print("CM_POLICY_" + name + " " + encoded)
    print("CM_POLICY_ERROR_CONTEXT " + json.dumps(context, separators=(",", ":"), sort_keys=True))
    image_metadata = {"capture": "policy-duration-en-native-failure.png",
                      "imageSha256": core.sha(screenshot), "imageBytes": len(screenshot), **dimensions}
    image_emitted = len(screenshot) <= MAX_IMAGE_OUTPUT
    if image_emitted:
        print("CM_POLICY_IMAGE_BEGIN " + json.dumps(image_metadata, separators=(",", ":")))
        encoded = base64.b64encode(screenshot).decode("ascii")
        for offset in range(0, len(encoded), 3000):
            print(f"CM_POLICY_IMAGE_DATA {offset} " + encoded[offset:offset + 3000])
        print(f"CM_POLICY_IMAGE_END {len(encoded)}")
    else:
        # Preserve the original digest, never resize or replace diagnostic evidence.
        print("CM_POLICY_IMAGE_OMITTED " + json.dumps({**image_metadata, "reason": "bounded-log-size"}, separators=(",", ":")))
    print("CM_POLICY_COMPLETE " + json.dumps({"actions": len(actions), "dom": len(dom), "aria": len(aria),
          "requests": len(requests), "policyWrites": sum(r["method"] == "PUT" for r in requests),
          "images": int(image_emitted)}))


def main():
    require(sys.argv == [sys.argv[0]], "policy-no-inputs")
    require(os.environ.get("GITHUB_REPOSITORY") == core.REPOSITORY
            and os.environ.get("GITHUB_REF") == "refs/heads/" + BRANCH
            and os.environ.get("GITHUB_EVENT_NAME") == "push", "policy-execution-scope")
    resource.setrlimit(resource.RLIMIT_AS, (1536 * MIB, 1536 * MIB))
    resource.setrlimit(resource.RLIMIT_CPU, (120, 120))
    token = os.environ.get("GH_TOKEN", "")
    require(bool(token), "policy-read-token")
    identity, source = download_failure(token)
    failed = report_failure(source)
    attachments = failed.get("attachments", [])
    traces = [a for a in attachments if a.get("name") == "trace" and a.get("contentType") == "application/zip"]
    pictures = [a for a in attachments if a.get("contentType") == "image/png"]
    require(len(traces) == 1 and len(pictures) == 1, "policy-failure-attachments")
    trace_bytes = original_attachment(source, traces[0], "zip", 32 * MIB)
    trace = core.archive(trace_bytes, maximum=32 * MIB)
    actions, dom, aria, requests = trace_evidence(trace)
    screenshot = original_attachment(source, pictures[0], "png", 4 * MIB)
    context = error_context(source, attachments)
    emit(identity, core.sha(trace_bytes), actions, dom, aria, requests, context, screenshot)


if __name__ == "__main__":
    try:
        main()
    except core.Rejected as error:
        print("CM_POLICY_REJECTED " + str(error), file=sys.stderr)
        sys.exit(1)
    except Exception:
        print("CM_POLICY_REJECTED unexpected-processing-error", file=sys.stderr)
        sys.exit(1)
