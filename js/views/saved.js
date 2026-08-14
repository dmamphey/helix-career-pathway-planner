/**
 * Saved careers: a shortlist, and a way into the comparison.
 *
 * Saved and Compare mean different things and are kept apart. Saving is a
 * bookmark — come back to this later. Comparing is a working set — hold these
 * side by side while I decide. This screen used to carry its own comparison
 * table, with its own tick boxes and its own idea of which careers were selected,
 * which meant two comparison systems that could disagree with each other and only
 * one of them reachable without saving first. That table is gone: the cards here
 * drive the same selection every other screen drives, and the comparison itself
 * lives at one address.
 */

import {
  h, panel, link, button, careerCard, empty, notice, scoredFit,
} from "../ui.js";
import { MAX_COMPARE, canCompare, routeFor } from "../comparison.js";

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

  /*
   * Effort needs a gap analysis per career, so it is fetched for the saved list
   * only — at most 24 careers, not all 716 — and the cards are drawn twice: once
   * immediately, then again when the analysis arrives. Waiting for it before
   * showing anything would make Saved feel slower than it is.
   */
  const efforts = new Map();

  const draw = () => {
    const selected = app.compareIds();
    const addable = careers.filter((career) => !app.isComparing(career.id));
    const room = MAX_COMPARE - selected.length;

    host.replaceChildren(
      panel("Saved careers", [
        h("p", { class: "hint", text: `${careers.length} saved. Use Compare on any `
          + `card to add it to the comparison — up to ${MAX_COMPARE} at a time.` }),
        h("div", { class: "card-actions" }, [
          addable.length && room > 0
            ? button(`Compare the first ${Math.min(room, addable.length)}`, () => {
                for (const career of addable.slice(0, room)) {
                  app.toggleCompare(career.id);
                }
                draw();
              })
            : null,
          canCompare(selected)
            ? link(`Open the comparison (${selected.length})`,
                   `#${routeFor(selected)}`, { class: "btn btn-primary" })
            : null,
          selected.length
            ? button("Clear comparison", () => { app.clearCompare(); draw(); },
                     { variant: "quiet" })
            : null,
        ]),
        h("div", { class: "grid grid-3" }, careers.map((career) =>
          careerCard(career, {
            match: app.hasProfile() ? app.matchFor(career) : null,
            fit: scoredFit(app, career),
            effort: efforts.get(career.id) || null,
            saved: true,
            comparing: app.isComparing(career.id),
            onCompare: (id) => { app.toggleCompare(id); draw(); },
            onSave: () => {
              app.toggleSaved(career.id);
              notice(`${career.title} removed from your saved careers.`, "info");
              app.navigate("/saved");
            },
            extra: link("Build pathway", `#/pathway/${career.id}`,
                        { class: "btn btn-quiet" }),
          }))),
      ], { id: "saved-heading" }),
    );
  };

  draw();

  if (app.hasProfile()) {
    for (const career of careers) {
      efforts.set(career.id, await app.effortFor(career.id));
    }
    draw();
  }

  return host;
}
