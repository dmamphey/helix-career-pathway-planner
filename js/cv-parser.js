/**
 * Reading a CV, locally.
 *
 * Two separate jobs live here, deliberately behind one boundary:
 *
 *   extractText(file)          get plain text out of a PDF, DOCX or TXT
 *   ProfileInterpreter.parse() turn plain text into a structured profile
 *
 * The rest of the application only ever sees the structured profile. That is the
 * seam a future AI interpreter would slot into: implement `parse` differently and
 * nothing downstream changes.
 *
 * Privacy is a property of what this module *builds*, not only of what it avoids
 * sending. Evidence strings attached to a profile are always phrases from the
 * application's own vocabulary, never spans copied out of the document, so a
 * sentence containing a name or a patient detail cannot travel with the profile.
 * Personal identifiers are additionally removed from the working text before any
 * parsing happens.
 */

import {
  QUALIFICATION_LEVELS, REGISTRATION_BODIES, SECTOR_SIGNALS, DOMAINS,
  containsPhrase, resolveText,
} from "./ontology.js";
import { FAMILY_META } from "./ontology.js";
import { addSignal, emptyProfile } from "./profile.js";

/** Below this much text, treat the document as unreadable rather than empty. */
const MIN_USEFUL_CHARS = 200;

/** Where the document libraries come from when they are vendored locally. */
const VENDOR = new URL("../assets/vendor/", import.meta.url);
const CDN = {
  pdf: "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.6.82/build/pdf.min.mjs",
  pdfWorker:
    "https://cdn.jsdelivr.net/npm/pdfjs-dist@4.6.82/build/pdf.worker.min.mjs",
  mammoth: "https://cdn.jsdelivr.net/npm/mammoth@1.8.0/mammoth.browser.min.js",
};

export class UnsupportedFormatError extends Error {}
export class UnreadableDocumentError extends Error {}

/**
 * Extract text from a user-selected file.
 *
 * Heavy parsers are imported on demand, so a visitor who never uploads a CV
 * never downloads them.
 */
export async function extractText(file) {
  const name = (file && file.name || "").toLowerCase();
  const ext = name.slice(name.lastIndexOf(".") + 1);

  if (ext === "txt" || file.type === "text/plain") {
    return finish(await file.text(), "TXT");
  }
  if (ext === "pdf" || file.type === "application/pdf") {
    return finish(await readPdf(file), "PDF");
  }
  if (ext === "docx" || /wordprocessingml/.test(file.type || "")) {
    return finish(await readDocx(file), "DOCX");
  }
  if (ext === "doc") {
    throw new UnsupportedFormatError(
      "Older .doc files are not supported. Save your CV as PDF or DOCX, or "
      + "build your profile manually.");
  }
  throw new UnsupportedFormatError(
    "That file type is not supported. Helix reads text-based PDF, DOCX "
    + "and TXT files.");
}

function finish(text, format) {
  const clean = String(text || "").replace(/\r/g, "");
  const density = clean.replace(/[^a-zA-Z]/g, "").length;
  if (density < MIN_USEFUL_CHARS) {
    throw new UnreadableDocumentError(
      "We could not reliably read text from this CV. It may be a scanned "
      + "document. Please upload a text-based PDF or DOCX, or continue by "
      + "building your profile manually.");
  }
  return { text: clean, format, characters: clean.length };
}

async function readPdf(file) {
  const pdfjs = await loadPdfLibrary();
  const data = new Uint8Array(await file.arrayBuffer());
  const doc = await pdfjs.getDocument({ data, isEvalSupported: false }).promise;
  const pages = [];
  for (let number = 1; number <= doc.numPages; number += 1) {
    const page = await doc.getPage(number);
    const content = await page.getTextContent();
    pages.push(rebuildLines(content.items));
  }
  // Release the parsed document promptly: it holds the raw bytes.
  await doc.destroy();
  return pages.join("\n");
}

/**
 * Reassemble text runs into lines.
 *
 * A PDF has no lines — only positioned runs of glyphs. Joining them all with
 * spaces produces one enormous line, and a CV read that way loses exactly the
 * structure the parser depends on: a job title on its own line, a qualification
 * followed by its subject. So runs are grouped by vertical position, using the
 * y translation in each item's transform matrix.
 */
