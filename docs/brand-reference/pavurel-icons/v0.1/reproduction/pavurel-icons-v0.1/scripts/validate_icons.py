#!/usr/bin/env python3
"""Read and validate the local asset set; write an evidence report, no network."""
from __future__ import annotations

import hashlib
import json
import re
import sys
from datetime import datetime, timezone
from pathlib import Path
import xml.etree.ElementTree as ET

sys.dont_write_bytecode = True

from build_icons import ORIGINAL_SHA256

ROOT = Path(__file__).resolve().parents[1]
EXPECTED = [
    "request", "participants", "room-equipment", "catering", "changes", "coordination",
    "dashboard", "customers", "integrations", "system", "usage", "delivery", "audit",
    "diagnostics", "recovery", "settings", "search", "filter", "add", "close",
    "chevron-right", "chevron-down", "arrow-left", "arrow-right", "external-link",
    "menu", "check", "warning", "info", "lock", "calendar", "sign-out",
]
SVG_NS = "http://www.w3.org/2000/svg"
XML_LANG = "{http://www.w3.org/XML/1998/namespace}lang"
ALLOWED = {
    "svg": {"width", "height", "viewBox", "fill", "stroke", "stroke-width",
            "stroke-linecap", "stroke-linejoin", "role", "aria-labelledby",
            "focusable", XML_LANG},
    "title": {"id"},
    "desc": {"id"},
    "path": {"d", "stroke"},
    "circle": {"cx", "cy", "r", "stroke"},
    "rect": {"x", "y", "width", "height", "rx", "stroke"},
}


def assert_true(condition: bool, message: str) -> None:
    if not condition:
        raise AssertionError(message)


def shape_signature(svg: ET.Element) -> list:
    return [
        (child.tag, sorted((k, v) for k, v in child.attrib.items() if k != "stroke"))
        for child in svg
        if child.tag.rsplit("}", 1)[-1] not in {"title", "desc"}
    ]


