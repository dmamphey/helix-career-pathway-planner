/**
 * Application wiring.
 *
 * Holds the one piece of shared state — the loaded catalogue and the saved
 * progress — and hands both to the views. All the reasoning lives in the engine
 * modules; this file is plumbing, on purpose, so that the interesting logic stays
 * testable without a DOM.
 */

import * as router from "./router.js";
import * as storage from "./storage.js";
import { loadCareers, sourcesFor } from "./career-data.js";
import * as market from "./market-data.js";
import * as comparison from "./comparison.js";
import { normaliseProfile, hasPreferences } from "./profile.js";
import { preferenceFit } from "./preference-fit.js";
import { rankCareers, scoreCareer } from "./matcher.js";
import { analyseGaps } from "./gap-engine.js";
import { buildPathway } from "./pathway-engine.js";
import { nextActions } from "./action-engine.js";
import { transitionEffort, whyThisCareer } from "./transition-effort.js";
import { loadRulePack } from "./rules.js";
import {
  clear, errorPanel, clearNotice, notice, button, h, link, datasetLabel,
} from "./ui.js";

import * as homeView from "./views/home.js";
import * as onboardingView from "./views/onboarding.js";
import * as profileView from "./views/profile-view.js";
import * as exploreView from "./views/explore.js";
import * as careerView from "./views/career.js";
import * as pathwayView from "./views/pathway.js";
import * as savedView from "./views/saved.js";
import * as planView from "./views/plan.js";
import * as dataView from "./views/data.js";
import * as compareView from "./views/compare.js";
import * as preferencesView from "./views/preferences.js";

/**
 * The application object passed to every view.
 *
 * `pending` holds a profile parsed from a CV but not yet confirmed. It lives in
 * memory only and is never written to storage — confirmation is what moves a
 * profile from here into the saved state.
 */
