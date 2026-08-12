/**
 * Deterministic career matching.
 *
 * The same profile always produces the same ranking: no randomness, no clock, and
 * ties are broken by career id. Every component of a score is returned alongside
 * it, because a number the user cannot interrogate is not decision support.
 *
 * What a score is: an internal measure of how much of a career's subject matter
 * the profile already evidences. What it is not: a prediction about getting a job,
 * or a statement about eligibility. Mandatory requirements are handled entirely
 * separately, in gap-engine.js, precisely so a high score can never bury one.
 */

import { DOMAINS, RELATED_FAMILIES, domainLabel } from "./ontology.js";
import { seniorityOf, tokenise } from "./career-data.js";
import {
  INTEREST_OPTIONS, allSignals, profileDomains, profileOrientations
} from "./profile.js";

/** Component weights. They sum to 100. */
export const WEIGHTS = {
  title: 15,
  domains: 25,
  education: 15,
  sector: 10,
  experience: 10,
  transferable: 10,
  interests: 10,
  registration: 5,
};

/** Score bands and the only labels the interface is allowed to show. */
export const BANDS = [
  { min: 75, label: "Strong alignment", key: "strong" },
  { min: 55, label: "Good alignment", key: "good" },
  { min: 35, label: "Worth exploring", key: "explore" },
  { min: 0, label: "Bigger career pivot", key: "pivot" },
];

export function alignmentLabel(score) {
  return BANDS.find((band) => score >= band.min) || BANDS[BANDS.length - 1];
}

/**
 * Education expectation per family, read from the dataset's own entry signal.
 *
 * `approvedRoute` marks the families whose entry signal talks about approved
 * professional education and registration. It is used to raise a "needs official
 * confirmation" item, never to assert that a specific requirement applies to a
 * specific person.
 */
export const EDUCATION_EXPECTATION = {
  "Healthcare Science & Diagnostics": {
    minRank: 4, approvedRoute: true,
    subjects: ["biomedical", "science", "biology", "biochemistry", "chemistry",
      "healthcare science", "physics", "genetics", "microbiology"] },
  "Allied Health & Clinical Practice": {
    minRank: 4, approvedRoute: true,
    subjects: ["radiography", "physiotherapy", "occupational therapy",
      "dietetics", "speech", "podiatry", "clinical", "health", "science"] },
  "Nursing, Midwifery & Pharmacy": {
    minRank: 4, approvedRoute: true,
    subjects: ["nursing", "midwifery", "pharmacy", "pharmaceutical", "health"] },
  "Medicine & Dentistry": {
    minRank: 6, approvedRoute: true,
    subjects: ["medicine", "medical", "dental", "dentistry", "surgery"] },
  "Laboratory, Pathology & Technical Operations": {
    minRank: 3, approvedRoute: false,
    subjects: ["biomedical", "science", "biology", "laboratory", "applied",
      "technical", "chemistry"] },
  "Research & Academia": {
    minRank: 4, approvedRoute: false,
    subjects: ["science", "biology", "biochemistry", "molecular", "research",
      "physics", "chemistry", "statistics"] },
  "Clinical Research & Trials": {
    minRank: 4, approvedRoute: false,
    subjects: ["science", "biology", "nursing", "health", "clinical",
      "pharmacology", "research"] },
  "Pharma, Biotech R&D & Manufacturing": {
    minRank: 4, approvedRoute: false,
    subjects: ["science", "chemistry", "biology", "pharmaceutical",
      "biotechnology", "engineering", "pharmacology"] },
  "Quality, Regulatory, Safety & Compliance": {
    minRank: 4, approvedRoute: false,
    subjects: ["science", "biology", "chemistry", "engineering", "quality",
      "regulatory", "pharmaceutical", "law"] },
  "Digital Health, Data, Informatics & AI": {
    minRank: 4, approvedRoute: false,
    subjects: ["computing", "computer", "data", "informatics", "mathematics",
      "statistics", "science", "engineering", "bioinformatics"] },
  "Medical Devices, MedTech & Engineering": {
    minRank: 4, approvedRoute: false,
    subjects: ["engineering", "physics", "science", "design", "electronic",
      "mechanical", "biomedical"] },
  "Medical Affairs, Commercial, Market Access & Communications": {
    minRank: 4, approvedRoute: false,
    subjects: ["science", "biology", "medicine", "pharmacy", "pharmacology",
      "business", "marketing", "economics", "communication"] },
  "Public Health, Epidemiology & Health Policy": {
    minRank: 4, approvedRoute: false,
    subjects: ["public health", "epidemiology", "statistics", "medicine",
      "science", "policy", "social", "geography"] },
  "Leadership, Education, Operations & Consulting": {
    minRank: 4, approvedRoute: false,
    subjects: ["management", "business", "leadership", "education", "science",
      "health", "operations"] },
  "Environmental & One Health": {
    minRank: 4, approvedRoute: false,
    subjects: ["environmental", "veterinary", "food", "biology", "science",
      "public health", "geography", "ecology"] },
  "Cell & Gene Therapy, Omics & Advanced Biology": {
    minRank: 5, approvedRoute: false,
    subjects: ["molecular", "biology", "biotechnology", "genetics", "genomics",
      "bioinformatics", "engineering", "immunology", "biochemistry"] },
};

