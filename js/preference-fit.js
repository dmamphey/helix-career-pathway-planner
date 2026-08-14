/**
 * Preference fit: how well a career suits what somebody says they want.
 *
 * The third of Helix's three measures, and deliberately the one that has nothing
 * to do with the user's history. Background alignment answers "how much of this
 * do I already do"; transition effort answers "how big a move is it"; this
 * answers "would I want the job". Blending any two of them produces a single
 * number that cannot be argued with, which is the opposite of decision support.
 * Changing a preference here cannot move an alignment score — `matcher.js` never
 * reads `profile.preferences`, and the suite tests that it stays that way.
 *
 * Three rules govern the arithmetic, and all three exist to stop the score
 * punishing Helix's own ignorance:
 *
 * 1. A dimension is scored only when *both* sides exist — a stated preference and
 *    a career value. Typical weekly hours are recorded for 54 of 677 careers, so
 *    the hours dimension is simply absent for the other 623.
 * 2. The result is normalised over the dimensions actually scored, never over the
 *    full list. Four strong matches out of four available is a very strong fit,
 *    whatever Helix does not know about the rest.
 * 3. Missing career data never subtracts. There is no default, no neutral 0.5
 *    filler and no penalty term: an unknown value leaves the dimension out.
 *
 * A stated tolerance that rules nothing out is also left unscored. Somebody happy
 * to work shifts is not better matched to a shift job than to a nine-to-five one;
 * scoring it would inflate every label they see without telling them anything.
 *
 * The qualitative career values — patient contact, laboratory, research and
 * commercial intensity, remote potential and travel — are inferred from each
 * career's taxonomy rather than surveyed, and the interface says so wherever this
 * result is shown. They are honest inputs to a preference question. They are not
 * labour-market measurements, and nothing here should imply they are.
 */

import * as market from "./market-data.js";
import { PREFERENCE_FIELDS } from "./profile.js";

/** The bands, and the only words the interface may use for them. */
export const FIT_LEVELS = {
  very_strong: { key: "very_strong", rank: 0, min: 0.80, label: "Very strong fit" },
  strong:      { key: "strong",      rank: 1, min: 0.65, label: "Strong fit" },
  mixed:       { key: "mixed",       rank: 2, min: 0.45, label: "Mixed fit" },
  low:         { key: "low",         rank: 3, min: 0,    label: "Low fit" },
  unknown:     { key: "unknown",     rank: 4, min: -1,
                 label: "Not enough preference data" },
};

const BANDS = [FIT_LEVELS.very_strong, FIT_LEVELS.strong, FIT_LEVELS.mixed,
               FIT_LEVELS.low];

/**
 * How much a stated answer counts.
 *
 * A firm answer at either end of a scale is a stronger signal than a shrug, so it
 * carries more weight — but a shrug that still rules something out is not nothing.
 */
const STRONG = 1;
const MODERATE = 0.6;

/**
 * Scoring a three-level career value against a three-level wish.
 *
 * No cell is zero. A mismatch should push a career down the list, not remove it
 * from consideration: people take jobs with parts they did not ask for, and a
 * tool that hid those options would be making the decision instead of supporting
 * it.
 */
const LEVEL_SCORES = {
  seek:  { low: 0.15, medium: 0.60, high: 1.00 },
  some:  { low: 0.55, medium: 1.00, high: 0.70 },
  avoid: { low: 1.00, medium: 0.50, high: 0.10 },
};

const LEVEL_WEIGHTS = { seek: STRONG, some: MODERATE, avoid: STRONG };

/*
 * Remote working and travel are not the same shape of question as patient
 * contact or laboratory work.
 *
 * "Some laboratory work is fine" really does peak in the middle — a wish for a
 * moderate amount. "Remote working would be nice" does not: more of it is better,
 * it just matters less than for somebody who called it important. Travel runs the
 * other way, where less is always better. Scoring either against the middle-peaked
 * table marked a fully remote career down for being too remote, which is not what
 * anybody said.
 */
const MORE_IS_BETTER = {
  strong:   { low: 0.15, medium: 0.60, high: 1.00 },
  moderate: { low: 0.45, medium: 0.80, high: 1.00 },
};

const LESS_IS_BETTER = {
  strong:   { low: 1.00, medium: 0.55, high: 0.15 },
  moderate: { low: 1.00, medium: 0.90, high: 0.55 },
};

