/**
 * Career Explorer, and the grouped results of the explore journey.
 *
 * 716 cards are never in the document at once: the list renders a page at a time
 * and grows on request, and search is debounced. Filtering runs over the whole
 * catalogue in memory, so the count is always the true count rather than the count
 * of what happens to be rendered.
 */

import {
  h, panel, button, link, careerCard, debounce, empty, scoredFit,
} from "../ui.js";
import { ORIENTATIONS, lowerLabel } from "../ontology.js";
import * as market from "../market-data.js";

const PAGE = 24;

/**
 * Salary filter rungs.
 *
 * The label is deliberately about the career, not the person: "typical salary
 * reaches at least" describes the top of the published range, and nothing here
 * implies anybody would personally be paid it.
 */
const SALARY_RUNGS = [30000, 40000, 50000, 60000, 75000, 100000];

/**
 * Sort orders.
 *
 * Each names the field it actually sorts on rather than implying a hidden
 * composite quality score. Ties break on title then career id everywhere, so the
 * order is stable across reloads and identical for two people with the same
 * filters.
 */
const SORTS = {
  relevance: { label: "Default order" },
  salary: { label: "Highest typical salary" },
  alignment: { label: "Best background alignment", needsProfile: true },
  fit: { label: "Best preference fit", needsPreferences: true },
  effort: { label: "Lowest transition effort", needsProfile: true },
  title: { label: "Alphabetical, A to Z" },
  verified: { label: "Most recently checked salary" },
};

/** Filter state survives navigation within a session, which users expect. */
const DEFAULTS = {
  query: "",
  family: "",
  regulation: "",
  orientation: "",
  tag: "",
  salaryReaches: "",
  evidence: "",
  pattern: "",
  remote: "",
  patientContact: "",
  laboratory: "",
  research: "",
  commercial: "",
  fit: "",
  depth: "",
  sort: "relevance",
  shown: PAGE,
};

const filters = { ...DEFAULTS };

export function resetFilters() {
  Object.assign(filters, DEFAULTS);
}

