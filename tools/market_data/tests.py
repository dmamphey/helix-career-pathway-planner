"""Tests for the market-data pipeline.

Run them with no arguments and no network:

    python tools/market_data/tests.py

Everything here is fixture-driven. No test reaches the internet, calls an API or
needs a key — a suite that only passes when the National Careers Service is up is
not a suite, and the point of most of these tests is to pin behaviour that only
shows itself when a source is missing or wrong.

`unittest` rather than pytest because the whole pipeline is standard library
only, and the refresh workflow fails if that ever stops being true.
"""

from __future__ import annotations

import datetime as dt
import json
import os
import re
import statistics
import sys
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(ROOT / "tools"))

from market_data import derive                                    # noqa: E402
from market_data.providers.ncs import parse_public_profile        # noqa: E402
from market_data.report import _alias_candidates, _qualifier_note  # noqa: E402
from market_data.resolver import (                                # noqa: E402
    _review_due, _round_range, _verified_on, qualitative_work_life,
)
from market_data.title_matcher import (                           # noqa: E402
    content_tokens, match_career, normalise,
)
from market_data.validate import validate                         # noqa: E402

BASE = json.loads((ROOT / "data" / "careerpath_uk_careers_v1.json")
                  .read_text(encoding="utf-8"))
PUBLISHED = json.loads((ROOT / "data" / "helix_market_data_uk_v1.json")
                       .read_text(encoding="utf-8"))

#: A small stand-in for the National Careers Service profile index.
PROFILES = {
    "biomedical-scientist": "Biomedical scientist",
    "clinical-scientist": "Clinical scientist",
    "operating-department-practitioner": "Operating department practitioner",
    "midwife": "Midwife",
    "dentist": "Dentist",
}


def career(career_id: str, title: str, **extra) -> dict:
    """A career shaped the way the resolver expects one."""
    record = {
        "id": career_id,
        "title": title,
        "family": extra.get("family", "Healthcare Science & Diagnostics"),
        "core_tags": extra.get("core_tags", ["laboratory", "diagnostics"]),
        "regulatory_status": extra.get("regulatory_status",
                                       "Generally unregulated"),
    }
    record.update({k: v for k, v in extra.items() if k not in record})
    return record


def salaried(career_id, title, low, high, *, family=None, tags=None,
             quality="VERIFIED_GUIDE"):
    """A (career, record) pair of the shape derivation consumes."""
    subject = career(career_id, title,
                     family=family or "Healthcare Science & Diagnostics",
                     core_tags=tags or ["laboratory", "diagnostics"])
    return subject, {"salary": {"typical_low": low, "typical_high": high,
                                "evidence_quality": quality}}


# --------------------------------------------------------------- title matching

class TitleMatching(unittest.TestCase):

    def test_exact_title_is_accepted(self):
        result = match_career(career("CP-003", "Biomedical Scientist"), PROFILES)
        self.assertTrue(result.accepted)
        self.assertEqual(result.method, "exact_title")
        self.assertEqual(result.profile_slug, "biomedical-scientist")
        self.assertEqual(result.score, 1.0)

    def test_a_curated_alias_is_accepted_and_recorded(self):
        aliases = {"andrology scientist": "clinical-scientist"}
        result = match_career(career("CP-001", "Andrology Scientist"),
                              PROFILES, aliases)
        self.assertTrue(result.accepted)
        self.assertEqual(result.method, "curated_alias")
        self.assertEqual(result.profile_slug, "clinical-scientist")
        self.assertEqual(result.aliases_used, ["andrology scientist"])

    def test_a_seniority_variant_is_never_a_direct_match(self):
        """The invariant this whole module exists to protect.

        "Senior Biomedical Scientist" shares every content word with the
        entry-grade profile. Accepting it would publish a starter range as a
        career-specific fact about a senior post.
        """
        result = match_career(career("CP-900", "Senior Biomedical Scientist"),
                              PROFILES)
        self.assertFalse(result.accepted)
        self.assertEqual(result.method, "seniority_variant_rejected")
        self.assertIn("senior", result.reason)

    def test_every_seniority_prefix_is_rejected(self):
        for prefix in ("Senior", "Trainee", "Principal", "Lead", "Consultant",
                       "Advanced", "Deputy", "Head of"):
            with self.subTest(prefix=prefix):
                result = match_career(
                    career("CP-901", f"{prefix} Biomedical Scientist"), PROFILES)
                self.assertFalse(
                    result.accepted,
                    f"{prefix} Biomedical Scientist was auto-accepted")

    def test_a_close_but_inexact_title_needs_review_rather_than_acceptance(self):
        result = match_career(career("CP-902", "Biomedical Science Practitioner"),
                              PROFILES)
        self.assertFalse(result.accepted)
        self.assertIn(result.method, {"review_candidate", "no_match"})

    def test_an_unrelated_title_matches_nothing(self):
        result = match_career(career("CP-903", "Market Access Manager"), PROFILES)
        self.assertFalse(result.accepted)

    def test_only_curated_abbreviations_are_expanded(self):
        self.assertEqual(normalise("BMS"), "biomedical scientist")
        # Not in the dictionary, so it stays as written rather than being guessed.
        self.assertEqual(normalise("XYZ Officer"), "xyz officer")

    def test_normalisation_ignores_punctuation_and_case(self):
        self.assertEqual(normalise("Clinical Scientist (Genomics)"),
                         normalise("clinical  scientist"))

    def test_setting_words_do_not_carry_meaning(self):
        self.assertNotIn("nhs", content_tokens("NHS Biomedical Scientist"))