/** Work patterns that mean hours outside a standard week. */
const UNSOCIAL_PATTERNS = ["shifts", "evenings and weekends", "on call",
                           "bank holidays"];

/**
 * Assess a career against the profile's stated preferences.
 *
 * @param {object} profile  structured profile, or null
 * @param {object} career   career record from the catalogue
 * @param {object} options  `{ effort }` — the transition-effort result, when the
 *                          caller has one. Retraining tolerance is scored only
 *                          when it is supplied, because effort needs a profile
 *                          and a gap analysis that the card lists do not have.
 * @returns {object} fit result; `scored` is false when nothing could be compared
 */
export function preferenceFit(profile, career, options = {}) {
  const prefs = (profile && profile.preferences) || {};
  const work = market.workLife(career.id);
  const pay = market.salary(career.id);
  const record = market.forCareer(career.id);
  const dimensions = [];
  const unscored = [];

  const add = (key, label, score, weight, note) => {
    if (score === null) return;
    dimensions.push({ key, label, score, weight, note });
  };
  const skip = (key, label, why) => unscored.push({ key, label, why });

  /* --- pay ------------------------------------------------------------- */
  if (prefs.salaryTarget) {
    if (pay) {
      // Weighted by how much pay matters. Somebody who set a target but said pay
      // is not important still gets it scored, at half the weight of a dimension
      // they feel strongly about.
      const weight = { high: 2, medium: 1, low: 0.5 }[prefs.earningsImportance] || 1;
      add("salary", "Salary target", salaryScore(pay, prefs.salaryTarget), weight,
          salaryNote(pay, prefs.salaryTarget));
    } else {
      skip("salary", "Salary target", "no salary record for this career");
    }
  }

  /* --- hours and pattern ------------------------------------------------ */
  // "Not important" is left unscored on purpose: it is an answer, but it is the
  // answer that hours should not influence the result.
  if (prefs.workLifeBalance && prefs.workLifeBalance !== "low") {
    if (work && Number.isFinite(work.hoursMax)) {
      const score = hoursScore(work.hoursMax, prefs.workLifeBalance);
      add("hours", "Typical hours", score,
          prefs.workLifeBalance === "high" ? STRONG : MODERATE,
          `Contained hours matter to you, ${score >= 0.6 ? "and" : "but"} an `
          + `official profile records ${work.hours} for this career.`);
    } else {
      skip("hours", "Typical hours",
           "no official profile records typical weekly hours for this career");
    }
  }

  if (prefs.unsocialHours && prefs.unsocialHours !== "willing") {
    if (work && work.patterns.length) {
      const unsocial = work.patterns.filter(
        (pattern) => UNSOCIAL_PATTERNS.includes(pattern));
      add("pattern", "Working pattern",
          patternScore(unsocial.length, prefs.unsocialHours),
          prefs.unsocialHours === "prefer_standard" ? STRONG : MODERATE,
          unsocial.length
            ? `Recorded working pattern includes ${listWords(unsocial)}.`
            : "No shift, evening, weekend or on-call pattern is recorded.");
    } else {
      skip("pattern", "Working pattern",
           "no official profile records this career's working pattern");
    }
  }

  /* --- where and how ---------------------------------------------------- */
  if (prefs.remoteWorking && prefs.remoteWorking !== "not_important") {
    const firm = prefs.remoteWorking === "important";
    const score = scaleScore(MORE_IS_BETTER, firm, work && work.remote);
    if (score === null) {
      skip("remote", "Remote or hybrid working",
           "this career has no recorded remote or hybrid potential");
    } else {
      add("remote", "Remote or hybrid working", score,
          firm ? STRONG : MODERATE,
          `Remote or hybrid working ${firm ? "matters to you" : "would suit you"}, `
          + `${score >= 0.6 ? "and" : "but"} this career's potential for it is `
          + `${work.remote}.`);
    }
  }

  if (prefs.travelTolerance && prefs.travelTolerance !== "happy") {
    const firm = prefs.travelTolerance === "minimal";
    const score = scaleScore(LESS_IS_BETTER, firm, work && work.travel);
    if (score === null) {
      skip("travel", "Travel", "this career has no recorded travel level");
    } else {
      add("travel", "Travel", score, firm ? STRONG : MODERATE,
          `You want ${firm ? "travel kept to a minimum" : "only some travel"}, `
          + `${score >= 0.6 ? "and" : "but"} this career's is recorded as `
          + `${work.travel}.`);
    }
  }

  /* --- the kind of work -------------------------------------------------- */
  const orientationPairs = [
    ["patientContact", "patient", "Patient contact", work && work.patientContact],
    ["laboratoryWork", "laboratory", "Laboratory work", work && work.laboratory],
    ["researchWork", "research", "Research", work && work.research],
    ["commercialWork", "commercial", "Commercial work", work && work.commercial],
  ];
  for (const [prefKey, key, label, value] of orientationPairs) {
    const wish = prefs[prefKey];
    if (!wish) continue;
    const score = levelScore(value, wish);
    if (score === null) skip(key, label, "this career has no recorded level");
    else {
      add(key, label, score, LEVEL_WEIGHTS[wish],
          orientationNote(label, wish, value, score));
    }
  }

  // Leadership has no market-data field of its own, so it is read from the
  // taxonomy's own orientation plus the career's seniority class. Both are
  // properties of the career rather than of any survey, and it is described that
  // way wherever it is shown.
  if (prefs.leadershipWork) {
    const level = leadershipLevel(career, record);
    const score = levelScore(level, prefs.leadershipWork);
    add("leadership", "Leading teams or services", score,
        LEVEL_WEIGHTS[prefs.leadershipWork],
        orientationNote("leadership content", prefs.leadershipWork, level, score));
  }

  /* --- appetite for change ---------------------------------------------- */
  if (prefs.retrainingTolerance && prefs.retrainingTolerance !== "willing") {
    if (options.effort) {
      add("retraining", "Retraining required",
          retrainingScore(options.effort.key, prefs.retrainingTolerance),
          prefs.retrainingTolerance === "minimal" ? STRONG : MODERATE,
          `Moving into it looks like a ${options.effort.label.toLowerCase()}.`);
    } else {
      skip("retraining", "Retraining required",
           "this needs a profile, so Helix can work out the transition for you");
    }
  }

  return summarise(dimensions, unscored);
}

