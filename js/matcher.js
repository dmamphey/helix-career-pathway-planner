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

  /* --- stated interests -------------------------------------------------- */
  /*
   * Interests only. Working-life preferences used to be folded in here, which
   * made one number answer two different questions: how much of this career do I
   * already do, and how much would I enjoy it. They are now scored separately in
   * `preference-fit.js`, and changing a preference leaves every alignment score
   * untouched — a guarantee the suite tests directly.
   *
   * The 0.2 floor is what the preference term contributed when nothing was
   * stated, which was every real profile, so removing it changes no score that
   * anyone has ever seen. It stays because a career should not be marked down for
   * a user who declared no interests at all.
   */
  const interestOverlap = ctx.interestDomains.size
    ? derived.domains.filter((d) => ctx.interestDomains.has(d)).length
    : 0;
  const interestFit = ctx.interestDomains.size
    ? Math.min(1, interestOverlap / 2) : 0.5;
  components.push(component("interests", "Your stated interests",
    0.2 + 0.6 * interestFit, []));

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
 * Rank every career for a profile.
 *
 * 734 careers is small enough to score exhaustively, which keeps the result
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
 * Where one group ends and the next begins.
 *
 * These were 60 and 40, and the middle group swallowed about seventy per cent of
 * the catalogue — 515 careers filed under "Strong adjacent careers" for a
 * typical profile. Nobody saw that until the counts were put on the screen.
 *
 * Two things were wrong. The band was too wide, and 60/40 did not line up with
 * the alignment labels on the cards inside it: BANDS calls 55 "Good alignment",
 * so a career scoring 58 wore a Good alignment badge while sitting in a group
 * that started at 60, and one scoring 42 wore a "Worth exploring" badge inside a
 * group calling itself strong.
 *
 * `CLOSEST_FROM` is now 55, the same threshold as "Good alignment", so a career
 * in the first group always carries a badge that agrees with it. `ADJACENT_FROM`
 * is 45, which keeps the middle group a genuine shortlist rather than a
 * dumping ground.
 *
 * Changing these changes only which group a career appears in. No score moves,
 * and the badge on a card is computed from BANDS exactly as before.
 */
export const CLOSEST_FROM = 55;
export const ADJACENT_FROM = 45;

/** The domains a profile's stated interests point at. */
export function interestDomainsFor(profile) {
  return new Set(((profile && profile.careerInterests) || []).flatMap((id) => {
    const option = INTEREST_OPTIONS.find((o) => o.id === id);
    return (option && option.domains) || [];
  }));
}

/**
 * Split a ranking into the groups the explore journey shows.
 *
 * Bands come from the score, but each group is also capped per family. Without
 * that cap "bigger pivots worth exploring" fills up with twelve variations of the
 * same job, which is the opposite of exploring.
 *
 * Why the direction group leads
 * -----------------------------
 *
 * The three bands are ordered by transition cost, so the first thing a person
 * saw was whatever they could reach most easily. For somebody asking to move —
 * a biomedical scientist who ticked "digital / data" and said yes to leaving
 * their sector — that means the screen opens with more biomedical science. It
 * answers a question they did not ask, and buries the one they did.
 *
 * So when a direction has been stated, the careers heading that way come first.
 * This is a **filter, not a blend**: candidates are those whose own subject
 * matter overlaps the stated interests, and within that they are still ordered
 * by background alignment. No score is altered and no measure is merged — the
 * ranking is the same ranking, cut differently.
 *
 * The easy-reach options are not removed. They move down the page, under a
 * heading that says what they are, which is where they belong for somebody who
 * has just said they want to go somewhere else.
 */
