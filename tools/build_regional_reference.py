"""Build the ONS regional and sector earnings extract.

Writes two curated reference files:

    data/reference/ons_ashe_regional_earnings.json   region x 2-digit SOC medians
    data/reference/ons_ashe_sector_earnings.json     public vs private, by region

Both come from the ONS Annual Survey of Hours and Earnings through the open
`api.beta.ons.gov.uk` filter API, which needs no credential. ASHE is Crown
copyright published under the Open Government Licence v3.0.

Why a checked-in extract rather than a live call
------------------------------------------------

The same reasoning as `providers/ons.py`: the full ASHE Table 3 CSV is 763 MB and
the observations endpoint cannot serve a whole occupation group in one request, so
the retrieval is slow and occasionally fails. Doing it at page-load time would put
a flaky third-party dependency in front of a salary figure. Doing it in the
enrichment run and committing the result means the numbers in the application are
the numbers somebody reviewed.

Run it deliberately, not on every refresh:

    python tools/build_regional_reference.py

Standard library only, like everything else in `tools/`.
"""

from __future__ import annotations

import csv
import gzip
import io
import json
import sys
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_REGIONAL = ROOT / "data" / "reference" / "ons_ashe_regional_earnings.json"
OUT_SECTOR = ROOT / "data" / "reference" / "ons_ashe_sector_earnings.json"

API = "https://api.beta.ons.gov.uk/v1"
LICENCE = "Open Government Licence v3.0"
ATTRIBUTION = ("Source: Office for National Statistics, Annual Survey of Hours "
               "and Earnings. Contains public sector information licensed under "
               "the Open Government Licence v3.0.")

HEADERS = {
    "User-Agent": "helix-career-pathway/1.0 (enrichment; +https://tools.optymumss.com)",
    "Accept": "application/json",
    "Content-Type": "application/json",
}

# The 2-digit groups Helix careers actually fall into, plus "all" as the
# whole-economy baseline.
SOC_GROUPS = ["11", "21", "22", "24", "31", "32", "35", "all"]

REGION_KEYS = {
    "K02000001": "uk",
    "E12000001": "north_east",
    "E12000002": "north_west",
    "E12000003": "yorkshire_and_the_humber",
    "E12000004": "east_midlands",
    "E12000005": "west_midlands",
    "E12000006": "east_of_england",
    "E12000007": "london",
    "E12000008": "south_east",
    "E12000009": "south_west",
    "W92000004": "wales",
    "S92000003": "scotland",
    "N92000002": "northern_ireland",
}


class BuildError(RuntimeError):
    pass


def call(url, payload=None, method=None, timeout=120, etag=None):
    """One API call, returning the body and the new ETag.

    The filter service uses optimistic concurrency: every write must carry the
    ETag from the previous response in `If-Match`, and answers with a fresh one.
    Without it every POST is rejected with "required If-Match header not
    provided", which is the API telling you it will not let two writers race.
    """
    headers = dict(HEADERS)
    if etag:
        headers["If-Match"] = etag
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    request = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(request, timeout=timeout) as response:
        raw = response.read()
        new_etag = response.headers.get("ETag")
    return (json.loads(raw) if raw else {}), new_etag


def public(href):
    """Rewrite an internal service href onto the public API host.

    The filter service answers with links to its own cluster address
    (`http://10.30.156.4:10450/filter-outputs/...`), which is unroutable from
    outside — a request to it hangs until the socket gives up rather than
    failing fast. Only the path is useful; the host has to be replaced.
    """
    parts = urllib.parse.urlparse(href)
    if parts.netloc and parts.netloc.startswith(("10.", "172.", "192.168.")):
        return f"{API}{parts.path}"
    return href


def latest_version(dataset_id):
    meta, _ = call(f"{API}/datasets/{dataset_id}")
    editions, _ = call(meta["links"]["editions"]["href"])
    edition = editions["items"][0]
    version, _ = call(edition["links"]["latest_version"]["href"])
    return edition["edition"], version["version"], version.get("release_date", "")


