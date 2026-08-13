"""Matching Helix careers to external job profiles, auditably.

The rule that shapes this module: a poor direct match is worse than a transparent
derived estimate. So matching is deliberately hard to pass.

The trap here is seniority. "Senior Biomedical Scientist" shares every content
word with the "Biomedical scientist" profile, so naive token similarity scores it
1.0 and the career inherits an entry-grade salary range as though it were a
career-specific fact. That would be wrong twice over: wrong number, and a
`VERIFIED_GUIDE` label on a guess. Seniority-modified titles are therefore
rejected as direct matches and sent to derivation, where the seniority is priced
in explicitly and the evidence is labelled honestly.
"""

from __future__ import annotations

import re
from dataclasses import dataclass

#: Words that mark a title as a seniority variant rather than a distinct job.
SENIORITY_MODIFIERS = {
    "trainee", "apprentice", "graduate", "junior", "assistant", "associate",
    "senior", "specialist", "advanced", "higher", "lead", "principal",
    "consultant", "head", "chief", "deputy", "director", "manager",
}

#: Curated abbreviation expansions. Only these are applied — normalisation must
#: never guess at an abbreviation it has not been told about.
ABBREVIATIONS = {
    "bms": "biomedical scientist",
    "odp": "operating department practitioner",
    "slt": "speech and language therapist",
    "cra": "clinical research associate",
    "msl": "medical science liaison",
    "qa": "quality assurance",
    "qc": "quality control",
    "ra": "regulatory affairs",
    "heor": "health economics and outcomes research",
    "gp": "general practitioner",
    "it": "information technology",
    "ai": "artificial intelligence",
    "r and d": "research and development",
}

#: Dropped before comparison: they describe the employer or setting, not the job.
NOISE_WORDS = {"nhs", "uk", "clinical", "healthcare", "health", "service",
               "services", "and", "or", "of", "the", "in", "for", "a", "an",
               "to", "with"}


def normalise(title: str) -> str:
    """Lowercase, de-punctuate and expand only curated abbreviations."""
    text = str(title or "").lower().replace("&", " and ")
    text = re.sub(r"\(.*?\)", " ", text)          # bracketed asides
    text = re.sub(r"\s*[-–—]\s*", " ", text)
    text = re.sub(r"[^a-z0-9]+", " ", text)
    text = re.sub(r"\s+", " ", text).strip()
    for short, long in ABBREVIATIONS.items():
        text = re.sub(rf"\b{re.escape(short)}\b", long, text)
    return re.sub(r"\s+", " ", text).strip()


def content_tokens(title: str) -> set[str]:
    """Tokens that carry the meaning of the job."""
    return {word for word in normalise(title).split()
            if word not in NOISE_WORDS and len(word) > 2}


def seniority_words(title: str) -> set[str]:
    return {word for word in normalise(title).split()
            if word in SENIORITY_MODIFIERS}


@dataclass
class Match:
    """A matching decision, with everything needed to audit it later."""

    career_id: str
    career_title: str
    profile_slug: str = ""
    profile_title: str = ""
    method: str = "no_match"
    score: float = 0.0
    accepted: bool = False
    reason: str = ""
    aliases_used: list[str] | None = None

    def as_record(self) -> dict:
        return {
            "profile_slug": self.profile_slug,
            "profile_title": self.profile_title,
            "match_method": self.method,
            "match_score": round(self.score, 3),
            "auto_accepted": self.accepted,
            "reason": self.reason,
            "aliases_used": self.aliases_used or [],
        }


def match_career(career: dict, profiles: dict[str, str],
                 aliases: dict[str, str] | None = None) -> Match:
    """Find the best external profile for one career.

    `profiles` maps slug -> profile title. `aliases` maps a normalised career
    title to a slug, for human-curated decisions that the rules cannot reach.

    Accepts only an exact normalised title match, or a curated alias. Everything
    else is recorded as a candidate for review and left for derivation.
    """
    title = career["title"]
    result = Match(career_id=career["id"], career_title=title)

    normalised = normalise(title)
    if aliases and normalised in aliases:
        slug = aliases[normalised]
        result.profile_slug = slug
        result.profile_title = profiles.get(slug, slug)
        result.method = "curated_alias"
        result.score = 1.0
        result.accepted = True
        result.reason = "curated mapping"
        result.aliases_used = [normalised]
        return result

    by_norm: dict[str, tuple[str, str]] = {}
    for slug, profile_title in profiles.items():
        by_norm.setdefault(normalise(profile_title), (slug, profile_title))

    exact = by_norm.get(normalised)
    if exact:
        result.profile_slug, result.profile_title = exact
        result.method = "exact_title"
        result.score = 1.0
        result.accepted = True
        result.reason = "normalised titles are identical"
        return result

    # Nothing else is auto-accepted. Record the closest candidate so that a human
    # reviewing the audit can see what was considered and rejected.
    career_tokens = content_tokens(title)
    career_seniority = seniority_words(title)
    best: tuple[float, str, str] = (0.0, "", "")
    for slug, profile_title in profiles.items():
        profile_tokens = content_tokens(profile_title)
        if not career_tokens or not profile_tokens:
            continue
        overlap = len(career_tokens & profile_tokens)
        if not overlap:
            continue
        score = overlap / len(career_tokens | profile_tokens)
        if score > best[0]:
            best = (score, slug, profile_title)

    result.score, result.profile_slug, result.profile_title = best
    if best[0] >= 0.6:
        profile_seniority = seniority_words(best[2])
        if career_seniority - profile_seniority:
            result.method = "seniority_variant_rejected"
            result.reason = (
                "close to \"" + best[2] + "\" but the career title carries "
                + ", ".join(sorted(career_seniority - profile_seniority))
                + ", so the profile's range would understate it; sent to "
                  "derivation instead")
        else:
            result.method = "review_candidate"
            result.reason = ("strong token overlap but not an exact title; "
                             "needs human confirmation before it can be used "
                             "as career-specific evidence")
    else:
        result.method = "no_match"
        result.reason = "no external profile is close enough to use"
    return result
