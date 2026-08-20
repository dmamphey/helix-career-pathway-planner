/**
 * The career graph: a neighbourhood, never the whole catalogue.
 *
 * 734 nodes and their edges would render as a hairball — technically a graph,
 * practically a decoration. What answers a question is the neighbourhood around
 * one or two careers: where you are, where you are going, what sits between, and
 * what else is within reach.
 *
 * This module builds the model. It draws nothing, holds no DOM and has no
 * opinions about SVG — which keeps the interesting part (what counts as an edge,
 * and why) testable without a browser.
 *
 * Edge types are meanings, not weights
 * ------------------------------------
 *
 * A line between two careers can mean several different things, and collapsing
 * them into one "related" edge with a thickness throws away the only information
 * that helps: whether the move is upward, sideways, into another sector, or
 * through an intermediate role. Each type is named, and the interface shows the
 * name.
 */

import { similarity, adjacentCareers } from "./adjacency.js";
import { seniorityOf } from "./career-data.js";

/**
 * How many careers the default view holds.
 *
 * Small on purpose. A graph you can read in one glance is worth more than one
 * that is complete, and expansion is one click away.
 */
export const DEFAULT_BUDGET = 14;
export const EXPANSION_STEP = 6;

/** Node roles, which drive shape and label — never colour alone. */
export const NODE_KINDS = {
  current: {
    key: "current", label: "Where you are", shape: "square",
    describe: "Your current or baseline career.",
  },
  target: {
    key: "target", label: "Target", shape: "star",
    describe: "The career this view is centred on.",
  },
  bridge: {
    key: "bridge", label: "Bridge role", shape: "diamond",
    describe: "A role that could sit between the two.",
  },
  progression: {
    key: "progression", label: "Next step up", shape: "triangle",
    describe: "A more senior career reachable from here.",
  },
  adjacent: {
    key: "adjacent", label: "Adjacent option", shape: "circle",
    describe: "A career with substantial overlap.",
  },
};

/** Edge meanings. The label is shown; the style is only reinforcement. */
export const EDGE_KINDS = {
  progression: { key: "progression", label: "Progression", style: "solid" },
  adjacent: { key: "adjacent", label: "Adjacent transition", style: "solid" },
  specialisation: { key: "specialisation", label: "Specialisation", style: "solid" },
  leadership: { key: "leadership", label: "Leadership progression", style: "solid" },
  industry: { key: "industry", label: "Industry transition", style: "dashed" },
  research: { key: "research", label: "Research transition", style: "dashed" },
  clinical: { key: "clinical", label: "Clinical transition", style: "dashed" },
  commercial: { key: "commercial", label: "Commercial transition", style: "dashed" },
  bridge: { key: "bridge", label: "Bridge route", style: "dotted" },
};

/** Families whose transitions read as a change of sector rather than a step. */
const SECTOR_FAMILIES = {
  research: ["Research & Academia", "Cell & Gene Therapy, Omics & Advanced Biology"],
  industry: ["Pharma, Biotech R&D & Manufacturing",
             "Medical Devices, MedTech & Engineering"],
  clinical: ["Medicine & Dentistry", "Nursing, Midwifery & Pharmacy",
             "Allied Health & Clinical Practice"],
  commercial: ["Medical Affairs, Commercial, Market Access & Communications"],
};

/**
 * Build the graph around a target, and optionally a current career.
 *
 * @param {object}  options.target      the career at the centre
 * @param {object}  options.current     the baseline career, or null
 * @param {Array}   options.bridges     bridge results from `bridge-engine`
 * @param {Array}   options.careers     the full catalogue
 * @param {number}  options.budget      how many nodes to include
 * @param {Set}     options.expanded    ids the user has asked to expand
 * @returns {{nodes, edges, truncated, budget, legend}}
 */
