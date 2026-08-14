/**
 * The pathway planner: the map, the gap analysis and the next three actions.
 *
 * This is the screen the product exists for. It answers, in order: where am I,
 * what does this route involve, what am I missing, and what do I do next.
 */

import {
  h, panel, button, link, statusPill, milestonePill, sourceList, empty,
  progressBar, dialog, notice, verificationNote
} from "../ui.js";
import { MILESTONE_STATUS, evidenceFor } from "../pathway-engine.js";
import { CATEGORIES, GAP_STATUS, AREAS } from "../gap-engine.js";

export async function render(app, context) {
  const careerId = context.params.id;
  const career = app.catalogue.get(careerId);
  if (!career) {
    return panel("Career not found", [
      empty(`No career in this dataset has the id "${careerId}".`),
      h("div", { class: "card-actions" }, [
        link("Browse all careers", "#/explore", { class: "btn btn-primary" }),
      ]),
    ], { id: "missing-heading" });
  }

  if (!app.hasProfile()) {
    return panel(`Pathway to ${career.title}`, [
      empty("A pathway is built from your profile against this career, so there "
          + "has to be a profile first."),
      h("div", { class: "card-actions" }, [
        link("Upload my CV", "#/upload", { class: "btn btn-primary" }),
        link("Build a profile manually", "#/profile", { class: "btn" }),
        link("See the career itself", `#/career/${careerId}`, { class: "btn btn-quiet" }),
      ]),
    ], { id: "pathway-empty-heading" });
  }

  const host = h("div", { class: "stack" });

  const draw = async () => {
    const analysis = await app.analysisFor(careerId);
    const { match, gaps, pathway, actions, pack, bridge } = analysis;
    host.replaceChildren(
      header(app, career, match, pathway),
      verificationNote(gaps),
      actionsPanel(actions, app),
      mapPanel(app, career, pathway, gaps, draw),
      bridgePanel(app, career, bridge, draw),
      gapsPanel(gaps),
      transitionsPanel(gaps),
      routesPanel(pack, pathway),
      sourceList(sourcesForPathway(app, career, pack), career.last_verified),
      footerActions(app, career),
    );
  };
  await draw();
  return host;
}

function header(app, career, match, pathway) {
  const isTarget = app.state.targetCareerId === career.id;
  return h("section", { class: "panel career-header" }, [
    h("p", { class: "eyebrow", text: "Pathway plan" }),
    h("h1", { text: career.title }),
    h("p", { class: "lede", text: `${career.family} · ${match.label}` }),
    progressBar(pathway.completion.percent,
      `${pathway.completion.done} of ${pathway.completion.total} milestones `
      + `marked complete, ${pathway.completion.active} in progress.`),
    pathway.expansionNote
      ? h("p", { class: "hint", text: pathway.expansionNote })
      : null,
    h("div", { class: "card-actions" }, [
      button(isTarget ? "This is your target career ✓" : "Set as my target career",
        () => {
          app.setTarget(career.id);
          notice(`${career.title} is now your target career.`, "good");
          app.navigate(`/pathway/${career.id}`);
        }, { variant: isTarget ? "quiet" : "primary", disabled: isTarget }),
      link("Career detail", `#/career/${career.id}`, { class: "btn btn-quiet" }),
      link("Download my career plan", `#/plan/${career.id}`, { class: "btn" }),
    ]),
  ]);
}

/** The next three actions, which is what most people came for. */
function actionsPanel(actions, app) {
  return panel("Your next 3 moves", [
    h("ol", { class: "actions" }, actions.map((action) =>
      h("li", {}, [
        h("h3", { text: action.title }),
        h("p", { text: action.detail }),
        h("p", { class: "hint", text: `Why this one: ${action.why}` }),
        action.sourceUrl
          ? h("p", {}, [link("Open the official source", action.sourceUrl,
                             { external: true })])
          : null,
      ]))),
    h("p", { class: "hint", text:
      "Three, deliberately. Priority order is: anything verified as mandatory, "
      + "then anything that must be confirmed officially, then your largest "
      + "development gap, then evidence, then people." }),
  ], { id: "actions-heading" });
}

