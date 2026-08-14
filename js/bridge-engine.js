/**
 * Bridge roles: the jobs between where somebody is and where they want to be.
 *
 * Helix used to present every transition as a single step — biomedical scientist
 * to clinical research associate, as though the gap were a decision rather than a
 * few years. Most substantial career changes in this sector do not work that way.
 * They go through a role that is reachable from here and that teaches the thing
 * the destination screens for.
 *
 * What makes a bridge, and what does not
 * --------------------------------------
 *
 * A bridge role has to earn its place on four counts, all of them checkable
 * against data already in the application:
 *
 *   reachable    it is a smaller move from the current position than the target
 *   useful       it covers development gaps the target has and the profile lacks
 *   connected    it sits adjacent to the target, not merely adjacent to today
 *   sensible     its seniority does not leap past the target or fall far behind
 *
 * A career that is merely *similar* to the target is not a bridge. That distinction
 * is the whole feature: "related careers" already exists, and relabelling it
 * "bridge roles" would be a promise the list could not keep.
 *
 * What this never claims
 * ----------------------
 *
 * That a bridge is required. Nothing here comes from an official route, so a
 * bridge is always an option and never a prerequisite — the direct route is
 * offered beside it every time. Where a regulator sets the entry route, that is
 * recorded in the gap analysis and stated separately; a bridge role cannot
 * substitute for registration and the interface must not imply that it can.
 */

import { similarity } from "./adjacency.js";
import { seniorityOf } from "./career-data.js";
import { domainLabel } from "./ontology.js";

/** How many bridges are worth offering. Beyond three it is a list, not advice. */
export const MAX_BRIDGES = 3;

/**
 * Scoring weights.
 *
 * Gap coverage carries the most because it is the only component that answers
 * "why this role rather than any other neighbour". Closeness to the target comes
 * next: a bridge that does not lead anywhere is just a different job.
 */
const WEIGHTS = {
  gapCoverage: 0.40,
  towardTarget: 0.30,
  reachable: 0.20,
  seniority: 0.10,
};

/**
 * Find bridge roles between a profile's current position and a target career.
 *
 * @param {object}   options.target      the destination career
 * @param {object}   options.targetGaps  gap analysis for the destination
 * @param {Array}    options.careers     the full catalogue
 * @param {Function} options.matchFor    career -> match, for reachability
 * @param {object}   options.profile     structured profile
 * @returns {{bridges: Array, direct: object, hasBridge: boolean, reason: string}}
 */