/* ------------------------------------------------------------- scoring parts */

/**
 * Salary against a target.
 *
 * Three cases, because they mean different things. A range whose bottom already
 * clears the target is a match at any point in it. A range that reaches the
 * target higher up is a partial match, scored by how far into the range the
 * target sits — reaching it at the very top is worth less than reaching it early.
 * A range that never reaches it falls away with the size of the shortfall, and
 * bottoms out rather than hitting zero.
 */
function salaryScore(pay, target) {
  if (pay.low >= target) return 1;
  if (pay.high >= target) {
    const through = (target - pay.low) / Math.max(1, pay.high - pay.low);
    return 0.95 - (through * 0.4);
  }
  const shortfall = (target - pay.high) / target;
  return Math.max(0.1, 0.5 - shortfall);
}

function salaryNote(pay, target) {
  if (pay.low >= target) {
    return `The whole typical range is at or above your ${market.money(target)} `
         + `target.`;
  }
  if (pay.high >= target) {
    return `The typical range reaches your ${market.money(target)} target towards `
         + `the upper end.`;
  }
  return `The typical range tops out at ${market.money(pay.high)}, below your `
       + `${market.money(target)} target.`;
}

function hoursScore(hoursMax, importance) {
  if (importance === "high") {
    if (hoursMax <= 37) return 1;
    if (hoursMax <= 40) return 0.8;
    if (hoursMax <= 45) return 0.45;
    return 0.2;
  }
  if (hoursMax <= 40) return 0.9;
  if (hoursMax <= 45) return 0.7;
  return 0.45;
}

function patternScore(unsocialCount, tolerance) {
  const band = unsocialCount === 0 ? "none" : unsocialCount === 1 ? "some" : "many";
  if (tolerance === "prefer_standard") {
    return { none: 1, some: 0.45, many: 0.15 }[band];
  }
  return { none: 1, some: 0.75, many: 0.45 }[band];
}

function retrainingScore(effortKey, tolerance) {
  if (tolerance === "minimal") {
    return { lower: 1, moderate: 0.7, substantial: 0.3, major: 0.1 }[effortKey]
      ?? null;
  }
  return { lower: 1, moderate: 1, substantial: 0.6, major: 0.3 }[effortKey] ?? null;
}