/**
 * The pathway map.
 *
 * A vertical timeline at every width — it reads as a sequence on a phone and on a
 * desktop, and never needs horizontal scrolling.
 */
function mapPanel(app, career, pathway, gaps, redraw) {
  return panel("Your pathway", [
    h("ol", { class: "pathway" }, pathway.nodes.map((node, index) =>
      h("li", { class: `node node-${node.status}` }, [
        h("div", { class: "node-marker", "aria-hidden": "true" }, [
          h("span", { text: MILESTONE_STATUS[node.status].symbol }),
        ]),
        h("div", { class: "node-body" }, [
          index === 0
            ? h("p", { class: "eyebrow", text: "You are here" })
            : null,
          h("h3", {}, node.fixed
            ? [h("span", { text: node.title })]
            : [h("button", { type: "button", class: "node-open",
                onClick: () => openMilestone(app, career, node, gaps, redraw) },
                node.title)]),
          h("div", { class: "node-meta" }, [milestonePill(node.status)]),
          node.meaning ? h("p", { text: node.meaning }) : null,
          !node.fixed
            ? h("div", { class: "node-actions" }, [
                button(node.status === "completed" ? "Completed ✓" : "Mark complete",
                  () => {
                    app.setMilestone(career.id, node.id,
                      node.status === "completed" ? null : "completed");
                    redraw();
                  }, { variant: "quiet", pressed: node.status === "completed" }),
                button(node.status === "in_progress" ? "In progress ◐" : "Mark in progress",
                  () => {
                    app.setMilestone(career.id, node.id,
                      node.status === "in_progress" ? null : "in_progress");
                    redraw();
                  }, { variant: "quiet", pressed: node.status === "in_progress" }),
              ])
            : null,
        ]),
      ]))),
    pathway.fromRulePack
      ? h("p", { class: "hint", text:
          "These milestones come from a researched pack for this career." })
      : h("p", { class: "hint", text:
          "These milestones were generated from your profile and this career's "
          + "metadata. No researched pack exists for it yet, so no route-specific "
          + "requirements have been asserted." }),
  ], { id: "pathway-heading" });
}

function openMilestone(app, career, node, gaps, redraw) {
  const evidence = evidenceFor(app.profile(), node.domain);
  const source = node.sourceCode ? app.catalogue.sources[node.sourceCode] : null;
  dialog(node.title, [
    h("dl", { class: "summary" }, [
      h("dt", { text: "What it means" }),
      h("dd", { text: node.meaning || "—" }),
      h("dt", { text: "Why it matters" }),
      h("dd", { text: node.why || "—" }),
      h("dt", { text: "Evidence you may already have" }),
      h("dd", { text: evidence.length
        ? evidence.join(", ")
        : "Nothing in your profile was matched to this milestone. If you have "
          + "relevant experience, add it to your profile." }),
      h("dt", { text: "Suggested action" }),
      h("dd", { text: node.action || "—" }),
    ]),
    source
      ? h("p", {}, ["Official source: ",
          link(source.name, source.url, { external: true })])
      : null,
    node.status === "needs_confirmation"
      ? h("div", { class: "callout callout-warn" }, [
          h("p", { text: "Helix cannot mark this as met on your behalf. "
            + "Confirm it with the official body, then record it here." }),
        ])
      : null,
  ], {
    actions: [
      button("Mark in progress", () => {
        app.setMilestone(career.id, node.id, "in_progress");
        redraw();
        document.querySelector("dialog.modal")?.close();
      }, { variant: "quiet" }),
      button("Mark complete", () => {
        app.setMilestone(career.id, node.id, "completed");
        redraw();
        document.querySelector("dialog.modal")?.close();
      }, { variant: "primary" }),
    ],
  });
}

