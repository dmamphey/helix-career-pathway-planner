/**
 * The comparison screen.
 *
 * Salary first, because that is the fact people came to compare, then fit, then
 * the professional route, then working life. Every row is text: the salary bar is
 * decoration over a number that is always readable on its own, so the table works
 * in a screen reader and in greyscale.
 *
 * A comparison of careers a visitor has not built a profile for still works — they
 * get the general facts and the evidence, just not the personal columns. And a
 * comparison route can be shared, because it carries career ids and nothing else:
 * no profile, no preferences, nothing personal in a URL.
 */

import {
  h, panel, button, link, empty, alignmentBadge, regulationBadge, evidenceBadge,
  notice,
} from "../ui.js";
import * as market from "../market-data.js";
import {
  MAX_COMPARE, MIN_COMPARE, idsFromRoute, standoutSummary,
} from "../comparison.js";
import { loadRulePack } from "../rules.js";

export async function render(app, context) {
  // A route with ids wins over the stored selection, so a shared link shows what
  // the sender meant rather than the recipient's own working set.
  const fromRoute = idsFromRoute(context && context.params && context.params.ids);
  const ids = fromRoute.length ? fromRoute : app.compareIds();

  if (ids.length < MIN_COMPARE) {
    return panel("Compare careers", [
      empty(ids.length
        ? "Add one more career to compare. Comparison needs at least two."
        : "Nothing selected yet. Use Compare on any career card — you do not have "
          + "to save a career first."),
      h("div", { class: "card-actions" }, [
        link("Browse careers", "#/explore", { class: "btn btn-primary" }),
        app.hasProfile()
          ? link("See my options", "#/matches", { class: "btn" }) : null,
      ]),
    ], { id: "compare-heading" });
  }

  const entries = [];
  for (const id of ids.slice(0, MAX_COMPARE)) {
    const career = app.catalogue.get(id);
    if (!career) continue;
    const analysis = app.hasProfile() ? await app.analysisFor(id) : null;
    entries.push({
      career,
      salary: market.salary(id),
      work: market.workLife(id),
      role: market.role(id),
      match: analysis ? analysis.match : null,
      gaps: analysis ? analysis.gaps : null,
      effort: analysis ? analysis.effort : null,
      why: analysis ? analysis.why : null,
      pack: await loadRulePack(id),
    });
  }

  if (entries.length < MIN_COMPARE) {
    return panel("Compare careers", [
      empty("Those careers are not in this dataset."),
      h("div", { class: "card-actions" },
        [link("Browse careers", "#/explore", { class: "btn btn-primary" })]),
    ], { id: "compare-heading" });
  }

  return h("div", { class: "stack" }, [
    header(app, entries, ids),
    standout(entries),
    salaryPanel(entries),
    fitPanel(app, entries),
    routePanel(entries),
    workLifePanel(entries),
    evidencePanel(entries),
  ]);
}

function header(app, entries, ids) {
  return h("section", { class: "panel" }, [
    h("h1", { text: `Comparing ${entries.length} careers` }),
    h("p", { class: "lede", text: entries.map((e) => e.career.title).join(" · ") }),
    app.hasProfile()
      ? null
      : h("div", { class: "callout callout-info" }, [
          h("p", { text: "You have no profile, so this compares the general "
            + "facts: salary, working life and professional requirements. Build a "
            + "profile to add your own alignment and gaps." }),
          h("div", { class: "card-actions" }, [
            link("Build a profile", "#/profile", { class: "btn" }),
          ]),
        ]),
    h("div", { class: "card-actions" }, [
      button("Clear comparison", () => {
        app.clearCompare();
        app.navigate("/explore");
      }, { variant: "quiet" }),
      link("Add another career", "#/explore", { class: "btn" }),
    ]),
    h("p", { class: "hint", text: market.salary(entries[0].career.id)
      ? market.salary(entries[0].career.id).disclaimer : "" }),
  ]);
}

