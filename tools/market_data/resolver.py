"""The salary resolver: one deterministic path from evidence to a published record.

Tier order, highest evidence first:

  A  career-specific National Careers Service profile   VERIFIED_GUIDE
  B  curated public-sector pay framework mapping        STRONG_ESTIMATE
  C  ONS ASHE occupation earnings by SOC                STRONG_ESTIMATE / INDICATIVE
  D  related careers                                    INDICATIVE
  E  family and seniority medians                       LIMITED_DATA

Tiers D and E need tiers A to C to have produced anchors first, so resolution runs
in two passes: direct evidence for every career, then derivation for whatever is
left. That ordering is what makes 677/677 coverage possible without inventing
figures — every derived number is a statistic over official ones.

Nothing here writes a salary without `estimate_method`, `evidence_quality` and
either a source record or methodology notes. `validate.py` enforces that
independently, so a mistake here fails the build rather than shipping.
"""

from __future__ import annotations

import datetime as dt
import json
from pathlib import Path

from . import derive
from .providers import nhs, ons
from .providers.ncs import LICENCE, ApiProvider, PublicProvider
from .title_matcher import match_career

ROOT = Path(__file__).resolve().parent.parent.parent
REFERENCE = ROOT / "data" / "reference"

#: How long each kind of evidence stays fresh, in days.
REVIEW_DAYS = {
    "ncs_career_specific": 180,
    "public_sector_framework": 365,
    "ons_soc_occupation": 365,
    "related_career_derived": 180,
    "family_seniority_fallback": 180,
}

EVIDENCE_ORDER = ["VERIFIED_GUIDE", "STRONG_ESTIMATE", "INDICATIVE",
                  "LIMITED_DATA", "PENDING"]


def _today() -> str:
    return dt.date.today().isoformat()


def _review_due(method: str, verified: str = "") -> str:
    """When this record next needs looking at, counted from its evidence date."""
    days = REVIEW_DAYS.get(method, 180)
    try:
        start = dt.date.fromisoformat(verified) if verified else dt.date.today()
    except ValueError:
        start = dt.date.today()
    return (start + dt.timedelta(days=days)).isoformat()


def _verified_on(salary: dict) -> str:
    """The date the evidence behind a salary was actually obtained.

    For a direct source it is the date that source was retrieved, which a cache
    hit preserves from the original fetch. For a derived estimate there is no
    fetch: the computation happened now, over anchors that carry their own dates,
    so the run date is the honest answer for the derivation itself.

    The distinction matters because it is what keeps `next_review_due` meaningful.
    Dating everything "today" on every run — including offline runs that contact
    nobody — would mean no record ever became due for review, and the stale-data
    warning the interface shows would never fire.
    """
    dates = [record.get("retrieved_at") for record
             in salary.get("source_records", [])
             if record.get("retrieved_at")]
    return min(dates) if dates else _today()


def _round_range(low: float, high: float) -> tuple[float, float]:
    """Round to the nearest hundred pounds.

    False precision is a lie about certainty: `£43,281` implies a survey of this
    exact job. Ranges are published to a resolution the evidence can support.
    """
    low = max(0.0, round(float(low), -2))
    high = max(low, round(float(high), -2))
    return low, high


def load_aliases() -> dict[str, str]:
    path = REFERENCE / "ncs_career_aliases.json"
    if not path.exists():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    return {k: v for k, v in data.get("aliases", {}).items() if isinstance(v, str)}