/** Domains that carry across almost any move in this sector. */
const PORTABLE_DOMAINS = ["leadership", "education", "project_management",
  "communication", "quality", "data"];

/** Rank of the highest qualification a profile holds. */
function highestRank(profile) {
  const RANKS = {
    GCSE: 1, "A level": 2, "HNC/HND": 3, "Foundation Degree": 3,
    Apprenticeship: 3, BSc: 4, BEng: 4, MPharm: 5, MEng: 5, PGDip: 5, MSc: 5,
    MRes: 5, MPH: 5, MBA: 5, "MBBS/MBChB": 6, BDS: 6, MPhil: 6, PhD: 7, MD: 7,
  };
  let best = 0;
  for (const qualification of profile.qualifications || []) {
    best = Math.max(best, RANKS[qualification.level] || 0);
  }
  return best;
}

/**
 * Score one career against one profile.
 *
 * Returns the score, its components, and the evidence behind the strongest ones,
 * which is what the detail screen and the PDF explain back to the user.
 */
export function scoreCareer(profile, career) {
  const domains = profileDomains(profile);
  return scoreWithContext(profile, career, {
    domains,
    orientations: profileOrientations(profile),
    roleTokens: new Set([
      ...tokenise(profile.currentRole),
      ...(profile.disciplines || []).flatMap(tokenise),
    ]),
    qualificationRank: highestRank(profile),
    subjectText: [
      ...(profile.qualifications || []).map((q) => `${q.level} ${q.subject}`),
      ...(profile.disciplines || []),
    ].join(" ").toLowerCase(),
    interestDomains: new Set((profile.careerInterests || []).flatMap((id) => {
      const option = INTEREST_OPTIONS.find((o) => o.id === id);
      return (option && option.domains) || [];
    })),
    statutoryRegistrations: new Set((profile.registrations || [])
      .filter((r) => r.statutory).map((r) => r.body)),
    anyRegistrations: new Set((profile.registrations || []).map((r) => r.body)),
    evidenceByDomain: new Map(allSignals(profile)
      .map((signal) => [signal.domain, signal.evidence])),
  });
}

