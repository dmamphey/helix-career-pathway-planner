#!/usr/bin/env python3
"""Build the published market-data file.

    python tools/market_data/enrich.py --all
    python tools/market_data/enrich.py --career CP-003
    python tools/market_data/enrich.py --refresh-stale
    python tools/market_data/enrich.py --dry-run
    python tools/market_data/enrich.py --offline

Reads approved official sources, resolves one salary record per career through the
tier hierarchy in resolver.py, and writes:

    data/helix_market_data_uk_v1.json

This never runs in a user's browser. The browser reads the published file and
contacts no external host.

Credentials come from the environment only — NCS_API_KEY, optionally
SKILLS_ENGLAND_API_KEY — and are never written to the output, the cache index or
the logs.
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

if __package__ in (None, ""):
    sys.path.insert(0, str(Path(__file__).resolve().parent.parent.parent))
    from tools.market_data import report, validate as validator
    from tools.market_data.cache import cached_count
    from tools.market_data.resolver import Resolver
else:
    from . import report, validate as validator
    from .cache import cached_count
    from .resolver import Resolver

ROOT = Path(__file__).resolve().parent.parent.parent
BASE = ROOT / "data" / "careerpath_uk_careers_v1.json"
PUBLISHED = ROOT / "data" / "helix_market_data_uk_v1.json"


def load_base() -> dict:
    return json.loads(BASE.read_text(encoding="utf-8"))


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(
        description="Enrich Helix careers with UK salary and working-life data.",
        epilog="Set NCS_API_KEY to use the National Careers Service API. Without "
               "it the pipeline uses the public job profiles and deterministic "
               "derivation, and says so in the audit.")
    parser.add_argument("--all", action="store_true",
                        help="resolve every career (the default)")
    parser.add_argument("--career", metavar="CP-003",
                        help="resolve one career and print the result")
    parser.add_argument("--refresh-stale", action="store_true",
                        help="re-fetch sources for records past their review date")
    parser.add_argument("--refresh", action="store_true",
                        help="ignore the local HTTP cache entirely")
    parser.add_argument("--offline", action="store_true",
                        help="use only cached responses; never touch the network")
    parser.add_argument("--dry-run", action="store_true",
                        help="resolve and report, but write nothing")
    parser.add_argument("--quiet", action="store_true")
    args = parser.parse_args(argv)

    base = load_base()
    careers = base["careers"]

    if args.career:
        careers = [c for c in careers if c["id"] == args.career]
        if not careers:
            print(f"No career with id {args.career}")
            return 1

    refresh = args.refresh
    if args.refresh_stale and PUBLISHED.exists():
        # Only the stale records need their sources re-read.
        previous = json.loads(PUBLISHED.read_text(encoding="utf-8"))
        import datetime as dt
        today = dt.date.today().isoformat()
        stale = {r["career_id"] for r in previous.get("records", [])
                 if (r.get("salary") or {}).get("next_review_due", "9999") <= today}
        print(f"{len(stale)} record(s) are past review date")
        if not stale:
            return 0
        careers = [c for c in careers if c["id"] in stale]
        refresh = True

    resolver = Resolver(careers, offline=args.offline, refresh=refresh)

    def progress(position, total, title):
        if args.quiet or total < 20:
            return
        if position % 25 == 0 or position == total:
            print(f"  {position}/{total} … {title[:44]}")

    print(f"Resolving {len(careers)} career(s). "
          f"HTTP cache: {cached_count()} entries.")
    published = resolver.build(progress=progress)

    if args.career:
        record = published["records"][0]
        print(json.dumps(record, indent=1)[:2600])
        return 0

    # A partial run must not overwrite the full dataset.
    partial = len(careers) != len(base["careers"])
    if partial and PUBLISHED.exists():
        existing = json.loads(PUBLISHED.read_text(encoding="utf-8"))
        merged = {r["career_id"]: r for r in existing.get("records", [])}
        for record in published["records"]:
            merged[record["career_id"]] = record
        order = [c["id"] for c in base["careers"]]
        published["records"] = [merged[cid] for cid in order if cid in merged]
        published["career_count"] = len(published["records"])

    errors, warnings, stats = validator.validate(published, base,
                                                 previous=_previous())
    print(f"\nSalary coverage: {stats['with_salary']}/{stats['careers']}")
    for error in errors[:20]:
        print(f"  ERROR: {error}")
    if errors:
        print(f"\n{len(errors)} validation error(s): nothing was written.")
        return 1

    if args.dry_run:
        print("\nDry run: no files written.")
    else:
        PUBLISHED.write_text(json.dumps(published, indent=1, ensure_ascii=False),
                             encoding="utf-8")
        print(f"\nWrote {PUBLISHED.relative_to(ROOT)} "
              f"({PUBLISHED.stat().st_size / 1024:.0f} KB)")
        audit = report.write_audit(published, base, resolver, warnings)
        print(f"Wrote {audit.relative_to(ROOT)}")

    report.print_summary(published, warnings)
    return 0


def _previous() -> dict | None:
    if not PUBLISHED.exists():
        return None
    try:
        return json.loads(PUBLISHED.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None


if __name__ == "__main__":
    sys.exit(main())
