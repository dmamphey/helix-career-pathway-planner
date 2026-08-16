"""Labour market providers: is anybody hiring for this kind of work?

The interface
-------------

Every provider answers the same five questions and says how well it can answer
each one. A provider that cannot supply regional demand returns `None` for it —
never an empty list dressed up as an answer, because "no regions" and "we do not
break down by region" are different facts and the interface must be able to say
which.

    Provider.available            -> bool
    Provider.unavailable_reason() -> str
    Provider.demand(category)     -> DemandSignal | None
    Provider.capabilities()       -> dict of what this provider can actually do

The frontend never sees a provider. It reads one normalized static file, so a
provider can be added, swapped or removed without a single change to the
interface — which is the point of the layer.

Why the data is fetched here and not in the browser
---------------------------------------------------

Two reasons, and only one of them is credentials. Any provider worth using either
needs a key (which cannot live in a static site's JavaScript) or rate-limits by
IP, which a browser cannot honour on behalf of every visitor. Fetching in an
enrichment run and publishing the normalized result means the application has no
runtime dependency on anybody's uptime.

What is deliberately not claimed
--------------------------------

The working provider publishes an **index**, not a count. It can say that adverts
in a category are at 118% of their February 2020 level; it cannot say there are
1,240 vacancies, and Helix therefore does not. A number that looks like a vacancy
count is the single most tempting thing to invent here and the easiest to
disprove.
"""

from __future__ import annotations

import json
import time
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field, asdict


API = "https://api.beta.ons.gov.uk/v1"
HEADERS = {
    "User-Agent": "helix-career-pathway/1.0 (enrichment; +https://tools.optymumss.com)",
    "Accept": "application/json",
    "Content-Type": "application/json",
}


@dataclass
class DemandSignal:
    """One provider's answer about one occupation category.

    Every field that a provider cannot supply stays `None`. The interface layer
    turns `None` into "not measured by this source" and an empty list into "this
    source looked and found none" — so the two can never be confused downstream.
    """

    category: str
    category_label: str

    # What this source measured. `index` is relative to the source's own
    # baseline, which `baseline` names in words.
    index: float | None = None
    baseline: str = ""
    vacancy_count: int | None = None

    trend: str = "unknown"          # increasing | stable | decreasing | unknown
    trend_change_percent: float | None = None
    trend_window: str = ""

    signal_strength: str = "insufficient"
    # How old the source release is. Surfaced rather than hidden: a reader
    # deciding on a career move needs to know whether this describes the market
    # now or the market two years ago.
    age_days: int = 0
    stale: bool = False
    history: list = field(default_factory=list)

    top_regions: list | None = None
    top_sectors: list | None = None
    common_skills: list | None = None
    top_employers: list | None = None

    source: str = ""
    source_url: str = ""
    licence: str = ""
    released: str = ""
    retrieved: str = ""
    notes: list = field(default_factory=list)

    def as_dict(self):
        return asdict(self)


class Provider:
    """The contract. Subclasses override; nothing here guesses."""

    provider_name = "unnamed"
    source_code = ""

    @property
    def available(self) -> bool:
        return False

    def unavailable_reason(self) -> str:
        return f"{self.provider_name} is not configured."

    def capabilities(self) -> dict:
        """What this provider can genuinely answer.

        Written down rather than discovered by calling and seeing what comes
        back, so the audit can report the shape of the evidence without a
        network round trip.
        """
        return {
            "vacancy_count": False,
            "index": False,
            "trend": False,
            "regional": False,
            "sector": False,
            "skills": False,
            "employers": False,
        }

    def demand(self, category: str) -> DemandSignal | None:
        raise NotImplementedError


