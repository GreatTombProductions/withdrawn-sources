"""Identifier extraction from pasted text — DOIs and PMIDs.

This module is one half of a coupled pair: `frontend/extract.js` mirrors it
exactly. `tests/cases.json` is asserted by BOTH implementations (see
tests/test_extract.py and tests/test_extract_js.js); a differential parity pass
runs additional fixtures through both and requires zero diffs.

Rules (identical in both languages):

- DOI candidates begin at `10.` + 4-9 digits + `/` and continue over
  non-space, non-angle-bracket characters. DOIs may contain parentheses
  (e.g. 10.1016/S0140-6736(97)11096-0), so trailing punctuation is stripped
  (.,;:!?'"*]})) and a trailing `)` is dropped only while the candidate has
  unbalanced closing parentheses.
- PMID candidates come from label forms (`PMID: 1234`, `PubMed ID 1234`,
  `PubMed 1234`, optional `:#`) or PubMed URLs
  (`pubmed.ncbi.nlm.nih.gov/1234`). 5-9 digits.
- Normalization: DOIs lowercased with common prefixes stripped
  (https://doi.org/, doi:, etc.); PMIDs are digits-only. Bare '0' PMIDs are
  dropped at match time only if they are literally '0' — caller decides; we
  keep digits as found.
"""

from __future__ import annotations

import re

DOI_RE = re.compile(r"10\.\d{4,9}/[^\s\"<>]+")
TRAILING_PUNCT = ".,;:!?'\"*]}"
PMID_LABEL_RE = re.compile(r"(?:PMID|PubMed(?:\s*ID)?)\s*[:#]?\s*(\d{5,9})\b", re.IGNORECASE)
PMID_URL_RE = re.compile(r"pubmed\.ncbi\.nlm\.nih\.gov/(\d{5,9})", re.IGNORECASE)

DOI_PREFIXES = (
    "https://doi.org/",
    "http://doi.org/",
    "https://dx.doi.org/",
    "http://dx.doi.org/",
    "doi:",
)


def clean_doi(candidate: str) -> str:
    """Strip trailing punctuation and unbalanced closing parens from a DOI candidate."""
    s = candidate
    while s and s[-1] in TRAILING_PUNCT:
        s = s[:-1]
    while s.endswith(")") and s.count(")") > s.count("("):
        s = s[:-1]
    return s


def normalize_doi(doi: str) -> str:
    """Lowercase + strip common prefix forms. Used as the lookup key."""
    s = doi.strip().lower()
    for prefix in DOI_PREFIXES:
        if s.startswith(prefix):
            s = s[len(prefix):]
            break
    return s


def normalize_pmid(pmid: str) -> str:
    return re.sub(r"\D", "", pmid)


def extract(text: str) -> dict:
    """Extract identifiers from text, first-seen order, deduped.

    Returns {"dois": [normalized...], "pmids": [normalized...]}.
    """
    hits = []  # (position, kind, value)
    for m in DOI_RE.finditer(text):
        cleaned = clean_doi(m.group(0))
        if len(cleaned) > 6 and "/" in cleaned:
            hits.append((m.start(), "doi", normalize_doi(cleaned)))
    for m in PMID_LABEL_RE.finditer(text):
        hits.append((m.start(), "pmid", normalize_pmid(m.group(1))))
    for m in PMID_URL_RE.finditer(text):
        hits.append((m.start(), "pmid", normalize_pmid(m.group(1))))
    hits.sort(key=lambda h: h[0])

    dois, pmids = [], []
    seen = set()
    for _pos, kind, value in hits:
        key = (kind, value)
        if not value or key in seen:
            continue
        seen.add(key)
        (dois if kind == "doi" else pmids).append(value)
    return {"dois": dois, "pmids": pmids}