export function buildGraph({ target, current = null, bridges = [], careers,
                             budget = DEFAULT_BUDGET, expanded = new Set() }) {
  const nodes = new Map();
  const edges = [];

  const add = (career, kind, extra = {}) => {
    if (!career) return null;
    const existing = nodes.get(career.id);
    if (existing) {
      // A career can qualify as several things at once. The most specific
      // reading wins, so a bridge that is also adjacent stays a bridge.
      if (rank(kind) < rank(existing.kind)) {
        existing.kind = kind;
        Object.assign(existing, extra);
      }
      return existing;
    }
    const node = {
      id: career.id,
      career,
      kind,
      seniority: seniorityOf(career.title),
      regulated: Boolean(career.derived.regulated),
      family: career.family,
      ...extra,
    };
    nodes.set(career.id, node);
    return node;
  };

  const connect = (from, to, kind, note = "") => {
    if (!from || !to || from.id === to.id) return;
    const key = `${from.id}->${to.id}`;
    if (edges.some((edge) => edge.key === key)) return;
    edges.push({
      key,
      from: from.id,
      to: to.id,
      kind,
      label: EDGE_KINDS[kind].label,
      style: EDGE_KINDS[kind].style,
      note,
    });
  };

  const targetNode = add(target, "target");
  const currentNode = current && current.id !== target.id
    ? add(current, "current") : null;

  // Bridges first: they are the reason the graph is more useful than a list, and
  // they must survive the node budget.
  for (const bridge of bridges) {
    const node = add(bridge.career, "bridge", {
      closesGaps: bridge.closesGaps || [],
      stepsDown: Boolean(bridge.stepsDown),
    });
    if (currentNode) connect(currentNode, node, "bridge");
    connect(node, targetNode, "bridge",
            `Covers ${(bridge.closesGaps || []).length} of the gaps`);
  }

  if (currentNode) {
    connect(currentNode, targetNode, edgeKind(current, target),
            "The direct route");
  }

  // Then progression from the target, then general adjacency, until the budget
  // is used. Progression comes first because "what is above this" is the
  // question a career page cannot already answer.
  const seeds = currentNode ? [target, current] : [target];
  for (const seed of seeds) {
    for (const item of adjacentCareers(seed, careers, { mode: "next", limit: 3 })) {
      if (nodes.size >= budget) break;
      const node = add(item.career, "progression");
      connect(add(seed, seed === target ? "target" : "current"), node,
              seniorityOf(item.career.title) > seniorityOf(seed.title)
                ? "progression" : "adjacent");
    }
  }

  for (const seed of seeds) {
    for (const item of adjacentCareers(seed, careers, { mode: "similar", limit: 5 })) {
      if (nodes.size >= budget) break;
      const node = add(item.career, "adjacent");
      connect(add(seed, seed === target ? "target" : "current"), node,
              edgeKind(seed, item.career));
    }
  }

  // Anything the user explicitly opened is added regardless of budget: an
  // expansion the interface then refuses to show would be a broken promise.
  for (const id of expanded) {
    const career = careers.find((item) => item.id === id);
    if (!career) continue;
    const from = nodes.get(id);
    if (!from) continue;
    for (const item of adjacentCareers(career, careers, { mode: "similar", limit: EXPANSION_STEP })) {
      const node = add(item.career, "adjacent");
      connect(from, node, edgeKind(career, item.career));
    }
  }

  // Edges pointing at careers that never made the budget would draw as lines to
  // nowhere.
  const present = new Set(nodes.keys());
  const kept = edges.filter((edge) => present.has(edge.from) && present.has(edge.to));

  return {
    nodes: [...nodes.values()],
    edges: kept,
    truncated: nodes.size >= budget,
    budget,
    legend: legendFor([...nodes.values()], kept),
  };
}

/** What kind of move this is, from what the two careers are. */
function edgeKind(from, to) {
  if (from.family === to.family) {
    const step = seniorityOf(to.title) - seniorityOf(from.title);
    if (step >= 2) return "leadership";
    if (step === 1) return "progression";
    return "specialisation";
  }
  for (const [kind, families] of Object.entries(SECTOR_FAMILIES)) {
    if (families.includes(to.family)) return kind;
  }
  return "adjacent";
}

function rank(kind) {
  return ["target", "current", "bridge", "progression", "adjacent"].indexOf(kind);
}

/** Only the kinds actually present, so the key never explains absent symbols. */
function legendFor(nodes, edges) {
  const nodeKinds = new Set(nodes.map((node) => node.kind));
  const edgeKinds = new Set(edges.map((edge) => edge.kind));
  return {
    nodes: Object.values(NODE_KINDS).filter((kind) => nodeKinds.has(kind.key)),
    edges: Object.values(EDGE_KINDS).filter((kind) => edgeKinds.has(kind.key)),
    regulated: nodes.some((node) => node.regulated),
  };
}

/** Node box, in the same units as the viewBox. Layout has to know its own size. */
export const NODE_WIDTH = 148;
export const NODE_HEIGHT = 58;
const COLUMN_GAP = 46;
const ROW_GAP = 16;
const PADDING = 24;

/**
 * Positions for drawing, computed rather than simulated.
 *
 * A force-directed layout would look livelier and be worse: it settles somewhere
 * different every run, so the same two careers move between visits and nothing
 * can be pointed at.
 *
 * Concentric rings were the first attempt and failed on contact with real data.
 * At fourteen nodes the rings collided — seven overlapping pairs and one career
 * pushed outside the canvas — because an ellipse gives you least room exactly
 * where the boxes are widest. What replaced it is a layered left-to-right
 * layout, which cannot overlap by construction: each column has its own x, and
 * rows within a column are spaced by the node height.
 *
 * It also reads better. Left to right is the direction of the move — where you
 * are, what sits between, where you are going, what is above that — so the
 * picture now has the same shape as the sentence somebody would say out loud.
 *
 * Returns positions plus the canvas the caller should use, because the height
 * depends on how tall the busiest column turned out.
 */
