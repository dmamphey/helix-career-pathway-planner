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
import { describeProfile } from "../profile.js";
import { groupResults } from "../matcher.js";
import * as market from "../market-data.js";
import * as labour from "../labour-market.js";
import { salaryDelta } from "../baseline.js";
import { lowerLabel } from "../ontology.js";
import { trackHelixEvent, trackHelixEventOnce, EVENTS }
  from "../analytics.js";

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
  const { match, gaps, pathway, actions, pack, effort, fit, bridge,
          timeline } = analysis;
  const profile = app.profile();
  /*
   * Alternatives for the printed plan.
   *
   * The stated direction leads where one exists, for the same reason it leads on
   * screen: a plan that lists four easy-to-reach careers for somebody who has
   * said they want to move is offering alternatives to the wrong question.
   */
  const grouped = groupResults(app.ranked(), { profile: app.profile() });
  const alternatives = [...(grouped.direction ? grouped.direction.items : []),
                        ...grouped.adjacent.items]
    .filter((item) => item.careerId !== careerId)
    .filter((item, index, all) =>
      all.findIndex((other) => other.careerId === item.careerId) === index)
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

  const planDocument = h("div", { class: "stack" }, [
    h("div", { class: "no-print" }, [
      panel("Your career plan", [
        h("p", { text: "Everything below prints as “My Career Pathway Plan”. Use "
          + "your browser's print dialogue and choose Save as PDF." }),
        h("div", { class: "card-actions" }, [
          button("Print or save as PDF", () => exportPlan(), { variant: "primary" }),
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

      // The baseline, when one was pinned. It is the thing every comparison on
      // screen was measured against, so a plan that omitted it would be a
      // record of conclusions without their reference point.
      baselineSection(app, career),

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
        h("ol", { class: "plan-actions" }, actions.map((action) => h("li", {}, [
          h("strong", { text: `${action.title}. ` }),
          h("span", { text: action.detail }),
          /*
           * The printed version carries the timeframe and the completion
           * criteria but not the full activity list. A printed plan is read
           * away from the screen and has to stay skimmable — what is missing
           * here is one click away, and what is here is what somebody needs to
           * know they are done.
           */
          h("p", { class: "plan-action-meta", text:
            `${action.timeframe || ""}`
            + (action.completionCriteria
                ? ` · Complete when: ${action.completionCriteria}` : "") }),
          action.relatedBridge
            ? h("p", { class: "plan-action-meta", text:
                `Bridge role that covers this: ${action.relatedBridge.title}.` })
            : null,
        ]))),
      ]),

      /*
       * Bridge roles. Printed with the sentence that says they are optional,
       * every time — a plan that survives on paper for a year must not lose the
       * caveat that made it honest on screen.
       */
      bridge && bridge.hasBridge
        ? planSection("Possible bridge roles", [
            h("ul", {}, bridge.bridges.map((item) => h("li", {}, [
              h("strong", { text: `${item.career.title}. ` }),
              h("span", { text: item.whyItHelps }),
              item.gradeNote
                ? h("p", { class: "plan-action-meta", text: item.gradeNote })
                : null,
            ]))),
            h("p", { class: "plan-action-meta", text: "None of these is a "
              + "required step. Nothing official says you must do one of these "
              + "jobs first." }),
          ])
        : null,

      // What the market was doing when this was printed, with its age attached
      // — a printed document outlives its data, so the date has to travel with
      // the figure rather than sitting in a footer.
      labourSection(career),

      planSection("Pathway milestones", [
        h("ol", { class: "plan-milestones" }, pathway.nodes.map((node) =>
          h("li", { text: `[${MILESTONE_STATUS[node.status].label}] `
            + `${node.title}` }))),
      ]),

      /*
       * The four horizons, printed as the person left them.
       *
       * Their own dates, notes and completion marks are included, because the
       * document is a record of their plan rather than of Helix's suggestion.
       * An empty horizon prints as empty for the same reason it displays that
       * way: padding it would make the plan look fuller than it is.
       */
      ...timeline.horizons.map((window) => planSection(window.label, [
        window.milestones.length
          ? h("ul", { class: "plan-milestones" }, window.milestones.map((item) =>
              h("li", {}, [
                h("strong", { text: item.status === "completed"
                  ? `[done] ${item.title}` : item.title }),
                item.due ? h("span", { text: ` — target ${item.due}` }) : null,
                item.completionCriteria
                  ? h("p", { class: "plan-action-meta",
                      text: `Complete when: ${item.completionCriteria}` })
                  : null,
                item.note
                  ? h("p", { class: "plan-note", text: `Your note: ${item.note}` })
                  : null,
              ])))
          : h("p", { class: "hint", text: "Nothing falls in this window." }),
      ])),

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

  /*
   * The plan exists. Everything above it can fail — no profile, no career, an
   * analysis that throws — and none of those paths reach this line: the two
   * early returns hand back an empty-state panel instead, and a thrown error is
   * caught by the router and replaced with the error screen.
   *
   * Once per visit, so scrolling and printing do not each count as another
   * plan. Coming back after editing a profile does count again, which is right:
   * the document is rebuilt from the new profile and is a different plan.
   */
  trackHelixEventOnce(EVENTS.CAREER_PLAN_GENERATED);
  return planDocument;
}

/**
 * Hand the plan to the browser's print dialogue.
 *
 * Helix has no PDF library and does not want one, so "export" means opening the
 * print dialogue with a print stylesheet behind it. That bounds what can
 * honestly be measured: the browser will not tell a page whether somebody
 * pressed Save or pressed Cancel, so this reports that the export was
 * successfully started, and never claims a file was produced.
 *
 * `window.print()` can throw — a sandboxed frame, a browser with printing
 * disabled by policy — and in that case nothing was started and nothing is
 * reported.
 */
function exportPlan() {
  try {
    window.print();
  } catch (ignored) {
    return false;
  }
  trackHelixEvent(EVENTS.CAREER_PLAN_EXPORTED);
  return true;
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

/** The baseline career this plan's comparisons were measured against. */
function baselineSection(app, career) {
  const baseline = app.baselineCareer();
  if (!baseline || baseline.id === career.id) return null;
  const basePay = market.salary(baseline.id);
  const targetPay = market.salary(career.id);
  const delta = salaryDelta(basePay, targetPay);
  return planSection("Compared against", [
    h("p", {}, [
      h("strong", { text: baseline.title }),
      ` (${baseline.family}) was pinned as the baseline, so the comparisons `
      + `behind this plan were stated as differences from it.`,
    ]),
    delta
      ? h("p", { text: `Typical salary difference at the midpoint of each `
          + `range: ${delta.label}. ${delta.caveat}` })
      : null,
  ]);
}

/** The hiring climate at the moment of printing, with its age. */
function labourSection(career) {
  const signal = labour.demandFor(career);
  if (!signal) return null;
  return planSection("Labour market context", [
    h("p", { text: `Measured across ${signal.categoryLabel}, not this job `
      + `title. Direction of travel: ${signal.trendLabel.toLowerCase()}. `
      + `Signal strength: ${signal.strengthLabel.toLowerCase()}.` }),
    h("p", { class: "plan-action-meta", text: `${signal.source}, released `
      + `${signal.released}. This is an index of advert volume, not a count of `
      + `vacancies. Check the current position before relying on it.` }),
  ]);
}
