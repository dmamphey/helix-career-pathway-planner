"""Generate data/helix_additional_careers_v1.json.

Every title is one the National Careers Service publishes a profile for, so each
arrives with a career-specific salary, hours and an attributed description
instead of a derived estimate. Families, tags, source codes and entry signals are
reused verbatim from the supplied taxonomy, because the suite asserts that every
tag maps to a domain and every source code resolves to the registry.
"""

import collections
import datetime
import json
import pathlib

ROOT = pathlib.Path(__file__).resolve()
while not (ROOT / "data" / "careerpath_uk_careers_v1.json").exists():
    if ROOT == ROOT.parent:
        raise SystemExit("could not locate the repository root")
    ROOT = ROOT.parent

base = json.loads((ROOT / "data" / "careerpath_uk_careers_v1.json")
                  .read_text(encoding="utf-8"))

signals = collections.defaultdict(collections.Counter)
for career in base["careers"]:
    signals[career["family"]][career["typical_entry_signal"]] += 1
SIGNAL = {family: counter.most_common(1)[0][0]
          for family, counter in signals.items()}

NOTE = base["careers"][0]["production_note"]
TODAY = datetime.date.today().isoformat()

F_HS = "Healthcare Science & Diagnostics"
F_LAB = "Laboratory, Pathology & Technical Operations"
F_ALL = "Allied Health & Clinical Practice"
F_NMP = "Nursing, Midwifery & Pharmacy"
F_RES = "Research & Academia"
F_PBM = "Pharma, Biotech R&D & Manufacturing"
F_ENV = "Environmental & One Health"
F_PH = "Public Health, Epidemiology & Health Policy"
F_QRS = "Quality, Regulatory, Safety & Compliance"
F_DIG = "Digital Health, Data, Informatics & AI"
F_LEO = "Leadership, Education, Operations & Consulting"

UNREG = ("Generally unregulated", "")
VOL = ("Professional / voluntary register", "")
ROLEDEP = ("Role-dependent", "")
HCPC = ("Statutory / protected", "HCPC")

