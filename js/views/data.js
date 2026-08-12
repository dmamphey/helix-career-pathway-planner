/** Saved data: what is stored, and the controls to export, import or delete it. */

import { h, panel, button, notice, confirmDialog } from "../ui.js";
import * as storage from "../storage.js";
import { describeProfile, signalLabels } from "../profile.js";

export async function render(app) {
  const state = app.state;
  const stored = storage.rawStoredValue();

  return h("div", { class: "stack" }, [
    panel("What Helix stores on this device", [
      h("p", { text: "One entry in this browser's local storage, on this device "
        + "only. There is no account and no server." }),
      h("dl", { class: "summary" }, [
        h("dt", { text: "Structured profile" }),
        h("dd", { text: state.profile
          ? describeProfile(state.profile) : "None saved" }),
        h("dt", { text: "Career signals" }),
        h("dd", { text: state.profile
          ? (signalLabels(state.profile).join(", ") || "None") : "—" }),
        h("dt", { text: "Target career" }),
        h("dd", { text: state.targetCareerId
          ? (app.catalogue.get(state.targetCareerId) || {}).title
            || state.targetCareerId
          : "None selected" }),
        h("dt", { text: "Saved careers" }),
        h("dd", { text: state.savedCareerIds.length
          ? `${state.savedCareerIds.length} saved` : "None" }),
        h("dt", { text: "Milestone progress" }),
        h("dd", { text: `${Object.keys(state.progress).length} career(s) with `
          + `recorded progress` }),
        h("dt", { text: "Dataset version" }),
        h("dd", { text: state.datasetVersion || app.catalogue.meta.version }),
        h("dt", { text: "Last saved" }),
        h("dd", { text: state.savedAt
          ? new Date(state.savedAt).toLocaleString("en-GB") : "Never" }),
        h("dt", { text: "Storage size" }),
        h("dd", { text: `${stored.length} characters` }),
      ]),
      h("div", { class: "callout callout-good" }, [
        h("p", {}, [
          h("strong", { text: "Not stored: " }),
          "your CV, its text, your name, email address, telephone number, "
          + "postal address or employer names. The profile has no fields for "
          + "them, so they cannot be written even by mistake.",
        ]),
      ]),
    ], { id: "data-heading" }),

    panel("Export and import", [
      h("p", { text: "An export is a plain JSON file containing the same "
        + "structured profile and progress shown above. Use it to move between "
        + "devices or keep a backup." }),
      h("div", { class: "card-actions" }, [
        button("Export my Helix data", () => {
          storage.exportState(app.state, app.catalogue.meta.version);
          notice("Export downloaded to this device.", "good");
        }, { variant: "primary", disabled: !state.profile
             && !state.savedCareerIds.length }),
      ]),
      h("div", { class: "field" }, [
        h("label", { for: "import-file", text: "Import a Helix export" }),
        h("input", { type: "file", id: "import-file", accept: ".json",
          onChange: (event) => doImport(app, event.target.files[0]) }),
        h("p", { class: "hint", text: "Importing replaces what is currently "
          + "saved on this device." }),
      ]),
    ], { id: "export-heading" }),

    panel("Reset", [
      h("p", { text: "Deletes the stored profile, saved careers and all "
        + "milestone progress from this browser. It cannot be undone." }),
      h("div", { class: "card-actions" }, [
        button("Reset Helix", async () => {
          const proceed = await confirmDialog(
            "Delete everything saved on this device?",
            "Your profile, saved careers and milestone progress will be removed "
            + "from this browser. Export your data first if you want to keep it. "
            + "This cannot be undone.",
            "Delete it all");
          if (!proceed) return;
          app.resetAll();
          notice("Helix has been reset on this device.", "info");
          app.navigate("/");
        }, { variant: "danger" }),
      ]),
    ], { id: "reset-heading" }),

    panel("Dataset", [
      h("dl", { class: "summary" }, [
        h("dt", { text: "Name" }),
        h("dd", { text: app.catalogue.meta.name }),
        h("dt", { text: "Version" }),
        h("dd", { text: `${app.catalogue.meta.version} (generated `
          + `${app.catalogue.meta.generated})` }),
        h("dt", { text: "Careers loaded" }),
        h("dd", { text: `${app.catalogue.count}` }),
        h("dt", { text: "Jurisdiction" }),
        h("dd", { text: app.catalogue.meta.jurisdiction }),
        h("dt", { text: "Source organisations" }),
        h("dd", { text: Object.keys(app.catalogue.sources).join(", ") }),
      ]),
      h("p", { class: "hint", text: app.catalogue.meta.designIntent }),
    ], { id: "dataset-heading" }),
  ]);
}

async function doImport(app, file) {
  if (!file) return;
  try {
    if (storage.hasSavedProfile()) {
      const proceed = await confirmDialog(
        "Replace your saved profile?",
        "Importing will replace the profile and progress currently saved in this "
        + "browser.",
        "Import and replace");
      if (!proceed) return;
    }
    const { state, datasetVersion } = await storage.importState(file);
    app.state = state;
    app.rankedCache = null;
    app.persist();
    const mismatch = datasetVersion
      && datasetVersion !== app.catalogue.meta.version;
    notice(mismatch
      ? `Imported. That file was created with dataset version ${datasetVersion}; `
        + `progress has been matched by career id against `
        + `${app.catalogue.meta.version}.`
      : "Imported onto this device.", mismatch ? "info" : "good");
    app.navigate("/data");
  } catch (error) {
    notice(error.message, "warn");
  }
}
