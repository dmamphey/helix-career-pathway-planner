"""Regional and sector salary context.

Helix has no verified career-to-SOC mapping, so it cannot publish an ONS
occupation earnings figure as a career's headline range. What it can do honestly
is say **how pay for that kind of work varies across the UK**, which is a
different and much better-supported claim.

The method, in one paragraph
----------------------------

ONS ASHE Table 3 publishes median gross annual pay for full-time employees by
region for each two-digit SOC group. Dividing a region's median by the UK median
for the same group gives a **regional index** — 1.133 for health professionals in
London, meaning health professionals in London earn about 13% more than health
professionals nationally. Helix applies that index to the career's own UK range.
The level comes from the career's own evidence; only the regional shape comes
from ONS.

Why the coarse mapping is acceptable here
-----------------------------------------

A ratio is far more forgiving of an approximate occupation match than a level is.
The whole-economy London index is 1.269 while the health professional index is
1.133 — so choosing the right *broad group* matters a great deal, and choosing the
exact unit group inside it barely moves the answer. That is the opposite of the
situation for salary levels, where a wrong unit group produces a wrong number, and
it is why Helix will do this and will not publish SOC earnings as a headline.

What is never done
------------------

No regional figure is invented where ONS suppressed the underlying value; no
city-level figure is produced from a regional one; and a derived regional range
is never presented at the evidence class of the UK range it came from.
"""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
REGIONAL_FILE = ROOT / "data" / "reference" / "ons_ashe_regional_earnings.json"
SECTOR_FILE = ROOT / "data" / "reference" / "ons_ashe_sector_earnings.json"
FAMILY_MAP_FILE = ROOT / "data" / "reference" / "helix_family_soc_map.json"

# Derived regional figures are rounded to the nearest £500. The arithmetic is an
# index multiplication, and its last two digits mean nothing.
REGIONAL_PRECISION = 500

# A derived regional range can never be better evidenced than "indicative": no
# source published a regional range for this job. It can be worse, when the UK
# range it was derived from was itself a family median.
EVIDENCE_FLOOR = "INDICATIVE"
EVIDENCE_RANK = {
    "VERIFIED_GUIDE": 0,
    "STRONG_ESTIMATE": 1,
    "INDICATIVE": 2,
    "LIMITED_DATA": 3,
}


def _load(path):
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


class RegionalContext:
    """The ONS regional index table, and the rules for choosing a row of it."""

    def __init__(self):
        self.regional = _load(REGIONAL_FILE)
        self.sector = _load(SECTOR_FILE)
        self.family_map = _load(FAMILY_MAP_FILE)

    @property
    def available(self) -> bool:
        return bool(self.regional.get("medians") and self.family_map.get("families"))

    # ------------------------------------------------------------ soc group

    def soc_group(self, career, seniority_class):
        """Which ONS occupation group's regional pattern applies to this career.

        Returns `(group, reason)`, or `(None, reason)` when the family is not
        mapped — in which case no regional figure is produced at all.
        """
        families = self.family_map.get("families", {})
        entry = families.get(career.get("family"))
        if not entry:
            return None, f"no occupation group is mapped for {career.get('family')!r}"

        base = entry["group"]
        rules = self.family_map.get("seniority_rules", {})
        behaviour = rules.get(seniority_class, "base")

        if behaviour == "management":
            group = rules.get("management_group", "11")
            reason = (f"{career['family']} at a {seniority_class} grade is treated as "
                      f"a management occupation")
        elif behaviour == "associate":
            group = self.family_map.get("professional_to_associate", {}).get(base, base)
            reason = (f"{career['family']} at a {seniority_class} grade is treated as "
                      f"an associate professional occupation")
        else:
            group = base
            reason = entry["reason"]

        if group not in self.regional.get("medians", {}):
            return None, f"ONS publishes no regional medians for group {group}"
        return group, reason

    # --------------------------------------------------------------- index

    def index_table(self):
        """Every region's index, per occupation group, ready to publish.

        Published once in the dataset rather than multiplied out across 716
        careers and 13 regions: the browser applies the index, so a user can
        switch region without the file carrying 9,000 pre-computed ranges.
        """
        if not self.available:
            return None
        out = {}
        for group, medians in self.regional["medians"].items():
            uk = medians.get("uk")
            if not uk:
                continue
            indices = {}
            for region, value in medians.items():
                if region == "uk" or not value:
                    continue
                indices[region] = round(value / uk, 4)
            if indices:
                out[group] = {
                    "uk_median": uk,
                    "regions": indices,
                    # Regions ONS suppressed for this group are simply absent,
                    # and the interface says so rather than showing a UK figure
                    # under a regional heading.
                    "missing_regions": sorted(
                        set(self.regional.get("regions", {}).values())
                        - {"uk"} - set(indices)),
                }
        return {
            "source": self.regional.get("source", ""),
            "source_url": self.regional.get("source_url", ""),
            "licence": self.regional.get("licence", ""),
            "attribution": self.regional.get("attribution", ""),
            "year": self.regional.get("year", ""),
            "released": self.regional.get("released", ""),
            "retrieved": self.regional.get("retrieved", ""),
            "measure": self.regional.get("measure", ""),
            "precision": REGIONAL_PRECISION,
            "evidence_floor": EVIDENCE_FLOOR,
            "method": "A region's median gross annual pay for this occupation "
                      "group, divided by the UK median for the same group, "
                      "applied to the career's own UK range.",
            "groups": out,
            "group_labels": self.family_map.get("groups", {}),
        }

    # -------------------------------------------------------------- sector

    def sector_context(self):
        """Whole-economy public and private medians, as context only.

        ASHE Table 25 splits by sector and region but not by occupation, so this
        cannot say what a biomedical scientist earns in the private sector. It is
        published as an economy-wide comparison, labelled as one, and is never
        attached to a career as that career's sector pay.
        """
        medians = self.sector.get("medians") or {}
        if not medians:
            return None
        return {
            "source": self.sector.get("source", ""),
            "source_url": self.sector.get("source_url", ""),
            "licence": self.sector.get("licence", ""),
            "attribution": self.sector.get("attribution", ""),
            "year": self.sector.get("year", ""),
            "released": self.sector.get("released", ""),
            "measure": self.sector.get("measure", ""),
            "scope": "whole_economy",
            "note": self.sector.get("note", ""),
            "medians": medians,
        }


def evidence_for_regional(base_evidence):
    """The evidence class a derived regional range may carry."""
    rank = EVIDENCE_RANK.get(base_evidence, EVIDENCE_RANK["LIMITED_DATA"])
    floor = EVIDENCE_RANK[EVIDENCE_FLOOR]
    return base_evidence if rank > floor else EVIDENCE_FLOOR
