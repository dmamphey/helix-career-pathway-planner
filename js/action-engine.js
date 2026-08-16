/**
 * The next three actions.
 *
 * Exactly three, always. The value of this feature is that it refuses to give
 * twenty suggestions: a person with a full-time job and a career question needs to
 * know what to do this month, not a syllabus.
 *
 * Priority order, highest first:
 *   1. a verified mandatory blocker
 *   2. a requirement that must be confirmed with an official body
 *   3. the highest-value development gap
 *   4. an evidence-building opportunity
 *   5. exploration or networking
 *
 * The user's stated priorities can reorder candidates *within* a tier, but never
 * move a blocker down one. Wanting leadership work does not make a registration
 * gate less urgent.
 */

import { domainLabel, lowerLabel } from "./ontology.js";

const TIER = {
  verified_blocker: 0,
  official_confirmation: 1,
  development: 2,
  evidence: 3,
  exploration: 4,
};

/** Which priorities favour which development areas, for within-tier ordering. */
const PRIORITY_AREAS = {
  progression: ["leadership", "quality_regulatory", "technical"],
  specialist: ["technical", "research"],
  leadership: ["leadership", "training"],
  research: ["research", "clinical_research"],
  industry: ["quality_regulatory", "clinical_research", "commercial"],
  flexibility: ["data_digital", "commercial"],
  patient_impact: ["technical", "clinical_research"],
  options: ["data_digital", "leadership", "commercial"],
};

/**
 * Build the next three actions for a career.
 *
 * @returns {Array<{id,title,detail,why,tier,sourceCode}>} exactly three, or fewer
 *          only if the profile and career between them produce nothing at all,
 *          which the caller handles.
 */