# ------------------------------------------------------------------- derivation

class Derivation(unittest.TestCase):

    def setUp(self):
        self.anchors = [
            salaried("CP-A", "Biomedical Scientist", 30000, 53000),
            salaried("CP-B", "Clinical Scientist", 49000, 65000),
            salaried("CP-C", "Cytology Scientist", 32000, 50000),
            salaried("CP-D", "Histology Scientist", 31000, 48000),
            salaried("CP-E", "Market Access Manager", 60000, 95000,
                     family="Medical Affairs, Commercial, Market Access & Communications",
                     tags=["commercial", "market access"]),
        ]

    def test_related_derivation_uses_similar_careers_not_the_richest(self):
        target = career("CP-Z", "Andrology Scientist")
        result = derive.from_related(target, self.anchors)
        self.assertIsNotNone(result)
        self.assertGreater(len(result.contributors), 0)
        # The commercial outlier must not drag the range up.
        self.assertLess(result.high, 95000)
        self.assertNotIn("CP-E", result.contributors)

    def test_derivation_is_a_robust_statistic_not_the_maximum(self):
        target = career("CP-Z", "Andrology Scientist")
        result = derive.from_related(target, self.anchors)
        highs = [record["salary"]["typical_high"] for _, record in self.anchors]
        self.assertLess(result.high, max(highs))
        self.assertGreater(result.high, min(highs))

    def test_family_fallback_produces_a_range_when_nothing_is_similar(self):
        target = career("CP-Y", "Wholly Novel Role",
                        core_tags=["nothing", "in", "common"])
        result = derive.from_family(target, self.anchors)
        self.assertIsNotNone(result)
        self.assertGreater(result.low, 0)
        self.assertGreaterEqual(result.high, result.low)

    def test_seniority_classification_is_deterministic_and_ordered(self):
        self.assertEqual(derive.seniority_class("Trainee Biomedical Scientist"),
                         "trainee")
        self.assertEqual(derive.seniority_class("Biomedical Scientist"),
                         "professional")
        self.assertEqual(derive.seniority_class("Head of Laboratory Services"),
                         "executive")
        for title in ("Senior Biomedical Scientist", "Laboratory Manager"):
            with self.subTest(title=title):
                self.assertNotEqual(derive.seniority_class(title), "professional")

    def test_similarity_is_symmetric(self):
        first, second = self.anchors[0][0], self.anchors[1][0]
        self.assertAlmostEqual(derive.similarity(first, second),
                               derive.similarity(second, first), places=9)

    def test_derivation_never_extrapolates_past_its_contributors(self):
        """The seniority uplift may move a figure, not invent a new ceiling.

        "Information Governance Specialist" derived from data roles topping out at
        83k came out at 102.9k, because "Specialist" reads as two rungs more
        senior. No source in that chain supported six figures.
        """
        senior = career("CP-Z", "Specialist Andrology Scientist")
        result = derive.from_related(senior, self.anchors)
        self.assertIsNotNone(result)
        contributor_highs = [record["salary"]["typical_high"]
                             for subject, record in self.anchors
                             if subject["id"] in result.contributors]
        contributor_lows = [record["salary"]["typical_low"]
                            for subject, record in self.anchors
                            if subject["id"] in result.contributors]
        self.assertLessEqual(result.high, max(contributor_highs))
        self.assertGreaterEqual(result.low, min(contributor_lows))

    def test_a_junior_variant_is_not_pushed_below_its_contributors(self):
        junior = career("CP-Z", "Trainee Andrology Scientist")
        result = derive.from_related(junior, self.anchors)
        contributor_lows = [record["salary"]["typical_low"]
                            for subject, record in self.anchors
                            if subject["id"] in result.contributors]
        self.assertGreaterEqual(result.low, min(contributor_lows))
        self.assertLessEqual(result.low, result.high)

    def test_an_estimate_exceeds_its_contributors_only_by_seniority(self):
        """A derived range may sit above its contributors, but only for a reason.

        Being a more senior grade than the careers it was derived from is that
        reason — Consultant Biomedical Scientist should out-earn the
        practitioners it is priced against. Anything else must stay inside the
        span of the evidence, and the excess is capped at the documented
        multiplier so a large claimed gap cannot become an unbounded one.
        """
        by_id = {r["career_id"]: r for r in PUBLISHED["records"]}
        for record in PUBLISHED["records"]:
            salary = record["salary"]
            sources = salary.get("derived_from_career_ids") or []
            if salary["estimate_method"] != "related_career_derived" or not sources:
                continue
            contributors = [by_id[cid] for cid in sources if cid in by_id]
            if not contributors:
                continue
            ceiling = max(c["salary"]["typical_high"] for c in contributors)
            if salary["typical_high"] <= ceiling:
                continue

            with self.subTest(career=record["career_id"]):
                steps = (derive._rank(record["title"])
                         - statistics.median([derive._rank(c["title"])
                                              for c in contributors]))
                self.assertGreater(
                    steps, 0,
                    f"{record['title']} exceeds its contributors without being "
                    f"a more senior grade than them")
                self.assertNotEqual(
                    derive.seniority_class(record["title"]), "specialist",
                    "a 'specialist' title was allowed past its contributors, "
                    "which is the unreliable signal §15 warns about")
                allowed = ceiling * (1 + derive.STEP_MULTIPLIER * steps)
                self.assertLessEqual(
                    salary["typical_high"], round(allowed) + 1000,
                    "the excess is larger than the seniority adjustment allows")

    def test_a_seniority_ladder_is_priced_as_a_ladder(self):
        """Four progressive grades must not report one salary.

        Specialist, Senior, Lead and Consultant Biomedical Scientist all shared
        the class "senior", so they took the same multiplier over the same
        neighbours and published the identical range.
        """
        by_title = {r["title"]: r for r in PUBLISHED["records"]}
        ladder = ["Biomedical Scientist", "Specialist Biomedical Scientist",
                  "Senior Biomedical Scientist", "Lead Biomedical Scientist",
                  "Consultant Biomedical Scientist"]
        highs = []
        for title in ladder:
            self.assertIn(title, by_title, f"{title} is missing from the dataset")
            highs.append(by_title[title]["salary"]["typical_high"])
        self.assertEqual(len(set(highs)), len(highs),
                         f"grades share a salary: {dict(zip(ladder, highs))}")
        self.assertEqual(highs, sorted(highs),
                         f"the ladder is not monotonic: {dict(zip(ladder, highs))}")

    def test_no_senior_variant_is_paid_less_than_its_base_career(self):
        by_title = {r["title"]: r for r in PUBLISHED["records"]}
        order = {name: i for i, name in enumerate(derive.SENIORITY_ORDER)}
        for record in PUBLISHED["records"]:
            match = re.match(
                r"^(Senior|Lead|Consultant|Specialist|Principal|Advanced)\s+(.*)$",
                record["title"])
            base = by_title.get(match.group(2)) if match else None
            if not base:
                continue
            if (order[derive.seniority_class(record["title"])]
                    <= order[derive.seniority_class(base["title"])]):
                continue
            with self.subTest(career=record["title"]):
                self.assertGreater(
                    record["salary"]["typical_high"],
                    base["salary"]["typical_high"],
                    f"{record['title']} is not paid above {base['title']}")

    def test_similarity_prefers_the_same_family(self):
        target = career("CP-Z", "Andrology Scientist")
        near = derive.similarity(target, self.anchors[0][0])
        far = derive.similarity(target, self.anchors[4][0])
        self.assertGreater(near, far)


