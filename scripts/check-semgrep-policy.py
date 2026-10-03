#!/usr/bin/env python3
"""Exercise local Semgrep rules and fail-closed exit codes without executing fixtures."""

import json
import os
from pathlib import Path
import re
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parents[1]
CONFIG = ROOT / ".semgrep.yml"
ENV = {**os.environ, "SEMGREP_SEND_METRICS": "off", "SEMGREP_ENABLE_VERSION_CHECK": "0"}

DYNAMIC = "cm-js-dynamic-eval"
HTML = "cm-js-unsafe-html-sink"
WRITE = "cm-js-document-write"
INLINE = "cm-js-inline-handler"
URL = "cm-js-tainted-location-to-html"
STORAGE = "cm-js-tainted-storage-to-html"

# Fixtures are scan inputs only. Never import or execute these JavaScript files.
CASES = {
    "dynamic-eval.js": ("eval(input);", {DYNAMIC}),
    "dynamic-function.js": ("new Function(input);", {DYNAMIC}),
    "inner-html.js": ("element.innerHTML = input;", {HTML}),
    "outer-html.js": ("element.outerHTML = input;", {HTML}),
    "adjacent-html.js": ('element.insertAdjacentHTML("beforeend", input);', {HTML}),
    "document-write.js": ("document.write(input);", {WRITE}),
    "inline-handler.js": ('element.setAttribute("onclick", input);', {INLINE}),
    "url-taint.js": ("const value = window.location.hash; element.innerHTML = value;", {HTML, URL}),
    "query-taint.js": ('const value = new URLSearchParams(location.search).get("name"); element.outerHTML = value;', {HTML, URL}),
    "local-storage-taint.js": ('const value = localStorage.getItem("name"); element.innerHTML = value;', {HTML, STORAGE}),
    "session-storage-taint.js": ('const value = sessionStorage.getItem("name"); element.insertAdjacentHTML("beforeend", value);', {HTML, STORAGE}),
    "no-inline-suppression.js": ("element.innerHTML = input; // nosemgrep", {HTML}),
}
SAFE = '''function safe(element) {
  element.textContent = window.location.hash;
  element.setAttribute("aria-label", localStorage.getItem("name"));
  element.addEventListener("click", () => {});
}
'''


def scan(directory, config=CONFIG):
    completed = subprocess.run(
        ["semgrep", "scan", "--config", str(config), "--oss-only", "--error", "--strict",
         "--disable-nosem", "--optimizations", "none", "--metrics=off", "--disable-version-check",
         "--no-rewrite-rule-ids", "--json", str(directory)],
        cwd=directory, env=ENV, text=True, capture_output=True, timeout=60, check=False,
    )
    try:
        payload = json.loads(completed.stdout)
    except json.JSONDecodeError as error:
        raise RuntimeError(f"Semgrep did not return JSON (exit {completed.returncode}): {completed.stderr[-3000:]}") from error
    return completed.returncode, payload


def require(condition, message):
    if not condition:
        raise RuntimeError(message)


def verify_syntax_gate(root):
    """Exercise the existing Node syntax gate on fixtures without executing them."""
    directory = root / "syntax-gate"
    for name in ("src", "tests", "scripts"):
        (directory / name).mkdir(parents=True)
    (directory / "src" / "safe.js").write_text(SAFE)

    def check():
        return subprocess.run(
            ["node", str(ROOT / "scripts" / "check-syntax.mjs")],
            cwd=directory, text=True, capture_output=True, timeout=30, check=False,
        )

    completed = check()
    require(completed.returncode == 0, "The existing syntax gate must accept valid JavaScript.")
    # Both fragments must fail the real syntax gate, independently of Semgrep's
    # rule prefiltering or permissive recovery of incomplete JavaScript.
    for fragment in ("function broken( {\n", "eval(\n"):
        (directory / "src" / "broken.js").write_text(fragment)
        completed = check()
        require(
            completed.returncode != 0 and "SyntaxError" in completed.stderr,
            "The existing syntax gate must reject malformed JavaScript independently of SAST rule selection.",
        )
    print("PASS: existing JavaScript syntax gate rejects malformed input with and without rule tokens.")


