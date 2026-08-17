/**
 * Helix test suite.
 *
 * Runs in the browser, because that is where the application runs: the document
 * parsers need real File objects, and the storage guarantees need a real
 * localStorage. Open tests/index.html over http and every check runs.
 *
 * Results are also exposed on window.__results so the suite can be driven from an
 * automated browser session.
 */

import { buildCatalogue, loadCareers, sourcesFor, seniorityOf, tokenise }
  from "../js/career-data.js";
import {
  TAG_DOMAINS, DOMAINS, SYNONYMS, containsPhrase, resolveText, FAMILY_META,
  lowerLabel,
} from "../js/ontology.js";
import {
  emptyProfile, normaliseProfile, addSignal, allSignals, demoProfile,
  DEMO_PROFILES, isUsableProfile,
} from "../js/profile.js";
import {
  extractText, redactPersonalData, ProfileInterpreter,
  UnreadableDocumentError, UnsupportedFormatError,
} from "../js/cv-parser.js";
import { rankCareers, scoreCareer, groupResults, alignmentLabel, WEIGHTS,
         interestDomainsFor, CLOSEST_FROM, ADJACENT_FROM }
  from "../js/matcher.js";
import { analyseGaps } from "../js/gap-engine.js";
import { buildPathway } from "../js/pathway-engine.js";
import { nextActions } from "../js/action-engine.js";
import { normalisePack, loadRulePack } from "../js/rules.js";
import { similarity, adjacentCareers } from "../js/adjacency.js";
import * as storage from "../js/storage.js";
import * as market from "../js/market-data.js";
import * as comparison from "../js/comparison.js";
import { preferenceFit, FIT_LEVELS, SCORED_PREFERENCE_KEYS }
  from "../js/preference-fit.js";
import { transitionEffort } from "../js/transition-effort.js";
import { bridgeRoles } from "../js/bridge-engine.js";
import { buildGraph, layout, asList, NODE_WIDTH, NODE_HEIGHT }
  from "../js/career-graph.js";
import { buildTimeline, HORIZONS, horizonForDate, suggestedDate }
  from "../js/timeline-engine.js";
import { delta, shift, change, salaryDelta, differences }
  from "../js/baseline.js";
import { whyNotRecommended, standing } from "../js/why-not.js";
import * as labour from "../js/labour-market.js";
import { REGIONS, normaliseRegion, isUk } from "../js/regions.js";
import { looksScanned, textQuality } from "../js/ocr.js";
import {
  PREFERENCE_FIELDS, PREFERENCE_GROUPS, hasPreferences,
} from "../js/profile.js";

const tests = [];
const results = [];

function test(name, fn) { tests.push({ name, fn }); }

