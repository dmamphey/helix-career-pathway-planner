/**
 * The career graph screen.
 *
 * Two representations of one model, side by side and equal in standing: an SVG
 * neighbourhood and a structured list. The list is not a fallback for people the
 * picture failed — it is often the faster way to read the same thing, and it is
 * the only way a screen reader gets anywhere near this information.
 *
 * The linear pathway screen is untouched and still linked from here. This adds a
 * way to look sideways; it does not replace the way to look forwards.
 *
 * Drawing decisions worth knowing about
 * -------------------------------------
 *
 * Nodes carry a shape *and* a text label, and regulated careers carry a border
 * and a marker character. Nothing depends on hue, so the screen survives
 * greyscale printing and colour blindness.
 *
 * Every node is a real `<button>` inside `<foreignObject>` rather than an SVG
 * shape with a click handler, so it is tabbable, announces itself, and has a
 * focus ring — none of which comes free when you draw your own controls.
 */

import { h, panel, button, link, empty, regulationBadge } from "../ui.js";
import * as market from "../market-data.js";
import {
  buildGraph, layout, asList, NODE_KINDS, EXPANSION_STEP,
  NODE_WIDTH, NODE_HEIGHT,
} from "../career-graph.js";
import { trackHelixEventOnce, EVENTS } from "../analytics.js";

export async function render(app, context) {
  const target = app.catalogue.get(context.params.id);
  if (!target) {
    return panel("Career not found", [
      empty(`No career in this dataset has the id "${context.params.id}".`),
      h("div", { class: "card-actions" }, [
        link("Browse all careers", "#/explore", { class: "btn btn-primary" }),
      ]),
    ], { id: "graph-missing-heading" });
  }

  const analysis = app.hasProfile() ? await app.analysisFor(target.id) : null;
  const bridges = analysis && analysis.bridge ? analysis.bridge.bridges : [];
  const current = app.baselineCareer();

  // Expansion is view state, not saved state. Somebody opening three nodes to
  // read around a decision has not changed their profile, and it should not
  // follow them to another device.
  const expanded = new Set();
  let zoom = 1;

  const host = h("div", { class: "stack" });

  const draw = () => {
    const graph = buildGraph({
      target, current, bridges, careers: app.catalogue.careers, expanded,
    });
    host.replaceChildren(
      header(app, target, current, graph),
      figure(app, graph, { zoom, setZoom: (value) => { zoom = value; draw(); },
                           expand: (id) => { expanded.add(id); draw(); },
                           expanded }),
      listPanel(app, graph, target),
      legendPanel(graph),
    );
  };
  draw();
  /*
   * The graph is built and on screen. Zooming, panning and opening a node all
   * call `draw()` again, and none of them is another opening of the graph —
   * once per visit keeps this a measure of whether people use the thing at all
   * rather than a measure of how much they fidget with it.
   */
  trackHelixEventOnce(EVENTS.CAREER_GRAPH_OPENED);
  return host;
}

function header(app, target, current, graph) {
  return h("section", { class: "panel" }, [
    h("p", { class: "eyebrow", text: "Career graph" }),
    h("h1", { text: `Around ${target.title}` }),
    h("p", { class: "lede", text: current
      ? `Showing what sits between ${current.title} and ${target.title}, and `
        + `what else is within reach of either.`
      : `Showing what sits next to ${target.title}: where it leads, and what `
        + `else is within reach.` }),
    h("p", { class: "hint", text: `${graph.nodes.length} careers shown out of `
      + `${app.catalogue.count}. A graph of the whole catalogue would be a `
      + `hairball, so this is a neighbourhood — open any career to widen it.` }),
    current
      ? null
      : h("div", { class: "callout callout-info" }, [
          h("p", { text: "Pin a career as your baseline and this view will "
            + "show the route between the two, including any bridge roles." }),
          h("div", { class: "card-actions" }, [
            link("Compare careers", "#/compare", { class: "btn" }),
          ]),
        ]),
    h("div", { class: "card-actions" }, [
      link("Open the step-by-step pathway", `#/pathway/${target.id}`,
           { class: "btn btn-primary" }),
      link("Back to the career", `#/career/${target.id}`, { class: "btn" }),
    ]),
  ]);
}

/* --------------------------------------------------------------- the drawing */