/** The gap analysis, organised by requirement category then by area. */
function gapsPanel(gaps) {
  const categories = ["required", "needs_confirmation", "usually_expected",
                      "career_enhancing", "optional"];
  return panel("Gap analysis", [
    h("p", { class: "hint", text:
      "“Not identified in your current profile” is not the same as “you do not "
      + "have this”. Add evidence to your profile and this updates." }),
    h("ul", { class: "key" }, Object.entries(GAP_STATUS).map(([key, value]) =>
      h("li", {}, [statusPill(key)]))),
    ...categories.map((category) => {
      const items = gaps.byCategory.get(category) || [];
      if (!items.length) return null;
      const meta = CATEGORIES[category];
      return h("div", { class: "gap-group" }, [
        h("h3", { text: meta.label }),
        h("p", { class: "hint", text: meta.blurb }),
        h("ul", { class: "gap-list" }, items.map((item) =>
          h("li", {}, [
            h("div", { class: "gap-head" }, [
              statusPill(item.status),
              h("strong", { text: item.title }),
              h("span", { class: "gap-area",
                text: (AREAS.find((area) => area.id === item.area) || {}).label
                   || item.area }),
            ]),
            item.detail ? h("p", { text: item.detail }) : null,
            item.demotedFromRequired
              ? h("p", { class: "hint", text:
                  "Listed as required in the source pack, but shown here as an "
                  + "expectation because that pack is not yet verified." })
              : null,
          ]))),
      ]);
    }),
  ], { id: "gaps-heading" });
}

function transitionsPanel(gaps) {
  const { transferable, translation, development } = gaps.transitions;
  const column = (title, hint, items, className) => h("div", { class: "card" }, [
    h("h3", { text: title }),
    h("p", { class: "hint", text: hint }),
    items.length
      ? h("ul", { class: "chips" }, items.map((item) =>
          h("li", {}, [h("span", { class: `chip ${className}`, text: item.label })])))
      : empty("None identified."),
  ]);

  return panel("Transferable, translation and development", [
    h("div", { class: "grid grid-3" }, [
      column("Transferable assets", "What you already bring to this move.",
             transferable, "chip-good"),
      column("Translation gaps",
             "Capabilities you appear to have, described differently in this "
             + "career's sector.", translation, ""),
      column("Genuine development gaps",
             "New knowledge, training or experience likely to be needed.",
             development, "chip-gap"),
    ]),
  ], { id: "transitions-heading" });
}

/* -------------------------------------------------------------- bridge roles */

/**
 * The two routes, side by side.
 *
 * The direct route is always shown, always first, and never disparaged. A bridge
 * is an option that trades time for a smaller step, and presenting it as the
 * sensible choice would be advice Helix has no standing to give — it does not
 * know whether somebody can afford two more years.
 */
function bridgePanel(app, career, bridge, redraw) {
  if (!bridge) return null;

  return panel("Getting there: direct, or by way of another role", [
    h("div", { class: "route-pair" }, [
      h("div", { class: "route-card" }, [
        h("h3", { text: "Direct route" }),
        h("ol", { class: "route-steps" }, [
          h("li", { text: app.profile().currentRole || "Where you are now" }),
          h("li", {}, [h("strong", { text: career.title })]),
        ]),
        h("p", { class: "hint", text: bridge.direct.openGapCount
          ? `${bridge.direct.openGapCount} development `
            + `${bridge.direct.openGapCount === 1 ? "area" : "areas"} to build `
            + "while you are still in your current role."
          : "No development gaps were identified, so this is a matter of "
            + "applying." }),
      ]),

      bridge.hasBridge
        ? h("div", { class: "route-card" }, [
            h("h3", { text: "By way of a bridge role" }),
            h("ol", { class: "route-steps" }, [
              h("li", { text: app.profile().currentRole || "Where you are now" }),
              h("li", {}, [h("em", { text: bridge.bridges[0].career.title })]),
              h("li", {}, [h("strong", { text: career.title })]),
            ]),
            h("p", { class: "hint", text: "Longer, and each step is smaller. "
              + "Whether that is worth it is your call, not Helix's." }),
          ])
        : null,
    ]),

    !bridge.hasBridge
      ? h("p", { class: "hint", text: bridge.reason })
      : h("div", { class: "stack" }, [
          h("h3", { text: bridge.bridges.length === 1
            ? "The bridge role Helix found"
            : `${bridge.bridges.length} possible bridge roles` }),
          h("p", { class: "hint", text: "Chosen because each one is closer to "
            + "your current profile than the destination is, works in an area "
            + "the destination needs, and sits next to it in the catalogue. "
            + "None of them is a required step." }),
          ...bridge.bridges.map((item) => bridgeCard(app, item, career, redraw)),
        ]),
  ], { id: "bridge-heading" });
}

