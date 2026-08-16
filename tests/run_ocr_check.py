#!/usr/bin/env python3
"""Run the OCR check in headless Chrome and report the result.

    python tests/run_ocr_check.py

Separate from the browser suite on purpose. Recognition takes tens of seconds and
needs 15 MB of vendored engine, so bolting it onto a two-second suite would make
every developer pay for it on every run. This is the deliberate check, run when
the OCR path or the vendored assets change.

It starts its own server on a spare port, drives Chrome with a real (not
background) window, and waits for the page to POST its verdict back.

Reading the verdict from a DOM dump was the first attempt and does not work:
``--virtual-time-budget`` fast-forwards timers but not real WebAssembly work, so
Chrome dumps the page while the engine is still loading and every run looks
empty. Having the page report when it is genuinely finished is both simpler and
correct.

Exit code 0 means every check passed.
"""

from __future__ import annotations

import http.server
import json
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
CANDIDATES = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    "google-chrome", "chromium", "chrome", "msedge",
]
# Recognition of two rendered pages, plus loading the engine and the English
# training data on a cold cache.
TIMEOUT_SECONDS = 300


def find_browser() -> str | None:
    for candidate in CANDIDATES:
        if Path(candidate).is_file():
            return candidate
        found = shutil.which(candidate)
        if found:
            return found
    return None


def free_port() -> int:
    with socket.socket() as sock:
        sock.bind(("127.0.0.1", 0))
        return sock.getsockname()[1]


#: Filled in by the page when it finishes, and waited on by the main thread.
FINISHED = threading.Event()
REPORT: dict = {}


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=str(ROOT), **kwargs)

    def do_POST(self):
        if self.path != "/__ocr_result":
            self.send_error(404)
            return
        length = int(self.headers.get("Content-Length") or 0)
        try:
            REPORT.update(json.loads(self.rfile.read(length) or b"{}"))
        except json.JSONDecodeError:
            REPORT["error"] = "the page sent something that was not JSON"
        self.send_response(204)
        self.end_headers()
        FINISHED.set()

    def end_headers(self):
        # The same no-store policy as tools/serve.py, for the same reason: a
        # cached module makes an edit look as though it had no effect.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, *args):
        pass


def main() -> int:
    # A Windows console defaults to cp1252 and cannot print the arrows and
    # dashes this report contains. Reconfiguring is better than stripping them:
    # the check output should read the same on every platform.
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except (AttributeError, ValueError):
        pass

    browser = find_browser()
    if not browser:
        print("No Chrome or Edge found, so the OCR check was not run.")
        return 1

    vendor = ROOT / "assets" / "vendor" / "tesseract-worker.min.js"
    if not vendor.exists():
        print("The OCR engine is not vendored. Run:\n"
              "    python tools/fetch_libraries.py")
        return 1

    fixture = ROOT / "tests" / "fixtures" / "scanned-cv-readable.pdf"
    if not fixture.exists():
        print("The readable scanned fixture is missing. Run:\n"
              "    python tests/make_fixtures.py")
        return 1

    port = free_port()
    server = http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    url = f"http://127.0.0.1:{port}/tests/ocr-check.html"
    print(f"Serving {ROOT.name} on port {port}")
    print(f"Running {url}")

    process = None
    # Chrome keeps a handle on its profile directory for a moment after it is
    # asked to stop, and Windows refuses to delete a file that is still open. The
    # directory is cleaned up on a best-effort basis rather than inside a `with`,
    # so a locked cache file cannot turn a passing check into a traceback.
    profile = tempfile.mkdtemp(prefix="ocrcheck")
    try:
        if True:
            process = subprocess.Popen([
                browser, "--headless=new", "--disable-gpu", "--no-first-run",
                "--no-default-browser-check", f"--user-data-dir={profile}",
                # Without these the page is treated as a background tab and the
                # WASM worker is throttled to the point of appearing hung. That
                # is what made this look broken when it was merely starved.
                "--disable-backgrounding-occluded-windows",
                "--disable-renderer-backgrounding",
                "--disable-background-timer-throttling",
                url,
            ], stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
            done = FINISHED.wait(TIMEOUT_SECONDS)
    finally:
        if process:
            process.terminate()
            try:
                process.wait(timeout=20)
            except subprocess.TimeoutExpired:
                process.kill()
        server.shutdown()
        shutil.rmtree(profile, ignore_errors=True)

    if not done:
        print(f"No result after {TIMEOUT_SECONDS}s. Recognition may be slow on "
              f"this machine, or the engine failed to start.")
        return 1

    for entry in REPORT.get("checks", []):
        detail = f" — {entry['detail']}" if entry.get("detail") else ""
        print(f"  {'PASS' if entry.get('ok') else 'FAIL'}  "
              f"{entry.get('name')}{detail}")

    failures = REPORT.get("failures", 1)
    print(f"\n{REPORT.get('summary', 'No summary')}")
    return 0 if failures == 0 else 1


if __name__ == "__main__":
    sys.exit(main())