function assert(condition, message) {
  if (!condition) throw new Error(message || "assertion failed");
}
function equal(actual, expected, message) {
  if (actual !== expected) {
    throw new Error(`${message || "not equal"}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

/** Fetch a fixture as a File, the way an upload would arrive. */
async function fixture(name, type) {
  const response = await fetch(new URL(`fixtures/${name}`, import.meta.url));
  assert(response.ok, `fixture ${name} could not be loaded`);
  const blob = await response.blob();
  return new File([blob], name, { type: type || blob.type });
}

let catalogue = null;
const CV_PII = ["Jane Example", "jane.example@example.test", "07123 456789",
                "Example Diagnostics", "BS000000", "M1 2AB"];

/* ------------------------------------------------------------------ dataset */

test("the dataset loads", async () => {
  catalogue = await loadCareers();
  assert(catalogue, "no catalogue");
});

/**
 * The canonical count, as a regression test rather than a constant.
 *
 * Nothing in the application hard-codes how many careers there are — everything
 * counts what it loaded. But a silent drop from 716 to 700 would look like a
 * working application, so the expected figure is pinned here, in one place, where
 * changing it is a deliberate act with a diff attached.
 */
const CANONICAL_CAREER_COUNT = 716;

test(`the canonical dataset loads all ${CANONICAL_CAREER_COUNT} careers`, () => {
  equal(catalogue.count, CANONICAL_CAREER_COUNT,
        "the career count has moved — if this was intended, update "
        + "CANONICAL_CAREER_COUNT and say why in the commit");
  equal(catalogue.count, catalogue.meta.declaredCount,
        "loaded count differs from the count the dataset declares");
});

test("every career has a unique id, a title and a family", () => {
  const seen = new Set();
  for (const career of catalogue.careers) {
    assert(/^CP-\d{1,5}$/.test(career.id), `bad career id: ${career.id}`);
    assert(!seen.has(career.id), `duplicate career id: ${career.id}`);
    seen.add(career.id);
    assert(career.title && career.title.trim(), `${career.id} has no title`);
    assert(career.family && career.family.trim(), `${career.id} has no family`);
  }
  equal(seen.size, catalogue.count);
});

test("careers added after launch are merged into the catalogue", () => {
  /*
   * The supplied taxonomy is immutable and hash-checked, so the catalogue grows
   * through a second file rather than by editing the first. Additions start at
   * CP-701, clear of the supplied CP-001..CP-677.
   */
  const added = catalogue.careers.filter((career) => career.id >= "CP-701");
  assert(added.length > 0, "no post-launch careers were merged in");
  equal(catalogue.count, catalogue.meta.suppliedCount + catalogue.meta.addedCount,
        "the merged count does not add up");
  for (const career of added) {
    assert(/^CP-7\d\d$/.test(career.id),
           `${career.id} is outside the additions range`);
    assert(career.family && catalogue.families.includes(career.family),
           `${career.id} has an unknown family`);
  }
});

test("an addition cannot shadow a supplied career", () => {
  // Ids are unique across the merge, so a supplied record can never be replaced.
  const supplied = catalogue.careers.filter((c) => c.id <= "CP-677");
  equal(supplied.length, catalogue.meta.suppliedCount,
        "the supplied records were altered by the merge");
});

test("the careers people asked for are present, with real evidence", async () => {
  // Biotechnologist and Forensic Scientist were both missing at launch. Loading
  // the market data here rather than relying on a later test keeps this check
  // independent of the order the suite happens to run in.
  await market.loadMarketData();
  for (const title of ["Biotechnologist", "Forensic Scientist"]) {
    const found = catalogue.careers.find((career) => career.title === title);
    assert(found, `${title} is not in the catalogue`);
    const pay = market.salary(found.id);
    assert(pay, `${title} has no salary`);
    equal(pay.evidenceKey, "VERIFIED_GUIDE",
          `${title} has only a ${pay.evidenceLabel}`);
    assert(market.role(found.id).summary,
           `${title} has no attributed description`);
  }
});

test("all career ids are unique", () => {
  const ids = new Set(catalogue.careers.map((c) => c.id));
  equal(ids.size, catalogue.count, "duplicate career id");
});

test("all career titles are unique", () => {
  const titles = new Set(catalogue.careers.map((c) => c.title));
  equal(titles.size, catalogue.count, "duplicate career title");
});

test("every career has a family and a pathway depth", () => {
  for (const career of catalogue.careers) {
    assert(career.family && catalogue.families.includes(career.family),
           `${career.id} has no known family`);
    assert(["Deep", "Standard", "Explorer"].includes(career.pathway_depth),
           `${career.id} has depth ${career.pathway_depth}`);
  }
});

test("every source code resolves to the registry", () => {
  for (const career of catalogue.careers) {
    for (const source of sourcesFor(career, catalogue.sources)) {
      assert(source.known, `${career.id} cites unknown source ${source.code}`);
      assert(/^https?:\/\//.test(source.url), `${source.code} has no URL`);
    }
  }
});

test("every family has curated metadata", () => {
  for (const family of catalogue.families) {
    assert(FAMILY_META[family], `no metadata for family "${family}"`);
    assert(FAMILY_META[family].about.length > 40, `${family} has no description`);
  }
});

test("every dataset tag maps to at least one domain", () => {
  const unmapped = catalogue.tags.filter((tag) => !TAG_DOMAINS[tag]);
  equal(unmapped.length, 0, `unmapped tags: ${unmapped.join(", ")}`);
});

test("every mapped domain exists in the ontology", () => {
  for (const [tag, domains] of Object.entries(TAG_DOMAINS)) {
    for (const domain of domains) {
      assert(DOMAINS[domain], `tag "${tag}" maps to unknown domain "${domain}"`);
    }
  }
  for (const domain of Object.keys(SYNONYMS)) {
    assert(DOMAINS[domain], `synonyms for unknown domain "${domain}"`);
  }
});

test("every career derives at least two domains, so nothing is unmatchable", () => {
  const thin = catalogue.careers.filter((c) => c.derived.domains.length < 2);
  equal(thin.length, 0,
        `careers with fewer than two domains: ${thin.slice(0, 5).map((c) => c.id)}`);
});

/* ----------------------------------------------------------------- ontology */

test("phrase matching respects word boundaries", () => {
  assert(containsPhrase(" the labour market ", "labour"), "should match labour");
  assert(!containsPhrase(" the labour market ", "lab"), "'lab' matched 'labour'");
  assert(containsPhrase(" worked in the lab daily ", "lab"), "should match lab");
  assert(!containsPhrase(" said nothing ", "ai"), "'ai' matched 'said'");
});

test("longer phrases win over their own substrings", () => {
  const found = resolveText("Clinical research associate monitoring visits");
  assert(found.has("clinical_research"), "clinical research not found");
});

/* -------------------------------------------------------------- CV handling */

test("redaction removes emails, phones, postcodes and links", () => {
  const redacted = redactPersonalData(
    "Jane Example jane.example@example.test 07123 456789 M1 2AB "
    + "linkedin.com/in/jane-example");
  for (const value of ["jane.example@example.test", "07123 456789", "M1 2AB",
                       "linkedin.com"]) {
    assert(!redacted.includes(value), `${value} survived redaction`);
  }
});

test("a TXT CV is read and parsed", async () => {
  const file = await fixture("fictional-cv.txt", "text/plain");
  const { text, format } = await extractText(file);
  equal(format, "TXT");
  assert(text.includes("Biomedical Scientist"), "text not extracted");
  const { profile } = ProfileInterpreter.parse(redactPersonalData(text),
                                               { catalogue });
  assert(profile.currentRole.length > 0, "no role identified");
});

test("a DOCX CV is read", async () => {
  const file = await fixture("fictional-cv.docx",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
  const { text, format } = await extractText(file);
  equal(format, "DOCX");
  assert(text.includes("Haematology"), "DOCX text not extracted");
});

test("a text-based PDF CV is read", async () => {
  const file = await fixture("fictional-cv.pdf", "application/pdf");
  const { text, format } = await extractText(file);
  equal(format, "PDF");
  assert(text.includes("Biomedical"), "PDF text not extracted");
  assert(text.includes("ISO 15189"), "PDF body text missing");
});

test("a PDF keeps its line structure, so the parser can use it", async () => {
  // A PDF has no lines, only positioned glyph runs. Joining them all with spaces
  // produced one long line and silently lost the role and the qualifications —
  // which is the bug this test exists to catch.
  const file = await fixture("fictional-cv.pdf", "application/pdf");
  const { text } = await extractText(file);
  const lines = text.split("\n").filter(Boolean);
  assert(lines.length > 12, `only ${lines.length} lines were reconstructed`);
  const { profile } = ProfileInterpreter.parse(redactPersonalData(text),
                                               { catalogue });
  assert(/Biomedical Scientist/.test(profile.currentRole),
         `role from PDF was "${profile.currentRole}"`);
  const levels = profile.qualifications.map((q) => q.level);
  assert(levels.includes("MSc") && levels.includes("BSc"),
         `qualifications from PDF: ${levels}`);
  equal(profile.currentCareerFamily, "Healthcare Science & Diagnostics",
        "family was not inferred from the PDF");
});

test("a scanned PDF produces the fallback message, not a fake profile", async () => {
  const file = await fixture("scanned-cv.pdf", "application/pdf");
  let error = null;
  try {
    await extractText(file);
  } catch (caught) {
    error = caught;
  }
  assert(error instanceof UnreadableDocumentError,
         `expected UnreadableDocumentError, got ${error}`);
  assert(/scanned/i.test(error.message), "message does not mention scanning");
});

test("an unsupported format is refused clearly", async () => {
  const file = new File(["nonsense"], "cv.rtf", { type: "application/rtf" });
  let error = null;
  try { await extractText(file); } catch (caught) { error = caught; }
  assert(error instanceof UnsupportedFormatError, "wrong error type");
});

test("qualifications and registrations are detected", async () => {
  const file = await fixture("fictional-cv.txt", "text/plain");
  const { text } = await extractText(file);
  const { profile } = ProfileInterpreter.parse(redactPersonalData(text),
                                               { catalogue });
  const levels = profile.qualifications.map((q) => q.level);
  assert(levels.includes("MSc"), `MSc not found in ${levels}`);
  assert(levels.includes("BSc"), `BSc not found in ${levels}`);
  const bodies = profile.registrations.map((r) => r.body);
  assert(bodies.includes("HCPC"), `HCPC not found in ${bodies}`);
  assert(bodies.includes("IBMS"), `IBMS not found in ${bodies}`);
  const hcpc = profile.registrations.find((r) => r.body === "HCPC");
  const ibms = profile.registrations.find((r) => r.body === "IBMS");
  equal(hcpc.statutory, true, "HCPC should be a statutory register");
  equal(ibms.statutory, false,
        "IBMS membership must not be recorded as statutory registration");
});

test("skill signals are detected across several domains", async () => {
  const file = await fixture("fictional-cv.txt", "text/plain");
  const { text } = await extractText(file);
  const { profile } = ProfileInterpreter.parse(redactPersonalData(text),
                                               { catalogue });
  const domains = allSignals(profile).map((s) => s.domain);
  for (const expected of ["quality", "education", "leadership", "pathology"]) {
    assert(domains.includes(expected), `${expected} not detected in ${domains}`);
  }
});

test("a qualification never restates its own level in the subject", () => {
  /*
   * A CV writing "Doctor of Business Administration DBA Life Science
   * Entrepreneurship" was read from the long form, so the abbreviation that
   * followed it stayed in the subject and the review screen showed
   * "DBA DBA Life Science Entrepreneurship and Innovation Strategy".
   */
  const text = [
    "Education",
    "Doctor of Business Administration DBA Life Science Entrepreneurship "
      + "and Innovation Strategy",
    "MSc MSc Haematology",
  ].join("\n");
  const { profile } = ProfileInterpreter.parse(text, { catalogue });
  for (const qualification of profile.qualifications) {
    const shown = `${qualification.level} ${qualification.subject}`.trim();
    assert(!new RegExp(`^${qualification.level}\\s+${qualification.level}\\b`, "i")
             .test(shown),
           `qualification reads "${shown}"`);
  }
  const dba = profile.qualifications.find((q) => q.level === "DBA");
  assert(dba, "the DBA was not recognised at all");
  assert(/^Life Science/i.test(dba.subject),
         `DBA subject was "${dba.subject}"`);
});

test("a bare level is dropped once the same level has a subject", () => {
  const text = ["Education", "BSc", "BSc Biomedical Science"].join("\n");
  const { profile } = ProfileInterpreter.parse(text, { catalogue });
  const bsc = profile.qualifications.filter((q) => q.level === "BSc");
  equal(bsc.length, 1, `BSc appeared ${bsc.length} times: `
    + JSON.stringify(bsc));
  assert(bsc[0].subject, "the entry kept was the one without a subject");
});

test("a level with no subject anywhere is still kept", () => {
  const { profile } = ProfileInterpreter.parse("Education\nBSc\n",
                                               { catalogue });
  assert(profile.qualifications.some((q) => q.level === "BSc"),
         "a lone BSc was discarded");
});

test("abbreviations keep their capitals mid-sentence", () => {
  // "AI and machine learning".toLowerCase() produced an action reading
  // "Build your highest-priority gap: ai and machine learning".
  equal(lowerLabel("AI and machine learning"), "AI and machine learning");
  equal(lowerLabel("GxP and validation"), "GxP and validation");
  equal(lowerLabel("Medical devices and MedTech"), "medical devices and MedTech");
  equal(lowerLabel("Laboratory science"), "laboratory science");
  equal(lowerLabel("Quality"), "quality");
});

test("no generated action flattens an abbreviation", async () => {
  const profile = demoProfile("bms");
  for (const id of ["CP-402", "CP-428", "CP-003"]) {
    const career = catalogue.get(id);
    const pack = await loadRulePack(id);
    const match = scoreCareer(profile, career);
    const gaps = analyseGaps(profile, match, pack, catalogue.sources);
    const pathway = buildPathway(profile, match, gaps, pack, {});
    for (const action of nextActions(profile, match, gaps, pathway,
                                     { registry: catalogue.sources })) {
      const text = `${action.title} ${action.detail} ${action.why}`;
      assert(!/\bai\b/.test(text),
             `an action lowercased AI: "${action.title}"`);
      assert(!/\bgxp\b/.test(text),
             `an action lowercased GxP: "${action.title}"`);
    }
  }
});

test("the parsed profile contains no personal identifiers", async () => {
  const file = await fixture("fictional-cv.txt", "text/plain");
  const { text } = await extractText(file);
  const { profile } = ProfileInterpreter.parse(redactPersonalData(text),
                                               { catalogue });
  const serialised = JSON.stringify(profile);
  for (const value of CV_PII) {
    assert(!serialised.includes(value),
           `"${value}" reached the structured profile`);
  }
  for (const key of ["name", "email", "phone", "address", "employer"]) {
    assert(!(key in profile), `profile has a ${key} field`);
  }
});

test("the parser is deterministic", async () => {
  const file = await fixture("fictional-cv.txt", "text/plain");
  const { text } = await extractText(file);
  const first = ProfileInterpreter.parse(text, { catalogue }).profile;
  const second = ProfileInterpreter.parse(text, { catalogue }).profile;
  equal(JSON.stringify({ ...first, createdAt: null }),
        JSON.stringify({ ...second, createdAt: null }),
        "two parses of the same text differ");
});

/* ----------------------------------------------------------------- matching */

test("the component weights sum to 100", () => {
  const total = Object.values(WEIGHTS).reduce((sum, value) => sum + value, 0);
  equal(total, 100);
});

test("every career is scored, and the ranking is reproducible", () => {
  const profile = demoProfile("bms");
  const first = rankCareers(profile, catalogue.careers);
  const second = rankCareers(profile, catalogue.careers);
  equal(first.length, catalogue.count, "not every career was scored");
  equal(first.map((m) => m.careerId).join(","),
        second.map((m) => m.careerId).join(","), "ranking is not stable");
  for (const match of first) {
    assert(match.score >= 0 && match.score <= 100,
           `${match.careerId} scored ${match.score}`);
  }
});

test("a biomedical scientist's own career ranks near the top", () => {
  const ranked = rankCareers(demoProfile("bms"), catalogue.careers);
  const top = ranked.slice(0, 30).map((m) => m.career.title);
  assert(top.some((title) => /Biomedical Scientist/.test(title)),
         `no biomedical scientist role in the top 30: ${top.slice(0, 5)}`);
});

test("results group into buckets with family variety", () => {
  const ranked = rankCareers(demoProfile("postdoc"), catalogue.careers);
  const groups = groupResults(ranked);
  for (const key of ["closest", "adjacent", "pivots"]) {
    assert(groups[key].items.length >= 4,
           `${key} produced only ${groups[key].items.length} careers`);
  }
  const families = new Set(groups.pivots.items.map((m) => m.career.family));
  equal(families.size, groups.pivots.items.length,
        "the pivots group repeats a career family");
});

test("labels never claim a probability", () => {
  for (const score of [0, 34, 35, 54, 55, 74, 75, 100]) {
    const band = alignmentLabel(score);
    assert(!/%|chance|probability|likelihood/i.test(band.label),
           `label "${band.label}" implies a prediction`);
  }
});

/* -------------------------------------------------- requirements and gaps */

test("a regulated career always raises an official-confirmation item", async () => {
  const profile = demoProfile("postdoc");
  const regulated = catalogue.careers.filter((c) => c.derived.regulated);
  assert(regulated.length > 100, "expected many regulated careers");
  for (const career of regulated.slice(0, 40)) {
    const match = scoreCareer(profile, career);
    const gaps = analyseGaps(profile, match, null, catalogue.sources);
    assert(gaps.requiresOfficialConfirmation,
           `${career.id} (${career.title}) raised no confirmation requirement`);
  }
});

test("a strong score never hides a mandatory requirement", () => {
  // The registered radiographer profile scores well against regulated careers in
  // its own family; the requirement must still be raised.
  const profile = demoProfile("clinical_pivot");
  const ranked = rankCareers(profile, catalogue.careers);
  const strongRegulated = ranked
    .filter((m) => m.score >= 60 && m.career.derived.regulated)
    .slice(0, 15);
  assert(strongRegulated.length > 0, "no strongly aligned regulated careers");
  for (const match of strongRegulated) {
    const gaps = analyseGaps(profile, match, null, catalogue.sources);
    assert(gaps.requiresOfficialConfirmation,
           `${match.career.title} scored ${match.score} with no requirement shown`);
  }
});

test("no career reports a verified requirement without a verified pack", async () => {
  const profile = demoProfile("bms");
  for (const id of ["CP-003", "CP-019", "CP-272", "CP-401"]) {
    const career = catalogue.get(id);
    const pack = await loadRulePack(id);
    const gaps = analyseGaps(profile, scoreCareer(profile, career), pack,
                             catalogue.sources);
    if (!(pack && pack.requirementsVerified)) {
      equal(gaps.verifiedRequirements.length, 0,
            `${id} asserted a verified requirement without a verified pack`);
    }
  }
});

test("an unverified pack cannot smuggle in a required item", () => {
  const pack = normalisePack("CP-999", {
    requirementsVerified: false,
    required: [{ id: "x", title: "Must hold a licence", detail: "" }],
  });
  equal(pack.required.length, 0, "unverified required item was kept");
  equal(pack.usuallyExpected.length, 1, "the item was lost rather than demoted");
  equal(pack.usuallyExpected[0].demotedFromRequired, true, "not marked demoted");
});

test("a verified pack may contribute required items", () => {
  const pack = normalisePack("CP-999", {
    requirementsVerified: true,
    verifiedDate: "2026-01-01",
    required: [{ id: "x", title: "Must hold a licence", detail: "" }],
  });
  equal(pack.required.length, 1, "verified required item was dropped");
});

test("gaps say 'not identified', never 'you do not have'", () => {
  const profile = demoProfile("graduate");
  const career = catalogue.get("CP-510");
  const gaps = analyseGaps(profile, scoreCareer(profile, career), null,
                           catalogue.sources);
  const text = gaps.items.map((item) => `${item.title} ${item.detail}`).join(" ");
  assert(/not identified/i.test(text), "no 'not identified' wording found");
  assert(!/you (do not|don't) have/i.test(text), "deficit wording found");
});

test("a stated interest is never treated as demonstrated evidence", async () => {
  // The postdoc demo declares an interest in clinical research but has no GCP
  // evidence. Interests contribute a little to the score by design; they must not
  // make the product tell somebody they already hold something.
  const profile = demoProfile("postdoc");
  assert(profile.careerInterests.includes("clinical_research"),
         "fixture no longer declares the interest this test needs");
  assert(!allSignals(profile).some((s) => s.domain === "gcp"),
         "fixture unexpectedly has GCP evidence");

  const career = catalogue.get("CP-272");
  const match = scoreCareer(profile, career);
  assert(!match.matchedDomains.includes("gcp"),
         "an interest was reported as a matched (held) domain");

  const pack = await loadRulePack("CP-272");
  const gaps = analyseGaps(profile, match, pack, catalogue.sources);
  const gcpItem = gaps.items.find((item) => item.id === "gcp_training");
  assert(gcpItem, "the GCP pack item is missing");
  assert(gcpItem.status !== "demonstrated",
         "GCP was marked demonstrated on the strength of an interest alone");
});

test("a pack requirement outside the career's tags is judged on the whole profile", async () => {
  // CP-003's dataset tags say nothing about quality, but its pack expects work
  // inside an accredited quality system — and the experienced BMS profile clearly
  // evidences that. Judging pack items against the career's tags alone reported it
  // as missing, which is the bug this test pins down.
  const withQuality = demoProfile("bms");
  const withoutQuality = demoProfile("postdoc");
  const career = catalogue.get("CP-003");
  const pack = await loadRulePack("CP-003");

  const heldStatus = analyseGaps(withQuality, scoreCareer(withQuality, career),
    pack, catalogue.sources).items.find((i) => i.id === "quality_systems").status;
  const missingStatus = analyseGaps(withoutQuality,
    scoreCareer(withoutQuality, career), pack, catalogue.sources)
    .items.find((i) => i.id === "quality_systems").status;

  equal(heldStatus, "demonstrated",
        "quality experience the profile has was reported as missing");
  equal(missingStatus, "action_required",
        "quality experience the profile lacks was reported as held");
});

test("researched pack items outrank gaps inferred from dataset tags", async () => {
  // Somebody targeting a CRA role without GCP training should be told about GCP
  // first, whatever they said their priorities were.
  const profile = demoProfile("bms");
  const career = catalogue.get("CP-272");
  const pack = await loadRulePack("CP-272");
  const match = scoreCareer(profile, career);
  const gaps = analyseGaps(profile, match, pack, catalogue.sources);
  const pathway = buildPathway(profile, match, gaps, pack, {});
  const actions = nextActions(profile, match, gaps, pathway,
                              { registry: catalogue.sources });
  assert(/Good Clinical Practice/i.test(actions[0].title),
         `first action was "${actions[0].title}"`);
});

test("development goals carry stable ids for a future CPD tool", () => {
  const profile = demoProfile("graduate");
  const career = catalogue.get("CP-272");
  const gaps = analyseGaps(profile, scoreCareer(profile, career), null,
                           catalogue.sources);
  for (const goal of gaps.developmentGoals) {
    assert(goal.id && goal.domain && goal.targetCareerId === "CP-272",
           `malformed goal ${JSON.stringify(goal)}`);
  }
});

/* --------------------------------------------------------- pathway and actions */

test("every career can generate a pathway", async () => {
  const profile = demoProfile("bms");
  // A sample across all three depths and every family.
  const sample = [];
  const seen = new Set();
  for (const career of catalogue.careers) {
    const key = `${career.family}|${career.pathway_depth}`;
    if (seen.has(key)) continue;
    seen.add(key);
    sample.push(career);
  }
  assert(sample.length >= 30, `sample too small: ${sample.length}`);
  for (const career of sample) {
    const match = scoreCareer(profile, career);
    const gaps = analyseGaps(profile, match, null, catalogue.sources);
    const pathway = buildPathway(profile, match, gaps, null, {});
    assert(pathway.nodes.length >= 3,
           `${career.id} produced ${pathway.nodes.length} nodes`);
    equal(pathway.nodes[0].title,
          profile.currentRole || "Your current position",
          "the pathway does not start from the user");
    assert(pathway.nodes[pathway.nodes.length - 1].title === career.title,
           `${career.id} pathway does not end at the career`);
  }
});

test("a researched pack is used when one exists", async () => {
  const profile = demoProfile("postdoc");
  const career = catalogue.get("CP-272");
  const pack = await loadRulePack("CP-272");
  assert(pack, "the CP-272 pack did not load");
  const match = scoreCareer(profile, career);
  const gaps = analyseGaps(profile, match, pack, catalogue.sources);
  const pathway = buildPathway(profile, match, gaps, pack, {});
  equal(pathway.fromRulePack, true, "pack milestones were not used");
  assert(pathway.milestones.some((m) => /GCP/i.test(m.title)),
         "the GCP milestone is missing");
});

test("exactly three actions are produced, for any career", async () => {
  const profile = demoProfile("clinical_pivot");
  for (const id of ["CP-003", "CP-272", "CP-401", "CP-510", "CP-092"]) {
    const career = catalogue.get(id);
    const pack = await loadRulePack(id);
    const match = scoreCareer(profile, career);
    const gaps = analyseGaps(profile, match, pack, catalogue.sources);
    const pathway = buildPathway(profile, match, gaps, pack, {});
    const actions = nextActions(profile, match, gaps, pathway,
                               { registry: catalogue.sources });
    equal(actions.length, 3, `${id} produced ${actions.length} actions`);
    for (const action of actions) {
      assert(action.title && action.detail && action.why,
             `${id} action ${action.id} is incomplete`);
    }
  }
});

test("a regulated career puts verification first", async () => {
  const profile = demoProfile("postdoc");
  const career = catalogue.get("CP-003");
  const pack = await loadRulePack("CP-003");
  const match = scoreCareer(profile, career);
  const gaps = analyseGaps(profile, match, pack, catalogue.sources);
  const pathway = buildPathway(profile, match, gaps, pack, {});
  const actions = nextActions(profile, match, gaps, pathway,
                              { registry: catalogue.sources });
  assert(/verify|confirm/i.test(actions[0].title),
         `first action was "${actions[0].title}"`);
});

test("milestone progress is applied to the pathway", async () => {
  const profile = demoProfile("bms");
  const career = catalogue.get("CP-272");
  const pack = await loadRulePack("CP-272");
  const match = scoreCareer(profile, career);
  const gaps = analyseGaps(profile, match, pack, catalogue.sources);
  const before = buildPathway(profile, match, gaps, pack, {});
  const target = before.milestones[0].id;
  const after = buildPathway(profile, match, gaps, pack,
                             { [target]: "completed" });
  const node = after.milestones.find((m) => m.id === target);
  equal(node.status, "completed", "progress was not applied");
  assert(after.completion.done > 0, "completion count did not move");
});

/* ------------------------------------------------------------ adjacency */

test("adjacency is symmetric and excludes the career itself", () => {
  const a = catalogue.get("CP-003");
  const b = catalogue.get("CP-044");
  const forward = similarity(a, b);
  const back = similarity(b, a);
  assert(Math.abs(forward - back) < 1e-9, "similarity is not symmetric");
  const neighbours = adjacentCareers(a, catalogue.careers, { limit: 6 });
  assert(!neighbours.some((item) => item.career.id === a.id),
         "a career is adjacent to itself");
  equal(neighbours.length, 6, "wrong number of neighbours");
});

test("pivots come from a different family", () => {
  const career = catalogue.get("CP-003");
  const pivots = adjacentCareers(career, catalogue.careers,
                                 { mode: "pivot", limit: 4 });
  for (const item of pivots) {
    assert(item.career.family !== career.family,
           `${item.career.title} is in the same family`);
  }
});

/* -------------------------------------------------------------- storage */

test("storage is available in this browser", () => {
  assert(storage.storageAvailable(), "localStorage is not available");
});

test("raw CV text is never written to storage", async () => {
  storage.reset();
  const file = await fixture("fictional-cv.txt", "text/plain");
  const { text } = await extractText(file);
  const { profile } = ProfileInterpreter.parse(redactPersonalData(text),
                                               { catalogue });
  const state = storage.emptyState();
  state.profile = profile;
  state.savedCareerIds = ["CP-272"];
  state.progress = { "CP-272": { gcp: "completed" } };
  storage.save(state, catalogue.meta.version);

  const stored = storage.rawStoredValue();
  assert(stored.length > 0, "nothing was stored");
  for (const value of CV_PII) {
    assert(!stored.includes(value), `"${value}" was written to localStorage`);
  }
  // Also check no long verbatim run of the CV survived.
  const sentence = "Led the internal audit programme against ISO 15189";
  assert(!stored.includes(sentence), "a CV sentence was written to localStorage");
});

test("storage drops unknown fields, including injected personal ones", () => {
  storage.reset();
  const state = storage.emptyState();
  state.profile = { ...emptyProfile(), currentRole: "Analyst",
                    name: "Jane Example", email: "jane.example@example.test" };
  const written = storage.save(state, "1.0");
  assert(!("name" in written.profile), "an injected name field survived");
  assert(!("email" in written.profile), "an injected email field survived");
  assert(!storage.rawStoredValue().includes("Jane Example"),
         "injected personal data reached storage");
});

test("progress survives a save and load cycle, and reset clears it", () => {
  storage.reset();
  const state = storage.emptyState();
  state.profile = demoProfile("bms");
  state.targetCareerId = "CP-272";
  state.progress = { "CP-272": { gcp: "in_progress", bridge: "completed" } };
  storage.save(state, catalogue.meta.version);

  const loaded = storage.load();
  equal(loaded.targetCareerId, "CP-272");
  equal(loaded.progress["CP-272"].bridge, "completed");
  equal(loaded.datasetVersion, catalogue.meta.version,
        "the dataset version was not recorded");

  const afterReset = storage.reset();
  equal(afterReset.profile, null, "reset left a profile behind");
  equal(storage.rawStoredValue(), "", "reset left data in storage");
});

test("a corrupt or hostile saved state is repaired, not fatal", () => {
  window.localStorage.setItem("careerpath.v1", "{not json");
  equal(storage.load().profile, null, "corrupt state was not handled");
  window.localStorage.setItem("careerpath.v1", JSON.stringify({
    profile: { currentRole: 42, qualifications: "nope" },
    savedCareerIds: ["CP-001", "../../etc/passwd", 7],
    progress: { "CP-001": { "bad id": "completed", ok: "nonsense" } },
  }));
  const loaded = storage.load();
  equal(loaded.savedCareerIds.length, 1, "an invalid career id was accepted");
  equal(loaded.progress["CP-001"], undefined,
        "invalid progress entries were accepted");
  storage.reset();
});

test("import round-trips an export", async () => {
  storage.reset();
  const state = storage.emptyState();
  state.profile = demoProfile("graduate");
  state.savedCareerIds = ["CP-003", "CP-272"];
  const payload = {
    application: "Helix", datasetVersion: "1.0", state,
  };
  const file = new File([JSON.stringify(payload)], "export.json",
                        { type: "application/json" });
  const { state: imported } = await storage.importState(file);
  equal(imported.savedCareerIds.length, 2, "saved careers did not survive");
  equal(imported.profile.currentRole, state.profile.currentRole,
        "the profile did not survive");
  storage.reset();
});

test("importing rubbish fails with a readable message", async () => {
  const file = new File(["not json at all"], "x.json",
                        { type: "application/json" });
  let error = null;
  try { await storage.importState(file); } catch (caught) { error = caught; }
  assert(error && /not valid JSON/i.test(error.message),
         `unhelpful error: ${error && error.message}`);
});

/* ----------------------------------------------------------------- profiles */

test("all four demonstration profiles are usable and fictional", () => {
  equal(DEMO_PROFILES.length, 4);
  for (const demo of DEMO_PROFILES) {
    const profile = demoProfile(demo.id);
    assert(isUsableProfile(profile), `${demo.id} is not usable`);
    equal(profile.source, "demo", `${demo.id} is not marked as a demo`);
    const ranked = rankCareers(profile, catalogue.careers);
    assert(ranked[0].score > 30,
           `${demo.id} produced a top score of only ${ranked[0].score}`);
  }
});

test("a manually built profile matches as well as a parsed one", () => {
  const manual = emptyProfile();
  manual.currentRole = "Senior Biomedical Scientist";
  manual.currentCareerFamily = "Healthcare Science & Diagnostics";
  manual.yearsExperience = 9;
  manual.qualifications = [{ level: "MSc", subject: "Haematology" }];
  manual.sectors = ["healthcare", "diagnostic laboratory"];
  addSignal(manual, "laboratory_science", []);
  addSignal(manual, "quality", []);
  addSignal(manual, "pathology", []);
  const ranked = rankCareers(normaliseProfile(manual), catalogue.careers);
  assert(ranked[0].score >= 50,
         `manual profile only reached ${ranked[0].score}`);
});

/* ----------------------------------------------------------- market data */

let marketLoaded = false;

test("the market data loads", async () => {
  await market.loadMarketData();
  const state = market.status();
  assert(state.ok, `market data did not load: ${state.detail}`);
  marketLoaded = true;
});

test("there is exactly one market record for every career", () => {
  assert(marketLoaded, "market data is not loaded");
  equal(market.status().count, catalogue.count,
        "market record count differs from the career count");
  for (const career of catalogue.careers) {
    assert(market.forCareer(career.id),
           `${career.id} (${career.title}) has no market record`);
  }
});

test("every career has a usable published salary", () => {
  // §58's completeness assertion, run in the browser against the served file.
  for (const career of catalogue.careers) {
    const pay = market.salary(career.id);
    assert(pay, `${career.id} has no salary`);
    assert(Number.isFinite(pay.low) && Number.isFinite(pay.high),
           `${career.id} salary is not numeric`);
    assert(pay.low > 0, `${career.id} low is ${pay.low}`);
    assert(pay.high >= pay.low, `${career.id} high is below low`);
    assert(pay.evidenceKey !== "PENDING", `${career.id} is PENDING`);
    assert(pay.method, `${career.id} has no estimate method`);
    assert(pay.sources.length > 0 || pay.notes.length > 0,
           `${career.id} has neither a source nor methodology notes`);
    assert(pay.geography, `${career.id} has no geography`);
    assert(pay.lastVerified, `${career.id} has no last-verified date`);
  }
});

test("every evidence class maps to a label the interface can show", () => {
  for (const career of catalogue.careers) {
    const pay = market.salary(career.id);
    assert(market.EVIDENCE[pay.evidenceKey],
           `${career.id} has unknown evidence class ${pay.evidenceKey}`);
    assert(pay.evidenceLabel && pay.evidenceExplain,
           `${pay.evidenceKey} has no user-facing wording`);
  }
});

test("no salary label uses the word verified in a way that promises pay", () => {
  for (const entry of Object.values(market.EVIDENCE)) {
    assert(!/guarantee|promised|will earn/i.test(entry.label + entry.explain),
           `"${entry.label}" implies a guarantee`);
  }
});

test("a derived salary always says what it was derived from", () => {
  for (const career of catalogue.careers) {
    const pay = market.salary(career.id);
    if (pay.method !== "related_career_derived") continue;
    assert(pay.derivedFrom.length > 0,
           `${career.id} is derived but names no contributing careers`);
  }
});

test("a career-specific guide always carries a source record", () => {
  for (const career of catalogue.careers) {
    const pay = market.salary(career.id);
    if (pay.evidenceKey !== "VERIFIED_GUIDE") continue;
    assert(pay.sources.length > 0,
           `${career.id} claims a career-specific guide with no source`);
  }
});

test("money formatting avoids false precision", () => {
  equal(market.money(30000), "£30k");
  equal(market.money(53000), "£53k");
  equal(market.money(30500), "£30,500");
  equal(market.money(NaN), "—");
});

test("hours are absent rather than invented", () => {
  // Only the careers with a matched official profile have hours. The rest must
  // return null so the interface can say "Not yet available".
  let withHours = 0;
  for (const career of catalogue.careers) {
    const work = market.workLife(career.id);
    assert(work, `${career.id} has no work-life record`);
    if (work.hours === null) continue;
    withHours += 1;
    assert(Number.isFinite(work.hoursMin) && Number.isFinite(work.hoursMax),
           `${career.id} reports hours text without numbers`);
  }
  assert(withHours > 0 && withHours < catalogue.count,
         `${withHours} careers have hours — expected some but not all`);
});

test("every career has a description of its own", () => {
  // The family paragraph was the same words across fifty careers. Every career
  // now carries either a sourced description or one composed from its own
  // recorded attributes, and the two are never confusable.
  for (const career of catalogue.careers) {
    const role = market.role(career.id);
    assert(role, `${career.id} has no role record`);
    const text = role.summary || role.composedSummary;
    assert(text, `${career.id} has no description`);
    if (role.summary) {
      equal(role.summaryKind, "authoritative", `${career.id} kind mismatch`);
    } else {
      equal(role.summaryKind, "taxonomy_composed",
            `${career.id} has a composed description with the wrong kind`);
      assert(role.summaryNote,
             `${career.id} shows composed text with nothing saying so`);
      assert(text.includes(career.title),
             `${career.id} composed description does not name its career`);
    }
  }
});

test("a composed description is never exposed as a sourced one", () => {
  /*
   * `summary` is what the attribution line and the sources panel read, so it
   * must stay empty unless somebody actually published the words. A composed
   * description lives in its own field that a caller has to ask for by name.
   */
  let composed = 0;
  for (const career of catalogue.careers) {
    const role = market.role(career.id);
    if (role.summaryKind === "taxonomy_composed") {
      composed += 1;
      equal(role.summary, null,
            `${career.id} exposes composed text as a sourced summary`);
      equal(role.sources.length, 0,
            `${career.id} attributes a composed description to a source`);
    } else {
      equal(role.composedSummary, null,
            `${career.id} carries both a sourced and a composed description`);
    }
  }
  assert(composed > 0, "no composed descriptions were found at all");
});

test("an authoritative role summary is only ever shown when attributed", () => {
  for (const career of catalogue.careers) {
    const role = market.role(career.id);
    if (!role || !role.summary) continue;
    equal(role.summaryKind, "authoritative",
          `${career.id} exposes a summary that is not authoritative`);
    assert(role.sources.length > 0,
           `${career.id} has an authoritative summary with no source`);
  }
});

test("further-reading links are links, and carry no borrowed content", () => {
  /*
   * NHS England reserves all rights in the Health Careers profiles and limits
   * use to personal viewing, while explicitly permitting links. So Helix stores
   * a URL and nothing else — not even the page's title. This test is the line
   * that keeps it that way.
   */
  let linked = 0;
  for (const career of catalogue.careers) {
    const role = market.role(career.id);
    if (!role || !role.externalProfiles.length) continue;
    linked += 1;
    for (const entry of role.externalProfiles) {
      assert(entry.source_url.startsWith("https://"),
             `${career.id} external profile is not an https URL`);
      assert(entry.provider, `${career.id} external profile names no provider`);
      assert(entry.content_reproduced === false,
             `${career.id} external profile claims content is reproduced`);
      for (const field of ["summary", "description", "title", "tasks", "text"]) {
        assert(!(field in entry),
               `${career.id} external profile carries a "${field}" field`);
      }
    }
  }
  assert(linked > 0, "no career carries a further-reading link");
});

test("an external link is never used as the role description", () => {
  for (const career of catalogue.careers) {
    const role = market.role(career.id);
    if (!role || !role.summary) continue;
    for (const source of role.sources) {
      assert(!String(source.source_url || "").includes("healthcareers.nhs.uk"),
             `${career.id} attributes its description to a source whose content `
             + `may not be reproduced`);
    }
  }
});

test("no role summary carries page furniture", () => {
  for (const career of catalogue.careers) {
    const role = market.role(career.id);
    if (!role || !role.summary) continue;
    for (const fragment of ["Alternative titles", "Skip to main content",
                            "Explore careers", "Average salary"]) {
      assert(!role.summary.includes(fragment),
             `${career.id} summary contains "${fragment}"`);
    }
  }
});

/* -------------------------------------------------------------- comparison */

test("comparison holds between two and four careers", () => {
  equal(comparison.MIN_COMPARE, 2);
  equal(comparison.MAX_COMPARE, 4);
  let ids = [];
  for (const id of ["CP-003", "CP-019", "CP-272", "CP-001"]) {
    ids = comparison.toggle(ids, id).ids;
  }
  equal(ids.length, 4, "four careers were not accepted");
  const fifth = comparison.toggle(ids, "CP-092");
  equal(fifth.action, "full", "a fifth career was accepted");
  equal(fifth.ids.length, 4, "the selection changed when it should not have");
  assert(fifth.message, "the refusal came with no explanation");
});

test("removing and clearing a comparison works", () => {
  let ids = ["CP-003", "CP-019"];
  const removed = comparison.toggle(ids, "CP-003");
  equal(removed.action, "removed");
  equal(removed.ids.join(","), "CP-019");
  equal(comparison.canCompare(removed.ids), false, "one career is not a comparison");
  equal(comparison.canCompare(["CP-003", "CP-019"]), true);
});

test("a comparison route round-trips, and carries career ids only", () => {
  const ids = ["CP-003", "CP-019", "CP-272"];
  const route = comparison.routeFor(ids);
  equal(route, "/compare/CP-003,CP-019,CP-272");
  equal(comparison.idsFromRoute("CP-003,CP-019,CP-272").join(","), ids.join(","));
  // Nothing personal may appear in a shareable link.
  assert(!/profile|preference|name|email/i.test(route),
         "the compare route carries more than career ids");
});

test("a hostile comparison route cannot inject anything", () => {
  const ids = comparison.idsFromRoute("CP-003,../../etc/passwd,<script>,CP-019");
  equal(ids.join(","), "CP-003,CP-019", "an invalid id survived");
  equal(comparison.idsFromRoute("").length, 0);
});

test("comparison selection survives a save and load cycle", () => {
  storage.reset();
  const state = storage.emptyState();
  state.compareCareerIds = ["CP-003", "CP-019"];
  storage.save(state, catalogue.meta.version);
  equal(storage.load().compareCareerIds.join(","), "CP-003,CP-019",
        "the comparison selection was lost");
  storage.reset();
});

test("state saved before Compare existed still loads, and keeps its careers", () => {
  storage.reset();
  window.localStorage.setItem("careerpath.v1", JSON.stringify({
    schema: 1, profile: demoProfile("bms"), savedCareerIds: ["CP-003"],
    progress: { "CP-272": { gcp: "completed" } },
    // No compareCareerIds at all — the shape of state written by an earlier
    // version. A migration must add the field, never discard the profile.
  }));
  const loaded = storage.load();
  assert(loaded.profile, "the profile was discarded by the migration");
  equal(loaded.savedCareerIds.join(","), "CP-003", "saved careers were lost");
  equal(loaded.progress["CP-272"].gcp, "completed", "progress was lost");
  equal(loaded.compareCareerIds.length, 0, "compare should default to empty");
  storage.reset();
});

test("what stands out reports only what the data supports", () => {
  const entries = ["CP-003", "CP-019"].map((id) => ({
    career: catalogue.get(id),
    salary: market.salary(id),
    work: market.workLife(id),
  }));
  const notes = comparison.standoutSummary(entries);
  assert(notes.length > 0, "no observations were produced");
  for (const note of notes) {
    assert(!/\bbest\b|\bworst\b|you should/i.test(note.text),
           `an observation named a best career: "${note.text}"`);
  }
  equal(comparison.standoutSummary(entries.slice(0, 1)).length, 0,
        "a single career produced comparison observations");
});

/* -------------------------------------------------------------- preferences */

test("preferences are optional, and absent ones are not scored", () => {
  const profile = demoProfile("bms");
  equal(hasPreferences(profile), false,
        "a fresh demo profile reports stated preferences");
  const fit = preferenceFit(profile, catalogue.get("CP-003"));
  equal(fit.scored, false, "a career was scored with no preferences stated");
  equal(fit.key, "unknown");
  equal(fit.label, FIT_LEVELS.unknown.label);
  equal(fit.score, null, "an unscored result carried a number");
});

test("every preference question has a scoring rule behind it", () => {
  // A question whose answer is never used is a question that should not be
  // asked. openToSectorChange is asked for context and is not a fit dimension.
  const scored = new Set(SCORED_PREFERENCE_KEYS);
  for (const field of PREFERENCE_FIELDS) {
    if (field.key === "openToSectorChange") continue;
    assert(scored.has(field.key),
           `"${field.question}" is asked but never scored`);
  }
  for (const field of PREFERENCE_FIELDS) {
    assert(PREFERENCE_GROUPS.some((group) => group.id === field.group),
           `${field.key} is in unknown group "${field.group}"`);
    assert(field.options.length >= 2, `${field.key} has too few options`);
  }
});

test("preference fit is deterministic", () => {
  const profile = withPreferences({ salaryTarget: 50000, patientContact: "avoid",
                                    laboratoryWork: "seek" });
  const career = catalogue.get("CP-003");
  equal(JSON.stringify(preferenceFit(profile, career)),
        JSON.stringify(preferenceFit(profile, career)),
        "two identical calls produced different results");
});

test("changing preferences never changes background alignment", () => {
  // The separation §31 requires, tested directly. Alignment answers "how much of
  // this do I already do"; preferences answer "would I want it". Blending them
  // is what this test exists to prevent regressing.
  const base = demoProfile("bms");
  const before = rankCareers(base, catalogue.careers)
    .map((m) => `${m.careerId}:${m.score}`).join(",");

  for (const preferences of [
    { patientContact: "avoid", laboratoryWork: "seek" },
    { patientContact: "seek", laboratoryWork: "avoid" },
    { salaryTarget: 100000, earningsImportance: "high", remoteWorking: "important",
      travelTolerance: "minimal", researchWork: "avoid", commercialWork: "seek",
      leadershipWork: "seek", workLifeBalance: "high",
      unsocialHours: "prefer_standard", retrainingTolerance: "minimal" },
  ]) {
    const after = rankCareers(withPreferences(preferences), catalogue.careers)
      .map((m) => `${m.careerId}:${m.score}`).join(",");
    equal(after, before,
          `alignment moved when preferences changed: ${JSON.stringify(preferences)}`);
  }
});

test("a career is never penalised for data Helix does not hold", () => {
  /*
   * The rule that makes normalising over available dimensions honest. Two
   * careers with identical values on the dimensions they share must score the
   * same, whether or not one of them also has hours and working-pattern data.
   */
  const profile = withPreferences({ patientContact: "avoid",
                                    laboratoryWork: "seek",
                                    workLifeBalance: "high",
                                    unsocialHours: "prefer_standard" });

  const withHours = catalogue.careers.filter((career) => {
    const work = market.workLife(career.id);
    return work && work.hours && work.patterns.length;
  });
  const withoutHours = catalogue.careers.filter((career) => {
    const work = market.workLife(career.id);
    return work && !work.hours && !work.patterns.length;
  });
  assert(withHours.length && withoutHours.length,
         "the dataset no longer contains both kinds of career");

  for (const career of withoutHours.slice(0, 40)) {
    const fit = preferenceFit(profile, career);
    // The two dimensions Helix cannot answer are absent, not scored as zero.
    const keys = fit.dimensions.map((d) => d.key);
    assert(!keys.includes("hours") && !keys.includes("pattern"),
           `${career.id} was scored on data it does not have`);
    assert(fit.unscored.some((item) => item.key === "hours"),
           `${career.id} did not report hours as unscored`);
  }

  // Directly: the same career, with and without its hours data available.
  const sample = withoutHours[0];
  const fit = preferenceFit(profile, sample);
  const contributions = fit.dimensions.map((d) => d.score);
  assert(contributions.every((score) => score > 0),
         "a missing dimension contributed a zero");
});

test("preference fit rises and falls with what was asked for", () => {
  const laboratory = catalogue.careers.find((career) =>
    market.workLife(career.id).laboratory === "high"
    && market.workLife(career.id).patientContact === "low");
  assert(laboratory, "no laboratory career with low patient contact");

  const wantsLab = preferenceFit(
    withPreferences({ laboratoryWork: "seek", patientContact: "avoid" }),
    laboratory);
  const avoidsLab = preferenceFit(
    withPreferences({ laboratoryWork: "avoid", patientContact: "seek" }),
    laboratory);

  assert(wantsLab.score > avoidsLab.score,
         `wanting the career's own characteristics scored ${wantsLab.score} `
         + `against ${avoidsLab.score} for wanting the opposite`);
  assert(wantsLab.reasons.length > 0, "a strong fit gave no reasons");
  assert(avoidsLab.mismatches.length > 0, "a poor fit named no mismatch");
});