/** The per-career scoring, with the profile-wide work hoisted out. */
function scoreWithContext(profile, career, ctx) {
  const derived = career.derived;
  const components = [];

  /* --- title similarity ------------------------------------------------- */
  const careerTokens = derived.titleTokens;
  const shared = careerTokens.filter((token) => ctx.roleTokens.has(token));
  const titleRatio = careerTokens.length
    ? shared.length / careerTokens.length : 0;
  // A same-family current role is itself weak title evidence, so that someone
  // whose job title shares no words still reads as close to their own field.
  const familyBonus = profile.currentCareerFamily === career.family ? 0.3 : 0;
  components.push(component("title", "Role and title similarity",
    Math.min(1, titleRatio + familyBonus),
    shared.length ? [`shared wording: ${shared.slice(0, 3).join(", ")}`] : []));

  /* --- domain overlap, the heaviest component --------------------------- */
  let earned = 0;
  let available = 0;
  const matchedDomains = [];
  const missingDomains = [];
  for (const [domain, weight] of derived.domainWeights) {
    if (!DOMAINS[domain]) continue;
    available += weight;
    // Scoring uses the full weighted domain map, which includes a small
    // contribution from stated interests. Deciding whether the person *has*
    // something must not: an interest is a wish, not evidence, and describing it
    // back to the user as a demonstrated strength would be a lie the rest of the
    // product then builds on.
    const scored = ctx.domains.get(domain) || 0;
    if (scored > 0) earned += weight * scored;
    if (ctx.evidenceByDomain.has(domain)) matchedDomains.push({ domain, weight });
    else missingDomains.push({ domain, weight });
  }
  const domainRatio = available ? earned / available : 0;
  matchedDomains.sort((a, b) => b.weight - a.weight || a.domain.localeCompare(b.domain));
  missingDomains.sort((a, b) => b.weight - a.weight || a.domain.localeCompare(b.domain));
  components.push(component("domains", "Skills and subject overlap", domainRatio,
    matchedDomains.slice(0, 4).map((m) => domainLabel(m.domain))));

  /* --- education -------------------------------------------------------- */
  const expectation = EDUCATION_EXPECTATION[career.family]
    || { minRank: 4, subjects: [], approvedRoute: false };
  let levelFit = 0.25;
  if (ctx.qualificationRank === 0) levelFit = 0.2;
  else if (ctx.qualificationRank >= expectation.minRank) levelFit = 1;
  else if (ctx.qualificationRank === expectation.minRank - 1) levelFit = 0.6;
  const subjectHit = expectation.subjects.some(
    (subject) => ctx.subjectText.includes(subject));
  const educationFit = 0.6 * levelFit + 0.4 * (subjectHit ? 1 : 0.35);
  components.push(component("education", "Education alignment", educationFit,
    subjectHit ? ["subject area relevant to this family"] : []));

  /* --- sector exposure -------------------------------------------------- */
  const familySectors = derived.familySectors;
  const sectorHits = familySectors.filter(
    (sector) => (profile.sectors || []).includes(sector));
  const sectorFit = !familySectors.length
    ? 0.5
    : (profile.sectors || []).length
      ? Math.min(1, sectorHits.length / Math.min(2, familySectors.length))
      : 0.3;
  components.push(component("sector", "Relevant sector exposure", sectorFit,
    sectorHits.slice(0, 3)));

  /* --- experience ------------------------------------------------------- */
  const seniority = seniorityOf(career.title);
  const expectedYears = [0, 1, 3, 6, 10][seniority] ?? 3;
  const years = Number.isFinite(profile.yearsExperience)
    ? profile.yearsExperience : 0;
  const seniorityFit = expectedYears === 0
    ? 1 : Math.min(1, years / expectedYears);
  const evidencedRelevant = matchedDomains.filter(
    (m) => (ctx.evidenceByDomain.get(m.domain) || []).length > 0).length;
  const relevantFit = Math.min(1, evidencedRelevant / 3);
  const experienceFit = 0.5 * seniorityFit + 0.5 * relevantFit;
  components.push(component("experience", "Relevant experience", experienceFit,
    years ? [`approximately ${years} years of experience`] : []));

  /* --- transferable ----------------------------------------------------- */
  const portable = PORTABLE_DOMAINS.filter((domain) => ctx.domains.has(domain));
  components.push(component("transferable", "Transferable strengths",
    Math.min(1, portable.length / 3), portable.map(domainLabel)));

  /* --- interests and preferences ---------------------------------------- */
  const interestOverlap = ctx.interestDomains.size
    ? derived.domains.filter((d) => ctx.interestDomains.has(d)).length
    : 0;
  const interestFit = ctx.interestDomains.size
    ? Math.min(1, interestOverlap / 2) : 0.5;
  const orientationFit = orientationPreferenceFit(profile, derived.orientations);
  components.push(component("interests", "Your stated interests",
    0.6 * interestFit + 0.4 * orientationFit, []));

  /* --- registration context --------------------------------------------- */
  let registrationFit = 0.5;
  const bodyNeeded = career.regulator_or_body;
  if (!derived.regulated) {
    registrationFit = 0.6;
  } else if (bodyNeeded && ctx.statutoryRegistrations.has(bodyNeeded)) {
    registrationFit = 1;
  } else if (ctx.statutoryRegistrations.size > 0) {
    registrationFit = 0.5;
  } else {
    registrationFit = 0.25;
  }
  components.push(component("registration", "Professional context",
    registrationFit, [...ctx.statutoryRegistrations].slice(0, 2)));

  const score = Math.round(
    components.reduce((total, item) => total + item.earned, 0));
  const band = alignmentLabel(score);

  return {
    careerId: career.id,
    career,
    score,
    label: band.label,
    band: band.key,
    components,
    matchedDomains: matchedDomains.map((m) => m.domain),
    missingDomains: missingDomains.map((m) => m.domain),
    portableDomains: portable,
    sameFamily: profile.currentCareerFamily === career.family,
    relatedFamily: (RELATED_FAMILIES[profile.currentCareerFamily] || [])
      .includes(career.family),
  };
}