function rebuildLines(items) {
  const lines = [];
  let current = [];
  let lastY = null;

  for (const item of items) {
    const text = item.str;
    const y = item.transform ? item.transform[5] : null;
    // A change in vertical position of more than a couple of points is a new
    // line; PDF.js also flags line ends directly in recent versions.
    const moved = y !== null && lastY !== null && Math.abs(y - lastY) > 2;
    if (moved && current.length) {
      lines.push(current.join("").replace(/\s+/g, " ").trim());
      current = [];
    }
    if (text) current.push(text);
    if (item.hasEOL) {
      lines.push(current.join("").replace(/\s+/g, " ").trim());
      current = [];
    }
    if (y !== null) lastY = y;
  }
  if (current.length) {
    lines.push(current.join("").replace(/\s+/g, " ").trim());
  }
  return lines.filter(Boolean).join("\n");
}

async function loadPdfLibrary() {
  const attempts = [new URL("pdf.min.mjs", VENDOR).href, CDN.pdf];
  const workers = [new URL("pdf.worker.min.mjs", VENDOR).href, CDN.pdfWorker];
  for (let i = 0; i < attempts.length; i += 1) {
    try {
      const module = await import(/* @vite-ignore */ attempts[i]);
      const lib = module.getDocument ? module : module.default;
      if (lib && lib.GlobalWorkerOptions) {
        lib.GlobalWorkerOptions.workerSrc = workers[i];
      }
      if (lib && lib.getDocument) return lib;
    } catch (ignored) { /* try the next source */ }
  }
  throw new UnreadableDocumentError(
    "The PDF reader could not be loaded. Try a DOCX or TXT file, or build "
    + "your profile manually.");
}

async function readDocx(file) {
  const mammoth = await loadMammoth();
  const result = await mammoth.extractRawText(
    { arrayBuffer: await file.arrayBuffer() });
  return result.value;
}

async function loadMammoth() {
  if (window.mammoth) return window.mammoth;
  for (const src of [new URL("mammoth.browser.min.js", VENDOR).href, CDN.mammoth]) {
    try {
      await loadScript(src);
      if (window.mammoth) return window.mammoth;
    } catch (ignored) { /* try the next source */ }
  }
  throw new UnreadableDocumentError(
    "The DOCX reader could not be loaded. Try a PDF or TXT file, or build "
    + "your profile manually.");
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = src;
    script.onload = resolve;
    script.onerror = () => reject(new Error(`could not load ${src}`));
    document.head.appendChild(script);
  });
}

/* ---------------------------------------------------------------- redaction */

/**
 * Remove personal identifiers from the working text.
 *
 * This runs before parsing, so nothing downstream can pick them up even by
 * accident. It is not presented to the user as anonymisation of their document —
 * the document itself is untouched, and it never leaves the browser.
 */
export function redactPersonalData(text) {
  return String(text || "")
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, " [email] ")
    .replace(/\bhttps?:\/\/\S+/gi, " [link] ")
    .replace(/\b(?:www\.)\S+/gi, " [link] ")
    // UK and international-looking telephone numbers.
    .replace(/(?:\+\d{1,3}[\s-]?)?(?:\(?0\d{2,4}\)?[\s-]?)?\d{3,4}[\s-]?\d{3,4}\b/g,
             " [phone] ")
    // UK postcodes.
    .replace(/\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/gi, " [postcode] ")
    .replace(/\b(?:linkedin|twitter|github)\.com\S*/gi, " [link] ");
}

/* ------------------------------------------------------- profile interpreter */

/**
 * The rule-based interpreter.
 *
 * `parse` is pure and deterministic: the same text always produces the same
 * profile. It is conservative by design — where a value cannot be established it
 * is left empty and reported in `notes`, because an empty field the user can fill
 * in is far better than a confident guess they have to notice and undo.
 */
