#!/usr/bin/env python3
"""Build the fictional CV fixtures used by the privacy and parsing tests.

    python tests/make_fixtures.py

Produces, in tests/fixtures/:

    fictional-cv.txt      the same CV as plain text
    fictional-cv.docx     a minimal but valid DOCX
    fictional-cv.html     source for the PDF
    fictional-cv.pdf      a text-based PDF, printed by headless Chrome or Edge
    scanned-cv.pdf        a PDF with no extractable text, for the fallback test

Every value in these files is invented. "Jane Example", the example.test email
address and "Example Diagnostics Ltd" are deliberately recognisable so a test can
search network traffic and localStorage for them and prove they went nowhere.
"""

from __future__ import annotations

import base64
import shutil
import subprocess
import sys
import tempfile
import zipfile
from pathlib import Path

HERE = Path(__file__).resolve().parent
FIXTURES = HERE / "fixtures"

CV_LINES = [
    "Jane Example",
    "Biomedical Scientist",
    "jane.example@example.test | 07123 456789 | Manchester M1 2AB",
    "linkedin.com/in/jane-example-fictional",
    "",
    "PROFILE",
    "Registered biomedical scientist with 9 years' experience in a diagnostic "
    "laboratory, specialising in haematology and blood transfusion.",
    "",
    "PROFESSIONAL REGISTRATION",
    "HCPC registered Biomedical Scientist, registration number BS000000",
    "Member of the Institute of Biomedical Science (MIBMS)",
    "",
    "EMPLOYMENT",
    "Senior Biomedical Scientist, Example Diagnostics Ltd, 2019 - present",
    "- Result authorisation across haematology and coagulation",
    "- Led the internal audit programme against ISO 15189 and closed CAPA actions",
    "- Delivered training and competency assessment for six junior staff",
    "- Supervised the evening shift rota and line managed two assistants",
    "- Validated a new analyser, writing the SOPs and validation report",
    "",
    "Biomedical Scientist, Example NHS Foundation Trust, 2016 - 2019",
    "- Blood transfusion and haematology bench work",
    "- Internal quality control and external quality assessment returns",
    "- Presented an audit of turnaround time at a regional meeting",
    "",
    "Trainee Biomedical Scientist, Example NHS Foundation Trust, 2015 - 2016",
    "- Completed the pre-registration training portfolio",
    "",
    "EDUCATION",
    "MSc Haematology, Example University, 2021",
    "BSc (Hons) Biomedical Science, Example University, 2015, 2:1",
    "A level Biology, Chemistry, Example College, 2012",
    "",
    "SKILLS",
    "Quality management systems, document control, root cause analysis",
    "Staff training, mentoring, competency assessment",
    "Excel reporting and turnaround-time dashboards",
    "",
    "REFERENCES",
    "Available on request.",
]

CV_TEXT = "\n".join(CV_LINES) + "\n"

CANDIDATES = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    r"C:\Program Files\Microsoft\Edge\Application\msedge.exe",
    "google-chrome", "chromium", "microsoft-edge",
]


def find_browser() -> str | None:
    for candidate in CANDIDATES:
        if Path(candidate).is_file():
            return candidate
        found = shutil.which(candidate)
        if found:
            return found
    return None


def write_txt() -> None:
    (FIXTURES / "fictional-cv.txt").write_text(CV_TEXT, encoding="utf-8")
    print("  wrote fictional-cv.txt")


def write_html() -> Path:
    body = "".join(
        f"<p>{line}</p>" if line else "<p>&nbsp;</p>" for line in CV_LINES)
    html = ("<!DOCTYPE html><html lang=\"en-GB\"><head><meta charset=\"utf-8\">"
            "<title>Fictional CV</title><style>body{font:11pt/1.45 Arial,"
            "sans-serif;margin:18mm}p{margin:0 0 2pt}</style></head><body>"
            f"{body}</body></html>")
    path = FIXTURES / "fictional-cv.html"
    path.write_text(html, encoding="utf-8")
    print("  wrote fictional-cv.html")
    return path


