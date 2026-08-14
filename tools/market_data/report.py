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

from .title_matcher import content_tokens, normalise

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


def _alias_candidates(records: list[dict], resolver) -> list[str]:
    """The curation worklist: careers one human decision away from real evidence.

    The matcher refuses anything that is not an exact title or a curated alias,
    which is right — a poor direct match is worse than a transparent derived
    estimate. But it means the audit could say "42 review candidates" without ever
    saying *which*, leaving the most valuable work in the project invisible and
    the reviewer to rediscover it by hand.

    Listed here with the profile each career nearly matched and the score, so
    accepting or rejecting one is a reading task rather than a research task.

    Seniority-rejected matches are deliberately excluded. They look like the
    strongest candidates by score and are exactly the ones that must never become
    aliases: an alias from "Senior Biomedical Scientist" to the entry-grade
    profile would reintroduce, by hand, the bug the matcher exists to prevent.
    """
    log = getattr(resolver, "match_log", None)
    if not log:
        return []

    evidence_by_id = {
        r["career_id"]: (r.get("salary") or {}).get("evidence_quality", "")
        for r in records}

    candidates = [entry for entry in log
                  if entry.get("match_method") == "review_candidate"
                  and entry.get("profile_title")]
    if not candidates:
        return []

    # Strongest first, so the most likely aliases are read first; career id
    # breaks ties so the file is stable between runs.
    candidates.sort(key=lambda e: (-float(e.get("match_score") or 0),
                                   e["career_id"]))

    lines = [
        "",
        "## Alias candidates for human review",
        "",
        f"{len(candidates)} careers have a strong but inexact title match against "
        "an external job profile. None is used: only an exact title or a curated "
        "alias is accepted, because a wrong direct match publishes another job's "
        "salary as this one's fact.",
        "",
        "Each row is one human decision. Confirming a row means adding the career's "
        "normalised title to `data/reference/ncs_career_aliases.json`, after which "
        "the next run promotes that career from a derived estimate to "
        "career-specific evidence. Rejecting a row means leaving it derived, which "
        "is already correct — so doing nothing here is safe.",
        "",
        "Seniority variants are **not** listed. They are rejected on purpose and "
        "must stay rejected: aliasing one to its base profile would publish an "
        "entry-grade range for a senior post.",
        "",
        "A score of 1.00 does **not** mean the two are the same job. Matching "
        "drops setting words such as *clinical*, *healthcare* and *NHS*, because "
        "they usually describe where a job is done rather than what it is. When "
        "the dropped word is the whole difference between the two titles, the "
        "score is high for the wrong reason — *Clinical Photographer* and "
        "*Photographer* are not one occupation. Those rows are flagged below and "
        "need the most careful reading, not the least.",
        "",
        "| Career | Helix title | Closest external profile | Score | Currently | Note |",
        "|---|---|---|---|---|---|",
    ]
    for entry in candidates[:120]:
        current = EVIDENCE_LABELS.get(evidence_by_id.get(entry["career_id"], ""),
                                      "—")
        lines.append(
            f"| {entry['career_id']} | {entry['career_title']} | "
            f"{entry['profile_title']} (`{entry['profile_slug']}`) | "
            f"{float(entry.get('match_score') or 0):.2f} | {current} | "
            f"{_qualifier_note(entry['career_title'], entry['profile_title'])} |")
    if len(candidates) > 120:
        lines.append(f"| … | and {len(candidates) - 120} more | | | | |")
    return lines


def _qualifier_note(career_title: str, profile_title: str) -> str:
    """Flag a score that is high only because a distinguishing word was dropped.

    `NOISE_WORDS` removes *clinical*, *healthcare*, *health* and *NHS* before
    comparison, which is right for "NHS Biomedical Scientist" and wrong for
    "Clinical Photographer": there, the dropped word is the entire difference
    between two genuinely different occupations with different pay. Both come out
    at 1.00, so the score alone cannot tell a reviewer which is which.
    """
    dropped = (set(normalise(career_title).split()) - content_tokens(career_title)
               - set(normalise(profile_title).split()))
    if not dropped:
        return ""
    words = ", ".join(f"*{word}*" for word in sorted(dropped))
    return (f"Scores high only because {words} was dropped — check these are "
            f"really one occupation")


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

    lines += _alias_candidates(records, resolver)

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
