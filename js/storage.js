/**
 * Local progress, and nothing else.
 *
 * One key in localStorage, holding one object whose shape is fixed below. Saving
 * goes through `normaliseProfile`, which copies known fields and drops everything
 * else — so a raw CV, a name or an email address cannot reach storage even if some
 * future caller passes them in. That is a structural guarantee rather than a
 * promise to be careful.
 *
 * There is no backend. If one is ever added, this is the object it would
 * synchronise, which is why it carries its own schema and dataset version.
 */

import { normaliseProfile } from "./profile.js";
import { normaliseIds } from "./comparison.js";
import { normaliseRegion } from "./regions.js";

/*
 * The key keeps its original name through the rename to Helix Career Pathway
 * Planner. It is invisible to the user, and changing it would orphan the saved
 * profile and progress of anybody who had already used the tool — a rebrand is no
 * reason to delete somebody's work.
 */
const KEY = "careerpath.v1";
export const STORAGE_SCHEMA = 1;

/** An empty saved state. */
export function emptyState() {
  return {
    schema: STORAGE_SCHEMA,
    datasetVersion: "",
    savedAt: null,
    profile: null,
    targetCareerId: null,
    savedCareerIds: [],
    compareCareerIds: [],
    // The career a comparison is measured against. Separate from the target
    // career, which is where somebody is going; a baseline is where they are.
    baselineCareerId: null,
    progress: {},
    /*
     * The development timeline, per career.
     *
     * Kept apart from `progress` rather than folded into it. `progress` records
     * whether a pathway milestone is done; a plan entry also carries a date the
     * person chose and a note they wrote, and those are edits to Helix's
     * suggestion rather than progress through it. Merging them would make a
     * regenerated plan overwrite somebody's own dates.
     *
     * Shape: { [careerId]: { [milestoneId]: { status, due, note, horizon } } }
     */
    plans: {},
    settings: {
      jurisdictionAcknowledged: false,
      onboarded: false,
      // Where the person wants to work. It changes which salary figures are
      // shown, and nothing else: a region is not a qualification, so it must
      // never touch alignment, eligibility or what a regulator requires.
      region: "uk",
    },
  };
}

/** Whether the browser will let us store anything at all. */
export function storageAvailable() {
  try {
    const probe = "__careerpath_probe__";
    window.localStorage.setItem(probe, "1");
    window.localStorage.removeItem(probe);
    return true;
  } catch (ignored) {
    return false;
  }
}

/** Read saved state, repairing anything unexpected rather than throwing. */
export function load() {
  if (!storageAvailable()) return emptyState();
  let parsed;
  try {
    const text = window.localStorage.getItem(KEY);
    if (!text) return emptyState();
    parsed = JSON.parse(text);
  } catch (ignored) {
    return emptyState();
  }
  return coerce(parsed);
}

/**
 * Persist state.
 *
 * Returns the state actually written, which is the coerced version — callers use
 * it so that memory and storage cannot drift apart.
 */
export function save(state, datasetVersion) {
  const clean = coerce({ ...state, datasetVersion:
    datasetVersion || state.datasetVersion || "" });
  clean.savedAt = new Date().toISOString();
  if (storageAvailable()) {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(clean));
    } catch (ignored) { /* quota or private mode: the session still works */ }
  }
  return clean;
}

/** Remove everything Helix has stored. */
export function reset() {
  if (storageAvailable()) {
    try { window.localStorage.removeItem(KEY); } catch (ignored) { /* nothing */ }
  }
  return emptyState();
}

/** True when there is a saved profile worth warning about before overwriting. */
export function hasSavedProfile() {
  const state = load();
  return Boolean(state.profile && state.profile.source !== "demo");
}

/** The exact string in storage, for the privacy tests. */
export function rawStoredValue() {
  if (!storageAvailable()) return "";
  try {
    return window.localStorage.getItem(KEY) || "";
  } catch (ignored) {
    return "";
  }
}

