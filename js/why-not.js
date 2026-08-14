/**
 * "Why wasn't this one of my top recommendations?"
 *
 * Somebody searches for the career they have been thinking about for two years
 * and Helix has not put it in their list. The unhelpful answer is silence; the
 * dishonest answer is a paragraph of encouragement. The useful answer is the
 * arithmetic: here is what counted for you, here is what counted against, here is
 * what would change it.
 *
 * Everything below is read out of the match components and the gap analysis that
 * produced the ranking. Nothing is generated, and nothing is softened — if the
 * sector component scored zero, this says the sector component scored zero. That
 * is the whole value of the feature: an explanation that cannot disagree with the
 * number it explains.
 *
 * The separation this file must not blur
 * --------------------------------------
 *
 * Background alignment and professional eligibility are different questions and
 * get different sections, always, even when the answer to both is bad news. "You
 * do not have a clinical background" and "this career requires registration you
 * would have to obtain" are not two ways of saying the same thing, and a person
 * deciding whether to retrain needs to know which one they are facing.
 */

import { domainLabel, lowerLabel } from "./ontology.js";

/**
 * Components at or above this fraction of their available weight are reported
 * as things that helped. Below the lower bound they are reported as things that
 * held the score down. The middle is not reported at all — a component that
 * contributed moderately is not an explanation of anything.
 */
const HELPED_AT = 0.6;
const HURT_BELOW = 0.35;

/**
 * Where a career sits relative to what the person was actually shown.
 *
 * `rank` is its position in the full ranking, so the explanation can say "it was
 * 47th" rather than the vaguer "it did not appear". Position is a fact; whether
 * that is disappointing is not Helix's to say.
 */
export function standing(match, ranked) {
  const position = ranked.findIndex((item) => item.careerId === match.careerId);
  const rank = position >= 0 ? position + 1 : null;
  return {
    rank,
    total: ranked.length,
    score: match.score,
    label: match.label,
    // The explorer surfaces roughly the top of the ranking. A career inside it
    // does not need explaining away, so the interface asks a different question.
    inTopResults: rank !== null && rank <= 12,
  };
}

/**
 * The full explanation.
 *
 * @param {object} match  the same match object that produced the ranking
 * @param {object} gaps   the same gap analysis shown elsewhere on the page
 * @param {object} career the career being explained
 * @returns {{fits, reduced, strengthen, eligibility}}
 */
export function whyNotRecommended(match, gaps, career) {
  const fits = [];
  const reduced = [];

  for (const component of match.components) {
    // A component with no weight cannot have moved the score either way.
    if (!component.weight) continue;

    if (component.fit >= HELPED_AT) {
      fits.push({
        key: component.key,
        label: component.label,
        detail: component.evidence.length
          ? `Helix matched ${listWords(component.evidence.slice(0, 4)
              .map((item) => lowerLabel(String(item.label || item))))}.`
          : "This scored well from your profile as a whole.",
      });
    } else if (component.fit < HURT_BELOW) {
      reduced.push({
        key: component.key,
        label: component.label,
        // Said as a fact about the profile, not about the person. "No commercial
        // experience is identified in your profile" is checkable and fixable;
        // "you lack commercial experience" is a judgement Helix cannot make from
        // a CV it read with a rule-based parser.
        detail: reasonFor(component, career),
        weight: component.weight,
        fit: component.fit,
        // Points this component left on the table. Not a display value — the
        // ordering key, so the list runs heaviest-loss first.
        forgone: component.weight * (1 - component.fit),
      });
    }
  }

  // The heaviest thing counting against comes first: it is the one worth acting
  // on, and ordering by score contribution is the only ordering that matches how
  // the ranking was actually computed.
  reduced.sort((a, b) => b.forgone - a.forgone || a.label.localeCompare(b.label));

  const missing = (match.missingDomains || []).map(domainLabel);
  const strengthen = buildStrengtheners(reduced, missing, gaps, career);

  return {
    fits,
    reduced,
    strengthen,
    eligibility: eligibilityStatement(career, gaps),
    /*
     * Stated once, plainly, at the end of every explanation.
     *
     * A low alignment score means Helix found less overlap with the profile it
     * was given. It is not a prediction about an application and not a comment on
     * whether somebody could do the job — and without saying so, a ranked list
     * quietly becomes a verdict.
     */
    caveat: "This explains a ranking, not your prospects. Helix scores overlap "
          + "between your profile and what a career involves. It does not know "
          + "what you are capable of, and it has never seen a job advert for "
          + "this role.",
  };
}