export async function renderExplorer(app) {
  const catalogue = app.catalogue;
  const results = h("div", { class: "stack" });
  const count = h("p", { class: "result-count", role: "status",
                         "aria-live": "polite" });

  const draw = () => {
    const matching = sortCareers(app, applyFilters(app, catalogue.careers));
    count.textContent = `${matching.length} of ${catalogue.count} careers`
      + `, ${lowerLabel(SORTS[filters.sort].label)}`
      + (app.hasProfile() ? " · alignment shown against your profile" : "");
    results.replaceChildren(
      matching.length
        ? h("div", { class: "grid grid-3" },
            matching.slice(0, filters.shown).map((career) =>
              careerCard(career, {
                match: app.hasProfile() ? app.matchFor(career) : null,
                // Only when something could actually be compared. A badge reading
                // "Not enough preference data" on every card is noise, not
                // honesty — the preferences screen is where that gets explained.
                fit: scoredFit(app, career),
                effort: app.effortCache.get(career.id) || null,
                saved: app.isSaved(career.id),
                comparing: app.isComparing(career.id),
                onCompare: (id) => { app.toggleCompare(id); draw(); },
                isBaseline: app.isBaseline(career.id),
                onBaseline: (id) => { app.setBaseline(id); draw(); },
                onSave: () => {
                  app.toggleSaved(career.id);
                  draw();
                },
              })))
        : empty("No careers match those filters. Try resetting them."),
      matching.length > filters.shown
        ? h("div", { class: "card-actions center" }, [
            button(`Show more (${matching.length - filters.shown} remaining)`,
              () => { filters.shown += PAGE; draw(); }),
          ])
        : null,
    );
  };

  /**
   * Anything that changes the result set.
   *
   * Effort is the one measure that is not already in memory: it needs a gap
   * analysis per career, which costs about a second for all 716. It is computed
   * once, on the first request for it, and the control says so rather than
   * appearing to hang.
   */
  const update = async () => {
    filters.shown = PAGE;
    if (needsEffort() && app.hasProfile() && !app.effortCache.size) {
      count.textContent = "Working out the transition effort for all "
        + `${catalogue.count} careers…`;
      await app.allEfforts();
    }
    draw();
  };

  const search = h("input", {
    type: "search", id: "career-search", value: filters.query,
    placeholder: `Search ${catalogue.count} life sciences and healthcare careers…`,
    autocomplete: "off",
    onInput: debounce((event) => {
      filters.query = event.target.value;
      update();
    }),
  });

  /* The filters people actually decide on, first. */
  const primary = [
    ["Career family", "family", ["", ...catalogue.families], "All families"],
    ["Typical salary reaches at least", "salaryReaches",
     ["", ...SALARY_RUNGS.map(String)], "Any salary",
     Object.fromEntries(SALARY_RUNGS.map((value) =>
       [String(value), market.money(value)]))],
    ["Regulation", "regulation", ["", "regulated", "unregulated"],
     "All", { regulated: "Regulated or protected",
              unregulated: "Generally unregulated" }],
    ["Remote or hybrid potential", "remote", ["", "high", "medium"],
     "Any", { high: "High", medium: "Medium or better" }],
    ["Working pattern", "pattern", ["", "standard", "shifts", "unsocial"],
     "Any", { standard: "No shift or unsocial pattern recorded",
              shifts: "Includes shifts",
              unsocial: "Includes evenings, weekends or on-call" }],
    ["Patient contact", "patientContact", ["", "high", "medium", "low"],
     "Any", LEVEL_LABELS],
    ["Laboratory intensity", "laboratory", ["", "high", "medium", "low"],
     "Any", LEVEL_LABELS],
    ["Research intensity", "research", ["", "high", "medium", "low"],
     "Any", LEVEL_LABELS],
    ["Commercial intensity", "commercial", ["", "high", "medium", "low"],
     "Any", LEVEL_LABELS],
    ["Salary evidence", "evidence",
     ["", "VERIFIED_GUIDE", "STRONG_ESTIMATE", "INDICATIVE", "LIMITED_DATA"],
     "Any evidence level",
     Object.fromEntries(Object.entries(market.EVIDENCE)
       .map(([key, value]) => [key, value.label]))],
  ];

  if (app.hasPreferences()) {
    primary.push(["Preference fit", "fit",
      ["", "very_strong", "strong", "mixed"], "Any",
      { very_strong: "Very strong only", strong: "Strong or better",
        mixed: "Mixed or better" }]);
  }

  /* Taxonomy controls, kept but moved out of the way — including pathway depth,
     which describes how much content Helix has written, not anything about the
     career, and so has no business among a user's decision filters. */
  const advanced = [
    ["Work orientation", "orientation", ["", ...Object.keys(ORIENTATIONS)],
     "All orientations", ORIENTATIONS],
    ["Tag", "tag", ["", ...catalogue.tags], "All tags"],
    ["Helix content depth", "depth", ["", ...catalogue.depths], "Any",
     { Deep: "Detailed guidance available", Standard: "Core guidance available",
       Explorer: "Career overview available" }],
  ];

  /*
   * Dropdowns are staged, then applied together.
   *
   * Every change used to redraw immediately, so choosing four filters meant four
   * passes over 716 careers — and picking the effort sort started a second of
   * gap analysis before the rest of the choices had even been made. Selections
   * now collect in `pending` until Apply commits them, which is also what makes
   * the count meaningful: it describes what is on screen rather than a state the
   * user has already moved on from.
   *
   * Search stays live. Typing is incremental and cheap, and having to press a
   * button to see a search take effect is the kind of friction nobody asks for.
   */
  const pending = { ...filters };

  const pendingChanges = () => Object.keys(DEFAULTS)
    .filter((key) => key !== "shown" && key !== "query")
    .filter((key) => pending[key] !== filters[key]).length;

  const applyButton = button("Apply filters", async () => {
    Object.assign(filters, pending);
    await update();
    refreshApply();
    if (node && node.refreshFilterSummary) node.refreshFilterSummary();
  }, { variant: "primary" });

  const applyHint = h("span", { class: "hint apply-hint", role: "status",
                                "aria-live": "polite" });

  const refreshApply = () => {
    const changes = pendingChanges();
    applyButton.disabled = changes === 0;
    applyHint.textContent = changes
      ? `${changes} change${changes === 1 ? "" : "s"} not yet applied`
      : "";
  };

  const selectField = ([label, key, values, blank, labels]) => {
    const id = `filter-${key}`;
    return h("div", { class: "field" }, [
      h("label", { for: id, text: label }),
      h("select", { id, onChange: (event) => {
        pending[key] = event.target.value;
        refreshApply();
      } }, values.map((value) => h("option", {
        value, selected: filters[key] === value ? true : null,
      }, value === "" ? blank : (labels && labels[value]) || value))),
    ]);
  };

  const sortField = h("div", { class: "field" }, [
    h("label", { for: "filter-sort", text: "Sort by" }),
    h("select", { id: "filter-sort", onChange: (event) => {
      pending.sort = event.target.value;
      refreshApply();
    } }, Object.entries(SORTS)
      .filter(([, meta]) => (!meta.needsProfile || app.hasProfile())
                         && (!meta.needsPreferences || app.hasPreferences()))
      .map(([key, meta]) => h("option", {
        value: key, selected: filters.sort === key ? true : null,
      }, meta.label))),
  ]);

  /*
   * The filters are folded away, and the results come first.
   *
   * Eleven dropdowns, an advanced section and an apply row used to sit between
   * the heading and the first career. On a laptop that is the entire visible
   * page: somebody arriving here saw a wall of controls and no careers at all,
   * and reasonably concluded the screen was empty. A filter is a thing you reach
   * for after seeing results, not a toll gate in front of them.
   *
   * Search and sort stay out in the open, because they are the two controls
   * people actually use and they are one line together. Everything else lives
   * behind a summary that says how many filters are on — and the block opens
   * itself when any are, so a filtered list never looks like a broken one.
   */
  const filterCount = () => Object.entries(filters).filter(([key, value]) =>
    !["query", "sort", "shown"].includes(key) && value !== "").length;

  const filterSummary = h("summary", {});
  const filterBlock = h("details", { class: "filter-block" }, [
    filterSummary,
    h("div", { class: "filters" }, primary.map(selectField)),
    h("details", { class: "advanced-filters" }, [
      h("summary", { text: "Advanced filters" }),
      h("p", { class: "hint", text: "Taxonomy controls. Content depth describes "
        + "how much researched guidance Helix has written for a career, not how "
        + "good or how senior the career is." }),
      h("div", { class: "filters" }, advanced.map(selectField)),
    ]),
    h("div", { class: "card-actions" }, [
      applyButton,
      applyHint,
      button("Reset filters", () => {
        resetFilters();
        Object.assign(pending, filters);
        search.value = "";
        for (const select of node.querySelectorAll(".filters select")) {
          select.value = select.id === "filter-sort" ? "relevance" : "";
        }
        refreshApply();
        draw();
        if (node && node.refreshFilterSummary) node.refreshFilterSummary();
      }, { variant: "quiet" }),
    ]),
    h("p", { class: "hint", text: "Salary filters describe the published range "
      + "for a career, not what any individual would be paid. Patient contact, "
      + "laboratory, research and commercial intensity, remote potential and "
      + "travel are inferred from each career's subject matter rather than "
      + "surveyed." }),
  ]);

  /** Keep the summary honest about what is switched on. */
  const refreshFilterSummary = () => {
    const active = filterCount();
    filterSummary.textContent = active
      ? `Filters — ${active} on`
      : "Filter these careers";
    if (active) filterBlock.open = true;
  };
  refreshFilterSummary();

  const node = h("div", { class: "stack" }, [
    panel("Career Explorer", [
      h("div", { class: "explore-controls" }, [
        h("div", { class: "field" }, [
          h("label", { for: "career-search", text: "Search careers" }),
          search,
        ]),
        sortField,
      ]),
      h("div", { class: "card-actions" }, [
        app.hasProfile()
          ? link("See my grouped options", "#/matches", { class: "btn btn-quiet" })
          : link("Build a profile to see alignment", "#/profile",
                 { class: "btn btn-quiet" }),
        app.hasProfile() && !app.hasPreferences()
          ? link("Set my priorities", "#/preferences", { class: "btn btn-quiet" })
          : null,
      ]),
      filterBlock,
      count,
    ], { id: "explore-heading",
         hint: "Every career in the dataset is searchable here, including those "
             + "whose pathway content is still being expanded." }),
    results,
  ]);
  node.refreshFilterSummary = refreshFilterSummary;

  refreshApply();
  await update();
  return node;
}

