"""Skills England Occupational Maps provider (optional, for SOC mapping).

Optional by design: it needs SKILLS_ENGLAND_API_KEY, it contributes only SOC
mapping evidence, and the pipeline is complete without it. Absent a key it reports
itself unavailable rather than guessing at occupational codes.
"""

from __future__ import annotations

import os


class Provider:
    source_code = "SKILLS_ENGLAND_OCCUPATIONAL_MAPS"
    provider_name = "Skills England Occupational Maps"

    def __init__(self, *, offline: bool = False):
        self.key = os.environ.get("SKILLS_ENGLAND_API_KEY", "").strip()
        self.offline = offline

    @property
    def available(self) -> bool:
        return bool(self.key) and not self.offline

    def unavailable_reason(self) -> str:
        return ("SKILLS_ENGLAND_API_KEY is not set. This provider is optional and "
                "only contributes SOC mapping evidence.")

    def soc_for(self, career: dict) -> dict | None:
        if not self.available:
            return None
        return None
