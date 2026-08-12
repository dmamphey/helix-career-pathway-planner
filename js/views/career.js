/**
 * The career detail screen.
 *
 * Every one of the 677 careers reaches this screen. What it shows depends on how
 * much is actually known: the dataset's own metadata always, the profile-based
 * alignment when a profile exists, and researched rule-pack content when a pack
 * has been written. Where something is unknown the screen says so rather than
 * filling the space.
 */

import {
  h, panel, button, link, careerCard, alignmentBadge, regulationBadge,
  depthBadge, sourceList, statusPill, empty
} from "../ui.js";
import { adjacentCareers } from "../adjacency.js";
import { loadRulePack } from "../rules.js";
import { developmentIndicators } from "../matcher.js";

export async function render(app, context) {
  const career = app.catalogue.get(context.params.id);
  if (!career) {
    return panel("Career not found", [
      empty(`No career in this dataset has the id "${context.params.id}".`),
      h("div", { class: "card-actions" }, [
        link("Browse all careers", "#/explore", { class: "btn btn-primary" }),
      ]),
    ], { id: "missing-career-heading" });
  }

  const pack = await loadRulePack(career.id);
  const analysis = app.hasProfile() ? await app.analysisFor(career.id) : null;
  const match = analysis ? analysis.match : null;

  return h("div", { class: "stack" }, [
    header(app, career, match),
    regulationCard(career, app),
    aboutCard(career),
    match ? alignmentCard(app, career, analysis) : noProfileCard(),
    progressionCard(app, career, pack),
    similarCard(app, career, pack),
    sourceList(app.sourcesFor(career), career.last_verified),
    h("div", { class: "callout callout-info" }, [
      h("p", { class: "hint", text: career.production_note }),
    ]),
  ]);
}

function header(app, career, match) {
  const saved = app.isSaved(career.id);
  const savedButton = button(saved ? "Saved ✓" : "Save career", () => {
    const nowSaved = app.toggleSaved(career.id);
    savedButton.textContent = nowSaved ? "Saved ✓" : "Save career";
    savedButton.setAttribute("aria-pressed", String(nowSaved));
  }, { variant: "quiet", pressed: saved });

  return h("section", { class: "panel career-header" }, [
    h("p", { class: "eyebrow", text: career.family }),
    h("h1", { text: career.title }),
    h("div", { class: "badges" }, [
      match ? alignmentBadge(match) : null,
      regulationBadge(career),
      depthBadge(career),
      h("span", { class: "chip", text: career.id }),
    ]),
    h("div", { class: "card-actions" }, [
      link("Build my pathway", `#/pathway/${career.id}`,
           { class: "btn btn-primary" }),
      savedButton,
      link("Back to explorer", "#/explore", { class: "btn btn-quiet" }),
    ]),
  ]);
}

/** The regulation information card, shown whenever regulation is recorded. */
function regulationCard(career, app) {
  if (!career.derived.regulated) return null;
  const body = career.regulator_or_body;
  const source = body ? app.catalogue.sources[body] : null;
  return h("div", { class: "callout callout-warn" }, [
    h("h2", { class: "callout-title", text: "Professional registration applies" }),
    h("p", { text:
      "This career is associated with a regulated profession or protected title. "
      + "Helix can help you understand the pathway, but current eligibility "
      + "must be confirmed with the official regulator." }),
    h("dl", { class: "summary" }, [
      h("dt", { text: "Recorded status" }),
      h("dd", { text: career.regulatory_status }),
      ...(body ? [h("dt", { text: "Body" }), h("dd", {}, [
        source ? link(source.name, source.url, { external: true })
               : h("span", { text: body }),
      ])] : []),
    ]),
  ]);
}

function aboutCard(career) {
  return panel("What this career is about", [
    h("p", { text: career.derived.familyAbout }),
    h("p", { class: "hint", text:
      "Helix does not hold a written description for each individual career "
      + "yet. The paragraph above describes the family this career sits in, which "
      + "is what the dataset supports — a role-specific description will be added "
      + "as that research is done rather than generated now." }),
    h("h3", { text: "Typical background signals" }),
    h("p", { text: career.typical_entry_signal }),
    h("p", { class: "hint", text:
      "Indicative context for the family, not a rule and not a checklist." }),
    h("h3", { text: "Tags" }),
    h("ul", { class: "chips" }, (career.core_tags || []).map((tag) =>
      h("li", {}, [h("span", { class: "chip", text: tag })]))),
  ], { id: "about-heading" });
}

function noProfileCard() {
  return panel("Your alignment", [
    empty("Build a profile and Helix will show which parts of this career "
        + "your experience already covers."),
    h("div", { class: "card-actions" }, [
      link("Upload my CV", "#/upload", { class: "btn btn-primary" }),
      link("Build a profile manually", "#/profile", { class: "btn" }),
    ]),
  ], { id: "alignment-heading" });
}