function component(key, label, fit, evidence) {
  const bounded = Math.max(0, Math.min(1, fit));
  return {
    key,
    label,
    weight: WEIGHTS[key],
    fit: bounded,
    earned: bounded * WEIGHTS[key],
    evidence: evidence || [],
  };
}

/**
 * How well a career's orientation matches what the user said they want.
 *
 * A stated "no" is a real signal, so it counts against a career that is defined
 * by that orientation — but never to zero, because people change their minds and
 * the product should not hide options it merely suspects are unwanted.
 */
function orientationPreferenceFit(profile, careerOrientations) {
  const prefs = profile.preferences || {};
  const pairs = [
    ["laboratoryBased", "laboratory"],
    ["patientFacing", "patientFacing"],
    ["researchIntensity", "research"],
    ["leadershipInterest", "leadership"],
    ["commercialInterest", "commercial"],
    ["dataDigitalInterest", "digital"],
  ];
  let considered = 0;
  let total = 0;
  for (const [key, orientation] of pairs) {
    const wanted = prefs[key];
    if (wanted !== true && wanted !== false) continue;
    considered += 1;
    const present = careerOrientations.includes(orientation);
    if (wanted === true) total += present ? 1 : 0.4;
    else total += present ? 0.25 : 1;
  }
  return considered ? total / considered : 0.5;
}

/**
 * Rank every career for a profile.
 *
 * 677 careers is small enough to score exhaustively, which keeps the result
 * exact rather than dependent on a pre-filter.
 */
export function rankCareers(profile, careers) {
  const domains = profileDomains(profile);
  const ctx = {
    domains,
    orientations: profileOrientations(profile),
    roleTokens: new Set([
      ...tokenise(profile.currentRole),
      ...(profile.disciplines || []).flatMap(tokenise),
    ]),
    qualificationRank: highestRank(profile),
    subjectText: [
      ...(profile.qualifications || []).map((q) => `${q.level} ${q.subject}`),
      ...(profile.disciplines || []),
    ].join(" ").toLowerCase(),
    interestDomains: new Set((profile.careerInterests || []).flatMap((id) => {
      const option = INTEREST_OPTIONS.find((o) => o.id === id);
      return (option && option.domains) || [];
    })),
    statutoryRegistrations: new Set((profile.registrations || [])
      .filter((r) => r.statutory).map((r) => r.body)),
    anyRegistrations: new Set((profile.registrations || []).map((r) => r.body)),
    evidenceByDomain: new Map(allSignals(profile)
      .map((signal) => [signal.domain, signal.evidence])),
  };

  return careers
    .map((career) => scoreWithContext(profile, career, ctx))
    // Descending score; the id tie-break is what makes the order reproducible.
    .sort((a, b) => b.score - a.score || a.careerId.localeCompare(b.careerId));
}

