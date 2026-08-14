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

import { h, panel, button, link, empty, datasetLabel } from "../ui.js";
import { MILESTONE_STATUS } from "../pathway-engine.js";
import { developmentHorizon } from "../action-engine.js";
import { describeProfile } from "../profile.js";
import { groupResults } from "../matcher.js";
import * as market from "../market-data.js";
import { lowerLabel } from "../ontology.js";

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
  const { match, gaps, pathway, actions, pack, effort, fit } = analysis;
  const profile = app.profile();
  const horizon = developmentHorizon(actions, gaps);
  const alternatives = groupResults(app.ranked()).adjacent.items
    .filter((item) => item.careerId !== careerId)
    .slice(0, 4);
  const generated = new Date().toLocaleDateString("en-GB",
    { day: "numeric", month: "long", year: "numeric" });

  const pay = market.salary(careerId);
  const work = market.workLife(careerId);

  // The careers on the comparison shortlist, minus the one this plan is for.
  // Included because somebody printing a plan has usually just been comparing,
  // and the options they set aside are part of the decision they made.
  const considered = app.compareIds()
    .filter((id) => id !== careerId)
    .map((id) => app.catalogue.get(id))
    .filter(Boolean);

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
          + "contain your CV, your name or any contact details — Helix does "
          + "not hold them." }),
      ], { id: "plan-heading" }),
    ]),

    h("article", { class: "plan" }, [
      h("header", { class: "plan-head" }, [
        h("h1", { text: "My Career Pathway Plan" }),
        h("p", { class: "plan-meta", text: `Generated ${generated} · Helix Career Pathway Planner `
          + `· dataset ${datasetLabel(app.catalogue.meta)}` }),
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
        career.derived.regulated
          ? h("p", {}, [h("strong", { text: "Professional registration applies. " }),
              `Recorded as ${career.regulatory_status}`
              + `${career.regulator_or_body ? ` with `
                 + `${career.regulator_or_body}` : ""}. Confirm current `
              + `eligibility with the official regulator.`])
          : null,

        /*
         * The three measures, printed as three separate lines with their own
         * words. On paper more than anywhere else the temptation is to compress
         * them into one verdict, and on paper is where a compressed verdict does
         * the most damage: this document outlives the screen it came from.
         */
        h("h3", { text: "How this career sits with you" }),
        h("ul", {}, [
          h("li", { text: `Background alignment: ${match.label}. How much of this `
            + `career's subject matter your profile already covers.` }),
          fit && fit.scored
            ? h("li", { text: `Preference fit: ${fit.label}. Judged on the `
                + `${fit.dimensions.length} of your stated priorities that could `
                + `be compared with this career.` })
            : h("li", { text: "Preference fit: not assessed. No career priorities "
                + "were stated, or none could be compared with this career." }),
          effort
            ? h("li", { text: `Transition effort: ${effort.label}. `
                + `${effort.summary}` })
            : null,
        ]),
        h("p", { text: "These are three separate measures and none of them is a "
          + "prediction about recruitment." }),

        fit && fit.scored && fit.reasons.length
          ? h("div", {}, [
              h("h3", { text: "Why it matches your priorities" }),
              h("ul", {}, fit.reasons.slice(0, 4).map((item) =>
                h("li", { text: item.text }))),
            ])
          : null,
        fit && fit.scored && fit.mismatches.length
          ? h("div", {}, [
              h("h3", { text: "Where it may not" }),
              h("ul", {}, fit.mismatches.slice(0, 3).map((item) =>
                h("li", { text: item.text }))),
            ])
          : null,
        effort && effort.reasons.length
          ? h("div", {}, [
              h("h3", { text: "What makes it that size of move" }),
              h("ul", {}, effort.reasons.map((reason) =>
                h("li", { text: reason }))),
            ])
          : null,
      ]),

      /*
       * Salary carries its evidence class in the same breath as the number. A
       * printed figure outlives its context more than a screen one does, so the
       * label and the checked date travel with it rather than sitting in a
       * footnote.
       */
      planSection("Typical salary and working life", [
        pay
          ? h("div", {}, [
              h("p", {}, [
                h("strong", { text: `${pay.range} a year` }),
                ` (${pay.geography}). Evidence: ${lowerLabel(pay.evidenceLabel)}`
                + ` — ${pay.evidenceExplain}`,
              ]),
              h("p", { text: `Method: ${pay.methodLabel}. Last checked `
                + `${pay.lastVerified}.` }),
              pay.payFramework
                ? h("p", { text: `Public-sector pay context: `
                    + `${pay.payFramework.framework}, ${pay.payFramework.band}. `
                    + `This does not mean everybody with this job title is on `
                    + `that band.` })
                : null,
              h("p", { text: pay.disclaimer }),
            ])
          : h("p", { text: "No salary estimate is published for this career." }),

        h("h3", { text: "Working life" }),
        h("ul", {}, [
          h("li", { text: `Typical weekly hours: `
            + `${work && work.hours ? work.hours : "not yet available"}` }),
          h("li", { text: `Working pattern: ${work && work.patterns.length
            ? work.patterns.join(", ") : "not yet available"}` }),
          h("li", { text: `Patient contact: ${level(work, "patientContact")} · `
            + `Laboratory: ${level(work, "laboratory")} · `
            + `Research: ${level(work, "research")} · `
            + `Commercial: ${level(work, "commercial")}` }),
          h("li", { text: `Remote or hybrid potential: `
            + `${level(work, "remote")} · Travel: ${level(work, "travel")}` }),
        ]),
        work && work.qualitativeNote
          ? h("p", { text: work.qualitativeNote })
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

      /*
       * The shortlist, if there is one. Kept to a line each: the point is to
       * record what was weighed against the target, not to reproduce the whole
       * comparison table in a document somebody has to read on paper.
       */
      considered.length
        ? planSection("Other options considered", [
            h("p", { text: "These careers were on your comparison shortlist when "
              + "this plan was generated." }),
            h("ul", {}, considered.map((option) => {
              const optionPay = market.salary(option.id);
              const optionMatch = app.matchFor(option);
              return h("li", { text: `${option.title} (${option.family})`
                + (optionPay ? ` — ${optionPay.range}, `
                    + `${lowerLabel(optionPay.evidenceLabel)}` : "")
                + (optionMatch ? `; ${lowerLabel(optionMatch.label)}` : "") });
            })),
          ])
        : null,

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
        // Salary provenance is listed separately from the career and regulation
        // sources: one being well evidenced says nothing about the other.
        pay
          ? h("div", {}, [
              h("h3", { text: "Salary source" }),
              h("ul", {}, pay.sources.length
                ? pay.sources.map((source) => h("li", {}, [
                    h("span", { text: `${source.provider}` }),
                    source.source_url
                      ? h("span", { class: "url", text: ` ${source.source_url}` })
                      : null,
                    source.license
                      ? h("span", { text: ` (${source.license})` }) : null,
                  ]))
                : [h("li", { text: pay.notes.join(" ")
                    || "Derived estimate; see the methodology." })]),
              h("p", { text: `Salary evidence: ${pay.evidenceLabel}. Method: `
                + `${pay.methodLabel}. Last checked ${pay.lastVerified}.` }),
            ])
          : null,
        pack
          ? h("p", { text: pack.requirementsVerified
              ? `Researched rule pack version ${pack.ruleVersion}, verified `
                + `${pack.verifiedDate}.`
              : `A structural rule pack exists for this career, but its `
                + `requirements are not yet verified.` })
          : h("p", { text: "Helix has not yet verified a full role-specific "
              + "requirements pack for this career. Use the official sources "
              + "above to confirm current entry and registration requirements." }),
      ]),

      h("footer", { class: "plan-foot" }, [
        h("p", { text: "Helix Career Pathway Planner provides career-development "
          + "guidance and decision support. It does not determine professional "
          + "eligibility, "
          + "guarantee employment or replace advice from regulators, professional "
          + "bodies, employers or training providers. Always confirm current "
          + "mandatory requirements with the relevant official organisation." }),
        h("p", { text: "Salary figures are estimates for career comparison and "
          + "can vary substantially by employer, sector, location, experience, "
          + "hours and working pattern. Where a broader occupation or "
          + "related-career estimate is used rather than a range published for "
          + "this specific job, it is labelled above. Contains public sector "
          + "information licensed under the Open Government Licence v3.0." }),
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

/** A working-life level, or an honest blank. Never a guess. */
function level(work, key) {
  const value = work && work[key];
  return value && value !== "unknown" ? value : "not yet available";
}

function describeFit(fit) {
  if (fit >= 0.85) return "strong";
  if (fit >= 0.6) return "good";
  return "partial";
}
