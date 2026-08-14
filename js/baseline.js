/**
 * Comparing against where you already are.
 *
 * A comparison table answers "how do these four differ". A baseline answers a
 * different and usually more useful question: "how would each of these differ
 * from what I do now". The second is what people actually want, and it is the one
 * that produces a number somebody can weigh — +£8,500, two hours a week more,
 * less patient contact.
 *
 * The rule this module exists to enforce
 * --------------------------------------
 *
 * **Numbers only where numbers were measured.** Salary and weekly hours are
 * numeric, so their differences are numeric. Patient contact, travel and remote
 * potential are recorded as low / medium / high — ordered words, not measured
 * quantities. Subtracting them would produce "+1 patient contact", which looks
 * like a measurement and is not one. Those get a direction and a word.
 *
 * That is why `delta()` and `shift()` are separate functions rather than one
 * function with a flag. The distinction is the point, and a flag would let a
 * caller lose it by accident.
 */

import { money } from "./market-data.js";

/** The ordered qualitative levels, weakest first. `unknown` sits outside. */
const SCALE = ["none", "low", "medium", "high"];

/**
 * How far apart two levels are, in words rather than points.
 *
 * Capitalised because each one stands alone as a value in a list, not as the
 * middle of a sentence.
 */
const DISTANCE_WORDS = {
  1: ["Slightly higher", "Slightly lower"],
  2: ["Higher", "Lower"],
  3: ["Much higher", "Much lower"],
};

/**
 * A numeric difference, with the words to say it.
 *
 * Returns null when either side is missing — an absent figure produces "not
 * comparable", never a difference computed against zero.
 */
export function delta(baselineValue, otherValue, { unit = "", format = null } = {}) {
  if (!Number.isFinite(baselineValue) || !Number.isFinite(otherValue)) return null;
  const difference = otherValue - baselineValue;
  const render = format || ((value) => `${value}${unit}`);
  const same = difference === 0;
  return {
    numeric: true,
    difference,
    same,
    direction: same ? "same" : (difference > 0 ? "up" : "down"),
    label: same
      ? "The same"
      : `${difference > 0 ? "+" : "−"}${render(Math.abs(difference))}`,
    percent: baselineValue ? Math.round((difference / baselineValue) * 1000) / 10 : null,
  };
}

/** A salary difference, compared at the midpoint of each range. */
export function salaryDelta(baselinePay, otherPay) {
  if (!baselinePay || !otherPay) return null;
  const mid = (pay) => (pay.low + pay.high) / 2;
  const result = delta(mid(baselinePay), mid(otherPay), { format: money });
  if (!result) return null;
  return {
    ...result,
    /*
     * Both ranges are estimates with their own evidence classes, and comparing
     * two indicative midpoints produces a difference no better evidenced than
     * the weaker of them. Saying so beside the number is the difference between
     * a comparison and a false precision.
     */
    weakestEvidence: baselinePay.evidenceRank >= otherPay.evidenceRank
      ? baselinePay.evidenceLabel : otherPay.evidenceLabel,
    caveat: "Compared at the midpoint of each range. Both are estimates, so "
          + "treat the difference as a direction rather than a figure.",
  };
}

/**
 * A qualitative shift, in words.
 *
 * Never returns a number. "Much higher" is the strongest thing this can say,
 * because the underlying data is three ordered words and a fourth for unknown.
 */
export function shift(baselineLevel, otherLevel) {
  const from = SCALE.indexOf(String(baselineLevel || "").toLowerCase());
  const to = SCALE.indexOf(String(otherLevel || "").toLowerCase());
  if (from < 0 || to < 0) {
    return {
      numeric: false,
      known: false,
      direction: "unknown",
      label: "Not comparable",
      detail: "One of these careers has no recorded level for this, so Helix "
            + "does not infer a difference.",
    };
  }
  const step = to - from;
  if (step === 0) {
    return { numeric: false, known: true, direction: "same", label: "About the same" };
  }
  const words = DISTANCE_WORDS[Math.min(3, Math.abs(step))];
  return {
    numeric: false,
    known: true,
    direction: step > 0 ? "up" : "down",
    label: step > 0 ? words[0] : words[1],
    detail: `Recorded as ${otherLevel} against ${baselineLevel}.`,
  };
}

/**
 * A difference between two labelled states that have no order at all.
 *
 * Regulation is the case this exists for. "Regulated" and "not regulated" are
 * not more and less of the same thing, so there is no direction to report — only
 * whether the answer changes, and what it changes to.
 */
export function change(baselineLabel, otherLabel) {
  const same = String(baselineLabel) === String(otherLabel);
  return {
    numeric: false,
    known: true,
    direction: same ? "same" : "different",
    label: same ? "Unchanged" : String(otherLabel),
    detail: same ? "" : `Different from ${baselineLabel}.`,
  };
}

/**
 * Assemble every comparable difference between the baseline and one career.
 *
 * Each entry carries its own kind, so the interface can style a measured
 * difference differently from a directional one without having to guess which is
 * which from the text.
 */
export function differences(baseline, other) {
  const rows = [];

  rows.push({
    key: "salary",
    label: "Typical salary",
    kind: "numeric",
    value: salaryDelta(baseline.salary, other.salary),
  });

  rows.push({
    key: "hours",
    label: "Typical weekly hours",
    kind: "numeric",
    value: (baseline.work && other.work)
      ? delta(baseline.work.hoursMax, other.work.hoursMax, { unit: " hrs" })
      : null,
  });

  const levels = [
    ["patientContact", "Patient contact"],
    ["laboratory", "Laboratory work"],
    ["research", "Research"],
    ["commercial", "Commercial orientation"],
    ["remote", "Remote or hybrid potential"],
    ["travel", "Travel"],
  ];
  for (const [key, label] of levels) {
    rows.push({
      key,
      label,
      kind: "qualitative",
      value: shift(baseline.work && baseline.work[key],
                   other.work && other.work[key]),
    });
  }

  rows.push({
    key: "regulation",
    label: "Professional regulation",
    kind: "categorical",
    value: change(regulationWord(baseline.career), regulationWord(other.career)),
  });

  rows.push({
    key: "family",
    label: "Career family",
    kind: "categorical",
    value: change(baseline.career.family, other.career.family),
  });

  return rows;
}

function regulationWord(career) {
  return career.derived.regulated ? "Regulated or protected title" : "Not regulated";
}
