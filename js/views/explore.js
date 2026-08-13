/**
 * Career Explorer, and the grouped results of the explore journey.
 *
 * 677 cards are never in the document at once: the list renders a page at a time
 * and grows on request, and search is debounced. Filtering runs over the whole
 * catalogue in memory, so the count is always the true count rather than the count
 * of what happens to be rendered.
 */

import { h, panel, button, link, careerCard, debounce, empty } from "../ui.js";
import { ORIENTATIONS } from "../ontology.js";

const PAGE = 24;

/** Filter state survives navigation within a session, which users expect. */
const filters = {
  query: "",
  family: "",
  depth: "",
  regulation: "",
  orientation: "",
  tag: "",
  shown: PAGE,
};

export function resetFilters() {
  Object.assign(filters,
    { query: "", family: "", depth: "", regulation: "", orientation: "",
      tag: "", shown: PAGE });
}

export async function renderExplorer(app) {
  const catalogue = app.catalogue;
  const results = h("div", { class: "stack" });
  const count = h("p", { class: "result-count", role: "status",
                         "aria-live": "polite" });

  const draw = () => {
    const matching = applyFilters(catalogue.careers);
    count.textContent = `${matching.length} of ${catalogue.count} careers`
      + (app.hasProfile() ? " · alignment shown against your profile" : "");
    results.replaceChildren(
      matching.length
        ? h("div", { class: "grid grid-3" },
            matching.slice(0, filters.shown).map((career) =>
              careerCard(career, {
                match: app.hasProfile() ? app.matchFor(career) : null,
                saved: app.isSaved(career.id),
                comparing: app.isComparing(career.id),
                onCompare: (id) => { app.toggleCompare(id); draw(); },
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

  const search = h("input", {
    type: "search", id: "career-search", value: filters.query,
    placeholder: `Search ${catalogue.count} life sciences and healthcare careers…`,
    autocomplete: "off",
    onInput: debounce((event) => {
      filters.query = event.target.value;
      filters.shown = PAGE;
      draw();
    }),
  });

  const selects = [
    ["Career family", "family", ["", ...catalogue.families], "All families"],
    ["Pathway depth", "depth", ["", ...catalogue.depths], "All depths"],
    ["Regulation", "regulation", ["", "regulated", "unregulated"],
     "All", { regulated: "Regulated or protected", unregulated: "Generally unregulated" }],
    ["Work orientation", "orientation", ["", ...Object.keys(ORIENTATIONS)],
     "All orientations", ORIENTATIONS],
    ["Tag", "tag", ["", ...catalogue.tags], "All tags"],
  ];

  const controls = h("div", { class: "filters" }, selects.map(
    ([label, key, values, blank, labels]) => {
      const id = `filter-${key}`;
      return h("div", { class: "field" }, [
        h("label", { for: id, text: label }),
        h("select", { id, onChange: (event) => {
          filters[key] = event.target.value;
          filters.shown = PAGE;
          draw();
        } }, values.map((value) => h("option", {
          value, selected: filters[key] === value ? true : null,
        }, value === "" ? blank : (labels && labels[value]) || value))),
      ]);
    }));

  const node = h("div", { class: "stack" }, [
    panel("Career Explorer", [
      h("div", { class: "field" }, [
        h("label", { for: "career-search", text: "Search careers" }),
        search,
      ]),
      controls,
      h("div", { class: "card-actions" }, [
        button("Reset filters", () => {
          resetFilters();
          search.value = "";
          for (const select of node.querySelectorAll(".filters select")) {
            select.value = "";
          }
          draw();
        }, { variant: "quiet" }),
        app.hasProfile()
          ? link("See my grouped options", "#/matches", { class: "btn btn-quiet" })
          : link("Build a profile to see alignment", "#/profile",
                 { class: "btn btn-quiet" }),
      ]),
      count,
    ], { id: "explore-heading",
         hint: "Every career in the dataset is searchable here, including those "
             + "whose pathway content is still being expanded." }),
    results,
  ]);

  draw();
  return node;
}

function applyFilters(careers) {
  const query = filters.query.trim().toLowerCase();
  const words = query.split(/\s+/).filter(Boolean);
  return careers.filter((career) => {
    if (filters.family && career.family !== filters.family) return false;
    if (filters.depth && career.pathway_depth !== filters.depth) return false;
    if (filters.regulation === "regulated" && !career.derived.regulated) return false;
    if (filters.regulation === "unregulated" && career.derived.regulated) return false;
    if (filters.orientation
        && !career.derived.orientations.includes(filters.orientation)) return false;
    if (filters.tag && !(career.core_tags || []).includes(filters.tag)) return false;
    if (words.length) {
      const haystack = career.derived.searchText;
      return words.every((word) => haystack.includes(word));
    }
    return true;
  });
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
  const groups = groupResults(ranked);
  const target = app.state.targetCareerId
    ? app.catalogue.get(app.state.targetCareerId) : null;

  const host = h("div", { class: "stack" });
  const shown = { closest: 4, adjacent: 4, pivots: 4 };

  // Effort and the "why" line need the gap analysis, which is async because a rule
  // pack may load. They are computed once for the careers actually on screen
  // rather than for all 677.
  const decorations = new Map();
  const decorate = async () => {
    const onScreen = ["closest", "adjacent", "pivots"].flatMap(
      (key) => groups[key].items.slice(0, shown[key]));
    for (const match of onScreen) {
      if (decorations.has(match.careerId)) continue;
      const analysis = await app.analysisFor(match.careerId);
      decorations.set(match.careerId, {
        effort: analysis.effort,
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
      ...["closest", "adjacent", "pivots"].map((key) => {
        const group = groups[key];
        return panel(group.title, [
          h("p", { class: "hint", text: group.blurb }),
          group.items.length
            ? h("div", { class: "grid grid-3" },
                group.items.slice(0, shown[key]).map((match) =>
                  careerCard(match.career, {
                    match,
                    effort: decorations.get(match.careerId)
                      ? decorations.get(match.careerId).effort : null,
                    why: decorations.get(match.careerId)
                      ? decorations.get(match.careerId).whyLine : null,
                    saved: app.isSaved(match.careerId),
                    comparing: app.isComparing(match.careerId),
                    onCompare: (id) => { app.toggleCompare(id); draw(); },
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