function figure(app, graph, { zoom, setZoom, expand, expanded }) {
  // The layout sizes its own canvas, because the height depends on how tall the
  // busiest column turned out. A fixed viewBox was what pushed nodes off the
  // edge in the ring version.
  const { positions, width, height } = layout(graph);
  const svgNS = "http://www.w3.org/2000/svg";

  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", `0 0 ${width} ${height}`);
  svg.style.minWidth = `${Math.min(width, 640)}px`;
  svg.setAttribute("class", "career-graph");
  // The picture duplicates the list below it exactly, so it is hidden from
  // assistive technology rather than read out twice in a less useful order.
  svg.setAttribute("role", "presentation");
  svg.setAttribute("aria-hidden", "true");
  svg.style.transform = `scale(${zoom})`;

  for (const edge of graph.edges) {
    const from = positions.get(edge.from);
    const to = positions.get(edge.to);
    if (!from || !to) continue;
    const line = document.createElementNS(svgNS, "line");
    line.setAttribute("x1", from.x);
    line.setAttribute("y1", from.y);
    line.setAttribute("x2", to.x);
    line.setAttribute("y2", to.y);
    line.setAttribute("class", `graph-edge graph-edge-${edge.style}`);
    svg.appendChild(line);
  }

  for (const node of graph.nodes) {
    const at = positions.get(node.id);
    if (!at) continue;
    const holder = document.createElementNS(svgNS, "foreignObject");
    holder.setAttribute("x", at.x - NODE_WIDTH / 2);
    holder.setAttribute("y", at.y - NODE_HEIGHT / 2);
    holder.setAttribute("width", NODE_WIDTH);
    holder.setAttribute("height", NODE_HEIGHT);

    const wrapper = h("div", { class: "graph-node-holder" }, [
      nodeButton(app, node, expand, expanded),
    ]);
    holder.appendChild(wrapper);
    svg.appendChild(holder);
  }

  const stage = h("div", { class: "graph-stage" });
  stage.appendChild(svg);

  return panel("The neighbourhood", [
    h("div", { class: "graph-controls" }, [
      button("Zoom out", () => setZoom(Math.max(0.6, zoom - 0.2)),
             { variant: "quiet" }),
      h("span", { class: "hint", text: `${Math.round(zoom * 100)}%` }),
      button("Zoom in", () => setZoom(Math.min(1.8, zoom + 0.2)),
             { variant: "quiet" }),
      button("Reset", () => setZoom(1), { variant: "quiet" }),
    ]),
    h("p", { class: "hint", text: "Drag sideways to pan on a narrow screen. "
      + "Everything in this picture is also in the list underneath, which is "
      + "where a keyboard and a screen reader should go." }),
    stage,
  ], { id: "graph-figure-heading" });
}

/**
 * One career in the picture.
 *
 * A real button, so it tabs and announces. The visible label carries the title;
 * the accessible name adds the role, because "Clinical Scientist" alone does not
 * say whether this is the target or an option three rings out.
 */
function nodeButton(app, node, expand, expanded) {
  const kind = NODE_KINDS[node.kind];
  const control = h("button", {
    type: "button",
    class: `graph-node graph-node-${node.kind}`
         + (node.regulated ? " graph-node-regulated" : ""),
    "aria-label": `${node.career.title}. ${kind.label}.`
      + (node.regulated ? " Regulated profession." : ""),
    onClick: () => openNode(app, node, expand, expanded),
  }, [
    h("span", { class: "graph-node-shape", "aria-hidden": "true",
                text: shapeGlyph(kind.shape) }),
    h("span", { class: "graph-node-title", text: node.career.title }),
    node.regulated
      ? h("span", { class: "graph-node-flag", "aria-hidden": "true", text: "§" })
      : null,
  ]);
  return control;
}

function shapeGlyph(shape) {
  return { square: "■", star: "★", diamond: "◆", triangle: "▲", circle: "●" }[shape]
    || "●";
}