const LEVEL_LABELS = { high: "High", medium: "Medium", low: "Low" };

/** Work patterns that mean hours outside a standard week. */
const UNSOCIAL = ["shifts", "evenings and weekends", "on call", "bank holidays"];

/** Does the current view need transition effort computed? */
function needsEffort() {
  return filters.sort === "effort";
}

function applyFilters(app, careers) {
  const query = filters.query.trim().toLowerCase();
  const words = query.split(/\s+/).filter(Boolean);
  const fitRank = { very_strong: 0, strong: 1, mixed: 2 };

  return careers.filter((career) => {
    if (filters.family && career.family !== filters.family) return false;
    if (filters.depth && career.pathway_depth !== filters.depth) return false;
    if (filters.regulation === "regulated" && !career.derived.regulated) return false;
    if (filters.regulation === "unregulated" && career.derived.regulated) return false;
    if (filters.orientation
        && !career.derived.orientations.includes(filters.orientation)) return false;
    if (filters.tag && !(career.core_tags || []).includes(filters.tag)) return false;

    const pay = market.salary(career.id);
    if (filters.salaryReaches) {
      // "Reaches at least" is about the top of the typical range, which is what
      // the label says. A career with no salary record is excluded rather than
      // assumed to qualify.
      if (!pay || pay.high < Number(filters.salaryReaches)) return false;
    }
    if (filters.evidence && (!pay || pay.evidenceKey !== filters.evidence)) {
      return false;
    }

    const work = market.workLife(career.id);
    if (filters.remote) {
      const level = work && work.remote;
      if (filters.remote === "high" && level !== "high") return false;
      if (filters.remote === "medium"
          && !["high", "medium"].includes(level)) return false;
    }
    if (filters.pattern) {
      // Only careers whose pattern is actually recorded can answer this. Absent
      // data is not evidence of standard hours, so it is excluded rather than
      // counted as a match.
      const patterns = (work && work.patterns) || [];
      if (!patterns.length) return false;
      const unsocial = patterns.filter((item) => UNSOCIAL.includes(item));
      if (filters.pattern === "standard" && unsocial.length) return false;
      if (filters.pattern === "shifts" && !patterns.includes("shifts")) return false;
      if (filters.pattern === "unsocial" && !unsocial.length) return false;
    }
    for (const [key, field] of [["patientContact", "patientContact"],
                                ["laboratory", "laboratory"],
                                ["research", "research"],
                                ["commercial", "commercial"]]) {
      if (filters[key] && (!work || work[field] !== filters[key])) return false;
    }

    if (filters.fit) {
      const fit = scoredFit(app, career);
      if (!fit || fitRank[fit.key] === undefined
          || fitRank[fit.key] > fitRank[filters.fit]) return false;
    }

    if (words.length) {
      const haystack = career.derived.searchText;
      return words.every((word) => haystack.includes(word));
    }
    return true;
  });
}

