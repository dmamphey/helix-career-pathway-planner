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
    parser.add_argument("--career-ids", metavar="CP-003,CP-019",
                        help="resolve only these careers (comma separated)")
    parser.add_argument("--limit", type=int, metavar="N",
                        help="resolve at most N careers that are not already "
                             "resolved from a direct source — the quota control "
                             "for a metered subscription")
    parser.add_argument("--sample", action="store_true",
                        help="resolve a representative spread across every career "
                             "family instead of the whole catalogue")
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

    if args.career_ids:
        wanted = {part.strip() for part in args.career_ids.split(",") if part.strip()}
        careers = [c for c in careers if c["id"] in wanted]
        missing = wanted - {c["id"] for c in careers}
        if missing:
            print(f"Not in the dataset, ignored: {', '.join(sorted(missing))}")
        if not careers:
            return 1

    if args.sample:
        careers = representative_sample(careers, args.limit or 20)
        print(f"Representative sample: {len(careers)} careers across "
              f"{len({c['family'] for c in careers})} families")

    if args.limit and not args.sample:
        # Skip careers already carrying direct evidence, so a metered run spends
        # its calls on what is still unresolved rather than re-fetching.
        done = already_resolved()
        remaining = [c for c in careers if c["id"] not in done]
        skipped = len(careers) - len(remaining)
        careers = remaining[:args.limit]
        print(f"Limit {args.limit}: {len(careers)} to resolve"
              + (f", {skipped} already have direct evidence" if skipped else ""))

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

    # A partial run must not overwrite the full dataset — and must not downgrade
    # what is already there.
    #
    # A limited run has only its own careers as derivation anchors, so careers it
    # cannot resolve come back empty. Merging those in blindly replaced good
    # published records with nulls; validation caught it and refused to write, but
    # the merge itself was wrong. A partial run now only ever improves a record.
    partial = len(careers) != len(base["careers"])
    if partial and PUBLISHED.exists():
        existing = json.loads(PUBLISHED.read_text(encoding="utf-8"))
        merged = {r["career_id"]: r for r in existing.get("records", [])}
        kept = 0
        for record in published["records"]:
            previous_record = merged.get(record["career_id"])
            if previous_record and not improves(record, previous_record):
                kept += 1
                continue
            merged[record["career_id"]] = record
        if kept:
            print(f"Kept {kept} existing record(s) that this run could not improve")
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


#: Evidence strength, strongest first. Used to decide whether a new record is an
#: improvement on the published one.
EVIDENCE_RANK = {"VERIFIED_GUIDE": 0, "STRONG_ESTIMATE": 1, "INDICATIVE": 2,
                 "LIMITED_DATA": 3, "PENDING": 4}


def improves(candidate: dict, current: dict) -> bool:
    """Is `candidate` at least as good as the record already published?"""
    new_salary = candidate.get("salary") or {}
    old_salary = current.get("salary") or {}
    if not isinstance(new_salary.get("typical_low"), (int, float)):
        return False          # nothing usable: never replace something with nothing
    if not isinstance(old_salary.get("typical_low"), (int, float)):
        return True           # anything beats an empty record
    new_rank = EVIDENCE_RANK.get(new_salary.get("evidence_quality"), 4)
    old_rank = EVIDENCE_RANK.get(old_salary.get("evidence_quality"), 4)
    if new_rank != old_rank:
        return new_rank < old_rank
    # Same evidence class: prefer the fresher figure, so a refresh still lands.
    return str(new_salary.get("last_verified") or "") >= str(
        old_salary.get("last_verified") or "")


def already_resolved() -> set:
    """Career ids whose salary already came from a direct source.

    Resumability rests on this: a metered subscription must never spend a call on
    a career that is already resolved from a real source. Derived estimates are
    not counted, because those are exactly the ones worth upgrading.
    """
    previous = _previous()
    if not previous:
        return set()
    direct = {"ncs_career_specific", "public_sector_framework", "ons_soc_occupation"}
    return {record["career_id"] for record in previous.get("records", [])
            if (record.get("salary") or {}).get("estimate_method") in direct}


def representative_sample(careers: list[dict], size: int) -> list[dict]:
    """A spread across every career family, deterministically chosen.

    Development should exercise healthcare, healthcare science, research, pharma,
    clinical research, regulatory, quality, digital and public health rather than
    the first N ids, which are all one family.
    """
    families: dict[str, list[dict]] = {}
    for career in careers:
        families.setdefault(career["family"], []).append(career)
    for group in families.values():
        group.sort(key=lambda c: c["id"])

    chosen: list[dict] = []
    position = 0
    while len(chosen) < size:
        added = False
        for family in sorted(families):
            group = families[family]
            if position < len(group):
                chosen.append(group[position])
                added = True
                if len(chosen) >= size:
                    break
        if not added:
            break
        position += 1
    return chosen


def _previous() -> dict | None:
    if not PUBLISHED.exists():
        return None
    try:
        return json.loads(PUBLISHED.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None


if __name__ == "__main__":
    sys.exit(main())
