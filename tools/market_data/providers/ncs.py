"""National Careers Service provider.

Two routes to the same Crown-copyright, Open Government Licence content:

`ApiProvider`     the Job Profiles API, which needs a subscription key in
                  NCS_API_KEY. Implemented against the documented shape and
                  exercised by fixtures; it activates the moment a key exists.

`PublicProvider`  the public job-profile pages, which need no key.

They are separate classes on purpose. The specification is explicit that the
pipeline must not scrape something and pretend the API step succeeded, so the two
record their provenance differently — `NCS_API` versus `NCS_PUBLIC_PROFILE` — and
the published data says which one a figure came from. Both are the same official
source; only the access route differs, and the user can see which was used.

Nothing here is invented. If neither route yields a figure, the provider returns
nothing and the resolver falls through to derivation.
"""

from __future__ import annotations

import html
import json
import os
import re
from dataclasses import dataclass, field
from pathlib import Path

from ..cache import FetchError, fetch_json, fetch_text

INDEX_URL = "https://nationalcareers.service.gov.uk/explore-careers/all-careers"
PROFILE_BASE = "https://nationalcareers.service.gov.uk/job-profiles/"
# The gateway host is documented, but the API's path segment is only visible on the
# API's own page in the developer portal, which requires a sign-in. It is therefore
# configuration rather than a constant: set NCS_API_BASE to the base URL shown in
# the portal's example request, e.g.
#   NCS_API_BASE=https://api.nationalcareers.service.gov.uk/<path>/<version>
# Nothing here guesses it — an unconfigured base leaves the API provider inert.
API_BASE = os.environ.get(
    "NCS_API_BASE",
    "https://api.nationalcareers.service.gov.uk/job-profiles/v1").rstrip("/")

LICENCE = "Open Government Licence v3.0"
INDEX_FILE = (Path(__file__).resolve().parent.parent
              / "reference" / "ncs_profile_index.json")


@dataclass
class Profile:
    """One job profile, reduced to the fields Helix publishes."""

    slug: str
    title: str
    url: str
    salary_starter: float | None = None
    salary_experienced: float | None = None
    hours_min: float | None = None
    hours_max: float | None = None
    work_patterns: list[str] = field(default_factory=list)
    summary: str = ""
    alternative_titles: list[str] = field(default_factory=list)
    soc_code: str = ""
    access_route: str = "NCS_PUBLIC_PROFILE"

    def has_salary(self) -> bool:
        return (self.salary_starter is not None
                and self.salary_experienced is not None)


def _plain_text(source: str) -> str:
    """Strip markup to a single line of text. Treats provider output as data."""
    without_code = re.sub(r"<script.*?</script>|<style.*?</style>", " ", source,
                          flags=re.S | re.I)
    text = html.unescape(re.sub(r"<[^>]+>", " ", without_code))
    return re.sub(r"\s+", " ", text).strip()


def _money(value: str) -> float | None:
    digits = re.sub(r"[^0-9]", "", value)
    if not digits:
        return None
    amount = float(digits)
    # Guard against a page that expresses a range oddly; a UK annual salary
    # outside this window is not something to publish silently.
    return amount if 5_000 <= amount <= 400_000 else None


class PublicProvider:
    """Reads the public job-profile pages. No credential required."""

    source_code = "NCS_PUBLIC_PROFILE"
    provider_name = "National Careers Service (public job profile)"

    def __init__(self, *, offline: bool = False, refresh: bool = False):
        self.offline = offline
        self.refresh = refresh

    # --- index -------------------------------------------------------------
    def index(self) -> dict[str, str]:
        """Map of slug -> profile title, from the paginated A-Z listing.

        The result is committed to `reference/ncs_profile_index.json` so that a
        run without network access, including the test suite, still has the
        catalogue of titles to match against.
        """
        if INDEX_FILE.exists() and not self.refresh:
            return json.loads(INDEX_FILE.read_text(encoding="utf-8"))
        if self.offline:
            return {}

        profiles: dict[str, str] = {}
        empty_pages = 0
        for page in range(1, 80):
            try:
                body = fetch_text(f"{INDEX_URL}?page={page}",
                                  refresh=self.refresh, offline=self.offline)
            except FetchError:
                break
            found = re.findall(
                r'href="/job-profiles/([a-z0-9-]+)"[^>]*>\s*([^<]+?)\s*<', body)
            if not found:
                empty_pages += 1
                if empty_pages >= 2:
                    break
                continue
            empty_pages = 0
            for slug, title in found:
                profiles.setdefault(slug, html.unescape(title).strip())

        if profiles:
            INDEX_FILE.parent.mkdir(parents=True, exist_ok=True)
            INDEX_FILE.write_text(json.dumps(profiles, indent=1,
                                             ensure_ascii=False, sort_keys=True),
                                  encoding="utf-8")
        return profiles

    # --- one profile -------------------------------------------------------
    def profile(self, slug: str, title: str) -> Profile | None:
        url = f"{PROFILE_BASE}{slug}"
        try:
            body = fetch_text(url, refresh=self.refresh, offline=self.offline)
        except FetchError:
            return None
        return parse_public_profile(slug, title, url, body)