# ------------------------------------------------------------------- rounding

class SourceDeduplication(unittest.TestCase):
    """One published profile is one piece of evidence, not four.

    Curated aliases let several careers resolve to the same external profile —
    Clinical, Community, Hospital and Industrial Pharmacist all take their range
    from one NCS page. Counting it once per career let it dominate a weighted
    median, and Accuracy Checking Pharmacy Technician was priced off five
    identical pharmacist entries into a professional grade.
    """

    def sourced(self, career_id, title, low, high, profile, family=None):
        subject = career(career_id, title,
                         family=family or "Nursing, Midwifery & Pharmacy",
                         core_tags=["medicines", "pharmacy", "patient care"])
        return subject, {"salary": {
            "typical_low": low, "typical_high": high,
            "evidence_quality": "VERIFIED_GUIDE",
            "source_records": [{"source_code": "NCS_PUBLIC_PROFILE",
                                "source_profile_id": profile}]}}

    def test_careers_sharing_a_source_are_counted_once(self):
        anchors = [
            self.sourced("CP-A", "Pharmacist", 40000, 65000, "pharmacist"),
            self.sourced("CP-B", "Clinical Pharmacist", 40000, 65000, "pharmacist"),
            self.sourced("CP-C", "Hospital Pharmacist", 40000, 65000, "pharmacist"),
            self.sourced("CP-D", "Community Pharmacist", 40000, 65000, "pharmacist"),
            self.sourced("CP-E", "Pharmacy Technician", 28000, 39000,
                         "pharmacy-technician"),
            self.sourced("CP-F", "Nursing Associate", 26000, 31000,
                         "nursing-associate"),
            self.sourced("CP-G", "Midwife", 32000, 48000, "midwife"),
        ]
        target = career("CP-Z", "Accuracy Checking Pharmacy Technician",
                        family="Nursing, Midwifery & Pharmacy",
                        core_tags=["medicines", "pharmacy", "patient care"])
        result = derive.from_related(target, anchors)
        self.assertIsNotNone(result)
        used = set(result.contributors)
        pharmacists = used & {"CP-A", "CP-B", "CP-C", "CP-D"}
        self.assertLessEqual(
            len(pharmacists), 1,
            f"the same pharmacist profile was counted {len(pharmacists)} times")

    def test_derived_anchors_are_never_deduplicated(self):
        """A derived range has no external source, so it must not be collapsed."""
        anchors = [salaried(f"CP-{i}", f"Scientist {i}", 30000 + i * 1000,
                            50000 + i * 1000, quality="INDICATIVE")
                   for i in range(5)]
        for _, record in anchors:
            record["salary"]["source_records"] = []
        target = career("CP-Z", "Andrology Scientist")
        result = derive.from_related(target, anchors)
        self.assertIsNotNone(result)
        self.assertGreaterEqual(len(result.contributors), 3,
                                "derived anchors were wrongly collapsed")

    def test_no_published_range_is_dominated_by_one_source(self):
        by_id = {r["career_id"]: r for r in PUBLISHED["records"]}

        def source_of(record):
            for entry in record["salary"].get("source_records") or []:
                if entry.get("source_profile_id"):
                    return entry["source_profile_id"]
            return None

        for record in PUBLISHED["records"]:
            sources = record["salary"].get("derived_from_career_ids") or []
            if len(sources) < 3:
                continue
            used = [source_of(by_id[c]) for c in sources if c in by_id]
            named = [s for s in used if s]
            with self.subTest(career=record["career_id"]):
                self.assertEqual(
                    len(named), len(set(named)),
                    "a derived range cites the same external profile more than "
                    "once among its contributors")


