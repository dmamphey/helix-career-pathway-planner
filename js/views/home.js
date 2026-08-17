/** The first-run screen: two ways in, and an honest account of what this is. */

import { h, panel, button, link, confirmDialog, notice } from "../ui.js";
import { DEMO_PROFILES, demoProfile, describeProfile } from "../profile.js";
import * as storage from "../storage.js";

export async function render(app) {
  const hasProfile = app.hasProfile();

  return h("div", { class: "stack" }, [
    hero(app, hasProfile),
    hasProfile ? currentProfileCard(app) : null,
    howItWorks(),
    demoSection(app),
    jurisdictionNote(),
  ]);
}

/**
 * Reset, in the hero row.
 *
 * It used to live at the bottom of My data, which is a reasonable place to file
 * it and a poor place to find it: starting again is something people decide on
 * the start screen, not somewhere in a settings page. So it sits beside the
 * upload button, where the decision is actually made.
 *
 * Two things keep a destructive control safe next to a primary one. It only
 * appears when there is something to delete — a first-time visitor is not
 * offered the chance to reset an empty browser — and it keeps the same
 * confirmation dialog, which names what will go and points at the export first.
 */
function resetButton(app) {
  if (!app.hasProfile() && !app.state.savedCareerIds.length
      && !Object.keys(app.state.progress).length) {
    return null;
  }
  return button("Reset Helix", async () => {
    const proceed = await confirmDialog(
      "Delete everything saved on this device?",
      "Your profile, saved careers and milestone progress will be removed from "
      + "this browser. Export your data first from My data if you want to keep "
      + "it. This cannot be undone.",
      "Delete it all");
    if (!proceed) return;
    app.resetAll();
    notice("Helix has been reset on this device.", "info");
    app.navigate("/");
  }, { variant: "danger", class: "btn-lg" });
}

/**
 * The landing hero.
 *
 * The product is named first and given room, because somebody arriving from a
 * link needs to know what they have opened before they are asked to do anything.
 * The tagline sits directly under it at a size that can actually be read, then
 * the pitch explains the offer — name, then what it is, then what it does.
 */
function hero(app, hasProfile) {
  return h("section", { class: "hero" }, [
    h("h1", { class: "hero-name", text: "Helix Career Pathway Planner" }),
    h("p", { class: "hero-tagline", text:
      "Career navigation for life sciences and healthcare professionals." }),
    h("p", { class: "lede", text:
      "Start with your CV or build a profile manually. Helix maps your "
      + "experience against hundreds of career destinations, highlights "
      + "development gaps and turns them into practical next steps." }),
    h("div", { class: "hero-actions" }, [
      link(hasProfile ? "Upload a new CV" : "Upload my CV", "#/upload",
           { class: "btn btn-primary btn-lg" }),
      link("Explore without a CV", "#/profile", { class: "btn btn-lg" }),
      hasProfile
        ? link("Continue where I left off", "#/matches", { class: "btn btn-lg" })
        : null,
      resetButton(app),
    ]),
    h("div", { class: "callout callout-good" }, [
      h("p", {}, [
        h("strong", { text: "Your CV stays on your device. " }),
        "Helix processes your document locally in your browser to build a "
        + "career profile. Your CV is not uploaded to Optymum SS and the raw "
        + "document is not stored by Helix.",
      ]),
    ]),
  ]);
}

function currentProfileCard(app) {
  const profile = app.profile();
  const target = app.state.targetCareerId
    ? app.catalogue.get(app.state.targetCareerId) : null;
  return panel("Your saved profile", [
    h("p", { class: "big", text: describeProfile(profile) }),
    profile.source === "demo"
      ? h("p", { class: "hint", text:
          "This is a demonstration profile containing fictional data." })
      : null,
    target
      ? h("p", {}, ["Target career: ", link(target.title,
          `#/pathway/${target.id}`)])
      : null,
    h("div", { class: "card-actions" }, [
      link("Review or edit profile", "#/profile", { class: "btn" }),
      link("See career options", "#/matches", { class: "btn btn-primary" }),
      link("Manage saved data", "#/data", { class: "btn btn-quiet" }),
    ]),
  ], { id: "saved-profile-heading" });
}

/**
 * The six steps became seven.
 *
 * The old list went straight from "explore possibilities" to "compare your
 * shortlist", with nothing in between to explain how several hundred options
 * become a shortlist. Narrowing is now a real step in the product, so it is a
 * real step here — and stating it up front is part of the promise: this is a
 * tool for choosing, not a search engine that hands back everything it has.
 */
function howItWorks() {
  const steps = [
    ["Build your profile", "From your CV, or by hand. Scanned CVs are read in "
      + "your browser."],
    ["See your career options",
     "Every career in the UK database, scored against your profile and grouped "
     + "by how big a move each would be — led by the areas you say interest "
     + "you."],
    ["Narrow them down",
     "Set your priorities and Helix sets aside the careers that do not fit "
     + "them. Your answers decide this, and it says how many each choice would "
     + "leave before you make it."],
    ["Compare your shortlist",
     "Side-by-side comparison of up to four careers — salary, working life, "
     + "professional requirements and how big a move each would be. Pin your "
     + "current job as a baseline to see the differences."],
    ["Choose a destination", "Select one career to plan against."],
    ["See your gaps and pathway", "What you have, what you would need, and any "
      + "bridge roles that would make the move smaller."],
    ["Take your next 3 actions", "Prioritised, and small enough to start, with "
      + "a plan across 90 days, 6 months and 12 months."],
  ];
  return panel("How it works", [
    h("ol", { class: "steps" }, steps.map(([title, detail]) =>
      h("li", {}, [h("strong", { text: title }), h("span", { text: detail })]))),
  ], { id: "how-heading" });
}

function demoSection(app) {
  return panel("Or look around with an example profile", [
    h("div", { class: "grid grid-2" }, DEMO_PROFILES.map((demo) =>
      h("article", { class: "card" }, [
        h("h3", { text: demo.name }),
        h("p", { class: "hint", text: demo.blurb }),
        h("div", { class: "card-actions" }, [
          button("Use this example", () => useDemo(app, demo.id),
                 { variant: "quiet" }),
        ]),
      ]))),
    h("p", { class: "hint", text:
      "Demonstration profiles contain fictional data only. They describe nobody "
      + "real." }),
  ], { id: "demo-heading",
       hint: "Useful if you would rather see the product before uploading "
           + "anything." });
}

/**
 * Loading a demo must never quietly discard real work, so a saved non-demo
 * profile is confirmed first.
 */
async function useDemo(app, id) {
  if (storage.hasSavedProfile()) {
    const proceed = await confirmDialog(
      "Replace your saved profile?",
      "You have a saved Helix profile. Loading a demonstration profile will "
      + "replace it. Export your data first from Manage saved data if you want "
      + "to keep it.",
      "Load the example");
    if (!proceed) return;
  }
  const profile = demoProfile(id);
  if (!profile) return;
  app.setProfile(profile);
  app.state.targetCareerId = null;
  app.persist();
  notice("Demonstration profile loaded. Everything in it is fictional.", "info");
  app.navigate("/matches");
}

function jurisdictionNote() {
  return h("div", { class: "callout callout-info" }, [
    h("p", { text: "Helix currently provides UK-focused career navigation. "
      + "Requirements can differ substantially between countries." }),
  ]);
}
