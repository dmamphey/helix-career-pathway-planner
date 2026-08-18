/**
 * The analytics choice: the banner that asks, and the panel that lets somebody
 * change their mind.
 *
 * Both live here rather than in the screen that shows them, so the wording
 * cannot drift apart. What the banner promises and what My data reports are the
 * same sentences from the same file.
 *
 * It is a region, not a modal. Helix does not need permission to work, so
 * trapping focus and blocking the page until somebody answers would be
 * pressure applied for our benefit rather than theirs. Both answers are one
 * button, neither is styled as the obvious one, and the choice can be ignored —
 * ignoring it is the same as declining, because nothing loads until the answer
 * is yes.
 */

import { h, button, panel } from "./ui.js";
import * as analytics from "./analytics.js";

const HOST_ID = "analytics-consent";

const HEADING = "Help us improve Helix";

const EXPLANATION =
  "We use privacy-conscious usage analytics to understand how Helix is used. "
  + "Your CV, career profile and career plan are not sent to Google Analytics.";

/**
 * What is actually measured, in the settings panel rather than the banner.
 *
 * The banner has to be short enough to read. Somebody who wants the detail
 * before deciding can follow the link to My data, and this is what they find.
 */
const DETAIL = [
  "Which screens are opened, using fixed names such as “recommendations” or "
  + "“compare”. The career identifiers in the address bar are removed before "
  + "anything is sent.",
  "Whether a step succeeded — that a profile was built, that options were "
  + "generated, that a plan was exported. The event is the fact that it "
  + "happened, and carries nothing else.",
  "Nothing about which careers you looked at, saved, compared or planned "
  + "against, and nothing from your CV or profile.",
];

/* ------------------------------------------------------------------ banner */

/**
 * Build the banner.
 *
 * Exported so the tests and the local preview can render it without waiting for
 * a real undecided visitor on the production host.
 */
export function consentBannerNode(onDecision) {
  const decide = (value) => {
    analytics.setAnalyticsConsent(value);
    dismissConsentBanner();
    if (onDecision) onDecision(value);
  };

  return h("div", {
    id: HOST_ID,
    class: "consent",
    role: "region",
    "aria-labelledby": "consent-heading",
  }, [
    h("div", { class: "consent-inner" }, [
      h("div", { class: "consent-text" }, [
        h("h2", { id: "consent-heading", class: "consent-title", text: HEADING }),
        h("p", { text: EXPLANATION }),
      ]),
      h("div", { class: "consent-actions" }, [
        button("Allow analytics", () => decide(analytics.GRANTED),
               { class: "btn-tap" }),
        button("Decline", () => decide(analytics.DENIED), { class: "btn-tap" }),
      ]),
    ]),
  ]);
}

export function dismissConsentBanner() {
  const existing = document.getElementById(HOST_ID);
  if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
  document.body.classList.remove("has-consent");
  document.body.style.removeProperty("--consent-height");
}

/**
 * Put the banner in the page, and make room for it.
 *
 * The bar is fixed, so it would otherwise cover the last of the page and sit on
 * top of the comparison tray. Its real height is measured and published as a
 * custom property rather than guessed at, because the text wraps to one, two or
 * three lines depending on the width and a hard-coded reserve is wrong at two
 * of those three.
 */
function insertBanner(banner) {
  const skip = document.querySelector("a.skip");
  if (skip && skip.nextSibling) {
    document.body.insertBefore(banner, skip.nextSibling);
  } else {
    document.body.insertBefore(banner, document.body.firstChild);
  }
  document.body.classList.add("has-consent");

  /*
   * Measured from the element, continuously.
   *
   * A window resize listener was not enough: the bar is 100px on a desktop and
   * 250px at 320px wide, and the reserve went stale between the resize firing
   * and the text rewrapping. A ResizeObserver watches the thing that actually
   * changes, so it is also correct when a webfont lands or a phone is rotated.
   */
  const apply = () => {
    if (!banner.isConnected) return;
    const height = Math.ceil(banner.getBoundingClientRect().height);
    if (height) document.body.style.setProperty("--consent-height", `${height}px`);
  };
  apply();
  if (typeof ResizeObserver === "function") {
    const observer = new ResizeObserver(apply);
    observer.observe(banner);
  }
  // Both, not either. The observer is the accurate one; the resize listener
  // still fires in browsers that have neither, and costs nothing where it is
  // redundant. The stylesheet carries a floor underneath both, so a measurement
  // that arrives late cannot leave content stranded behind the bar.
  window.addEventListener("resize", apply);
  return banner;
}

