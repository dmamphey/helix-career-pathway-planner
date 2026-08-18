/**
 * Product analytics, and the four walls around them.
 *
 * Helix reads CVs locally and says so on every screen that touches one. Adding
 * analytics to a tool that makes that promise is only defensible if the
 * analytics cannot break it, so the guarantee is structural rather than a
 * convention to be remembered at each call site.
 *
 * Four gates, all of which must open:
 *
 *   1. Host.    Only the production hostname. Nothing is sent from localhost, a
 *               preview build, a test runner or a developer's machine.
 *   2. Consent. Nothing loads until somebody has said yes. Not the tag, not a
 *               page view, and not an event recording that they said no.
 *   3. Shape.   `trackHelixEvent` takes an event name and nothing else. There is
 *               no parameter argument, so there is no way to pass a career, a
 *               profile or a document — a caller that wanted to leak something
 *               would have to change this file first.
 *   4. Route.   Page paths are mapped through a fixed table to a fixed set of
 *               screen names. `#/career/CP-0123` reports `career_detail`. The
 *               function cannot return a value that is not written below.
 *
 * The third gate is the important one. Every other privacy control here is a
 * check that could be passed; that one is an absence of the parameter.
 */

/*
 * Where analytics may run.
 *
 * A set rather than a comparison so a second production hostname is a one-line
 * change. Everything not named here — localhost, 127.0.0.1, *.github.io preview
 * builds, file://, a LAN address, the local test server — is excluded by
 * default, which is the right direction for a list like this to fail in.
 */
export const ANALYTICS_ALLOWED_HOSTS = new Set([
  "tools.optymumss.com",
]);

export const MEASUREMENT_ID = "G-L962W0939Q";

/*
 * The consent flag lives in its own localStorage key, outside `careerpath.v1`.
 *
 * That object is the career data: it is exported, imported and deleted as a
 * unit by My data, and "Reset Helix" removes it. A privacy decision is not
 * career data. Folding it in would mean an export carried somebody's consent
 * choice into a file they might share, and that clearing their saved careers
 * silently re-consented them to being measured.
 */
const CONSENT_KEY = "helix_analytics_consent";
export const GRANTED = "granted";
export const DENIED = "denied";
/** No answer yet. Distinct from denied: one is a decision, the other is not. */
export const UNSET = "unset";

/**
 * Every event Helix may send.
 *
 * Frozen, and checked at the point of sending. A mistyped name would otherwise
 * appear in GA4 as a new event that quietly never matches the funnel, and the
 * failure would be invisible for weeks.
 */
export const EVENTS = Object.freeze({
  PROFILE_CREATED_FROM_CV: "profile_created_from_cv",
  PROFILE_CREATED_MANUALLY: "profile_created_manually",
  RECOMMENDATIONS_GENERATED: "recommendations_generated",
  CAREER_SAVED: "career_saved",
  CAREER_COMPARISON_VIEWED: "career_comparison_viewed",
  BASELINE_PINNED: "baseline_pinned",
  BRIDGE_ROUTE_VIEWED: "bridge_route_viewed",
  CAREER_GRAPH_OPENED: "career_graph_opened",
  CAREER_PLAN_GENERATED: "career_plan_generated",
  CAREER_PLAN_EXPORTED: "career_plan_exported",
  OCR_COMPLETED: "ocr_completed",
  WHY_NOT_RECOMMENDED_VIEWED: "why_not_recommended_viewed",
  MILESTONE_COMPLETED: "milestone_completed",
});

const EVENT_NAMES = new Set(Object.values(EVENTS));

/**
 * Route to screen name.
 *
 * Keyed on the first path segment only, which is what makes the sanitising
 * total rather than best-effort: `/career/:id`, `/pathway/:id`, `/graph/:id`,
 * `/plan/:id` and `/compare/:ids` all carry career identifiers in later
 * segments, and those segments are never read. The rest of the URL is not
 * escaped or filtered — it is discarded.
 *
 * The names on the right are the vocabulary GA4 will show. They describe the
 * screen's job rather than mirroring Helix's internal route names, so
 * `/matches` reports as `recommendations` and `/preferences` as `priorities`.
 */
