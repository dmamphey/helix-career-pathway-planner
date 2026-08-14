"""Deriving a salary when no career-specific source exists.

Two tiers, in order:

Tier 4  related careers — a weighted median over resolved careers that are
        genuinely similar, with a seniority adjustment when the target is a more
        or less senior variant of them. Labelled INDICATIVE.

Tier 5  family and seniority medians. Labelled LIMITED_DATA. This is the tier
        that guarantees every career has a figure, and it is the one the interface
        must be most honest about.

Both are deterministic: same inputs, same output, every run. Neither invents a
number out of nothing — each is a statistic over figures that came from an
official source, and each records which careers it was computed from.
"""

from __future__ import annotations

import statistics
from dataclasses import dataclass

from .title_matcher import content_tokens, seniority_words

#: Seniority ladder used only to adjust a derived figure, never to claim a fact.
#:
#: Specialist, senior, lead and consultant are separate rungs, not one bucket.
#: They used to share a single "senior" class, which meant Specialist, Senior,
#: Lead and Consultant Biomedical Scientist all took the same multiplier over the
#: same neighbours and published the identical range — four progressive grades
#: reported as one salary. They map roughly onto the Agenda for Change ladder a
#: laboratory career actually follows: practitioner, specialist, senior, then the
#: lead and consultant grades above them.
SENIORITY_ORDER = ["trainee", "support", "professional", "specialist",
                   "senior", "manager", "lead", "consultant", "executive"]

SENIORITY_TOKENS = {
    "trainee": {"trainee", "apprentice", "student", "intern", "graduate"},
    "support": {"assistant", "support", "aide", "helper", "technician",
                "associate"},
    "specialist": {"specialist"},
    "senior": {"senior", "advanced", "higher"},
    "manager": {"manager", "coordinator", "supervisor", "officer"},
    "lead": {"lead", "principal"},
    "consultant": {"consultant"},
    "executive": {"head", "chief", "director", "executive"},
}

#: The one title where "Consultant" trails the profession and still means the
#: senior clinical grade. Everything else of that shape is an advisory role.
CONSULTANT_GRADE_SUFFIXES = {"nurse consultant"}

#: Multipliers applied when the target's seniority differs from its neighbours'.
#: Modest on purpose — a derived estimate should not manufacture a big claim.
STEP_MULTIPLIER = 0.12

#: Derived figures are published to the nearest thousand pounds.
#:
#: A direct source is republished exactly as it was issued, and every one of those
#: happens to be round already. A derived figure is not a published number at all:
#: it is a weighted median over several ranges with a seniority multiplier applied,
#: and "£39,700" claims a precision that arithmetic cannot give it. Rounding is not
#: about tidiness — the digits themselves are an assertion, and this is the
#: assertion the evidence supports.
DERIVED_PRECISION = -3


def seniority_class(title: str) -> str:
    """A crude occupational seniority class from title conventions.

    Deliberately not `pathway_depth`: that field describes how much Helix content
    exists for a career, which has nothing to do with how senior the job is.

    Checked from the top of the ladder down, so a title carrying two markers
    takes the higher one — "Lead Specialist Biomedical Scientist" is a lead.
    """
    text = str(title or "").lower().replace("-", " ").strip()
    words = set(text.split())

    # "Consultant" is two different jobs depending on where it sits. As a prefix
    # it is the senior clinical or scientific grade — Consultant Biomedical
    # Scientist, Consultant in Public Health. As a trailing noun it is an
    # advisory role at no particular grade: a Quality Consultant or a Life
    # Sciences Consultant is not a Band 8c post, and treating it as one inflated
    # ten commercial roles. Only the prefix form, plus the one curated exception,
    # counts as the grade.
    if "consultant" in words:
        if text.startswith("consultant ") or text in CONSULTANT_GRADE_SUFFIXES:
            return "consultant"
        words = words - {"consultant"}

    for name in ("executive", "lead", "manager", "senior", "specialist",
                 "trainee", "support"):
        if words & SENIORITY_TOKENS[name]:
            return name
    return "professional"


