/**
 * How big a move is this?
 *
 * Deliberately a third measure, separate from background alignment and preference
 * fit, because they answer different questions and blending them hides the one
 * that changes a decision. Somebody can align strongly with a career and still be
 * facing a formal training route; somebody can align weakly with a career they
 * could start applying for next month.
 *
 * What it does not consider: salary, popularity, or anything about how likely the
 * person is to succeed. Effort is about the distance to cover, not the odds of
 * covering it — and the label is never a verdict on whether to try. High effort is
 * a fact about a route, not a discouragement.
 */

export const LEVELS = {
  lower: {
    key: "lower", rank: 0, label: "Lower transition",
    summary: "Most of what this career needs is already in your profile.",
  },
  moderate: {
    key: "moderate", rank: 1, label: "Moderate transition",
    summary: "A real move, built mostly on experience you already have.",
  },
  substantial: {
    key: "substantial", rank: 2, label: "Substantial transition",
    summary: "Several significant gaps, or a different sector's expectations.",
  },
  major: {
    key: "major", rank: 3, label: "Major retraining or professional route",
    summary: "Entry runs through a formal qualification or registration route.",
  },
};

/**
 * Assess the effort to move from this profile into this career.
 *
 * @param {object} profile structured profile
 * @param {object} match    matcher result
 * @param {object} gaps     gap analysis
 * @returns {{key,label,rank,summary,reasons:string[],explain:string}}
 */
export function transitionEffort(profile, match, gaps) {
  const reasons = [];
  let score = 0;

  // A verified mandatory requirement, or one the regulator must confirm, is the
  // heaviest single factor: it is a gate rather than a gap.
  const verified = (gaps.verifiedRequirements || [])
    .filter((item) => item.status !== "demonstrated");
  const confirmation = (gaps.byCategory.get("needs_confirmation") || [])
    .filter((item) => item.status !== "demonstrated");

  if (verified.length) {
    score += 3;
    reasons.push(`${verified.length} verified requirement`
      + `${verified.length === 1 ? "" : "s"} must be met before entry.`);
  } else if (confirmation.length) {
    score += 2;
    const body = match.career.regulator_or_body;
    reasons.push("This career is regulated, so the route has to be confirmed with "
      + (body ? `${body}` : "the official body") + " before you can plan around it.");
  }

  // An approved education route is a structural barrier, not a skill gap.
  const educationGate = (gaps.items || []).some(
    (item) => item.area === "education" && item.category === "needs_confirmation");
  if (educationGate) {
    score += 2;
    reasons.push("Entry normally runs through an approved programme rather than "
      + "experience alone.");
  }

  // Genuine development gaps: the number of them, weighted lightly, because a
  // long tail of small gaps is not the same as a qualification barrier.
  const development = (gaps.transitions.development || []).length;
  if (development >= 5) {
    score += 2;
    reasons.push(`${development} areas this career involves are not identified in `
      + `your profile.`);
  } else if (development >= 2) {
    score += 1;
    reasons.push(`${development} development areas to build.`);
  } else if (development === 0) {
    reasons.push("No significant development gaps identified.");
  }

  // Adjacency pulls the other way: staying in your own field is a smaller move.
  if (match.sameFamily) {
    score -= 2;
    reasons.push("It sits in the career family you already work in.");
  } else if (match.relatedFamily) {
    score -= 1;
    reasons.push("It sits in a career family adjacent to yours.");
  }

  if (!gaps.transitions.sectorOverlap) {
    score += 1;
    reasons.push("You have no recorded exposure to this career's usual sectors, so "
      + "some of your experience may need describing differently.");
  }

  // Strong overlap of the career's own subject matter reduces the distance.
  if (match.score >= 70) {
    score -= 1;
    reasons.push("Your profile already covers much of the career's subject matter.");
  }

  let level;
  if (verified.length || (educationGate && score >= 4)) level = LEVELS.major;
  else if (score >= 4) level = LEVELS.substantial;
  else if (score >= 2) level = LEVELS.moderate;
  else level = LEVELS.lower;

  /*
   * A gate is a floor, not a cost that adjacency can pay off.
   *
   * Without this, an HCPC-registered biomedical scientist was told that Clinical
   * Scientist is a "lower transition": the same-family discount cancelled the
   * registration requirement. But registration as one profession is not a licence
   * to practise as another, even under the same regulator — that route has its own
   * entry requirements. So a route the person is not already on cannot be reported
   * as a small move, whatever the skill overlap says.
   */
  const gated = Boolean(verified.length || confirmation.length || educationGate);
  if (gated && !holdsRegistrationForThisCareer(profile, match.career)
      && level.rank < LEVELS.substantial.rank) {
    level = LEVELS.substantial;
    reasons.unshift("Your existing registration does not itself cover this career, "
      + "so its own entry route applies.");
  }

  return {
    ...level,
    reasons,
    explain: `${level.summary} ${reasons.slice(0, 2).join(" ")}`.trim(),
  };
}