export function nextActions(profile, match, gaps, pathway, options = {}) {
  const registry = options.registry || {};
  const career = match.career;
  const candidates = [];

  /* 1. verified blockers ---------------------------------------------------- */
  for (const item of gaps.verifiedRequirements) {
    if (item.status === "demonstrated") continue;
    candidates.push({
      id: `required_${item.id}`,
      tier: TIER.verified_blocker,
      title: item.title,
      detail: item.detail,
      why: "This is a verified requirement for this career, so it comes before "
         + "development work.",
      sourceCode: item.sourceCode,
      area: item.area,
    });
  }

  /* 2. official confirmation ----------------------------------------------- */
  for (const item of gaps.items) {
    if (item.category !== "needs_confirmation") continue;
    if (item.status === "demonstrated") continue;
    const source = registry[item.sourceCode];
    candidates.push({
      id: `confirm_${item.id}`,
      tier: TIER.official_confirmation,
      title: "Verify your professional route",
      detail: item.detail,
      why: "Everything else in your plan depends on which route actually "
         + "applies to you, and only the official body can tell you that.",
      sourceCode: item.sourceCode,
      sourceUrl: source ? source.url : item.sourceUrl || "",
      area: item.area,
    });
  }

  /* 3. development gaps ---------------------------------------------------- */
  const developmentGaps = gaps.items.filter(
    (item) => item.status === "action_required" && item.category !== "optional");
  for (const item of developmentGaps) {
    const label = item.domain ? domainLabel(item.domain) : item.title;
    candidates.push({
      id: `develop_${item.domain || item.id}`,
      tier: TIER.development,
      title: item.fromPack
        ? item.title
        : `Build your highest-priority gap: ${lowerLabel(label)}`,
      detail: item.fromPack
        ? item.detail
        : `${label} is part of what this career involves and is not yet `
          + "identified in your profile. Find recognised training or a real "
          + "piece of work that gives you it.",
      why: "It is the largest gap between your profile and this career that you "
         + "can act on directly.",
      sourceCode: item.sourceCode || "",
      area: item.area,
      domain: item.domain || "",
      gapLabel: label,
      weightHint: item.category === "usually_expected" ? 1 : 0,
      order: Number.isInteger(item.order) ? item.order : 99,
      fromPack: Boolean(item.fromPack),
    });
  }

  /* 3b. strengthening, when there is no outright gap ------------------------ */
  // A well-aligned career can produce no action_required gaps at all. That is not
  // a reason to hand back two actions: the useful advice then shifts from closing
  // a gap to deepening what is already there.
  if (!developmentGaps.length) {
    for (const item of gaps.items) {
      if (item.category !== "career_enhancing") continue;
      if (item.status === "demonstrated") continue;
      const label = item.domain ? domainLabel(item.domain) : item.title;
      candidates.push({
        id: `strengthen_${item.domain || item.id}`,
        tier: TIER.development,
        title: `Deepen ${lowerLabel(label)}`,
        detail: `${item.detail} Your profile already aligns well with this `
          + "career, so the useful work is depth rather than breadth.",
        why: "Nothing is missing outright, so this is the strongest available "
           + "way to become a more convincing candidate.",
        area: item.area,
      });
    }
  }

  /* 4. evidence ------------------------------------------------------------ */
  const translation = gaps.transitions.translation;
  if (translation.length) {
    candidates.push({
      id: "translate",
      tier: TIER.evidence,
      title: "Describe what you already do in this career's language",
      detail: "You appear to hold "
        + translation.slice(0, 3).map((item) => lowerLabel(item.label)).join(", ")
        + " from a different sector. Rewrite your strongest two examples in the "
        + "vocabulary this career uses, then check them against a live job advert.",
      why: "This is the cheapest action available: no new skill, better "
         + "recognition of the ones you have.",
      area: "communication",
    });
  }
  candidates.push({
    id: "advert_check",
    tier: TIER.evidence,
    title: "Sense-check this plan against two live job adverts",
    detail: `Find two current ${career.title.toLowerCase()} adverts and mark `
      + "every requirement Helix has not mentioned. Employers say plainly "
      + "what they screen on, and it is the fastest way to find anything this "
      + "dataset does not yet hold.",
    why: "Helix works from a curated taxonomy, not from the live job "
       + "market. This closes that gap in an afternoon.",
    area: "communication",
  });
  candidates.push({
    id: "evidence",
    tier: TIER.evidence,
    title: "Create one piece of practical evidence",
    detail: "Pick a single gap and produce a documented output within three "
      + "months — an audit, a validation, a training package, a project, an "
      + "analysis, a poster. Something with your name on it and an outcome.",
    why: "Demonstrated activity is what moves an application forward.",
    area: "communication",
  });

  /* 5. exploration --------------------------------------------------------- */
  candidates.push({
    id: "explore",
    tier: TIER.exploration,
    title: `Talk to somebody doing this work`,
    detail: `Find one person working as a ${career.title.toLowerCase()} and ask `
      + "what their route was, what they were hired for, and what they wish "
      + "they had done earlier. Professional bodies and special-interest groups "
      + "are the usual way in.",
    why: "It is the fastest correction to any assumption in this plan, "
       + "including Helix's.",
    area: "communication",
  });

  const priorityAreas = new Set((profile.priorities || [])
    .flatMap((id) => PRIORITY_AREAS[id] || []));

  candidates.sort((a, b) => {
    if (a.tier !== b.tier) return a.tier - b.tier;
    // Researched pack content outranks a gap inferred from the dataset's tags,
    // and it does so before the user's stated preferences are consulted: someone
    // who says leadership matters to them should still be told about the entry
    // requirement for the career they picked.
    const aPack = a.fromPack ? 1 : 0;
    const bPack = b.fromPack ? 1 : 0;
    if (aPack !== bPack) return bPack - aPack;
    const aWanted = priorityAreas.has(a.area) ? 1 : 0;
    const bWanted = priorityAreas.has(b.area) ? 1 : 0;
    if (aWanted !== bWanted) return bWanted - aWanted;
    if ((b.weightHint || 0) !== (a.weightHint || 0)) {
      return (b.weightHint || 0) - (a.weightHint || 0);
    }
    const orderA = Number.isInteger(a.order) ? a.order : 99;
    const orderB = Number.isInteger(b.order) ? b.order : 99;
    if (orderA !== orderB) return orderA - orderB;
    return a.id.localeCompare(b.id);
  });

  // One action per tier where possible, so the three are not three versions of
  // the same task.
  const chosen = [];
  const usedTiers = new Set();
  for (const candidate of candidates) {
    if (chosen.length >= 3) break;
    if (usedTiers.has(candidate.tier)) continue;
    usedTiers.add(candidate.tier);
    chosen.push(candidate);
  }
  for (const candidate of candidates) {
    if (chosen.length >= 3) break;
    if (chosen.some((item) => item.id === candidate.id)) continue;
    chosen.push(candidate);
  }
  return chosen.slice(0, 3).map((action, index) =>
    elaborate({ ...action, position: index + 1 }, career, options));
}

