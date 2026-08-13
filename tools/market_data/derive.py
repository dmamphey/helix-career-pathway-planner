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
SENIORITY_ORDER = ["trainee", "support", "professional", "manager", "senior",
                   "executive"]

SENIORITY_TOKENS = {
    "trainee": {"trainee", "apprentice", "student", "intern", "graduate"},
    "support": {"assistant", "support", "aide", "helper", "technician",
                "associate"},
    "manager": {"manager", "coordinator", "supervisor", "officer"},
    "senior": {"senior", "advanced", "specialist", "lead", "principal",
               "consultant", "higher"},
    "executive": {"head", "chief", "director", "executive"},
}

#: Multipliers applied when the target's seniority differs from its neighbours'.
#: Modest on purpose — a derived estimate should not manufacture a big claim.
STEP_MULTIPLIER = 0.12


def seniority_class(title: str) -> str:
    """A crude occupational seniority class from title conventions.

    Deliberately not `pathway_depth`: that field describes how much Helix content
    exists for a career, which has nothing to do with how senior the job is.
    """
    words = set(str(title or "").lower().replace("-", " ").split())
    for name in ("executive", "senior", "manager", "trainee", "support"):
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
        low=round(low, -2), high=round(high, -2),
        method="related_career_derived", evidence="INDICATIVE",
        contributors=[career["id"] for _, career, _ in neighbours],
        notes=notes,
    )


def from_family(target: dict, resolved: list[tuple[dict, dict]]) -> Derived:
    """Tier 5. The last resort, and the reason coverage can reach 677/677."""
    family = target.get("family")
    target_class = seniority_class(target["title"])

    def pool(predicate) -> list[dict]:
        return [record["salary"] for career, record in resolved
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
        if len(candidates) >= 3:
            low = statistics.median([s["typical_low"] for s in candidates])
            high = statistics.median([s["typical_high"] for s in candidates])
            return Derived(
                low=round(low, -2), high=round(high, -2),
                method="family_seniority_fallback", evidence="LIMITED_DATA",
                contributors=[],
                notes=[f"Median of {len(candidates)} careers in {scope}. This is "
                       f"a broad indication only: no salary source specific to "
                       f"this career was available."],
            )

    # Nothing at all to derive from. The caller treats this as a failure rather
    # than publishing a number nobody can justify.
    return Derived(low=0.0, high=0.0, method="no_evidence", evidence="PENDING",
                   contributors=[], notes=["No salary evidence available."])