class OnsJobAdvertProvider(Provider):
    """ONS Faster Indicators, online job advert estimates.

    Weekly indices of online job adverts by Adzuna category, published by ONS
    under the Open Government Licence and needing no credential. Experimental
    statistics, and labelled as such wherever they appear.

    Its real limits, all of which the interface states rather than papers over:
    UK-wide only (the dataset publishes one geography), category rather than
    occupation, and an index rather than a count.
    """

    provider_name = "Office for National Statistics, online job advert estimates"
    source_code = "ONS_JOB_ADVERTS"
    dataset_id = "online-job-advert-estimates"
    edition = "feb-2020-index-by-category"
    licence = "Open Government Licence v3.0"
    source_url = ("https://www.ons.gov.uk/economy/economicoutputandproductivity/"
                  "output/datasets/onlinejobadvertestimates")

    def __init__(self, *, offline: bool = False):
        self.offline = offline
        self._version = None
        self._released = ""
        self._base = ""
        self._error = ""

    @property
    def available(self) -> bool:
        """Whether the dataset's current version could be resolved.

        Availability is about reaching the dataset, not about having already
        fetched observations — the series are pulled per category afterwards.
        Conflating the two made this provider report itself unavailable every
        run, because the check ran before anything had been fetched.
        """
        if self.offline:
            return False
        try:
            self._load()
        except (urllib.error.URLError, OSError, KeyError, ValueError) as error:
            self._error = str(error)
            return False
        return bool(self._base)

    def unavailable_reason(self) -> str:
        if self.offline:
            return ("Labour market data was not refreshed because the run was "
                    "offline. Any existing published signal is kept as it was.")
        return (f"The ONS online job advert dataset could not be read "
                f"({self._error or 'the current version could not be resolved'}), "
                f"so no labour market signal was published this run.")

    def capabilities(self) -> dict:
        return {
            # An index, never a count. See the module docstring.
            "vacancy_count": False,
            "index": True,
            "trend": True,
            # The dataset publishes a single geography (United Kingdom).
            "regional": False,
            "sector": True,
            "skills": False,
            "employers": False,
        }

    # ------------------------------------------------------------------ fetch

    def _get(self, url, timeout=90):
        request = urllib.request.Request(url, headers=HEADERS)
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return json.loads(response.read())

    def _load(self):
        if self._base:
            return
        base = f"{API}/datasets/{self.dataset_id}/editions/{self.edition}"
        editions = self._get(base)
        version = editions["links"]["latest_version"]["id"]
        detail = self._get(f"{base}/versions/{version}")
        self._version = version
        self._released = (detail.get("release_date") or "")[:10]

        # The observations endpoint takes a single wildcard, so the week is
        # wildcarded and a whole year's series for one category arrives in one
        # response. The caller iterates categories, which keeps each response
        # small enough to be reliable on a dataset this size.
        self._base = f"{base}/versions/{version}"

    def _series(self, category, year):
        query = urllib.parse.urlencode({
            "time": year,
            "geography": "K02000001",
            "week": "*",
            "adzunajobscategory": category,
        })
        body = self._get(f"{self._base}/observations?{query}")
        points = []
        for item in body.get("observations", []):
            value = item.get("observation")
            week = (item.get("dimensions", {}).get("Week", {}) or {}).get("id", "")
            try:
                number = float(value)
            except (TypeError, ValueError):
                continue
            try:
                index = int(str(week).replace("week-", ""))
            except ValueError:
                continue
            points.append((index, number))
        points.sort()
        return points

    def demand(self, category: str, label: str = "", years=("2024", "2023")):
        self._load()
        series = []
        used_year = ""
        for year in years:
            try:
                series = self._series(category, year)
            except (urllib.error.URLError, OSError, ValueError):
                series = []
            if len(series) >= 8:
                used_year = year
                break
        if len(series) < 8:
            return None

        values = [value for _, value in series]
        latest = mean(values[-4:])
        previous = mean(values[-16:-4]) if len(values) >= 16 else mean(values[:-4])
        change = ((latest / previous) - 1) * 100 if previous else 0.0

        return DemandSignal(
            category=category,
            category_label=label or category,
            index=round(latest, 1),
            baseline="February 2020 = 100",
            # Stated as null rather than omitted: the field exists, and this
            # source genuinely cannot fill it.
            vacancy_count=None,
            trend=classify_trend(change),
            trend_change_percent=round(change, 1),
            trend_window="the last four weeks against the previous twelve",
            signal_strength=strength(len(values), self._released),
            age_days=age_in_days(self._released),
            stale=age_in_days(self._released) > STALE_AFTER_DAYS,
            history=[round(value, 1) for _, value in series[-26:]],
            top_regions=None,
            top_sectors=None,
            common_skills=None,
            top_employers=None,
            source=self.provider_name,
            source_url=self.source_url,
            licence=self.licence,
            released=self._released,
            retrieved=time.strftime("%Y-%m-%d"),
            notes=[
                f"Weekly index of online job adverts, {used_year}. "
                "February 2020 = 100.",
                "ONS publishes these as experimental statistics.",
                "This is an index of advert volume, not a count of vacancies, "
                "and Helix does not convert it into one.",
                "Published for the United Kingdom as a whole. This source does "
                "not break demand down by region.",
            ] + ([
                f"ONS last released this series on {self._released}. It "
                "describes the period it covers, not the market today, and its "
                "signal strength is capped accordingly."
            ] if age_in_days(self._released) > STALE_AFTER_DAYS else []),
        )