test("a salary target is scored against the published range", () => {
  const career = catalogue.get("CP-003");
  const pay = market.salary(career.id);
  const reachable = preferenceFit(
    withPreferences({ salaryTarget: 30000, earningsImportance: "high" }), career);
  const unreachable = preferenceFit(
    withPreferences({ salaryTarget: 100000, earningsImportance: "high" }), career);
  assert(pay.high < 100000, "fixture assumption no longer holds");
  assert(reachable.score > unreachable.score,
         "a reachable target did not score above an unreachable one");
});

test("preference fit never claims a probability", () => {
  const profile = withPreferences({ laboratoryWork: "seek", salaryTarget: 40000 });
  for (const career of catalogue.careers.slice(0, 60)) {
    const fit = preferenceFit(profile, career);
    const words = `${fit.label} ${fit.summary} ${fit.explain}`;
    assert(!/%|chance|probability|likelihood|will get|guarantee/i.test(words),
           `preference wording implies a prediction: "${words}"`);
  }
  for (const level of Object.values(FIT_LEVELS)) {
    assert(!/%|chance|probability/i.test(level.label),
           `"${level.label}" implies a prediction`);
  }
});

test("preference fit is bounded and banded consistently", () => {
  const profile = withPreferences({ laboratoryWork: "seek", patientContact: "avoid",
                                    remoteWorking: "important",
                                    salaryTarget: 40000 });
  for (const career of catalogue.careers) {
    const fit = preferenceFit(profile, career);
    if (!fit.scored) continue;
    assert(fit.score >= 0 && fit.score <= 1,
           `${career.id} scored ${fit.score}`);
    const expected = fit.score >= 0.8 ? "very_strong"
      : fit.score >= 0.65 ? "strong"
      : fit.score >= 0.45 ? "mixed" : "low";
    equal(fit.key, expected, `${career.id} scored ${fit.score} but banded as `
      + `${fit.key}`);
  }
});