class Resolver:
    """Produces one published market-data record per career."""

    def __init__(self, careers: list[dict], *, offline: bool = False,
                 refresh: bool = False):
        self.careers = careers
        self.offline = offline
        self.api = ApiProvider(offline=offline, refresh=refresh)
        self.public = PublicProvider(offline=offline, refresh=refresh)
        self.ons = ons.Provider(offline=offline, refresh=refresh)
        self.nhs = nhs.Provider()
        self.aliases = load_aliases()
        self.notes: list[str] = []
        self.match_log: list[dict] = []

    # ------------------------------------------------------------------ pass 1
    def direct_evidence(self, progress=None) -> dict[str, dict]:
        """Tiers A to C for every career. Returns career_id -> partial record."""
        profiles = self.public.index()
        if not profiles:
            self.notes.append(
                "The National Careers Service profile index was unavailable, so "
                "no career-specific salary evidence could be gathered this run.")
        if not self.api.available:
            self.notes.append(self.api.unavailable_reason())

        resolved: dict[str, dict] = {}
        for position, career in enumerate(self.careers, start=1):
            if progress:
                progress(position, len(self.careers), career["title"])
            match = match_career(career, profiles, self.aliases)
            self.match_log.append({"career_id": career["id"],
                                   "career_title": career["title"],
                                   **match.as_record()})

            record = None
            if match.accepted:
                record = self._from_profile(career, match)
            if record is None:
                record = self._from_framework(career)
            if record is None:
                record = self._from_ons(career)
            if record is not None:
                resolved[career["id"]] = record
        return resolved

    def _from_profile(self, career: dict, match) -> dict | None:
        """Tier A. The API is preferred; the public page is the fallback route."""
        profile = None
        if self.api.available:
            profile = self.api.profile(match.profile_slug, match.profile_title)
        if profile is None or not profile.has_salary():
            profile = self.public.profile(match.profile_slug, match.profile_title)
        if profile is None or not profile.has_salary():
            return None

        low, high = _round_range(profile.salary_starter, profile.salary_experienced)
        source_code = ("NCS_API" if profile.access_route == "NCS_API"
                       else "NCS_PUBLIC_PROFILE")
        provider = ("National Careers Service Job Profiles API"
                    if source_code == "NCS_API"
                    else "National Careers Service (public job profile)")
        return {
            "salary": {
                "starter": low, "experienced": high,
                "typical_low": low, "typical_high": high,
                "estimate_method": "ncs_career_specific",
                "evidence_quality": "VERIFIED_GUIDE",
                "confidence_score": 0.9 if source_code == "NCS_API" else 0.85,
                "source_records": [{
                    "provider": provider,
                    "source_code": source_code,
                    "source_url": profile.url,
                    "source_profile_id": profile.slug,
                    "source_title": profile.title,
                    "retrieved_at": profile.retrieved_at or _today(),
                    "license": LICENCE,
                    "fields_used": ["salary", "hours", "description"],
                }],
                "methodology_notes": [
                    "Career-specific salary guidance published by the National "
                    "Careers Service for this job profile.",
                ],
            },
            "work_life": self._work_life_from_profile(profile),
            "role": {
                "summary": profile.summary or None,
                "summary_kind": "authoritative" if profile.summary else "pending",
                "alternative_titles": profile.alternative_titles,
                "progression": [],
                "source_records": [{
                    "provider": provider, "source_code": source_code,
                    "source_url": profile.url, "license": LICENCE,
                    "fields_used": ["description", "alternative_titles"],
                }] if profile.summary else [],
            },
            "mapping": {
                "ncs_profile_id": profile.slug,
                "ncs_title": profile.title,
                "soc2020_code": profile.soc_code or None,
                "soc2020_title": None,
                "match_method": match.method,
                "match_score": round(match.score, 3),
                "review_status": "auto_accepted",
            },
        }

    @staticmethod
    def _work_life_from_profile(profile) -> dict:
        """Only what the source actually said. Unknown stays unknown."""
        return {
            "hours_min": profile.hours_min,
            "hours_max": profile.hours_max,
            "work_patterns": profile.work_patterns,
            "work_settings": [],
            "source_records": [{
                "provider": "National Careers Service",
                "source_code": ("NCS_API" if profile.access_route == "NCS_API"
                                else "NCS_PUBLIC_PROFILE"),
                "source_url": profile.url,
                "retrieved_at": profile.retrieved_at or _today(),
                "license": LICENCE,
                "fields_used": ["hours", "work_patterns"],
            }] if profile.hours_min or profile.work_patterns else [],
        }

    def _from_framework(self, career: dict) -> dict | None:
        """Tier B. Only where a mapping has been curated by a person."""
        mapping = self.nhs.mapping_for(career["id"])
        if not mapping:
            return None
        low, high = _round_range(mapping["low"], mapping["high"])
        return {
            "salary": {
                "starter": low, "experienced": high,
                "typical_low": low, "typical_high": high,
                "estimate_method": "public_sector_framework",
                "evidence_quality": "STRONG_ESTIMATE",
                "confidence_score": 0.8,
                "source_records": [mapping["source_record"]],
                "methodology_notes": [mapping["note"]],
            },
            "work_life": {"source_records": []},
            "role": {"summary": None, "summary_kind": "pending",
                     "alternative_titles": [], "progression": [],
                     "source_records": []},
            "mapping": {"ncs_profile_id": None, "ncs_title": None,
                        "soc2020_code": None, "soc2020_title": None,
                        "match_method": "curated_pay_framework",
                        "match_score": 1.0, "review_status": "human_verified"},
            "pay_framework": mapping.get("context"),
        }

    def _from_ons(self, career: dict) -> dict | None:
        """Tier C. SOC-linked occupation earnings."""
        estimate = self.ons.earnings_for(career)
        if not estimate:
            return None
        low, high = _round_range(estimate["low"], estimate["high"])
        return {
            "salary": {
                "starter": None, "experienced": None,
                "typical_low": low, "typical_high": high,
                "estimate_method": "ons_soc_occupation",
                "evidence_quality": estimate["evidence_quality"],
                "confidence_score": estimate.get("confidence", 0.6),
                "source_records": [estimate["source_record"]],
                "methodology_notes": [estimate["note"]],
            },
            "work_life": {"source_records": []},
            "role": {"summary": None, "summary_kind": "pending",
                     "alternative_titles": [], "progression": [],
                     "source_records": []},
            "mapping": {"ncs_profile_id": None, "ncs_title": None,
                        "soc2020_code": estimate.get("soc_code"),
                        "soc2020_title": estimate.get("soc_title"),
                        "match_method": estimate.get("match_method", "soc_mapping"),
                        "match_score": estimate.get("confidence", 0.6),
                        "review_status": estimate.get("review_status", "pending")},
        }

    # ------------------------------------------------------------------ pass 2
    def fill_remaining(self, resolved: dict[str, dict]) -> dict[str, dict]:
        """Tiers D and E, for careers with no direct evidence."""
        by_id = {career["id"]: career for career in self.careers}
        anchors = [(by_id[cid], record) for cid, record in resolved.items()]

        # Deterministic order so a run is reproducible.
        outstanding = [c for c in self.careers if c["id"] not in resolved]
        outstanding.sort(key=lambda c: c["id"])

        for career in outstanding:
            result = derive.from_related(career, anchors)
            if result is None or result.low <= 0:
                result = derive.from_family(career, anchors)
            if result.low <= 0:
                continue  # validation will fail loudly rather than publish this

            resolved[career["id"]] = {
                "salary": {
                    "starter": None, "experienced": None,
                    "typical_low": result.low, "typical_high": result.high,
                    "estimate_method": result.method,
                    "evidence_quality": result.evidence,
                    "confidence_score": (0.5 if result.evidence == "INDICATIVE"
                                         else 0.3),
                    "source_records": [],
                    "methodology_notes": result.notes,
                    "derived_from_career_ids": result.contributors,
                },
                "work_life": {"source_records": []},
                "role": {"summary": None, "summary_kind": "pending",
                         "alternative_titles": [], "progression": [],
                         "source_records": []},
                "mapping": {"ncs_profile_id": None, "ncs_title": None,
                            "soc2020_code": None, "soc2020_title": None,
                            "match_method": result.method, "match_score": None,
                            "review_status": "derived"},
            }
            # Derived records are not used as anchors for further derivation:
            # otherwise an estimate built on an estimate drifts silently.
        return resolved

    # ------------------------------------------------------------------ output
    def build(self, progress=None) -> dict:
        resolved = self.direct_evidence(progress=progress)
        direct_count = len(resolved)
        resolved = self.fill_remaining(resolved)

        records = []
        for career in self.careers:
            part = resolved.get(career["id"])
            records.append(self._record(career, part))

        return {
            "dataset_name": "Helix UK market data",
            "version": "1.0",
            "generated": _today(),
            "jurisdiction": "United Kingdom",
            "career_count": len(self.careers),
            "base_dataset": "careerpath_uk_careers_v1.json",
            "attribution": [
                "Contains public sector information licensed under the Open "
                "Government Licence v3.0.",
                "Career salary and working-hours guidance: National Careers "
                "Service, Crown copyright.",
            ],
            "pipeline_notes": self.notes,
            "direct_evidence_count": direct_count,
            "records": records,
        }

    def _record(self, career: dict, part: dict | None) -> dict:
        """Assemble the published record, deriving qualitative work-life fields."""
        salary = (part or {}).get("salary") or {
            "typical_low": None, "typical_high": None,
            "estimate_method": None, "evidence_quality": "PENDING",
            "source_records": [], "methodology_notes": [],
        }
        salary = {
            "currency": "GBP",
            "period": "year",
            "geography": "UK",
            "starter": salary.get("starter"),
            "experienced": salary.get("experienced"),
            "median": None,
            "typical_low": salary.get("typical_low"),
            "typical_high": salary.get("typical_high"),
            "estimate_method": salary.get("estimate_method"),
            "evidence_quality": salary.get("evidence_quality", "PENDING"),
            "confidence_score": salary.get("confidence_score"),
            "source_records": salary.get("source_records", []),
            # The date the *evidence* was obtained, not the date this script ran.
            # A run that answered entirely from cache retrieved nothing, and
            # stamping it with today would make every record permanently fresh and
            # silently disable the review-due mechanism.
            "last_verified": _verified_on(salary),
            "next_review_due": _review_due(salary.get("estimate_method") or "",
                                           _verified_on(salary)),
            "methodology_notes": salary.get("methodology_notes", []),
        }
        if salary.get("estimate_method") == "related_career_derived":
            salary["derived_from_career_ids"] = (
                (part or {}).get("salary", {}).get("derived_from_career_ids", []))

        work_life = dict((part or {}).get("work_life") or {})
        work_life.setdefault("hours_min", None)
        work_life.setdefault("hours_max", None)
        work_life.setdefault("work_patterns", [])
        work_life.setdefault("work_settings", [])
        work_life.setdefault("source_records", [])
        work_life.update(qualitative_work_life(career, work_life))

        role = dict((part or {}).get("role") or {})
        role.setdefault("summary", None)
        role.setdefault("summary_kind", "pending")
        role.setdefault("alternative_titles", [])
        role.setdefault("progression", [])
        role.setdefault("source_records", [])

        mapping = dict((part or {}).get("mapping") or {})
        for key in ("ncs_profile_id", "ncs_title", "soc2020_code", "soc2020_title",
                    "match_method", "match_score"):
            mapping.setdefault(key, None)
        mapping.setdefault("review_status", "pending")

        record = {
            "career_id": career["id"],
            "title": career["title"],
            "family": career["family"],
            "seniority_class": derive.seniority_class(career["title"]),
            "regulatory_status": career["regulatory_status"],
            "core_tags": career.get("core_tags", []),
            "salary": salary,
            "work_life": work_life,
            "role": role,
            "mapping": mapping,
            "enrichment": {
                "status": ("resolved" if salary["evidence_quality"] != "PENDING"
                           else "unresolved"),
                "resolved_at": _today(),
                "manual_review_required": mapping.get("review_status") in
                                          ("review_candidate",),
                "notes": [],
            },
        }
        if (part or {}).get("pay_framework"):
            record["pay_framework"] = part["pay_framework"]
        return record


