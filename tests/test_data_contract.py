"""Data-contract tests for the generated static dataset (run after pipeline/build.py)."""
import json
from pathlib import Path

PROJECT = Path(__file__).resolve().parents[1]
GEN = PROJECT / "data" / "generated"


def load(name):
    return json.loads((GEN / name).read_text())


def test_meta_contract():
    meta = load("meta.json")
    c = meta["counts"]
    assert c["records"] > 50000
    assert set(meta["natures"]) == {"Retraction", "Expression of concern", "Correction", "Reinstatement"}
    assert sum(c["by_nature"].values()) == c["records"]
    assert c["indexed_dois"] > 50000 and c["indexed_pmids"] > 20000
    assert meta["snapshot"]["sha256"] and len(meta["snapshot"]["sha256"]) == 64
    assert meta["n_shards"] == 100
    assert meta["year_histogram"] and len(meta["year_histogram"]) > 50


def test_lookup_contract():
    lookup = load("lookup.json")
    assert len(lookup) > 100000
    n_d = n_p = 0
    for k, ids in lookup.items():
        assert k.startswith(("d:", "p:")), k
        assert isinstance(ids, list) and ids and all(isinstance(i, int) for i in ids)
        if k.startswith("d:"):
            n_d += 1
        else:
            n_p += 1
            assert k[2:].isdigit()
    assert n_d > 90000 and n_p > 40000
    # canonical fixture: the Wakefield DOI resolves to both notices
    ids = lookup.get("d:10.1016/s0140-6736(97)11096-0")
    assert ids and len(ids) >= 2


def test_record_shard_contract():
    ids = load("lookup.json")["d:10.1016/s0140-6736(97)11096-0"]
    recs = {}
    for i in ids:
        shard = load(f"records/rec-{i % 100:02d}.json")
        recs.update(shard)
    for i in ids:
        d = recs[str(i)]
        assert len(d) == 16
        assert isinstance(d[1], list) and isinstance(d[11], list)   # authors, reasons
        assert d[4] in ("Retraction", "Expression of concern", "Correction", "Reinstatement")
    natures = sorted(recs[str(i)][4] for i in ids)
    assert "Correction" in natures and "Retraction" in natures


def test_search_contract():
    d = load("search.json")
    rows = d["rows"]
    assert len(rows) > 50000
    for r in rows[:500]:
        assert len(r) == 6
        assert isinstance(r[0], int)
        assert isinstance(r[1], str) and r[1]
        assert r[5] in ("Retraction", "Expression of concern", "Correction", "Reinstatement")


if __name__ == "__main__":
    import pytest
    raise SystemExit(pytest.main([__file__, "-q"]))
