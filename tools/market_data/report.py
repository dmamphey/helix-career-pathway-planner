"""The market-data audit report.

Its job is to make data quality visible rather than hide it: how many salaries came
from a career-specific source, how many are derived, what is stale, what a person
should look at. A reviewer should be able to judge the product's credibility from
this file without reading any code.
"""

from __future__ import annotations

import collections
import datetime as dt
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
AUDIT = ROOT / "docs" / "MARKET-DATA-AUDIT.md"

EVIDENCE_LABELS = {
    "VERIFIED_GUIDE": "Career-specific guide",
    "STRONG_ESTIMATE": "Strong estimate",
    "INDICATIVE": "Indicative estimate",
    "LIMITED_DATA": "Limited-data estimate",
}

METHOD_LABELS = {
    "ncs_career_specific": "National Careers Service career profile",
    "public_sector_framework": "Curated public-sector pay framework",
    "ons_soc_occupation": "ONS ASHE occupation estimate",
    "related_career_derived": "Derived from related careers",
    "family_seniority_fallback": "Family and seniority median",
}


def _counts(records, path):
    counter = collections.Counter()
    for record in records:
        value = record
        for key in path:
            value = (value or {}).get(key)
        counter[value or "none"] += 1
    return counter


def print_summary(published: dict, warnings: list[str]) -> None:
    records = published.get("records", [])
    evidence = _counts(records, ["salary", "evidence_quality"])
    method = _counts(records, ["salary", "estimate_method"])
    print("\nEvidence quality:")
    for key in ("VERIFIED_GUIDE", "STRONG_ESTIMATE", "INDICATIVE", "LIMITED_DATA"):
        if evidence.get(key):
            print(f"  {EVIDENCE_LABELS[key]:34s} {evidence[key]:>4}")
    print("Method:")
    for key, count in method.most_common():
        print(f"  {METHOD_LABELS.get(key, key):34s} {count:>4}")
    if warnings:
        print(f"\n{len(warnings)} warning(s) recorded in the audit.")


def write_audit(published: dict, base: dict, resolver, warnings: list[str]) -> Path:
    records = published.get("records", [])
    careers = base["careers"]
    evidence = _counts(records, ["salary", "evidence_quality"])
    method = _counts(records, ["salary", "estimate_method"])

    with_salary = [r for r in records
                   if (r.get("salary") or {}).get("typical_low")]
    with_hours = [r for r in records if (r.get("work_life") or {}).get("hours_min")]
    with_role = [r for r in records
                 if (r.get("role") or {}).get("summary_kind") == "authoritative"]
    review = [r for r in records
              if (r.get("enrichment") or {}).get("manual_review_required")]

    today = dt.date.today().isoformat()
    stale = [r for r in records
             if ((r.get("salary") or {}).get("next_review_due") or "9999") < today]

    match_methods = collections.Counter(
        entry["match_method"] for entry in getattr(resolver, "match_log", []))

    lines = [
        "# Helix market-data audit",
        "",
        f"Generated {published.get('generated')} · dataset version "
        f"{published.get('version')} · jurisdiction "
        f"{published.get('jurisdiction')}",
        "",
        "This report is produced by `tools/market_data/report.py` as part of every "
        "enrichment run. It exists to make data quality visible: which salaries "
        "come from a career-specific official source, which are derived, and what "
        "a person should look at next.",
        "",
        "## Coverage",
        "",
        f"| | |", "|---|---|",
        f"| Careers in the base taxonomy | {len(careers)} |",
        f"| Market-data records | {len(records)} |",
        f"| Careers with a published salary range | **{len(with_salary)}** |",
        f"| Careers with typical weekly hours | {len(with_hours)} |",
        f"| Careers with an authoritative role description | {len(with_role)} |",
        f"| Records past their review date | {len(stale)} |",
        f"| Records flagged for manual review | {len(review)} |",
        "",
        "## Salary evidence quality",
        "",
        "| Evidence class | Careers | What it means |",
        "|---|---|---|",
    ]
    meanings = {
        "VERIFIED_GUIDE": "A career-specific salary range published by an "
                          "official careers source for this job.",
        "STRONG_ESTIMATE": "A high-quality occupation or pay-framework mapping, "
                           "but not a range published for this exact job title.",
        "INDICATIVE": "Derived from closely related careers that do have stronger "
                      "evidence, with any seniority difference priced in.",
        "LIMITED_DATA": "A median across the career's family and seniority level. "
                        "A broad indication only.",
    }
    for key in ("VERIFIED_GUIDE", "STRONG_ESTIMATE", "INDICATIVE", "LIMITED_DATA"):
        lines.append(f"| {EVIDENCE_LABELS[key]} (`{key}`) | "
                     f"{evidence.get(key, 0)} | {meanings[key]} |")

    lines += ["", "## Salary method", "", "| Method | Careers |", "|---|---|"]
    for key, count in method.most_common():
        lines.append(f"| {METHOD_LABELS.get(key, key)} | {count} |")

    lines += ["", "## Title matching against external profiles", "",
              "| Outcome | Careers |", "|---|---|"]
    for key, count in match_methods.most_common():
        lines.append(f"| `{key}` | {count} |")
    lines += [
        "",
        "`seniority_variant_rejected` is a deliberate outcome, not a failure. A "
        "career such as *Senior Biomedical Scientist* matches the *Biomedical "
        "scientist* profile on every content word, and accepting that would "
        "publish an entry-grade range as though it were career-specific fact. "
        "Those careers are derived instead, with the seniority difference applied "
        "and the evidence labelled honestly.",
    ]

    if getattr(resolver, "notes", None):
        lines += ["", "## Provider availability this run", ""]
        lines += [f"- {note}" for note in resolver.notes]

    lines += ["", "## Sources used", ""]
    used = collections.Counter()
    for record in records:
        for source in (record.get("salary") or {}).get("source_records", []):
            used[source.get("provider", "unknown")] += 1
    if used:
        lines += ["| Provider | Salary records |", "|---|---|"]
        for provider, count in used.most_common():
            lines.append(f"| {provider} | {count} |")
    else:
        lines.append("No external salary source records in this publication.")

    lines += [
        "",
        "## Attribution",
        "",
    ] + [f"- {line}" for line in published.get("attribution", [])]

    if review:
        lines += ["", "## Careers flagged for manual salary review", "",
                  "| Career | Title | Why |", "|---|---|---|"]
        for record in review[:60]:
            lines.append(f"| {record['career_id']} | {record['title']} | "
                         f"close external title match needing human confirmation |")

    if warnings:
        lines += ["", "## Warnings", ""]
        lines += [f"- {warning}" for warning in warnings[:80]]
        if len(warnings) > 80:
            lines.append(f"- … and {len(warnings) - 80} more")

    lines += [
        "",
        "## Limitations",
        "",
        "- Salary figures are estimates for career comparison. They vary by "
        "employer, sector, location, experience, hours and working pattern.",
        "- Derived estimates are statistics over careers that do have stronger "
        "evidence. They are not surveys of the specific job.",
        "- Qualitative working-life fields (patient contact, laboratory, research "
        "and commercial intensity, remote potential, travel) are inferred from the "
        "taxonomy, not from labour-market surveys, and are labelled as derived.",
        "- Professional registration requirements are a separate layer with its "
        "own verification state. Strong salary evidence never implies verified "
        "eligibility requirements, and the reverse is also true.",
        "",
    ]

    AUDIT.parent.mkdir(parents=True, exist_ok=True)
    AUDIT.write_text("\n".join(lines), encoding="utf-8")
    return AUDIT
