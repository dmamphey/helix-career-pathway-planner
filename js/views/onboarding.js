/**
 * CV upload, profile confirmation, and the short set of questions afterwards.
 *
 * The flow is upload → review → questions → results. Review is not skippable:
 * a parsed profile is a draft assembled by a rule-based reader, and the person it
 * describes is the only authority on whether it is right.
 */

import { h, panel, button, link, notice, confirmDialog, empty } from "../ui.js";
import { profileForm, profileSummary, signalChips } from "./profile-form.js";
import { preferenceForm } from "./preferences.js";
import {
  extractText, redactPersonalData, ProfileInterpreter, UnsupportedFormatError,
  UnreadableDocumentError,
} from "../cv-parser.js";
import {
  INTEREST_OPTIONS, PRIORITY_OPTIONS, normaliseProfile
} from "../profile.js";
import * as storage from "../storage.js";

/* ------------------------------------------------------------------- upload */

export async function renderUpload(app) {
  const status = h("p", { class: "status", role: "status", "aria-live": "polite" });
  const problem = h("div", { class: "problem", hidden: true });

  const input = h("input", {
    type: "file", id: "cv-file", accept: ".pdf,.docx,.txt",
    "aria-describedby": "cv-help",
    onChange: (event) => handleFile(app, event.target.files[0], status, problem),
  });

  return h("div", { class: "stack" }, [
    panel("Upload your CV", [
      h("p", { text:
        "Upload your CV and Helix will use it to build a starting "
        + "professional profile, identify possible career routes and highlight "
        + "what you may need to develop next." }),
      h("div", { class: "callout callout-good" }, [
        h("p", {}, [
          h("strong", { text: "Your CV stays on your device. " }),
          "It is read inside this browser tab. It is not uploaded to Optymum SS, "
          + "and Helix does not store the document or its text. Contact "
          + "details are removed before the text is read, and the structured "
          + "profile has nowhere to put your name, email address, phone number "
          + "or address.",
        ]),
      ]),
      h("div", { class: "field" }, [
        h("label", { for: "cv-file", text: "Choose your CV" }),
        input,
        h("p", { id: "cv-help", class: "hint", text:
          "Text-based PDF, DOCX or TXT. Scanned documents cannot be read: there "
          + "is no optical character recognition, and Helix will say so "
          + "rather than pretend." }),
      ]),
      status,
      problem,
    ], { id: "upload-heading" }),

    panel("Would rather not upload anything?", [
      h("p", { text: "The manual builder produces exactly the same structured "
        + "profile, and the matching engine cannot tell the difference." }),
      h("div", { class: "card-actions" }, [
        link("Build my profile manually", "#/profile", { class: "btn btn-primary" }),
        link("Use an example profile", "#/", { class: "btn" }),
      ]),
    ], { id: "manual-heading" }),
  ]);
}

async function handleFile(app, file, status, problem) {
  if (!file) return;
  problem.hidden = true;
  problem.textContent = "";
  status.textContent = `Reading ${file.name} in this browser…`;

  try {
    if (storage.hasSavedProfile()) {
      const proceed = await confirmDialog(
        "Replace your saved profile?",
        "You already have a saved Helix profile. Building a new one from "
        + "this CV will replace it once you confirm the review screen.",
        "Continue");
      if (!proceed) {
        status.textContent = "";
        return;
      }
    }

    const extracted = await extractText(file);
    // `text` is a local: it is never assigned to app state, storage or a global,
    // and goes out of scope when this function returns.
    const text = redactPersonalData(extracted.text);
    const result = ProfileInterpreter.parse(text, { catalogue: app.catalogue });

    app.pending = {
      profile: result.profile,
      notes: result.notes,
      format: extracted.format,
      signalCount: result.signalCount,
    };
    status.textContent = `Read ${extracted.format}. Building your profile…`;
    app.navigate("/review");
  } catch (error) {
    status.textContent = "";
    problem.hidden = false;
    const recoverable = error instanceof UnsupportedFormatError
      || error instanceof UnreadableDocumentError;
    problem.appendChild(h("div", { class: "callout callout-warn" }, [
      h("p", { text: error.message }),
      h("div", { class: "card-actions" }, [
        link("Build my profile manually", "#/profile",
             { class: "btn btn-primary" }),
      ]),
    ]));
    if (!recoverable) console.error(error);
  }
}

/* ------------------------------------------------------------------- review */

export async function renderReview(app) {
  const pending = app.pending;
  if (!pending) {
    return panel("Nothing to review", [
      empty("No parsed CV is waiting. Upload a CV, or build a profile manually."),
      h("div", { class: "card-actions" }, [
        link("Upload a CV", "#/upload", { class: "btn btn-primary" }),
        link("Build manually", "#/profile", { class: "btn" }),
      ]),
    ], { id: "review-empty-heading" });
  }

  const draft = normaliseProfile(pending.profile);
  let editing = false;
  const host = h("div", { class: "stack" });

  const redraw = () => {
    host.replaceChildren(
      panel("Your starting profile", [
        h("p", { class: "hint", text:
          `Read from your ${pending.format} by rule-based extraction — not by an `
          + `AI model. It is a draft: correct anything that is wrong, and add `
          + `anything it missed.` }),
        editing
          ? profileForm(draft, { families: app.catalogue.families,
                                 onChange: () => {}, showInterests: false })
          : h("div", { class: "stack" }, [
              profileSummary(draft),
              h("h3", { text: "Career signals identified" }),
              signalChips(draft),
            ]),
        pending.notes.length
          ? h("div", { class: "callout callout-info" }, [
              h("h3", { text: "What Helix could not establish" }),
              h("ul", {}, pending.notes.map((note) => h("li", { text: note }))),
              h("p", { class: "hint", text:
                "Nothing has been guessed to fill these in. Add them yourself if "
                + "they matter." }),
            ])
          : null,
        h("div", { class: "card-actions" }, [
          button(editing ? "Done editing" : "Edit profile", () => {
            editing = !editing;
            redraw();
          }),
          button("Looks right — continue", () => confirm(app, draft),
                 { variant: "primary" }),
          link("Start again with a different CV", "#/upload", { class: "btn btn-quiet" }),
        ]),
      ], { id: "review-heading" }),
    );
  };
  redraw();
  return host;
}