/**
 * Show the banner, if there is anything to ask.
 *
 * Only on a host where analytics could actually run. Asking on localhost would
 * be asking for permission to do something that cannot happen, and an
 * "Allow analytics" button that grants nothing is a lie told in a good cause.
 *
 * It is inserted at the top of the body, immediately after the skip link, so a
 * keyboard user meets the choice before the navigation rather than after the
 * whole page. It is painted at the bottom of the viewport by CSS, where it
 * covers nothing important.
 */
export function mountConsentBanner(onDecision) {
  if (document.getElementById(HOST_ID)) return false;
  if (!analytics.isAnalyticsHost(window.location.hostname)) return false;
  if (analytics.consentDecided()) return false;

  insertBanner(consentBannerNode(onDecision));
  return true;
}

/** For the preview control on a non-production host. */
export function forceShowConsentBanner(onDecision) {
  dismissConsentBanner();
  return insertBanner(consentBannerNode(onDecision));
}

/* ---------------------------------------------------------------- settings */

function stateLine() {
  const decision = analytics.consentState();
  const production = analytics.isAnalyticsHost(window.location.hostname);

  if (!production) {
    return {
      tone: "info",
      text: "Analytics are switched off on this address. They run only on "
          + "tools.optymumss.com, so nothing is sent from a local copy, a "
          + "preview build or a test run — whatever the setting below says.",
    };
  }
  if (decision === analytics.GRANTED) {
    return { tone: "good", text: "Analytics are on. Usage events are being sent "
      + "to Google Analytics. Your CV, profile, saved careers and plans are "
      + "not." };
  }
  if (decision === analytics.DENIED) {
    return { tone: "info", text: "Analytics are off. Google Analytics has not "
      + "been loaded and nothing is being sent." };
  }
  return { tone: "info", text: "You have not chosen yet, so analytics are off. "
    + "Nothing is sent until you allow it." };
}

/**
 * The panel on My data.
 *
 * Always present, on every host, including when the answer is "not here". A
 * privacy control that appears only in the state where it matters is a control
 * people cannot find when they go looking for it.
 */
export function analyticsSettingsPanel(onChange) {
  const body = h("div", { class: "stack" });

  const draw = () => {
    while (body.firstChild) body.removeChild(body.firstChild);
    const state = stateLine();
    const decision = analytics.consentState();
    const production = analytics.isAnalyticsHost(window.location.hostname);

    const choose = (value) => {
      analytics.setAnalyticsConsent(value);
      dismissConsentBanner();
      draw();
      if (onChange) onChange(value);
    };

    body.appendChild(h("div", { class: `callout callout-${state.tone}` },
      [h("p", { text: state.text })]));

    body.appendChild(h("p", { text: EXPLANATION }));
    body.appendChild(h("ul", {}, DETAIL.map((line) => h("li", { text: line }))));

    body.appendChild(h("div", { class: "card-actions" }, [
      button("Allow analytics", () => choose(analytics.GRANTED), {
        class: "btn-tap",
        variant: decision === analytics.GRANTED ? "primary" : "",
        pressed: decision === analytics.GRANTED,
      }),
      button("Decline analytics", () => choose(analytics.DENIED), {
        class: "btn-tap",
        variant: decision === analytics.DENIED ? "primary" : "",
        pressed: decision === analytics.DENIED,
      }),
    ]));

    body.appendChild(h("p", { class: "hint", text:
      "Switching analytics off stops Helix sending anything further. If Google "
      + "Analytics was already loaded in this tab it is not called again; "
      + "reloading the page leaves it out altogether." }));

    /*
     * The banner cannot appear on a development host, and it is the piece most
     * likely to break on a narrow screen. This renders it on demand so it can
     * be checked at every width without pretending to be production.
     */
    if (!production) {
      body.appendChild(h("div", { class: "card-actions" }, [
        button("Preview the consent banner", () => forceShowConsentBanner(),
               { variant: "quiet" }),
      ]));
    }
  };

  draw();
  return panel("Privacy and analytics", [body], { id: "analytics-heading" });
}
