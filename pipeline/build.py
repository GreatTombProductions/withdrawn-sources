"""Build the static dataset from the Retraction Watch snapshot.

Outputs (data/generated/):
  meta.json             — snapshot identity, counts, natures, year histogram, top reasons
  lookup.json           — {"d:<doi>": [record ids], "p:<pmid>": [record ids]} (normalized keys)
  records/rec-NN.json   — 100 shards (NN = id % 100), maps id -> compact-array detail
  search.json           — compact rows for the on-demand title/author/journal search

Record detail compact array (accessor order is part of the contract; mirrored in
frontend/common.js):
  [0]  title            [1]  authors (list)        [2]  journal
  [3]  publisher        [4]  nature                [5]  retraction_date (ISO or raw)
  [6]  retraction_doi   [7]  retraction_pmid       [8]  original_date (ISO or raw)
  [9]  original_doi     [10] original_pmid         [11] reason (list)
  [12] urls (list)      [13] article_type          [14] notes
  [15] country

Search row:
  [id, title, first_author, journal, year, nature]
"""

from __future__ import annotations

import csv
import json
import sys
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
RAW_DIR = PROJECT_DIR / "data" / "raw"
GEN_DIR = PROJECT_DIR / "data" / "generated"

sys.path.insert(0, str(SCRIPT_DIR))
from extract import normalize_doi, normalize_pmid  # noqa: E402

N_SHARDS = 100
NATURE_ORDER = ["Retraction", "Expression of concern", "Correction", "Reinstatement"]


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def write_json(path: Path, obj, pretty=False):
    path.parent.mkdir(parents=True, exist_ok=True)
    if pretty:
        path.write_text(json.dumps(obj, indent=1, ensure_ascii=False) + "\n")
    else:
        path.write_text(json.dumps(obj, separators=(",", ":"), ensure_ascii=False) + "\n")


def parse_date(raw: str):
    s = (raw or "").strip()
    if not s:
        return None
    for fmt in ("%m/%d/%Y %H:%M", "%m/%d/%Y"):
        try:
            return datetime.strptime(s, fmt).date().isoformat()
        except ValueError:
            pass
    return s  # keep raw if unrecognized


def split_list(raw: str, sep=";"):
    return [p.strip() for p in (raw or "").split(sep) if p and p.strip()]


def clean_doi_field(raw: str) -> str | None:
    s = (raw or "").strip()
    if not s or s.lower() in ("unavailable", "na", "n/a", "0"):
        return None
    return normalize_doi(s)


def clean_pmid_field(raw: str) -> str | None:
    s = normalize_pmid(raw or "")
    if not s or s == "0":
        return None
    return s


