"""Extraction-case tests: assert tests/cases.json against pipeline/extract.py.

Run: python3 -m pytest tests/test_extract.py -q
The SAME case table is asserted against frontend/extract.js by
tests/test_extract_js.js (the coupled pair).
"""
import json
import sys
from pathlib import Path

PROJECT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PROJECT / "pipeline"))

import extract  # noqa: E402


def load_cases():
    return json.loads((PROJECT / "tests" / "cases.json").read_text())["cases"]


def test_shared_cases():
    fails = []
    for c in load_cases():
        got = extract.extract(c["text"])
        if got != c["expect"]:
            fails.append((c["name"], got, c["expect"]))
    assert not fails, f"failed cases: {fails}"


def test_normalize_doi_prefixes():
    assert extract.normalize_doi("https://doi.org/10.1000/ABC") == "10.1000/abc"
    assert extract.normalize_doi("doi:10.1000/ABC") == "10.1000/abc"
    assert extract.normalize_doi("10.1000/ABC") == "10.1000/abc"


def test_balanced_parens_doi():
    # The canonical parenthesized DOI must survive intact.
    got = extract.extract("see 10.1016/S0140-6736(97)11096-0 now")
    assert got["dois"] == ["10.1016/s0140-6736(97)11096-0"]


if __name__ == "__main__":
    import pytest
    raise SystemExit(pytest.main([__file__, "-q"]))