class NhsHealthCareersLinks(unittest.TestCase):
    """Links only. NHS England reserves all rights in this content.

    The provider is built so copying is impossible rather than merely
    discouraged, and these tests hold that line: they check the published data
    carries URLs and no prose, and that nothing claims otherwise.
    """

    def links(self):
        out = []
        for record in PUBLISHED["records"]:
            for entry in record["role"].get("external_profiles") or []:
                out.append((record, entry))
        return out

    def test_some_careers_carry_a_link(self):
        self.assertGreater(len(self.links()), 0,
                           "no NHS Health Careers links were published")

    def test_every_link_is_a_url_on_the_expected_host(self):
        for record, entry in self.links():
            with self.subTest(career=record["career_id"]):
                self.assertTrue(entry["source_url"].startswith(
                    "https://www.healthcareers.nhs.uk/"))
                self.assertEqual(entry["provider"], "NHS Health Careers")

    def test_a_link_record_carries_no_content(self):
        """No summary, no description, no borrowed title — only where to read it."""
        allowed = {"provider", "source_code", "source_url", "match_method",
                   "content_reproduced", "licence_note"}
        for record, entry in self.links():
            with self.subTest(career=record["career_id"]):
                self.assertEqual(set(entry) - allowed, set(),
                                 "a link record grew a field that could hold "
                                 "borrowed content")
                self.assertFalse(entry["content_reproduced"])
                for field in ("summary", "description", "title", "tasks", "text"):
                    self.assertNotIn(field, entry)

    def test_a_link_never_becomes_the_role_description(self):
        """An NHS link must not be mistaken for a sourced Helix description."""
        for record, _ in self.links():
            role = record["role"]
            if role.get("summary_kind") != "authoritative":
                continue
            with self.subTest(career=record["career_id"]):
                for source in role.get("source_records") or []:
                    self.assertNotIn("healthcareers.nhs.uk",
                                     source.get("source_url", ""),
                                     "a role description is attributed to NHS "
                                     "Health Careers, whose content may not be "
                                     "reproduced")

    def test_the_attribution_records_the_linking_basis(self):
        blob = " ".join(PUBLISHED.get("attribution", []))
        self.assertIn("NHS Health Careers", blob)
        self.assertIn("not reproduced", blob)


