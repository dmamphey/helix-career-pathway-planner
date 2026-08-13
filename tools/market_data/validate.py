#!/usr/bin/env python3
"""Validate the published market data before it can ship.

    python tools/market_data/validate.py
    python tools/market_data/validate.py --file data/helix_market_data_uk_v1.json

Errors block publication. Warnings are recorded in the audit for a human to look
at. The separation matters: "this salary changed by 40% since last month" is not
necessarily wrong, but nobody should find out about it from a user.

The checks are deliberately independent of the resolver. If the resolver has a bug
that drops provenance or inverts a range, this fails the build rather than trusting
the code that produced the file.
"""

from __future__ import annotations

import argparse
import datetime as dt
import json
import os
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
BASE = ROOT / "data" / "careerpath_uk_careers_v1.json"
PUBLISHED = ROOT / "data" / "helix_market_data_uk_v1.json"

VALID_EVIDENCE = {"VERIFIED_GUIDE", "STRONG_ESTIMATE", "INDICATIVE", "LIMITED_DATA"}

#: A relative change this large in either endpoint is flagged, not applied blindly.
MATERIAL_CHANGE = 0.30

#: Patterns that would mean a credential leaked into published output.
#
# Each requires a *value*, not just the name of a variable. Naming NCS_API_KEY in a
# note that explains the key was absent is useful information, not a leak, and an
# over-blunt pattern that blocks publication for mentioning it trains people to
# ignore the check.
SECRET_PATTERNS = [
    re.compile(r"Ocp-Apim-Subscription-Key\s*[\"':=]+\s*\S+", re.I),
    re.compile(r"\bNCS_API_KEY\s*[\"':=]+\s*\S+"),
    re.compile(r"\bSKILLS_ENGLAND_API_KEY\s*[\"':=]+\s*\S+"),
    re.compile(r"subscription[-_ ]?key\s*[\"':=]+\s*\S+", re.I),
    re.compile(r"\bapi[-_ ]?key\s*[\"':=]+\s*[A-Za-z0-9]{16,}", re.I),
]

#: Environment variables whose actual value must never appear in the output. This
#: is the check that matters: it compares against the live secret.
SECRET_ENV_VARS = ["NCS_API_KEY", "SKILLS_ENGLAND_API_KEY"]