export function groupResults(ranked, options = {}) {
  const interestDomains = options.interestDomains
    || interestDomainsFor(options.profile);

  const used = new Set();
  const groups = [];

  /*
   * How many careers fall in each category, before any cap.
   *
   * Two different numbers could answer "how many options do I have", and only
   * one of them is useful. The lists below are capped — twelve a group, and no
   * more than two or four from one family — so counting what is displayed would
   * report the size of the cap rather than the size of the answer.
   *
   * These are counted with the same partition the groups use, so a career is in
   * exactly one of them and the four add up to every career scored. A career
   * counted under the chosen direction is not also counted as an adjacent one.
   */
  const totals = {};
  const counted = new Set();
  const countInto = (key, predicate) => {
    let count = 0;
    for (const item of ranked) {
      if (counted.has(item.careerId) || !predicate(item)) continue;
      counted.add(item.careerId);
      count += 1;
    }
    totals[key] = count;
  };

  if (interestDomains.size) {
    /*
     * Ordered by how squarely a career sits in the chosen direction, then by
     * alignment.
     *
     * Ordering by alignment alone let a laboratory training role into a
     * "digital / data" list because it carries one incidental AI tag, while
     * Healthcare Data Scientist — which matches all four of the digital
     * domains — sat below it. One shared domain is enough to be a candidate;
     * it is not enough to lead.
     *
     * The family cap is looser here than anywhere else, because a direction is
     * usually concentrated in one family. Capping it at two, as the score bands
     * do, forced in unrelated careers to fill the space — which is precisely
     * the failure this group exists to fix. Four keeps the list varied without
     * fighting the thing the user asked for.
     */
    const scored = ranked
      .map((item) => ({
        item,
        overlap: (item.career.derived.domains || [])
          .filter((domain) => interestDomains.has(domain)).length,
      }))
      .filter((entry) => entry.overlap > 0)
      .sort((a, b) => b.overlap - a.overlap
        || b.item.score - a.item.score
        || a.item.careerId.localeCompare(b.item.careerId));

    countInto("direction", (item) =>
      (item.career.derived.domains || [])
        .some((domain) => interestDomains.has(domain)));

    const direction = pick(scored.map((entry) => entry.item),
                           () => true, 4, used);
    for (const item of direction) used.add(item.careerId);
    groups.push({
      key: "direction",
      title: "In the direction you chose",
      blurb: "Careers whose own subject matter matches the areas you said "
           + "interest you. The ones that sit most squarely in those areas come "
           + "first, and among equals the closest match to your background — "
           + "not the easiest move.",
      items: direction,
    });
  }

  countInto("closest", (item) => item.score >= CLOSEST_FROM);
  countInto("adjacent", (item) => item.score >= ADJACENT_FROM
                               && item.score < CLOSEST_FROM);
  countInto("pivots", (item) => item.score < ADJACENT_FROM);

  const closest = pick(ranked, (r) => r.score >= CLOSEST_FROM, 2, used);
  for (const item of closest) used.add(item.careerId);
  const adjacent = pick(ranked, (r) => r.score >= ADJACENT_FROM
                                    && r.score < CLOSEST_FROM, 2, used);
  for (const item of adjacent) used.add(item.careerId);
  const pivots = pick(ranked, (r) => r.score < ADJACENT_FROM, 1, used);

  groups.push(
    {
      key: "closest",
      title: "Closest to your current experience",
      blurb: "These use most of what your profile already evidences, so the "
           + "transition cost is lowest.",
      items: closest,
    },
    {
      key: "adjacent",
      title: "Adjacent careers",
      blurb: "These draw on some of your current strengths and expect real "
           + "development on top. A shortlist rather than everything that "
           + "shares a little overlap.",
      items: adjacent,
    },
    {
      key: "pivots",
      title: "Bigger pivots worth exploring",
      blurb: "Careers whose subject matter your profile does not currently "
           + "evidence much of. That is a statement about the size of the move, "
           + "not about whether you could make it. One per career family, so "
           + "the list stays genuinely varied.",
      items: pivots,
    });

  /*
   * Returned as an ordered list *and* by key. The view walks `order` so the
   * sequence lives here with the reasoning, rather than being reassembled from
   * a hard-coded array of names in a template — which is how the direction
   * group would end up last by accident.
   */
  // Each group carries its own full count alongside the capped list, so a
  // heading can say "showing 4 of 62" without the view recomputing anything.
  for (const group of groups) group.total = totals[group.key] || 0;

  const byKey = Object.fromEntries(groups.map((group) => [group.key, group]));
  return {
    ...byKey,
    order: groups.map((group) => group.key),
    groups,
    totals,
    scored: ranked.length,
  };
}

/**
 * Order a band so it stays varied all the way down.
 *
 * `ranked` arrives best-first, so the strongest careers lead. The problem this
 * solves is monotony: without a family limit, "Closest to your current
 * experience" opens for a biomedical scientist with Biomedical Scientist, Senior
 * Biomedical Scientist, Lead Biomedical Scientist, Specialist Biomedical
 * Scientist — which looks like plenty of choice and offers one.
 *
 * The careers are dealt out in rounds. Each round takes up to `perFamily` from
 * every family that still has some, families ordered by where their best career
 * came in the ranking. So the top of the list holds at most two from any one
 * family, then two from the next, and the ones displaced appear a round later
 * rather than being dropped.
 *
 * A first attempt built a varied head and appended the remainder behind it. That
 * is fine while the head is long, and fails exactly when it is short: if an
 * earlier group has already taken most other families, the head can be two
 * careers and the sixth row of the grid is back to four variations of the same
 * job. Rounds have no such edge — the density is bounded everywhere in the list,
 * not just at the start.
 *
 * Every career in the band is returned. The limit decides the order, never
 * membership, which is what lets a group heading state a total that View more
 * can actually reach.
 */
function pick(ranked, predicate, perFamily, exclude) {
  const byFamily = new Map();
  for (const item of ranked) {
    if (exclude.has(item.careerId) || !predicate(item)) continue;
    if (!byFamily.has(item.career.family)) byFamily.set(item.career.family, []);
    byFamily.get(item.career.family).push(item);
  }

  /*
   * Families in the order their best career appeared, rather than by score.
   * The direction group hands in a list sorted by how squarely each career sits
   * in the chosen areas, and sorting on score here would quietly undo that.
   */
  const families = [...byFamily.values()];

  const out = [];
  for (let round = 0; ; round += 1) {
    let dealt = false;
    for (const list of families) {
      const slice = list.slice(round * perFamily, (round + 1) * perFamily);
      if (!slice.length) continue;
      out.push(...slice);
      dealt = true;
    }
    if (!dealt) break;
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