export function bridgeRoles({ target, targetGaps, careers, matchFor, profile,
                              effortFor = null, limit = MAX_BRIDGES }) {
  const targetMatch = matchFor(target);
  const targetSeniority = seniorityOf(target.title);
  const currentSeniority = currentLevel(profile);
  const knownLevel = levelIsKnown(profile);

  /*
   * The gaps a bridge could usefully close.
   *
   * Only development gaps count. A registration requirement is not something a
   * different job can hand you, and treating it as coverable is exactly the
   * false promise this engine has to avoid.
   */
  const openGaps = new Set(
    (targetGaps && targetGaps.transitions && targetGaps.transitions.development
      ? targetGaps.transitions.development : [])
      .map((item) => item.domain)
      .filter(Boolean));

  const direct = {
    career: target,
    match: targetMatch,
    seniorityStep: targetSeniority - currentSeniority,
    openGapCount: openGaps.size,
  };

  if (!openGaps.size) {
    return {
      bridges: [],
      direct,
      hasBridge: false,
      reason: "No development gaps were identified between your profile and this "
            + "career, so there is nothing an intermediate role would add. The "
            + "direct route is the route.",
    };
  }

  const scored = [];
  for (const candidate of careers) {
    if (candidate.id === target.id) continue;

    const towardTarget = similarity(candidate, target);
    // A bridge has to be genuinely on the way. Below this the candidate is a
    // different career that happens to be reachable, which helps nobody.
    if (towardTarget < 0.25) continue;

    /*
     * A regulated profession is not a stepping stone.
     *
     * Clinical Oncologist scored well as a "bridge" to Clinical Research
     * Associate for a biomedical scientist, because it shares subject matter and
     * the title carries no seniority word. It is a medical career with its own
     * statutory route: reaching it is harder than reaching the destination, not
     * easier. Unless the person already holds registration that covers it, a
     * regulated career is excluded outright rather than scored down — no weight
     * on the other components should be able to outvote a training route.
     */
    if (candidate.derived.regulated && !holdsRegistrationFor(profile, candidate)) {
      continue;
    }

    const candidateMatch = matchFor(candidate);
    if (!candidateMatch) continue;

    /*
     * Reachability, expressed as the improvement over going straight there.
     * A candidate that aligns *worse* than the target is not a stepping stone —
     * it is a detour — so it is dropped rather than merely scored low.
     */
    const gain = candidateMatch.score - targetMatch.score;
    if (gain <= 2) continue;

    const covered = coveredGaps(candidate, openGaps);
    if (!covered.length) continue;

    const candidateSeniority = seniorityOf(candidate.title);
    const seniorityFit = seniorityScore(currentSeniority, candidateSeniority,
                                        targetSeniority, knownLevel);
    if (seniorityFit === null) continue;

    const score = WEIGHTS.gapCoverage * (covered.length / openGaps.size)
                + WEIGHTS.towardTarget * towardTarget
                + WEIGHTS.reachable * Math.min(1, gain / 30)
                + WEIGHTS.seniority * seniorityFit;

    scored.push({
      career: candidate,
      match: candidateMatch,
      score,
      alignmentGain: Math.round(gain),
      towardTarget,
      coveredDomains: covered,
      seniorityStep: candidateSeniority - currentSeniority,
      stepsDown: knownLevel && candidateSeniority < currentSeniority,
      sameFamilyAsTarget: candidate.family === target.family,
    });
  }

  scored.sort((a, b) => b.score - a.score
    || a.career.id.localeCompare(b.career.id));

  /*
   * Spread the shortlist across families.
   *
   * Three bridges from one family are three versions of the same suggestion. One
   * per family until the quota is filled, then top up — so the list offers real
   * alternatives rather than a ranked list of near-duplicates.
   */
  const bridges = [];
  const families = new Set();
  for (const item of scored) {
    if (bridges.length >= limit) break;
    if (families.has(item.career.family)) continue;
    families.add(item.career.family);
    bridges.push(item);
  }
  for (const item of scored) {
    if (bridges.length >= limit) break;
    if (bridges.includes(item)) continue;
    bridges.push(item);
  }

  return {
    bridges: bridges.map((item) => explain(item, target, openGaps, effortFor)),
    direct,
    hasBridge: bridges.length > 0,
    reason: bridges.length
      ? ""
      : "No career in the catalogue sits closer to your profile than this one "
      + "while also covering its development gaps. That usually means the direct "
      + "route is the shortest one available, not that the move is easy.",
  };
}

/** Which of the target's open gaps this candidate's own subject matter covers. */
function coveredGaps(candidate, openGaps) {
  const domains = new Set(candidate.derived.domains || []);
  return [...openGaps].filter((domain) => domains.has(domain));
}

/**
 * How sensible a bridge's seniority is.
 *
 * Returns null — meaning "not a bridge" — for a candidate more senior than the
 * destination, or more than one grade below where the person already is. Both are
 * real answers rather than low scores: a role above the target is not a step
 * towards it, and a two-grade drop is a different conversation that Helix should
 * not slip into a list of suggestions.
 */
function seniorityScore(current, candidate, target, knownLevel) {
  if (candidate > target) return null;
  if (candidate < current) {
    // A step down can be a real bridge when changing sector, but only from a
    // grade we actually know, and only by one. Where the current grade was
    // never stated, Helix does not know it is a step down and must not guess.
    if (!knownLevel) return null;
    return candidate === current - 1 ? 0.4 : null;
  }
  return candidate <= target ? 1 : 0.7;
}