function confirm(app, draft) {
  app.setProfile(draft);
  app.pending = null; // the parsed draft, and with it the last of the CV, is done
  notice("Profile confirmed. The document itself was not stored.", "good");
  app.navigate("/questions");
}

/* ---------------------------------------------------------------- questions */

/**
 * The short question set.
 *
 * Five questions, none of which the CV can answer reliably: where, what kind of
 * help, what interests you, how far you would move, and what matters now.
 */
export async function renderQuestions(app) {
  const profile = app.profile();
  if (!profile) {
    app.navigate("/profile");
    return h("div");
  }
  const draft = normaliseProfile(profile);

  const radios = (name, options, current, onPick) =>
    h("ul", { class: "chips" }, options.map(([value, label]) => {
      const id = `${name}-${value}`;
      return h("li", {}, [
        h("input", { type: "radio", name, id, class: "chip-check",
          checked: current === value ? true : null,
          onChange: () => onPick(value) }),
        h("label", { for: id, class: "chip chip-toggle", text: label }),
      ]);
    }));

  return h("div", { class: "stack" }, [
    panel("A few things your CV cannot tell us", [
      h("p", { class: "hint", text: "Five questions. All of them optional, and "
        + "all of them changeable later." }),

      h("fieldset", { class: "form-section" }, [
        h("legend", { text: "1. Where do you want to build your career?" }),
        radios("jurisdiction", [["UK", "United Kingdom"]], "UK", () => {}),
        h("p", { class: "hint", text:
          "Other jurisdictions are not covered yet. Requirements differ "
          + "substantially between countries." }),
      ]),

      h("fieldset", { class: "form-section" }, [
        h("legend", { text: "2. What would you like Helix to do?" }),
        radios("goal", [
          ["target", "I know where I want to go"],
          ["explore", "Help me explore my options"],
        ], draft.careerGoal, (value) => { draft.careerGoal = value; }),
      ]),

      h("fieldset", { class: "form-section" }, [
        h("legend", { text: "3. Which areas interest you most?" }),
        h("ul", { class: "chips" }, INTEREST_OPTIONS.map((option) => {
          const id = `q-interest-${option.id}`;
          return h("li", {}, [
            h("input", { type: "checkbox", id, class: "chip-check",
              checked: draft.careerInterests.includes(option.id) ? true : null,
              onChange: (event) => {
                if (event.target.checked) draft.careerInterests.push(option.id);
                else {
                  draft.careerInterests = draft.careerInterests
                    .filter((item) => item !== option.id);
                }
              } }),
            h("label", { for: id, class: "chip chip-toggle",
                         text: option.label }),
          ]);
        })),
      ]),

      h("fieldset", { class: "form-section" }, [
        h("legend", { text:
          "4. Are you open to moving outside your current profession or sector?" }),
        radios("openness", [["yes", "Yes"], ["maybe", "Maybe"], ["no", "No"]],
          draft.preferences.openToSectorChange,
          (value) => { draft.preferences.openToSectorChange = value; }),
      ]),

      h("fieldset", { class: "form-section" }, [
        h("legend", { text: "5. What matters most at this stage?" }),
        h("ul", { class: "chips" }, PRIORITY_OPTIONS.map((option) => {
          const id = `q-priority-${option.id}`;
          return h("li", {}, [
            h("input", { type: "checkbox", id, class: "chip-check",
              checked: draft.priorities.includes(option.id) ? true : null,
              onChange: (event) => {
                if (event.target.checked) draft.priorities.push(option.id);
                else {
                  draft.priorities = draft.priorities
                    .filter((item) => item !== option.id);
                }
              } }),
            h("label", { for: id, class: "chip chip-toggle",
                         text: option.label }),
          ]);
        })),
      ]),

      // Folded away rather than dropped onto the end of the screen. These
      // questions are genuinely optional, and a wall of twelve more radio groups
      // reads as a demand however the label is worded.
      h("details", { class: "pref-disclosure" }, [
        h("summary", {}, [
          h("strong", { text: "Optional: what you want from your working life" }),
          h("span", { class: "hint", text: " — a separate preference fit on every "
            + "career. It does not change your background alignment." }),
        ]),
        preferenceForm(draft, { exclude: ["openToSectorChange"] }),
      ]),

      h("div", { class: "card-actions" }, [
        button("Show my career options", () => {
          app.setProfile(draft);
          app.state.settings.onboarded = true;
          app.persist();
          app.navigate(draft.careerGoal === "target" ? "/explore" : "/matches");
        }, { variant: "primary" }),
        link("Skip for now", "#/matches", { class: "btn btn-quiet" }),
      ]),
    ], { id: "questions-heading" }),
  ]);
}