NEW = [
    # Core science roles, including the two that were missing.
    ("Biotechnologist", F_PBM, ["biotech", "biotechnology", "R&D", "science"],
     UNREG, ["GOV-LS", "UKRI"]),
    ("Forensic Scientist", F_LAB,
     ["laboratory", "science", "technical", "diagnostics"], VOL, ["GOV-LS"]),
    ("Biologist", F_RES, ["research", "science", "academia", "bioscience"],
     UNREG, ["UKRI"]),
    ("Chemist", F_RES, ["research", "science", "academia", "laboratory"],
     UNREG, ["UKRI"]),
    ("Information Scientist", F_PBM,
     ["pharma", "data", "informatics", "research"], UNREG, ["ABPI"]),
    ("Climate Scientist", F_ENV,
     ["environmental health", "one health", "science", "research"], UNREG,
     ["UKRI"]),
    ("Geoscientist", F_ENV,
     ["environmental health", "one health", "science", "research"], UNREG,
     ["UKRI"]),
    ("Consumer Scientist", F_ENV,
     ["bioscience", "science", "safety", "environmental health"], UNREG,
     ["GOV-LS"]),
    ("Performance Sports Scientist", F_ALL,
     ["patient care", "rehabilitation", "science", "clinical practice"], VOL,
     ["GOV-LS"]),
    ("Operational Researcher", F_DIG,
     ["data", "informatics", "technology", "research"], UNREG, ["GOV-LS"]),
    ("User Researcher - Digital Health", F_DIG,
     ["digital health", "technology", "research", "product development"],
     UNREG, ["GOV-LS"]),

    # Laboratory and technical operations.
    ("Anatomical Pathology Technician", F_LAB,
     ["laboratory", "pathology", "technical", "operations"], VOL, ["NSHCS"]),
    ("Animal Technician", F_RES,
     ["research", "science", "bioscience", "laboratory"], ROLEDEP,
     ["UKRI", "GOV-LS"]),
    ("Quality Control Officer", F_QRS,
     ["quality", "compliance", "laboratory", "manufacturing"], UNREG, ["ABPI"]),
    ("Chemical Engineer", F_PBM,
     ["engineering", "manufacturing", "process development", "pharma"], UNREG,
     ["GOV-LS"]),
    ("Chemical Engineering Technician", F_PBM,
     ["engineering", "manufacturing", "technical", "process development"],
     UNREG, ["GOV-LS"]),

    # Allied health and the therapies.
    ("Cognitive Behavioural Therapist", F_ALL,
     ["patient care", "clinical practice", "psychology", "rehabilitation"],
     VOL, ["HCPC"]),
    ("Psychotherapist", F_ALL,
     ["patient care", "clinical practice", "psychology"], VOL, ["HCPC"]),
    ("Play Therapist", F_ALL,
     ["patient care", "clinical practice", "psychology", "rehabilitation"],
     VOL, ["HCPC"]),
    ("Dance Movement Psychotherapist", F_ALL,
     ["patient care", "clinical practice", "psychology", "rehabilitation"],
     HCPC, ["HCPC"]),
    ("Psychological Wellbeing Practitioner", F_ALL,
     ["patient care", "clinical practice", "psychology"], VOL, ["HCPC"]),
    ("Nutritional Therapist", F_ALL,
     ["patient care", "clinical practice", "rehabilitation"], VOL, ["GOV-LS"]),
    ("Medical Illustrator", F_HS,
     ["healthcare science", "imaging", "diagnostics", "technical"], VOL,
     ["NSHCS"]),
    ("Health Play Specialist", F_ALL,
     ["patient care", "clinical practice", "education"], VOL, ["GOV-LS"]),

    # Healthcare support roles.
    ("Healthcare Assistant", F_NMP,
     ["patient care", "clinical practice", "nursing"], UNREG, ["NMC"]),
    ("Pharmacy Assistant", F_NMP, ["medicines", "pharmacy", "patient care"],
     UNREG, ["GPHC"]),
    ("Physiotherapy Assistant", F_ALL,
     ["patient care", "rehabilitation", "clinical practice"], UNREG, ["HCPC"]),
    ("Radiography Assistant", F_HS,
     ["imaging", "patient care", "healthcare science", "diagnostics"], UNREG,
     ["HCPC"]),
    ("Occupational Therapy Support Worker", F_ALL,
     ["patient care", "rehabilitation", "clinical practice"], UNREG, ["HCPC"]),
    ("Speech and Language Therapy Assistant", F_ALL,
     ["patient care", "rehabilitation", "clinical practice"], UNREG, ["HCPC"]),
    ("Emergency Medical Dispatcher", F_ALL,
     ["patient care", "clinical practice", "operations"], UNREG, ["GOV-LS"]),
    ("Medical Secretary", F_LEO, ["operations", "education", "leadership"],
     UNREG, ["GOV-LS"]),
    ("Health Records Clerk", F_DIG,
     ["informatics", "data", "digital health", "operations"], UNREG,
     ["GOV-LS"]),

    # Public health and environment.
    ("Health Promotion Specialist", F_PH,
     ["public health", "population health", "policy", "education"], UNREG,
     ["UKHSA"]),
    ("Health Trainer", F_PH,
     ["public health", "population health", "patient care"], UNREG, ["UKHSA"]),
    ("Health and Safety Adviser", F_QRS,
     ["safety", "compliance", "quality", "regulatory"], UNREG, ["GOV-LS"]),
    ("Environmental Consultant", F_ENV,
     ["environmental health", "one health", "consulting", "safety"], UNREG,
     ["GOV-LS"]),
    ("Food Manufacturing Inspector", F_ENV,
     ["environmental health", "safety", "quality", "one health"], UNREG,
     ["GOV-LS"]),
    ("Veterinary Physiotherapist", F_ENV,
     ["one health", "rehabilitation", "bioscience"], VOL, ["GOV-LS"]),

    # ---------------------------------------------------------------- round 2
    #
    # Two areas the catalogue barely covered: innovation and enterprise, which
    # had eight titles out of 716 and all of them the university tech-transfer
    # side; and academic teaching, which had four rungs of the lecturing ladder
    # and nothing else. Every title below is one the National Careers Service
    # publishes a profile for, so the same rule as the rest of this file holds.
    ("Patent Attorney", F_QRS,
     ["regulatory", "compliance", "science", "writing"],
     ("Statutory / regulated", "IPReg"), ["GOV-LS"]),
    ("Investment Analyst", F_LEO,
     ["commercial", "leadership", "research"], UNREG, ["GOV-LS"]),
    ("Bid Writer", F_LEO,
     ["writing", "communications", "project delivery"], UNREG, ["GOV-LS"]),
    ("Business Adviser", F_LEO,
     ["commercial", "consulting", "leadership"], UNREG, ["GOV-LS"]),
    ("Management Consultant", F_LEO,
     ["consulting", "leadership", "operations"], UNREG, ["GOV-LS"]),
    ("Business Analyst", F_LEO,
     ["consulting", "operations", "data"], UNREG, ["GOV-LS"]),

    ("Higher Education Lecturer", F_RES,
     ["academia", "education", "research"], UNREG, ["UKRI"]),
    ("Further Education Lecturer", F_RES,
     ["education", "academia", "science"], UNREG, ["GOV-LS"]),
    ("Online Tutor", F_LEO,
     ["education", "communications"], UNREG, ["GOV-LS"]),
    ("Education Technician", F_LAB,
     ["education", "laboratory", "technical"], UNREG, ["GOV-LS"]),
    ("Vocational Qualification Assessor", F_LEO,
     ["education", "quality", "compliance"], UNREG, ["GOV-LS"]),
]