class Rounding(unittest.TestCase):

    def test_ranges_are_rounded_away_from_false_precision(self):
        low, high = _round_range(43281.44, 51999.02)
        self.assertEqual(low % 100, 0)
        self.assertEqual(high % 100, 0)

    def test_an_inverted_range_is_corrected_rather_than_published(self):
        low, high = _round_range(60000, 40000)
        self.assertLessEqual(low, high)

    def test_a_negative_low_never_survives(self):
        low, _ = _round_range(-5000, 30000)
        self.assertGreaterEqual(low, 0)


# ------------------------------------------------------- profile page parsing

class PublicProfileParsing(unittest.TestCase):
    """The page furniture is not part of the role description.

    A profile page repeats its own title, then labels the alternative titles,
    then gives the one sentence that actually describes the job — with no
    punctuation between any of it.
    """

    PAGE = (
        "<html><body>Skip to main content National Careers Service Menu "
        "Explore careers Home Explore careers Clinical scientist "
        "Clinical scientist Alternative titles for this job include "
        "Healthcare scientist Clinical scientists research and develop "
        "techniques and equipment to help prevent, diagnose and treat illness. "
        "Average salary (a year) &#xA3;49,000 Starter to &#xA3;65,000 "
        "Experienced Typical hours (a week) 37 to 40 You could work evenings / "
        "weekends and bank holidays</body></html>"
    )

    def parsed(self):
        return parse_public_profile("clinical-scientist", "Clinical scientist",
                                    "https://example.test/x", self.PAGE)

    def test_the_summary_is_the_description_and_nothing_else(self):
        summary = self.parsed().summary
        self.assertTrue(summary.startswith("Clinical scientists research"))
        self.assertNotIn("Alternative titles", summary)
        self.assertNotIn("Skip to main content", summary)
        self.assertNotIn("Healthcare scientist", summary)
        # The title must appear once, as the subject, not twice as a heading.
        self.assertEqual(summary.lower().count("clinical scientist"), 1)

    def test_alternative_titles_are_separated_from_the_description(self):
        self.assertEqual(self.parsed().alternative_titles, ["Healthcare scientist"])

    def test_salary_and_hours_are_read(self):
        profile = self.parsed()
        self.assertEqual(profile.salary_starter, 49000)
        self.assertEqual(profile.salary_experienced, 65000)
        self.assertEqual(profile.hours_min, 37)
        self.assertEqual(profile.hours_max, 40)

    def test_working_patterns_are_read(self):
        patterns = self.parsed().work_patterns
        self.assertIn("evenings and weekends", patterns)
        self.assertIn("bank holidays", patterns)

    def test_an_irregular_plural_still_anchors_the_description(self):
        # Plural first: replacing the singular first would turn "Clinical
        # scientists" into "Midwifes" and the second replace would find nothing.
        page = self.PAGE.replace("Clinical scientists", "Midwives") \
                        .replace("Clinical scientist", "Midwife")
        profile = parse_public_profile("midwife", "Midwife",
                                       "https://example.test/m", page)
        self.assertTrue(profile.summary.startswith("Midwives"),
                        f"summary was {profile.summary!r}")

    def test_a_page_that_says_nothing_useful_yields_no_summary(self):
        """Silence is the correct output, not a plausible sentence."""
        profile = parse_public_profile(
            "x", "Some Job", "https://example.test/y",
            "<html><body>Skip to main content Home Explore careers "
            "Average salary (a year) &#xA3;20,000 Starter to &#xA3;30,000 "
            "Experienced</body></html>")
        self.assertEqual(profile.summary, "")


# ---------------------------------------------------- qualitative working life

