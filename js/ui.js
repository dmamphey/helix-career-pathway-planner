/**
 * Shared interface building blocks.
 *
 * Everything is built with `h()` and text nodes rather than innerHTML. That is
 * deliberate: profile text comes from a document the user chose, and building
 * nodes instead of parsing strings means a CV containing angle brackets is
 * displayed rather than executed.
 */

import { GAP_STATUS } from "./gap-engine.js";
import * as market from "./market-data.js";
import { MILESTONE_STATUS } from "./pathway-engine.js";

/** Minimal element builder. Props starting with "on" become listeners. */
export function h(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value === null || value === undefined || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = String(value);
    else if (key === "html") node.innerHTML = value; // only ever static markup
    else if (key === "dataset") Object.assign(node.dataset, value);
    else if (key.startsWith("on") && typeof value === "function") {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (value === true) node.setAttribute(key, "");
    else node.setAttribute(key, String(value));
  }
  append(node, children);
  return node;
}

export function append(node, children) {
  const list = Array.isArray(children) ? children : [children];
  for (const child of list) {
    if (child === null || child === undefined || child === false) continue;
    node.appendChild(typeof child === "string" || typeof child === "number"
      ? document.createTextNode(String(child))
      : child);
  }
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

/** A page section with a heading. */
export function panel(title, children, options = {}) {
  return h("section", { class: `panel ${options.class || ""}`.trim(),
                        "aria-labelledby": options.id },
    [
      title ? h("h2", { id: options.id, text: title }) : null,
      options.hint ? h("p", { class: "hint", text: options.hint }) : null,
      ...(Array.isArray(children) ? children : [children]),
    ]);
}

export function button(label, onClick, options = {}) {
  return h("button", {
    class: `btn ${options.variant ? `btn-${options.variant}` : ""}`.trim(),
    type: options.type || "button",
    onClick,
    disabled: options.disabled,
    "aria-pressed": options.pressed === undefined ? null : String(options.pressed),
  }, label);
}

export function link(label, href, options = {}) {
  return h("a", {
    class: options.class || "",
    href,
    target: options.external ? "_blank" : null,
    rel: options.external ? "noopener" : null,
  }, options.external ? [label, h("span", { class: "ext", text: " ↗",
                                            "aria-hidden": "true" })] : label);
}

export function chip(text, options = {}) {
  return h("span", { class: `chip ${options.class || ""}`.trim(), text });
}

/** A status pill that always carries text as well as colour. */
export function statusPill(status, dictionary = GAP_STATUS) {
  const entry = dictionary[status] || { label: status, symbol: "•" };
  return h("span", { class: `pill pill-${status}` }, [
    h("span", { class: "pill-symbol", "aria-hidden": "true",
                text: entry.symbol }),
    h("span", { text: entry.label }),
  ]);
}

export function milestonePill(status) {
  return statusPill(status, MILESTONE_STATUS);
}

/** The alignment label. Never a percentage on its own. */
export function alignmentBadge(match) {
  if (!match) return null;
  return h("span", { class: `align align-${match.band}` }, [
    h("span", { text: match.label }),
  ]);
}

/** Regulation indicator, shown wherever a career is named. */
export function regulationBadge(career) {
  if (!career.derived.regulated) return null;
  return h("span", {
    class: "reg",
    title: `Recorded as: ${career.regulatory_status}`,
  }, [
    h("span", { "aria-hidden": "true", text: "⚖" }),
    h("span", { text: career.regulator_or_body
      ? `${career.regulatory_status} · ${career.regulator_or_body}`
      : career.regulatory_status }),
  ]);
}

/**
 * Preference fit for a card, or null when there was nothing to compare.
 *
 * Shared by every list that draws career cards. A badge reading "Not enough
 * preference data" on all 677 cards would be noise rather than honesty — the
 * priorities screen and the career page are where that gets explained properly.
 */
export function scoredFit(app, career) {
  if (!app.hasPreferences || !app.hasPreferences()) return null;
  const fit = app.fitFor(career);
  return fit && fit.scored ? fit : null;
}

/**
 * A career card.
 *
 * Used by the explorer, the result groups, saved careers and adjacency lists, so
 * a career looks the same wherever it appears.
 */
export function careerCard(career, options = {}) {
  const tags = (career.core_tags || []).slice(0, 4);
  const pay = market.salary(career.id);
  const work = market.workLife(career.id);

  return h("article", { class: "card career-card" }, [
    h("div", { class: "card-head" }, [
      h("h3", {}, [link(career.title, `#/career/${career.id}`,
                        { class: "card-title" })]),
      options.match ? alignmentBadge(options.match) : null,
    ]),
    h("p", { class: "card-family", text: career.family }),

    // Salary leads, because it is the fact people came for. The evidence label
    // travels with the number so a broad estimate is never read as a published
    // range.
    pay
      ? h("p", { class: "card-pay" }, [
          h("strong", { text: pay.range }),
          h("span", { class: "hint", text: ` a year · ${pay.geography}` }),
          evidenceBadge(pay),
        ])
      : h("p", { class: "hint", text: "Salary data not available" }),

    work && work.hours
      ? h("p", { class: "hint", text: work.hours })
      : null,

    h("div", { class: "badges" }, [
      regulationBadge(career),
      options.effort ? effortBadge(options.effort) : null,
      options.fit ? fitBadge(options.fit) : null,
    ]),
    h("ul", { class: "tags" }, tags.map((tag) => h("li", {}, chip(tag)))),
    options.note ? h("p", { class: "hint", text: options.note }) : null,
    options.why ? h("p", { class: "card-why", text: options.why }) : null,

    h("div", { class: "card-actions" }, [
      link("View career", `#/career/${career.id}`, { class: "btn btn-quiet" }),
      options.onCompare ? compareToggle(career, options) : null,
      options.onSave
        ? button(options.saved ? "Saved ✓" : "Save", options.onSave,
                 { variant: "quiet", pressed: Boolean(options.saved) })
        : null,
      options.extra || null,
    ]),
  ]);
}

/**
 * The compare control.
 *
 * A toggle rather than a link, with `aria-pressed`, because it changes state
 * rather than navigating. Saving is not a prerequisite: this works straight from
 * a card.
 */
export function compareToggle(career, options) {
  const on = Boolean(options.comparing);
  return button(on ? "Comparing ✓" : "Compare", () => options.onCompare(career.id),
                { variant: on ? "primary" : "quiet", pressed: on });
}

/** Salary evidence, as a word plus a tooltip. Never colour alone. */
export function evidenceBadge(pay) {
  return h("span", {
    class: `evidence evidence-${pay.evidenceKey.toLowerCase()}`,
    title: `${pay.evidenceLabel}: ${pay.evidenceExplain}`,
  }, [
    h("span", { "aria-hidden": "true", text: pay.evidenceRank === 0 ? "◆" : "◇" }),
    h("span", { text: pay.evidenceLabel }),
    pay.stale ? h("span", { class: "hint", text: " · due review" }) : null,
  ]);
}

export function effortBadge(effort) {
  return h("span", { class: `effort effort-${effort.key}`,
                     title: effort.explain || "" }, effort.label);
}

export function fitBadge(fit) {
  return h("span", { class: `fit fit-${fit.key}`, title: fit.explain || "" },
           fit.label);
}

/** An accessible modal dialog. Focus is trapped by the native dialog element. */
export function dialog(title, body, options = {}) {
  const node = h("dialog", { class: "modal", "aria-labelledby": "modal-title" }, [
    h("div", { class: "modal-head" }, [
      h("h2", { id: "modal-title", text: title }),
      button("Close", () => node.close(), { variant: "quiet" }),
    ]),
    h("div", { class: "modal-body" }, body),
    options.actions ? h("div", { class: "modal-actions" }, options.actions) : null,
  ]);
  node.addEventListener("close", () => node.remove());
  document.body.appendChild(node);
  node.showModal();
  return node;
}

/** A confirmation dialog that resolves to true or false. */
export function confirmDialog(title, message, confirmLabel = "Continue") {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      resolve(value);
      node.close();
    };
    const node = dialog(title, [h("p", { text: message })], {
      actions: [
        button("Cancel", () => finish(false), { variant: "quiet" }),
        button(confirmLabel, () => finish(true), { variant: "primary" }),
      ],
    });
    node.addEventListener("close", () => finish(false));
  });
}

