/**
 * Building the pathway.
 *
 * A pathway is a sequence of milestones from where the user is to the career they
 * chose. Where a rule pack exists, its researched milestones are used. Where one
 * does not — which is the case for most of 716 careers — the pathway is generated
 * from the gap analysis, so it is still specific to this person and this career
 * rather than a generic ladder of invented job titles.
 *
 * The depth field controls how much structure is built, never how trustworthy the
 * content is. An Explorer career gets a shorter pathway because less has been
 * researched about it, and the interface says so.
 */

import { domainLabel, lowerLabel } from "./ontology.js";
import { GAP_STATUS } from "./gap-engine.js";

/** Milestone statuses. Every one has text, never colour alone. */
export const MILESTONE_STATUS = {
  completed: { label: "Completed", symbol: "✓" },
  in_progress: { label: "In progress", symbol: "◐" },
  action_required: { label: "Action required", symbol: "!" },
  needs_confirmation: { label: "Needs official confirmation", symbol: "?" },
  future: { label: "Future milestone", symbol: "○" },
};

/**
 * Build the pathway for a career.
 *
 * @param {object} profile  structured profile
 * @param {object} match    matcher result
 * @param {object} gaps     gap analysis
 * @param {object|null} pack rule pack, if any
 * @param {object} progress saved milestone states, keyed by milestone id
 */
export function buildPathway(profile, match, gaps, pack, progress = {}) {
  const career = match.career;
  const depth = career.pathway_depth;
  const milestones = pack && pack.milestones.length
    ? fromPack(pack, gaps)
    : generated(profile, match, gaps, depth);

  const start = {
    id: "__start",
    kind: "start",
    title: profile.currentRole || "Your current position",
    meaning: profile.currentCareerFamily
      ? `Recorded in ${profile.currentCareerFamily}.`
      : "Recorded from your profile.",
    status: "completed",
    fixed: true,
  };

  const withProgress = milestones.map((milestone) => {
    const saved = progress[milestone.id];
    return {
      ...milestone,
      status: saved === "completed" || saved === "in_progress"
        ? saved : milestone.status,
      userSet: saved === "completed" || saved === "in_progress",
    };
  });

  const total = withProgress.length;
  const done = withProgress.filter((m) => m.status === "completed").length;
  const active = withProgress.filter((m) => m.status === "in_progress").length;

  return {
    careerId: career.id,
    depth,
    fromRulePack: Boolean(pack && pack.milestones.length),
    entryRoutes: pack ? pack.entryRoutes : [],
    bridgeRoles: pack ? pack.bridgeRoles : [],
    progression: pack ? pack.progression : [],
    nodes: [start, ...withProgress],
    milestones: withProgress,
    completion: { total, done, active,
      percent: total ? Math.round((done / total) * 100) : 0 },
    expansionNote: depth === "Explorer"
      ? "This career is at Explorer depth in the current dataset: the pathway "
      + "below is generated from your profile and the career's metadata. Deeper "
      + "route-specific content is being expanded."
      : "",
  };
}

/** A researched pathway. Statuses come from the gap analysis. */
function fromPack(pack, gaps) {
  const statusByDomain = new Map();
  for (const item of gaps.items) {
    if (!item.domain) continue;
    const existing = statusByDomain.get(item.domain);
    if (!existing || GAP_STATUS[item.status].rank > GAP_STATUS[existing].rank) {
      statusByDomain.set(item.domain, item.status);
    }
  }
  const gateNeedsConfirmation = gaps.requiresOfficialConfirmation;

  return pack.milestones.map((milestone) => ({
    id: milestone.id,
    kind: milestone.kind,
    title: milestone.title,
    meaning: milestone.meaning,
    why: milestone.why,
    action: milestone.action,
    domain: milestone.domain,
    sourceCode: milestone.sourceCode,
    evidence: [],
    status: milestone.kind === "gate" && gateNeedsConfirmation
      ? "needs_confirmation"
      : milestone.kind === "role"
        ? "future"
        : mapGapStatus(statusByDomain.get(milestone.domain)),
  }));
}

function mapGapStatus(status) {
  if (status === "demonstrated") return "completed";
  if (status === "developing") return "in_progress";
  if (status === "needs_confirmation") return "needs_confirmation";
  if (status === "action_required") return "action_required";
  return "future";
}