class QualitativeWorkLife(unittest.TestCase):

    def test_inferred_values_are_labelled_as_inferred(self):
        result = qualitative_work_life(
            career("CP-003", "Biomedical Scientist"), {})
        self.assertEqual(result["qualitative_source"], "taxonomy_derived")
        self.assertIn("inferred", result["qualitative_note"].lower())

    def test_a_laboratory_career_reads_as_laboratory_work(self):
        result = qualitative_work_life(
            career("CP-003", "Biomedical Scientist",
                   core_tags=["laboratory", "diagnostics"]), {})
        self.assertEqual(result["laboratory_intensity"], "high")


# ------------------------------------------------------------ published data

class PublishedData(unittest.TestCase):
    """§58's completeness assertions, run against the file that ships."""

    def setUp(self):
        self.records = PUBLISHED["records"]
        self.careers = BASE["careers"]

    def test_there_is_exactly_one_record_per_career(self):
        self.assertEqual(len(self.records), len(self.careers))
        self.assertEqual(len(self.records), 677)

    def test_no_duplicate_career_ids(self):
        ids = [r["career_id"] for r in self.records]
        self.assertEqual(len(set(ids)), len(ids))

    def test_every_record_matches_a_real_career(self):
        known = {c["id"] for c in self.careers}
        self.assertEqual({r["career_id"] for r in self.records} - known, set())

    def test_no_career_is_missing_a_record(self):
        covered = {r["career_id"] for r in self.records}
        self.assertEqual({c["id"] for c in self.careers} - covered, set())

    def test_every_salary_is_publishable(self):
        for record in self.records:
            with self.subTest(career=record["career_id"]):
                salary = record["salary"]
                self.assertIsInstance(salary["typical_low"], (int, float))
                self.assertIsInstance(salary["typical_high"], (int, float))
                self.assertGreater(salary["typical_low"], 0)
                self.assertGreaterEqual(salary["typical_high"],
                                        salary["typical_low"])
                self.assertEqual(salary["currency"], "GBP")
                self.assertEqual(salary["period"], "year")
                self.assertTrue(salary["geography"])
                self.assertTrue(salary["last_verified"])

    def test_no_salary_is_published_without_method_and_evidence(self):
        for record in self.records:
            with self.subTest(career=record["career_id"]):
                salary = record["salary"]
                self.assertTrue(salary["estimate_method"])
                self.assertIn(salary["evidence_quality"],
                              {"VERIFIED_GUIDE", "STRONG_ESTIMATE", "INDICATIVE",
                               "LIMITED_DATA"})
                self.assertNotEqual(salary["evidence_quality"], "PENDING")

    def test_no_salary_is_published_without_provenance(self):
        for record in self.records:
            with self.subTest(career=record["career_id"]):
                salary = record["salary"]
                self.assertTrue(
                    salary.get("source_records")
                    or salary.get("methodology_notes"),
                    "a salary was published with neither a source nor notes")

    def test_a_derived_record_names_what_it_was_derived_from(self):
        for record in self.records:
            if record["salary"]["estimate_method"] != "related_career_derived":
                continue
            with self.subTest(career=record["career_id"]):
                self.assertTrue(record["salary"]["derived_from_career_ids"])

    def test_only_a_direct_source_may_claim_to_be_a_career_specific_guide(self):
        for record in self.records:
            if record["salary"]["evidence_quality"] != "VERIFIED_GUIDE":
                continue
            with self.subTest(career=record["career_id"]):
                self.assertTrue(record["salary"]["source_records"],
                                "VERIFIED_GUIDE with no source record")

    def test_a_role_summary_exists_only_where_it_is_attributed(self):
        for record in self.records:
            role = record["role"]
            with self.subTest(career=record["career_id"]):
                if role.get("summary_kind") == "authoritative":
                    self.assertTrue(role.get("summary"))
                    self.assertTrue(role.get("source_records"),
                                    "an authoritative summary with no source")
                else:
                    self.assertIsNone(role.get("summary"))

    def test_no_role_summary_carries_page_furniture(self):
        """The bug this catches shipped once and was visible on 54 pages."""
        for record in self.records:
            summary = record["role"].get("summary")
            if not summary:
                continue
            with self.subTest(career=record["career_id"]):
                for fragment in ("Alternative titles", "Skip to main content",
                                 "National Careers Service", "Explore careers",
                                 "Average salary", "Cookie", "Menu "):
                    self.assertNotIn(fragment, summary)

    def test_no_secret_value_appears_in_the_published_file(self):
        """Look for credential *values*, not the words.

        The audit note "NCS_API_KEY is not set" is a legitimate and useful thing
        for the file to say. Searching for the string "api_key" flags it and
        teaches everyone to ignore the check, which is worse than not having one.
        """
        blob = json.dumps(PUBLISHED)

        # Any key that is actually configured here must not have reached the file.
        for name in ("NCS_API_KEY", "SKILLS_ENGLAND_API_KEY"):
            value = os.environ.get(name, "").strip()
            if len(value) >= 8:
                self.assertNotIn(value, blob, f"{name} reached the published file")

        # And nothing key-shaped, whether or not it is one we hold: a long
        # unbroken hex or base64 run has no business in a salary dataset.
        for pattern in (r"\b[a-f0-9]{32,}\b",
                        r"\b[A-Za-z0-9_-]{40,}\b",
                        r"(?i)ocp-apim-subscription-key",
                        r"(?i)authorization\"\s*:",
                        r"(?i)\bbearer\s+\S+"):
            found = re.search(pattern, blob)
            self.assertIsNone(
                found,
                f"credential-shaped text in the published file: "
                f"{(found.group(0)[:12] + '…') if found else ''}")

    def test_the_attribution_is_present(self):
        self.assertTrue(PUBLISHED.get("attribution"))
        self.assertTrue(any("Open Government Licence" in line
                            for line in PUBLISHED["attribution"]))


