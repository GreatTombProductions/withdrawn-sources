# Withdrawn Sources

**Retractions are public — but they're filed where the citing text isn't.** A claim can keep
borrowing a paper's authority long after the paper was withdrawn, because the withdrawal notice
never gets routed back to the text that cites it.

Withdrawn Sources closes that gap: paste any text containing citations (an article, a claim, a
reading list, a bibliography) and the tool extracts every DOI and PMID it can find, checks each
against a dated snapshot of the Retraction Watch Database, and shows which cited sources carry
**retraction**, **expression-of-concern**, **correction**, or **reinstatement** notices — with
dates, reasons, and links. A search surface covers the whole snapshot by title, author, and
journal for citations without machine-readable identifiers.

**Live site:** https://greattombproductions.github.io/withdrawn-sources/

## What it shows

- **Check citations** — paste text; identifiers are extracted in your browser
  (`10.xxxx/…` DOIs, `doi:`/`doi.org` forms, `PMID: …` labels, PubMed URLs); matches render as
  notice cards. “No notice found” is rendered as the qualified statement it is — not proof that
  none exists.
- **Search the database** — all ~72,600 records by title / first author / journal.
- **Method & sources** — the pinned snapshot receipt (URL, SHA-256, date, record count), field
  semantics, extraction + matching rules, coverage caveats, and attribution.

Nothing leaves your browser except the optional *live Crossref check* you click for identifiers
the snapshot does not contain (a direct request to `api.crossref.org`). No accounts, no tracking,
no backend.

## Data

Source: the **Retraction Watch Database** (Retraction Watch / The Center for Scientific
Integrity), made publicly available by Crossref and regenerated each working day at
`gitlab.com/crossref/retraction-watch-data` (`retraction_watch.csv`).

This site ships a **dated, pinned snapshot** — `data/raw/receipts.json` records the source URL,
fetch time, byte count, record count, and SHA-256 of the exact file used:

| | |
|---|---|
| Snapshot | fetched 2026-09-25 · 66,927,623 bytes · 72,646 records |
| SHA-256 | `268f48866dfe73e9…` (full hash on the method page and in the receipt) |
| Coverage | notices through 2026-09-19; corrections / expressions of concern are less comprehensively covered than retractions (Crossref's own caveat) |

## How it's built

```
pipeline/fetch.py      download the snapshot + write the pinned receipt (sha256)
pipeline/build.py      parse → lookup.json (d:/p: keys) + records/rec-NN.json shards + search.json + meta.json
pipeline/extract.py    identifier extraction — Python twin of frontend/extract.js (coupled pair)
frontend/              static site (index / search / method); everything client-side
tests/                 shared extraction cases (both languages) + data-contract + Playwright browser smoke
```

Rebuild (fetches/builds if local data is missing, then runs all gates and deploys):

```bash
python3 pipeline/fetch.py      # refresh the snapshot + receipt (changes the pinned sha)
python3 pipeline/build.py
python3 -m pytest tests/test_extract.py tests/test_data_contract.py -q
node tests/test_extract_js.js
python3 tests/run_browser_smoke.py
./deploy.sh                    # runs all of the above and publishes to GitHub Pages
```

## Tests

- `tests/cases.json` — one shared case table asserted by **both** extraction implementations
  (Python + JS), including the balanced-parenthesis DOI edge (`10.1016/S0140-6736(97)11096-0`).
- A differential parity pass runs additional fixtures through both implementations and requires
  zero diffs.
- `tests/test_data_contract.py` — generated-dataset shapes (lookup key prefixes, 16-field record
  arrays, search-row width, nature vocabulary, the canonical fixture resolving to both notices).
- `tests/browser_smoke.js` — staged-serve Playwright smoke: paste flow (retraction + correction +
  typed not-found), search flow, method receipts, zero console errors.

## Notes

- Statistics and notice records are **as published by the sources** — Retraction Watch curates
  the database; Crossref hosts it; this tool routes it, it does not adjudicate.
- Informational only; not research-integrity advice. If you believe a record is wrong, the
  Retraction Watch user guide describes their correction process for the database itself.
- Static site, no accounts, no tracking, no backend.