def _rank(title: str) -> int:
    return SENIORITY_ORDER.index(seniority_class(title))


@dataclass
class Derived:
    low: float
    high: float
    method: str
    evidence: str
    contributors: list[str]
    notes: list[str]


def similarity(target: dict, other: dict) -> float:
    """Deterministic career-to-career similarity, per the specification weights.

    0.50 core tags, 0.20 same family, 0.15 seniority compatibility,
    0.15 title tokens.
    """
    target_tags = set(target.get("core_tags") or [])
    other_tags = set(other.get("core_tags") or [])
    if target_tags and other_tags:
        tag_score = len(target_tags & other_tags) / len(target_tags | other_tags)
    else:
        tag_score = 0.0

    family_score = 1.0 if target.get("family") == other.get("family") else 0.0

    gap = abs(_rank(target["title"]) - _rank(other["title"]))
    seniority_score = max(0.0, 1.0 - gap / 3)

    target_tokens = content_tokens(target["title"])
    other_tokens = content_tokens(other["title"])
    if target_tokens and other_tokens:
        title_score = (len(target_tokens & other_tokens)
                       / len(target_tokens | other_tokens))
    else:
        title_score = 0.0

    return (0.50 * tag_score + 0.20 * family_score + 0.15 * seniority_score
            + 0.15 * title_score)


def _weighted_median(pairs: list[tuple[float, float]]) -> float:
    """Median of values weighted by similarity. Robust to one odd neighbour."""
    if not pairs:
        return 0.0
    ordered = sorted(pairs, key=lambda item: item[0])
    total = sum(weight for _, weight in ordered)
    if total <= 0:
        return statistics.median([value for value, _ in ordered])
    running = 0.0
    for value, weight in ordered:
        running += weight
        if running >= total / 2:
            return value
    return ordered[-1][0]


def from_related(target: dict, resolved: list[tuple[dict, dict]],
                 *, minimum: int = 3) -> Derived | None:
    """Tier 4. `resolved` is a list of (career, market record) already priced.

    Requires at least `minimum` genuinely similar careers. Similarity below 0.35
    is not "closely related" in any useful sense, so those are excluded rather
    than padded in to reach the count.
    """
    scored = []
    for career, record in resolved:
        if career["id"] == target["id"]:
            continue
        salary = record["salary"]
        if not (salary.get("typical_low") and salary.get("typical_high")):
            continue
        score = similarity(target, career)
        if score >= 0.35:
            scored.append((score, career, salary))

    scored.sort(key=lambda item: (-item[0], item[1]["id"]))
    neighbours = scored[:8]
    if len(neighbours) < minimum:
        return None

    low = _weighted_median([(s["typical_low"], score) for score, _, s in neighbours])
    high = _weighted_median([(s["typical_high"], score) for score, _, s in neighbours])

    # Price the seniority difference against the neighbours actually used.
    target_rank = _rank(target["title"])
    neighbour_rank = statistics.median([_rank(c["title"]) for _, c, _ in neighbours])
    steps = target_rank - neighbour_rank
    adjustment = 1 + STEP_MULTIPLIER * steps
    low, high = low * adjustment, high * adjustment

    # Bound the extrapolation where the seniority signal cannot be trusted.
    #
    # §15 singles out one word: "Specialist" does not mean the same seniority in
    # every sector. The titles bear it out — a Specialist Biomedical Scientist is
    # a real grade on a real ladder, an Information Governance Specialist is a
    # subject-matter role at no particular grade, and nothing in the title
    # separates them. That rung is therefore not allowed to push a figure past
    # everything it was derived from: it was what published Information
    # Governance Specialist at 102.9k, from data roles topping out at 83k.
    #
    # Every other rung keeps its uplift. Senior, Lead and Consultant are ordinary
    # grade markers that mean what they say, and clamping them was what made
    # Consultant, Lead, Senior and Specialist Biomedical Scientist all report the
    # identical range — four progressive grades priced as one job, which is a
    # worse error than an imprecise figure. The results stay INDICATIVE, because
    # a derived ladder is still a derivation.
    floor = min(s["typical_low"] for _, _, s in neighbours)
    ceiling = max(s["typical_high"] for _, _, s in neighbours)
    low = max(floor, low)
    if seniority_class(target["title"]) == "specialist":
        low = min(low, ceiling)
        high = min(high, ceiling)
    high = max(low, high)

    notes = [
        f"Derived from {len(neighbours)} related careers with stronger salary "
        f"evidence, using a similarity-weighted median.",
    ]
    if steps:
        direction = "more" if steps > 0 else "less"
        notes.append(
            f"Adjusted by {abs(steps) * STEP_MULTIPLIER:.0%} because this career "
            f"is {direction} senior than the careers it was derived from.")

    return Derived(
        low=round(low, DERIVED_PRECISION), high=round(high, DERIVED_PRECISION),
        method="related_career_derived", evidence="INDICATIVE",
        contributors=[career["id"] for _, career, _ in neighbours],
        notes=notes,
    )