def write_docx() -> None:
    """A minimal DOCX. Only what Mammoth needs to find the paragraphs."""
    def escape(text: str) -> str:
        return (text.replace("&", "&amp;").replace("<", "&lt;")
                    .replace(">", "&gt;"))

    paragraphs = "".join(
        f'<w:p><w:r><w:t xml:space="preserve">{escape(line)}</w:t></w:r></w:p>'
        for line in CV_LINES)
    document = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml'
        '/2006/main"><w:body>' + paragraphs + "</w:body></w:document>")
    content_types = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Types xmlns="http://schemas.openxmlformats.org/package/2006/'
        'content-types">'
        '<Default Extension="rels" ContentType="application/vnd.openxmlformats-'
        'package.relationships+xml"/>'
        '<Default Extension="xml" ContentType="application/xml"/>'
        '<Override PartName="/word/document.xml" ContentType="application/vnd.'
        'openxmlformats-officedocument.wordprocessingml.document.main+xml"/>'
        "</Types>")
    rels = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/'
        'relationships"><Relationship Id="rId1" Type="http://schemas.'
        'openxmlformats.org/officeDocument/2006/relationships/officeDocument" '
        'Target="word/document.xml"/></Relationships>')

    path = FIXTURES / "fictional-cv.docx"
    with zipfile.ZipFile(path, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("[Content_Types].xml", content_types)
        archive.writestr("_rels/.rels", rels)
        archive.writestr("word/document.xml", document)
    print(f"  wrote fictional-cv.docx ({path.stat().st_size:,} bytes)")


def print_pdf(browser: str, source: Path, target: Path) -> bool:
    with tempfile.TemporaryDirectory(prefix="cpfix") as tmp:
        out = Path(tmp) / "out.pdf"
        result = subprocess.run([
            browser, "--headless=new", "--disable-gpu", "--no-first-run",
            "--no-default-browser-check", "--no-pdf-header-footer",
            "--virtual-time-budget=3000", f"--print-to-pdf={out}",
            source.as_uri(),
        ], capture_output=True, text=True, timeout=180)
        if not out.exists():
            print(f"  FAILED {target.name}: exit {result.returncode}")
            print("   ", result.stderr.strip()[:300])
            return False
        shutil.copyfile(out, target)
    print(f"  wrote {target.name} ({target.stat().st_size:,} bytes)")
    return True


def screenshot(browser: str, source: Path, target: Path, height: int = 1400) -> bool:
    """Render a page to PNG, so a fixture can contain text as pixels."""
    with tempfile.TemporaryDirectory(prefix="cpshot") as tmp:
        out = Path(tmp) / "shot.png"
        result = subprocess.run([
            browser, "--headless=new", "--disable-gpu", "--no-first-run",
            "--no-default-browser-check", "--hide-scrollbars",
            f"--window-size=1000,{height}", "--virtual-time-budget=3000",
            f"--screenshot={out}", source.as_uri(),
        ], capture_output=True, text=True, timeout=180)
        if not out.exists():
            print(f"  FAILED {target.name}: exit {result.returncode}")
            print("   ", result.stderr.strip()[:300])
            return False
        shutil.copyfile(out, target)
    print(f"  wrote {target.name} ({target.stat().st_size:,} bytes)")
    return True


def write_ocr_source(browser: str) -> Path | None:
    """A page whose only content is a *picture of the CV*.

    The old scanned fixture was a grey rectangle. It proved the "we cannot read
    this" path and nothing else — there was no text in it, so it could never
    show whether text recognition works. This renders the real CV to an image
    and puts that image on the page, which is what a scanner produces: a
    document a human can read and a text extractor cannot.
    """
    shot = FIXTURES / "scanned-cv-page.png"
    if not screenshot(browser, FIXTURES / "fictional-cv.html", shot):
        return None
    data = base64.b64encode(shot.read_bytes()).decode("ascii")
    shot.unlink(missing_ok=True)
    html = ("<!DOCTYPE html><html lang=\"en-GB\"><head><meta charset=\"utf-8\">"
            "<title>x</title><style>html,body{margin:0}"
            "img{width:100%;image-rendering:auto}</style></head><body>"
            f'<img src="data:image/png;base64,{data}" alt=""></body></html>')
    path = FIXTURES / "scanned-cv-source.html"
    path.write_text(html, encoding="utf-8")
    return path


def write_scanned_source() -> Path:
    """A page whose only content is an image, so the PDF has no text layer."""
    # A 2x2 grey PNG, scaled up. Nothing to extract, which is the point.
    png = ("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAYAAABytg0k"
           "AAAAFElEQVR4nGP4z8DwHwzpwsQAAP//AwAX+wH/8k0kUgAAAABJRU5ErkJggg==")
    html = ("<!DOCTYPE html><html lang=\"en-GB\"><head><meta charset=\"utf-8\">"
            "<title>x</title><style>html,body{margin:0}img{width:100%;"
            "height:260mm;image-rendering:pixelated}</style></head><body>"
            f'<img src="{png}" alt=""></body></html>')
    path = FIXTURES / "scanned-cv.html"
    path.write_text(html, encoding="utf-8")
    return path


def main() -> int:
    FIXTURES.mkdir(parents=True, exist_ok=True)
    print(f"Fixtures -> {FIXTURES}")
    write_txt()
    write_docx()
    html = write_html()
    scanned = write_scanned_source()

    browser = find_browser()
    if not browser:
        print("  no Chrome or Edge found: the PDF fixtures were not built")
        return 1
    # Needs the browser, so it is built after the search rather than before it.
    ocr_source = write_ocr_source(browser)
    ok = print_pdf(browser, html, FIXTURES / "fictional-cv.pdf")
    ok = print_pdf(browser, scanned, FIXTURES / "scanned-cv.pdf") and ok
    scanned.unlink(missing_ok=True)
    if ocr_source:
        ok = print_pdf(browser, ocr_source,
                       FIXTURES / "scanned-cv-readable.pdf") and ok
        ocr_source.unlink(missing_ok=True)
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