test("retraining tolerance is scored only when the effort is known", () => {
  const profile = withPreferences({ retrainingTolerance: "minimal" });
  const career = catalogue.get("CP-003");

  const withoutEffort = preferenceFit(profile, career);
  assert(!withoutEffort.dimensions.some((d) => d.key === "retraining"),
         "retraining was scored with no transition effort available");
  assert(withoutEffort.unscored.some((item) => item.key === "retraining"),
         "retraining was not reported as unscored");

  const match = scoreCareer(profile, career);
  const gaps = analyseGaps(profile, match, null, catalogue.sources);
  const effort = transitionEffort(profile, match, gaps);
  const withEffort = preferenceFit(profile, career, { effort });
  assert(withEffort.dimensions.some((d) => d.key === "retraining"),
         "retraining was not scored when the effort was supplied");
});

test("preferences survive storage, and carry no personal data", () => {
  storage.reset();
  const state = storage.emptyState();
  state.profile = withPreferences({ salaryTarget: 50000, patientContact: "avoid",
                                    remoteWorking: "important" });
  const written = storage.save(state, catalogue.meta.version);
  equal(written.profile.preferences.salaryTarget, 50000);
  equal(written.profile.preferences.patientContact, "avoid");
  const loaded = storage.load();
  equal(loaded.profile.preferences.remoteWorking, "important",
        "a preference was lost in storage");
  for (const key of ["name", "email", "phone", "address", "employer"]) {
    assert(!(key in loaded.profile.preferences),
           `preferences hold a ${key} field`);
  }
  storage.reset();
});