/** Force any state through the known shape. */
function coerce(input) {
  const base = emptyState();
  if (!input || typeof input !== "object") return base;

  base.datasetVersion = typeof input.datasetVersion === "string"
    ? input.datasetVersion.slice(0, 20) : "";
  base.savedAt = typeof input.savedAt === "string" ? input.savedAt : null;
  base.profile = input.profile ? normaliseProfile(input.profile) : null;
  base.targetCareerId = isCareerId(input.targetCareerId)
    ? input.targetCareerId : null;
  base.savedCareerIds = (Array.isArray(input.savedCareerIds) ? input.savedCareerIds : [])
    .filter(isCareerId)
    .filter((id, index, all) => all.indexOf(id) === index)
    .slice(0, 24);
  // Added after launch. Absent in state saved by an earlier version, which is why
  // it defaults to empty rather than being required: a migration must never
  // discard a profile because a newer field is missing.
  base.compareCareerIds = normaliseIds(input.compareCareerIds);

  const progress = (input.progress && typeof input.progress === "object")
    ? input.progress : {};
  for (const [careerId, milestones] of Object.entries(progress)) {
    if (!isCareerId(careerId) || !milestones || typeof milestones !== "object") {
      continue;
    }
    const kept = {};
    for (const [milestoneId, status] of Object.entries(milestones)) {
      if (!/^[\w.-]{1,60}$/.test(milestoneId)) continue;
      if (status === "completed" || status === "in_progress") {
        kept[milestoneId] = status;
      }
    }
    if (Object.keys(kept).length) base.progress[careerId] = kept;
  }

  /*
   * Plans, forced through the same known shape as everything else.
   *
   * A note is the only free text Helix stores. It is the user's own words about
   * their own plan, capped at a length that cannot hold a pasted CV, and it is
   * never sent anywhere — but it is the one field where "drop everything
   * unrecognised" has to be replaced by "keep, and bound".
   */
  const plans = (input.plans && typeof input.plans === "object") ? input.plans : {};
  for (const [careerId, milestones] of Object.entries(plans)) {
    if (!isCareerId(careerId) || !milestones || typeof milestones !== "object") {
      continue;
    }
    const kept = {};
    for (const [milestoneId, entry] of Object.entries(milestones)) {
      if (!/^[\w.-]{1,60}$/.test(milestoneId) || !entry || typeof entry !== "object") {
        continue;
      }
      const clean = {};
      if (entry.status === "completed" || entry.status === "in_progress") {
        clean.status = entry.status;
      }
      if (typeof entry.due === "string" && /^\d{4}-\d{2}-\d{2}$/.test(entry.due)) {
        clean.due = entry.due;
      }
      if (typeof entry.note === "string" && entry.note.trim()) {
        clean.note = entry.note.trim().slice(0, 500);
      }
      if (typeof entry.horizon === "string" && /^[\w-]{1,20}$/.test(entry.horizon)) {
        clean.horizon = entry.horizon;
      }
      if (Object.keys(clean).length) kept[milestoneId] = clean;
    }
    if (Object.keys(kept).length) base.plans[careerId] = kept;
  }

  const settings = (input.settings && typeof input.settings === "object")
    ? input.settings : {};
  base.settings.jurisdictionAcknowledged =
    settings.jurisdictionAcknowledged === true;
  base.settings.onboarded = settings.onboarded === true;
  base.settings.region = normaliseRegion(settings.region);
  base.baselineCareerId = isCareerId(input.baselineCareerId)
    ? input.baselineCareerId : null;
  return base;
}

/** Career ids are the dataset's own format, and are checked as such. */
function isCareerId(value) {
  return typeof value === "string" && /^CP-\d{1,5}$/.test(value);
}

/* --------------------------------------------------------- export and import */

/** Download the saved state as a local JSON file. */
export function exportState(state, datasetVersion) {
  const payload = {
    application: "Helix Career Pathway Planner",
    exported: new Date().toISOString(),
    datasetVersion: datasetVersion || state.datasetVersion || "",
    note: "This file contains your structured career profile and progress. It "
        + "does not contain your CV or any contact details.",
    state: coerce(state),
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)],
                        { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `helix-career-pathway-${stamp()}.json`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
  return payload;
}

/**
 * Read an exported file back.
 *
 * Anything unrecognised is dropped by `coerce`, so importing a file somebody has
 * edited by hand cannot inject fields the application does not expect.
 */
export async function importState(file) {
  let parsed;
  try {
    parsed = JSON.parse(await file.text());
  } catch (cause) {
    throw new Error("That file is not a Helix export — it is not valid "
                  + "JSON.");
  }
  const state = parsed && parsed.state ? parsed.state : parsed;
  if (!state || typeof state !== "object") {
    throw new Error("That file does not contain Helix progress.");
  }
  const clean = coerce(state);
  if (!clean.profile && !clean.savedCareerIds.length
      && !Object.keys(clean.progress).length) {
    throw new Error("That file contains no Helix profile or progress to "
                  + "import.");
  }
  return {
    state: clean,
    datasetVersion: typeof parsed.datasetVersion === "string"
      ? parsed.datasetVersion : clean.datasetVersion,
  };
}

function stamp() {
  const now = new Date();
  const pad = (value) => String(value).padStart(2, "0");
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}
