/** Saved careers, and a lightweight comparison of up to four of them. */

import {
  h, panel, link, careerCard, empty, alignmentBadge, regulationBadge,
  depthBadge, notice
} from "../ui.js";
import { loadRulePack } from "../rules.js";

export async function render(app) {
  const ids = app.state.savedCareerIds;
  const careers = ids.map((id) => app.catalogue.get(id)).filter(Boolean);

  if (!careers.length) {
    return panel("Saved careers", [
      empty("You have not saved any careers yet. Save one from the explorer or a "
          + "career page and it will appear here."),
      h("div", { class: "card-actions" }, [
        link("Browse careers", "#/explore", { class: "btn btn-primary" }),
        app.hasProfile()
          ? link("See my options", "#/matches", { class: "btn" }) : null,
      ]),
    ], { id: "saved-heading" });
  }

  const host = h("div", { class: "stack" });
  const selected = new Set(careers.slice(0, 2).map((career) => career.id));

  const draw = () => {
    host.replaceChildren(
      panel("Saved careers", [
        h("p", { class: "hint", text:
          `${careers.length} saved. Tick two to four, then compare them.` }),
        h("div", { class: "grid grid-3" }, careers.map((career) => {
          const id = `compare-${career.id}`;
          return h("div", { class: "stack-tight" }, [
            careerCard(career, {
              match: app.hasProfile() ? app.matchFor(career) : null,
              saved: true,
              comparing: app.isComparing(career.id),
              onCompare: (id) => { app.toggleCompare(id); draw(); },
              onSave: () => {
                app.toggleSaved(career.id);
                selected.delete(career.id);
                app.navigate("/saved");
              },
            }),
            h("div", { class: "compare-pick" }, [
              h("input", { type: "checkbox", id, class: "chip-check",
                checked: selected.has(career.id) ? true : null,
                onChange: (event) => {
                  if (event.target.checked) {
                    if (selected.size >= 4) {
                      event.target.checked = false;
                      notice("Compare up to four careers at a time.", "warn");
                      return;
                    }
                    selected.add(career.id);
                  } else selected.delete(career.id);
                  drawCompare();
                } }),
              h("label", { for: id, class: "chip chip-toggle",
                           text: "Compare this one" }),
            ]),
          ]);
        })),
      ], { id: "saved-heading" }),
      comparison,
    );
  };

  let comparison = h("div");
  const drawCompare = async () => {
    const chosen = careers.filter((career) => selected.has(career.id));
    comparison = chosen.length >= 2
      ? await comparisonTable(app, chosen)
      : panel("Comparison", [
          empty("Tick at least two saved careers to compare them."),
        ], { id: "compare-heading" });
    draw();
  };

  await drawCompare();
  return host;
}

export async function renderCompare(app) {
  return render(app);
}

/**
 * The comparison table.
 *
 * Deliberately narrow: alignment, family, regulation, depth, strengths and the
 * largest gaps. No salary column — there is no reliable, maintainable UK salary
 * source in this dataset, and a stale salary is worse than none.
 */
async function comparisonTable(app, careers) {
  const rows = [];
  for (const career of careers) {
    const analysis = app.hasProfile() ? await app.analysisFor(career.id) : null;
    const pack = await loadRulePack(career.id);
    rows.push({ career, analysis, pack });
  }

  const cell = (content) => h("td", {}, content);
  const headers = [h("th", { scope: "col", text: "" }),
    ...rows.map(({ career }) => h("th", { scope: "col" }, [
      link(career.title, `#/career/${career.id}`),
    ]))];

  const line = (label, render) => h("tr", {}, [
    h("th", { scope: "row", text: label }),
    ...rows.map((row) => cell(render(row))),
  ]);

  return panel("Comparison", [
    h("div", { class: "table-scroll" }, [
      h("table", { class: "compare" }, [
        h("thead", {}, [h("tr", {}, headers)]),
        h("tbody", {}, [
          line("Alignment", ({ analysis }) => analysis && analysis.match
            ? alignmentBadge(analysis.match)
            : h("span", { text: "No profile" })),
          line("Career family", ({ career }) => h("span", { text: career.family })),
          line("Regulation", ({ career }) => career.derived.regulated
            ? regulationBadge(career)
            : h("span", { text: "Generally unregulated" })),
          line("Pathway depth", ({ career }) => depthBadge(career)),
          line("Typical entry signal",
            ({ career }) => h("span", { text: career.typical_entry_signal })),
          line("Work orientation", ({ career }) =>
            h("span", { text: career.derived.orientations.join(", ") || "—" })),
          line("Strengths you already have", ({ analysis }) => analysis
            ? listOf(analysis.gaps.transitions.transferable.slice(0, 4))
            : h("span", { text: "—" })),
          line("Largest gaps", ({ analysis }) => analysis
            ? listOf(analysis.gaps.transitions.development.slice(0, 4))
            : h("span", { text: "—" })),
          line("Must be confirmed officially", ({ analysis }) => analysis
            ? h("span", { text: analysis.gaps.requiresOfficialConfirmation
                ? "Yes — see the pathway" : "None recorded" })
            : h("span", { text: "—" })),
          line("Researched pack", ({ pack }) => h("span", {
            text: pack ? (pack.requirementsVerified
              ? `Verified ${pack.verifiedDate}` : "Structural pack only")
              : "Not yet written" })),
          line("Sources", ({ career }) => h("ul", { class: "plain" },
            app.sourcesFor(career).map((source) => h("li", {}, [
              source.url ? link(source.code, source.url, { external: true })
                         : h("span", { text: source.code }),
            ])))),
          line("", ({ career }) => link("Build pathway", `#/pathway/${career.id}`,
                                        { class: "btn btn-quiet" })),
        ]),
      ]),
    ]),
  ], { id: "compare-heading" });
}

function listOf(items) {
  if (!items.length) return h("span", { text: "—" });
  return h("ul", { class: "plain" }, items.map((item) =>
    h("li", { text: item.label })));
}
