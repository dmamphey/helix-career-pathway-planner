"""NHS Health Careers — links only, never content.

NHS England publishes role profiles at healthcareers.nhs.uk covering a large
part of the clinical workforce, and they are a better fit for this catalogue
than anything else available. Helix does not republish a word of them.

That is a licensing decision, not a technical one. Unlike the National Careers
Service, which is Crown copyright under the Open Government Licence and may be
reproduced with attribution, the Health Careers terms reserve everything:

    "We are the owner or the licensee of all intellectual property rights in
     this site, and in the material published on it. ... All such rights are
     reserved."

    "This site is maintained for your personal use and viewing."

    "You must not modify the paper or digital copies of any content that you
     have printed off or downloaded in any way, and you must not use ... any
     accompanying text for any purpose, other than as expressly set out in this
     clause."

The same terms explicitly permit linking:

    "We do not normally object to you linking directly to the information that
     is hosted on this site, provided you do so in a way that is fair and legal
     and does not damage our reputation or take advantage of it."

So this module produces a URL and nothing else. It is built so that copying is
not merely discouraged but impossible: it reads only `sitemap.xml`, never
fetches a role page, and has no parser for one. Adding description extraction
here would take deliberate effort and a new fetch, which is the point.

Their terms also forbid framing, so every link this produces must open in the
user's full window — see `career.js`, which sets `target="_blank"`.
"""

from __future__ import annotations

import re

from ..cache import FetchError, fetch_text
from ..title_matcher import normalise

SITEMAP = "https://www.healthcareers.nhs.uk/sitemap.xml"
ROLE_PATH = "/explore-roles/"
LICENCE_NOTE = ("Link only. NHS Health Careers content is not reproduced by "
                "Helix: NHS England reserves all rights in it.")


class Provider:
    """Maps a Helix career to an NHS Health Careers page, when one exists."""

    source_code = "NHS_HEALTH_CAREERS"
    provider_name = "NHS Health Careers"

    def __init__(self, *, offline: bool = False, refresh: bool = False,
                 aliases: dict[str, str] | None = None):
        self.offline = offline
        self.refresh = refresh
        self.aliases = aliases or {}
        self._index: dict[str, str] | None = None
        self.note = ""

    # ------------------------------------------------------------------ index
    def index(self) -> dict[str, str]:
        """Normalised role title -> page URL, taken from the sitemap alone.

        The sitemap is the only thing fetched. Role pages are never requested,
        so no protected text ever enters this process.
        """
        if self._index is not None:
            return self._index

        try:
            body = fetch_text(SITEMAP, refresh=self.refresh, offline=self.offline)
        except FetchError as error:
            self.note = (f"The NHS Health Careers sitemap was unavailable "
                         f"({error}), so no links were added this run.")
            self._index = {}
            return self._index

        found: dict[str, str] = {}
        for url in re.findall(r"<loc>([^<]+)</loc>", body):
            if ROLE_PATH not in url:
                continue
            # Leaf pages are the individual roles; the shallower paths are the
            # category and family listings, which describe no single job.
            trimmed = url.rstrip("/")
            if trimmed.count("/") < 6:
                continue
            slug = trimmed.rsplit("/", 1)[-1]
            title = slug.replace("-", " ")
            found.setdefault(normalise(title), trimmed)

        self._index = found
        self.note = (f"{len(found)} NHS Health Careers role pages indexed from "
                     f"the sitemap. Helix links to them and reproduces none of "
                     f"their content.")
        return self._index

    @property
    def available(self) -> bool:
        return bool(self.index())

    def unavailable_reason(self) -> str:
        return self.note or "NHS Health Careers was not consulted this run."

    # ------------------------------------------------------------------- link
    def link_for(self, career: dict) -> dict | None:
        """A link record for this career, or None.

        Deliberately returns no title and no summary — only where to read it.
        The interface names the career from Helix's own taxonomy, so nothing
        from NHS England is stored even as a label.
        """
        index = self.index()
        if not index:
            return None

        key = normalise(career["title"])
        url = index.get(key)
        method = "exact_title"
        if url is None and key in self.aliases:
            slug = self.aliases[key]
            url = next((u for u in index.values() if u.rsplit("/", 1)[-1] == slug),
                       None)
            method = "curated_alias"
        if url is None:
            return None

        return {
            "provider": self.provider_name,
            "source_code": self.source_code,
            "source_url": url,
            "match_method": method,
            "content_reproduced": False,
            "licence_note": LICENCE_NOTE,
        }