def from_family(target: dict, resolved: list[tuple[dict, dict]]) -> Derived:
    """Tier 5. The last resort, and the reason coverage can reach 677/677."""
    family = target.get("family")
    target_class = seniority_class(target["title"])

    def pool(predicate) -> list[tuple[dict, dict]]:
        return [(career, record["salary"]) for career, record in resolved
                if career["id"] != target["id"] and predicate(career)
                and record["salary"].get("typical_low")]

    same_family_and_class = pool(
        lambda c: c.get("family") == family
        and seniority_class(c["title"]) == target_class)
    same_family = pool(lambda c: c.get("family") == family)
    everything = pool(lambda c: True)

    for candidates, scope in ((same_family_and_class,
                               "the same career family and seniority level"),
                              (same_family, "the same career family"),
                              (everything, "the whole catalogue")):
        if len(candidates) < 3:
            continue
        low = statistics.median([s["typical_low"] for _, s in candidates])
        high = statistics.median([s["typical_high"] for _, s in candidates])
        notes = [f"Median of {len(candidates)} careers in {scope}. This is a "
                 f"broad indication only: no salary source specific to this "
                 f"career was available."]

        # Price the grade against the pool, exactly as tier 4 does.
        #
        # Without this the last resort returned one number for everybody who
        # reached it: the widest pool is the whole catalogue, whose median is the
        # same value whatever the target is, so Clinical Research Associate and
        # Lead Clinical Research Associate came out identical. A broad indication
        # is honest; saying a lead and a practitioner are paid the same is not.
        # The pool for the first scope is already grade-matched, so the
        # adjustment is nil there and only bites on the broader fallbacks.
        steps = _rank(target["title"]) - statistics.median(
            [_rank(c["title"]) for c, _ in candidates])
        if steps:
            adjustment = 1 + STEP_MULTIPLIER * steps
            low, high = low * adjustment, high * adjustment
            direction = "more" if steps > 0 else "less"
            notes.append(
                f"Adjusted by {abs(steps) * STEP_MULTIPLIER:.0%} because this "
                f"career is {direction} senior than the careers it was compared "
                f"with.")

        return Derived(
            low=round(max(0.0, low), DERIVED_PRECISION),
            high=round(max(low, high), DERIVED_PRECISION),
            method="family_seniority_fallback", evidence="LIMITED_DATA",
            contributors=[], notes=notes,
        )

    # Nothing at all to derive from. The caller treats this as a failure rather
    # than publishing a number nobody can justify.
    return Derived(low=0.0, high=0.0, method="no_evidence", evidence="PENDING",
                   contributors=[], notes=["No salary evidence available."])
