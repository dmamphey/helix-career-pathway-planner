/**
 * The PDF career plan.
 *
 * Produced by the browser's own print-to-PDF rather than a PDF library: it keeps
 * the page self-contained, adds no third-party code to a privacy-first app, and
 * the output is a real, selectable, linked PDF. A print stylesheet in styles.css
 * lays this screen out for A4.
 *
 * What the document must not contain is as important as what it must: no raw CV,
 * no name, no contact details. It is built from the structured profile only, which
 * has nowhere to hold any of those.
 */

import { h, panel, button, link, empty } from "../ui.js";
import { MILESTONE_STATUS } from "../pathway-engine.js";
import { developmentHorizon } from "../action-engine.js";
import { describeProfile } from "../profile.js";
import { groupResults } from "../matcher.js";

export async function render(app, context) {
  const careerId = context.params.id;
  const career = app.catalogue.get(careerId);
  if (!career || !app.hasProfile()) {
    return panel("Career plan", [
      empty("A plan needs both a profile and a target career."),
      h("div", { class: "card-actions" }, [
        link("Build a profile", "#/profile", { class: "btn btn-primary" }),
        link("Browse careers", "#/explore", { class: "btn" }),
      ]),
    ], { id: "plan-empty-heading" });
  }

  const analysis = await app.analysisFor(careerId);
  const { match, gaps, pathway, actions, pack } = analysis;
  const profile = app.profile();
  const horizon = developmentHorizon(actions, gaps);
  const alternatives = groupResults(app.ranked()).adjacent.items
    .filter((item) => item.careerId !== careerId)
    .slice(0, 4);
  const generated = new Date().toLocaleDateString("en-GB",
    { day: "numeric", month: "long", year: "numeric" });

  return h("div", { class: "stack" }, [
    h("div", { class: "no-print" }, [
      panel("Your career plan", [
        h("p", { text: "Everything below prints as “My Career Pathway Plan”. Use "
          + "your browser's print dialogue and choose Save as PDF." }),
        h("div", { class: "card-actions" }, [
          button("Print or save as PDF", () => window.print(),
                 { variant: "primary" }),
          link("Back to the pathway", `#/pathway/${careerId}`, { class: "btn" }),
        ]),
        h("p", { class: "hint", text:
          "The document contains your structured career profile only. It does not "
          + "contain your CV, your name or any contact details — CareerPath does "
          + "not hold them." }),
      ], { id: "plan-heading" }),
    ]),

    h("article", { class: "plan" }, [
      h("header", { class: "plan-head" }, [
        h("h1", { text: "My Career Pathway Plan" }),
        h("p", { class: "plan-meta", text: `Generated ${generated} · CareerPath `
          + `· dataset v${app.catalogue.meta.version}` }),
      ]),

      planSection("Current career position", [
        h("p", { text: describeProfile(profile) }),
        profile.currentCareerFamily
          ? h("p", { text: `Career family: ${profile.currentCareerFamily}` })
          : null,
        profile.sectors.length
          ? h("p", { text: `Sector exposure: ${profile.sectors.join(", ")}` })
          : null,
        profile.registrations.length
          ? h("p", { text: "Registration recorded: "
              + profile.registrations.map((r) =>
                  `${r.body} (${r.status})`).join(", ") })
          : null,
      ]),

      planSection("Target career", [
        h("p", {}, [h("strong", { text: career.title }), ` — ${career.family}`]),
        h("p", { text: `Alignment from your profile: ${match.label}. This is a `
          + `development alignment indicator, not a prediction about `
          + `recruitment.` }),
        career.derived.regulated
          ? h("p", {}, [h("strong", { text: "Professional registration applies. " }),
              `Recorded as ${career.regulatory_status}`
              + `${career.regulator_or_body ? ` with `
                 + `${career.regulator_or_body}` : ""}. Confirm current `
              + `eligibility with the official regulator.`])
          : null,
      ]),

      planSection("Why this pathway may align", [
        h("ul", {}, match.components
          .filter((component) => component.fit >= 0.5)
          .map((component) => h("li", { text: `${component.label}: `
            + `${describeFit(component.fit)}`
            + (component.evidence.length
              ? ` (${component.evidence.join(", ")})` : "") }))),
      ]),

      planSection("Strengths already identified", [
        gaps.transitions.transferable.length
          ? h("ul", {}, gaps.transitions.transferable.map((item) =>
              h("li", { text: item.label })))
          : h("p", { text: "None identified for this career yet." }),
      ]),

      planSection("Transferable skills that may need translating", [
        gaps.transitions.translation.length
          ? h("ul", {}, gaps.transitions.translation.map((item) =>
              h("li", { text: item.label })))
          : h("p", { text: "None identified." }),
      ]),

      planSection("Requirements to confirm officially", [
        gaps.requiresOfficialConfirmation
          ? h("ul", {}, (gaps.byCategory.get("needs_confirmation") || [])
              .map((item) => h("li", {}, [
                h("strong", { text: `${item.title}. ` }),
                h("span", { text: item.detail }),
              ])))
          : h("p", { text: "No registration or approved-route requirement is "
              + "recorded for this career in the dataset." }),
        gaps.verifiedRequirements.length
          ? h("div", {}, [
              h("h3", { text: "Verified requirements" }),
              h("ul", {}, gaps.verifiedRequirements.map((item) =>
                h("li", { text: `${item.title} — ${item.detail}` }))),
            ])
          : null,
      ]),

      planSection("Development gaps", [
        gaps.transitions.development.length
          ? h("ul", {}, gaps.transitions.development.map((item) =>
              h("li", { text: `${item.label} — not identified in your current `
                + `profile` })))
          : h("p", { text: "No significant development gaps identified." }),
      ]),

      planSection("Your next 3 actions", [
        h("ol", {}, actions.map((action) => h("li", {}, [
          h("strong", { text: `${action.title}. ` }),
          h("span", { text: action.detail }),
        ]))),
      ]),

      planSection("Pathway milestones", [
        h("ol", { class: "plan-milestones" }, pathway.nodes.map((node) =>
          h("li", { text: `[${MILESTONE_STATUS[node.status].label}] `
            + `${node.title}` }))),
      ]),

      planSection("Next three months", [
        h("ul", {}, horizon.threeMonth.map((item) => h("li", { text: item }))),
      ]),

      planSection("Six to twelve months", [
        h("ul", {}, horizon.sixToTwelveMonth.map((item) =>
          h("li", { text: item }))),
      ]),

      planSection("Alternative careers worth exploring", [
        alternatives.length
          ? h("ul", {}, alternatives.map((item) => h("li", {
              text: `${item.career.title} (${item.career.family}) — `
                + `${item.label}` })))
          : h("p", { text: "None identified." }),
      ]),

      planSection("Official sources", [
        h("ul", {}, app.sourcesFor(career).map((source) => h("li", {}, [
          h("span", { text: `${source.name}: ` }),
          h("span", { class: "url", text: source.url }),
        ]))),
        h("p", { text: `Dataset entry last verified ${career.last_verified}.` }),
        pack
          ? h("p", { text: pack.requirementsVerified
              ? `Researched rule pack version ${pack.ruleVersion}, verified `
                + `${pack.verifiedDate}.`
              : `A structural rule pack exists for this career, but its `
                + `requirements are not yet verified.` })
          : h("p", { text: "CareerPath has not yet verified a full role-specific "
              + "requirements pack for this career. Use the official sources "
              + "above to confirm current entry and registration requirements." }),
      ]),

      h("footer", { class: "plan-foot" }, [
        h("p", { text: "CareerPath provides career-development guidance and "
          + "decision support. It does not determine professional eligibility, "
          + "guarantee employment or replace advice from regulators, professional "
          + "bodies, employers or training providers. Always confirm current "
          + "mandatory requirements with the relevant official organisation." }),
      ]),
    ]),
  ]);
}

function planSection(title, children) {
  return h("section", { class: "plan-section" }, [
    h("h2", { text: title }),
    ...children.filter(Boolean),
  ]);
}

function describeFit(fit) {
  if (fit >= 0.85) return "strong";
  if (fit >= 0.6) return "good";
  return "partial";
}
