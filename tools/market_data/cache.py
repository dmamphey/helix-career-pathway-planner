"""HTTP fetching for the enrichment pipeline: cached, polite, and offline-capable.

Every network call the pipeline makes goes through here, which gives one place to
enforce the things that matter when reading somebody else's public data: a real
user agent, a rate limit, and an on-disk cache so that re-running the pipeline
does not re-hammer the source.

Nothing in this module ever runs in the user's browser. The browser reads the
published static file and contacts nobody.
"""

from __future__ import annotations

import datetime as dt
import hashlib
import json
import time
import urllib.error
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
CACHE_DIR = ROOT / "tools" / "market_data" / ".cache"

USER_AGENT = ("HelixMarketData/1.0 (Helix Career Pathway Planner; "
              "career data enrichment; +https://tools.optymumss.com/)")

#: Seconds between requests to the same host. Deliberately unhurried: this runs
#: monthly in CI, not in a user request path.
POLITE_DELAY = 0.4

_last_request = 0.0


class FetchError(RuntimeError):
    """A network fetch failed and no cached copy exists."""


def _cache_path(url: str, suffix: str) -> Path:
    digest = hashlib.sha256(url.encode("utf-8")).hexdigest()[:20]
    return CACHE_DIR / f"{digest}{suffix}"


def fetch_text(url: str, *, headers: dict | None = None, refresh: bool = False,
               offline: bool = False, timeout: int = 60) -> str:
    """Return the body at `url`, from cache unless `refresh` is set.

    With `offline=True` only the cache is consulted, which is how the test suite
    and `--dry-run` avoid touching the network.
    """
    global _last_request
    path = _cache_path(url, ".txt")

    if path.exists() and not refresh:
        return path.read_text(encoding="utf-8")
    if offline:
        raise FetchError(f"offline and not cached: {url}")

    wait = POLITE_DELAY - (time.monotonic() - _last_request)
    if wait > 0:
        time.sleep(wait)

    request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT,
                                                  **(headers or {})})
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            body = response.read().decode("utf-8", "replace")
    except (urllib.error.URLError, TimeoutError, OSError) as error:
        if path.exists():
            # A stale cached copy beats failing the whole run.
            return path.read_text(encoding="utf-8")
        raise FetchError(f"{url}: {error}") from error
    finally:
        _last_request = time.monotonic()

    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(body, encoding="utf-8")
    return body


def fetch_json(url: str, **kwargs) -> dict:
    return json.loads(fetch_text(url, **kwargs))


def fetched_at(url: str, suffix: str = ".txt") -> str | None:
    """The date this URL was actually last retrieved, or None if never.

    Read from the cache file's modification time, because the alternative — using
    the date of the *run* — quietly breaks the freshness mechanism. An offline
    run, or any run that gets a cache hit, fetches nothing; stamping it with
    today's date would make every record look freshly verified for ever and
    guarantee that nothing is ever flagged for review. A record's age should
    reflect when somebody last looked at the source, not when a script last read
    its own cache.
    """
    path = _cache_path(url, suffix)
    if not path.exists():
        return None
    return dt.date.fromtimestamp(path.stat().st_mtime).isoformat()


def cached_count() -> int:
    return len(list(CACHE_DIR.glob("*.txt"))) if CACHE_DIR.exists() else 0