#: Dataset tags mapped to the qualitative working-life dimensions. These are
#: taxonomy inferences, and the record says so — §20 forbids passing them off as
#: surveyed labour-market data.
TAG_SIGNALS = {
    "patient_contact": {"high": {"patient care", "clinical practice", "nursing",
                                 "rehabilitation", "dentistry", "specialty training"},
                        "medium": {"pharmacy", "medicines", "psychology",
                                   "imaging", "public health"}},
    "laboratory_intensity": {"high": {"laboratory", "diagnostics", "pathology",
                                      "microbiology", "omics", "bioassay"},
                             "medium": {"clinical science", "healthcare science",
                                        "manufacturing", "advanced biology",
                                        "biotechnology"}},
    "research_intensity": {"high": {"research", "academia", "R&D", "clinical trials",
                                    "trials", "clinical research"},
                           "medium": {"innovation", "epidemiology", "omics",
                                      "product development", "science"}},
    "commercial_intensity": {"high": {"commercial", "market access",
                                      "medical affairs", "consulting"},
                             "medium": {"communications", "pharma", "medtech",
                                        "product development", "operations"}},
}

REMOTE_FRIENDLY = {"data", "informatics", "digital health", "AI", "policy",
                   "writing", "communications", "consulting", "market access",
                   "health economics", "regulatory", "compliance"}