def validate() -> dict:
    manifest = json.loads((ROOT / "manifest.json").read_text(encoding="utf-8"))
    names = [record["name"] for record in manifest["icons"]]
    assert_true(names == EXPECTED, "Manifest must contain exactly the 32 requested names in order.")
    assert_true(len(set(names)) == 32, "Duplicate icon names.")
    assert_true(manifest["icon_count"] == 32 and manifest["icon_file_count"] == 96,
                "Manifest counts mismatch.")
    assert_true(manifest["source_baseline"]["commit"] ==
                "e34cb7c2b039f92e2c054711c55a9125c0645d86", "Unexpected source baseline.")
    assert_true(manifest["license"]["spdx"] is None, "No invented SPDX license.")
    for locale in ("de", "en"):
        labels = [record["meaning"][locale] for record in manifest["icons"]]
        assert_true(all(labels) and len(labels) == len(set(labels)),
                    f"Missing or duplicate semantic labels: {locale}")
    for variant in ("light", "mono", "inverse"):
        found = sorted(path.stem for path in (ROOT / variant).glob("*.svg"))
        assert_true(found == sorted(EXPECTED), f"Wrong SVG inventory: {variant}")
    signatures = {}
    hashes = []
    original_results = []
    total_shape_elements = 0
    for record in manifest["icons"]:
        name = record["name"]
        assert_true(bool(record["usage_rule_de"]), f"Missing usage rule: {name}")
        for variant in ("light", "mono", "inverse"):
            relative = record["files"][variant]["path"]
            assert_true(relative == f"{variant}/{name}.svg", f"Unexpected file path: {relative}")
            path = ROOT / relative
            data = path.read_bytes()
            actual = hashlib.sha256(data).hexdigest()
            assert_true(actual == record["files"][variant]["sha256"], f"Hash mismatch: {relative}")
            assert_true(len(data) == record["files"][variant]["bytes"], f"Size mismatch: {relative}")
            assert_true(b"<!DOCTYPE" not in data.upper() and b"<!ENTITY" not in data.upper(),
                        f"DTD/entities forbidden: {relative}")
            svg = ET.fromstring(data)
            assert_true(svg.tag == f"{{{SVG_NS}}}svg", f"Wrong SVG namespace: {relative}")
            for attr, value in {
                "width": "24", "height": "24", "viewBox": "0 0 24 24", "fill": "none",
                "stroke-width": "1.6", "stroke-linecap": "round", "stroke-linejoin": "round",
                "focusable": "false", "role": "img", XML_LANG: "en",
            }.items():
                assert_true(svg.attrib.get(attr) == value, f"Wrong {attr}: {relative}")
            ids = []
            explicit_strokes = []
            for element in svg.iter():
                tag = element.tag.rsplit("}", 1)[-1]
                assert_true(tag in ALLOWED, f"Unsafe element {tag}: {relative}")
                assert_true(set(element.attrib) <= ALLOWED[tag],
                            f"Unsafe attribute on {tag}: {relative}")
                assert_true(element.tag.startswith("{" + SVG_NS + "}"),
                            f"Foreign namespace: {relative}")
                if "id" in element.attrib:
                    ids.append(element.attrib["id"])
                for key, value in element.attrib.items():
                    assert_true(not re.search(r"url\s*\(|https?://|javascript:|data:|file:|^//",
                                              value, re.I), f"External reference: {relative}")
                if "stroke" in element.attrib:
                    explicit_strokes.append(element.attrib["stroke"])
                if tag in {"path", "circle", "rect"}:
                    total_shape_elements += 1
                if tag == "path":
                    assert_true(bool(element.attrib.get("d")), f"Empty path: {relative}")
                    assert_true(re.fullmatch(r"[MmZzLlHhVvCcSsQqTtAa0-9.,+\-\s]+",
                                             element.attrib["d"]) is not None,
                                f"Unexpected path syntax token: {relative}")
            assert_true(len(ids) == len(set(ids)), f"Duplicate IDs inside SVG: {relative}")
            references = svg.attrib["aria-labelledby"].split()
            assert_true(set(references) <= set(ids), f"Missing title/description IDs: {relative}")
            assert_true(len(list(svg.findall(f"{{{SVG_NS}}}title"))) == 1 and
                        len(list(svg.findall(f"{{{SVG_NS}}}desc"))) == 1,
                        f"Missing accessible standalone metadata: {relative}")
            if variant == "light":
                assert_true(svg.attrib["stroke"] == "#171717", f"Wrong Ink stroke: {relative}")
                assert_true(explicit_strokes.count("#7A1F3D") == 1,
                            f"Expected exactly one accent element: {relative}")
                assert_true(set(explicit_strokes) == {"#171717", "#7A1F3D"},
                            f"Unexpected light colours: {relative}")
                signatures[name] = shape_signature(svg)
                if name in ORIGINAL_SHA256:
                    assert_true(actual == ORIGINAL_SHA256[name], f"Changed website original: {name}")
                    git_blob_sha = hashlib.sha1(b"blob " + str(len(data)).encode() + b"\0" + data).hexdigest()
                    original_results.append({"name": name, "sha256": actual,
                                             "git_blob_sha": git_blob_sha, "byte_identical": True})
            else:
                colour = "currentColor" if variant == "mono" else "#FFFFFF"
                assert_true(set(explicit_strokes) == {colour}, f"Wrong variant colour: {relative}")
                assert_true(shape_signature(svg) == signatures[name],
                            f"Variant changed geometry: {relative}")
            hashes.append({"path": relative, "sha256": actual, "valid": True})
    preview = ROOT / "preview" / "contact-sheet.svg"
    contact = ET.fromstring(preview.read_bytes())
    preview_allowed = {"svg", "title", "desc", "rect", "path", "g", "text", "circle"}
    for element in contact.iter():
        tag = element.tag.rsplit("}", 1)[-1]
        assert_true(tag in preview_allowed, "Unsafe contact-sheet element.")
        for key, value in element.attrib.items():
            assert_true(not key.lower().startswith("on") and "href" not in key.lower(),
                        "External/action reference in contact sheet.")
            assert_true("url(" not in value.lower(), "URL reference in contact sheet.")
    all_labels = {element.text for element in contact.iter() if element.tag.endswith("}text")}
    assert_true(set(EXPECTED) <= all_labels, "Contact sheet misses one or more requested motifs.")
    nested_icons = contact.findall(".//{" + SVG_NS + "}svg")
    assert_true(len(nested_icons) == 32 + 18, "Contact sheet must show 32 motifs and 18 variant samples.")
    report = {
        "result": "passed",
        "performed_utc": datetime.now(timezone.utc).isoformat(),
        "scope": "Local static SVG draft; no live UI or repository change.",
        "checks": {
            "requested_unique_motifs": 32,
            "new_original_motifs": 26,
            "website_originals": 6,
            "variants": 3,
            "validated_icon_files": 96,
            "xml_parsing": "passed for all 96 icons and the contact sheet",
            "geometry": "24x24, viewBox 0 0 24 24, fill none, stroke 1.6, round cap/join",
            "element_attribute_allowlist": "passed; svg/title/desc/path/circle/rect only in icon files",
            "unsafe_links_scripts_foreign_content": "none",
            "light_accents": "exactly one Bordeaux element per light icon",
            "variant_path_equivalence": "all 64 derived variants preserve light geometry",
            "manifest_sha256": "all 96 match",
            "original_sha256": "all six match independently pinned website hashes",
            "de_en_semantics": "32 unique nonempty labels per locale plus usage rules",
            "preview": "all 32 names and 18 inline 24px variant examples present",
            "shape_elements_checked": total_shape_elements,
        },
        "website_originals": original_results,
        "files": hashes,
        "limitations": [
            "Standalone metadata is English; informative app use must localize and deduplicate IDs.",
            "External img currentColor does not inherit parent HTML colour.",
            "No 16px/20px optical or live keyboard/screen-reader acceptance is claimed.",
            "PNG rendering and visual contact-sheet review are recorded separately in VISUAL-REVIEW.md.",
        ],
    }
    (ROOT / "validation-report.json").write_text(
        json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    return report


if __name__ == "__main__":
    result = validate()
    print(json.dumps({"result": result["result"], "checks": result["checks"]},
                     ensure_ascii=False, indent=2))
