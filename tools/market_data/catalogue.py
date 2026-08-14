"""The career catalogue: the supplied taxonomy plus anything added since.

One place that answers "which careers exist", so the enricher, the validator,
the audit and the tests cannot disagree about it.

The supplied file is never edited. Its hash is checked on every refresh and the
workflow fails if it moves, which is the guarantee that nothing has quietly
rewritten the launch taxonomy — so the catalogue grows by adding a second file
rather than by appending to the first. Additions start at CP-701, far clear of
the supplied CP-001..CP-677, so an id says at a glance where a career came from.

Everything downstream counts careers rather than assuming 677.
"""

from __future__ import annotations

import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent.parent
BASE_FILE = ROOT / "data" / "careerpath_uk_careers_v1.json"
ADDITIONS_FILE = ROOT / "data" / "helix_additional_careers_v1.json"


def _read(path: Path) -> dict:
    if not path.exists():
        return {}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def load_base() -> dict:
    """The supplied taxonomy, exactly as issued."""
    return _read(BASE_FILE)


def load_additions() -> list[dict]:
    """Careers added after launch, or an empty list if the file is absent."""
    data = _read(ADDITIONS_FILE)
    careers = data.get("careers")
    return careers if isinstance(careers, list) else []


def load_catalogue() -> dict:
    """The full catalogue, shaped like the supplied file so callers need no
    special case.

    An addition that reuses a supplied id is dropped rather than allowed to
    shadow it: the supplied record is the one every other file is keyed to.
    """
    base = load_base()
    supplied = base.get("careers", [])
    supplied_ids = {career["id"] for career in supplied}
    extra = [career for career in load_additions()
             if career.get("id") not in supplied_ids]

    merged = dict(base)
    merged["careers"] = [*supplied, *extra]
    merged["career_count"] = len(merged["careers"])
    merged["supplied_count"] = len(supplied)
    merged["added_count"] = len(extra)
    return merged


def career_count() -> int:
    return len(load_catalogue()["careers"])
