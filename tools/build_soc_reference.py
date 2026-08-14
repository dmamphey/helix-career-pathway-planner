"""Convert the ONS SOC 2020 workbook into a reference file the pipeline can read.

Run occasionally, by hand:

    python tools/build_soc_reference.py

SOC 2020 Volume 1 gives, for each four-digit unit group, a description of the
occupation, its typical entry routes, its tasks and — most usefully — a list of
related job titles. That last column is what lets a Helix career be mapped to a
group by name rather than by guesswork.

The workbook is parsed with the standard library alone. `.xlsx` is a zip of XML,
and the enrichment pipeline is stdlib-only by policy — the refresh workflow fails
if a third-party import appears in `tools/` — so pulling in openpyxl to read one
file once would cost more than writing the twenty lines below.

Output: data/reference/soc2020_unit_groups.json, which is committed. The pipeline
reads that and never contacts ONS, so a refresh does not depend on this script.

Source: Office for National Statistics, SOC 2020 Volume 1: structure and
descriptions of unit groups. Crown copyright, Open Government Licence v3.0.
"""

from __future__ import annotations

import json
import pathlib
import re
import urllib.request
import zipfile
from xml.etree import ElementTree

ROOT = pathlib.Path(__file__).resolve().parent.parent
OUT = ROOT / "data" / "reference" / "soc2020_unit_groups.json"
PAGE = ("https://www.ons.gov.uk/methodology/classificationsandstandards/"
        "standardoccupationalclassificationsoc/soc2020/"
        "soc2020volume1structureanddescriptionsofunitgroups")
NS = "{http://schemas.openxmlformats.org/spreadsheetml/2006/main}"
AGENT = {"User-Agent": "HelixMarketData/1.0 (+https://tools.optymumss.com/)"}


def fetch_workbook() -> bytes:
    """Find the current xlsx on the ONS page and download it."""
    request = urllib.request.Request(PAGE, headers=AGENT)
    html = urllib.request.urlopen(request, timeout=60).read().decode(
        "utf-8", "replace")
    links = re.findall(r'href="(/file\?uri=[^"]+)"', html)
    for link in links:
        url = "https://www.ons.gov.uk" + link.replace("&amp;", "&")
        if not url.lower().endswith(".xlsx"):
            continue
        print(f"downloading {url[:96]}…")
        return urllib.request.urlopen(
            urllib.request.Request(url, headers=AGENT), timeout=120).read()
    raise SystemExit("no .xlsx download found on the ONS page")


def read_sheet(blob: bytes, wanted: str) -> list[list[str]]:
    """Rows of one worksheet, as text. Enough xlsx to read this one file."""
    with zipfile.ZipFile(pathlib.Path(_cache(blob))) as archive:
        workbook = ElementTree.fromstring(archive.read("xl/workbook.xml"))
        names = {sheet.get("name"): sheet.get(f"{{http://schemas.openxmlformats"
                                              f".org/officeDocument/2006/"
                                              f"relationships}}id")
                 for sheet in workbook.iter(f"{NS}sheet")}
        rels = ElementTree.fromstring(archive.read("xl/_rels/workbook.xml.rels"))
        target = {rel.get("Id"): rel.get("Target") for rel in rels}
        path = target[names[wanted]].lstrip("/")
        if not path.startswith("xl/"):
            path = "xl/" + path

        shared: list[str] = []
        if "xl/sharedStrings.xml" in archive.namelist():
            strings = ElementTree.fromstring(archive.read("xl/sharedStrings.xml"))
            for item in strings.iter(f"{NS}si"):
                shared.append("".join(node.text or ""
                                      for node in item.iter(f"{NS}t")))

        sheet = ElementTree.fromstring(archive.read(path))
        rows = []
        for row in sheet.iter(f"{NS}row"):
            cells = []
            for cell in row.iter(f"{NS}c"):
                value = cell.find(f"{NS}v")
                text = ""
                if value is not None and value.text is not None:
                    if cell.get("t") == "s":
                        text = shared[int(value.text)]
                    else:
                        text = value.text
                elif cell.find(f"{NS}is") is not None:
                    text = "".join(n.text or ""
                                   for n in cell.find(f"{NS}is").iter(f"{NS}t"))
                cells.append(_clean(text))
            rows.append(cells)
        return rows


_TEMP = ROOT / "tools" / ".soc2020.xlsx"


def _cache(blob: bytes) -> str:
    _TEMP.write_bytes(blob)
    return str(_TEMP)


def _clean(text: str) -> str:
    text = (text or "").replace("\xa0", " ")
    return re.sub(r"\s+", " ", text).strip()


def _listed(cell: str) -> list[str]:
    """The workbook separates repeated values with a tilde."""
    return [part.strip() for part in (cell or "").split("~") if part.strip()]


def main() -> int:
    rows = read_sheet(fetch_workbook(), "SOC2020 descriptions")
    header = [h.lower() for h in rows[0]]

    def column(*names: str) -> int:
        for index, head in enumerate(header):
            if any(name in head for name in names):
                return index
        return -1

    col_unit = column("unit group")
    col_title = column("group title")
    col_desc = column("group description", "description")
    col_entry = column("entry routes")
    col_tasks = column("tasks")
    col_titles = column("related job titles")

    groups = {}
    for row in rows[1:]:
        def cell(index):
            return row[index] if 0 <= index < len(row) else ""
        code = cell(col_unit)
        if not re.fullmatch(r"\d{4}", code or ""):
            continue
        groups[code] = {
            "soc2020_code": code,
            "title": cell(col_title),
            "description": cell(col_desc),
            "entry_routes": cell(col_entry),
            "tasks": _listed(cell(col_tasks)),
            "related_job_titles": _listed(cell(col_titles)),
        }

    payload = {
        "source": "Office for National Statistics, SOC 2020 Volume 1: structure "
                  "and descriptions of unit groups",
        "source_url": PAGE,
        "licence": "Open Government Licence v3.0",
        "attribution": "Contains public sector information licensed under the "
                       "Open Government Licence v3.0.",
        "unit_group_count": len(groups),
        "unit_groups": groups,
    }
    OUT.write_text(json.dumps(payload, indent=1, ensure_ascii=False) + "\n",
                   encoding="utf-8")
    _TEMP.unlink(missing_ok=True)

    described = sum(1 for g in groups.values() if g["description"])
    titles = sum(len(g["related_job_titles"]) for g in groups.values())
    print(f"wrote {OUT.name}: {len(groups)} unit groups, {described} with a "
          f"description, {titles} related job titles")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
