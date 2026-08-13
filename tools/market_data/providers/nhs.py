"""Public-sector pay framework provider (Tier 2).

Reads a curated mapping only:

    data/reference/nhs_pay_framework_map.json

There is no automatic band inference here, and that is the whole point. A title
containing "Senior" or "Specialist" tells you nothing reliable about an Agenda for
Change band, and guessing one would produce a confident, official-looking, wrong
number. So a band appears only where a person has recorded the mapping and the
evidence for it.

NHS Employers blocks automated requests, so the pay figures in the mapping file are
entered by hand from the official publication with the source URL and date
recorded. Each UK nation is kept separate: England, Scotland, Wales and Northern
Ireland publish their own scales.
"""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent.parent
MAP_FILE = ROOT / "data" / "reference" / "nhs_pay_framework_map.json"


class Provider:
    source_code = "NHS_PAY_FRAMEWORK"
    provider_name = "NHS and public-sector pay frameworks"

    def __init__(self):
        self.mappings = {}
        if MAP_FILE.exists():
            try:
                data = json.loads(MAP_FILE.read_text(encoding="utf-8"))
                self.mappings = data.get("careers", {})
            except json.JSONDecodeError:
                self.mappings = {}

    @property
    def available(self) -> bool:
        return bool(self.mappings)

    def unavailable_reason(self) -> str:
        return ("No curated NHS pay-framework mapping is present at "
                "data/reference/nhs_pay_framework_map.json. Bands are never "
                "inferred from job titles, so no pay-framework evidence was used.")

    def mapping_for(self, career_id: str) -> dict | None:
        entry = self.mappings.get(career_id)
        if not entry:
            return None
        low, high = entry.get("low"), entry.get("high")
        if not (isinstance(low, (int, float)) and isinstance(high, (int, float))):
            return None
        nation = entry.get("nation", "England")
        band = entry.get("band", "")
        return {
            "low": low,
            "high": high,
            "note": (f"Mapped to {band} on the {entry.get('framework', 'NHS pay')} "
                     f"framework for {nation}. This is the pay framework for the "
                     f"role, not a market average, and it applies only to posts on "
                     f"that framework."),
            "context": {"framework": entry.get("framework"), "band": band,
                        "nation": nation, "low": low, "high": high,
                        "effective_from": entry.get("effective_from")},
            "source_record": {
                "provider": entry.get("provider", "NHS Employers"),
                "source_code": "NHS_PAY_FRAMEWORK",
                "source_url": entry.get("source_url", ""),
                "source_date": entry.get("effective_from", ""),
                "retrieved_at": entry.get("recorded_at", ""),
                "license": entry.get("license", "Open Government Licence v3.0"),
                "fields_used": ["salary"],
                "verified_by": entry.get("verified_by", "manual curation"),
            },
        }