/** What a weak component means, said in terms of the profile. */
function reasonFor(component, career) {
  switch (component.key) {
    case "domains":
      return "Little of this career's subject matter is identified in your "
           + "profile yet.";
    case "sector":
      return `No exposure to this career's usual sectors is recorded in your `
           + `profile.`;
    case "education":
      return "Your recorded education does not line up with the level this "
           + "career usually expects. That is about what is recorded, not about "
           + "whether you could meet it.";
    case "experience":
      return "The experience recorded in your profile does not map onto what "
           + "this career involves.";
    case "title":
      return `Your current role title has little in common with `
           + `${lowerLabel(career.title)}, so nothing was matched on wording.`;
    case "transferable":
      return "Few of the strengths in your profile were recognised as "
           + "transferable to this career.";
    case "interests":
      return "The interests you selected do not point towards this career.";
    case "registration":
      return "No professional registration relevant to this career is recorded "
           + "in your profile.";
    default:
      return `${component.label} scored low against this career.`;
  }
}

/**
 * What would actually move the number.
 *
 * Only ever things the components and gaps already name. An explanation that
 * suggested "gain leadership experience" when leadership is not part of the score
 * would be advice about a different career.
 */
function buildStrengtheners(reduced, missing, gaps, career) {
  const out = [];

  for (const domain of missing.slice(0, 3)) {
    out.push(`Build evidence of ${lowerLabel(domain)} — it is part of what this `
           + `career involves and nothing in your profile was matched to it.`);
  }

  const bySector = reduced.find((item) => item.key === "sector");
  if (bySector) {
    out.push(`Gain or describe experience in this career's usual sectors. `
           + `Sector exposure is scored separately from skills, so work you have `
           + `already done in a different setting may need translating rather `
           + `than replacing.`);
  }

  const translation = (gaps && gaps.transitions && gaps.transitions.translation)
    || [];
  if (translation.length) {
    out.push(`Rewrite your strongest examples in this career's vocabulary. Helix `
           + `found ${translation.length} `
           + `${translation.length === 1 ? "strength" : "strengths"} you appear `
           + `to hold from a sector that describes ${translation.length === 1
              ? "it" : "them"} differently.`);
  }

  const byTitle = reduced.find((item) => item.key === "title");
  if (byTitle && out.length < 4) {
    out.push("Nothing about your job title needs changing to do this work — but "
           + "a profile that names the activities rather than the post will "
           + "match more of what this career involves.");
  }

  return out.slice(0, 4);
}

/**
 * Professional eligibility, kept entirely separate from alignment.
 *
 * Returns a statement, never a verdict. Helix does not decide who may practise a
 * regulated profession, and a good alignment score must never be allowed to read
 * as permission.
 */
function eligibilityStatement(career, gaps) {
  if (!career.derived.regulated) {
    return {
      regulated: false,
      heading: "Professional route",
      text: "No statutory registration is recorded for this career. Individual "
          + "employers may still set their own requirements.",
    };
  }
  const body = career.regulator_or_body || "the relevant regulator";
  const outstanding = ((gaps && gaps.verifiedRequirements) || [])
    .filter((item) => item.status !== "demonstrated").length;
  return {
    regulated: true,
    heading: "Professional route",
    text: `This career is a regulated profession or protected title. Whether you `
        + `are eligible is decided by ${body}, not by Helix, and it is a `
        + `separate question from how well your background aligns. `
        + (outstanding
            ? `Helix has ${outstanding} verified `
              + `${outstanding === 1 ? "requirement" : "requirements"} recorded `
              + `for it.`
            : `Confirm the current route with them before planning around it.`),
    /*
     * The sentence this whole section exists for.
     *
     * Somebody with a strong alignment score to a regulated career is not
     * thereby qualified for it, and somebody with a weak one is not thereby
     * barred. Both misreadings do real harm, so both are refused here.
     */
    warning: "A high alignment score is not evidence of eligibility, and a low "
           + "one is not evidence that you are ineligible.",
  };
}

function listWords(items) {
  const clean = items.filter(Boolean);
  if (clean.length <= 1) return clean[0] || "";
  return `${clean.slice(0, -1).join(", ")} and ${clean[clean.length - 1]}`;
}