def dimension_options(dataset_id, edition, version, dimension):
    """Every option code a dataset publishes for one dimension."""
    body, _ = call(f"{API}/datasets/{dataset_id}/editions/{edition}/versions/"
                   f"{version}/dimensions/{dimension}/options?limit=1000")
    return [item.get("option") for item in body.get("items", [])]


def filtered_csv(dataset_id, edition, version, selections, *, attempts=40):
    """Run one filter job and return its CSV as text."""
    job, etag = call(f"{API}/filters?submitted=false",
                     {"dataset": {"id": dataset_id, "edition": edition,
                                  "version": int(version)}})
    filter_id = job["filter_id"]
    for name, options in selections.items():
        _, etag = call(f"{API}/filters/{filter_id}/dimensions/{name}",
                       {"options": list(options)}, method="POST", etag=etag)
    submitted, _ = call(f"{API}/filters/{filter_id}?submitted=true", {},
                        method="PUT", etag=etag)

    output_href = public(submitted["links"]["filter_output"]["href"])
    for attempt in range(attempts):
        output, _ = call(output_href)
        downloads = output.get("downloads") or {}
        csv_link = (downloads.get("csv") or {}).get("href")
        if csv_link:
            return download_text(csv_link)
        if output.get("state") == "failed":
            raise BuildError(f"the filter job for {dataset_id} failed")
        time.sleep(min(4 + attempt, 15))
    raise BuildError(f"the filter job for {dataset_id} did not finish in time")


def download_text(href):
    request = urllib.request.Request(href, headers={"User-Agent": HEADERS["User-Agent"]})
    with urllib.request.urlopen(request, timeout=300) as response:
        raw = response.read()
    if raw[:2] == b"\x1f\x8b":
        raw = gzip.decompress(raw)
    return raw.decode("utf-8-sig")


def rows(text):
    return list(csv.DictReader(io.StringIO(text)))


def column(fieldnames, *candidates):
    lowered = {name.lower().replace(" ", "").replace("_", ""): name
               for name in fieldnames}
    for candidate in candidates:
        key = candidate.lower().replace(" ", "").replace("_", "")
        if key in lowered:
            return lowered[key]
    return None


def value_column(fieldnames):
    """The observation column.

    ONS V4 CSVs name it `v4_N`, where N counts the metadata columns that follow
    it (data markings, confidence intervals). The number moves between tables, so
    it is found by shape rather than assumed.
    """
    for name in fieldnames:
        if str(name).lower().startswith("v4_"):
            return name
    return None


def number(value):
    text = str(value or "").strip().replace(",", "")
    if not text or text in {"x", ":", "..", "-"}:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def build_regional(year):
    edition, version, released = latest_version("ashe-tables-3")
    print(f"  ashe-tables-3 {edition} v{version}, released {released[:10]}")
    text = filtered_csv("ashe-tables-3", edition, version, {
        "time": [year],
        "geography": list(REGION_KEYS),
        "averagesandpercentiles": ["median"],
        "sex": ["all"],
        "workingpattern": ["full-time"],
        "hoursandearnings": ["annual-pay-gross"],
        "standardoccupationalclassification": SOC_GROUPS,
    })
    data = rows(text)
    if not data:
        raise BuildError("ASHE Table 3 returned no rows")

    geo_col = column(data[0].keys(), "administrative-geography", "geography")
    soc_col = column(data[0].keys(), "soc", "standardoccupationalclassification")
    value_col = value_column(data[0].keys())
    if not (geo_col and soc_col and value_col):
        raise BuildError(f"unexpected ASHE Table 3 columns: {list(data[0])}")

    groups = {}
    for row in data:
        soc = str(row[soc_col]).strip()
        region = REGION_KEYS.get(str(row[geo_col]).strip())
        value = number(row[value_col])
        if region is None or value is None or not soc:
            continue
        groups.setdefault(soc, {})[region] = round(value)

    payload = {
        "source": "Office for National Statistics, Annual Survey of Hours and "
                  "Earnings, Table 3 (region by occupation, two-digit SOC)",
        "source_url": "https://www.ons.gov.uk/employmentandlabourmarket/"
                      "peopleinwork/earningsandworkinghours/datasets/"
                      "regionbyoccupation2digitsocashetable3",
        "dataset_id": "ashe-tables-3",
        "edition": edition,
        "version": version,
        "released": released[:10],
        "year": year,
        "measure": "Median gross annual pay, full-time employees, all sexes",
        "licence": LICENCE,
        "attribution": ATTRIBUTION,
        "retrieved": time.strftime("%Y-%m-%d"),
        "regions": REGION_KEYS,
        "medians": groups,
    }
    return payload