export function layout(graph) {
  const columns = [
    { key: "current", members: [] },
    { key: "bridge", members: [] },
    { key: "target", members: [] },
    { key: "progression", members: [] },
  ];
  const byKey = new Map(columns.map((column) => [column.key, column]));
  const adjacent = [];

  for (const node of graph.nodes) {
    if (node.kind === "adjacent") adjacent.push(node);
    else byKey.get(node.kind).members.push(node);
  }

  // Empty columns are dropped rather than left as gaps, so a graph with no
  // baseline and no bridges is centred instead of hugging the right edge.
  const used = columns.filter((column) => column.members.length);

  // Higher seniority sits higher within a column, which makes "what is above
  // this" true of the picture as well as of the words.
  for (const column of used) {
    column.members.sort((a, b) =>
      b.seniority - a.seniority || a.career.title.localeCompare(b.career.title));
  }

  const adjacentPerRow = Math.max(1, Math.min(4, Math.ceil(adjacent.length / 2)));
  const adjacentRows = Math.ceil(adjacent.length / adjacentPerRow);

  const tallest = Math.max(1, ...used.map((column) => column.members.length));
  const columnHeight = tallest * NODE_HEIGHT + (tallest - 1) * ROW_GAP;
  const adjacentHeight = adjacent.length
    ? adjacentRows * NODE_HEIGHT + (adjacentRows - 1) * ROW_GAP + 40
    : 0;

  const columnCount = Math.max(used.length, adjacentPerRow);
  const width = PADDING * 2 + columnCount * NODE_WIDTH
              + (columnCount - 1) * COLUMN_GAP;
  const height = PADDING * 2 + columnHeight + adjacentHeight;

  const placed = new Map();
  const step = NODE_WIDTH + COLUMN_GAP;
  const usedWidth = used.length * NODE_WIDTH + (used.length - 1) * COLUMN_GAP;
  const startX = (width - usedWidth) / 2 + NODE_WIDTH / 2;

  used.forEach((column, index) => {
    const x = startX + index * step;
    const count = column.members.length;
    const blockHeight = count * NODE_HEIGHT + (count - 1) * ROW_GAP;
    const top = PADDING + (columnHeight - blockHeight) / 2;
    column.members.forEach((node, row) => {
      placed.set(node.id, {
        x,
        y: top + row * (NODE_HEIGHT + ROW_GAP) + NODE_HEIGHT / 2,
      });
    });
  });

  // Adjacent options sit in a band underneath. They connect to several columns,
  // so putting them in a column of their own would produce the longest lines on
  // the diagram for the least important relationships.
  adjacent.sort((a, b) => a.career.title.localeCompare(b.career.title));
  adjacent.forEach((node, index) => {
    const row = Math.floor(index / adjacentPerRow);
    const inRow = Math.min(adjacentPerRow, adjacent.length - row * adjacentPerRow);
    const rowWidth = inRow * NODE_WIDTH + (inRow - 1) * COLUMN_GAP;
    const rowStart = (width - rowWidth) / 2 + NODE_WIDTH / 2;
    placed.set(node.id, {
      x: rowStart + (index % adjacentPerRow) * step,
      y: PADDING + columnHeight + 40
         + row * (NODE_HEIGHT + ROW_GAP) + NODE_HEIGHT / 2,
    });
  });

  return { positions: placed, width, height };
}

/**
 * The same graph as an ordered list.
 *
 * Not a fallback — an equal. Some people read a list faster than a picture, a
 * screen reader has no use for the picture at all, and the spec is explicit that
 * the graph must never be the only way to the information. Grouping by role and
 * sorting inside each group makes the list navigable rather than merely present.
 */
export function asList(graph) {
  const groups = [];
  for (const kind of Object.values(NODE_KINDS)) {
    const members = graph.nodes
      .filter((node) => node.kind === kind.key)
      .sort((a, b) => a.career.title.localeCompare(b.career.title));
    if (!members.length) continue;
    groups.push({
      kind: kind.key,
      label: kind.label,
      describe: kind.describe,
      members: members.map((node) => ({
        ...node,
        connections: graph.edges
          .filter((edge) => edge.from === node.id || edge.to === node.id)
          .map((edge) => ({
            label: edge.label,
            otherId: edge.from === node.id ? edge.to : edge.from,
            direction: edge.from === node.id ? "to" : "from",
          })),
      })),
    });
  }
  return groups;
}