/* --------------------------------------------------------------- elaboration */

/**
 * Turn a chosen action into something operational.
 *
 * The old output was a title, a sentence and a reason. That is enough to agree
 * with and not enough to do: "improve leadership experience" is a category, not
 * a task, and a person reading it on a Sunday evening still has no idea what to
 * do on Monday.
 *
 * Everything added here is derived from the tier and the area the action already
 * carries. Nothing consults an external source, and nothing claims a requirement
 * — the completion criteria describe evidence somebody could show, not a
 * standard any employer or regulator has set.
 */
function elaborate(action, career, options) {
  const shape = ACTION_SHAPES[action.tier];
  const activities = ACTIVITIES[action.area] || ACTIVITIES.default;
  const evidence = EVIDENCE_BY_AREA[action.area] || EVIDENCE_BY_AREA.default;
  const bridge = (options.bridges || [])
    .find((item) => (item.coveredDomains || []).includes(action.domain));

  return {
    ...action,
    timeframe: shape.timeframe,
    horizon: shape.horizon,
    gapAddressed: action.gapLabel || action.title,
    activities: activities.map((line) =>
      line.replace("{career}", career.title.toLowerCase())),
    evidenceExamples: evidence,
    completionCriteria: shape.completion,
    /*
     * A bridge role is mentioned only when it covers this exact gap. Attaching
     * the nearest bridge to every action would make the connection meaningless
     * and imply the job is a step towards something it does not help with.
     */
    relatedBridge: bridge
      ? { id: bridge.career.id, title: bridge.career.title,
          why: `A spell as a ${bridge.career.title.toLowerCase()} would cover `
             + `this alongside other gaps.` }
      : null,
    milestoneId: `action-${action.id}`,
  };
}

/** How urgent a tier is, and what "done" looks like for it. */
const ACTION_SHAPES = {
  [TIER.verified_blocker]: {
    timeframe: "Start now — everything else depends on it",
    horizon: "90_days",
    completion: "You hold, or have formally started, the requirement itself and "
              + "can point to the evidence.",
  },
  [TIER.official_confirmation]: {
    timeframe: "Next 2 to 4 weeks",
    horizon: "90_days",
    completion: "You have a written answer from the official body about which "
              + "route applies to you, and have recorded the date you asked.",
  },
  [TIER.development]: {
    timeframe: "Next 3 to 6 months",
    horizon: "6_months",
    completion: "You can describe one piece of real work in this area, your own "
              + "contribution to it, and what came of it.",
  },
  [TIER.evidence]: {
    timeframe: "Next 4 to 8 weeks",
    horizon: "90_days",
    completion: "The evidence exists as something you could attach to an "
              + "application or hand to an interviewer.",
  },
  [TIER.exploration]: {
    timeframe: "Next 4 weeks",
    horizon: "90_days",
    completion: "You have spoken to somebody doing the work and written down "
              + "what surprised you.",
  },
};

