/**
 * The analytics control on My data.
 *
 * There is no banner. Analytics run for every visitor on the production host,
 * the footer of every page says so, and this panel is where somebody turns them
 * off. That is an opt-out rather than an opt-in, and it is the site owner's
 * decision — recorded here so the next person to read this file knows it was
 * chosen rather than overlooked.
 *
 * The wording lives here and in the page footers. Both describe the same thing,
 * so if one changes the other has to.
 */

import { h, button, panel, link } from "./ui.js";
import * as analytics from "./analytics.js";

const EXPLANATION =
  "Helix sends limited, anonymous information about how the tool is used to "
  + "Google Analytics. Your CV, career profile and career plan are not sent.";

/**
 * What is actually measured.
 *
 * Specific enough to be checkable. Somebody who reads this and then opens the
 * network panel should find exactly these things and nothing else, which is the
 * only kind of privacy statement worth writing.
 */
const DETAIL = [
  "Which screens are opened, using fixed names such as \u201Crecommendations\u201D "
  + "or \u201Ccompare\u201D. The career identifiers in the address bar are removed "
  + "before anything is sent, so which careers you look at is not included.",
  "Whether a step succeeded \u2014 that a profile was built, that options were "
  + "generated, that a plan was exported. The event is the fact that it "
  + "happened and carries nothing else.",
  "Nothing about which careers you looked at, saved, compared or planned "
  + "against, and nothing from your CV, your profile or your plan.",
];

function stateLine() {
  const decision = analytics.consentState();
  const production = analytics.isAnalyticsHost(window.location.hostname);

  if (!production) {
    return {
      tone: "info",
      text: "Analytics are switched off on this address. They run only on "
          + "tools.optymumss.com, so nothing is sent from a local copy, a "
          + "preview build or a test run \u2014 whatever the setting below says.",
    };
  }
  if (decision === analytics.DENIED) {
    return { tone: "info", text: "Analytics are off on this device. You turned "
      + "them off, and nothing further is being sent." };
  }
  return { tone: "good", text: decision === analytics.GRANTED
    ? "Analytics are on. You turned them back on."
    : "Analytics are on, which is the default. Usage events are being sent to "
      + "Google Analytics. Your CV, profile, saved careers and plans are not." };
}

/**
 * The panel on My data.
 *
 * Always present, on every host, including where the answer is "not here". A
 * privacy control that appears only in the state where it matters is a control
 * people cannot find when they go looking for it.
 */
export function analyticsSettingsPanel(onChange) {
  const body = h("div", { class: "stack" });

  const draw = () => {
    while (body.firstChild) body.removeChild(body.firstChild);
    const state = stateLine();
    const off = analytics.consentState() === analytics.DENIED;

    const choose = (value) => {
      analytics.setAnalyticsConsent(value);
      draw();
      if (onChange) onChange(value);
    };

    body.appendChild(h("div", { class: `callout callout-${state.tone}` },
      [h("p", { text: state.text })]));

    body.appendChild(h("p", { text: EXPLANATION }));
    body.appendChild(h("ul", {}, DETAIL.map((line) => h("li", { text: line }))));

    body.appendChild(h("div", { class: "card-actions" }, [
      off
        ? button("Turn analytics back on", () => choose(analytics.GRANTED),
                 { variant: "primary", class: "btn-tap" })
        : button("Turn analytics off", () => choose(analytics.DENIED),
                 { class: "btn-tap" }),
    ]));

    body.appendChild(h("p", { class: "hint", text: off
      ? "This is remembered in this browser only. Another browser, another "
        + "device, or clearing this browser's storage will start from the "
        + "default again."
      : "Turning them off stops Helix sending anything further, and is "
        + "remembered in this browser. If Google Analytics has already loaded "
        + "in this tab it is not called again; reloading the page leaves it "
        + "out altogether." }));

    body.appendChild(h("p", { class: "hint" }, [
      "The same summary is in the footer of every page, and in the ",
      link("user guide", "user-guide.html#data"),
      ".",
    ]));
  };

  draw();
  return panel("Privacy and analytics", [body], { id: "analytics-heading" });
}