def validate(published: dict, base: dict, previous: dict | None = None) -> tuple[list, list, dict]:
    errors: list[str] = []
    warnings: list[str] = []

    careers = {c["id"]: c for c in base["careers"]}
    records = published.get("records", [])

    # --- coverage ----------------------------------------------------------
    if len(records) != len(careers):
        errors.append(f"expected {len(careers)} market records, found {len(records)}")

    seen: set[str] = set()
    for record in records:
        cid = record.get("career_id", "")
        if cid in seen:
            errors.append(f"duplicate market record for {cid}")
        seen.add(cid)
        if cid not in careers:
            errors.append(f"{cid} is not a career in the base dataset")

    for cid in careers:
        if cid not in seen:
            errors.append(f"{cid} ({careers[cid]['title']}) has no market record")

    # --- every salary --------------------------------------------------------
    for record in records:
        cid = record.get("career_id", "?")
        salary = record.get("salary") or {}
        low, high = salary.get("typical_low"), salary.get("typical_high")

        if not isinstance(low, (int, float)) or not isinstance(high, (int, float)):
            errors.append(f"{cid}: salary range is not numeric ({low}, {high})")
            continue
        if low <= 0:
            errors.append(f"{cid}: typical_low must be positive, got {low}")
        if high < low:
            errors.append(f"{cid}: range inverted ({low} > {high})")
        if salary.get("currency") != "GBP":
            errors.append(f"{cid}: currency is {salary.get('currency')}, not GBP")
        if salary.get("period") != "year":
            errors.append(f"{cid}: period is {salary.get('period')}, not year")
        if not salary.get("geography"):
            errors.append(f"{cid}: no salary geography")
        if salary.get("evidence_quality") not in VALID_EVIDENCE:
            errors.append(f"{cid}: evidence_quality is "
                          f"{salary.get('evidence_quality')!r}")
        if not salary.get("estimate_method"):
            errors.append(f"{cid}: no estimate_method")
        if not (salary.get("source_records") or salary.get("methodology_notes")):
            errors.append(f"{cid}: salary has neither a source record nor "
                          f"methodology notes")
        if not salary.get("last_verified"):
            errors.append(f"{cid}: no last_verified date")
        if high > 500_000 or low > 400_000:
            warnings.append(f"{cid}: implausible salary range {low}-{high}")

    # --- anomalies against the previous publication -------------------------
    if previous:
        before = {r["career_id"]: r for r in previous.get("records", [])}
        for record in records:
            old = before.get(record["career_id"])
            if not old:
                continue
            for field in ("typical_low", "typical_high"):
                was = (old.get("salary") or {}).get(field)
                now = (record.get("salary") or {}).get(field)
                if not (isinstance(was, (int, float)) and was > 0
                        and isinstance(now, (int, float))):
                    continue
                change = abs(now - was) / was
                if change >= MATERIAL_CHANGE:
                    warnings.append(
                        f"{record['career_id']}: {field} moved {change:.0%} "
                        f"({was:,.0f} -> {now:,.0f}) — review before publishing")

    # --- a suspicious number of identical ranges ----------------------------
    ranges: dict[tuple, list[str]] = {}
    for record in records:
        salary = record.get("salary") or {}
        if salary.get("estimate_method") == "family_seniority_fallback":
            continue  # expected to repeat: that is what a family median is
        key = (salary.get("typical_low"), salary.get("typical_high"))
        ranges.setdefault(key, []).append(record["career_id"])
    for key, ids in ranges.items():
        if len(ids) > 40 and all(k is not None for k in key):
            warnings.append(f"{len(ids)} careers share the range {key} outside the "
                            f"family fallback — check the resolver")

    # --- stale --------------------------------------------------------------
    today = dt.date.today()
    stale = []
    for record in records:
        due = (record.get("salary") or {}).get("next_review_due")
        try:
            if due and dt.date.fromisoformat(due) < today:
                stale.append(record["career_id"])
        except ValueError:
            warnings.append(f"{record['career_id']}: unreadable next_review_due")
    if stale:
        warnings.append(f"{len(stale)} records are past their review date")

    # --- secrets ------------------------------------------------------------
    blob = json.dumps(published)
    for pattern in SECRET_PATTERNS:
        if pattern.search(blob):
            errors.append(f"published output matches a credential pattern: "
                          f"{pattern.pattern}")
    for name in SECRET_ENV_VARS:
        value = os.environ.get(name, "").strip()
        # Short values would produce false positives against ordinary text.
        if len(value) >= 12 and value in blob:
            errors.append(f"the value of {name} appears in the published output")

    stats = {
        "records": len(records),
        "careers": len(careers),
        "with_salary": sum(
            1 for r in records
            if isinstance((r.get("salary") or {}).get("typical_low"), (int, float))
            and (r["salary"]["typical_low"] or 0) > 0),
        "stale": len(stale),
    }
    return errors, warnings, stats


def main(argv=None) -> int:
    parser = argparse.ArgumentParser(
        description="Validate the published Helix market data.")
    parser.add_argument("--file", default=str(PUBLISHED))
    parser.add_argument("--previous", default=None,
                        help="an earlier published file, to check for large changes")
    parser.add_argument("--quiet", action="store_true")
    args = parser.parse_args(argv)

    path = Path(args.file)
    if not path.exists():
        print(f"No market data at {path}. Run enrich.py first.")
        return 1

    published = json.loads(path.read_text(encoding="utf-8"))
    base = json.loads(BASE.read_text(encoding="utf-8"))
    previous = (json.loads(Path(args.previous).read_text(encoding="utf-8"))
                if args.previous and Path(args.previous).exists() else None)

    errors, warnings, stats = validate(published, base, previous)

    print(f"Market data: {stats['records']} records for {stats['careers']} careers")
    print(f"Salary coverage: {stats['with_salary']}/{stats['careers']}")
    if not args.quiet:
        for warning in warnings[:40]:
            print(f"  warning: {warning}")
        if len(warnings) > 40:
            print(f"  ... and {len(warnings) - 40} more warnings")
    for error in errors[:40]:
        print(f"  ERROR: {error}")
    if len(errors) > 40:
        print(f"  ... and {len(errors) - 40} more errors")

    if errors:
        print(f"\nFAILED: {len(errors)} error(s). This data must not be published.")
        return 1
    print(f"\nPASSED with {len(warnings)} warning(s).")
    return 0


if __name__ == "__main__":
    sys.exit(main())