export const app = {
  catalogue: null,
  state: storage.emptyState(),
  pending: null,
  rankedCache: null,
  fitCache: new Map(),
  effortCache: new Map(),

  profile() {
    return this.state.profile;
  },

  hasProfile() {
    return Boolean(this.state.profile);
  },

  /** Has the user answered any of the career-priority questions? */
  hasPreferences() {
    return hasPreferences(this.state.profile);
  },

  /** Replace the profile. Ranking is invalidated because it depends on it. */
  setProfile(profile, options = {}) {
    this.state.profile = normaliseProfile(profile);
    this.rankedCache = null;
    this.fitCache.clear();
    this.effortCache.clear();
    if (options.save !== false) this.persist();
    return this.state.profile;
  },

  /**
   * Preference fit for a career.
   *
   * Cached per career because the explorer asks for it while filtering and
   * sorting all 677. The cache is cleared whenever the profile changes, which is
   * the only thing that can alter the answer — the career data is static.
   *
   * `effort` is optional and deliberately bypasses the cache: it comes from an
   * async gap analysis that the card lists do not run, so a result computed with
   * it must not be stored where a caller without it would pick it up.
   */
  fitFor(career, effort) {
    if (!this.state.profile) return null;
    if (effort) return preferenceFit(this.state.profile, career, { effort });
    if (!this.fitCache.has(career.id)) {
      this.fitCache.set(career.id, preferenceFit(this.state.profile, career));
    }
    return this.fitCache.get(career.id);
  },

  persist() {
    const version = this.catalogue ? this.catalogue.meta.version : "";
    this.state = storage.save(this.state, version);
    return this.state;
  },

  /** The full ranking, computed once per profile change. */
  ranked() {
    if (!this.state.profile || !this.catalogue) return [];
    if (!this.rankedCache) {
      this.rankedCache = rankCareers(this.state.profile, this.catalogue.careers);
    }
    return this.rankedCache;
  },

  matchFor(career) {
    if (!this.state.profile) return null;
    const cached = this.ranked().find((item) => item.careerId === career.id);
    return cached || scoreCareer(this.state.profile, career);
  },

  /**
   * Everything the pathway screens need for one career.
   *
   * Async only because a rule pack may have to be fetched; the reasoning itself
   * is synchronous and deterministic.
   */
  async analysisFor(careerId) {
    const career = this.catalogue.get(careerId);
    if (!career) return null;
    const pack = await loadRulePack(careerId);
    const match = this.matchFor(career);
    if (!match) return { career, pack, match: null };
    const gaps = analyseGaps(this.state.profile, match, pack,
                             this.catalogue.sources);
    const pathway = buildPathway(this.state.profile, match, gaps, pack,
                                 this.state.progress[careerId] || {});
    const actions = nextActions(this.state.profile, match, gaps, pathway,
                                { registry: this.catalogue.sources });
    // Effort and the explanation are derived from the same match and gap objects,
    // so they can never contradict what the rest of the screen shows.
    const effort = transitionEffort(this.state.profile, match, gaps);
    const why = whyThisCareer(this.state.profile, match, gaps);
    // Preference fit is computed with the effort in hand, so retraining
    // tolerance can be one of its dimensions.
    const fit = this.fitFor(career, effort);
    return { career, pack, match, gaps, pathway, actions, effort, why, fit };
  },

  /**
   * Transition effort alone, for every career the explorer needs to sort or
   * filter by.
   *
   * `analysisFor` builds a pathway and three actions as well, which the explorer
   * never uses and cannot afford 677 times. This is the same effort object built
   * from the same match and gap analysis, so the value here and the badge on the
   * career page can never disagree.
   */
  async effortFor(careerId) {
    if (this.effortCache.has(careerId)) return this.effortCache.get(careerId);
    const career = this.catalogue.get(careerId);
    const match = career ? this.matchFor(career) : null;
    if (!match) return null;
    const gaps = analyseGaps(this.state.profile, match, await loadRulePack(careerId),
                             this.catalogue.sources);
    const effort = transitionEffort(this.state.profile, match, gaps);
    this.effortCache.set(careerId, effort);
    return effort;
  },

  /** Effort for every career, computed once and reused. */
  async allEfforts() {
    if (!this.state.profile) return new Map();
    for (const career of this.catalogue.careers) await this.effortFor(career.id);
    return this.effortCache;
  },

  sourcesFor(career) {
    return sourcesFor(career, this.catalogue.sources);
  },

  /* --- comparison, which is a working set rather than a bookmark ---------- */

  compareIds() {
    return this.state.compareCareerIds || [];
  },

  isComparing(careerId) {
    return this.compareIds().includes(careerId);
  },

  /**
   * Add or remove a career from the comparison.
   *
   * Returns the action so the caller can explain a refusal: being told nothing
   * when a fifth career will not fit is worse than being told why.
   */
  toggleCompare(careerId) {
    const result = comparison.toggle(this.compareIds(), careerId);
    if (result.action === "full") {
      notice(result.message, "warn");
      return result;
    }
    this.state.compareCareerIds = result.ids;
    this.persist();
    renderTray(this);
    return result;
  },

  clearCompare() {
    this.state.compareCareerIds = [];
    this.persist();
    renderTray(this);
  },

  market,

  isSaved(careerId) {
    return this.state.savedCareerIds.includes(careerId);
  },

  toggleSaved(careerId) {
    const list = this.state.savedCareerIds;
    const at = list.indexOf(careerId);
    if (at >= 0) list.splice(at, 1);
    else if (list.length >= 24) {
      notice("You can save up to 24 careers. Remove one first.", "warn");
      return false;
    } else list.push(careerId);
    this.persist();
    return at < 0;
  },

  setTarget(careerId) {
    this.state.targetCareerId = careerId;
    this.persist();
  },

  setMilestone(careerId, milestoneId, status) {
    const forCareer = this.state.progress[careerId] || {};
    if (status) forCareer[milestoneId] = status;
    else delete forCareer[milestoneId];
    if (Object.keys(forCareer).length) this.state.progress[careerId] = forCareer;
    else delete this.state.progress[careerId];
    this.persist();
  },

  resetAll() {
    this.state = storage.reset();
    this.pending = null;
    this.rankedCache = null;
    this.fitCache.clear();
    this.effortCache.clear();
  },

  navigate: router.navigate,
};

/* ------------------------------------------------------------------- routing */

const VIEWS = [
  ["/", homeView.render],
  ["/upload", onboardingView.renderUpload],
  ["/review", onboardingView.renderReview],
  ["/questions", onboardingView.renderQuestions],
  ["/profile", profileView.render],
  ["/preferences", preferencesView.render],
  ["/explore", exploreView.renderExplorer],
  ["/matches", exploreView.renderMatches],
  ["/career/:id", careerView.render],
  ["/pathway/:id", pathwayView.render],
  ["/saved", savedView.render],
  ["/compare", compareView.render],
  ["/compare/:ids", compareView.render],
  ["/plan/:id", planView.render],
  ["/data", dataView.render],
];

