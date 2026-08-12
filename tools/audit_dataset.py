#!/usr/bin/env python3
"""Audit the career dataset and write a report.

    python tools/audit_dataset.py

The launch dataset is never edited by this tool, and the application never edits
it either: §47 of the specification is explicit that a questionable record is kept
and documented rather than quietly changed. This script finds the things worth a
human decision and writes them to docs/DATASET-AUDIT.md.

What it looks for:

  * regulation labels that disagree with the recorded regulator
  * titles that look like protected titles but are labelled unregulated
  * seniority variants that may be progression levels rather than careers
  * near-duplicate concepts
  * rare regulation labels that need a definition
  * source coverage
"""

from __future__ import annotations

import collections
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DATASET = ROOT / "data" / "careerpath_uk_careers_v1.json"
REPORT = ROOT / "docs" / "DATASET-AUDIT.md"

#: Words that make a title a seniority variant of a shorter title.
SENIORITY = ["senior", "lead", "principal", "consultant", "chief", "head of",
             "deputy", "assistant", "associate", "trainee", "specialist",
             "advanced", "graduate", "junior", "director", "manager"]

#: Titles protected in UK law, in whole or in part. Presence here is not a claim
#: about a particular record: it is a prompt to check that record against the
#: regulator, which is exactly what the report asks a human to do.
PROTECTED_HINTS = [
    "biomedical scientist", "clinical scientist", "practitioner psychologist",
    "occupational therapist", "physiotherapist", "dietitian", "paramedic",
    "radiographer", "speech and language therapist", "orthoptist",
    "prosthetist", "orthotist", "podiatrist", "chiropodist",
    "operating department practitioner", "hearing aid dispenser",
    "art therapist", "music therapist", "drama therapist", "social worker",
    "nurse", "midwife", "nursing associate", "pharmacist",
    "pharmacy technician", "dentist", "dental therapist", "dental hygienist",
    "dental nurse", "dental technician", "clinical dental technician",
    "orthodontic therapist", "optometrist", "dispensing optician",
    "osteopath", "chiropractor", "veterinary surgeon",
]

STOP = {"and", "or", "of", "the", "in", "for", "a", "an", "to", "with"}


def tokens(title: str) -> frozenset[str]:
    words = re.findall(r"[a-z0-9]+", title.lower())
    return frozenset(word for word in words if word not in STOP)


