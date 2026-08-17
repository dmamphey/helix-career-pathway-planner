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
import * as labour from "./labour-market.js";
import * as comparison from "./comparison.js";
import { normaliseRegion } from "./regions.js";
import { normaliseProfile, hasPreferences } from "./profile.js";
import { preferenceFit } from "./preference-fit.js";
import { rankCareers, scoreCareer } from "./matcher.js";
import { analyseGaps } from "./gap-engine.js";
import { buildPathway } from "./pathway-engine.js";
import { nextActions } from "./action-engine.js";
import { transitionEffort, whyThisCareer } from "./transition-effort.js";
import { bridgeRoles } from "./bridge-engine.js";
import { buildTimeline } from "./timeline-engine.js";
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
import * as graphView from "./views/graph.js";
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

  /**
   * Where somebody belongs when a screen is finished with them.
   *
   * Several screens sent people to the Career Explorer when they were done —
   * clearing a comparison, backing out of a career page. For a visitor with no
   * profile that is right: the Explorer is the only list they have. For somebody
   * who has uploaded a CV it is a demotion, handing back a catalogue of 716
   * careers in place of the ones matched to them.
   *
   * One helper rather than a conditional at each call site, so a new screen gets
   * the right answer by default instead of having to remember the rule.
   */
  homeRoute() {
    return this.hasProfile() ? "/matches" : "/explore";
  },

  /** The words for that destination, so a label cannot drift from its link. */
  homeLabel() {
    return this.hasProfile() ? "Back to my options" : "Back to all careers";
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
   * sorting all 716. The cache is cleared whenever the profile changes, which is
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
    // Bridges are built before the actions so an action can name the bridge
    // that covers its own gap. Same gap objects throughout, so the action, the
    // bridge card and the timeline cannot describe different gaps.
    const bridge = bridgeRoles({
      target: career,
      targetGaps: gaps,
      careers: this.catalogue.careers,
      matchFor: (item) => this.matchFor(item),
      profile: this.state.profile,
    });
    const actions = nextActions(this.state.profile, match, gaps, pathway,
                                { registry: this.catalogue.sources,
                                  bridges: bridge.bridges });
    // Effort and the explanation are derived from the same match and gap objects,
    // so they can never contradict what the rest of the screen shows.
    const effort = transitionEffort(this.state.profile, match, gaps);
    const why = whyThisCareer(this.state.profile, match, gaps);
    // Preference fit is computed with the effort in hand, so retraining
    // tolerance can be one of its dimensions.
    const fit = this.fitFor(career, effort);
    const timeline = buildTimeline({
      career, actions, gaps, effort, bridge,
      saved: this.planFor(careerId),
    });
    return { career, pack, match, gaps, pathway, actions, effort, why, fit,
             bridge, timeline };
  },

  /**
   * Transition effort alone, for every career the explorer needs to sort or
   * filter by.
   *
   * `analysisFor` builds a pathway and three actions as well, which the explorer
   * never uses and cannot afford 716 times. This is the same effort object built
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

  /* --- the baseline: where somebody is, not where they are going ---------- */

  baselineId() {
    return this.state.baselineCareerId || null;
  },

  baselineCareer() {
    const id = this.baselineId();
    return id && this.catalogue ? this.catalogue.get(id) : null;
  },

  isBaseline(careerId) {
    return this.baselineId() === careerId;
  },

  /**
   * Pin, repin or unpin the baseline.
   *
   * Pinning the career that is already pinned clears it, so the same control
   * both sets and removes — there is no state where somebody is stuck with a
   * baseline they cannot get rid of.
   */
  setBaseline(careerId) {
    const next = this.baselineId() === careerId ? null : careerId;
    this.state.baselineCareerId = next;
    this.persist();
    renderTray(this);
    return next;
  },

  /* --- the development plan, which the user may edit ---------------------- */

  planFor(careerId) {
    return this.state.plans[careerId] || {};
  },

  /**
   * Record one edit to one milestone.
   *
   * Fields are merged rather than replaced, so setting a date does not wipe a
   * note. Passing null for a field clears just that field; an entry with
   * nothing left in it is removed entirely rather than left as an empty object.
   */
  setPlanEntry(careerId, milestoneId, changes) {
    const plan = { ...(this.state.plans[careerId] || {}) };
    const entry = { ...(plan[milestoneId] || {}), ...changes };
    for (const [key, value] of Object.entries(entry)) {
      if (value === null || value === undefined || value === "") delete entry[key];
    }
    if (Object.keys(entry).length) plan[milestoneId] = entry;
    else delete plan[milestoneId];
    if (Object.keys(plan).length) this.state.plans[careerId] = plan;
    else delete this.state.plans[careerId];
    this.persist();
    return entry;
  },

  /** Throw away Helix's suggestions *and* the user's edits for one career. */
  resetPlan(careerId) {
    delete this.state.plans[careerId];
    this.persist();
  },

  /* --- where the user wants to work -------------------------------------- */

  region() {
    return this.state.settings.region || "uk";
  },

  /** How tightly My options is narrowed by stated priorities. "" = not at all. */
  narrowTo() {
    return this.state.settings.narrowTo || "";
  },

  setNarrowTo(level) {
    this.state.settings.narrowTo =
      ["very_strong", "strong", "mixed"].includes(level) ? level : "";
    this.persist();
    return this.state.settings.narrowTo;
  },

  setRegion(key) {
    this.state.settings.region = normaliseRegion(key);
    this.persist();
    return this.state.settings.region;
  },

  market,
  labour,

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
  ["/graph/:id", graphView.render],
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

