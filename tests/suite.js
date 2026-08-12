/**
 * CareerPath test suite.
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
} from "../js/ontology.js";
import {
  emptyProfile, normaliseProfile, addSignal, allSignals, demoProfile,
  DEMO_PROFILES, isUsableProfile,
} from "../js/profile.js";
import {
  extractText, redactPersonalData, ProfileInterpreter,
  UnreadableDocumentError, UnsupportedFormatError,
} from "../js/cv-parser.js";
import { rankCareers, scoreCareer, groupResults, alignmentLabel, WEIGHTS }
  from "../js/matcher.js";
import { analyseGaps } from "../js/gap-engine.js";
import { buildPathway } from "../js/pathway-engine.js";
import { nextActions } from "../js/action-engine.js";
import { normalisePack, loadRulePack } from "../js/rules.js";
import { similarity, adjacentCareers } from "../js/adjacency.js";
import * as storage from "../js/storage.js";

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

test("the dataset holds at least 677 careers", () => {
  assert(catalogue.count >= 677, `only ${catalogue.count} careers`);
  equal(catalogue.count, catalogue.meta.declaredCount,
        "loaded count differs from the count the dataset declares");
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

test("results group into three buckets with family variety", () => {
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
    application: "CareerPath", datasetVersion: "1.0", state,
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

run();