# ---------------------------------------------------------------- validation

class Freshness(unittest.TestCase):
    """A record must not look fresher than the evidence behind it.

    The bug these pin down: every date was stamped with the date the script ran,
    including on offline runs that fetch nothing. Re-running the pipeline made
    every record look freshly verified, so `next_review_due` never arrived and the
    stale-data warning could never fire.
    """

    def test_a_sourced_record_is_dated_by_its_source_not_the_run(self):
        salary = {"source_records": [{"retrieved_at": "2020-01-01"}]}
        self.assertEqual(_verified_on(salary), "2020-01-01")

    def test_the_oldest_source_wins_when_there_are_several(self):
        salary = {"source_records": [{"retrieved_at": "2024-06-01"},
                                     {"retrieved_at": "2020-01-01"}]}
        self.assertEqual(_verified_on(salary), "2020-01-01")

    def test_a_derived_record_with_no_source_is_dated_today(self):
        today = dt.date.today().isoformat()
        self.assertEqual(_verified_on({"source_records": []}), today)

    def test_review_is_counted_from_the_evidence_date(self):
        due = _review_due("ncs_career_specific", "2020-01-01")
        self.assertEqual(due, "2020-06-29")          # 2020-01-01 plus 180 days
        self.assertLess(due, dt.date.today().isoformat(),
                        "an old source should already be due for review")

    def test_a_malformed_date_falls_back_rather_than_crashing(self):
        self.assertTrue(_review_due("ncs_career_specific", "not-a-date"))

    def test_published_records_are_dated_by_their_evidence(self):
        for record in PUBLISHED["records"]:
            salary = record["salary"]
            sources = [s.get("retrieved_at") for s in salary["source_records"]
                       if s.get("retrieved_at")]
            if not sources:
                continue
            with self.subTest(career=record["career_id"]):
                self.assertEqual(salary["last_verified"], min(sources),
                                 "a sourced record is dated later than its source")

    def test_no_record_claims_a_retrieval_date_in_the_future(self):
        today = dt.date.today().isoformat()
        for record in PUBLISHED["records"]:
            for source in record["salary"]["source_records"]:
                with self.subTest(career=record["career_id"]):
                    self.assertLessEqual(source.get("retrieved_at", ""), today)

    def test_review_dates_follow_from_verification_dates(self):
        for record in PUBLISHED["records"]:
            salary = record["salary"]
            with self.subTest(career=record["career_id"]):
                self.assertGreater(salary["next_review_due"],
                                   salary["last_verified"],
                                   "a record is due for review before it was "
                                   "verified")


