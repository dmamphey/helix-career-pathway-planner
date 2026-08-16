#!/usr/bin/env python3
"""Download the two document-reading libraries for self-hosted deployment.

    python tools/fetch_libraries.py

Helix reads PDF and DOCX files in the browser, which needs PDF.js and
Mammoth. It will fall back to a public CDN when these files are absent, so
development works without running this — but a privacy-first tool should not have
to contact a third-party host in order to read a CV, so a real deployment should
serve them from its own domain.

About 26 MB is written into ``assets/vendor/``, most of it the OCR engine
and its English training data.

Licences of what is fetched, both of which permit redistribution. The notices are
written to assets/vendor/LICENCES.txt alongside the files:

    PDF.js        Apache License 2.0
    Mammoth       BSD 2-Clause
    Tesseract.js  Apache License 2.0
"""

from __future__ import annotations

import argparse
import sys
import urllib.error
import urllib.request
from pathlib import Path

PDFJS_VERSION = "4.6.82"
MAMMOTH_VERSION = "1.8.0"
TESSERACT_VERSION = "5.1.1"
TESSERACT_CORE_VERSION = "5.1.1"
TESSDATA_VERSION = "4.0.0"

FILES = {
    "pdf.min.mjs":
        f"https://cdn.jsdelivr.net/npm/pdfjs-dist@{PDFJS_VERSION}/build/pdf.min.mjs",
    "pdf.worker.min.mjs":
        f"https://cdn.jsdelivr.net/npm/pdfjs-dist@{PDFJS_VERSION}/build/pdf.worker.min.mjs",
    "mammoth.browser.min.js":
        f"https://cdn.jsdelivr.net/npm/mammoth@{MAMMOTH_VERSION}/mammoth.browser.min.js",

    # Text recognition for scanned CVs. Vendoring these is not just politeness:
    # a Web Worker cannot be created from a cross-origin script, so OCR loaded
    # straight from a CDN hangs on the first page rather than failing cleanly.
    # Served from our own origin, it works.
    "tesseract.min.js":
        f"https://cdn.jsdelivr.net/npm/tesseract.js@{TESSERACT_VERSION}/dist/tesseract.min.js",
    "tesseract-worker.min.js":
        f"https://cdn.jsdelivr.net/npm/tesseract.js@{TESSERACT_VERSION}/dist/worker.min.js",
    # Only the LSTM builds. tesseract.js v5 uses the LSTM engine for `eng`, and
    # picks the SIMD variant where the browser supports it — verified by
    # tests/run_ocr_check.py, which passes with these four files and without the
    # full legacy builds. Those would add 16 MB to every deployment for a code
    # path this application never takes.
    "tesseract-core/tesseract-core-lstm.wasm.js":
        f"https://cdn.jsdelivr.net/npm/tesseract.js-core@{TESSERACT_CORE_VERSION}/tesseract-core-lstm.wasm.js",
    "tesseract-core/tesseract-core-simd-lstm.wasm.js":
        f"https://cdn.jsdelivr.net/npm/tesseract.js-core@{TESSERACT_CORE_VERSION}/tesseract-core-simd-lstm.wasm.js",
    "tesseract-core/tesseract-core-lstm.wasm":
        f"https://cdn.jsdelivr.net/npm/tesseract.js-core@{TESSERACT_CORE_VERSION}/tesseract-core-lstm.wasm",
    "tesseract-core/tesseract-core-simd-lstm.wasm":
        f"https://cdn.jsdelivr.net/npm/tesseract.js-core@{TESSERACT_CORE_VERSION}/tesseract-core-simd-lstm.wasm",
    "tessdata/eng.traineddata.gz":
        f"https://tessdata.projectnaptha.com/{TESSDATA_VERSION}/eng.traineddata.gz",
}

LICENCES = f"""Helix self-hosted document libraries - third party notices

PDF.js {PDFJS_VERSION}                Apache License 2.0
    https://github.com/mozilla/pdf.js/blob/master/LICENSE
Mammoth {MAMMOTH_VERSION}                BSD 2-Clause
    https://github.com/mwilliamson/mammoth.js/blob/master/LICENSE
Tesseract.js {TESSERACT_VERSION}           Apache License 2.0
    https://github.com/naptha/tesseract.js/blob/master/LICENSE
Tesseract OCR engine + eng data   Apache License 2.0
    https://github.com/tesseract-ocr/tesseract/blob/main/LICENSE

Both permit redistribution. Keep this file alongside the libraries so the notices
travel with the files they describe.

Neither library transmits anything: they parse a document that the browser has
already read from the user's own disk.
"""


def download(url: str, target: Path, force: bool) -> int:
    if target.exists() and not force:
        print(f"  have  {target.name} ({target.stat().st_size:,} bytes)")
        return target.stat().st_size
    target.parent.mkdir(parents=True, exist_ok=True)
    try:
        with urllib.request.urlopen(url, timeout=120) as response:
            data = response.read()
    except (urllib.error.URLError, TimeoutError) as error:
        print(f"  FAILED {target.name}: {error}")
        return 0
    target.write_bytes(data)
    print(f"  got   {target.name} ({len(data):,} bytes)")
    return len(data)


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(
        description="Fetch PDF.js and Mammoth for self-hosting.")
    parser.add_argument("--into", default="assets/vendor",
                        help="directory to write into (default: %(default)s)")
    parser.add_argument("--force", action="store_true",
                        help="re-download files that are already present")
    args = parser.parse_args(argv)

    root = Path(__file__).resolve().parent.parent / args.into
    print(f"Document libraries -> {root}")
    total = sum(download(url, root / name, args.force)
                for name, url in FILES.items())

    (root / "LICENCES.txt").write_text(LICENCES, encoding="utf-8")
    print(f"\nWrote third party notices to {root / 'LICENCES.txt'}")
    print(f"Total: {total / 1048576:.2f} MB")

    if total == 0:
        print("\nNothing was downloaded. Check network access to cdn.jsdelivr.net.")
        return 1

    print("\nDeploy assets/vendor/ with the rest of the site. Helix prefers "
          "these files and only falls back to the CDN when they are missing.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
