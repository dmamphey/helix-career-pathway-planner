/**
 * Gap analysis: what the profile already evidences, and what it does not.
 *
 * Two rules shape everything here.
 *
 * The first is that a mandatory requirement is never inferred. The dataset knows
 * that a career is regulated and by whom; it does not know what the regulator
 * currently requires of a particular person, and neither does this application.
 * So a regulated career produces a "needs official confirmation" gate pointing at
 * the regulator, and only a rule pack that has been verified against a current
 * official source can produce a "required" item.
 *
 * The second is that absence of evidence is not evidence of absence. A CV that
 * does not mention audit work does not mean the person has never audited
 * anything, so every derived gap is phrased as "not identified in your profile"
 * and the user can add the evidence.
 */

import { DOMAINS, domainLabel } from "./ontology.js";
import { EDUCATION_EXPECTATION } from "./matcher.js";
import { allSignals } from "./profile.js";

/** Statuses, with the text and symbol each one shows. */
export const GAP_STATUS = {
  demonstrated: { label: "Already demonstrated", symbol: "✓", rank: 0 },
  developing: { label: "Developing", symbol: "◐", rank: 1 },
  action_required: { label: "Action required", symbol: "!", rank: 2 },
  needs_confirmation: { label: "Needs official confirmation", symbol: "?", rank: 3 },
};

/** Requirement categories, in the order the interface shows them. */
export const CATEGORIES = {
  required: {
    label: "Required",
    blurb: "Verified against a current official source.",
  },
  needs_confirmation: {
    label: "Must be confirmed officially",
    blurb: "CareerPath can see that a requirement applies here but cannot "
         + "confirm what it means for you. Check with the official body.",
  },
  usually_expected: {
    label: "Usually expected",
    blurb: "Common expectations for entry or progression. Not universal rules.",
  },
  career_enhancing: {
    label: "Career-enhancing",
    blurb: "Strengthens a move, without being expected of everyone.",
  },
  optional: {
    label: "Optional or route-dependent",
    blurb: "Helpful in some contexts, not needed in others.",
  },
};

/** Development areas, and the domains that belong to each. */
export const AREAS = [
  { id: "registration", label: "Professional registration", domains: [] },
  { id: "education", label: "Education and qualifications", domains: [] },
  { id: "technical", label: "Technical and scientific knowledge",
    domains: ["laboratory_science", "diagnostics", "pathology", "microbiology",
      "genomics", "advanced_biology", "clinical_practice", "patient_care",
      "rehabilitation", "nursing", "pharmacy", "dentistry", "psychology",
      "manufacturing", "biotechnology", "pharma", "medical_devices",
      "engineering", "innovation"] },
  { id: "research", label: "Research", domains: ["research", "academia",
    "epidemiology"] },
  { id: "clinical_research", label: "Clinical research",
    domains: ["clinical_research", "gcp"] },
  { id: "quality_regulatory", label: "Quality and regulatory",
    domains: ["quality", "regulatory", "gxp", "compliance", "safety"] },
  { id: "data_digital", label: "Data and digital",
    domains: ["data", "bioinformatics", "ai", "health_informatics"] },
  { id: "public_health", label: "Public health and policy",
    domains: ["public_health", "policy", "environmental_health"] },
  { id: "leadership", label: "Leadership",
    domains: ["leadership", "operations", "project_management"] },
  { id: "training", label: "Training and education", domains: ["education"] },
  { id: "communication", label: "Communication", domains: ["communication"] },
  { id: "commercial", label: "Commercial awareness",
    domains: ["medical_affairs", "commercial", "market_access",
      "health_economics", "consulting"] },
];

const AREA_OF_DOMAIN = new Map();
for (const area of AREAS) {
  for (const domain of area.domains) AREA_OF_DOMAIN.set(domain, area.id);
}

export function areaOf(domain) {
  return AREA_OF_DOMAIN.get(domain) || "technical";
}

/**
 * Build the gap analysis for one career.
 *
 * @param {object} profile structured profile
 * @param {object} match   result from matcher.scoreCareer
 * @param {object|null} pack rule pack, if one exists
 * @param {object} registry source registry, for linking a requirement to a body
 */