const SCREENS = new Map([
  ["", "start"],
  ["upload", "upload"],
  ["review", "cv_review"],
  ["questions", "questions"],
  ["profile", "profile"],
  ["preferences", "priorities"],
  ["explore", "explore"],
  ["matches", "recommendations"],
  ["career", "career_detail"],
  ["pathway", "pathway"],
  ["graph", "career_graph"],
  ["saved", "saved"],
  ["compare", "compare"],
  ["plan", "plan"],
  ["data", "data"],
]);

/** Every screen name that may ever be transmitted. Used by the tests. */
export const SAFE_SCREEN_NAMES = Object.freeze(
  [...new Set([...SCREENS.values(), "not_found"])].sort());

/* --------------------------------------------------------------- the gates */

/** Whether this hostname may send analytics at all. Pure, so it is testable. */
export function isAnalyticsHost(hostname) {
  return ANALYTICS_ALLOWED_HOSTS.has(String(hostname || "").toLowerCase());
}

/**
 * The stored consent decision.
 *
 * Any value that is not exactly "granted" or "denied" reads as unset, so a
 * corrupted or hand-edited key fails towards asking rather than towards
 * collecting.
 */
export function consentState() {
  try {
    const raw = window.localStorage.getItem(CONSENT_KEY);
    if (raw === GRANTED || raw === DENIED) return raw;
  } catch (ignored) { /* private mode, or storage disabled */ }
  return UNSET;
}

export function userHasGrantedAnalyticsConsent() {
  return consentState() === GRANTED;
}

/** Whether a decision has been made, either way. Drives the banner. */
export function consentDecided() {
  return consentState() !== UNSET;
}

export function canUseAnalytics() {
  return isAnalyticsHost(window.location.hostname)
      && userHasGrantedAnalyticsConsent();
}

/* -------------------------------------------------------------- the loader */

/**
 * Load gtag.js, once.
 *
 * `send_page_view: false` because Helix is a hash-routed single page
 * application: the automatic page view would fire once on load with the real
 * URL — including whatever career identifier happened to be in the hash — and
 * never again. Page views are sent manually instead, from sanitised names.
 *
 * Google Signals and advertising personalisation are switched off in the same
 * call. They are the two settings that turn a usage measurement into an
 * advertising profile, and neither has anything to offer a career planner.
 */
export function loadGoogleAnalytics() {
  if (!canUseAnalytics()) return false;
  if (window.__helixGaLoaded) return true;

  try {
    window.dataLayer = window.dataLayer || [];
    window.gtag = window.gtag || function gtag() {
      window.dataLayer.push(arguments);
    };

    const script = document.createElement("script");
    script.async = true;
    script.src =
      `https://www.googletagmanager.com/gtag/js?id=${MEASUREMENT_ID}`;
    document.head.appendChild(script);

    window.gtag("js", new Date());
    window.gtag("config", MEASUREMENT_ID, {
      send_page_view: false,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
    });

    window.__helixGaLoaded = true;
    return true;
  } catch (ignored) {
    /*
     * A blocked script, a locked-down CSP or an extension that removes the tag
     * all land here. Analytics are optional and Helix is not: swallow it.
     */
    return false;
  }
}

/** Whether the tag is present and callable right now. */
function tagReady() {
  return Boolean(window.__helixGaLoaded) && typeof window.gtag === "function";
}

/* --------------------------------------------------------------- reporting */

/**
 * Send one event.
 *
 * The signature is the whole privacy argument: a name, and nothing else. There
 * is no second parameter for a payload, so no call site anywhere in Helix can
 * attach a career, a profile, a gap, a salary or an error message — not by
 * mistake, and not by a later edit that looked harmless.
 *
 * @param {string} name one of EVENTS
 * @returns {boolean} whether it was actually sent
 */
export function trackHelixEvent(name) {
  if (!EVENT_NAMES.has(name)) return false;
  if (!canUseAnalytics() || !tagReady()) return false;
  try {
    window.gtag("event", name);
    return true;
  } catch (ignored) {
    return false;
  }
}