export const ProfileInterpreter = {
  /**
   * @param {string} text raw document text
   * @param {{catalogue?: object}} [context] optional career catalogue, used to
   *        recognise role titles from the dataset
   */
  parse(text, context = {}) {
    const safe = redactPersonalData(text);
    const lines = safe.split("\n").map((line) => line.trim()).filter(Boolean);
    const profile = emptyProfile();
    profile.source = "cv";
    profile.createdAt = new Date().toISOString();
    const notes = [];

    const role = findCurrentRole(lines, context.catalogue);
    if (role.title) {
      profile.currentRole = role.title;
      if (role.careerId && context.catalogue) {
        const career = context.catalogue.get(role.careerId);
        if (career) profile.currentCareerFamily = career.family;
      }
    } else {
      notes.push("A current or most recent job title could not be identified.");
    }

    const years = estimateYears(safe);
    if (years !== null) {
      profile.yearsExperience = years.value;
      if (years.basis) notes.push(years.basis);
    } else {
      notes.push("Years of experience could not be estimated from the dates.");
    }

    profile.qualifications = findQualifications(lines);
    if (!profile.qualifications.length) {
      notes.push("No qualifications were recognised.");
    }

    profile.registrations = findRegistrations(safe);
    profile.sectors = findSectors(safe);

    const domains = resolveText(safe);
    for (const [domain, evidence] of domains) {
      addSignal(profile, domain, evidence);
    }
    if (domains.size === 0) {
      notes.push("No skill or experience signals were recognised.");
    }

    profile.disciplines = findDisciplines(domains);
    if (!profile.currentCareerFamily) {
      profile.currentCareerFamily = guessFamily(domains);
    }

    return { profile, notes, signalCount: domains.size };
  },
};

/** Lines that are section headings rather than content. */
const SECTION_HEADINGS = /^(employment|work|professional|career|experience|education|qualifications|skills|training|registration|referees|references|profile|summary|personal)\b/i;

/**
 * Find the most recent role title.
 *
 * Three strategies, most reliable first: an explicit label, a line that matches a
 * title in the career dataset, and finally a line that looks like a job title
 * near the top of an experience section. Employer names are cut away, because the
 * profile has no business holding them.
 */
function findCurrentRole(lines, catalogue) {
  for (const line of lines.slice(0, 60)) {
    const labelled = line.match(
      /^(?:current\s+)?(?:job\s+)?(?:role|title|position|job title)\s*[:\-–]\s*(.+)$/i);
    if (labelled) {
      const title = tidyTitle(labelled[1]);
      if (title) return { title, careerId: matchDatasetTitle(title, catalogue) };
    }
  }

  if (catalogue) {
    // A dataset title appearing in the document is the strongest signal
    // available, and it also tells us the career family.
    for (const line of lines.slice(0, 80)) {
      if (line.length > 120 || SECTION_HEADINGS.test(line)) continue;
      const haystack = ` ${line.toLowerCase()} `;
      let best = null;
      for (const career of catalogue.careers) {
        const title = career.title.toLowerCase();
        if (title.length < 8) continue;
        if (!containsPhrase(haystack, title)) continue;
        if (!best || title.length > best.title.length) best = career;
      }
      if (best) return { title: best.title, careerId: best.id };
    }
  }

  const roleWords = /(scientist|officer|manager|analyst|nurse|practitioner|technician|technologist|associate|consultant|researcher|fellow|engineer|advisor|adviser|specialist|coordinator|lead|director|pharmacist|radiographer|physiotherapist|doctor|registrar|assistant|auditor|writer|liaison)/i;
  let inExperience = false;
  for (const line of lines.slice(0, 120)) {
    if (/^(employment|work experience|professional experience|career history|experience)\b/i.test(line)) {
      inExperience = true;
      continue;
    }
    if (/^(education|qualifications|skills|references)\b/i.test(line)) {
      inExperience = false;
    }
    if (line.length > 90 || !roleWords.test(line)) continue;
    if (/[@]/.test(line)) continue;
    const title = tidyTitle(line);
    if (!title) continue;
    if (inExperience) return { title, careerId: matchDatasetTitle(title, catalogue) };
  }

  // Fall back to any title-looking line anywhere in the document.
  for (const line of lines.slice(0, 120)) {
    if (line.length > 90 || !roleWords.test(line) || SECTION_HEADINGS.test(line)) {
      continue;
    }
    const title = tidyTitle(line);
    if (title) return { title, careerId: matchDatasetTitle(title, catalogue) };
  }
  return { title: "", careerId: null };
}