/**
 * The person's current seniority.
 *
 * Deliberately delegates the unstated case to `seniorityOf`, which answers with
 * the dataset's own default grade rather than the bottom of the ladder. Assuming
 * zero here was a real bug: it made every junior role look like a step up, and a
 * senior biomedical scientist was offered a healthcare science assistant post as
 * a bridge. An unknown grade is not the lowest grade.
 */
function currentLevel(profile) {
  return seniorityOf((profile && profile.currentRole) || "");
}

/** Whether we actually know where the person sits, as opposed to defaulting. */
function levelIsKnown(profile) {
  return Boolean(profile && profile.currentRole);
}

/**
 * Does the profile already hold registration covering this career?
 *
 * The same test `transition-effort.js` applies, and for the same reason: matching
 * the regulator is not enough, because HCPC registers fifteen professions that
 * are not interchangeable. Helix never concludes eligibility from this — only
 * that a career is not an extra barrier for this particular person.
 */
function holdsRegistrationFor(profile, career) {
  const body = career.regulator_or_body;
  if (!body) return false;
  const simplify = (text) => String(text || "").toLowerCase()
    .replace(/[^a-z0-9]+/g, " ").trim();
  const title = simplify(career.title);
  return ((profile && profile.registrations) || []).some((registration) => {
    if (!registration.statutory || registration.status !== "current") return false;
    if (registration.body !== body) return false;
    const profession = simplify(registration.profession);
    return Boolean(profession)
      && (title.includes(profession) || profession.includes(title));
  });
}

/**
 * Turn a scored candidate into something a person can act on.
 *
 * Every sentence here is assembled from a field that was scored, so the
 * explanation and the ranking cannot drift apart. If a reason is not in the
 * score, it does not appear in the text.
 */
function explain(item, target, openGaps, effortFor) {
  const provides = item.coveredDomains.map(domainLabel);
  const remaining = [...openGaps]
    .filter((domain) => !item.coveredDomains.includes(domain))
    .map(domainLabel);

  return {
    career: item.career,
    match: item.match,
    effort: effortFor ? effortFor(item.career.id) : null,
    alignmentGain: item.alignmentGain,
    coveredDomains: item.coveredDomains,

    /*
     * Said plainly when it applies.
     *
     * A sideways-and-down move into a new sector is a legitimate bridge, and
     * plenty of people make it deliberately. Presenting it without saying which
     * way it goes would let somebody read a pay cut as a promotion.
     */
    stepsDown: item.stepsDown,
    gradeNote: item.stepsDown
      ? "This sits a grade below your current role. That is a common way to "
      + "move sector, but it is a step down in grade and usually in pay."
      : "",

    whyItHelps: `It aligns with your current profile about `
      + `${item.alignmentGain} points more closely than ${target.title} does, `
      + `while working in ${provides.length === 1 ? "an area" : "areas"} that `
      + `${target.title} needs.`,

    whatTransfers: item.sameFamilyAsTarget
      ? `It sits in the same career family as ${target.title}, so the sector `
      + `knowledge you build in it is the sector knowledge that career expects.`
      : `It shares enough of ${target.title}'s subject matter to count as `
      + `relevant experience, from a family that is easier to reach from where `
      + `you are.`,

    whatItProvides: provides,
    closesGaps: provides,
    remainingGaps: remaining,

    nextMove: remaining.length
      ? `From there, ${target.title} would still need `
      + `${listWords(remaining.map((label) => label.toLowerCase()))}.`
      : `That covers every development gap Helix identified for ${target.title}.`,

    // Stated on every bridge, every time. The moment this reads as a required
    // step, the feature has started inventing entry requirements.
    optional: "This is one possible route, not a required step. Nothing official "
      + "says you must do this job first.",
  };
}

function listWords(items) {
  if (items.length <= 1) return items[0] || "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
