"""Build the published labour market dataset.

    python tools/build_labour_market.py [--offline]

Writes `data/helix_labour_market_uk_v1.json`: one demand signal per occupation
category, plus the mapping from career family to category and a full statement of
which providers were consulted, which answered, and what each one is capable of
answering at all.

Signals are published per category rather than per career. Nine categories serve
716 careers, and duplicating the same index 716 times would add nothing except
file size and the chance of two copies disagreeing.

A failed run leaves the previous file alone. The application treats a missing or
stale labour market file as "no current signal" and says so — which is the honest
outcome, and is emphatically not the same as telling somebody there are no jobs.
"""

from __future__ import annotations

import json
import os
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from tools.market_data.providers import labour_market as lm  # noqa: E402

ROOT = Path(__file__).resolve().parent.parent
MAP_FILE = ROOT / "data" / "reference" / "helix_family_jobcategory_map.json"
OUT_FILE = ROOT / "data" / "helix_labour_market_uk_v1.json"


def load_map():
    return json.loads(MAP_FILE.read_text(encoding="utf-8"))


def api_keys():
    """Credentials from the environment, never from a file in the repository."""
    return {name: os.environ.get(name) or None
            for name in ("ADZUNA_APP_KEY", "DWP_FIND_A_JOB_KEY")}


def main(argv):
    offline = "--offline" in argv
    mapping = load_map()
    categories = mapping["categories"]

    providers = lm.known_providers(api_keys())
    if offline:
        providers = [lm.OnsJobAdvertProvider(offline=True)] + providers[1:]

    provider_report = []
    signals = {}
    used = None

    for provider in providers:
        entry = {
            "provider": provider.provider_name,
            "source_code": provider.source_code,
            "capabilities": provider.capabilities(),
            "available": bool(provider.available),
            "reason": "" if provider.available else provider.unavailable_reason(),
            "categories_answered": 0,
        }
        if provider.available and used is None:
            print(f"  querying {provider.provider_name}")
            for key, label in categories.items():
                try:
                    signal = provider.demand(key, label)
                except TypeError:
                    signal = provider.demand(key)
                if signal:
                    signals[key] = signal.as_dict()
                    print(f"    {key:32} index {signal.index} · {signal.trend}")
                else:
                    print(f"    {key:32} no usable series")
                time.sleep(0.4)
            entry["categories_answered"] = len(signals)
            if signals:
                used = provider.provider_name
        provider_report.append(entry)

    if not signals:
        print("\nNo provider returned a usable signal. The existing published "
              "file is left untouched, and the application will report that "
              "there is no current labour market signal — which is not the same "
              "as reporting that there are no jobs.")
        for entry in provider_report:
            if entry["reason"]:
                print(f"  - {entry['reason']}")
        return 1

    payload = {
        "dataset_name": "Helix UK labour market signals",
        "version": "1.0",
        "generated": time.strftime("%Y-%m-%d"),
        "jurisdiction": "United Kingdom",
        "scope": "category",
        "measure": "Index of online job adverts. Not a vacancy count.",
        "primary_provider": used,
        "providers": provider_report,
        "family_categories": {family: entry["category"]
                              for family, entry in mapping["families"].items()},
        "family_reasons": {family: entry["reason"]
                           for family, entry in mapping["families"].items()},
        "category_labels": categories,
        "baseline_category": mapping.get("baseline_category", "all-industries"),
        "limits": [
            mapping["limits"],
            "Advert categories are broad, so a signal describes the hiring "
            "climate around a career family rather than demand for one job "
            "title.",
            "This source publishes an index rather than a count, so Helix shows "
            "no vacancy numbers.",
            "This source is UK-wide, so Helix shows no regional demand.",
        ],
        "signals": signals,
    }
    OUT_FILE.write_text(json.dumps(payload, indent=1, ensure_ascii=False) + "\n",
                        encoding="utf-8")
    size = OUT_FILE.stat().st_size // 1024
    print(f"\nWrote {OUT_FILE.relative_to(ROOT)} ({size} KB), "
          f"{len(signals)} categories from {used}")
    for entry in provider_report:
        if not entry["available"]:
            print(f"  not used — {entry['reason']}")
    return 0


if __name__ == "__main__":
    sys.exit(main(sys.argv[1:]))