def build_sector(year):
    edition, version, released = latest_version("ashe-tables-25")
    print(f"  ashe-tables-25 {edition} v{version}, released {released[:10]}")
    # Table 25 does not cover Northern Ireland, and asking for a geography a
    # table does not hold rejects the whole filter rather than dropping the one
    # option — so the request is built from what this table actually publishes.
    available = set(dimension_options("ashe-tables-25", edition, version,
                                      "geography"))
    text = filtered_csv("ashe-tables-25", edition, version, {
        "time": [year],
        "geography": [code for code in REGION_KEYS if code in available],
        "averagesandpercentiles": ["median"],
        "sex": ["all"],
        "workingpattern": ["full-time"],
        "hoursandearnings": ["annual-pay-gross"],
        "sector": ["public-sector", "private-sector",
                   "non-profit-body-or-mutual-association", "all"],
    })
    data = rows(text)
    if not data:
        raise BuildError("ASHE Table 25 returned no rows")
    value_col = value_column(data[0].keys())
    sector_col = column(data[0].keys(), "sector")
    geo_col = column(data[0].keys(), "administrative-geography", "geography")
    if not (value_col and sector_col and geo_col):
        raise BuildError(f"unexpected ASHE Table 25 columns: {list(data[0])}")

    sectors = {}
    for row in data:
        region = REGION_KEYS.get(str(row[geo_col]).strip())
        amount = number(row[value_col])
        sector = str(row[sector_col]).strip().lower()
        if region is None or amount is None or not sector:
            continue
        sectors.setdefault(sector, {})[region] = round(amount)

    return {
        "source": "Office for National Statistics, Annual Survey of Hours and "
                  "Earnings, Table 25 (UK region by public and private sector)",
        "source_url": "https://www.ons.gov.uk/employmentandlabourmarket/"
                      "peopleinwork/earningsandworkinghours/datasets/"
                      "publicandprivatesectorbyregionashetable25",
        "dataset_id": "ashe-tables-25",
        "edition": edition,
        "version": version,
        "released": released[:10],
        "year": year,
        "measure": "Median gross annual pay, full-time employees, all sexes",
        "note": "Whole-economy figures. These describe all employees in a sector, "
                "not the pay of any particular occupation within it, and Helix "
                "presents them only as economy-wide context.",
        "licence": LICENCE,
        "attribution": ATTRIBUTION,
        "retrieved": time.strftime("%Y-%m-%d"),
        "medians": sectors,
    }


def main(argv):
    year = argv[1] if len(argv) > 1 else "2023"
    print(f"Building ONS regional and sector extracts for {year}")
    failures = []

    try:
        regional = build_regional(year)
        OUT_REGIONAL.write_text(json.dumps(regional, indent=2) + "\n",
                                encoding="utf-8")
        groups = len(regional["medians"])
        print(f"  wrote {OUT_REGIONAL.name}: {groups} occupation groups")
    except (BuildError, urllib.error.URLError, OSError, KeyError) as error:
        failures.append(f"regional: {error}")

    try:
        sector = build_sector(year)
        OUT_SECTOR.write_text(json.dumps(sector, indent=2) + "\n", encoding="utf-8")
        print(f"  wrote {OUT_SECTOR.name}: {len(sector['medians'])} sectors")
    except (BuildError, urllib.error.URLError, OSError, KeyError) as error:
        failures.append(f"sector: {error}")

    for failure in failures:
        print(f"  NOT BUILT — {failure}")
    # A failure here leaves the previous extract in place and the resolver simply
    # reports regional data as unavailable. It is never a reason to publish a
    # made-up number, so it is not a reason to fail the whole enrichment either.
    return 1 if len(failures) == 2 else 0


if __name__ == "__main__":
    sys.exit(main(sys.argv))