/** What clicking a node offers. Every action the spec asks for, in one place. */
function openNode(app, node, expand, expanded) {
  const pay = market.salary(node.career.id);
  const kind = NODE_KINDS[node.kind];

  const body = h("div", { class: "stack" }, [
    h("p", { class: "eyebrow", text: `${kind.label} · ${node.career.family}` }),
    h("p", { text: kind.describe }),
    pay
      ? h("p", {}, [h("strong", { text: pay.range }),
                    h("span", { class: "hint", text: " a year, UK" })])
      : h("p", { class: "hint", text: "No salary record for this career." }),
    node.regulated ? regulationBadge(node.career) : null,
    node.closesGaps && node.closesGaps.length
      ? h("p", { text: `As a bridge, it covers ${node.closesGaps.join(", ")}.` })
      : null,
    node.stepsDown
      ? h("p", { class: "callout callout-warn", text: "This sits a grade below "
          + "your current role." })
      : null,
  ]);

  const actions = [
    link("Open this career", `#/career/${node.career.id}`,
         { class: "btn btn-primary" }),
    link("Build a pathway", `#/pathway/${node.career.id}`, { class: "btn" }),
    button(app.isComparing(node.career.id) ? "In comparison ✓" : "Compare",
           () => app.toggleCompare(node.career.id), { variant: "quiet" }),
    button(app.isSaved(node.career.id) ? "Saved ✓" : "Save",
           () => app.toggleSaved(node.career.id), { variant: "quiet" }),
    button(app.isBaseline(node.career.id) ? "Baseline ✓" : "Pin as baseline",
           () => app.setBaseline(node.career.id), { variant: "quiet" }),
    expanded.has(node.career.id)
      ? null
      : button(`Show ${EXPANSION_STEP} more around this`,
               () => expand(node.career.id), { variant: "quiet" }),
    link("Centre the graph here", `#/graph/${node.career.id}`,
         { class: "btn btn-quiet" }),
  ].filter(Boolean);

  import("../ui.js").then(({ dialog }) =>
    dialog(node.career.title, body, actions));
}

/* ----------------------------------------------------------------- the list */

function listPanel(app, graph, target) {
  const groups = asList(graph);
  const titles = new Map(graph.nodes.map((node) => [node.id, node.career.title]));

  return panel("The same careers, as a list", [
    h("p", { class: "hint", text: "Everything in the picture above, grouped by "
      + "what it is. This is not a simplified version — it is the same model, "
      + "and it carries the connections the picture draws as lines." }),
    ...groups.map((group) => h("div", { class: "graph-group" }, [
      h("h3", { text: group.label }),
      h("p", { class: "hint", text: group.describe }),
      h("ul", { class: "graph-list" }, group.members.map((node) =>
        h("li", {}, [
          h("div", { class: "graph-list-head" }, [
            link(node.career.title, `#/career/${node.career.id}`),
            node.regulated
              ? h("span", { class: "chip", text: "Regulated" }) : null,
          ]),
          h("p", { class: "hint", text: node.career.family }),
          node.connections.length
            ? h("ul", { class: "plain graph-connections" },
                node.connections.map((connection) => h("li", {
                  text: `${connection.label} `
                      + `${connection.direction === "to" ? "to" : "from"} `
                      + `${titles.get(connection.otherId) || "another career"}`,
                })))
            : null,
          h("div", { class: "card-actions" }, [
            link("Open", `#/career/${node.career.id}`, { class: "btn btn-quiet" }),
            link("Centre here", `#/graph/${node.career.id}`,
                 { class: "btn btn-quiet" }),
          ]),
        ]))),
    ])),
  ], { id: "graph-list-heading" });
}

function legendPanel(graph) {
  return panel("What the symbols mean", [
    h("h3", { text: "Careers" }),
    h("ul", { class: "plain" }, graph.legend.nodes.map((kind) =>
      h("li", {}, [
        h("span", { class: "graph-key", "aria-hidden": "true",
                    text: shapeGlyph(kind.shape) }),
        h("strong", { text: ` ${kind.label}` }),
        ` — ${kind.describe}`,
      ]))),
    graph.legend.regulated
      ? h("p", { class: "hint", text: "§ marks a career associated with a "
          + "regulated profession or protected title." })
      : null,

    h("h3", { text: "Connections" }),
    h("ul", { class: "plain" }, graph.legend.edges.map((kind) =>
      h("li", {}, [
        h("strong", { text: kind.label }),
        ` — drawn ${kind.style}.`,
      ]))),
    h("p", { class: "hint", text: "Shape and label carry the meaning. Nothing "
      + "here depends on colour, so the picture works in greyscale." }),
    h("p", { class: "hint", text: "A connection means the two careers share "
      + "enough subject matter, family or seniority for a move between them to "
      + "be worth considering. It is not a claim that anybody has made that "
      + "move, and it is never a statement about eligibility." }),
  ], { id: "graph-legend-heading" });
}