/**
 * Order the filtered list.
 *
 * Every order names the field it sorts on. There is no composite "best career"
 * score, because the whole design of the product is that alignment, preference
 * fit and effort are different questions and the trade-off between them belongs
 * to the person deciding.
 *
 * Ties break on title, then career id. Both are unique across the catalogue, so
 * the order is fully determined: the same filters produce the same sequence on
 * every reload and on anybody else's machine.
 */
function sortCareers(app, careers) {
  const list = [...careers];
  const byTitleThenId = (a, b) =>
    a.title.localeCompare(b.title, "en-GB") || a.id.localeCompare(b.id);

  const descending = (valueOf) => (a, b) => {
    const difference = valueOf(b) - valueOf(a);
    return difference || byTitleThenId(a, b);
  };

  switch (filters.sort) {
    case "salary":
      // typical_high, as the label says. Careers with no salary record sort last
      // rather than being treated as zero-paying.
      return list.sort(descending((career) => {
        const pay = market.salary(career.id);
        return pay ? pay.high : -1;
      }));

    case "alignment":
      return list.sort(descending((career) => {
        const match = app.matchFor(career);
        return match ? match.score : -1;
      }));

    case "fit":
      return list.sort(descending((career) => {
        const fit = scoredFit(app, career);
        return fit ? fit.score : -1;
      }));

    case "effort": {
      // Lower effort first, so this one ascends. An uncomputed career sorts last.
      return list.sort((a, b) => {
        const rank = (career) => {
          const effort = app.effortCache.get(career.id);
          return effort ? effort.rank : 99;
        };
        return rank(a) - rank(b) || byTitleThenId(a, b);
      });
    }

    case "verified":
      return list.sort((a, b) => {
        const checked = (career) => {
          const pay = market.salary(career.id);
          return pay ? pay.lastVerified : "";
        };
        return checked(b).localeCompare(checked(a)) || byTitleThenId(a, b);
      });

    case "title":
      return list.sort(byTitleThenId);

    default:
      // The dataset's own order, which groups careers by family.
      return list;
  }
}