export function analyseGaps(profile, match, pack, registry = {}) {
  const career = match.career;
  // Two different questions, two different sets.
  //
  // `held` is what the profile evidences *of this career's own subject matter* —
  // the right basis for deriving gaps from the dataset's tags.
  //
  // `profileHeld` is everything the profile evidences at all. A rule pack can name
  // a requirement outside the career's tag list (quality systems for a laboratory
  // role, for instance), and judging that against `held` would report a capability
  // the person demonstrably has as missing. Both are built from recorded signals
  // only — never from a stated interest.
  const held = new Set(match.matchedDomains);
  const profileHeld = new Set(allSignals(profile).map((signal) => signal.domain));
  const items = [];

  /* --- registration ------------------------------------------------------ */
  if (career.derived.regulated) {
    const body = career.regulator_or_body;
    const source = body && registry[body] ? registry[body] : null;
    const holdsThisBody = (profile.registrations || [])
      .some((r) => r.body === body && r.statutory && r.status === "current");
    items.push({
      id: "registration_route",
      domain: "",
      area: "registration",
      category: "needs_confirmation",
      status: holdsThisBody ? "developing" : "needs_confirmation",
      title: holdsThisBody
        ? `Your ${body} registration is relevant — confirm it covers this role`
        : "Professional registration or an approved route applies",
      detail: holdsThisBody
        ? `Your profile records current ${body} registration. Whether it covers `
          + "this specific role, scope of practice or protected title still has "
          + "to be confirmed with the regulator."
        : `This career is recorded as "${career.regulatory_status}"`
          + `${body ? ` with ${body}` : ""}. CareerPath cannot establish your `
          + "eligibility: confirm the current route and requirements with the "
          + "official body before planning around them.",
      sourceCode: body || (career.official_source_codes || [])[0] || "",
      sourceUrl: source ? source.url : "",
    });
  }

  /* --- education --------------------------------------------------------- */
  const expectation = EDUCATION_EXPECTATION[career.family];
  if (expectation) {
    const education = match.components.find((c) => c.key === "education");
    const fit = education ? education.fit : 0;
    const hasAny = (profile.qualifications || []).length > 0;
    let status = "demonstrated";
    if (!hasAny) status = "action_required";
    else if (fit < 0.55) status = "action_required";
    else if (fit < 0.8) status = "developing";
    if (status !== "demonstrated") {
      items.push({
        id: "education_level",
        domain: "",
        area: "education",
        category: expectation.approvedRoute ? "needs_confirmation"
                                            : "usually_expected",
        status: expectation.approvedRoute ? "needs_confirmation" : status,
        title: expectation.approvedRoute
          ? "An approved education or training route usually applies"
          : "Education profile may need strengthening for this family",
        detail: expectation.approvedRoute
          ? "Careers in this family are normally entered through an approved "
            + "programme. Which programmes are approved, and what your existing "
            + "qualifications count towards, must come from the official body."
          : `Typical background for this family: ${career.typical_entry_signal}.`
            + " Your recorded qualifications may not yet evidence that, though a"
            + " qualification you hold but have not entered would change this.",
        sourceCode: (career.official_source_codes || [])[0] || "",
      });
    }
  }

  /* --- rule pack content ------------------------------------------------- */
  if (pack) {
    pushPackItems(items, pack.required, "required", profileHeld);
    pushPackItems(items, pack.usuallyExpected, "usually_expected", profileHeld);
    pushPackItems(items, pack.careerEnhancing, "career_enhancing", profileHeld);
    pushPackItems(items, pack.optional, "optional", profileHeld);
  }

  /* --- domain gaps derived from the dataset ------------------------------ */
  // Only the domains this career actually claims, strongest first, and only
  // where no pack item already covers the same ground.
  const covered = new Set(items.map((item) => item.domain).filter(Boolean));
  const weights = career.derived.domainWeights;
  const ordered = [...weights.entries()]
    .filter(([domain]) => DOMAINS[domain])
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  for (const [domain, weight] of ordered) {
    if (covered.has(domain)) continue;
    const isHeld = held.has(domain);
    if (isHeld) {
      items.push({
        id: `strength_${domain}`,
        domain,
        area: areaOf(domain),
        category: "usually_expected",
        status: "demonstrated",
        title: domainLabel(domain),
        detail: "Identified in your profile and relevant to this career.",
      });
    } else if (weight >= 0.7 && !pack) {
      // Without a pack the dataset's own tags are the only guide to what matters,
      // so weak associations are not turned into gaps.
      items.push({
        id: `gap_${domain}`,
        domain,
        area: areaOf(domain),
        category: "usually_expected",
        status: "action_required",
        title: domainLabel(domain),
        detail: "Not identified in your current profile. If you have this "
              + "experience, add it to your profile and the analysis will update.",
      });
    } else if (weight >= 0.7) {
      items.push({
        id: `gap_${domain}`,
        domain,
        area: areaOf(domain),
        category: "career_enhancing",
        status: "action_required",
        title: domainLabel(domain),
        detail: "Not identified in your current profile.",
      });
    }
  }

  return {
    careerId: career.id,
    items: items.sort(byCategoryThenStatus),
    byCategory: groupBy(items, (item) => item.category),
    byArea: groupBy(items, (item) => item.area),
    requiresOfficialConfirmation: items.some(
      (item) => item.category === "needs_confirmation"),
    verifiedRequirements: items.filter((item) => item.category === "required"),
    hasVerifiedPack: Boolean(pack && pack.requirementsVerified),
    hasPack: Boolean(pack),
    transitions: transitionView(profile, match),
    developmentGoals: developmentGoals(items, career.id),
  };
}