/** A three-level career value against a three-level wish. Unknown means unscored. */
function levelScore(value, wish) {
  const table = LEVEL_SCORES[wish];
  if (!table || !value || !(value in table)) return null;
  return table[value];
}

/** A one-directional scale, at either the firm or the moderate strength. */
function scaleScore(scale, firm, value) {
  const table = scale[firm ? "strong" : "moderate"];
  if (!value || !(value in table)) return null;
  return table[value];
}

/**
 * A note that says both halves of the comparison.
 *
 * "Commercial work is low" is a fact about the career, and on its own it does not
 * explain why it was listed as a reason — the reader has to remember what they
 * asked for and work out the connection. Naming the preference and joining the
 * two with "and" or "but" makes each line stand up by itself, which matters
 * because these lines are also what the PDF and the comparison table carry.
 */
function orientationNote(label, wish, value, score) {
  const subject = label.toLowerCase();
  const wanted = {
    seek: `You want a lot of ${subject}`,
    some: `You are happy with some ${subject}`,
    avoid: `You would rather avoid ${subject}`,
  }[wish];
  const joiner = score >= 0.6 ? "and" : "but";
  return `${wanted}, ${joiner} this career's is ${value}.`;
}

function leadershipLevel(career, record) {
  const orientation = ((career.derived || {}).orientations || [])
    .includes("leadership");
  const senior = ["manager", "executive"]
    .includes((record || {}).seniority_class);
  if (orientation && senior) return "high";
  if (orientation || senior) return "medium";
  return "low";
}

/* ------------------------------------------------------------------ summary */

/**
 * Turn the scored dimensions into a label and an explanation.
 *
 * The reasons are ordered by how much each one actually moved the result —
 * weight times distance from the middle — so the first thing somebody reads is
 * the thing that most decided the answer, not whichever dimension happened to be
 * evaluated first. Ties break on the dimension key, so the order is stable.
 */
function summarise(dimensions, unscored) {
  if (!dimensions.length) {
    return {
      scored: false,
      score: null,
      ...FIT_LEVELS.unknown,
      summary: "No preference you have stated could be compared with what Helix "
             + "knows about this career.",
      reasons: [],
      mismatches: [],
      dimensions: [],
      unscored,
      explain: "Not enough preference data to judge fit for this career.",
    };
  }

  const totalWeight = dimensions.reduce((sum, item) => sum + item.weight, 0);
  const score = dimensions.reduce(
    (sum, item) => sum + (item.score * item.weight), 0) / totalWeight;
  const level = BANDS.find((band) => score >= band.min) || FIT_LEVELS.low;

  const salience = (item) => item.weight * Math.abs(item.score - 0.5);
  const ordered = [...dimensions].sort((a, b) =>
    salience(b) - salience(a) || a.key.localeCompare(b.key));

  const reasons = ordered.filter((item) => item.score >= 0.75)
    .map((item) => ({ key: item.key, label: item.label, text: item.note }));
  const mismatches = ordered.filter((item) => item.score <= 0.45)
    .map((item) => ({ key: item.key, label: item.label, text: item.note }));

  return {
    scored: true,
    score,
    key: level.key,
    rank: level.rank,
    label: level.label,
    summary: `${level.label}, from ${dimensions.length} of your stated `
           + `preference${dimensions.length === 1 ? "" : "s"} that Helix could `
           + `compare with this career.`,
    reasons,
    mismatches,
    dimensions: ordered,
    unscored,
    explain: `${level.label}. `
           + (reasons.length ? `${reasons[0].text} ` : "")
           + (mismatches.length ? `Possible mismatch: ${mismatches[0].text}` : ""),
  };
}

/**
 * Which preference keys the fit model can actually use.
 *
 * Exported so the preferences screen can say plainly that an answer will be used,
 * and so a test can catch a question being added without a scoring rule behind it.
 */
export const SCORED_PREFERENCE_KEYS = [
  "salaryTarget", "earningsImportance", "workLifeBalance", "unsocialHours",
  "remoteWorking", "travelTolerance", "patientContact", "laboratoryWork",
  "researchWork", "commercialWork", "leadershipWork", "retrainingTolerance",
];

/** Every preference question, grouped, for the preferences screen. */
export function preferenceQuestions() {
  return PREFERENCE_FIELDS;
}

function listWords(items) {
  if (items.length <= 1) return items[0] || "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