/** The deterministic observations. Facts only, and never a "best" career. */
function standout(entries) {
  const notes = standoutSummary(entries);
  if (!notes.length) return null;
  return panel("What stands out", [
    h("ul", { class: "standout" }, notes.map((note) =>
      h("li", { text: note.text }))),
    h("p", { class: "hint", text: "These are observations from the data below, "
      + "not a recommendation. Which trade-off is right is your call." }),
  ], { id: "standout-heading" });
}

/**
 * Salary, with a bar whose length is never the only information.
 *
 * The bars share one scale so the lengths are comparable, and each row states its
 * own numbers and evidence class in text.
 */
function salaryPanel(entries) {
  const withPay = entries.filter((entry) => entry.salary);
  const ceiling = withPay.length
    ? Math.max(...withPay.map((entry) => entry.salary.high)) : 0;
  const floor = withPay.length
    ? Math.min(...withPay.map((entry) => entry.salary.low)) : 0;
  const span = Math.max(1, ceiling - floor);

  return panel("Typical salary", entries.map((entry) => {
    const pay = entry.salary;
    if (!pay) {
      return h("div", { class: "compare-row" }, [
        h("h3", { text: entry.career.title }),
        h("p", { class: "hint", text: "Salary data not available" }),
      ]);
    }
    const left = ((pay.low - floor) / span) * 100;
    const width = Math.max(4, ((pay.high - pay.low) / span) * 100);
    return h("div", { class: "compare-row" }, [
      h("h3", {}, [link(entry.career.title, `#/career/${entry.career.id}`)]),
      h("p", { class: "pay-line" }, [
        h("strong", { text: pay.range }),
        h("span", { class: "hint", text: ` a year · ${pay.geography}` }),
        evidenceBadge(pay),
      ]),
      // Decoration only: the figures above are the information.
      h("div", { class: "pay-track", "aria-hidden": "true" }, [
        h("div", { class: "pay-bar", style: `margin-left:${left}%;width:${width}%` }),
      ]),
      h("p", { class: "hint", text: `${pay.methodLabel}. Last checked `
        + `${pay.lastVerified}.` }),
    ]);
  }), { id: "salary-heading",
        hint: "Ranges are indicative and rounded. The evidence label says how "
            + "firmly each figure is grounded." });
}

function fitPanel(app, entries) {
  if (!app.hasProfile()) return null;
  return panel("Fit for you", [
    grid(entries, [
      ["Background alignment", (entry) => entry.match
        ? alignmentBadge(entry.match) : text("—")],
      ["Transition effort", (entry) => entry.effort
        ? h("span", { class: `effort effort-${entry.effort.key}`,
                      title: entry.effort.explain }, entry.effort.label)
        : text("—")],
      ["Why it appeared", (entry) => text(entry.why ? entry.why.why : "—")],
      ["Strengths you already have", (entry) => list(
        entry.gaps ? entry.gaps.transitions.transferable.slice(0, 4) : [])],
      ["Strengths needing translation", (entry) => list(
        entry.gaps ? entry.gaps.transitions.translation.slice(0, 4) : [])],
      ["Largest development gaps", (entry) => list(
        entry.gaps ? entry.gaps.transitions.development.slice(0, 4) : [])],
    ]),
    h("p", { class: "hint", text: "Background alignment describes overlap between "
      + "your profile and the career. It is not a prediction about recruitment." }),
  ], { id: "fit-heading" });
}

function routePanel(entries) {
  return panel("Professional route", [
    grid(entries, [
      ["Regulation", (entry) => entry.career.derived.regulated
        ? regulationBadge(entry.career) : text("Generally unregulated")],
      ["Must be confirmed officially", (entry) => text(
        entry.gaps
          ? (entry.gaps.requiresOfficialConfirmation ? "Yes — with the regulator"
                                                     : "None recorded")
          : (entry.career.derived.regulated ? "Yes — with the regulator"
                                            : "None recorded"))],
      ["Typical entry signal",
       (entry) => text(entry.career.typical_entry_signal)],
      ["Researched requirements", (entry) => text(entry.pack
        ? (entry.pack.requirementsVerified
            ? `Verified ${entry.pack.verifiedDate}` : "Structural pack only")
        : "Not yet researched")],
    ]),
  ], { id: "route-heading" });
}

