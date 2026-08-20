/**
 * CV upload, profile confirmation, and the short set of questions afterwards.
 *
 * The flow is upload → review → questions → results. Review is not skippable:
 * a parsed profile is a draft assembled by a rule-based reader, and the person it
 * describes is the only authority on whether it is right.
 */

import {
  h, panel, button, link, notice, confirmDialog, empty, progressBar, replaceKids } from "../ui.js";
import { profileForm, profileSummary, signalChips } from "./profile-form.js";
import { preferenceForm } from "./preferences.js";
import {
  extractText, redactPersonalData, ProfileInterpreter, UnsupportedFormatError,
  UnreadableDocumentError, pdfLibrary,
} from "../cv-parser.js";
// `looksScanned` is a few lines and is needed to decide whether to *offer* OCR,
// so it is imported eagerly. The engine itself — several megabytes — is loaded
// only inside `run()`, after somebody has pressed the button.
import { looksScanned } from "../ocr.js";
import {
  INTEREST_OPTIONS, PRIORITY_OPTIONS, normaliseProfile
} from "../profile.js";
import * as storage from "../storage.js";
import { trackHelixEvent, EVENTS } from "../analytics.js";

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
          "Supported formats: PDF, DOCX, and TXT. If a PDF is a scanned image, "
          + "Helix can extract the text using built-in, text recognition" }),
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

    /*
     * A scanned PDF is not a failure, it is a different job.
     *
     * The offer is made rather than taken: OCR downloads several megabytes and
     * takes a minute or two, and doing that to somebody without asking — on a
     * phone, on their own data — would be rude. The message says what will
     * happen and, just as importantly, what will not.
     */
    if (error instanceof UnreadableDocumentError
        && looksScanned(error.recoveredText, error.pageCount)
        && error.format === "PDF") {
      problem.appendChild(offerOcr(app, file, error, status, problem));
      return;
    }

    const recoverable = error instanceof UnsupportedFormatError
      || error instanceof UnreadableDocumentError;
    problem.appendChild(h("div", { class: "callout callout-warn" }, [
      h("p", { text: error.message }),
      h("p", { class: "hint", text: "Nothing about this file has been sent "
        + "anywhere. It was read in this browser and has been discarded." }),
      h("div", { class: "card-actions" }, [
        link("Build my profile manually", "#/profile",
             { class: "btn btn-primary" }),
      ]),
    ]));
    if (!recoverable) console.error(error);
  }
}

/**
 * The offer, and the run.
 *
 * Kept in one function because the whole flow is one conversation: here is what
 * we found, here is what we could do about it, here is it happening, here is how
 * to stop. Cancellation is a real button wired to an `AbortController` rather
 * than a spinner somebody has to reload the page to escape.
 */