/**
 * Split a ranking into the three groups the explore journey shows.
 *
 * Bands come from the score, but each group is also capped per family. Without
 * that cap "bigger pivots worth exploring" fills up with twelve variations of the
 * same job, which is the opposite of exploring.
 */
export function groupResults(ranked, options = {}) {
  const perGroup = options.perGroup || 12;
  const closest = pick(ranked, (r) => r.score >= 60, 2, perGroup, new Set());
  const used = new Set(closest.map((r) => r.careerId));
  const adjacent = pick(ranked, (r) => r.score >= 40 && r.score < 60, 2,
                        perGroup, used);
  for (const item of adjacent) used.add(item.careerId);
  const pivots = pick(ranked, (r) => r.score < 40, 1, perGroup, used);

  return {
    closest: {
      key: "closest",
      title: "Closest to your current experience",
      blurb: "These use most of what your profile already evidences, so the "
           + "transition cost is lowest.",
      items: closest,
    },
    adjacent: {
      key: "adjacent",
      title: "Strong adjacent careers",
      blurb: "These draw on many of your current strengths but expect some new "
           + "development.",
      items: adjacent,
    },
    pivots: {
      key: "pivots",
      title: "Bigger pivots worth exploring",
      blurb: "Plausible directions that would need a larger transition. One per "
           + "career family, so the list stays genuinely varied.",
      items: pivots,
    },
  };
}

function pick(ranked, predicate, perFamily, limit, exclude) {
  const counts = new Map();
  const out = [];
  for (const item of ranked) {
    if (out.length >= limit) break;
    if (exclude.has(item.careerId) || !predicate(item)) continue;
    const family = item.career.family;
    const seen = counts.get(family) || 0;
    if (seen >= perFamily) continue;
    counts.set(family, seen + 1);
    out.push(item);
  }
  return out;
}

/** Development indicators for the readiness panel, labelled honestly. */
export function developmentIndicators(match) {
  const AREAS = [
    { id: "technical", label: "Technical / scientific evidence",
      domains: ["laboratory_science", "diagnostics", "pathology", "microbiology",
        "genomics", "advanced_biology", "clinical_practice", "engineering",
        "manufacturing"] },
    { id: "research", label: "Research evidence",
      domains: ["research", "academia", "clinical_research", "gcp",
        "epidemiology", "bioinformatics"] },
    { id: "quality", label: "Quality and regulatory experience",
      domains: ["quality", "regulatory", "gxp", "compliance", "safety"] },
    { id: "digital", label: "Data and digital evidence",
      domains: ["data", "health_informatics", "ai", "bioinformatics"] },
    { id: "leadership", label: "Leadership evidence",
      domains: ["leadership", "operations", "project_management"] },
    { id: "education", label: "Training and education evidence",
      domains: ["education", "communication"] },
    { id: "commercial", label: "Commercial exposure",
      domains: ["commercial", "medical_affairs", "market_access",
        "health_economics", "consulting"] },
  ];
  const matched = new Set(match.matchedDomains);
  const relevant = new Set(match.career.derived.domains);

  return AREAS.map((area) => {
    const inScope = area.domains.filter((domain) => relevant.has(domain));
    const held = area.domains.filter((domain) => matched.has(domain));
    let status = "not_identified";
    if (held.length >= 2) status = "strong";
    else if (held.length === 1) status = "developing";
    return {
      id: area.id,
      label: area.label,
      status,
      statusLabel: { strong: "Strong", developing: "Developing",
                     not_identified: "Not identified in your profile" }[status],
      relevantToCareer: inScope.length > 0,
    };
  });
}
