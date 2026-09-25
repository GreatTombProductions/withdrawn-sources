"""Fetch the Retraction Watch database snapshot + write a receipts record.

Source (canonical): the Crossref-maintained mirror of the Retraction Watch
Database, gitlab.com/crossref/retraction-watch-data, updated by Retraction
Watch every working day. The CSV is fetched as a dated snapshot; its SHA-256
is pinned in data/raw/receipts.json so the build is reproducible against the
exact snapshot it used.

Usage: python3 pipeline/fetch.py
"""

from __future__ import annotations

import hashlib
import subprocess
import sys
from datetime import datetime, timezone
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
PROJECT_DIR = SCRIPT_DIR.parent
RAW_DIR = PROJECT_DIR / "data" / "raw"

SOURCE_URL = "https://gitlab.com/crossref/retraction-watch-data/-/raw/main/retraction_watch.csv"
SOURCE_PAGE = "https://gitlab.com/crossref/retraction-watch-data"


def now_iso():
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()


def main():
    RAW_DIR.mkdir(parents=True, exist_ok=True)
    dest = RAW_DIR / "retraction_watch.csv"
    print(f"[fetch] {SOURCE_URL}")
    r = subprocess.run(
        ["curl", "-s", "-L", "--max-time", "300", "-o", str(dest),
         "-w", "%{http_code}", SOURCE_URL],
        capture_output=True, text=True,
    )
    code = (r.stdout or "").strip()
    if code != "200" or not dest.exists() or dest.stat().st_size == 0:
        raise SystemExit(f"[fetch] download failed (HTTP {code})")

    digest = sha256_file(dest)
    bytes_ = dest.stat().st_size
    print(f"[fetch] ok {dest.name} {bytes_} bytes sha256={digest[:16]}…")

    # Row count + header sanity
    with open(dest, encoding="utf-8", errors="replace") as f:
        header = f.readline()
        n_rows = sum(1 for _ in f)
    if "OriginalPaperDOI" not in header or "RetractionNature" not in header:
        raise SystemExit("[fetch] unexpected header — refusing to pin this snapshot")

    receipts = {
        "source": "Retraction Watch Database (Crossref mirror)",
        "source_page": SOURCE_PAGE,
        "source_url": SOURCE_URL,
        "fetched_at": now_iso(),
        "bytes": bytes_,
        "sha256": digest,
        "records": n_rows,
        "note": ("Dated snapshot. Retraction Watch updates the upstream file every working day; "
                 "re-run fetch.py to refresh and re-pin."),
    }
    import json
    (RAW_DIR / "receipts.json").write_text(json.dumps(receipts, indent=1) + "\n")
    print(f"[fetch] receipts -> {RAW_DIR / 'receipts.json'} ({n_rows} records)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