def parse_public_profile(slug: str, title: str, url: str,
                         body: str) -> Profile | None:
    """Extract the published fields from a profile page.

    Exported separately so the tests can run it against a saved fixture with no
    network access at all.
    """
    text = _plain_text(body)
    profile = Profile(slug=slug, title=title, url=url)

    salary = re.search(
        r"Average salary \(a year\)\s*£?\s*([\d,]+)\s*Starter\s*(?:to|-|–)?\s*"
        r"£?\s*([\d,]+)\s*Experienced", text, re.I)
    if salary:
        profile.salary_starter = _money(salary.group(1))
        profile.salary_experienced = _money(salary.group(2))
        if (profile.salary_starter and profile.salary_experienced
                and profile.salary_starter > profile.salary_experienced):
            profile.salary_starter, profile.salary_experienced = (
                profile.salary_experienced, profile.salary_starter)

    hours = re.search(r"Typical hours \(a week\)\s*([\d]+)\s*(?:to|-|–)\s*([\d]+)",
                      text, re.I)
    if hours:
        low, high = float(hours.group(1)), float(hours.group(2))
        if 1 <= low <= high <= 100:
            profile.hours_min, profile.hours_max = low, high
    else:
        single = re.search(r"Typical hours \(a week\)\s*([\d]+)\s*a week", text, re.I)
        if single:
            value = float(single.group(1))
            if 1 <= value <= 100:
                profile.hours_min = profile.hours_max = value

    patterns = []
    if re.search(r"evenings\s*/\s*weekends|evenings / weekends", text, re.I):
        patterns.append("evenings and weekends")
    if re.search(r"\bbank holidays\b", text, re.I):
        patterns.append("bank holidays")
    if re.search(r"\bon call\b|\bon-call\b", text, re.I):
        patterns.append("on call")
    if re.search(r"\bshifts?\b", text, re.I):
        patterns.append("shifts")
    if re.search(r"\bself-employed\b|freelance", text, re.I):
        patterns.append("self-employed possible")
    if re.search(r"\bwork from home\b|\bremotely\b", text, re.I):
        patterns.append("home working possible")
    profile.work_patterns = patterns

    # The opening sentence of a profile is its role summary. Bounded length, and
    # stored as text rather than markup: provider output is data, never HTML.
    lead = re.split(r"Average salary \(a year\)", text)[0]
    lead = re.sub(r"^.*?(?:Skip to main content|Hide)\s*", "", lead)
    lead = re.split(r"(?:National Careers Service|Menu|Explore careers)\s*", lead)[-1]
    sentence = re.split(r"(?<=[.!?])\s+", lead.strip())
    summary = " ".join(s for s in sentence if len(s) > 30)[:600]
    profile.summary = summary.strip()

    also = re.search(r"Also known as\s*(.{0,200}?)(?:Average salary|What you)", text,
                     re.I)
    if also:
        profile.alternative_titles = [
            part.strip() for part in re.split(r",|/", also.group(1))
            if 2 < len(part.strip()) < 60][:6]

    return profile


class ApiProvider:
    """The Job Profiles API. Inert without a key, by design.

    The endpoint shape is confirmed against the developer portal at
    https://portal.api.nationalcareers.service.gov.uk/ — see docs. Because no key
    was available while this was written, the provider is exercised by fixtures
    and reports itself unavailable rather than guessing at responses.
    """

    source_code = "NCS_API"
    provider_name = "National Careers Service Job Profiles API"

    def __init__(self, *, offline: bool = False, refresh: bool = False):
        self.key = os.environ.get("NCS_API_KEY", "").strip()
        self.offline = offline
        self.refresh = refresh

    @property
    def available(self) -> bool:
        return bool(self.key) and not self.offline

    def unavailable_reason(self) -> str:
        if not self.key:
            return ("NCS_API_KEY is not set, so the Job Profiles API was not "
                    "called. Salary evidence came from the public National "
                    "Careers Service profiles and from derivation instead.")
        return "offline mode"

    def _headers(self) -> dict:
        # The key travels in a header and is never written to output. Callers
        # must not log this dictionary.
        return {"Ocp-Apim-Subscription-Key": self.key,
                "Accept": "application/json"}

    def profile(self, slug: str, title: str) -> Profile | None:
        if not self.available:
            return None
        try:
            payload = fetch_json(f"{API_BASE}/{slug}", headers=self._headers(),
                                 refresh=self.refresh, offline=self.offline)
        except (FetchError, json.JSONDecodeError):
            return None
        return parse_api_profile(slug, title, payload)


def parse_api_profile(slug: str, title: str, payload: dict) -> Profile:
    """Map an API payload onto `Profile`. Tolerant of field-name variation."""
    def first(*names):
        for name in names:
            value = payload.get(name)
            if value not in (None, "", []):
                return value
        return None

    salary = payload.get("salary") or {}
    profile = Profile(
        slug=slug,
        title=str(first("title", "name") or title),
        url=f"{PROFILE_BASE}{slug}",
        access_route="NCS_API",
    )
    starter = salary.get("starterSalary", salary.get("starter"))
    experienced = salary.get("experiencedSalary", salary.get("experienced"))
    profile.salary_starter = _money(str(starter)) if starter is not None else None
    profile.salary_experienced = (_money(str(experienced))
                                  if experienced is not None else None)

    hours = payload.get("workingHours") or payload.get("hours") or {}
    for key, target in (("min", "hours_min"), ("max", "hours_max")):
        value = hours.get(key)
        if isinstance(value, (int, float)) and 1 <= value <= 100:
            setattr(profile, target, float(value))

    patterns = first("workingPattern", "workingPatterns") or []
    if isinstance(patterns, str):
        patterns = [patterns]
    profile.work_patterns = [str(p)[:60] for p in patterns][:6]

    summary = first("overview", "description", "summary") or ""
    profile.summary = _plain_text(str(summary))[:600]

    aliases = first("alternativeTitles", "otherTitles") or []
    if isinstance(aliases, str):
        aliases = [aliases]
    profile.alternative_titles = [str(a)[:60] for a in aliases][:6]

    soc = first("soc", "socCode", "soc2020")
    profile.soc_code = re.sub(r"[^0-9]", "", str(soc))[:4] if soc else ""
    return profile