class AliasCandidates(unittest.TestCase):
    """The curation worklist has to warn where the score is misleading."""

    def test_a_dropped_setting_word_is_flagged(self):
        note = _qualifier_note("Clinical Photographer", "Photographer")
        self.assertIn("clinical", note)
        self.assertIn("one occupation", note)

    def test_a_genuine_sub_specialism_is_not_flagged(self):
        # "Biochemistry" is a content word, not a setting word: the score is
        # already below 1.00 and the reviewer needs no extra warning.
        self.assertEqual(
            _qualifier_note("Biochemistry Laboratory Technician",
                            "Laboratory technician"), "")

    def test_an_employer_prefix_is_flagged_too(self):
        self.assertIn("nhs", _qualifier_note("NHS Biomedical Scientist",
                                             "Biomedical scientist"))

    def test_identical_titles_carry_no_warning(self):
        self.assertEqual(_qualifier_note("Biochemist", "Biochemist"), "")

    def test_the_worklist_excludes_seniority_variants(self):
        """Aliasing one would reintroduce, by hand, the bug the matcher prevents."""
        class FakeResolver:
            match_log = [
                {"career_id": "CP-900", "career_title": "Senior Biomedical Scientist",
                 "profile_slug": "biomedical-scientist",
                 "profile_title": "Biomedical scientist",
                 "match_method": "seniority_variant_rejected", "match_score": 1.0},
                {"career_id": "CP-007", "career_title": "Clinical Biochemist",
                 "profile_slug": "biochemist", "profile_title": "Biochemist",
                 "match_method": "review_candidate", "match_score": 1.0},
            ]

        lines = "\n".join(_alias_candidates(
            [{"career_id": "CP-007",
              "salary": {"evidence_quality": "INDICATIVE"}}], FakeResolver()))
        self.assertIn("Clinical Biochemist", lines)
        self.assertNotIn("Senior Biomedical Scientist", lines)

    def test_the_alias_file_is_valid_and_starts_empty(self):
        path = ROOT / "data" / "reference" / "ncs_career_aliases.json"
        self.assertTrue(path.exists(), "the alias file is missing")
        data = json.loads(path.read_text(encoding="utf-8"))
        self.assertIsInstance(data.get("aliases"), dict)
        for key, value in data["aliases"].items():
            with self.subTest(alias=key):
                self.assertEqual(key, normalise(key),
                                 "an alias key is not a normalised title")
                self.assertIsInstance(value, str)
                self.assertTrue(value, "an alias maps to an empty slug")


class Validation(unittest.TestCase):
    """The validator has to fail on data the resolver would never produce.

    Its whole value is being an independent check, so these tests feed it
    deliberately broken records rather than trusting a clean run.
    """

    def published(self, **overrides):
        record = json.loads(json.dumps(PUBLISHED["records"][0]))
        record["salary"].update(overrides.pop("salary", {}))
        record.update(overrides)
        return {**PUBLISHED, "records": [record]}

    def base_for(self, record):
        return {"careers": [c for c in BASE["careers"]
                            if c["id"] == record["records"][0]["career_id"]]}

    def test_a_clean_published_file_passes(self):
        errors, _, _ = validate(PUBLISHED, BASE)
        self.assertEqual(errors, [], f"validation failed: {errors[:3]}")

    def test_an_inverted_range_is_an_error(self):
        data = self.published(salary={"typical_low": 60000,
                                      "typical_high": 40000})
        errors, _, _ = validate(data, self.base_for(data))
        self.assertTrue(errors)

    def test_a_pending_evidence_class_is_an_error(self):
        data = self.published(salary={"evidence_quality": "PENDING"})
        errors, _, _ = validate(data, self.base_for(data))
        self.assertTrue(errors)

    def test_a_missing_method_is_an_error(self):
        data = self.published(salary={"estimate_method": ""})
        errors, _, _ = validate(data, self.base_for(data))
        self.assertTrue(errors)

    def test_a_salary_with_no_provenance_is_an_error(self):
        data = self.published(salary={"source_records": [],
                                      "methodology_notes": []})
        errors, _, _ = validate(data, self.base_for(data))
        self.assertTrue(errors)

    def test_a_missing_career_is_an_error(self):
        errors, _, _ = validate({**PUBLISHED, "records": PUBLISHED["records"][:5]},
                                BASE)
        self.assertTrue(errors)

    def test_a_duplicate_record_is_an_error(self):
        first = PUBLISHED["records"][0]
        data = {**PUBLISHED, "records": [first, json.loads(json.dumps(first))]}
        errors, _, _ = validate(data, self.base_for(data))
        self.assertTrue(errors)

    def test_a_large_change_against_the_previous_file_is_flagged(self):
        previous = json.loads(json.dumps(PUBLISHED))
        for record in previous["records"]:
            record["salary"]["typical_low"] = \
                round(record["salary"]["typical_low"] * 0.5)
            record["salary"]["typical_high"] = \
                round(record["salary"]["typical_high"] * 0.5)
        errors, warnings, _ = validate(PUBLISHED, BASE, previous)
        self.assertEqual(errors, [])
        self.assertTrue(warnings,
                        "a doubling of every salary raised no warning")

    def test_an_unchanged_file_raises_no_change_warnings(self):
        errors, warnings, _ = validate(PUBLISHED, BASE,
                                       json.loads(json.dumps(PUBLISHED)))
        self.assertEqual(errors, [])
        change_warnings = [w for w in warnings if "change" in str(w).lower()]
        self.assertEqual(change_warnings, [])


if __name__ == "__main__":
    unittest.main(verbosity=2)