function pushPackItems(items, list, category, held) {
  for (const [position, item] of (list || []).entries()) {
    const isHeld = item.domain && held.has(item.domain);
    items.push({
      // The order a pack lists its items in is an editorial judgement about what
      // matters first. It is carried through so the action engine can respect it
      // instead of falling back to alphabetical order.
      order: position,
      id: item.id,
      domain: item.domain,
      area: item.domain ? areaOf(item.domain) : "technical",
      category,
      status: isHeld ? "demonstrated"
        : category === "required" ? "action_required"
        : category === "usually_expected" ? "action_required"
        : "developing",
      title: item.title,
      detail: isHeld
        ? `${item.detail} Your profile already evidences `
          + `${domainLabel(item.domain).toLowerCase()}.`
        : item.detail,
      sourceCode: item.sourceCode || "",
      fromPack: true,
      demotedFromRequired: Boolean(item.demotedFromRequired),
    });
  }
}

function byCategoryThenStatus(a, b) {
  const order = ["required", "needs_confirmation", "usually_expected",
                 "career_enhancing", "optional"];
  const byCategory = order.indexOf(a.category) - order.indexOf(b.category);
  if (byCategory !== 0) return byCategory;
  const statusDiff = GAP_STATUS[b.status].rank - GAP_STATUS[a.status].rank;
  if (statusDiff !== 0) return statusDiff;
  return a.id.localeCompare(b.id);
}

function groupBy(items, keyOf) {
  const map = new Map();
  for (const item of items) {
    const key = keyOf(item);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(item);
  }
  return map;
}

/**
 * The three-way transition view.
 *
 * "Translation gaps" is the distinction worth having: capabilities the person
 * demonstrably has, which the target sector describes in different words. It is
 * computed, not guessed — a domain counts as needing translation when the profile
 * evidences it but has no exposure to any sector this career's family sits in.
 */
function transitionView(profile, match) {
  const career = match.career;
  const heldSectors = new Set(profile.sectors || []);
  const sectorOverlap = (career.derived.familySectors || [])
    .some((sector) => heldSectors.has(sector));

  const relevant = new Set(career.derived.domains);
  const transferable = [];
  const translation = [];
  for (const domain of match.matchedDomains) {
    const entry = { domain, label: domainLabel(domain) };
    if (!sectorOverlap && relevant.has(domain)) translation.push(entry);
    else transferable.push(entry);
  }
  // Portable strengths always belong in the transferable column, whatever the
  // sector: nobody has to relearn how to lead a team.
  for (const domain of match.portableDomains) {
    if (!transferable.some((item) => item.domain === domain)) {
      transferable.push({ domain, label: domainLabel(domain) });
    }
  }

  const development = match.missingDomains
    .filter((domain) => (career.derived.domainWeights.get(domain) || 0) >= 0.7)
    .map((domain) => ({ domain, label: domainLabel(domain) }));

  const sort = (list) => list.sort((a, b) => a.label.localeCompare(b.label));
  return {
    sectorOverlap,
    transferable: sort(transferable),
    translation: sort(translation),
    development: sort(development),
  };
}

/**
 * Development goals with stable ids.
 *
 * Shaped for a future CPD tool to consume: id, domain, status, title and the
 * career they belong to, and nothing that ties them to this session.
 */
function developmentGoals(items, careerId) {
  return items
    .filter((item) => item.status === "action_required"
                   || item.status === "needs_confirmation")
    .map((item) => ({
      id: item.domain ? `${item.area}_${item.domain}` : `${item.area}_${item.id}`,
      domain: item.domain || item.area,
      status: item.status,
      title: item.title,
      targetCareerId: careerId,
    }));
}
