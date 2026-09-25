#!/usr/bin/env python3
"""Stage the static site and run the browser smoke test (Playwright).

Stages frontend/ + data/generated (meta, lookup, search + record shards) +
the pinned receipt at the site path data/receipts.json, serves on a local
port, and runs browser_smoke.js.
"""
from __future__ import annotations

import functools
import http.server
import os
import shutil
import subprocess
import tempfile
import threading
from pathlib import Path

PROJECT = Path(__file__).resolve().parents[1]


def main() -> int:
    with tempfile.TemporaryDirectory(prefix="ws-smoke-") as temporary:
        stage = Path(temporary)
        shutil.copytree(PROJECT / "frontend", stage, dirs_exist_ok=True)
        data = stage / "data"
        data.mkdir()
        gen = PROJECT / "data" / "generated"
        for name in ("meta.json", "lookup.json", "search.json"):
            shutil.copy2(gen / name, data / name)
        shutil.copytree(gen / "records", data / "records")
        shutil.copy2(PROJECT / "data" / "raw" / "receipts.json", data / "receipts.json")

        handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=stage)
        server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
        thread = threading.Thread(target=server.serve_forever, daemon=True)
        thread.start()
        try:
            environment = os.environ.copy()
            environment["SMOKE_BASE"] = f"http://127.0.0.1:{server.server_port}/"
            subprocess.run(
                ["node", str(PROJECT / "tests" / "browser_smoke.js")],
                check=True,
                timeout=300,
                env=environment,
            )
        finally:
            server.shutdown()
            server.server_close()
            thread.join(timeout=5)
    print("[smoke] browser smoke passed")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
