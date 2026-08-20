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
  notice, replaceKids } from "../ui.js";
import * as market from "../market-data.js";
import {
  MAX_COMPARE, MIN_COMPARE, idsFromRoute, standoutSummary,
} from "../comparison.js";
import { loadRulePack } from "../rules.js";
import { differences } from "../baseline.js";
import * as labour from "../labour-market.js";
import { trackHelixEventOnce, EVENTS } from "../analytics.js";
import { lowerLabel } from "../ontology.js";

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
      fit: analysis ? analysis.fit : null,
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

  const host = h("div", { class: "stack" });
  const redraw = () => replaceKids(host,
    header(app, entries, ids, redraw),
    baselinePicker(app, entries, redraw),
    baselinePanel(app, entries),
    standout(entries),
    salaryPanel(entries),
    fitPanel(app, entries),
    routePanel(entries),
    workLifePanel(entries),
    labourPanel(entries),
    evidencePanel(entries),
  );
  redraw();
  /*
   * Two or more real careers, their salary, fit, route and working-life data all
   * resolved, and the dashboard built from it. The two early returns above catch
   * the cases that get this far without a comparison — too few careers selected,
   * or ids that are not in the dataset — and neither reaches this line.
   *
   * Once per visit. `redraw()` runs again whenever the baseline is pinned or
   * changed, and re-measuring the same comparison is not a second viewing.
   */
  trackHelixEventOnce(EVENTS.CAREER_COMPARISON_VIEWED);
  return host;
}

/* ------------------------------------------------------------------ baseline */

/**
 * Choosing what to measure against.
 *
 * Offered, never imposed. Where the profile names a current role, the career
 * closest to it is suggested by name — but it is a suggestion with a button, not
 * a default that quietly reframes the whole screen. Somebody comparing four
 * careers they might move into has not necessarily decided that today's job is
 * the thing to measure from.
 */
function baselinePicker(app, entries, redraw) {
  const baseline = app.baselineCareer();
  const suggestion = baseline ? null : suggestBaseline(app, entries);

  return h("section", { class: "panel baseline-picker" }, [
    h("h2", { text: "Compare against one career" }),
    baseline
      ? h("div", { class: "stack" }, [
          h("p", {}, [
            "Measuring everything against ",
            h("strong", { text: baseline.title }),
            ".",
          ]),
          h("div", { class: "card-actions" }, [
            button("Remove baseline", () => {
              app.setBaseline(baseline.id);
              redraw();
            }, { variant: "quiet" }),
            link("Open this career", `#/career/${baseline.id}`,
                 { class: "btn btn-quiet" }),
          ]),
        ])
      : h("div", { class: "stack" }, [
          h("p", { class: "hint", text: "Pin one career as a baseline and Helix "
            + "will show the others as differences from it — how much more or "
            + "less they pay, how the working life changes, what the "
            + "professional route does. Usually that is your current job." }),
          suggestion
            ? h("div", { class: "callout callout-info" }, [
                h("p", {}, [
                  `Your profile says you work as a `,
                  h("strong", { text: app.profile().currentRole }),
                  `. ${suggestion.title} looks like the closest career in the `
                  + `catalogue.`,
                ]),
                h("div", { class: "card-actions" }, [
                  button(`Use ${suggestion.title} as my baseline`, () => {
                    app.setBaseline(suggestion.id);
                    redraw();
                  }, { variant: "primary" }),
                ]),
              ])
            : null,
          h("div", { class: "card-actions" }, entries.map((entry) =>
            button(`Pin ${entry.career.title}`, () => {
              app.setBaseline(entry.career.id);
              redraw();
            }, { variant: "quiet" }))),
        ]),
  ], { id: "baseline-heading" });
}

/**
 * The catalogue career closest to the profile's stated current role.
 *
 * Title similarity only, and only when it is close enough to name out loud. A
 * weak guess presented as "your current role" would be worse than no suggestion,
 * because the baseline silently reframes every number on the screen.
 */
function suggestBaseline(app, entries) {
  const role = app.profile() && app.profile().currentRole;
  if (!role) return null;
  const wanted = role.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
  if (!wanted) return null;

  let best = null;
  let bestScore = 0;
  for (const career of app.catalogue.careers) {
    const title = career.title.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
    if (title === wanted) return career;
    const a = new Set(title.split(" "));
    const b = new Set(wanted.split(" "));
    const shared = [...a].filter((word) => b.has(word)).length;
    const score = shared / Math.max(1, Math.min(a.size, b.size));
    if (score > bestScore) { bestScore = score; best = career; }
  }
  return bestScore >= 0.7 ? best : null;
}

