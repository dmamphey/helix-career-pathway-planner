"""ONS occupation earnings provider (Tier 3).

ASHE earnings are published as spreadsheet tables rather than through the beta
API's dataset endpoints, so this provider reads a curated, checked-in extract:

    data/reference/ons_ashe_soc_earnings.json

That file is produced by a person from the official ASHE release and reviewed —
which is the right shape for this data. An automatic scrape of a spreadsheet whose
layout changes yearly would be the kind of silent breakage that publishes wrong
salaries, and a wrong salary is worse than an honestly derived one.

When the extract is absent the provider reports itself unavailable and the
resolver falls through to derivation. It never guesses an occupation figure.

`available_datasets()` calls the open ONS beta API, which needs no key. It is used
to record the current release context in the audit, not to invent numbers.
"""

from __future__ import annotations

import json
import re
from pathlib import Path

from ..cache import FetchError, fetch_json

ROOT = Path(__file__).resolve().parent.parent.parent.parent
EARNINGS_FILE = ROOT / "data" / "reference" / "ons_ashe_soc_earnings.json"
SOC_MAP_FILE = ROOT / "data" / "reference" / "soc_map.json"

API_BASE = "https://api.beta.ons.gov.uk/v1"
ASHE_TABLE_URL = ("https://www.ons.gov.uk/employmentandlabourmarket/peopleinwork/"
                  "earningsandworkinghours/datasets/"
                  "occupation2digitsocashetable2")
LICENCE = "Open Government Licence v3.0"


class Provider:
    source_code = "ONS_API"
    provider_name = "Office for National Statistics, ASHE"

    def __init__(self, *, offline: bool = False, refresh: bool = False):
        self.offline = offline
        self.refresh = refresh
        self.earnings = self._load(EARNINGS_FILE, "earnings")
        self.soc_map = self._load(SOC_MAP_FILE, "careers")

    @staticmethod
    def _load(path: Path, key: str) -> dict:
        if not path.exists():
            return {}
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
        except json.JSONDecodeError:
            return {}
        return data.get(key, data) if isinstance(data, dict) else {}

    @property
    def available(self) -> bool:
        return bool(self.earnings)

    def unavailable_reason(self) -> str:
        return ("No curated ONS ASHE extract is present at "
                "data/reference/ons_ashe_soc_earnings.json, so no occupation-level "
                "earnings evidence was used. Add the extract to upgrade derived "
                "estimates to occupation estimates.")

    def earnings_for(self, career: dict) -> dict | None:
        """An occupation estimate for one career, or None."""
        if not self.available:
            return None
        entry = self.soc_map.get(career["id"])
        if not entry or not entry.get("soc2020_code"):
            return None
        code = re.sub(r"[^0-9]", "", str(entry["soc2020_code"]))
        row = self.earnings.get(code) or self.earnings.get(code[:2])
        if not row:
            return None

        low = row.get("percentile_10") or row.get("low")
        high = row.get("percentile_90") or row.get("high")
        if not (isinstance(low, (int, float)) and isinstance(high, (int, float))):
            return None

        # Granularity drives the evidence class: a four-digit mapping is a real
        # occupation estimate, a two-digit one is a broad group.
        detailed = len(code) >= 4 and code in self.earnings
        confidence = float(entry.get("confidence", 0.6))
        quality = ("STRONG_ESTIMATE" if detailed and confidence >= 0.7
                   else "INDICATIVE")
        scope = ("SOC 2020 four-digit occupation"
                 if detailed else "broader two-digit occupation group")

        return {
            "low": low, "high": high,
            "evidence_quality": quality,
            "confidence": confidence,
            "soc_code": code,
            "soc_title": row.get("title") or entry.get("soc2020_title"),
            "match_method": entry.get("mapping_source", "curated_soc_mapping"),
            "review_status": entry.get("review_status", "human_verified"),
            "note": (f"Earnings estimate for the {scope} this career maps to "
                     f"({code}{': ' + row['title'] if row.get('title') else ''}), "
                     f"from ONS ASHE. Not specific to this job title."),
            "source_record": {
                "provider": "Office for National Statistics",
                "source_code": "ONS_ASHE",
                "source_url": row.get("source_url", ASHE_TABLE_URL),
                "source_date": row.get("release", ""),
                "retrieved_at": row.get("retrieved_at", ""),
                "license": LICENCE,
                "fields_used": ["earnings"],
                "soc2020_code": code,
            },
        }

    def available_datasets(self) -> list[str]:
        """Release context for the audit report. Open API, no key required."""
        if self.offline:
            return []
        try:
            payload = fetch_json(f"{API_BASE}/datasets?limit=100",
                                 refresh=self.refresh, offline=self.offline)
        except (FetchError, json.JSONDecodeError):
            return []
        return [item.get("id", "") for item in payload.get("items", [])]