function bridgeCard(app, item, target, redraw) {
  const pay = app.market.salary(item.career.id);
  return h("article", { class: "bridge-card" }, [
    h("h4", {}, [link(item.career.title, `#/career/${item.career.id}`)]),
    h("p", { class: "eyebrow", text: item.career.family }),

    h("dl", { class: "summary" }, [
      h("dt", { text: "Why this role helps" }),
      h("dd", { text: item.whyItHelps }),
      h("dt", { text: "What transfers from where you are" }),
      h("dd", { text: item.whatTransfers }),
      h("dt", { text: "What it can give you" }),
      h("dd", { text: item.whatItProvides.length
        ? item.whatItProvides.join(", ")
        : "Relevant sector experience." }),
      h("dt", { text: `Gaps it closes for ${target.title}` }),
      h("dd", { text: item.closesGaps.length
        ? item.closesGaps.join(", ") : "None identified." }),
      h("dt", { text: "Typical salary" }),
      h("dd", { text: pay ? `${pay.range} a year` : "Not yet available" }),
      h("dt", { text: "Possible next move" }),
      h("dd", { text: item.nextMove }),
    ]),

    item.gradeNote
      ? h("p", { class: "callout callout-warn", text: item.gradeNote })
      : null,
    h("p", { class: "hint", text: item.optional }),
    h("div", { class: "card-actions" }, [
      link("Open this career", `#/career/${item.career.id}`, { class: "btn" }),
      button(app.isComparing(item.career.id) ? "In comparison ✓" : "Compare",
             () => { app.toggleCompare(item.career.id); redraw(); },
             { variant: "quiet", pressed: app.isComparing(item.career.id) }),
    ]),
  ]);
}

function routesPanel(pack, pathway) {
  if (!pack || (!pack.entryRoutes.length && !pack.bridgeRoles.length)) return null;
  return panel("Entry routes and bridge roles", [
    pack.entryRoutes.length
      ? h("div", {}, [
          h("h3", { text: "Common entry routes" }),
          h("ul", {}, pack.entryRoutes.map((route) => h("li", { text: route }))),
        ])
      : null,
    pack.bridgeRoles.length
      ? h("div", {}, [
          h("h3", { text: "Bridge roles" }),
          h("p", { class: "hint", text:
            "Roles people commonly use as a stepping stone into this career." }),
          h("ul", {}, pack.bridgeRoles.map((role) => h("li", { text: role }))),
        ])
      : null,
    pack.notes
      ? h("p", { class: "hint", text: pack.notes })
      : null,
  ], { id: "routes-heading" });
}

function sourcesForPathway(app, career, pack) {
  const fromDataset = app.sourcesFor(career);
  if (!pack || !pack.officialSources.length) return fromDataset;
  const seen = new Set(fromDataset.map((source) => source.url));
  return [...fromDataset, ...pack.officialSources
    .filter((source) => !seen.has(source.url))
    .map((source) => ({ ...source, known: true }))];
}

function footerActions(app, career) {
  return h("div", { class: "card-actions" }, [
    link("Download my career plan", `#/plan/${career.id}`,
         { class: "btn btn-primary" }),
    link("Edit my profile", "#/profile", { class: "btn" }),
    link("Compare saved careers", "#/saved", { class: "btn btn-quiet" }),
  ]);
}