def main() -> int:
    data = json.loads(DATASET.read_text(encoding="utf-8"))
    careers = data["careers"]
    registry = data["source_registry"]
    by_title = {career["title"].lower(): career for career in careers}

    findings: dict[str, list[str]] = collections.OrderedDict()

    # --- integrity, which should be clean --------------------------------------
    integrity = []
    ids = collections.Counter(c["id"] for c in careers)
    titles = collections.Counter(c["title"] for c in careers)
    integrity += [f"duplicate id: {i}" for i, n in ids.items() if n > 1]
    integrity += [f"duplicate title: {t}" for t, n in titles.items() if n > 1]
    for career in careers:
        for code in career["official_source_codes"]:
            if code not in registry:
                integrity.append(f"{career['id']} cites unknown source {code}")
        if not career["core_tags"]:
            integrity.append(f"{career['id']} has no core tags")
        if career["jurisdiction"] != data["jurisdiction"]:
            integrity.append(f"{career['id']} has jurisdiction "
                             f"{career['jurisdiction']}")
    findings["Integrity checks"] = integrity or ["No integrity problems found."]

    # --- regulation labels vs recorded body ------------------------------------
    mismatch = []
    for career in careers:
        status = career["regulatory_status"]
        body = career["regulator_or_body"]
        if status.startswith("Statutory") and not body:
            mismatch.append(f"`{career['id']}` **{career['title']}** — "
                            f"{status}, but no regulator or body is recorded.")
        if status == "Generally unregulated" and body:
            mismatch.append(f"`{career['id']}` **{career['title']}** — "
                            f"labelled unregulated, but {body} is recorded as "
                            f"its body.")
    findings["Regulation label does not agree with the recorded body"] = (
        mismatch or ["None found."])

    # --- protected-title hints on unregulated records --------------------------
    protected = []
    for career in careers:
        title = career["title"].lower()
        hit = next((hint for hint in PROTECTED_HINTS
                    if re.search(rf"\b{re.escape(hint)}\b", title)), None)
        if hit and career["regulatory_status"] == "Generally unregulated":
            protected.append(
                f"`{career['id']}` **{career['title']}** — contains "
                f"\"{hit}\", which is or contains a protected title in the UK, "
                f"but the record says \"Generally unregulated\".")
    findings["Titles resembling protected titles but labelled unregulated"] = (
        protected or ["None found."])

    # --- seniority variants ----------------------------------------------------
    variants = []
    for career in careers:
        title = career["title"].lower()
        for word in SENIORITY:
            if not title.startswith(f"{word} "):
                continue
            base = title[len(word) + 1:]
            if base in by_title:
                variants.append(
                    f"`{career['id']}` **{career['title']}** — a seniority "
                    f"variant of `{by_title[base]['id']}` "
                    f"{by_title[base]['title']}.")
            break
    findings["Seniority variants of another record"] = variants or ["None found."]

    # --- near duplicates -------------------------------------------------------
    seen: dict[frozenset[str], list[dict]] = collections.defaultdict(list)
    for career in careers:
        seen[tokens(career["title"])].append(career)
    duplicates = [
        f"`{group[0]['id']}` **{group[0]['title']}** and "
        + ", ".join(f"`{c['id']}` {c['title']}" for c in group[1:])
        + " — the same words in a different order."
        for group in seen.values() if len(group) > 1
    ]
    findings["Records with identical wording in a different order"] = (
        duplicates or ["None found."])

    # --- rare labels -----------------------------------------------------------
    statuses = collections.Counter(c["regulatory_status"] for c in careers)
    rare = [f"\"{status}\" — used by {count} record"
            f"{'s' if count != 1 else ''}: "
            + ", ".join(f"`{c['id']}` {c['title']}" for c in careers
                        if c["regulatory_status"] == status)
            for status, count in statuses.items() if count <= 8]
    findings["Rare regulation labels needing a written definition"] = (
        rare or ["None found."])

    # --- depth and coverage ----------------------------------------------------
    coverage = []
    depths = collections.Counter(c["pathway_depth"] for c in careers)
    coverage.append("Pathway depth: "
                    + ", ".join(f"{depth} {count}"
                                for depth, count in depths.most_common()))
    regulated_explorer = [c for c in careers
                          if c["pathway_depth"] == "Explorer"
                          and c["regulatory_status"] != "Generally unregulated"]
    coverage.append(
        f"Regulated records at Explorer depth: {len(regulated_explorer)}"
        + (" — " + ", ".join(f"`{c['id']}` {c['title']}"
                             for c in regulated_explorer[:12])
           if regulated_explorer else ""))
    sources = collections.Counter(code for c in careers
                                  for code in c["official_source_codes"])
    coverage.append("Source citations: "
                    + ", ".join(f"{code} {count}"
                                for code, count in sources.most_common()))
    unused = sorted(set(registry) - set(sources))
    coverage.append(f"Registry entries never cited: {unused or 'none'}")
    verified = collections.Counter(c["last_verified"] for c in careers)
    coverage.append("Verification dates: "
                    + ", ".join(f"{date} ({count})"
                                for date, count in verified.most_common()))
    findings["Coverage"] = coverage

    total_flagged = sum(
        1 for section, items in findings.items()
        if section != "Coverage"
        for item in items if not item.startswith("No") and item != "None found.")

    lines = [
        "# CareerPath dataset audit",
        "",
        f"Dataset: **{data['dataset_name']}** version {data['version']}, "
        f"generated {data['generated']}, {len(careers)} careers.",
        "",
        "Generated by `tools/audit_dataset.py`. Re-run it after any dataset "
        "change.",
        "",
        "No record has been altered or removed. Per §47 of the product "
        "specification, questionable records are kept in the launch taxonomy and "
        "documented here instead, so that a decision about them is made "
        "deliberately by a person rather than silently by a script. None of the "
        "regulatory observations below is a determination: each one is a prompt "
        "to check the record against the named official source.",
        "",
        f"**{total_flagged} observations** across "
        f"{len(findings) - 1} checks.",
        "",
    ]
    for section, items in findings.items():
        lines.append(f"## {section}")
        lines.append("")
        lines.append(f"{len(items)} item(s)." if len(items) > 1
                     and items[0] != "None found." else "")
        lines.append("")
        for item in items:
            lines.append(f"- {item}")
        lines.append("")

    REPORT.parent.mkdir(parents=True, exist_ok=True)
    REPORT.write_text("\n".join(lines), encoding="utf-8")
    print(f"Wrote {REPORT.relative_to(ROOT)}")
    for section, items in findings.items():
        real = [i for i in items if i != "None found."
                and not i.startswith("No integrity")]
        print(f"  {section}: {len(real)}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
