/**
 * The development timeline: 90 days, 6 months, 12 months, longer term.
 *
 * The next three actions answer "what do I do now". This answers "and then
 * what" — and the two must never disagree, which is why the timeline is built
 * from the same actions, the same gaps and the same bridge roles rather than
 * from a second opinion about the same career.
 *
 * How a milestone gets its horizon
 * --------------------------------
 *
 * Not by spreading items evenly to fill four buckets. A horizon is a claim about
 * dependency and duration:
 *
 *   90 days   things that block everything else, and things that cost only time
 *             and initiative — confirmations, training, translation, first
 *             conversations
 *   6 months  work that needs a real piece of work to attach itself to
 *   12 months the move itself: applying, or stepping into a bridge role
 *   longer    the destination, and anything gated by a formal programme
 *
 * A bucket can be empty, and is left empty. Padding a timeline to look complete
 * is how a plan becomes a horoscope.
 *
 * What the user owns
 * ------------------
 *
 * Helix proposes; the person disposes. Every milestone can be completed, dated,
 * annotated or dismissed, and those edits live in a separate store so that
 * regenerating the plan — after a profile change, say — never silently
 * overwrites somebody's own dates.
 */

import { lowerLabel } from "./ontology.js";

export const HORIZONS = [
  { key: "90_days", label: "Next 90 days", days: 90,
    lede: "What to start now, in the job you already have." },
  { key: "6_months", label: "Next 6 months", days: 182,
    lede: "Work that needs something real to attach itself to." },
  { key: "12_months", label: "Next 12 months", days: 365,
    lede: "The move itself, or the step that makes it reachable." },
  { key: "longer", label: "Longer term", days: 730,
    lede: "The destination, and anything gated by a formal programme." },
];

const HORIZON_KEYS = HORIZONS.map((horizon) => horizon.key);

/**
 * Build the timeline.
 *
 * @param {object} options.career   the target career
 * @param {Array}  options.actions  the elaborated next three actions
 * @param {object} options.gaps     the gap analysis
 * @param {object} options.effort   transition effort
 * @param {object} options.bridge   bridge-engine result
 * @param {object} options.saved    the user's own edits, from storage
 * @returns {{horizons: Array, counts: object, note: string}}
 */