test("a hand-edited preference value is rejected, not stored", () => {
  const profile = normaliseProfile({
    preferences: {
      salaryTarget: 999999,            // not one of the offered rungs
      patientContact: "<script>",      // not one of the offered answers
      laboratoryWork: "seek",          // valid, and must survive
    },
  });
  equal(profile.preferences.salaryTarget, null, "an arbitrary target was kept");
  equal(profile.preferences.patientContact, null, "an invalid answer was kept");
  equal(profile.preferences.laboratoryWork, "seek", "a valid answer was dropped");
});

test("preferences written as booleans by an older version are migrated", () => {
  // Nothing in the interface ever wrote these, but an exported file could carry
  // them and a migration that dropped them would lose a stated answer.
  const profile = normaliseProfile({
    preferences: { patientFacing: false, laboratoryBased: true,
                   remoteWorkInterest: true, researchIntensity: false },
  });
  equal(profile.preferences.patientContact, "avoid");
  equal(profile.preferences.laboratoryWork, "seek");
  equal(profile.preferences.remoteWorking, "important");
  equal(profile.preferences.researchWork, "avoid");
});

test("transition effort stays separate from alignment and fit", () => {
  const profile = withPreferences({ laboratoryWork: "seek" });
  const career = catalogue.get("CP-019");
  const match = scoreCareer(profile, career);
  const gaps = analyseGaps(profile, match, null, catalogue.sources);
  const effort = transitionEffort(profile, match, gaps);
  const fit = preferenceFit(profile, career, { effort });

  assert(effort.label && effort.reasons.length, "effort gave no explanation");
  assert(!/%|probability|chance/i.test(effort.label + effort.summary),
         "effort wording implies a prediction");
  // Three different vocabularies, so no screen can present them as one scale.
  assert(effort.label !== match.label && effort.label !== fit.label,
         "two of the three measures share a label");
});

/* --------------------------------------------------------- deployment paths */

test("no module or asset path is absolute", async () => {
  // GitHub Pages serves this from a subdirectory. A leading slash would resolve
  // against the domain root and 404 in production while working locally.
  const html = await (await fetch(new URL("../index.html", import.meta.url))).text();
  const absolute = [...html.matchAll(/(?:src|href)="(\/[^/][^"]*)"/g)]
    .map((hit) => hit[1]);
  equal(absolute.length, 0, `absolute paths in index.html: ${absolute}`);
});

test("every internal link is a hash route", async () => {
  const html = await (await fetch(new URL("../index.html", import.meta.url))).text();
  const links = [...html.matchAll(/href="([^"]+)"/g)].map((hit) => hit[1]);
  for (const href of links) {
    const external = /^(https?:|mailto:|data:)/.test(href);
    assert(external || href.startsWith("#") || !href.startsWith("/"),
           `"${href}" is neither external, a hash route nor relative`);
  }
});

test("the frontend contains no API key", async () => {
  // §49: the browser reads a static dataset and holds no credentials at all.
  const files = ["../index.html", "../js/app.js", "../js/market-data.js",
                 "../js/preference-fit.js", "../js/comparison.js"];
  for (const file of files) {
    const text = await (await fetch(new URL(file, import.meta.url))).text();
    for (const pattern of [/[a-f0-9]{32,}/i, /ocp-apim-subscription-key/i,
                           /NCS_API_KEY\s*=\s*["'][^"']+["']/]) {
      assert(!pattern.test(text), `${file} matched ${pattern}`);
    }
  }
});