/**
 * Every compared career as a difference from the baseline.
 *
 * Measured differences and directional ones are marked differently, because they
 * are not the same kind of claim. "+£8,500" came from two numbers; "less patient
 * contact" came from two words on a three-point scale, and rendering it as "−1"
 * would invent a measurement nobody made.
 */
function baselinePanel(app, entries) {
  const baseline = app.baselineCareer();
  if (!baseline) return null;

  const reference = entryFor(app, entries, baseline);
  const others = entries.filter((entry) => entry.career.id !== baseline.id);
  if (!others.length) {
    return panel(`Against ${baseline.title}`, [
      h("p", { class: "hint", text: "The baseline is the only career in this "
        + "comparison. Add another to see the differences." }),
    ], { id: "baseline-delta-heading" });
  }

  return panel(`Against ${baseline.title}`, [
    h("p", { class: "hint", text: `Everything below is stated as a change from `
      + `${baseline.title}. A measured difference is shown as a figure; anything `
      + `Helix records as low, medium or high is shown as a direction, because `
      + `subtracting those words would invent a measurement.` }),
    ...others.map((entry) => deltaCard(reference, entry)),
  ], { id: "baseline-delta-heading" });
}

function deltaCard(reference, entry) {
  const rows = differences(reference, entry);
  return h("article", { class: "delta-card" }, [
    h("h3", {}, [link(entry.career.title, `#/career/${entry.career.id}`)]),
    h("ul", { class: "delta-list" }, rows.map((row) => {
      const value = row.value;
      if (!value) {
        return h("li", { class: "delta-row delta-unknown" }, [
          h("span", { class: "delta-label", text: row.label }),
          h("span", { class: "delta-value", text: "Not comparable" }),
        ]);
      }
      return h("li", {
        class: `delta-row delta-${value.direction}`
             + (value.numeric ? " delta-measured" : ""),
      }, [
        h("span", { class: "delta-label", text: row.label }),
        h("span", { class: "delta-value", text: value.label }),
        value.detail || value.caveat
          ? h("span", { class: "delta-detail",
                        text: value.detail || value.caveat })
          : null,
      ]);
    })),
  ]);
}

/** The baseline's own comparison entry, built if it is not already on screen. */
function entryFor(app, entries, career) {
  const existing = entries.find((entry) => entry.career.id === career.id);
  if (existing) return existing;
  return {
    career,
    salary: market.salary(career.id),
    work: market.workLife(career.id),
    role: market.role(career.id),
  };
}