function offerOcr(app, file, error, status, problem) {
  const host = h("div", { class: "callout callout-info" });

  const draw = (children) => replaceKids(host, children);

  const idle = () => draw([
    h("h3", { class: "callout-title", text: "This CV appears to be scanned" }),
    h("p", { text: "There is no text layer in this PDF, so it is probably a "
      + "photograph or a scan of a printed page. Helix can try to read it with "
      + "text recognition." }),
    h("p", {}, [
      h("strong", { text: "This happens in your browser. " }),
      "The scan is not uploaded, and no text-recognition service is contacted "
      + "with your document. The engine itself is a few megabytes and is "
      + "downloaded only if you press the button.",
    ]),
    h("p", { class: "hint", text: "Recognition is slower and less accurate than "
      + "reading a text-based PDF. You will review and correct everything "
      + "afterwards, as you would with any CV." }),
    h("div", { class: "card-actions" }, [
      button("Run text recognition here", run, { variant: "primary" }),
      link("Build my profile manually", "#/profile", { class: "btn" }),
    ]),
  ]);

  let controller = null;

  function progressView(update) {
    draw([
      h("h3", { class: "callout-title", text: "Reading your CV" }),
      progressBar(update.percent || 0, update.message || "Working"),
      h("p", { "aria-live": "polite", text: update.message || "" }),
      h("p", { class: "hint", text: "Everything is happening on this device." }),
      h("div", { class: "card-actions" }, [
        button("Cancel", () => controller && controller.abort(),
               { variant: "quiet" }),
      ]),
    ]);
  }

  async function run() {
    controller = new AbortController();
    progressView({ percent: 0, message: "Preparing the document" });
    try {
      const { readScannedPdf, textQuality } = await import("../ocr.js");
      const pdfjs = await pdfLibrary();
      const result = await readScannedPdf(file, {
        pdfjs, signal: controller.signal, onProgress: progressView,
      });

      const quality = textQuality(result.text);
      // Same path as any other CV from here on: redact, parse, then review.
      // OCR output is a draft like every other extraction, and gets no
      // shortcuts around the confirmation step.
      const text = redactPersonalData(result.text);
      const parsed = ProfileInterpreter.parse(text, { catalogue: app.catalogue });

      app.pending = {
        profile: parsed.profile,
        notes: parsed.notes,
        format: "scanned PDF",
        signalCount: parsed.signalCount,
        ocr: {
          pages: result.pages,
          truncated: result.truncated,
          engine: result.engine,
          quality,
        },
      };
      problem.hidden = true;
      status.textContent = "";
      /*
       * Recognition worked and produced text Helix could parse. Not when the
       * engine loaded, not when the first page rendered, and not on the cancel
       * or failure paths below — those land in the catch.
       *
       * Nothing about the scan is reported: not the page count, not the
       * confidence, not the engine, and obviously not the text.
       */
      trackHelixEvent(EVENTS.OCR_COMPLETED);
      app.navigate("/review");
    } catch (failure) {
      const cancelled = failure && failure.name === "OcrCancelledError"
        || /cancelled/i.test(failure && failure.message || "");
      draw([
        h("h3", { class: "callout-title",
                  text: cancelled ? "Text recognition cancelled"
                                  : "Text recognition did not work" }),
        h("p", { text: cancelled
          ? "Nothing was kept, and nothing was sent anywhere."
          : (failure && failure.message)
            || "The scan could not be read on this device." }),
        h("div", { class: "card-actions" }, [
          button("Try again", run, { variant: "quiet" }),
          link("Build my profile manually", "#/profile",
               { class: "btn btn-primary" }),
        ]),
      ]);
    }
  }

  idle();
  return host;
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
    replaceKids(host,
      panel("Your starting profile", [
        h("p", { class: "hint", text:
          `Read from your ${pending.format} by rule-based extraction — not by an `
          + `AI model. It is a draft: correct anything that is wrong, and add `
          + `anything it missed.` }),

        /*
         * OCR output goes through the same review as any other extraction, but
         * it does not deserve the same confidence, and the screen says so before
         * the fields rather than after them. Text recognition misreads names,
         * dates and abbreviations far more often than it misreads prose — which
         * is exactly the part of a CV that carries meaning here.
         */
        pending.ocr
          ? h("div", { class: `callout callout-${
              pending.ocr.quality.key === "fair" ? "info" : "warn"}` }, [
              h("h3", { class: "callout-title",
                        text: "This came from text recognition" }),
              h("p", { text: `${pending.ocr.pages} `
                + `${pending.ocr.pages === 1 ? "page was" : "pages were"} read `
                + `with ${pending.ocr.engine}. Recognition quality: `
                + `${pending.ocr.quality.label.toLowerCase()}.` }),
              h("p", { text: pending.ocr.quality.message }),
              pending.ocr.truncated
                ? h("p", { class: "hint", text: "Only the first few pages were "
                    + "read. A CV longer than that is unusual, and reading all "
                    + "of it would have taken minutes." })
                : null,
              h("p", { class: "hint", text: "The scan and its recognised text "
                + "have been discarded. Only the structured profile below "
                + "remains, and only in this browser." }),
            ])
          : null,
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
  /*
   * The CV became a profile here and nowhere earlier.
   *
   * Choosing a file, parsing a PDF and running text recognition are all steps
   * that can end in nothing. This line runs only once the reader has produced a
   * draft, the person has looked at it and the profile has been saved — which
   * is the point at which Helix actually has what the event claims.
   */
  trackHelixEvent(EVENTS.PROFILE_CREATED_FROM_CV);
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
        /*
         * Always the matches screen.
         *
         * This used to branch: somebody who said they had a target career in
         * mind was sent to the Career Explorer instead, on the theory that
         * searching all 734 is more useful than grouped matches when you
         * already know where you are going.
         *
         * It was wrong twice over. The button says "Show my career options",
         * and the Explorer shows a page of filter controls with the results
         * below them — so the reward for uploading a CV was a wall of dropdowns
         * and no visible careers, which reads as nothing having happened. And
         * the branch threw away the work: matches is the only screen that uses
         * the profile just built.
         *
         * Nothing is lost. The matches screen carries "I know where I want to
         * go — search all careers" as its first action, so the Explorer is one
         * click away for exactly the people who were being sent there.
         */
        button("Show my career options", () => {
          app.setProfile(draft);
          app.state.settings.onboarded = true;
          app.persist();
          app.navigate("/matches");
        }, { variant: "primary" }),
        link("Skip for now", "#/matches", { class: "btn btn-quiet" }),
      ]),
    ], { id: "questions-heading" }),
  ]);
}