test("the market data is fetched from this site and nowhere else", async () => {
  const source = await (await fetch(
    new URL("../js/market-data.js", import.meta.url))).text();
  const urls = [...source.matchAll(/https?:\/\/[^\s"'`)]+/g)].map((hit) => hit[0]);
  equal(urls.length, 0,
        `market-data.js references outside origins: ${urls.join(", ")}`);
});

/** A profile carrying only the given preferences. */
function withPreferences(preferences) {
  return normaliseProfile({ ...demoProfile("bms"), preferences });
}

/* --------------------------------------------------------------- runner */

async function run() {
  const list = document.getElementById("results");
  const summary = document.getElementById("summary");
  let passed = 0;
  let failed = 0;

  for (const { name, fn } of tests) {
    let outcome = { name, ok: true, error: "" };
    try {
      await fn();
      passed += 1;
    } catch (error) {
      outcome = { name, ok: false, error: error.message || String(error) };
      failed += 1;
    }
    results.push(outcome);
    const item = document.createElement("li");
    item.className = outcome.ok ? "pass" : "fail";
    item.textContent = `${outcome.ok ? "PASS" : "FAIL"} — ${name}`;
    if (!outcome.ok) {
      const detail = document.createElement("pre");
      detail.textContent = outcome.error;
      item.appendChild(detail);
    }
    list.appendChild(item);
    summary.textContent = `${passed} passed, ${failed} failed, `
      + `${tests.length - passed - failed} remaining`;
  }

  summary.textContent = `${passed} passed, ${failed} failed of ${tests.length}`;
  summary.className = failed ? "fail" : "pass";
  window.__results = { passed, failed, total: tests.length, results };
  window.__done = true;
}

/* ==================================================================
 * Regional and sector salary
 * ================================================================== */

test("a regional salary is derived only where ONS publishes the group", () => {
  const context = market.regionalContext();
  assert(context, "no regional context was published");
  for (const career of catalogue.careers.slice(0, 60)) {
    const available = new Set(market.regionsWithData(career.id));
    for (const region of REGIONS) {
      if (isUk(region.key)) continue;
      const value = market.salaryForRegion(career.id, region.key);
      if (!available.has(region.key)) {
        // Either nothing at all, or an explicit refusal with a reason. What it
        // must never be is a number.
        assert(!value || value.unavailable,
               `${career.id} produced a figure for ${region.key} with no ONS data`);
        continue;
      }
      if (!value || value.unavailable) continue;
      assert(Number.isFinite(value.low) && Number.isFinite(value.high),
             `${career.id} ${region.key} produced a non-numeric range`);
      assert(value.high >= value.low, "regional range is inverted");
    }
  }
});

test("the UK region never produces a separate regional figure", () => {
  // `salary()` already answers for the UK. A second, differently-derived UK
  // answer could disagree with it, so this returns null by construction.
  for (const career of catalogue.careers.slice(0, 20)) {
    equal(market.salaryForRegion(career.id, "uk"), null);
  }
});

test("a derived regional figure is never better evidenced than indicative", () => {
  let checked = 0;
  for (const career of catalogue.careers) {
    const base = market.salary(career.id);
    if (!base || base.evidenceRank > 1) continue;
    for (const region of market.regionsWithData(career.id)) {
      const value = market.salaryForRegion(career.id, region);
      if (!value || value.unavailable) continue;
      assert(value.evidenceRank >= 2,
             `${career.id} ${region} claims ${value.evidenceLabel} for a figure `
             + `no source published`);
      checked += 1;
    }
    if (checked > 200) break;
  }
  assert(checked > 0, "no strongly-evidenced career had a regional figure");
});

test("the regional index moves a salary in the direction ONS measured", () => {
  const context = market.regionalContext();
  const career = catalogue.careers.find((item) =>
    market.regionsWithData(item.id).includes("london"));
  assert(career, "no career had a London figure");
  const base = market.salary(career.id);
  const london = market.salaryForRegion(career.id, "london");
  const group = context.groups[market.forCareer(career.id).salary.regional_soc_group];
  const index = group.regions.london;
  equal(london.high > base.high, index > 1,
        `London index is ${index} but the range moved the other way`);
});

test("a stored region preference is normalised", () => {
  equal(normaliseRegion("london"), "london");
  equal(normaliseRegion("atlantis"), "uk");
  equal(normaliseRegion(undefined), "uk");
});

/* ==================================================================
 * Bridge roles
 * ================================================================== */

function bridgeFor(profile, targetId) {
  const target = catalogue.get(targetId);
  const match = scoreCareer(profile, target);
  const gaps = analyseGaps(profile, match, null, catalogue.sources);
  return bridgeRoles({
    target, targetGaps: gaps, careers: catalogue.careers,
    matchFor: (career) => scoreCareer(profile, career), profile,
  });
}

test("a bridge role aligns more closely than the destination", () => {
  const profile = DEMO_PROFILES[1].build();
  const result = bridgeFor(profile, "CP-272");
  assert(result.hasBridge, "no bridge was found for a substantial transition");
  const target = scoreCareer(profile, catalogue.get("CP-272"));
  for (const bridge of result.bridges) {
    assert(bridge.match.score > target.score,
           `${bridge.career.title} does not align better than the destination`);
    assert(bridge.closesGaps.length > 0,
           `${bridge.career.title} closes none of the destination's gaps`);
  }
});

test("a regulated profession is never offered as a bridge", () => {
  /*
   * Clinical Oncologist ranked well as a "bridge" to Clinical Research
   * Associate for a biomedical scientist: it shares subject matter and its
   * title carries no seniority word. Reaching it is harder than reaching the
   * destination, so it is excluded outright rather than scored down.
   */
  for (const demo of DEMO_PROFILES) {
    const profile = demo.build();
    for (const targetId of ["CP-272", "CP-019"]) {
      for (const bridge of bridgeFor(profile, targetId).bridges) {
        if (!bridge.career.derived.regulated) continue;
        const covered = (profile.registrations || []).some((registration) =>
          registration.statutory && registration.status === "current"
          && registration.body === bridge.career.regulator_or_body);
        assert(covered,
               `${bridge.career.title} is regulated and was offered as a bridge`);
      }
    }
  }
});

test("a step down is only offered from a grade Helix actually knows", () => {
  const profile = DEMO_PROFILES[1].build();
  assert(profile.currentRole, "this demo should state a current role");
  const anonymous = { ...profile, currentRole: "" };
  for (const bridge of bridgeFor(anonymous, "CP-019").bridges) {
    equal(bridge.stepsDown, false,
          `${bridge.career.title} was called a step down from an unknown grade`);
  }
});

test("every bridge says it is optional", () => {
  const profile = DEMO_PROFILES[1].build();
  for (const bridge of bridgeFor(profile, "CP-272").bridges) {
    assert(/not a required step/i.test(bridge.optional),
           "a bridge did not state that it is optional");
  }
});

test("no bridges are offered without an explanation", () => {
  const profile = DEMO_PROFILES[1].build();
  const result = bridgeFor(profile, "CP-003");
  if (!result.hasBridge) assert(result.reason, "no bridges and no explanation");
});

/* ==================================================================
 * The career graph
 * ================================================================== */

test("the graph is a neighbourhood, not the catalogue", () => {
  const graph = buildGraph({
    target: catalogue.get("CP-019"), careers: catalogue.careers,
  });
  assert(graph.nodes.length >= 3, "the graph is empty");
  assert(graph.nodes.length <= 20,
         `${graph.nodes.length} nodes is a hairball, not a neighbourhood`);
});

test("every graph edge points at a career in the graph", () => {
  const graph = buildGraph({
    target: catalogue.get("CP-019"), current: catalogue.get("CP-003"),
    careers: catalogue.careers,
  });
  const present = new Set(graph.nodes.map((node) => node.id));
  for (const edge of graph.edges) {
    assert(present.has(edge.from), `edge from missing node ${edge.from}`);
    assert(present.has(edge.to), `edge to missing node ${edge.to}`);
    assert(catalogue.get(edge.from) && catalogue.get(edge.to),
           "an edge references a career id that is not in the catalogue");
  }
});

test("graph nodes never overlap and stay inside the canvas", () => {
  /*
   * Concentric rings were the first layout and produced seven overlapping pairs
   * and a node off the edge at fourteen careers. The layered layout cannot
   * overlap by construction, and this proves it stays that way.
   */
  const graph = buildGraph({
    target: catalogue.get("CP-272"), current: catalogue.get("CP-003"),
    careers: catalogue.careers,
  });
  const { positions, width, height } = layout(graph);
  const boxes = [...positions.values()].map((at) => ({
    x: at.x - NODE_WIDTH / 2, y: at.y - NODE_HEIGHT / 2,
  }));
  for (const box of boxes) {
    assert(box.x >= 0 && box.y >= 0
           && box.x + NODE_WIDTH <= width && box.y + NODE_HEIGHT <= height,
           "a node was placed outside the canvas");
  }
  for (let i = 0; i < boxes.length; i += 1) {
    for (let j = i + 1; j < boxes.length; j += 1) {
      const a = boxes[i];
      const b = boxes[j];
      const overlap = a.x < b.x + NODE_WIDTH && b.x < a.x + NODE_WIDTH
                   && a.y < b.y + NODE_HEIGHT && b.y < a.y + NODE_HEIGHT;
      assert(!overlap, "two graph nodes overlap");
    }
  }
});

test("the accessible list holds every career the picture does", () => {
  const graph = buildGraph({
    target: catalogue.get("CP-272"), current: catalogue.get("CP-003"),
    careers: catalogue.careers,
  });
  const listed = new Set(asList(graph)
    .flatMap((group) => group.members.map((node) => node.id)));
  equal(listed.size, graph.nodes.length,
        "the list and the picture do not hold the same careers");
});

/* ==================================================================
 * Baseline comparison
 * ================================================================== */

test("a numeric delta is only produced from two numbers", () => {
  assert(delta(10, 20) !== null);
  equal(delta(10, undefined), null);
  equal(delta(null, 20), null);
  equal(delta(NaN, 20), null);
});

test("a qualitative shift never produces a number", () => {
  const result = shift("low", "high");
  equal(result.numeric, false);
  assert(!/\d/.test(result.label), `"${result.label}" contains a digit`);
  equal(shift("high", "high").direction, "same");
  equal(shift("low", "unknown").known, false);
});

test("an unordered change reports difference, not direction", () => {
  equal(change("Regulated", "Not regulated").direction, "different");
  equal(change("Regulated", "Regulated").direction, "same");
});

test("a salary delta carries the weaker of the two evidence classes", () => {
  const strong = market.salary("CP-003");
  const weak = catalogue.careers
    .map((career) => market.salary(career.id))
    .find((pay) => pay && pay.evidenceRank === 3);
  assert(strong && weak, "needed one strong and one weak salary");
  equal(salaryDelta(strong, weak).weakestEvidence, weak.evidenceLabel);
});

test("differences never invent a figure for a missing value", () => {
  const present = { career: catalogue.get("CP-003"),
                    salary: market.salary("CP-003"),
                    work: market.workLife("CP-003") };
  const missing = { career: catalogue.get("CP-019"), salary: null, work: null };
  for (const row of differences(present, missing)) {
    if (row.kind !== "numeric") continue;
    assert(row.value === null || Number.isFinite(row.value.difference),
           `${row.label} produced a difference from nothing`);
  }
});

/* ==================================================================
 * Why wasn't this recommended
 * ================================================================== */

test("the explanation is built only from scored components", () => {
  const profile = DEMO_PROFILES[1].build();
  const ranked = rankCareers(profile, catalogue.careers);
  const career = catalogue.get("CP-272");
  const match = scoreCareer(profile, career);
  const gaps = analyseGaps(profile, match, null, catalogue.sources);
  const why = whyNotRecommended(match, gaps, career);

  const labels = new Set(match.components.map((item) => item.label));
  for (const item of [...why.fits, ...why.reduced]) {
    assert(labels.has(item.label),
           `${item.label} is not one of the match components`);
  }
  const place = standing(match, ranked);
  assert(place.rank >= 1 && place.rank <= ranked.length);
});

test("eligibility is stated separately from alignment", () => {
  const profile = DEMO_PROFILES[1].build();
  for (const id of ["CP-019", "CP-272"]) {
    const career = catalogue.get(id);
    const match = scoreCareer(profile, career);
    const gaps = analyseGaps(profile, match, null, catalogue.sources);
    const why = whyNotRecommended(match, gaps, career);
    assert(why.eligibility, "no eligibility statement");
    if (why.eligibility.regulated) {
      assert(/not evidence of eligibility/i.test(why.eligibility.warning),
             "a regulated career did not warn against reading alignment as "
             + "eligibility");
    }
    for (const item of why.reduced) {
      assert(!/ineligible|not qualified|cannot apply/i.test(item.detail),
             `"${item.detail}" reads as a verdict on eligibility`);
    }
  }
});

/* ==================================================================
 * Actions and the timeline
 * ================================================================== */

function analysisParts(profile, careerId) {
  const career = catalogue.get(careerId);
  const match = scoreCareer(profile, career);
  const gaps = analyseGaps(profile, match, null, catalogue.sources);
  const pathway = buildPathway(profile, match, gaps, null, {});
  const bridge = bridgeRoles({
    target: career, targetGaps: gaps, careers: catalogue.careers,
    matchFor: (item) => scoreCareer(profile, item), profile,
  });
  const actions = nextActions(profile, match, gaps, pathway,
                              { registry: catalogue.sources,
                                bridges: bridge.bridges });
  const effort = transitionEffort(profile, match, gaps);
  return { career, match, gaps, pathway, bridge, actions, effort };
}

test("every action is operational, not just a category", () => {
  const profile = DEMO_PROFILES[1].build();
  const { actions } = analysisParts(profile, "CP-272");
  equal(actions.length, 3);
  for (const action of actions) {
    assert(action.timeframe, `${action.title} has no timeframe`);
    assert(action.completionCriteria, `${action.title} has no completion test`);
    assert(action.activities.length, `${action.title} suggests nothing to do`);
    assert(action.evidenceExamples.length, `${action.title} names no evidence`);
  }
});

test("a mandatory requirement still outranks an optional course", () => {
  for (const demo of DEMO_PROFILES) {
    const { actions } = analysisParts(demo.build(), "CP-003");
    const tiers = actions.map((action) => action.tier);
    equal(tiers.slice().sort((a, b) => a - b).join(","), tiers.join(","),
          "actions are not in priority order");
  }
});

test("the timeline is built from the same actions shown on screen", () => {
  const profile = DEMO_PROFILES[1].build();
  const parts = analysisParts(profile, "CP-272");
  const timeline = buildTimeline({ ...parts, saved: {} });
  const ids = new Set(timeline.horizons
    .flatMap((horizon) => horizon.milestones.map((item) => item.id)));
  for (const action of parts.actions) {
    assert(ids.has(action.milestoneId),
           `${action.title} is missing from the timeline`);
  }
});

test("all four horizons exist, and an empty one is left empty", () => {
  const profile = DEMO_PROFILES[0].build();
  const parts = analysisParts(profile, "CP-003");
  const timeline = buildTimeline({ ...parts, saved: {} });
  equal(timeline.horizons.length, HORIZONS.length);
  const total = timeline.horizons
    .reduce((sum, horizon) => sum + horizon.milestones.length, 0);
  equal(total, timeline.counts.total);
});

test("a user's own edits survive regeneration", () => {
  const profile = DEMO_PROFILES[1].build();
  const parts = analysisParts(profile, "CP-272");
  const first = buildTimeline({ ...parts, saved: {} });
  const target = first.horizons.flatMap((horizon) => horizon.milestones)[0];

  const saved = { [target.id]: { status: "completed", due: "2027-01-31",
                                 note: "mine", horizon: "12_months" } };
  const second = buildTimeline({ ...parts, saved });
  const edited = second.horizons.flatMap((horizon) => horizon.milestones)
    .find((item) => item.id === target.id);
  equal(edited.status, "completed");
  equal(edited.due, "2027-01-31");
  equal(edited.note, "mine");
  equal(edited.horizon, "12_months");
  equal(edited.edited, true);
});

test("a date moves a milestone into the window it belongs in", () => {
  const soon = new Date();
  soon.setDate(soon.getDate() + 30);
  equal(horizonForDate(soon.toISOString().slice(0, 10)), "90_days");
  const later = new Date();
  later.setDate(later.getDate() + 300);
  equal(horizonForDate(later.toISOString().slice(0, 10)), "12_months");
  assert(suggestedDate("90_days") > new Date().toISOString().slice(0, 10));
});

/* ==================================================================
 * Labour market
 * ================================================================== */

test("labour market signals load and carry their provenance", async () => {
  await labour.loadLabourMarket();
  const state = labour.status();
  if (!state.ok) {
    // A missing file is a legitimate state, but it must say so about Helix
    // rather than about the job market.
    assert(!/no jobs|not hiring|no vacancies/i.test(state.message),
           "the unavailable message reads as a claim about the job market");
    return;
  }
  const signal = labour.demandFor(catalogue.get("CP-003"));
  assert(signal, "no signal for a mapped family");
  assert(signal.source && signal.released && signal.licence,
         "a signal without provenance");
});

test("no vacancy count is ever invented from an index", async () => {
  await labour.loadLabourMarket();
  if (!labour.status().ok) return;
  for (const career of catalogue.careers.slice(0, 40)) {
    const signal = labour.demandFor(career);
    if (!signal) continue;
    equal(signal.vacancyCount, null,
          `${career.id} reports a vacancy count the source does not publish`);
    // null means "not measured"; an empty array would mean "measured, none".
    equal(signal.topRegions, null,
          `${career.id} reports regional demand from a UK-wide source`);
  }
});

test("a stale signal is capped at a weak strength", async () => {
  await labour.loadLabourMarket();
  if (!labour.status().ok) return;
  const signal = labour.demandFor(catalogue.get("CP-003"));
  if (!signal || !signal.stale) return;
  assert(signal.strengthRank >= 2,
         "a two-year-old series is being reported as a strong signal");
});

/* ==================================================================
 * OCR
 * ================================================================== */

test("a scan is told apart from a document", () => {
  equal(looksScanned("", 2), true);
  equal(looksScanned("a".repeat(20), 2), true);
  equal(looksScanned("word ".repeat(400), 2), false);
});

test("OCR quality is reported honestly", () => {
  const good = textQuality("the quick brown fox jumps over the lazy dog "
    .repeat(12));
  equal(good.key, "fair");
  const bad = textQuality("|]{ ~~ 3#@ ".repeat(40));
  assert(bad.key === "poor" || bad.key === "mixed",
         `garbled text was rated ${bad.key}`);
  equal(textQuality("").key, "poor");
});

/* ==================================================================
 * Referential integrity
 * ================================================================== */

test("every career has a market record", async () => {
  await market.loadMarketData();
  for (const career of catalogue.careers) {
    assert(market.forCareer(career.id), `${career.id} has no market record`);
  }
});

test("no comparison, plan or baseline can reference an invalid id", () => {
  const state = storage.emptyState();
  state.compareCareerIds = ["CP-003", "CP-999999", "not-an-id"];
  state.baselineCareerId = "CP-999999";
  state.plans = { "CP-003": { "action-x": { status: "completed" } },
                  "nope": { "y": { status: "completed" } } };
  const written = storage.save(state, "1.0");
  for (const id of written.compareCareerIds) {
    assert(/^CP-\d{1,5}$/.test(id), `${id} survived normalisation`);
  }
  assert(!Object.keys(written.plans).includes("nope"),
         "a plan under an invalid career id was kept");
  assert(written.baselineCareerId === null
         || /^CP-\d{1,5}$/.test(written.baselineCareerId));
});

/* ==================================================================
 * Every screen actually renders
 * ==================================================================
 *
 * The engine tests check that the reasoning is right. Nothing checked that the
 * views could draw it, and a card list that referenced a variable which was not
 * in scope shipped to production: "My options" threw `career is not defined` on
 * its first paint, so the screen showed the error panel instead of nine careers.
 *
 * A typo like that is invisible to every unit test and obvious the moment a
 * screen is rendered once. So each view is rendered here against the real
 * catalogue, the real market data and a real profile — with a baseline pinned
 * and careers in the comparison, because those are the branches that were
 * broken.
 */

async function appForViews(options = {}) {
  // A stand-in for js/app.js: the same surface the views actually use, built on
  // the real modules so a view cannot pass here and fail in the application.
  const { rankCareers, scoreCareer } = await import("../js/matcher.js");
  const { analyseGaps } = await import("../js/gap-engine.js");
  const { buildPathway } = await import("../js/pathway-engine.js");
  const { nextActions } = await import("../js/action-engine.js");
  const { transitionEffort, whyThisCareer } =
    await import("../js/transition-effort.js");
  const { bridgeRoles } = await import("../js/bridge-engine.js");
  const { buildTimeline } = await import("../js/timeline-engine.js");
  const { preferenceFit } = await import("../js/preference-fit.js");
  const { loadRulePack } = await import("../js/rules.js");
  const { sourcesFor } = await import("../js/career-data.js");

  const profile = options.profile || null;
  const state = {
    profile,
    targetCareerId: options.target || null,
    savedCareerIds: options.saved || [],
    compareCareerIds: options.compare || [],
    baselineCareerId: options.baseline || null,
    progress: {},
    plans: {},
    settings: { region: options.region || "uk", onboarded: true,
                jurisdictionAcknowledged: true },
    datasetVersion: catalogue.meta.version,
    savedAt: null,
  };

  let ranked = null;
  const app = {
    catalogue, state, market, pending: options.pending || null,
    effortCache: new Map(), fitCache: new Map(),
    profile: () => state.profile,
    hasProfile: () => Boolean(state.profile),
    setProfile: (next) => { state.profile = next; ranked = null; return next; },
    homeRoute: () => (state.profile ? "/matches" : "/explore"),
    homeLabel: () => (state.profile
      ? "Back to my options" : "Back to all careers"),
    hasPreferences: () => Boolean(state.profile),
    persist: () => state,
    navigate: () => {},
    ranked: () => {
      if (!state.profile) return [];
      if (!ranked) ranked = rankCareers(state.profile, catalogue.careers);
      return ranked;
    },
    matchFor: (c) => state.profile ? scoreCareer(state.profile, c) : null,
    fitFor: (c, effort) => state.profile
      ? preferenceFit(state.profile, c, effort ? { effort } : {}) : null,
    sourcesFor: (c) => sourcesFor(c, catalogue.sources),
    isSaved: (id) => state.savedCareerIds.includes(id),
    toggleSaved: () => true,
    isComparing: (id) => state.compareCareerIds.includes(id),
    toggleCompare: () => ({ action: "added" }),
    clearCompare: () => {},
    compareIds: () => state.compareCareerIds,
    baselineId: () => state.baselineCareerId,
    baselineCareer: () => state.baselineCareerId
      ? catalogue.get(state.baselineCareerId) : null,
    isBaseline: (id) => state.baselineCareerId === id,
    setBaseline: () => null,
    region: () => state.settings.region,
    setRegion: () => state.settings.region,
    planFor: () => ({}),
    setPlanEntry: () => ({}),
    resetPlan: () => {},
    setTarget: () => {},
    setMilestone: () => {},
    resetAll: () => {},
    effortFor: async () => null,
    allEfforts: async () => app.effortCache,
    analysisFor: async (careerId) => {
      const career = catalogue.get(careerId);
      const pack = await loadRulePack(careerId);
      const match = app.matchFor(career);
      if (!match) return { career, pack, match: null };
      const gaps = analyseGaps(state.profile, match, pack, catalogue.sources);
      const pathway = buildPathway(state.profile, match, gaps, pack, {});
      const bridge = bridgeRoles({
        target: career, targetGaps: gaps, careers: catalogue.careers,
        matchFor: (item) => app.matchFor(item), profile: state.profile,
      });
      const actions = nextActions(state.profile, match, gaps, pathway,
                                  { registry: catalogue.sources,
                                    bridges: bridge.bridges });
      const effort = transitionEffort(state.profile, match, gaps);
      const why = whyThisCareer(state.profile, match, gaps);
      const fit = app.fitFor(career, effort);
      const timeline = buildTimeline({ career, actions, gaps, effort, bridge,
                                       saved: {} });
      return { career, pack, match, gaps, pathway, actions, effort, why, fit,
               bridge, timeline };
    },
  };
  return app;
}

async function renderView(module, app, context = {}) {
  const view = await import(`../js/views/${module}.js`);
  const render = context.render || "render";
  const node = await view[render](app, { params: context.params || {} });
  assert(node && node.nodeType === 1, `${module} returned no element`);
  // A view that renders an empty fragment has not really rendered.
  assert(node.textContent.trim().length > 0, `${module} rendered no text`);
  return node;
}

test("every screen renders for a visitor with no profile", async () => {
  const app = await appForViews();
  const screens = [
    ["home"], ["explore", { render: "renderExplorer" }],
    ["explore", { render: "renderMatches" }],
    ["career", { params: { id: "CP-003" } }],
    ["pathway", { params: { id: "CP-003" } }],
    ["graph", { params: { id: "CP-003" } }],
    ["compare"], ["saved"], ["data"], ["preferences"], ["profile-view"],
    ["onboarding", { render: "renderUpload" }],
  ];
  for (const [module, context] of screens) {
    await renderView(module, app, context);
  }
});

test("every screen renders for somebody with a profile", async () => {
  /*
   * The case that broke. A profile turns on the personal columns, the match
   * groups and the decorated cards — code that a profile-less visitor never
   * reaches, which is why the missing variable survived to production.
   */
  const app = await appForViews({ profile: DEMO_PROFILES[1].build() });
  const screens = [
    ["home"], ["explore", { render: "renderExplorer" }],
    ["explore", { render: "renderMatches" }],
    ["career", { params: { id: "CP-272" } }],
    ["pathway", { params: { id: "CP-272" } }],
    ["graph", { params: { id: "CP-272" } }],
    ["plan", { params: { id: "CP-272" } }],
    ["saved"], ["data"], ["preferences"], ["profile-view"],
  ];
  for (const [module, context] of screens) {
    await renderView(module, app, context);
  }
});

test("My options draws its career cards", async () => {
  // The specific regression: the screen rendered its headings and then threw
  // while building the cards, so "no error" was not enough to prove it worked.
  const app = await appForViews({ profile: DEMO_PROFILES[1].build() });
  const node = await renderView("explore", app, { render: "renderMatches" });
  const cards = node.querySelectorAll(".career-card");
  assert(cards.length > 0, "My options rendered no career cards");
});

test("every screen renders with a baseline, a comparison and a region set", async () => {
  const app = await appForViews({
    profile: DEMO_PROFILES[1].build(),
    baseline: "CP-003",
    compare: ["CP-003", "CP-019", "CP-272"],
    saved: ["CP-019"],
    target: "CP-272",
    region: "london",
  });
  const screens = [
    ["home"], ["explore", { render: "renderExplorer" }],
    ["explore", { render: "renderMatches" }],
    ["career", { params: { id: "CP-019" } }],
    ["pathway", { params: { id: "CP-272" } }],
    ["graph", { params: { id: "CP-272" } }],
    ["compare", { params: { ids: "CP-003,CP-019,CP-272" } }],
    ["plan", { params: { id: "CP-272" } }],
    ["saved"], ["data"],
  ];
  for (const [module, context] of screens) {
    await renderView(module, app, context);
  }
});

test("a screen asked for a career that does not exist says so", async () => {
  const app = await appForViews({ profile: DEMO_PROFILES[1].build() });
  for (const module of ["career", "pathway", "graph"]) {
    const node = await renderView(module, app, { params: { id: "CP-999999" } });
    assert(/not found|no career/i.test(node.textContent),
           `${module} did not report a missing career`);
  }
});

test("finishing onboarding always lands on the matches screen", async () => {
  /*
   * The destination used to depend on the career-goal answer, and somebody who
   * said they had a target in mind was sent to the Career Explorer — a page of
   * filter dropdowns with the results below them. After uploading a CV that
   * reads as nothing having happened, and it is the one screen that does not use
   * the profile just built.
   *
   * Driven through the real questions view rather than by reading the source, so
   * the test fails if the branch comes back in any form.
   */
  const onboarding = await import("../js/views/onboarding.js");
  for (const goal of ["target", "explore", null]) {
    const profile = { ...DEMO_PROFILES[1].build(), careerGoal: goal };
    const routes = [];
    const app = await appForViews({ profile });
    app.navigate = (route) => routes.push(route);
    app.pending = { profile, notes: [], format: "PDF", signalCount: 8 };

    const node = await onboarding.renderQuestions(app, { params: {} });
    const go = [...node.querySelectorAll("button")]
      .find((b) => /Show my career options/i.test(b.textContent));
    assert(go, `no options button for goal ${goal}`);
    go.click();
    equal(routes[routes.length - 1], "/matches",
          `career goal "${goal}" did not land on the matches screen`);
  }
});

test("reset lives on the start screen, and only when there is something to delete", async () => {
  /*
   * Moved out of My data, because starting again is decided on the start screen
   * rather than partway down a settings page. Two properties keep a destructive
   * control safe next to the primary one: it is absent for a visitor with an
   * empty browser, and it still goes through the confirmation.
   */
  const home = await import("../js/views/home.js");

  const fresh = await appForViews();
  const freshRow = (await home.render(fresh)).querySelector(".hero-actions");
  assert(![...freshRow.querySelectorAll("button")]
           .some((b) => /Reset Helix/.test(b.textContent)),
         "a first-time visitor was offered a reset of an empty browser");

  const returning = await appForViews({ profile: DEMO_PROFILES[1].build() });
  const row = (await home.render(returning)).querySelector(".hero-actions");
  const reset = [...row.querySelectorAll("button")]
    .find((b) => /Reset Helix/.test(b.textContent));
  assert(reset, "reset is missing from the start screen");
  // Same row as the upload button, and the same size as its neighbours.
  assert(reset.parentElement === row, "reset is not in the hero action row");
  assert(reset.className.includes("btn-lg"),
         "reset does not match the buttons beside it");
  assert(reset.className.includes("btn-danger"),
         "a destructive control is not marked as one");

  // And it is gone from My data.
  const data = await import("../js/views/data.js");
  const dataScreen = await data.render(returning);
  assert(![...dataScreen.querySelectorAll("button")]
           .some((b) => /Reset Helix/.test(b.textContent)),
         "My data still carries its own reset button");
  assert(/start screen/i.test(dataScreen.textContent),
         "My data does not say where reset went");
});

/* ==================================================================
 * The direction you chose leads the results
 * ================================================================== */

function digitalProfile() {
  const profile = DEMO_PROFILES[1].build();   // experienced biomedical scientist
  profile.careerGoal = "target";
  profile.careerInterests = ["digital"];
  profile.preferences = { ...(profile.preferences || {}),
                          openToSectorChange: true };
  return profile;
}

test("stated interests lead the grouped results", () => {
  /*
   * The reported failure. A biomedical scientist who ticked "digital / data"
   * and said yes to leaving their sector opened the screen on more biomedical
   * science, because the groups were ordered by transition cost. The careers
   * heading where somebody said they want to go now come first.
   */
  const profile = digitalProfile();
  const groups = groupResults(rankCareers(profile, catalogue.careers), { profile });
  equal(groups.order[0], "direction",
        `the first group was "${groups.order[0]}", not the chosen direction`);
  assert(groups.direction.items.length >= 4, "the direction group is too thin");
});

test("the direction group contains the data careers a data answer implies", () => {
  const profile = digitalProfile();
  const groups = groupResults(rankCareers(profile, catalogue.careers), { profile });
  const titles = groups.direction.items.map((item) => item.career.title);
  const wanted = ["Healthcare Data Scientist", "Clinical Data Scientist"];
  for (const title of wanted) {
    assert(titles.includes(title),
           `${title} is missing from the direction group: ${titles.join(", ")}`);
  }
});

test("one incidental tag is not enough to lead the direction group", () => {
  /*
   * Laboratory Training Officer carries an AI tag and nothing else digital, and
   * it was appearing above Healthcare Data Scientist — which matches all four
   * digital domains. Candidates need one shared domain; leading needs more.
   */
  const profile = digitalProfile();
  const domains = interestDomainsFor(profile);
  const groups = groupResults(rankCareers(profile, catalogue.careers), { profile });
  const overlaps = groups.direction.items.map((item) =>
    (item.career.derived.domains || [])
      .filter((domain) => domains.has(domain)).length);
  for (let i = 1; i < overlaps.length; i += 1) {
    assert(overlaps[i] <= overlaps[i - 1],
           "the direction group is not ordered by how squarely a career sits "
           + "in the chosen area");
  }
  assert(overlaps[0] >= 2,
         "the direction group is led by a career sharing a single domain");
});

test("every direction career genuinely shares a chosen domain", () => {
  const profile = digitalProfile();
  const domains = interestDomainsFor(profile);
  const groups = groupResults(rankCareers(profile, catalogue.careers), { profile });
  for (const item of groups.direction.items) {
    assert((item.career.derived.domains || [])
             .some((domain) => domains.has(domain)),
           `${item.career.title} does not share any chosen domain`);
  }
});

test("no career appears in two groups", () => {
  const profile = digitalProfile();
  const groups = groupResults(rankCareers(profile, catalogue.careers), { profile });
  const seen = new Set();
  for (const key of groups.order) {
    for (const item of groups[key].items) {
      assert(!seen.has(item.careerId),
             `${item.career.title} appears in more than one group`);
      seen.add(item.careerId);
    }
  }
});

test("stating no direction leaves the original three groups", () => {
  // Nothing is imposed on somebody who did not answer: the score bands stand
  // on their own, in their original order.
  const profile = DEMO_PROFILES[1].build();
  profile.careerInterests = [];
  const groups = groupResults(rankCareers(profile, catalogue.careers), { profile });
  equal(groups.order.join(","), "closest,adjacent,pivots");
  equal(groups.direction, undefined);
});

test("the direction group does not alter any alignment score", () => {
  /*
   * The guarantee that keeps the three measures separate. Grouping is a cut of
   * the ranking, not a reweighting of it — the same career must score the same
   * whether or not a direction was stated.
   */
  const plain = DEMO_PROFILES[1].build();
  plain.careerInterests = [];
  const directed = digitalProfile();

  const before = new Map(rankCareers(plain, catalogue.careers)
    .map((item) => [item.careerId, item.score]));
  const after = rankCareers(directed, catalogue.careers);

  // Interests are a scored component, so the totals may differ — but the
  // grouping must not add anything on top of that. Same ranking in, same
  // scores out.
  const grouped = groupResults(after, { profile: directed });
  for (const key of grouped.order) {
    for (const item of grouped[key].items) {
      const fresh = after.find((r) => r.careerId === item.careerId);
      equal(item.score, fresh.score,
            `${item.career.title} was rescored by grouping`);
      assert(before.has(item.careerId), "a career vanished from the ranking");
    }
  }
});

test("a finished screen returns you where you belong", async () => {
  /*
   * Clearing a comparison sent everybody to the Career Explorer. For a visitor
   * with no profile that is right — it is the only list they have. For somebody
   * who uploaded a CV it hands back a catalogue of 716 in place of the careers
   * matched to them.
   */
  const { app } = await import("../js/app.js");
  const saved = app.state.profile;
  try {
    app.state.profile = null;
    equal(app.homeRoute(), "/explore");
    equal(app.homeLabel(), "Back to all careers");

    app.state.profile = DEMO_PROFILES[1].build();
    equal(app.homeRoute(), "/matches");
    equal(app.homeLabel(), "Back to my options");
  } finally {
    app.state.profile = saved;
  }
});

test("a career page offers the way back that matches the profile", async () => {
  const withProfile = await appForViews({ profile: DEMO_PROFILES[1].build() });
  const page = await renderView("career", withProfile, { params: { id: "CP-003" } });
  const links = [...page.querySelectorAll("a")].map((a) => a.getAttribute("href"));
  assert(links.includes("#/matches"),
         "a career page gives somebody with a profile no way back to their options");

  const anonymous = await appForViews();
  const plain = await renderView("career", anonymous, { params: { id: "CP-003" } });
  const plainLinks = [...plain.querySelectorAll("a")].map((a) => a.getAttribute("href"));
  assert(plainLinks.includes("#/explore"),
         "a visitor with no profile is not offered the explorer");
});

test("the navigation collapses behind one control on a narrow screen", async () => {
  /*
   * Seven links wrapped onto two rows and took roughly a third of a phone
   * screen before any content.
   *
   * The real index.html is parsed rather than a copy in the test page: a menu
   * button that exists only in the harness would pass this and ship nothing.
   * The suite cannot resize a viewport, so the stylesheet is checked for the
   * rules that do the collapsing.
   */
  const html = await (await fetch("../index.html")).text();
  const doc = new DOMParser().parseFromString(html, "text/html");

  const toggle = doc.getElementById("nav-toggle");
  const nav = doc.getElementById("nav");
  assert(toggle, "the menu button is missing from index.html");
  assert(nav, "the navigation is missing from index.html");
  equal(toggle.getAttribute("aria-controls"), "nav",
        "the button does not say what it controls");
  equal(toggle.getAttribute("aria-expanded"), "false",
        "the menu does not ship closed");
  assert(toggle.getAttribute("aria-label"), "the button has no accessible name");
  assert(!nav.className.includes("is-open"), "the navigation ships open");

  const css = await (await fetch("../styles.css")).text();
  assert(/\.nav-toggle\s*\{\s*display:\s*none/.test(css),
         "the menu button is not hidden on wide screens");
  assert(/#nav\.is-open/.test(css),
         "there is no rule that opens the collapsed navigation");
});

test("the group counts account for every career, exactly once", () => {
  /*
   * The breakdown on My options is only trustworthy if it adds up. A career
   * counted both as "in the direction you chose" and as "adjacent" would make
   * the parts exceed the whole, and a reader would rightly stop believing any
   * of it.
   */
  for (const demo of DEMO_PROFILES) {
    const profile = demo.build();
    profile.careerInterests = ["digital"];
    const groups = groupResults(rankCareers(profile, catalogue.careers),
                                { profile });
    const sum = groups.order.reduce((total, key) => total + groups[key].total, 0);
    equal(sum, groups.scored,
          `the group totals sum to ${sum}, not ${groups.scored}`);
    equal(groups.scored, catalogue.count);
  }
});

test("a group's count is the full total, not the number of cards", () => {
  // The lists are capped at twelve and show four at a time, so counting what is
  // displayed would report the size of the cap rather than the size of the
  // answer.
  const profile = DEMO_PROFILES[1].build();
  profile.careerInterests = ["digital"];
  const groups = groupResults(rankCareers(profile, catalogue.careers), { profile });
  const big = groups.order
    .map((key) => groups[key])
    .find((group) => group.total > group.items.length);
  assert(big, "no group had more careers than it displays");
  assert(big.total > big.items.length);
});

test("stating no direction still produces totals that add up", () => {
  const profile = DEMO_PROFILES[0].build();
  profile.careerInterests = [];
  const groups = groupResults(rankCareers(profile, catalogue.careers), { profile });
  equal(groups.order.length, 3);
  const sum = groups.order.reduce((total, key) => total + groups[key].total, 0);
  equal(sum, groups.scored);
});

test("a card's alignment badge never contradicts the group it sits in", () => {
  /*
   * The group boundaries used to be 60 and 40 while the badges changed at 55 and
   * 35, so a career scoring 58 wore a "Good alignment" badge inside a group that
   * began at 60, and one scoring 42 wore "Worth exploring" inside a group
   * calling itself strong. The first boundary is now the same number as the
   * badge, so the two always agree.
   */
  equal(CLOSEST_FROM, 55, "the first group no longer starts where Good alignment does");
  for (const demo of DEMO_PROFILES) {
    const profile = demo.build();
    const groups = groupResults(rankCareers(profile, catalogue.careers), { profile });
    for (const item of groups.closest.items) {
      const band = alignmentLabel(item.score);
      assert(["strong", "good"].includes(band.key),
             `${item.career.title} scored ${item.score} and is in the closest `
             + `group wearing a "${band.label}" badge`);
    }
  }
});

test("the middle group is a shortlist, not most of the catalogue", () => {
  // It held about seventy per cent of the catalogue before the band narrowed,
  // which is what made the label indefensible once the count was shown.
  for (const demo of DEMO_PROFILES) {
    const profile = demo.build();
    const groups = groupResults(rankCareers(profile, catalogue.careers), { profile });
    const share = groups.adjacent.total / groups.scored;
    assert(share < 0.5,
           `adjacent holds ${Math.round(share * 100)}% of the catalogue`);
  }
  assert(ADJACENT_FROM > 40, "the adjacent band was not narrowed");
});

test("no group promises more than it delivers", () => {
  // "Strong adjacent careers" described a band starting at 40. A group title
  // must not claim a strength the band does not support.
  const profile = DEMO_PROFILES[1].build();
  const groups = groupResults(rankCareers(profile, catalogue.careers), { profile });
  for (const key of groups.order) {
    const group = groups[key];
    if (!/strong/i.test(group.title)) continue;
    for (const item of group.items) {
      assert(alignmentLabel(item.score).key === "strong",
             `"${group.title}" contains ${item.career.title} at ${item.score}`);
    }
  }
});

run();