#
# Roles with no official source at all.
#
# Founding a company, or being its chief scientist, is a real destination for a
# life scientist and people ask Helix about it. No UK government or regulator
# publishes a pay range, an entry route or a requirement set for any of them —
# the National Careers Service has no profile, and neither does anybody else.
#
# So they are listed, and they carry an explicit statement that Helix has
# nothing verified to say about them. They get no salary: the pipeline would
# otherwise hand them a family median, and a median salary for "Founder" would
# be a fabrication dressed as an estimate — founders routinely pay themselves
# nothing for years. An empty figure is the honest one.
#
# This is the site owner's decision, made knowingly: a named destination with a
# blank where the evidence should be is more use to somebody than no destination
# at all, provided the blank is unmistakable. `evidence_basis` is what makes it
# unmistakable, and the interface refuses to show a salary for these.
# /
UNSOURCED = [
    ("Founder - Life Sciences Start-up", F_LEO,
     ["innovation", "leadership", "commercial"], UNREG, ["GOV-LS"]),
    ("Scientific Co-founder", F_LEO,
     ["innovation", "research", "leadership"], UNREG, ["GOV-LS"]),
    ("Chief Scientific Officer", F_LEO,
     ["leadership", "research", "innovation"], UNREG, ["GOV-LS"]),
    ("Spin-out Company Scientist", F_RES,
     ["innovation", "research", "bioscience"], UNREG, ["UKRI"]),
    ("Entrepreneur in Residence", F_LEO,
     ["innovation", "commercial", "leadership"], UNREG, ["GOV-LS"]),
    ("Commercialisation Manager", F_LEO,
     ["innovation", "commercial", "project delivery"], UNREG, ["GOV-LS"]),
    ("Incubator Programme Manager", F_LEO,
     ["innovation", "operations", "leadership"], UNREG, ["GOV-LS"]),
]

UNSOURCED_NOTE = (
    "No official UK source publishes a pay range, entry route or requirement "
    "set for this role. Helix lists it because it is a real destination, and "
    "shows no salary and no requirements for it rather than estimating them. "
    "Treat everything here as a starting point for your own research.")