/*
 * Events that describe "the user reached this screen and it worked" have to
 * survive redraws. My options regroups itself when priorities change, the
 * career page redraws when a career is saved, the graph redraws when a node is
 * expanded — none of those is a new occurrence of the thing being measured.
 *
 * So: a set of names already sent, cleared whenever the router resolves a new
 * screen. Re-entering the comparison later is a genuine second viewing and does
 * fire again; pressing "next 6" is not, and does not.
 */
let sentThisView = new Set();

/** Called by the router on every resolved route, before the view renders. */
export function beginView() {
  sentThisView = new Set();
}

/**
 * Send an event at most once per visit to the current screen.
 *
 * Only records the name as sent when it really was, so granting consent partway
 * through a screen does not leave that screen's event permanently suppressed.
 */
export function trackHelixEventOnce(name) {
  if (sentThisView.has(name)) return false;
  const sent = trackHelixEvent(name);
  if (sent) sentThisView.add(name);
  return sent;
}

/* -------------------------------------------------------------- page views */

/**
 * The current screen name, from the current hash.
 *
 * Reads the first path segment and looks it up. Anything unrecognised is
 * `not_found`, which is also what the router shows. The return value can only
 * ever be a string written in SCREENS — there is no path through this function
 * that returns any part of its input.
 */
export function getSafeHelixRouteName(path) {
  const raw = path === undefined
    ? String(window.location.hash || "").replace(/^#/, "")
    : String(path || "");
  const first = raw.split("?")[0].split("/").filter(Boolean)[0] || "";
  return SCREENS.get(first.toLowerCase()) || "not_found";
}

/**
 * The page view payload.
 *
 * Built rather than sent, so a test can assert on it directly. `page_location`
 * is assembled from the site's own origin and path plus the sanitised name — it
 * is deliberately not derived from `window.location.href`, because that string
 * contains the real hash and one careless edit would ship it.
 */
export function pageViewPayload(routeName) {
  const name = SAFE_SCREEN_NAMES.includes(routeName) ? routeName : "not_found";
  return {
    page_title: `Helix | ${name}`,
    page_location:
      `${window.location.origin}${window.location.pathname}#/${name}`,
  };
}

/*
 * The last screen name reported, so a redraw, a state change or a repeated
 * `resolve()` of the same route does not count as another view.
 */
let lastTrackedRoute = null;

/** Whether a page view for this screen would repeat the last one sent. */
export function isDuplicatePageView(routeName) {
  return routeName === lastTrackedRoute;
}

export function trackHelixPageView() {
  if (!canUseAnalytics() || !tagReady()) return false;
  const routeName = getSafeHelixRouteName();
  if (isDuplicatePageView(routeName)) return false;
  try {
    window.gtag("event", "page_view", pageViewPayload(routeName));
    lastTrackedRoute = routeName;
    return true;
  } catch (ignored) {
    return false;
  }
}

/* ----------------------------------------------------------------- consent */

/**
 * Record a decision, and act on it.
 *
 * Granting loads the tag and reports the screen the person is on, so the visit
 * is not missing its first page view. Withdrawing stops every future call: the
 * gate is re-read on each one, so nothing further is sent. A tag already in the
 * document cannot be unloaded, but it is never called again, and a reload
 * leaves it out entirely.
 */
export function setAnalyticsConsent(decision) {
  const value = decision === GRANTED ? GRANTED : DENIED;
  try {
    window.localStorage.setItem(CONSENT_KEY, value);
  } catch (ignored) { /* private mode: the choice holds for this session only */ }

  if (value === GRANTED && loadGoogleAnalytics()) {
    lastTrackedRoute = null;
    trackHelixPageView();
  }
  return value;
}

/**
 * Start analytics for a returning visitor who has already agreed.
 *
 * Safe to call unconditionally: on a non-production host, or without consent,
 * every branch below is a no-op.
 */
export function initAnalytics() {
  if (!canUseAnalytics()) return false;
  if (!loadGoogleAnalytics()) return false;
  trackHelixPageView();
  return true;
}

/** Test seam. Clears the module's memory of what it has already reported. */
export function resetTrackingStateForTests() {
  lastTrackedRoute = null;
  sentThisView = new Set();
}