def main():
    configured_ids = set(re.findall(r"^  - id: ([a-z0-9-]+)$", CONFIG.read_text(), re.MULTILINE))
    covered_ids = set().union(*(expected for _, expected in CASES.values()))
    require(configured_ids == covered_ids, "Every committed rule must have a positive self-test; update fixtures when rules change.")

    with tempfile.TemporaryDirectory(prefix="cm-semgrep-policy-") as temporary:
        root = Path(temporary)
        bad = root / "positive"
        bad.mkdir()
        for name, (body, _) in CASES.items():
            (bad / name).write_text(f"function sample(element, input) {{\n  {body}\n}}\n")
        status, result = scan(bad)
        require(status == 1, f"Positive fixtures must exit 1, not {status}.")
        require(not result.get("errors"), f"Positive fixtures had scan errors: {result.get('errors')}")
        scanned = {Path(path).name for path in result.get("paths", {}).get("scanned", [])}
        require(scanned == set(CASES), "Semgrep must scan every positive fixture; ignored inputs cannot pass.")
        actual = {name: set() for name in CASES}
        for finding in result.get("results", []):
            name = Path(finding["path"]).name
            require(name in actual, f"Unexpected fixture finding: {name}")
            require(not finding.get("extra", {}).get("is_ignored", False), "Inline suppression must not suppress security policy findings.")
            actual[name].add(finding["check_id"])
        for name, (_, expected) in CASES.items():
            require(actual[name] == expected, f"{name}: expected {sorted(expected)}, got {sorted(actual[name])}.")
        print(f"PASS: {len(CASES)} positive fixtures cover all {len(covered_ids)} local rules, including inline-suppression rejection.")

        clean = root / "negative"
        clean.mkdir()
        (clean / "safe-dom.js").write_text(SAFE)
        status, result = scan(clean)
        require(status == 0 and not result.get("results") and not result.get("errors"), "Safe DOM APIs must pass without findings or scan errors.")
        require(len(result.get("paths", {}).get("scanned", [])) == 1, "The safe fixture must actually be scanned.")
        print("PASS: safe DOM and event-listener fixture exits 0.")

        verify_syntax_gate(root)

        malformed = root / "syntax-error"
        malformed.mkdir()
        broken = malformed / "broken.js"
        broken.write_text("eval(\n")
        status, result = scan(malformed)
        # Semgrep can recover the incomplete AST and report the eval policy
        # finding instead of a parser error. Either must block this input; the
        # Node gate above, not Semgrep, provides complete syntax validation.
        blocked_eval = any(
            finding.get("check_id") == DYNAMIC
            and Path(finding.get("path", "")) == broken
            and not finding.get("extra", {}).get("is_ignored", False)
            for finding in result.get("results", [])
        )
        require(
            status != 0 and (bool(result.get("errors")) or blocked_eval),
            f"Malformed eval input must be blocked by a scan error or its eval finding: exit={status}, output={json.dumps(result, sort_keys=True)[:4000]}",
        )
        print("PASS: malformed eval input remains blocked by Semgrep.")

        invalid = root / "invalid-rules.yml"
        invalid.write_text("rules: [\n")
        status, result = scan(clean, invalid)
        # Assert the security contract, not CLI diagnostic wording or JSON layout.
        # The same scanner has already passed the valid-rule fixtures above.
        require(
            status != 0,
            f"Invalid rule configuration must block execution with a nonzero exit: exit={status}, output={json.dumps(result, sort_keys=True)[:4000]}",
        )
        print("PASS: invalid rule configuration fails closed.")


if __name__ == "__main__":
    main()
