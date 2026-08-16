/** Saved data: what is stored, and the controls to export, import or delete it. */

import {
  h, panel, button, link, notice, confirmDialog, datasetLabel,
  DATASET_DISPLAY_NAME,
} from "../ui.js";
import * as storage from "../storage.js";
import * as market from "../market-data.js";
import * as labour from "../labour-market.js";
import { describeProfile, signalLabels } from "../profile.js";
import { FIT_LEVELS } from "../preference-fit.js";
import { LEVELS as EFFORT_LEVELS } from "../transition-effort.js";

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
        h("dd", { text: datasetLabel({
          version: state.datasetVersion || app.catalogue.meta.version }) }),
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

    /*
     * Reset now lives on the start screen, beside the upload button.
     *
     * A pointer rather than nothing: this is where the control used to be, and
     * somebody who has been here before will come looking for it. Telling them
     * where it went costs two lines and saves a hunt through the settings.
     */
    panel("Reset", [
      h("p", {}, [
        "Deleting everything saved on this device is now done from the ",
        link("start screen", "#/"),
        ", next to the upload button — that is where people decide to start "
        + "again, rather than partway down a data page.",
      ]),
      h("p", { class: "hint", text: "Export your data above first if you want "
        + "to keep it. A reset cannot be undone." }),
    ], { id: "reset-heading" }),

    panel("Dataset", [
      h("dl", { class: "summary" }, [
        h("dt", { text: "Name" }),
        h("dd", { text: DATASET_DISPLAY_NAME }),
        h("dt", { text: "Version" }),
        h("dd", { text: `${datasetLabel(app.catalogue.meta)} (generated `
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

    marketPanel(app),
    labourProviderPanel(),
    methodologyPanel(),
  ]);
}

/**
 * Salary coverage, stated plainly enough to be checked.
 *
 * The counts are computed from the loaded file rather than written down, so this
 * panel cannot drift away from what the application is actually using. Showing
 * that 421 of 677 figures are limited-data estimates is the point: a product that
 * hides the weakness of its own data has not earned the trust it is asking for.
 */
function marketPanel(app) {
  const state = market.status();
  if (!state.ok) {
    return panel("Salary and working-life data", [
      h("div", { class: "callout callout-warn" }, [
        h("p", { text: state.message }),
      ]),
    ], { id: "market-heading" });
  }

  const counts = market.coverage();
  const evidenceRows = Object.entries(market.EVIDENCE)
    .map(([key, entry]) => [entry.label, counts.byEvidence[key] || 0,
                            entry.explain]);

  return panel("Salary and working-life data", [
    h("dl", { class: "summary" }, [
      h("dt", { text: "Careers in the catalogue" }),
      h("dd", { text: `${app.catalogue.count}` }),
      h("dt", { text: "Careers with a published salary" }),
      h("dd", { text: `${counts.total} of ${app.catalogue.count}` }),
      h("dt", { text: "Salary data version" }),
      h("dd", { text: `${datasetLabel(state.meta)} (generated `
        + `${state.meta.generated})` }),
      h("dt", { text: "Careers with typical hours" }),
      h("dd", { text: `${counts.withHours} — from official job profiles only. `
        + `The rest show “Not yet available” rather than an estimate.` }),
      h("dt", { text: "Careers with an official role description" }),
      h("dd", { text: `${counts.withRole} of ${counts.total}. Every other career `
        + `has a description composed from its own recorded attributes and `
        + `labelled as composed — none is left showing only its family's.` }),
      h("dt", { text: "Records past their review date" }),
      h("dd", { text: counts.stale
        ? `${counts.stale} — shown with a “due review” note wherever they appear`
        : "None" }),
    ]),

    h("h3", { text: "How firmly each salary is grounded" }),
    h("div", { class: "table-scroll" }, [
      h("table", { class: "compare" }, [
        h("thead", {}, [h("tr", {}, [
          h("th", { scope: "col", text: "Evidence" }),
          h("th", { scope: "col", text: "Careers" }),
          h("th", { scope: "col", text: "What it means" }),
        ])]),
        h("tbody", {}, evidenceRows.map(([label, count, explain]) =>
          h("tr", {}, [
            h("th", { scope: "row", text: label }),
            h("td", { text: String(count) }),
            h("td", { text: explain }),
          ]))),
      ]),
    ]),

    h("h3", { text: "Where the data comes from" }),
    h("ul", { class: "plain" }, (state.meta.attribution || []).map((line) =>
      h("li", { text: line }))),
    h("p", { class: "hint", text: "Your browser reads all of this from one file "
      + "served by Helix. It never contacts the National Careers Service, the "
      + "ONS, NHS Employers or any salary website — so the figures do not change "
      + "between page views, and nobody learns which careers you looked at." }),
    h("div", { class: "card-actions" }, [
      link("Read the full methodology",
           "docs/MARKET-DATA-METHODOLOGY.md", { class: "btn btn-quiet" }),
    ]),
  ], { id: "market-heading" });
}

/** What the three measures mean, in one place, in the words the app uses. */
function methodologyPanel() {
  return panel("What the three measures mean", [
    h("p", { text: "Helix reports three separate things about a career and never "
      + "combines them into one score. A career can do well on one and badly on "
      + "another, and which trade-off matters is your decision, not the tool's. "
      + "None of them is a probability of getting a job." }),

    h("h3", { text: "Background alignment" }),
    h("p", { text: "How much of a career's subject matter your profile already "
      + "covers — role and title similarity, skill and subject overlap, "
      + "education, sector exposure, experience, transferable strengths, your "
      + "stated interests and professional context. Mandatory and regulated "
      + "requirements are deliberately kept out of it and shown separately, so a "
      + "strong alignment can never hide a registration requirement." }),

    h("h3", { text: "Preference fit" }),
    h("p", { text: "How well a career matches the priorities you stated, which is "
      + "a different question from what you have already done. Only the "
      + "priorities you answered are scored, and only against careers Helix holds "
      + "the matching information for. A career is never marked down because "
      + "something about it is unknown — the result is worked out across what "
      + "could actually be compared." }),
    h("ul", { class: "plain" }, Object.values(FIT_LEVELS).map((level) =>
      h("li", { text: level.label }))),
    h("p", { class: "hint", text: "Changing a priority cannot change a background "
      + "alignment score. The two are computed by separate code and the test "
      + "suite checks that they stay that way." }),

    h("h3", { text: "Transition effort" }),
    h("p", { text: "How big the move would be: verified requirements, whether "
      + "entry runs through a formal training route, how many genuine development "
      + "gaps there are, and how close your existing field is. Salary and "
      + "popularity are not inputs. It describes the distance to cover, not your "
      + "chances of covering it — a high-effort route is a fact about the route, "
      + "not a reason not to take it." }),
    h("ul", { class: "plain" }, Object.values(EFFORT_LEVELS).map((level) =>
      h("li", { text: `${level.label} — ${level.summary}` }))),
  ], { id: "methodology-heading" });
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

/**
 * Which labour market providers were consulted, and what each can answer.
 *
 * Published because "no demand data" is an unhelpful thing to be told without a
 * reason. This names the provider that answered, the ones that did not, exactly
 * which credential each missing one needs, and — importantly — what each
 * provider is capable of answering even in principle. A reader can then see that
 * Helix shows no vacancy count because its working source does not publish one,
 * not because the number was hidden.
 */
function labourProviderPanel() {
  const state = labour.status();
  const providers = labour.providerReport();
  const dataset = labour.meta();

  if (!providers.length) {
    return panel("Labour market providers", [
      h("p", { class: "hint", text: state.ok
        ? "No provider report was published with the current signals."
        : state.message }),
    ], { id: "labour-providers-heading" });
  }

  const ability = (capabilities) => {
    const can = Object.entries(capabilities)
      .filter(([, value]) => value)
      .map(([key]) => key.replace(/_/g, " "));
    return can.length ? can.join(", ") : "nothing on its own";
  };

  return panel("Labour market providers", [
    h("p", { text: "Helix reads labour market signals from a static file "
      + "written during enrichment. No credential exists in the browser, and no "
      + "page contacts a job board." }),

    h("div", { class: "table-scroll" }, [
      h("table", { class: "compare" }, [
        h("thead", {}, [h("tr", {}, [
          h("th", { scope: "col", text: "Provider" }),
          h("th", { scope: "col", text: "Used" }),
          h("th", { scope: "col", text: "Can answer" }),
          h("th", { scope: "col", text: "Status" }),
        ])]),
        h("tbody", {}, providers.map((entry) => h("tr", {}, [
          h("th", { scope: "row", text: entry.provider }),
          h("td", { text: entry.categoriesAnswered
            ? `${entry.categoriesAnswered} categories` : "No" }),
          h("td", { text: ability(entry.capabilities) }),
          h("td", { text: entry.available ? "Available" : entry.reason }),
        ]))),
      ]),
    ]),

    dataset && dataset.limits
      ? h("div", {}, [
          h("h3", { text: "What these signals cannot tell you" }),
          h("ul", {}, dataset.limits.map((line) => h("li", { text: line }))),
        ])
      : null,
  ], { id: "labour-providers-heading" });
}
