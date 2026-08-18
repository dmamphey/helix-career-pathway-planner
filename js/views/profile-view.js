/** The manual profile builder, and the editor for an existing profile. */

import { h, panel, button, link, notice } from "../ui.js";
import { profileForm, profileSummary, signalChips } from "./profile-form.js";
import { emptyProfile, normaliseProfile, isUsableProfile } from "../profile.js";
import { trackHelixEvent, EVENTS } from "../analytics.js";

export async function render(app) {
  const existing = app.profile();
  const draft = normaliseProfile(existing || emptyProfile());
  const isNew = !existing;

  const warning = h("p", { class: "warn-inline", hidden: true, role: "status" });

  return h("div", { class: "stack" }, [
    panel(isNew ? "Build your profile" : "Your profile", [
      h("p", { class: "hint", text: isNew
        ? "Work through as much as applies to you. Nothing is compulsory, and the "
          + "more accurate it is the more useful the matching becomes."
        : "Edit anything. Adding evidence you have but had not recorded is the "
          + "single most useful thing you can do here — a gap only means "
          + "“not identified in your profile”." }),
      profileForm(draft, {
        families: app.catalogue.families,
        onChange: () => { warning.hidden = true; },
      }),
      warning,
      h("div", { class: "card-actions sticky-actions" }, [
        button("Save profile", () => {
          if (!isUsableProfile(draft)) {
            warning.hidden = false;
            warning.textContent = "Add at least a current role, a qualification "
              + "or a few skills so there is something to match against.";
            return;
          }
          app.setProfile(draft);
          notice("Profile saved on this device.", "good");
          /*
           * Only a first profile, and only once it is usable. This screen is
           * also the editor: somebody correcting their job title later is not
           * creating a profile, and the guard above has already turned back
           * anything too thin to match against.
           */
          if (isNew && app.hasProfile()) {
            trackHelixEvent(EVENTS.PROFILE_CREATED_MANUALLY);
          }
          app.navigate(draft.careerGoal === "target" ? "/explore" : "/matches");
        }, { variant: "primary" }),
        existing ? link("See career options", "#/matches", { class: "btn" }) : null,
        link("Manage saved data", "#/data", { class: "btn btn-quiet" }),
      ]),
    ], { id: "profile-heading" }),

    existing
      ? panel("Currently saved", [
          profileSummary(existing),
          h("h3", { text: "Career signals" }),
          signalChips(existing),
        ], { id: "current-profile-heading" })
      : null,
  ]);
}