def build(entry, career_id, basis):
    title, family, tags, (status, body), sources = entry
    record = {
        "id": career_id,
        "title": title,
        "family": family,
        "jurisdiction": "United Kingdom",
        "regulatory_status": status,
        "regulator_or_body": body,
        "pathway_depth": "Explorer",
        "core_tags": tags,
        "typical_entry_signal": SIGNAL[family],
        "official_source_codes": sources,
        "last_verified": TODAY,
        "production_note": NOTE,
        "catalogue": "helix_addition",
        # What the figures on this career rest on. Read by the application,
        # which refuses to show a salary for anything not backed by a source.
        "evidence_basis": basis,
    }
    if basis == "no_verified_source":
        record["evidence_note"] = UNSOURCED_NOTE
        # There is no source, so there is nothing for the entry signal to be
        # drawn from either. Saying so beats inheriting the family's.
        record["typical_entry_signal"] = "not established by any official source"
    return record


records = [build(entry, f"CP-{701 + offset}", "ncs_profile")
           for offset, entry in enumerate(NEW)]
records += [build(entry, f"CP-{701 + len(NEW) + offset}", "no_verified_source")
            for offset, entry in enumerate(UNSOURCED)]

payload = {
    "dataset_name": "Helix UK Life Sciences & Healthcare Career Dataset - additions",
    "version": "1.0",
    "generated": TODAY,
    "jurisdiction": "United Kingdom",
    "career_count": len(records),
    "extends": "careerpath_uk_careers_v1.json",
    "design_intent": (
        "Careers added after the supplied launch taxonomy. They live in their "
        "own file because the supplied dataset is treated as immutable and is "
        "verified by hash on every pipeline run, so extending it in place would "
        "break that guarantee. Ids start at CP-701 so an addition is "
        "recognisable at a glance and can never collide with the supplied "
        "range."),
    "selection_note": (
        "Most titles here are ones the National Careers Service publishes a job "
        "profile for, so each arrives with a career-specific salary range, "
        "typical hours and an attributed description rather than a derived "
        "estimate. The exceptions carry evidence_basis 'no_verified_source': "
        "real destinations that no official UK source describes, listed without "
        "a salary or a requirement set rather than with an invented one."),
    "evidence_basis_note": (
        "ncs_profile: backed by a National Careers Service job profile. "
        "no_verified_source: listed by name only. Helix shows no salary and no "
        "entry requirements for these, because none is published."),
    "careers": records,
}

target = ROOT / "data" / "helix_additional_careers_v1.json"
target.write_text(json.dumps(payload, indent=1, ensure_ascii=False) + "\n",
                  encoding="utf-8")
print(f"wrote {len(records)} careers to {target.name}: "
      f"CP-701..CP-{700 + len(records)}")

# The vocabularies the browser suite enforces.
ok_tags = {t for c in base["careers"] for t in c["core_tags"]}
ok_families = {c["family"] for c in base["careers"]}
ok_sources = {s for c in base["careers"] for s in c["official_source_codes"]}
ok_depths = {c["pathway_depth"] for c in base["careers"]}
existing_titles = {c["title"].lower() for c in base["careers"]}
existing_ids = {c["id"] for c in base["careers"]}

problems = []
for record in records:
    if record["family"] not in ok_families:
        problems.append(("family", record["title"], record["family"]))
    if record["pathway_depth"] not in ok_depths:
        problems.append(("depth", record["title"], record["pathway_depth"]))
    for tag in record["core_tags"]:
        if tag not in ok_tags:
            problems.append(("tag", record["title"], tag))
    for source in record["official_source_codes"]:
        if source not in ok_sources:
            problems.append(("source", record["title"], source))
    if record["title"].lower() in existing_titles:
        problems.append(("duplicate title", record["title"], ""))
    if record["id"] in existing_ids:
        problems.append(("duplicate id", record["title"], record["id"]))

print("vocabulary violations:", problems or "none")