/** A transient message region announced to assistive technology. */
export function notice(message, kind = "info") {
  const bar = document.getElementById("notice");
  if (!bar) return;
  clear(bar);
  bar.className = `notice notice-${kind}`;
  append(bar, h("p", { text: message }));
  bar.hidden = false;
}

export function clearNotice() {
  const bar = document.getElementById("notice");
  if (!bar) return;
  bar.hidden = true;
  clear(bar);
}

/** An error block that never leaves the user on a blank screen. */
export function errorPanel(title, message, recovery) {
  return panel(title, [
    h("p", { text: message }),
    recovery ? h("div", { class: "card-actions" }, recovery) : null,
  ], { class: "panel-error", id: "error-heading" });
}

/** Official source links, with the dataset's verification date. */
export function sourceList(sources, lastVerified, options = {}) {
  return h("div", { class: "sources" }, [
    h("h4", { text: options.title || "Official sources" }),
    h("ul", {}, sources.map((source) => h("li", {}, [
      source.url
        ? link(source.name, source.url, { external: true })
        : h("span", { text: source.name }),
      source.known === false
        ? h("span", { class: "warn-inline",
                      text: " — source code not in the registry" })
        : null,
    ]))),
    lastVerified
      ? h("p", { class: "hint",
                 text: `Dataset entry last verified ${lastVerified}. Source `
                     + `organisations publish the current requirements: check `
                     + `them directly before acting on anything here.` })
      : null,
  ]);
}

/** Section used wherever verification status has to be stated plainly. */
export function verificationNote(gaps) {
  if (gaps.hasVerifiedPack) return null;
  return h("div", { class: "callout callout-info" }, [
    h("p", {}, [
      h("strong", { text: "Requirements are not yet individually verified. " }),
      "Helix has not verified a full role-specific requirements pack for "
      + "this career. Use the official sources to confirm current entry and "
      + "registration requirements.",
    ]),
  ]);
}

/** Progress bar with a text equivalent. */
export function progressBar(percent, label) {
  return h("div", { class: "progress" }, [
    h("div", { class: "progress-track" }, [
      h("div", { class: "progress-fill", style: `width:${percent}%` }),
    ]),
    h("p", { class: "hint", text: label }),
  ]);
}

export function empty(message) {
  return h("p", { class: "empty", text: message });
}

/** Debounce, for the search field. */
export function debounce(fn, wait = 180) {
  let timer = null;
  return (...args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), wait);
  };
}