function header(app, entries, ids, redraw) {
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
        // Not the Explorer by default: somebody with a profile came from their
        // options and should land back there, not in a catalogue of 734.
        app.navigate(app.homeRoute());
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

  /*
   * The market observation is added here rather than inside `standoutSummary`
   * because that function is pure and takes no external dataset. `strongestDemand`
   * returns null whenever the compared careers share one advertising category,
   * so this note appears only when there is a real distinction to draw.
   */
  const strongest = labour.strongestDemand(entries.map((entry) => entry.career));
  if (strongest) {
    notes.push({
      kind: "demand",
      text: `Of these, ${strongest.career.title} sits in the category with the `
          + `stronger advertising signal — ${lowerLabel(strongest.signal.trendLabel)}`
          + ` across ${strongest.signal.categoryLabel}. That is a measure of `
          + `advert volume in a broad category, not of vacancies for this job.`,
    });
  }

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

/**
 * The three personal measures, side by side and never combined.
 *
 * Alignment, preference fit and effort answer three different questions, and the
 * whole value of putting them in adjacent rows is that a career can score well on
 * one and badly on another. The preference rows appear only once somebody has
 * stated a preference; without one there is nothing to say, and a row of
 * "Not enough preference data" would just take up space.
 */
function fitPanel(app, entries) {
  if (!app.hasProfile()) return null;
  const anyFit = entries.some((entry) => entry.fit && entry.fit.scored);

  return panel("Fit for you", [
    grid(entries, [
      ["Background alignment", (entry) => entry.match
        ? alignmentBadge(entry.match) : text("—")],
      ...(app.hasPreferences() ? [
        ["Preference fit", (entry) => entry.fit
          ? h("span", { class: `fit fit-${entry.fit.key}`,
                        title: entry.fit.explain }, entry.fit.label)
          : text("—")],
        ["Why it fits your priorities", (entry) => reasonList(
          entry.fit ? entry.fit.reasons : [], "Nothing you stated matched")],
        ["Possible mismatches", (entry) => reasonList(
          entry.fit ? entry.fit.mismatches : [], "None identified")],
      ] : []),
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
    h("p", { class: "hint", text: "These are three separate measures and Helix "
      + "never merges them. Background alignment describes overlap between your "
      + "profile and the career; preference fit describes how well it matches "
      + "what you said you wanted; transition effort describes how big the move "
      + "would be. None of them is a prediction about recruitment." }),
    app.hasPreferences()
      ? h("p", { class: "hint", text: "Preference fit is judged only on the "
          + "questions you answered that Helix could compare with each career, and "
          + "a career is never marked down for information Helix does not hold." })
      : h("div", { class: "callout callout-info" }, [
          h("p", { text: "You have not set any career priorities, so preference "
            + "fit is not shown. It compares each career against what you want "
            + "from working life, separately from your background." }),
          h("div", { class: "card-actions" }, [
            link("Set my priorities", "#/preferences", { class: "btn" }),
          ]),
        ]),
    app.hasPreferences() && !anyFit
      ? h("p", { class: "hint", text: "None of the priorities you stated could be "
          + "compared with these particular careers." })
      : null,
  ], { id: "fit-heading" });
}

/** Contributing reasons or mismatches, as plain sentences. */
function reasonList(items, emptyLabel) {
  if (!items || !items.length) return text(emptyLabel);
  return h("ul", { class: "plain" }, items.slice(0, 3).map((item) =>
    h("li", { text: item.text })));
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

/**
 * The hiring climate, per career.
 *
 * Two of these careers very often read the same signal, because the published
 * source is categorised by advertising category and several Helix families map
 * to one. The row says which category each career drew from, so identical
 * numbers are visibly the same measurement rather than a coincidence — and
 * `standoutSummary` refuses to name a "strongest market" when the categories
 * collapse to one.
 */
function labourPanel(entries) {
  const state = labour.status();
  const signals = entries.map((entry) => labour.demandFor(entry.career));
  if (!signals.some(Boolean)) {
    return panel("Current labour market", [
      h("p", { class: "hint", text: state.ok
        ? "Helix holds no demand signal for these careers' families."
        : state.message }),
    ], { id: "labour-compare-heading" });
  }

  const byId = new Map(entries.map((entry, index) =>
    [entry.career.id, signals[index]]));
  const any = signals.find(Boolean);

  return panel("Current labour market", [
    grid(entries, [
      ["Signal strength", (entry) => {
        const signal = byId.get(entry.career.id);
        return signal
          ? h("span", { class: `signal signal-${signal.strengthKey}`,
                        title: signal.strengthExplain }, signal.strengthLabel)
          : text("No signal");
      }],
      ["Direction of travel", (entry) => {
        const signal = byId.get(entry.career.id);
        return text(signal ? signal.trendLabel : "Not known");
      }],
      ["Advert volume index", (entry) => {
        const signal = byId.get(entry.career.id);
        return text(signal && Number.isFinite(signal.index)
          ? String(signal.index) : "—");
      }],
      ["Vacancy count", () => text("Not published by this source")],
      ["Measured across", (entry) => {
        const signal = byId.get(entry.career.id);
        return text(signal ? signal.categoryLabel : "—");
      }],
    ]),
    h("p", { class: "hint", text: "The index is advert volume against a "
      + `${any.baseline} baseline, measured across broad advertising `
      + "categories rather than job titles. Careers in the same category read "
      + "the same figure — that is one measurement shown twice, not two "
      + "careers that happen to match." }),
    h("p", { class: "hint" }, [
      `${any.source} · released ${any.released} · `,
      any.sourceUrl
        ? link("published data", any.sourceUrl, { external: true })
        : h("span", { text: "published data" }),
      `, used under the ${any.licence}.`,
    ]),
  ], { id: "labour-compare-heading" });
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