/**
 * Concrete things somebody could actually do, by area.
 *
 * Deliberately mundane and small. The failure mode of career advice is
 * suggesting a project nobody has the authority to start; every line here is
 * something a person can propose in their own team within a month.
 */
const ACTIVITIES = {
  leadership: [
    "Lead one small improvement project from start to finish.",
    "Take responsibility for a defined workstream with a deadline.",
    "Supervise, mentor or train one colleague or student.",
    "Present an outcome to your team or department.",
  ],
  quality_regulatory: [
    "Take part in an audit, from planning through to the report.",
    "Write or revise one standard operating procedure.",
    "Own a deviation, CAPA or non-conformance through to closure.",
    "Sit in on an inspection or accreditation visit if you can.",
  ],
  research: [
    "Contribute to a protocol, a proposal or an ethics submission.",
    "Take a defined analysis and write up the method and result.",
    "Present at a departmental meeting or a poster session.",
    "Offer to review or second-check somebody else's analysis.",
  ],
  clinical_research: [
    "Shadow trial coordination or monitoring for a few days.",
    "Complete recognised Good Clinical Practice training.",
    "Help maintain a trial master file or a site file.",
    "Attend a site initiation or monitoring visit as an observer.",
  ],
  data_digital: [
    "Automate one manual reporting task in your own work.",
    "Complete a structured course in the tool your field actually uses.",
    "Build one small analysis somebody else uses to make a decision.",
    "Document a data flow in your department end to end.",
  ],
  commercial: [
    "Sit in on a supplier, procurement or contract discussion.",
    "Prepare a short business case for something you want changed.",
    "Present scientific work to a non-scientific audience.",
    "Ask to be involved in one customer or stakeholder meeting.",
  ],
  training: [
    "Deliver one teaching session and collect feedback on it.",
    "Write a training package or competency assessment.",
    "Take a recognised teaching or assessing qualification.",
  ],
  technical: [
    "Take on a technique or platform nobody else in the team owns.",
    "Validate or verify one method and write the report.",
    "Troubleshoot a recurring problem and document the fix.",
  ],
  communication: [
    "Rewrite your two strongest examples in this career's vocabulary.",
    "Check them against two live {career} adverts.",
    "Ask somebody in the field whether the wording lands.",
  ],
  education: [
    "Confirm exactly which qualifications the route requires.",
    "Find two approved programmes and note the entry requirements.",
    "Check whether prior learning can be recognised.",
  ],
  default: [
    "Find one piece of real work in this area and volunteer for it.",
    "Ask your manager what would count as evidence in your organisation.",
    "Write down what you did and what came of it while it is fresh.",
  ],
};

/** What "I can show this" looks like, by area. */
const EVIDENCE_BY_AREA = {
  leadership: ["A project summary with your role stated", "Manager feedback",
               "Meeting notes or terms of reference", "Outcome measures"],
  quality_regulatory: ["An audit report naming you", "A signed SOP you authored",
                       "A closed CAPA record", "Training records"],
  research: ["A protocol or proposal", "An analysis write-up", "A poster or slides",
             "An acknowledgement or authorship"],
  clinical_research: ["A GCP certificate", "A file note or delegation log entry",
                      "A monitoring visit report you contributed to"],
  data_digital: ["A repository or notebook", "A dashboard somebody uses",
                 "A course certificate", "A documented data flow"],
  commercial: ["A business case", "Slides from a non-technical presentation",
               "Notes from a stakeholder meeting"],
  training: ["Session materials", "Feedback forms", "A teaching qualification"],
  technical: ["A validation or verification report", "A method file",
              "A troubleshooting record"],
  communication: ["A rewritten CV section", "Two annotated job adverts",
                  "Written feedback from somebody in the field"],
  education: ["A written answer from the awarding body",
              "Programme entry requirements", "A prior-learning decision"],
  default: ["A written record of what you did", "Something with your name on it",
            "An outcome somebody else can confirm"],
};