async function show(view, context) {
  const host = document.getElementById("view");
  clearNotice();
  try {
    const node = await view(app, context);
    clear(host);
    host.appendChild(node);
  } catch (error) {
    clear(host);
    host.appendChild(errorPanel(
      "Something went wrong on this screen",
      error && error.message ? error.message : String(error),
      [button("Back to start", () => router.navigate("/"), { variant: "primary" })]));
    // Surfaced for developers; nothing is transmitted anywhere.
    console.error(error);
  }
  document.getElementById("main").focus({ preventScroll: true });
  window.scrollTo({ top: 0, behavior: "instant" });
  markActiveNav();
}

function markActiveNav() {
  const path = router.currentPath();
  for (const anchor of document.querySelectorAll("#nav a")) {
    const target = anchor.getAttribute("href").replace(/^#/, "");
    const active = target === "/" ? path === "/" : path.startsWith(target);
    anchor.setAttribute("aria-current", active ? "page" : "false");
  }
}

/* --------------------------------------------------------------------- tray */

/**
 * The persistent comparison tray.
 *
 * Lives outside `#view`, so a selection made in the explorer is still there after
 * opening a career and coming back. It announces its own count politely rather
 * than stealing focus, and it hides itself entirely when nothing is selected so it
 * never covers content for no reason.
 */
function renderTray(instance) {
  const host = document.getElementById("compare-tray");
  if (!host) return;
  const ids = instance.compareIds();
  clear(host);
  host.hidden = ids.length === 0;
  if (!ids.length) return;

  const careers = ids.map((id) => instance.catalogue.get(id)).filter(Boolean);
  const ready = comparison.canCompare(ids);

  host.appendChild(h("div", { class: "tray-inner" }, [
    h("p", { class: "tray-count" }, [
      h("strong", { text: careers.length === 1
        ? `${careers[0].title} selected`
        : `${careers.length} careers selected` }),
      h("span", { class: "hint", text: ready
        ? ` · up to ${comparison.MAX_COMPARE}`
        : " · add another to compare" }),
    ]),
    h("ul", { class: "tray-chips" }, careers.map((career) =>
      h("li", { class: "chip chip-removable" }, [
        h("span", { text: career.title }),
        h("button", { type: "button", class: "chip-remove",
          "aria-label": `Remove ${career.title} from the comparison`,
          onClick: () => instance.toggleCompare(career.id) }, "×"),
      ]))),
    h("div", { class: "tray-actions" }, [
      button("Clear", () => instance.clearCompare(), { variant: "quiet" }),
      ready
        ? link("Compare now", `#${comparison.routeFor(ids)}`,
               { class: "btn btn-primary" })
        : link("Find another career", "#/explore", { class: "btn" }),
    ]),
  ]));
}

export { renderTray };

/* --------------------------------------------------------------------- boot */

async function boot() {
  const host = document.getElementById("view");
  try {
    app.catalogue = await loadCareers();
  } catch (error) {
    clear(host);
    host.appendChild(errorPanel(
      "The career dataset could not be loaded",
      error.message,
      [button("Try again", () => window.location.reload(), { variant: "primary" })]));
    return;
  }

  // Salary data is additive: if it fails to load the taxonomy, matching,
  // pathways and gaps all still work, so a failure degrades rather than blocks.
  await market.loadMarketData();
  const marketStatus = market.status();
  if (!marketStatus.ok) {
    notice(marketStatus.message, "warn");
  }

  app.state = storage.load();
  // Progress is keyed by career id, so a dataset upgrade keeps it. Record which
  // version the current progress was built against.
  if (app.state.profile && app.state.datasetVersion
      && app.state.datasetVersion !== app.catalogue.meta.version) {
    notice(`Your saved progress was created with dataset version `
         + `${app.state.datasetVersion}. It has been kept and matched by career `
         + `id against version ${app.catalogue.meta.version}.`, "info");
  }
  app.persist();

  // The dataset line used to sit under the tagline on every page. It is version
  // metadata, which belongs on the My data screen with the rest of the
  // provenance rather than in the masthead of a career tool. The element may be
  // absent, so this only fills it when a page still carries one.
  const datasetNote = document.getElementById("dataset-note");
  if (datasetNote) {
    datasetNote.textContent =
      `${app.catalogue.count} UK careers · dataset ${datasetLabel(app.catalogue.meta)}`
      + (marketStatus.ok ? ` · salary data ${datasetLabel(marketStatus.meta)}` : "");
  }

  for (const [pattern, view] of VIEWS) {
    router.route(pattern, (context) => show(view, context));
  }
  router.fallback(() => show(async () => errorPanel(
    "Screen not found",
    "That address does not match anything in Helix.",
    [button("Back to start", () => router.navigate("/"), { variant: "primary" })]),
    {}));

  router.start();
  renderTray(app);
}

document.addEventListener("DOMContentLoaded", boot);