/**
 * A generated pathway.
 *
 * The shape is always the same — confirm, then develop, then evidence, then the
 * role itself — because that is the order the work actually has to happen in. The
 * content is drawn from this person's gaps against this career.
 */
function generated(profile, match, gaps, depth) {
  const career = match.career;
  const milestones = [];

  const confirmation = gaps.items.filter(
    (item) => item.category === "needs_confirmation");
  for (const item of confirmation) {
    milestones.push({
      id: `confirm_${item.id}`,
      kind: "gate",
      title: item.title,
      meaning: item.detail,
      why: "Requirements for regulated and approved routes are set by the "
         + "official body, not by Helix, and they can change.",
      action: "Confirm your position with the official body before committing "
            + "time or money to a route.",
      domain: item.domain,
      sourceCode: item.sourceCode || "",
      status: "needs_confirmation",
    });
  }

  const strengths = gaps.items.filter((item) => item.status === "demonstrated");
  if (strengths.length) {
    milestones.push({
      id: "existing_strengths",
      kind: "development",
      title: "Existing strengths this career uses",
      meaning: strengths.slice(0, 6).map((item) => item.title).join(", ") + ".",
      why: "These are the parts of the move you do not have to build from "
         + "nothing. They are also what an application should lead with.",
      action: "Write these up as concrete examples with outcomes attached.",
      domain: "",
      status: "completed",
    });
  }

  // One milestone per genuine development gap, most heavily weighted first, so a
  // long list of small gaps does not turn into a wall of steps.
  const developmentGaps = gaps.items
    .filter((item) => item.status === "action_required" && item.domain)
    .slice(0, depth === "Explorer" ? 2 : depth === "Deep" ? 4 : 3);
  for (const item of developmentGaps) {
    milestones.push({
      id: `develop_${item.domain || item.id}`,
      kind: "development",
      title: `Build ${lowerLabel(domainLabel(item.domain))}`,
      meaning: item.detail,
      why: `${domainLabel(item.domain)} is part of what this career is `
         + "described as involving, and is not yet identified in your profile.",
      action: `Find a route to real exposure: a course, a project, a secondment, `
            + `or a piece of work in your current role that involves `
            + `${lowerLabel(domainLabel(item.domain))}.`,
      domain: item.domain,
      status: "action_required",
    });
  }

  if (gaps.transitions.translation.length) {
    milestones.push({
      id: "translate_experience",
      kind: "evidence",
      title: "Translate your experience into this sector's language",
      meaning: "You appear to hold "
        + gaps.transitions.translation.slice(0, 4)
            .map((item) => lowerLabel(item.label)).join(", ")
        + ", but from a different sector.",
      why: "Recruiters in a new sector often miss relevant experience because it "
         + "is described in the vocabulary of the old one.",
      action: "Rewrite your two strongest examples using the terms this career "
            + "uses, and check them against a real job advert.",
      domain: "",
      status: "action_required",
    });
  }

  milestones.push({
    id: "build_evidence",
    kind: "evidence",
    title: "Create evidence you can point at",
    meaning: "A completed piece of work — an audit, a project, a validation, a "
           + "training package, a dataset, a publication — that demonstrates the "
           + "capability rather than asserting it.",
    why: "Recruitment in this sector rewards demonstrated activity over stated "
       + "intent.",
    action: "Pick one gap above and produce a documented output within three "
          + "months.",
    domain: "",
    status: "action_required",
  });

  milestones.push({
    id: "target_role",
    kind: "role",
    title: career.title,
    meaning: `The destination: ${career.family}.`
      + (career.derived.regulated
        ? " Entry is subject to the professional requirements confirmed above."
        : ""),
    why: "",
    action: "Apply when the milestones above are in place, or apply to a bridge "
          + "role first if the gap is large.",
    domain: "",
    status: "future",
  });

  return milestones;
}

/** Evidence from the profile that supports a milestone's domain. */
export function evidenceFor(profile, domain) {
  if (!domain) return [];
  const keys = ["technicalSkills", "transferableSkills", "leadershipSignals",
    "trainingSignals", "qualitySignals", "researchSignals", "digitalSignals",
    "commercialSignals"];
  for (const key of keys) {
    const found = (profile[key] || []).find((signal) => signal.domain === domain);
    if (found) return found.evidence;
  }
  return [];
}