/* ------------------------------------------------------------------ matches */

export async function renderMatches(app) {
  if (!app.hasProfile()) {
    return panel("No profile yet", [
      empty("Helix needs a profile before it can group career options."),
      h("div", { class: "card-actions" }, [
        link("Upload my CV", "#/upload", { class: "btn btn-primary" }),
        link("Build a profile manually", "#/profile", { class: "btn" }),
      ]),
    ], { id: "matches-empty-heading" });
  }

  const { groupResults } = await import("../matcher.js");
  const ranked = app.ranked();
  // The profile decides both the ranking and the order of the groups: a
  // stated direction puts the careers heading that way first.
  const groups = groupResults(ranked, { profile: app.profile() });
  const target = app.state.targetCareerId
    ? app.catalogue.get(app.state.targetCareerId) : null;

  const host = h("div", { class: "stack" });
  const shown = Object.fromEntries(groups.order.map((key) => [key, 4]));

  // Effort and the "why" line need the gap analysis, which is async because a rule
  // pack may load. They are computed once for the careers actually on screen
  // rather than for all 716.
  const decorations = new Map();
  const decorate = async () => {
    const onScreen = groups.order.flatMap(
      (key) => groups[key].items.slice(0, shown[key]));
    for (const match of onScreen) {
      if (decorations.has(match.careerId)) continue;
      const analysis = await app.analysisFor(match.careerId);
      decorations.set(match.careerId, {
        effort: analysis.effort,
        // The analysis computes fit with the transition effort in hand, so
        // retraining tolerance is one of its dimensions here. Cards elsewhere get
        // the cheaper version without it.
        fit: analysis.fit && analysis.fit.scored ? analysis.fit : null,
        whyLine: analysis.why.why,
      });
    }
  };

  const draw = () => {
    host.replaceChildren(
      panel("Career options from your profile", [
        h("p", { text: "Grouped by how much of a transition each would be, not "
          + "by how good a career it is. Alignment describes the overlap between "
          + "your profile and the career — it is not a prediction about "
          + "recruitment." }),
        matchSummary(app, groups),
        target
          ? h("p", {}, ["Your current target: ",
              link(target.title, `#/pathway/${target.id}`), " "])
          : null,
        h("div", { class: "card-actions" }, [
          link("I know where I want to go — search all careers", "#/explore",
               { class: "btn" }),
          link("Edit my profile", "#/profile", { class: "btn btn-quiet" }),
        ]),
      ], { id: "matches-heading" }),
      ...groups.order.map((key) => {
        const group = groups[key];
        return panel(group.title, [
          // The full count, not the number of cards. Each list is capped, so
          // "4 careers" would be reporting the size of the cap.
          h("p", { class: "group-count" }, [
            h("strong", { text: `${group.total} `
              + `${group.total === 1 ? "career" : "careers"}` }),
            group.total > Math.min(shown[key], group.items.length)
              ? h("span", { class: "hint", text: ` · showing `
                  + `${Math.min(shown[key], group.items.length)}` })
              : null,
          ]),
          h("p", { class: "hint", text: group.blurb }),
          group.items.length
            ? h("div", { class: "grid grid-3" },
                group.items.slice(0, shown[key]).map((match) =>
                  careerCard(match.career, {
                    match,
                    fit: decorations.get(match.careerId)
                      ? decorations.get(match.careerId).fit : null,
                    effort: decorations.get(match.careerId)
                      ? decorations.get(match.careerId).effort : null,
                    why: decorations.get(match.careerId)
                      ? decorations.get(match.careerId).whyLine : null,
                    saved: app.isSaved(match.careerId),
                    comparing: app.isComparing(match.careerId),
                    onCompare: (id) => { app.toggleCompare(id); draw(); },
                    // `match.careerId`, not `career.id`: this list iterates
                    // match results, and there is no `career` in scope here.
                    isBaseline: app.isBaseline(match.careerId),
                    onBaseline: (id) => { app.setBaseline(id); draw(); },
                    onSave: () => { app.toggleSaved(match.careerId); draw(); },
                    extra: link("Build pathway", `#/pathway/${match.careerId}`,
                                { class: "btn btn-quiet" }),
                  })))
            : empty("Nothing fell into this group for your profile."),
          group.items.length > shown[key]
            ? h("div", { class: "card-actions center" }, [
                button("View more", async () => {
                  shown[key] += 4;
                  await decorate();
                  draw();
                }, { variant: "quiet" }),
              ])
            : null,
        ], { id: `${key}-heading` });
      }),
      summary(ranked),
    );
  };
  await decorate();
  draw();
  return host;
}