function workLifePanel(entries) {
  const level = (value) => text(value === "unknown" ? "Not yet available" : value);
  return panel("Working life", [
    grid(entries, [
      ["Typical hours", (entry) => text(
        entry.work && entry.work.hours ? entry.work.hours : "Not yet available")],
      ["Work patterns", (entry) => text(
        entry.work && entry.work.patterns.length
          ? entry.work.patterns.join(", ") : "Not yet available")],
      ["Patient contact", (entry) => level(entry.work && entry.work.patientContact)],
      ["Laboratory intensity", (entry) => level(entry.work && entry.work.laboratory)],
      ["Research intensity", (entry) => level(entry.work && entry.work.research)],
      ["Commercial intensity", (entry) => level(entry.work && entry.work.commercial)],
      ["Remote or hybrid potential", (entry) => level(entry.work && entry.work.remote)],
      ["Travel", (entry) => level(entry.work && entry.work.travel)],
    ]),
    h("p", { class: "hint", text: "Hours and work patterns come from official "
      + "career profiles where available. The intensity and travel measures are "
      + "inferred from each career's subject matter, not from a survey." }),
  ], { id: "worklife-heading" });
}

function evidencePanel(entries) {
  return panel("Sources and methodology", entries.map((entry) => {
    const pay = entry.salary;
    return h("div", { class: "compare-row" }, [
      h("h3", { text: entry.career.title }),
      pay
        ? h("dl", { class: "summary" }, [
            h("dt", { text: "Salary evidence" }),
            h("dd", { text: `${pay.evidenceLabel} — ${pay.evidenceExplain}` }),
            h("dt", { text: "Method" }),
            h("dd", { text: pay.methodLabel }),
            h("dt", { text: "Geography" }),
            h("dd", { text: pay.geography }),
            h("dt", { text: "Last checked" }),
            h("dd", { text: pay.lastVerified }),
            ...(pay.sources.length ? [
              h("dt", { text: "Source" }),
              h("dd", {}, pay.sources.map((source) => source.source_url
                ? link(source.provider, source.source_url, { external: true })
                : h("span", { text: source.provider }))),
            ] : []),
            ...(pay.notes.length ? [
              h("dt", { text: "How it was produced" }),
              h("dd", { text: pay.notes.join(" ") }),
            ] : []),
          ])
        : h("p", { class: "hint", text: "No salary record." }),
    ]);
  }), { id: "evidence-heading" });
}

/* ------------------------------------------------------------------ helpers */

function text(value) {
  return h("span", { text: value === undefined || value === null || value === ""
    ? "—" : String(value) });
}

function list(items) {
  if (!items || !items.length) return text("None identified");
  return h("ul", { class: "plain" }, items.map((item) =>
    h("li", { text: item.label || String(item) })));
}

/**
 * The comparison grid.
 *
 * A real table on wide screens, because that is what a table is for. Below the
 * breakpoint CSS turns each row into a stack of labelled values, so nothing is
 * squeezed into four unreadable columns on a phone.
 */
function grid(entries, rows) {
  return h("div", { class: "table-scroll" }, [
    h("table", { class: "compare compare-grid" }, [
      h("thead", {}, [h("tr", {}, [
        h("th", { scope: "col", text: "" }),
        ...entries.map((entry) => h("th", { scope: "col" },
          [link(entry.career.title, `#/career/${entry.career.id}`)])),
      ])]),
      h("tbody", {}, rows.map(([label, cell]) =>
        h("tr", {}, [
          h("th", { scope: "row", text: label }),
          ...entries.map((entry) =>
            h("td", { dataset: { label, career: entry.career.title } },
              [cell(entry)])),
        ]))),
    ]),
  ]);
}