def main():
    receipts = json.loads((RAW_DIR / "receipts.json").read_text())
    csv_path = RAW_DIR / "retraction_watch.csv"
    print(f"[build] parsing {csv_path.name} ({receipts['bytes']} bytes)")

    records = {}
    doi_index = {}
    pmid_index = {}
    nature_counts = Counter()
    reason_counts = Counter()
    year_hist = Counter()
    no_doi = 0

    with open(csv_path, encoding="utf-8", errors="replace", newline="") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rid = (row.get("Record ID") or "").strip()
            if not rid.isdigit():
                continue
            rid = int(rid)
            nature = (row.get("RetractionNature") or "").strip()
            ret_date = parse_date(row.get("RetractionDate") or "")
            orig_date = parse_date(row.get("OriginalPaperDate") or "")
            ret_doi = clean_doi_field(row.get("RetractionDOI") or "")
            orig_doi = clean_doi_field(row.get("OriginalPaperDOI") or "")
            ret_pmid = clean_pmid_field(row.get("RetractionPubMedID") or "")
            orig_pmid = clean_pmid_field(row.get("OriginalPaperPubMedID") or "")
            reasons = split_list(row.get("Reason") or "")
            for r in reasons:
                reason_counts[r] += 1
            authors = split_list(row.get("Author") or "")
            urls = [u.strip() for u in (row.get("URLS") or "").split(",") if u.strip().startswith("http")]

            detail = [
                (row.get("Title") or "").strip(),
                authors,
                (row.get("Journal") or "").strip(),
                (row.get("Publisher") or "").strip(),
                nature,
                ret_date,
                ret_doi,
                ret_pmid,
                orig_date,
                orig_doi,
                orig_pmid,
                reasons,
                urls,
                (row.get("ArticleType") or "").strip(),
                (row.get("Notes") or "").strip(),
                (row.get("Country") or "").strip(),
            ]
            records[rid] = detail

            nature_counts[nature] += 1
            if ret_date and len(ret_date) >= 4 and ret_date[:4].isdigit():
                year_hist[ret_date[:4]] += 1
            if not orig_doi and not ret_doi:
                no_doi += 1
            for key, target in ((orig_doi, doi_index), (ret_doi, doi_index)):
                if key:
                    target.setdefault("d:" + key, []).append(rid)
            for key, target in ((orig_pmid, pmid_index), (ret_pmid, pmid_index)):
                if key:
                    target.setdefault("p:" + key, []).append(rid)

    print(f"[build] {len(records)} records; doi keys {len(doi_index)}; pmid keys {len(pmid_index)}")

    # ---- meta ------------------------------------------------------------
    years = sorted(year_hist.items())
    meta = {
        "generated_at": now_iso(),
        "snapshot": {
            "source": receipts["source"],
            "source_page": receipts["source_page"],
            "source_url": receipts["source_url"],
            "fetched_at": receipts["fetched_at"],
            "sha256": receipts["sha256"],
            "bytes": receipts["bytes"],
        },
        "counts": {
            "records": len(records),
            "by_nature": {n: nature_counts.get(n, 0) for n in NATURE_ORDER},
            "indexed_dois": len(doi_index),
            "indexed_pmids": len(pmid_index),
            "records_without_doi": no_doi,
        },
        "year_histogram": years,
        "top_reasons": reason_counts.most_common(12),
        "natures": NATURE_ORDER,
        "n_shards": N_SHARDS,
    }
    write_json(GEN_DIR / "meta.json", meta, pretty=True)

    # ---- lookup ----------------------------------------------------------
    lookup = {}
    for k, ids in doi_index.items():
        lookup[k] = sorted(set(ids))
    for k, ids in pmid_index.items():
        lookup[k] = sorted(set(ids))
    write_json(GEN_DIR / "lookup.json", lookup)
    print(f"[build] lookup.json {(GEN_DIR / 'lookup.json').stat().st_size/1e6:.1f} MB, {len(lookup)} keys")

    # ---- record shards ---------------------------------------------------
    shards = {}
    for rid, detail in records.items():
        shards.setdefault(rid % N_SHARDS, {})[str(rid)] = detail
    shard_dir = GEN_DIR / "records"
    shard_dir.mkdir(parents=True, exist_ok=True)
    total = 0
    for nn, obj in sorted(shards.items()):
        p = shard_dir / f"rec-{nn:02d}.json"
        write_json(p, obj)
        total += p.stat().st_size
    print(f"[build] {len(shards)} record shards, {total/1e6:.1f} MB total")

    # ---- search index ----------------------------------------------------
    search_rows = []
    for rid in sorted(records):
        d = records[rid]
        title = d[0]
        if not title:
            continue
        first_author = d[1][0] if d[1] else ""
        year = (d[5] or "")[:4]
        search_rows.append([rid, title[:180], first_author[:80], d[2][:64], year, d[4]])
    write_json(GEN_DIR / "search.json", {"rows": search_rows})
    print(f"[build] search.json {(GEN_DIR / 'search.json').stat().st_size/1e6:.1f} MB, {len(search_rows)} rows")

    print("[build] done")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
