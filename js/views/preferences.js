/**
 * Career priorities.
 *
 * Every question is optional and every one defaults to "No preference", which is
 * not a hidden neutral vote — an unanswered question is left out of the scoring
 * entirely. Somebody who answers two questions gets a fit judged on two things,
 * and the screen says so rather than implying a fuller picture than exists.
 *
 * Nothing here is a personal identifier, and none of it leaves the browser. It is
 * also kept away from background alignment on purpose: answering these questions
 * changes which careers suit you, never how much of one you already do.
 */

import { h, panel, button, link, notice } from "../ui.js";
import {
  PREFERENCE_FIELDS, PREFERENCE_GROUPS, normaliseProfile,
} from "../profile.js";

/**
 * The question set, as a fieldset per group.
 *
 * @param {object} draft   profile, mutated in place
 * @param {object} options `{ exclude, onChange }` — `exclude` drops questions the
 *                         surrounding screen already asks, so the onboarding flow
 *                         does not put the same question in front of somebody
 *                         twice with two different sets of words.
 */
export function preferenceForm(draft, options = {}) {
  const onChange = options.onChange || (() => {});
  const excluded = new Set(options.exclude || []);
  return h("div", { class: "stack form" }, PREFERENCE_GROUPS.map((group) => {
    const fields = PREFERENCE_FIELDS.filter((field) =>
      field.group === group.id && !excluded.has(field.key));
    if (!fields.length) return null;
    return h("fieldset", { class: "form-section" }, [
      h("legend", { text: group.title }),
      ...fields.map((field) => questionBlock(draft, field, onChange)),
    ]);
  }));
}

/**
 * One question.
 *
 * A radio group inside its own fieldset, so a screen reader announces the
 * question with each option rather than reading five unlabelled choices in a row.
 * "No preference" is first and is the default, because it is the honest starting
 * state and should be the easiest answer to leave in place.
 */
function questionBlock(draft, field, onChange) {
  const name = `pref-${field.key}`;
  const current = draft.preferences[field.key];
  const options = [[null, "No preference"], ...field.options];

  return h("fieldset", { class: "pref-question" }, [
    h("legend", { text: field.question }),
    field.hint ? h("p", { class: "hint", text: field.hint }) : null,
    h("ul", { class: "chips" }, options.map(([value, label]) => {
      const id = `${name}-${value === null ? "none" : value}`;
      return h("li", {}, [
        h("input", {
          type: "radio", name, id, class: "chip-check",
          checked: sameAnswer(current, value) ? true : null,
          onChange: () => {
            draft.preferences[field.key] = value;
            onChange();
          },
        }),
        h("label", { for: id, class: "chip chip-toggle", text: label }),
      ]);
    })),
  ]);
}

/** Null and a number both have to compare correctly against the stored answer. */
function sameAnswer(current, value) {
  if (value === null) return current === null || current === undefined;
  return current === value;
}

/* -------------------------------------------------------------------- screen */

export async function render(app) {
  if (!app.hasProfile()) {
    return panel("Career priorities", [
      h("p", { class: "empty", text: "Preferences are matched against careers "
        + "alongside your profile. Build a profile first, then set them." }),
      h("div", { class: "card-actions" }, [
        link("Upload my CV", "#/upload", { class: "btn btn-primary" }),
        link("Build a profile manually", "#/profile", { class: "btn" }),
      ]),
    ], { id: "preferences-empty-heading" });
  }

  const draft = normaliseProfile(app.profile());

  return h("div", { class: "stack" }, [
    panel("What do you want from your working life?", [
      h("p", { text: "These questions are about what you want, not what you have "
        + "already done. They produce a separate preference fit on each career "
        + "and leave your background alignment exactly as it is." }),
      h("div", { class: "callout callout-good" }, [
        h("p", {}, [
          h("strong", { text: "Every question is optional. " }),
          "Helix scores only the answers you give, against only the careers it "
          + "has the matching information for, and it never marks a career down "
          + "because something is unknown.",
        ]),
      ]),
      preferenceForm(draft),
      h("div", { class: "card-actions" }, [
        button("Save my priorities", () => {
          app.setProfile(draft);
          notice("Priorities saved. Preference fit is now shown on careers.",
                 "good");
          app.navigate("/matches");
        }, { variant: "primary" }),
        button("Clear all answers", () => {
          const cleared = normaliseProfile(draft);
          for (const field of PREFERENCE_FIELDS) {
            cleared.preferences[field.key] = null;
          }
          app.setProfile(cleared);
          notice("Preferences cleared. Preference fit is no longer shown.",
                 "info");
          app.navigate("/preferences");
        }, { variant: "quiet" }),
        link("Skip for now", "#/matches", { class: "btn btn-quiet" }),
      ]),
    ], { id: "preferences-heading" }),

    panel("How preference fit is worked out", [
      h("ul", { class: "plain" }, [
        h("li", { text: "A question is scored only when you have answered it and "
          + "Helix has the matching fact about that career. Typical weekly hours, "
          + "for example, come from official job profiles and exist for 54 of the "
          + "677 careers." }),
        h("li", { text: "The result is worked out across the questions that could "
          + "actually be compared, not across all of them. A career is never "
          + "marked down because something about it is unknown." }),
        h("li", { text: "Patient contact, laboratory, research and commercial "
          + "intensity, remote potential and travel are inferred from each "
          + "career's subject matter rather than measured in a survey. They are "
          + "labelled that way wherever they appear." }),
        h("li", { text: "Preference fit is not a probability, and it is not a "
          + "ranking of which career is better. It says how closely each one "
          + "matches what you said you wanted." }),
      ]),
    ], { id: "preferences-method-heading" }),
  ]);
}
