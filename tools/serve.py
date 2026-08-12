#!/usr/bin/env python3
"""Serve Helix locally for development.

    python tools/serve.py            # http://localhost:8766
    python tools/serve.py --port 9000

Helix is a static site, so any web server will do — but a plain
``python -m http.server`` sends no cache headers, and browsers then apply
heuristic caching to ES modules. That means an edit can appear to have no effect,
which wastes far more time than this file costs. Everything here is served with
``Cache-Control: no-store``.

It must be served over http rather than opened as a file, because ES modules and
``fetch`` of the dataset both require an http origin.
"""

from __future__ import annotations

import argparse
import functools
import http.server
import socketserver
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    """Static files, never cached, with the MIME types the app needs."""

    extensions_map = {
        **http.server.SimpleHTTPRequestHandler.extensions_map,
        ".mjs": "text/javascript",
        ".js": "text/javascript",
        ".json": "application/json",
        ".css": "text/css",
        ".svg": "image/svg+xml",
    }

    def end_headers(self):
        self.send_header("Cache-Control", "no-store, must-revalidate")
        super().end_headers()

    def log_message(self, fmt, *args):
        # One line per request, without the noisy timestamp block.
        sys.stderr.write(f"{self.command} {self.path} -> {args[1]}\n")


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(description="Serve Helix locally.")
    parser.add_argument("--port", type=int, default=8766)
    parser.add_argument("--bind", default="127.0.0.1")
    args = parser.parse_args(argv)

    handler = functools.partial(NoCacheHandler, directory=str(ROOT))
    socketserver.TCPServer.allow_reuse_address = True
    with socketserver.TCPServer((args.bind, args.port), handler) as server:
        print(f"Helix on http://{args.bind}:{args.port}/")
        print(f"Tests      on http://{args.bind}:{args.port}/tests/")
        print("Ctrl+C to stop.")
        try:
            server.serve_forever()
        except KeyboardInterrupt:
            print("\nStopped.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