/* ----------------------------------------------------------- the menu button */

/**
 * The narrow-screen navigation menu.
 *
 * Small enough to be worth writing plainly. The state lives in one class and one
 * `aria-expanded`, and every way of leaving the menu ends in the same `close()`
 * — there is no second path that can leave the button saying "expanded" over a
 * hidden panel.
 *
 * Focus returns to the button on Escape, because somebody who dismissed the menu
 * with a keyboard has nowhere else sensible to be. It is deliberately not a focus
 * trap: this is seven links under a bar, not a modal, and trapping focus in it
 * would be a bigger imposition than the problem it solves.
 */
function wireMenu() {
  const toggle = document.getElementById("nav-toggle");
  const nav = document.getElementById("nav");
  if (!toggle || !nav) return;

  const isOpen = () => nav.classList.contains("is-open");
  const close = () => {
    nav.classList.remove("is-open");
    toggle.setAttribute("aria-expanded", "false");
  };
  const open = () => {
    nav.classList.add("is-open");
    toggle.setAttribute("aria-expanded", "true");
  };

  toggle.addEventListener("click", () => (isOpen() ? close() : open()));

  // Following a link is the commonest way to finish with the menu, and the
  // route change would otherwise leave it open over the screen just navigated
  // to.
  nav.addEventListener("click", (event) => {
    if (event.target.closest("a")) close();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || !isOpen()) return;
    close();
    toggle.focus();
  });

  document.addEventListener("click", (event) => {
    if (!isOpen()) return;
    if (nav.contains(event.target) || toggle.contains(event.target)) return;
    close();
  });

  /*
   * Rotating a phone can cross the breakpoint, at which point the links are laid
   * out in the bar again and `is-open` means nothing — but `aria-expanded` would
   * still claim otherwise to a screen reader.
   */
  const wide = window.matchMedia("(min-width: 52.0625rem)");
  const sync = () => { if (wide.matches) close(); };
  if (wide.addEventListener) wide.addEventListener("change", sync);
  sync();
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
  // Labour market signals are the most optional thing in Helix: external,
  // experimental and prone to going stale. A failure here is not worth a
  // warning banner — the career pages say they have no current signal, which is
  // a statement about Helix's evidence rather than about the job market.
  await labour.loadLabourMarket();
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
  wireMenu();
}

document.addEventListener("DOMContentLoaded", boot);