ONSITE_ONLY = {"laboratory", "patient care", "clinical practice", "manufacturing",
               "diagnostics", "pathology", "nursing", "rehabilitation"}
TRAVEL_HEAVY = {"medical affairs", "commercial", "consulting", "market access",
                "trials", "clinical research", "one health", "environmental health"}


def qualitative_work_life(career: dict, existing: dict) -> dict:
    """Derive the qualitative dimensions from the taxonomy, and label them derived."""
    tags = set(career.get("core_tags") or [])
    out: dict = {}

    for field, levels in TAG_SIGNALS.items():
        if tags & levels["high"]:
            out[field] = "high"
        elif tags & levels["medium"]:
            out[field] = "medium"
        else:
            out[field] = "low"

    if tags & ONSITE_ONLY:
        out["remote_potential"] = "low"
    elif tags & REMOTE_FRIENDLY:
        out["remote_potential"] = "high"
    else:
        out["remote_potential"] = "medium"

    out["travel"] = "high" if tags & TRAVEL_HEAVY else "low"
    out["qualitative_source"] = "taxonomy_derived"
    out["qualitative_note"] = (
        "Patient contact, laboratory, research and commercial intensity, remote "
        "potential and travel are inferred from this career's taxonomy tags, not "
        "from surveyed labour-market data.")
    return out
