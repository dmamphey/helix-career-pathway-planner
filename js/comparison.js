/**
 * Comparison selection state.
 *
 * Kept deliberately separate from saved careers. Saving is a bookmark — "come back
 * to this". Comparing is a working set — "hold these four side by side while I
 * decide". Conflating them is what forced the old interface to make people save a
 * career before they could compare it, which is a step nobody wants to take.
 *
 * The selection persists, so navigating to a career and back does not lose it, and
 * it migrates in alongside existing saved data rather than replacing anything.
 */

import { lowerLabel } from "./ontology.js";

export const MIN_COMPARE = 2;
export const MAX_COMPARE = 4;

/** Normalise a stored list: valid career ids, unique, capped. */
export function normaliseIds(value) {
  const out = [];
  for (const id of Array.isArray(value) ? value : []) {
    if (typeof id === "string" && /^CP-\d{1,5}$/.test(id) && !out.includes(id)) {
      out.push(id);
    }
    if (out.length >= MAX_COMPARE) break;
  }
  return out;
}

/**
 * Toggle a career in the selection.
 *
 * Returns what happened so the caller can speak to the user: adding a fifth is a
 * refusal that needs explaining, not a silent no-op.
 */
export function toggle(ids, careerId) {
  const list = [...ids];
  const at = list.indexOf(careerId);
  if (at >= 0) {
    list.splice(at, 1);
    return { ids: list, action: "removed" };
  }
  if (list.length >= MAX_COMPARE) {
    return {
      ids,
      action: "full",
      message: `You can compare up to ${MAX_COMPARE} careers at once. Remove one `
             + `first.`,
    };
  }
  list.push(careerId);
  return { ids: list, action: "added" };
}

export function canCompare(ids) {
  return ids.length >= MIN_COMPARE;
}

/** A shareable route for the current selection. Career ids only, never a profile. */
export function routeFor(ids) {
  return ids.length ? `/compare/${ids.join(",")}` : "/compare";
}

/** Parse ids out of a `#/compare/CP-003,CP-019` route. */
export function idsFromRoute(param) {
  return normaliseIds(String(param || "").split(",").map((part) => part.trim()));
}

/* ----------------------------------------------------- what stands out */

/**
 * Deterministic observations about a set of careers.
 *
 * Facts the loaded data supports, and nothing else. It never names a "best"
 * career: the whole point of comparing is that the trade-off belongs to the person
 * making it. Each observation says which career and why, so it can be checked
 * against the table below it.
 */
export function standoutSummary(entries) {
  const notes = [];
  if (entries.length < MIN_COMPARE) return notes;

  const withSalary = entries.filter((entry) => entry.salary);
  if (withSalary.length >= 2) {
    const best = withSalary.reduce((top, entry) =>
      entry.salary.high > top.salary.high ? entry : top);
    const others = withSalary.filter((entry) => entry !== best);
    if (others.every((entry) => entry.salary.high < best.salary.high)) {
      notes.push({
        kind: "salary",
        text: `${best.career.title} has the highest typical salary range of these `
            + `options, reaching ${best.salary.range.split(" to ")[1]}.`
            + (best.salary.evidenceRank >= 2
                ? ` That figure is ${lowerLabel(best.salary.evidenceLabel)}, so `
                  + `treat it as a broad indication.`
                : ""),
      });
    }
  }

  const withAlignment = entries.filter((entry) => entry.match);
  if (withAlignment.length >= 2) {
    const best = withAlignment.reduce((top, entry) =>
      entry.match.score > top.match.score ? entry : top);
    notes.push({
      kind: "alignment",
      text: `${best.career.title} has the closest overlap with your current `
          + `profile (${lowerLabel(best.match.label)}).`,
    });
  }

  const withEffort = entries.filter((entry) => entry.effort);
  if (withEffort.length >= 2) {
    const easiest = withEffort.reduce((low, entry) =>
      entry.effort.rank < low.effort.rank ? entry : low);
    const hardest = withEffort.reduce((high, entry) =>
      entry.effort.rank > high.effort.rank ? entry : high);
    if (easiest !== hardest) {
      notes.push({
        kind: "effort",
        text: `${easiest.career.title} looks like the smaller move from where you `
            + `are (${lowerLabel(easiest.effort.label)}); `
            + `${hardest.career.title} would be the larger one `
            + `(${lowerLabel(hardest.effort.label)}).`,
      });
    }
  }

  const withFit = entries.filter((entry) => entry.fit && entry.fit.scored);
  if (withFit.length >= 2) {
    const best = withFit.reduce((top, entry) =>
      entry.fit.score > top.fit.score ? entry : top);
    notes.push({
      kind: "preference",
      text: `${best.career.title} fits your stated priorities best of these `
          + `(${lowerLabel(best.fit.label)}).`,
    });
  }

  const regulated = entries.filter((entry) => entry.career.derived.regulated);
  if (regulated.length && regulated.length < entries.length) {
    notes.push({
      kind: "regulation",
      text: `${regulated.map((entry) => entry.career.title).join(" and ")} `
          + `${regulated.length === 1 ? "is" : "are"} associated with a regulated `
          + `profession or protected title, so entry requirements must be `
          + `confirmed with the regulator. The others are not.`,
    });
  }

  const withHours = entries.filter(
    (entry) => entry.work && Number.isFinite(entry.work.hoursMax));
  if (withHours.length >= 2) {
    const lowest = withHours.reduce((low, entry) =>
      entry.work.hoursMax < low.work.hoursMax ? entry : low);
    const highest = withHours.reduce((high, entry) =>
      entry.work.hoursMax > high.work.hoursMax ? entry : high);
    if (lowest.work.hoursMax !== highest.work.hoursMax) {
      notes.push({
        kind: "hours",
        text: `Typical weekly hours are lower for ${lowest.career.title} `
            + `(${lowest.work.hours}) than ${highest.career.title} `
            + `(${highest.work.hours}).`,
      });
    }
  }

  return notes;
}