/**
 * Why a career appeared, and what makes it a transition.
 *
 * Built from the match components and the gap analysis, so it is always consistent
 * with the numbers shown elsewhere. Two separate statements on purpose: the reason
 * it fits and the reason it is a stretch are different pieces of information, and
 * merging them into one paragraph lets the encouraging half bury the other.
 */
export function whyThisCareer(profile, match, gaps) {
  const strengths = (gaps.transitions.transferable || [])
    .slice(0, 4).map((item) => item.label.toLowerCase());
  const contributing = match.components
    .filter((component) => component.fit >= 0.6 && component.evidence.length)
    .slice(0, 2);

  let why = "";
  if (strengths.length) {
    why = `Your profile shows ${listWords(strengths)}, which overlap with what this `
        + `career involves.`;
  } else if (contributing.length) {
    why = `${contributing[0].label} is the main overlap between your profile and `
        + `this career.`;
  } else {
    why = "This appeared from broader similarity to your profile rather than a "
        + "direct overlap.";
  }

  const gapsList = (gaps.transitions.development || [])
    .slice(0, 3).map((item) => item.label.toLowerCase());
  const translation = (gaps.transitions.translation || []).length;

  let stretch = "";
  if (gapsList.length) {
    stretch = `What makes it a transition: ${listWords(gapsList)} `
            + `${gapsList.length === 1 ? "is" : "are"} not identified in your `
            + `profile yet.`;
  } else if (translation) {
    stretch = "What makes it a transition: you appear to have the capabilities, but "
            + "from a sector that describes them differently.";
  } else if (gaps.requiresOfficialConfirmation) {
    stretch = "What makes it a transition: the professional route has to be "
            + "confirmed with the official body.";
  }

  return { why, stretch, oneLine: why };
}

/**
 * Does the profile already hold registration that covers this career?
 *
 * Requires a current statutory registration with this career's regulator *and* a
 * recorded profession that matches the career title. Matching the regulator alone
 * is not enough: HCPC registers fifteen professions and they are not
 * interchangeable. Helix never concludes from this that somebody is eligible — the
 * regulator does that — it only avoids overstating the size of the move.
 */
function holdsRegistrationForThisCareer(profile, career) {
  const body = career.regulator_or_body;
  if (!body) return false;
  const simplify = (text) => String(text || "").toLowerCase()
    .replace(/[^a-z0-9]+/g, " ").trim();
  const title = simplify(career.title);
  return (profile.registrations || []).some((registration) => {
    if (!registration.statutory || registration.status !== "current") return false;
    if (registration.body !== body) return false;
    const profession = simplify(registration.profession);
    if (!profession) return false;
    return title.includes(profession) || profession.includes(title);
  });
}

function listWords(items) {
  if (items.length <= 1) return items[0] || "";
  return `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