class CredentialedProvider(Provider):
    """A provider that would work if somebody supplied a key.

    Present so that the shape of the integration is settled and reviewable
    before any credential exists, and so the audit can say precisely what is
    missing rather than "labour market data unavailable".

    It never returns fabricated data. `available` is False until a key is
    configured, and `unavailable_reason` names the key and where to get it.
    """

    def __init__(self, provider_name, source_code, *, env_var, signup_url,
                 capabilities=None, api_key=None):
        self.provider_name = provider_name
        self.source_code = source_code
        self.env_var = env_var
        self.signup_url = signup_url
        self.api_key = api_key
        self._capabilities = capabilities or {}

    @property
    def available(self) -> bool:
        return bool(self.api_key)

    def unavailable_reason(self) -> str:
        return (f"{self.provider_name} needs an API credential in {self.env_var}. "
                f"No key is configured, so nothing from this provider is "
                f"published. Register at {self.signup_url}.")

    def capabilities(self) -> dict:
        return {**super().capabilities(), **self._capabilities}

    def demand(self, category: str) -> DemandSignal | None:
        # Deliberately unimplemented. A stub that returned plausible numbers
        # would be indistinguishable from a working integration in the published
        # file, which is exactly the failure this whole module is shaped to
        # prevent.
        return None


def known_providers(api_keys=None):
    """Every provider Helix knows about, working or not.

    The unavailable ones are returned too, so the audit and the methodology can
    list what would improve coverage and what it would cost.
    """
    keys = api_keys or {}
    return [
        OnsJobAdvertProvider(),
        CredentialedProvider(
            "Adzuna job search API", "ADZUNA",
            env_var="ADZUNA_APP_KEY",
            signup_url="https://developer.adzuna.com/",
            api_key=keys.get("ADZUNA_APP_KEY"),
            capabilities={"vacancy_count": True, "regional": True,
                          "sector": True, "trend": True}),
        CredentialedProvider(
            "DWP Find a Job", "DWP_FIND_A_JOB",
            env_var="DWP_FIND_A_JOB_KEY",
            signup_url="https://findajob.dwp.gov.uk/apidocs",
            api_key=keys.get("DWP_FIND_A_JOB_KEY"),
            capabilities={"vacancy_count": True, "regional": True,
                          "employers": True}),
    ]


# ---------------------------------------------------------------- small helpers

def mean(values):
    return sum(values) / len(values) if values else 0.0


def classify_trend(change_percent):
    """Three words, with a dead band.

    A 1% move in a weekly advert index is noise, and calling it "increasing"
    would produce a trend that flips every month.
    """
    if change_percent >= 5:
        return "increasing"
    if change_percent <= -5:
        return "decreasing"
    return "stable"


#: Beyond this, a labour market signal describes a market that has moved on.
STALE_AFTER_DAYS = 550


def age_in_days(released):
    """How old the source release is, in days. Zero when the date is unusable."""
    if not released:
        return 0
    try:
        published = time.strptime(released[:10], "%Y-%m-%d")
    except ValueError:
        return 0
    return max(0, int((time.time() - time.mktime(published)) / 86400))


def strength(observation_count, released=""):
    """How much to trust the signal.

    Two things decide it, and age can only ever lower the answer. A long, dense
    weekly series is a strong measurement *of the period it covers*; if that
    period ended eighteen months ago it is weak evidence about hiring today, and
    reporting it as "strong signal" would be true about the statistics and
    misleading about the job market — which is the only thing the reader cares
    about.
    """
    if observation_count >= 40:
        level = "strong"
    elif observation_count >= 20:
        level = "moderate"
    elif observation_count >= 8:
        level = "limited"
    else:
        return "insufficient"

    if age_in_days(released) > STALE_AFTER_DAYS:
        return "limited"
    return level