function alignmentCard(app, career, analysis) {
  const { match, gaps } = analysis;
  const indicators = developmentIndicators(match);
  const transitions = gaps.transitions;

  return panel("Your alignment", [
    h("p", {}, [
      h("strong", { text: match.label }),
      " — this is a development alignment indicator from your profile, not a "
      + "prediction about recruitment.",
    ]),

    h("h3", { text: "Strengths already demonstrated" }),
    transitions.transferable.length
      ? h("ul", { class: "chips" }, transitions.transferable.map((item) =>
          h("li", {}, [h("span", { class: "chip chip-good", text: item.label })])))
      : empty("None identified in your profile for this career yet."),

    transitions.translation.length
      ? h("div", {}, [
          h("h3", { text: "Strengths that may need translating" }),
          h("p", { class: "hint", text:
            "You appear to hold these, but from a sector that describes them "
            + "differently. That is a wording problem, not a development gap." }),
          h("ul", { class: "chips" }, transitions.translation.map((item) =>
            h("li", {}, [h("span", { class: "chip", text: item.label })]))),
        ])
      : null,

    h("h3", { text: "Likely development areas" }),
    transitions.development.length
      ? h("ul", { class: "chips" }, transitions.development.map((item) =>
          h("li", {}, [h("span", { class: "chip chip-gap", text: item.label })])))
      : empty("Nothing significant identified — check the pathway for detail."),

    h("h3", { text: "Hard requirements" }),
    gaps.verifiedRequirements.length
      ? h("ul", { class: "req-list" }, gaps.verifiedRequirements.map((item) =>
          h("li", {}, [statusPill(item.status), h("span", { text: item.title })])))
      : h("p", { text: gaps.requiresOfficialConfirmation
          ? "A requirement applies here but has to be confirmed with the "
            + "official body — see the pathway for what to ask."
          : "No verified mandatory requirements are recorded for this career." }),

    h("h3", { text: "Development indicators" }),
    h("table", { class: "indicators" }, [
      h("thead", {}, [h("tr", {}, [
        h("th", { text: "Area" }), h("th", { text: "From your profile" })])]),
      h("tbody", {}, indicators
        .filter((indicator) => indicator.relevantToCareer)
        .map((indicator) => h("tr", {}, [
          h("th", { scope: "row", text: indicator.label }),
          h("td", {}, [h("span", { class: `ind ind-${indicator.status}`,
                                   text: indicator.statusLabel })]),
        ]))),
    ]),
    h("p", { class: "hint", text:
      "Profile-based development indicators. “Not identified” means Helix "
      + "did not find it in your profile, not that you lack it." }),

    h("div", { class: "card-actions" }, [
      link("Build my pathway and next actions", `#/pathway/${career.id}`,
           { class: "btn btn-primary" }),
    ]),
  ], { id: "alignment-heading" });
}

function progressionCard(app, career, pack) {
  const next = adjacentCareers(career, app.catalogue.careers,
                               { mode: "next", limit: 4 });
  return panel("Possible progression", [
    pack && pack.progression.length
      ? h("div", {}, [
          h("h3", { text: "From the researched pathway for this career" }),
          h("ol", { class: "plain" }, pack.progression.map((step) =>
            h("li", { text: step }))),
        ])
      : h("p", { class: "hint", text:
          "No researched progression ladder exists for this career yet, so "
          + "Helix shows related careers a step more senior rather than "
          + "inventing job titles." }),
    next.length
      ? h("div", { class: "grid grid-2" }, next.map((item) =>
          careerCard(item.career, {
            match: app.hasProfile() ? app.matchFor(item.career) : null,
            saved: app.isSaved(item.career.id),
          })))
      : empty("No clear next-step careers were found in the dataset."),
  ], { id: "progression-heading" });
}

function similarCard(app, career, pack) {
  const similar = adjacentCareers(career, app.catalogue.careers,
                                  { mode: "similar", limit: 6, pack });
  const pivots = adjacentCareers(career, app.catalogue.careers,
                                 { mode: "pivot", limit: 4 });
  return panel("Similar careers and pivots", [
    h("h3", { text: "Similar careers" }),
    h("div", { class: "grid grid-3" }, similar.map((item) =>
      careerCard(item.career, {
        match: app.hasProfile() ? app.matchFor(item.career) : null,
        saved: app.isSaved(item.career.id),
        note: item.curated ? "Listed in the researched pack for this career" : null,
      }))),
    h("h3", { text: "Career pivots using similar skills" }),
    h("p", { class: "hint", text: "Different career family, overlapping skills." }),
    h("div", { class: "grid grid-3" }, pivots.map((item) =>
      careerCard(item.career, {
        match: app.hasProfile() ? app.matchFor(item.career) : null,
        saved: app.isSaved(item.career.id),
      }))),
  ], { id: "similar-heading" });
}