/** Strip dates, employers and decoration from a candidate title line. */
function tidyTitle(text) {
  let title = String(text)
    .replace(/\(.*?\)/g, " ")
    .replace(/\b(19|20)\d{2}\b/g, " ")
    .replace(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\b/gi, " ")
    .replace(/\bpresent\b/gi, " ")
    .split(/\s+(?:at|for|with|,|–|—|\||•|·)\s+/i)[0]
    .split(/\s*[,|•·]\s*/)[0]
    .replace(/[^A-Za-z0-9&/'\-\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (title.length < 4 || title.length > 70) return "";
  if (!/[a-z]/.test(title)) title = toTitleCase(title);
  return title;
}

function toTitleCase(text) {
  return text.toLowerCase().replace(/\b[a-z]/g, (ch) => ch.toUpperCase());
}

function matchDatasetTitle(title, catalogue) {
  if (!catalogue) return null;
  const wanted = title.toLowerCase().trim();
  const exact = catalogue.careers.find((c) => c.title.toLowerCase() === wanted);
  return exact ? exact.id : null;
}

/**
 * Estimate years of experience.
 *
 * An explicit statement in the CV wins. Otherwise the span from the earliest
 * plausible employment year to the latest is used, which is an over-estimate for
 * someone who studied part way through — hence "approximately", and hence the
 * fact that the user can edit it.
 */
function estimateYears(text) {
  const stated = text.match(/(\d{1,2})\+?\s*years?['’]?\s*(?:of\s*)?experience/i);
  if (stated) {
    const value = Number(stated[1]);
    if (value >= 0 && value <= 60) {
      return { value, basis: "Years of experience were taken from a statement "
                            + "in your CV." };
    }
  }
  const thisYear = new Date().getFullYear();
  const years = [...text.matchAll(/\b(19[89]\d|20[0-4]\d)\b/g)]
    .map((match) => Number(match[1]))
    .filter((year) => year >= 1980 && year <= thisYear);
  if (years.length < 2) return null;

  // Ranges that look like employment, i.e. "2015 - 2019" or "2019 - present".
  const ranges = [...text.matchAll(
    /\b(19[89]\d|20[0-4]\d)\s*(?:-|–|—|to)\s*(19[89]\d|20[0-4]\d|present|current|date)\b/gi)];
  if (!ranges.length) return null;
  let earliest = thisYear;
  let latest = 0;
  for (const [, from, to] of ranges) {
    const start = Number(from);
    const end = /^\d{4}$/.test(to) ? Number(to) : thisYear;
    if (start < earliest) earliest = start;
    if (end > latest) latest = end;
  }
  const span = Math.max(0, Math.min(latest, thisYear) - earliest);
  if (span <= 0 || span > 50) return null;
  return {
    value: span,
    basis: "Years of experience were estimated from the employment dates in "
         + "your CV and may include study or career breaks.",
  };
}

/** Recognise qualifications and, where it is on the same line, the subject. */
function findQualifications(lines) {
  const found = [];
  const seen = new Set();
  for (const line of lines) {
    if (line.length > 160) continue;
    const haystack = ` ${line.toLowerCase()} `;
    for (const entry of QUALIFICATION_LEVELS) {
      const hit = entry.patterns.find((p) => containsPhrase(haystack, p));
      if (!hit) continue;
      const subject = stripLevelPrefix(subjectAfter(line, hit), entry);
      const key = `${entry.level}|${subject.toLowerCase()}`;
      if (seen.has(key)) continue;
      seen.add(key);
      found.push({ level: entry.level, subject });
      break; // one qualification per line keeps this predictable
    }
  }

  /*
   * A level on its own adds nothing once the same level has a subject.
   *
   * CVs name a qualification more than once — in a summary line, then again in
   * the education section with its subject. The bare mention produced a second
   * entry with an empty subject, so the review screen showed "BSc · BSc
   * Biomedical Science" and the reader had to work out that those were one
   * degree. Where the subject is unknown everywhere, the bare entry is kept: a
   * BSc with no subject is still worth recording.
   */
  const withSubject = new Set(found.filter((q) => q.subject).map((q) => q.level));
  const kept = found.filter((q) => q.subject || !withSubject.has(q.level));

  // Highest first, so the review screen leads with the most relevant.
  const rank = new Map(QUALIFICATION_LEVELS.map((e) => [e.level, e.rank]));
  return kept
    .sort((a, b) => (rank.get(b.level) || 0) - (rank.get(a.level) || 0))
    .slice(0, 8);
}

/**
 * Remove a restatement of the qualification from the front of its own subject.
 *
 * A CV that writes "Doctor of Business Administration (DBA) — DBA Life Science
 * Entrepreneurship" gets read from the long form, the bracketed abbreviation is
 * stripped as an aside, and the second "DBA" survives into the subject. The
 * review screen then showed "DBA DBA Life Science Entrepreneurship", which reads
 * like a parsing accident because it is one.
 *
 * Repeats until nothing more matches, because a title can restate itself more
 * than once, and matches the level name as well as its patterns so that "MSc MSc
 * Haematology" is caught alongside the spelled-out forms.
 */
function stripLevelPrefix(subject, entry) {
  const tokens = [entry.level, ...entry.patterns]
    .filter(Boolean)
    .sort((a, b) => b.length - a.length);
  let text = subject;
  for (let pass = 0; pass < 4; pass += 1) {
    const before = text;
    for (const token of tokens) {
      const escaped = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      // A lookahead rather than \b: a token ending in "." (as "d.b.a." does)
      // has no word boundary after it.
      text = text.replace(
        new RegExp(`^${escaped}(?![A-Za-z0-9])[\\s:,\\-–—]*`, "i"), "");
    }
    text = text.trim();
    if (text === before) break;
  }
  return text;
}

/** The words following a qualification token, cleaned of institutions. */
function subjectAfter(line, pattern) {
  const at = line.toLowerCase().indexOf(pattern.toLowerCase());
  let tail = line.slice(at + pattern.length);
  tail = tail
    .replace(/^[\s:,\-–—()]+/, "")
    .replace(/\(.*?\)/g, " ")
    .split(/\s+(?:at|from|university|college|school|institute)\b/i)[0]
    .split(/[,|•·–—]/)[0]
    .replace(/\b(19|20)\d{2}\b/g, " ")
    .replace(/\b(hons|honours|first class|2:1|2:2|upper second|distinction|merit|pass|grade|degree)\b/gi, " ")
    .replace(/[^A-Za-z0-9&'\-\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (tail.length < 3 || tail.length > 60) return "";
  return tail;
}

/**
 * Recognise registration and membership signals.
 *
 * `statutory` records what kind of body it is, from configuration — not a claim
 * about this person. Status stays "unknown" unless the document actually says
 * something about being registered, because a body's name appearing in a CV is
 * not evidence of current registration.
 */
function findRegistrations(text) {
  const haystack = ` ${text.toLowerCase().replace(/\s+/g, " ")} `;
  const found = [];
  for (const body of REGISTRATION_BODIES) {
    const hit = body.patterns.find((p) => containsPhrase(haystack, p));
    if (!hit) continue;
    const at = haystack.indexOf(hit.toLowerCase());
    const around = haystack.slice(Math.max(0, at - 80), at + 120);
    const claimsCurrent =
      /\b(registered|registration|registrant|member|mibms|fibms|licen[cs]ed)\b/
        .test(around);
    found.push({
      body: body.code,
      profession: "",
      status: claimsCurrent ? "current" : "unknown",
      statutory: Boolean(body.statutory),
    });
  }
  return found.slice(0, 6);
}

function findSectors(text) {
  const haystack = ` ${text.toLowerCase().replace(/\s+/g, " ")} `;
  const found = [];
  for (const [sector, phrases] of Object.entries(SECTOR_SIGNALS)) {
    if (phrases.some((phrase) => containsPhrase(haystack, phrase))) {
      found.push(sector);
    }
  }
  return found;
}

/**
 * Disciplines are the concrete specialisms named in the document — the matched
 * phrases themselves, from the application's own vocabulary.
 */
function findDisciplines(domains) {
  const wanted = ["pathology", "microbiology", "genomics", "advanced_biology",
                  "rehabilitation", "psychology", "epidemiology"];
  const out = [];
  for (const domain of wanted) {
    for (const phrase of domains.get(domain) || []) {
      if (!out.includes(phrase)) out.push(phrase);
    }
  }
  return out.slice(0, 8);
}

/** The family whose domains the evidence overlaps most. Ties resolve by name. */
function guessFamily(domains) {
  const evidenced = new Set([...domains.keys()].filter((d) => DOMAINS[d]));
  let best = { family: "", score: 0 };
  for (const [family, meta] of Object.entries(FAMILY_META)) {
    const overlap = (meta.domains || []).filter((d) => evidenced.has(d)).length;
    if (overlap > best.score
        || (overlap === best.score && overlap > 0 && family < best.family)) {
      best = { family, score: overlap };
    }
  }
  return best.score > 0 ? best.family : "";
}