/** A short, honest note about what the ranking did and did not consider. */
function summary(ranked) {
  const strong = ranked.filter((item) => item.band === "strong").length;
  const good = ranked.filter((item) => item.band === "good").length;
  return h("div", { class: "callout callout-info" }, [
    h("p", {}, [
      h("strong", { text: "How this was worked out. " }),
      `All ${ranked.length} careers were scored against your profile by a `
      + "rules-based engine: role and title similarity, skill and subject "
      + "overlap, education, sector exposure, experience, transferable "
      + "strengths, your stated interests, and professional context. "
      + `${strong} came out as strong alignment and ${good} as good alignment. `
      + "Mandatory and regulated requirements are deliberately kept out of that "
      + "score and shown separately on each career, so a high alignment can "
      + "never hide a registration requirement.",
    ]),
  ]);
}


/**
 * How many careers ended up where.
 *
 * The question this answers is "how many options do I actually have", and the
 * honest answer is not the number of cards on screen: every list is capped at
 * twelve, and shows four at a time. So these are the full counts, and each
 * group heading repeats its own alongside "showing 4".
 *
 * The four add up to every career scored, because they come from the same
 * partition the groups use — a career in the chosen direction is not counted
 * again as an adjacent one. That is worth the arithmetic: a breakdown that did
 * not sum to the total would look like a mistake even when every figure in it
 * was right.
 */
function matchSummary(app, groups) {
  const total = groups.scored;
  const rows = groups.order
    .map((key) => ({ key, group: groups[key] }))
    .filter((entry) => entry.group.total > 0);

  return h("div", { class: "match-summary" }, [
    h("p", { class: "match-total" }, [
      "Helix scored your profile against all ",
      h("strong", { text: `${total} careers` }),
      " in the dataset. Every one of them is placed in exactly one of these "
      + "groups:",
    ]),
    h("ul", { class: "match-breakdown" }, rows.map((entry) =>
      h("li", {}, [
        h("strong", { text: String(entry.group.total) }),
        " ",
        h("span", { text: lowerLabel(entry.group.title) }),
      ]))),
    h("p", { class: "hint", text: "Each group below shows its closest few "
      + "first — use View more to see the rest. A career appearing in a bigger "
      + "pivot group has not been rejected; it is a larger move, which is a "
      + "fact about the distance rather than about you." }),
  ]);
}