export function buildTimeline({ career, actions, gaps, effort, bridge,
                                saved = {} }) {
  const milestones = [];
  const seen = new Set();

  const push = (milestone) => {
    if (seen.has(milestone.id)) return;
    seen.add(milestone.id);
    milestones.push(milestone);
  };

  /* The three actions come first and keep the horizon they were given. ------ */
  for (const action of actions) {
    push({
      id: action.milestoneId || `action-${action.id}`,
      horizon: HORIZON_KEYS.includes(action.horizon) ? action.horizon : "90_days",
      title: action.title,
      detail: action.detail,
      why: action.why,
      source: "action",
      position: action.position,
      activities: action.activities || [],
      completionCriteria: action.completionCriteria || "",
      evidenceExamples: action.evidenceExamples || [],
      sourceUrl: action.sourceUrl || "",
    });
  }

  /* Gaps the three actions did not reach. ---------------------------------- */
  const covered = new Set(actions.map((action) => action.domain).filter(Boolean));
  const remaining = (gaps.items || [])
    .filter((item) => item.status === "action_required")
    .filter((item) => item.category !== "optional")
    .filter((item) => !covered.has(item.domain));

  remaining.slice(0, 4).forEach((item, index) => {
    push({
      id: `gap-${item.domain || item.id}`,
      // The first couple are reachable inside six months; the rest are a year's
      // work, because they are being done alongside a full-time job.
      horizon: index < 2 ? "6_months" : "12_months",
      title: `Build ${lowerLabel(item.title)}`,
      detail: item.detail,
      why: "A development gap the first three actions did not cover.",
      source: "gap",
      completionCriteria: "You can point to one piece of work in this area with "
                        + "your own contribution named.",
    });
  });

  /* The bridge role, where one exists. ------------------------------------- */
  if (bridge && bridge.hasBridge) {
    const first = bridge.bridges[0];
    push({
      id: `bridge-${first.career.id}`,
      horizon: "12_months",
      title: `Consider a move to ${first.career.title}`,
      detail: `${first.whyItHelps} ${first.optional}`,
      why: "It reduces the size of the final step, and it is a real job rather "
         + "than a course.",
      source: "bridge",
      careerId: first.career.id,
      completionCriteria: "You are in the role, or have decided against it for "
                        + "a reason you could explain.",
    });
  }

  /* The destination. ------------------------------------------------------- */
  const gated = Boolean(
    (gaps.verifiedRequirements || []).some((item) => item.status !== "demonstrated")
    || (gaps.byCategory && (gaps.byCategory.get("needs_confirmation") || []).length));

  push({
    id: "destination",
    // A formal route puts the destination beyond a year however keen somebody
    // is; without one, applying is a twelve-month goal.
    horizon: gated || (effort && effort.rank >= 2) ? "longer" : "12_months",
    title: `Apply for ${career.title} roles`,
    detail: gated
      ? `Entry to ${career.title} runs through a formal route or a requirement `
      + `that must be confirmed, so the timing depends on that route rather `
      + `than on the development work above.`
      : `By this point the development work above should be showing on your CV `
      + `rather than in your plans.`,
    why: "It is the point of everything above it.",
    source: "destination",
    completionCriteria: "You have applied, and can name what in your profile "
                      + "answers each requirement in the advert.",
  });

  /* The user's own edits, applied last so they always win. ------------------ */
  const withEdits = milestones.map((milestone) => {
    const edit = saved[milestone.id] || {};
    return {
      ...milestone,
      horizon: HORIZON_KEYS.includes(edit.horizon) ? edit.horizon : milestone.horizon,
      status: edit.status || "not_started",
      due: edit.due || "",
      note: edit.note || "",
      suggestedDue: suggestedDate(
        HORIZON_KEYS.includes(edit.horizon) ? edit.horizon : milestone.horizon),
      edited: Boolean(edit.horizon || edit.due || edit.note),
    };
  });

  const horizons = HORIZONS.map((horizon) => ({
    ...horizon,
    milestones: withEdits
      .filter((milestone) => milestone.horizon === horizon.key)
      .sort((a, b) => (a.position || 99) - (b.position || 99)
        || a.title.localeCompare(b.title)),
  }));

  const done = withEdits.filter((item) => item.status === "completed").length;

  return {
    horizons,
    counts: {
      total: withEdits.length,
      done,
      percent: withEdits.length
        ? Math.round((done / withEdits.length) * 100) : 0,
    },
    note: gated
      ? "This career has a formal or unconfirmed entry route, so the last step "
      + "sits beyond twelve months. Confirming the route is the thing that "
      + "would change that, which is why it is near the top."
      : "",
  };
}

/**
 * A date Helix suggests for a horizon.
 *
 * Offered as a placeholder, never written into storage on the user's behalf.
 * A stored date should mean "somebody decided this", so an automatic one would
 * make the field useless the moment it mattered.
 */
export function suggestedDate(horizonKey, from = new Date()) {
  const horizon = HORIZONS.find((item) => item.key === horizonKey) || HORIZONS[0];
  const date = new Date(from.getTime());
  date.setDate(date.getDate() + horizon.days);
  return date.toISOString().slice(0, 10);
}

/** The horizon a date falls in, for when somebody sets their own. */
export function horizonForDate(isoDate, from = new Date()) {
  const target = new Date(isoDate);
  if (!Number.isFinite(target.valueOf())) return null;
  const days = (target - from) / 86400000;
  for (const horizon of HORIZONS) {
    if (days <= horizon.days) return horizon.key;
  }
  return "longer";
}

/** A flat list for the printed plan, in horizon order. */
export function flatten(timeline) {
  const out = [];
  for (const horizon of timeline.horizons) {
    for (const milestone of horizon.milestones) {
      out.push({ ...milestone, horizonLabel: horizon.label });
    }
  }
  return out;
}
