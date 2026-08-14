"""Composing a description for a career that no source describes.

Every career should tell a reader what it involves. Only 143 of 716 have a job
profile published about them, and no source will close that gap: the National
Careers Service writes 737 profiles and Helix already uses every one that
matches, NHS Health Careers reserves all rights in its text, ESCO returns an
exact match for about four per cent of the remainder, and SOC 2020's related job
titles reach 23. The rest are simply finer-grained than anything a national body
writes a profile for.

So the remainder get a description composed here — and §21 of the specification
is the licence for it: a taxonomy-generated fallback is allowed *only* if it is
clearly identified as one and worded conservatively. Both halves matter.

What this is:

    A description assembled from what Helix actually records about that specific
    career — its grade, its family, its own subject tags, its regulatory status,
    its entry signal and its working-life profile. Every clause traces to a
    field. It is about that career, not about fifty careers that share a family,
    which is the whole reason for doing it.

What this is not:

    Invented prose. Nothing here describes duties, employers, tools, prospects or
    day-to-day work, because Helix does not know those. There is no adjective
    that is not derived from a recorded value, and the interface labels the
    result as composed rather than sourced. A confident paragraph about a job
    nobody has researched would undermine the 143 that are real.
"""

from __future__ import annotations

#: How a seniority class reads in a sentence.
GRADE = {
    "trainee": "a trainee or entry-level role",
    "support": "a support or assistant-grade role",
    "professional": "a professional-grade role",
    "specialist": "a specialist-grade role",
    "senior": "a senior role",
    "manager": "a management role",
    "lead": "a lead or principal role",
    "consultant": "a consultant-grade role",
    "executive": "a head-of-service or director-level role",
}

#: Working-life dimensions, in the order they read most naturally.
#:
#: Labels avoid the word "and" on purpose: they are joined into a list, and a
#: label containing a conjunction produced "research and commercial and
#: business-facing work", which reads like a fault because it is one.
DIMENSIONS = [
    ("laboratory_intensity", "laboratory work"),
    ("patient_contact", "direct patient contact"),
    ("research_intensity", "research"),
    ("commercial_intensity", "commercial work"),
]

REGULATION = {
    "Statutory / protected":
        "The title is recorded as statutory or protected",
    "Statutory / regulated":
        "The role is recorded as statutory or regulated",
    "Professional / voluntary register":
        "A professional or voluntary register is recorded for this role",
    "Professionally governed / role-dependent":
        "Professional governance is recorded, and applies depending on the post",
    "Legal function / appointment":
        "This is recorded as a legal function or appointment",
    "Role-dependent":
        "Whether regulation applies is recorded as depending on the post",
}


def compose(career: dict, work_life: dict | None,
            seniority_class: str) -> str:
    """A conservative description of one career, from its recorded attributes.

    Deterministic: the same career always produces the same words, so nothing
    shifts under a reader between visits.
    """
    title = career.get("title", "").strip()
    family = career.get("family", "").strip()
    tags = [tag for tag in (career.get("core_tags") or []) if tag]
    work = work_life or {}

    sentences = []

    # 1. What kind of role it is, and where it sits.
    grade = GRADE.get(seniority_class, "a role")
    if family:
        sentences.append(f"{title} is {grade} in {family}.")
    else:
        sentences.append(f"{title} is {grade}.")

    # 2. What the work is about, from the career's own subject tags.
    if tags:
        sentences.append(
            f"Helix records this career's subject areas as {_join(tags)}.")

    # 3. Its working-life shape.
    #
    #    Only what distinguishes this career gets said. "Little of everything" is
    #    true of a career with four low values and tells a reader nothing, so it
    #    is left out — but a career whose values are all middling still deserves a
    #    sentence, which is why "some" is reported as well as "substantial".
    high = [label for field, label in DIMENSIONS if work.get(field) == "high"]
    some = [label for field, label in DIMENSIONS if work.get(field) == "medium"]
    absent = [label for field, label in DIMENSIONS if work.get(field) == "low"]

    clauses = []
    if high:
        clauses.append(f"substantial {_join(high)}")
    if some:
        clauses.append(f"some {_join(some)}")
    # The absences are only worth naming once something has been affirmed; on
    # their own they describe a career by what it is not.
    if absent and clauses:
        clauses.append(f"little {_join(absent)}")
    if clauses:
        sentences.append(
            f"The work is recorded as involving {_join_clauses(clauses)}.")

    remote = work.get("remote_potential")
    if remote in ("high", "medium"):
        sentences.append(
            "Some of it may be possible remotely or on a hybrid basis."
            if remote == "medium"
            else "Much of it may be possible remotely or on a hybrid basis.")

    # 4. Regulation, in the words the dataset uses, and never as advice.
    status = career.get("regulatory_status", "")
    body = career.get("regulator_or_body", "")
    phrase = REGULATION.get(status)
    if phrase:
        clause = phrase
        if body:
            clause += f", with {body} recorded as the relevant body"
        sentences.append(
            clause + ". Confirm what applies to you with that organisation.")
    elif status == "Generally unregulated":
        sentences.append(
            "No statutory registration is recorded for this career, though "
            "individual employers may set their own requirements.")

    # 5. How people typically arrive, from the dataset's own entry signal.
    entry = (career.get("typical_entry_signal") or "").strip()
    if entry:
        sentences.append(f"Typical background: {entry}.")

    return " ".join(sentences)


def _join_clauses(clauses: list[str]) -> str:
    """Join clauses that already contain their own lists.

    Commas throughout rather than a trailing "and", because each clause may end
    in one — "substantial laboratory work and little research and commercial
    work" reads as a single run-on list instead of two contrasting groups.
    """
    if len(clauses) == 1:
        return clauses[0]
    return ", ".join(clauses)


def _join(items: list[str]) -> str:
    """Oxford-free list, matching the rest of the product's voice."""
    items = list(dict.fromkeys(items))
    if len(items) == 1:
        return items[0]
    if len(items) == 2:
        return f"{items[0]} and {items[1]}"
    return f"{', '.join(items[:-1])} and {items[-1]}"
