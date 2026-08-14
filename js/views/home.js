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

function howItWorks() {
  const steps = [
    ["Build your profile", "From your CV, or by hand."],
    ["Explore career possibilities",
     "Matched against our full UK career database."],
    ["Compare your shortlist",
     "Side-by-side comparison of up to four careers — salary, working life, "
     + "professional requirements and how big a move each would be."],
    ["Choose a destination", "Select one career to plan against."],
    ["See your gaps and pathway", "What you have, what you would need."],
    ["Take your next 3 actions", "Prioritised, and small enough to start."],
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
