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
]

records = []
for offset, (title, family, tags, (status, body), sources) in enumerate(NEW):
    records.append({
        "id": f"CP-{701 + offset}",
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
    })

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
        "Every title here is one the National Careers Service publishes a job "
        "profile for, so each arrives with a career-specific salary range, "
        "typical hours and an attributed description rather than a derived "
        "estimate."),
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
