/**
 * The career detail screen: a decision dossier for one career.
 *
 * Every one of the 716 careers reaches this screen, and what it shows depends
 * entirely on how much is actually known. The decision header carries the facts
 * somebody weighs a career on — pay, hours, working pattern, regulation, and the
 * three personal measures when a profile exists — and everything below it exists
 * to let those facts be interrogated rather than merely read.
 *
 * Two things are deliberately absent. The career id is an internal key and is no
 * longer shown as a badge; content depth describes how much guidance Helix has
 * written, not anything about the career, so it is stated once in the sources
 * section instead of sitting among the decision facts. Both were being read as
 * though they said something about the job.
 *
 * Where something is unknown the screen says so. "Not yet available" is a better
 * answer than a plausible number, and a description of the career family is
 * labelled as exactly that rather than passed off as a description of the role.
 */

import {
  h, panel, button, link, careerCard, alignmentBadge, regulationBadge,
  evidenceBadge, effortBadge, fitBadge, compareToggle, sourceList, statusPill,
  dialog, empty, scoredFit,
} from "../ui.js";
import * as market from "../market-data.js";
import { money } from "../market-data.js";
import { adjacentCareers } from "../adjacency.js";
import { loadRulePack } from "../rules.js";
import { developmentIndicators } from "../matcher.js";
import { lowerLabel } from "../ontology.js";
import { REGIONS, regionLabel, isUk } from "../regions.js";

export async function render(app, context) {
  const career = app.catalogue.get(context.params.id);
  if (!career) {
    return panel("Career not found", [
      empty(`No career in this dataset has the id "${context.params.id}".`),
      h("div", { class: "card-actions" }, [
        link("Browse all careers", "#/explore", { class: "btn btn-primary" }),
      ]),
    ], { id: "missing-career-heading" });
  }

  const pack = await loadRulePack(career.id);
  const analysis = app.hasProfile() ? await app.analysisFor(career.id) : null;
  const match = analysis ? analysis.match : null;
  const pay = market.salary(career.id);
  const work = market.workLife(career.id);
  const role = market.role(career.id);

  const host = h("div", { class: "stack" });
  const redraw = () => host.replaceChildren(
    header(app, career, { match, analysis, pay, work, redraw }),
    regulationCard(career, app),
    aboutCard(career, role),
    economicsCard(career, pay, work, app, redraw),
    entryCard(career, pack, analysis),
    analysis ? fitCard(app, career, analysis) : noProfileCard(app),
    progressionCard(app, career, pack, role, redraw),
    similarCard(app, career, pack, redraw),
    evidenceCard(app, career, pay, work, role, pack),
  );
  redraw();
  return host;
}

/* ------------------------------------------------------------------- header */

/**
 * The decision summary.
 *
 * Salary leads because it is the fact people come for, and the evidence class
 * travels with it so a family median is never read as a published range. The
 * three personal measures sit together, deliberately, as three separate badges:
 * seeing "Good alignment", "Low fit" and "Major retraining route" side by side is
 * the point, and a single blended score would have hidden all three.
 */
function header(app, career, { match, analysis, pay, work, redraw }) {
  const saved = app.isSaved(career.id);
  const savedButton = button(saved ? "Saved ✓" : "Save career", () => {
    app.toggleSaved(career.id);
    redraw();
  }, { variant: "quiet", pressed: saved });

  const fit = analysis && analysis.fit && analysis.fit.scored ? analysis.fit : null;

  return h("section", { class: "panel career-header" }, [
    h("p", { class: "eyebrow", text: career.family }),
    h("h1", { text: career.title }),

    h("dl", { class: "decision-facts" }, [
      h("div", { class: "decision-fact" }, [
        h("dt", { text: "Typical salary" }),
        h("dd", {}, pay
          ? [h("strong", { text: pay.range }),
             h("span", { class: "hint", text: ` a year · ${pay.geography}` }),
             h("br"), evidenceBadge(pay)]
          : [h("span", { class: "hint", text: "Not yet available" })]),
      ]),
      h("div", { class: "decision-fact" }, [
        h("dt", { text: "Typical hours" }),
        h("dd", { text: work && work.hours ? work.hours : "Not yet available" }),
      ]),
      h("div", { class: "decision-fact" }, [
        h("dt", { text: "Working pattern" }),
        h("dd", { text: work && work.patterns.length
          ? sentenceCase(work.patterns.join(", "))
          : "Not yet available" }),
      ]),
      h("div", { class: "decision-fact" }, [
        h("dt", { text: "Main settings" }),
        h("dd", { text: work && work.settings.length
          ? work.settings.join(", ")
          : "Not yet available" }),
      ]),
    ]),

    h("div", { class: "badges" }, [
      match ? alignmentBadge(match) : null,
      fit ? fitBadge(fit) : null,
      analysis && analysis.effort ? effortBadge(analysis.effort) : null,
      regulationBadge(career),
    ]),

    h("div", { class: "card-actions" }, [
      link("Build my pathway", `#/pathway/${career.id}`,
           { class: "btn btn-primary" }),
      compareToggle(career, {
        comparing: app.isComparing(career.id),
        onCompare: (id) => { app.toggleCompare(id); redraw(); },
      }),
      savedButton,
      link("Back to explorer", "#/explore", { class: "btn btn-quiet" }),
    ]),

    match
      ? h("p", { class: "hint", text: "Background alignment, preference fit and "
          + "transition effort are three separate measures. None of them is a "
          + "prediction about recruitment." })
      : null,
  ]);
}

/** The regulation information card, shown whenever regulation is recorded. */
function regulationCard(career, app) {
  if (!career.derived.regulated) return null;
  const body = career.regulator_or_body;
  const source = body ? app.catalogue.sources[body] : null;
  return h("div", { class: "callout callout-warn" }, [
    h("h2", { class: "callout-title", text: "Professional registration applies" }),
    h("p", { text:
      "This career is associated with a regulated profession or protected title. "
      + "Helix can help you understand the pathway, but current eligibility "
      + "must be confirmed with the official regulator." }),
    h("dl", { class: "summary" }, [
      h("dt", { text: "Recorded status" }),
      h("dd", { text: career.regulatory_status }),
      ...(body ? [h("dt", { text: "Body" }), h("dd", {}, [
        source ? link(source.name, source.url, { external: true })
               : h("span", { text: body }),
      ])] : []),
    ]),
  ]);
}

/**
 * What the career involves.
 *
 * Every career gets a description of its own, and the screen always says which
 * of two kinds it is reading.
 *
 * An authoritative summary — 143 careers have a matched official job profile —
 * is the publisher's own words, and is attributed to them. Otherwise the
 * pipeline composes a description from that career's recorded attributes, and
 * the note beneath it says so. The composed text arrives in its own field, so
 * the attribution line above cannot reach it however this function is edited.
 *
 * The family paragraph used to stand in for a missing description. It was
 * honest but useless — fifty careers in a family shared one paragraph, so it
 * could not tell any of them apart. It is now folded underneath, where it reads
 * as context rather than as the answer to what this job is.
 */
function aboutCard(career, role) {
  const authoritative = role && role.summary;
  return panel("What this career involves", [
    authoritative
      ? h("div", {}, [
          h("p", { text: role.summary }),
          h("p", { class: "hint" }, [
            "Role summary from ",
            ...(role.sources.length && role.sources[0].source_url
              ? [link(role.sources[0].provider, role.sources[0].source_url,
                      { external: true })]
              : [h("span", { text: (role.sources[0] || {}).provider
                    || "an official careers source" })]),
            ", used under the Open Government Licence v3.0.",
          ]),
        ])
      /*
       * A composed description, clearly marked as one.
       *
       * It used to show the career family's paragraph — the same words across
       * fifty careers — which answered "what is this area of work" rather than
       * "what is this job". The composed text is assembled from this career's
       * own recorded attributes, so it is at least about the right career, and
       * the note below says plainly where it came from. The family paragraph
       * follows as context rather than as the answer.
       */
      : h("div", {}, [
          h("p", { text: role && role.composedSummary
            ? role.composedSummary : career.derived.familyAbout }),
          h("p", { class: "hint", text: (role && role.summaryNote)
            || "No organisation has published a profile for this exact job "
               + "title, so this is composed from what Helix records about the "
               + "career rather than quoted from a source." }),
          role && role.composedSummary
            ? h("details", { class: "family-context" }, [
                h("summary", { text: `About ${career.family}` }),
                h("p", { text: career.derived.familyAbout }),
              ])
            : null,
        ]),

    role && role.alternativeTitles.length
      ? h("div", {}, [
          h("h3", { text: "Also advertised as" }),
          h("ul", { class: "chips" }, role.alternativeTitles.map((title) =>
            h("li", {}, [h("span", { class: "chip", text: title })]))),
        ])
      : null,

    /*
     * Further reading, as links rather than quotations.
     *
     * NHS England reserves all rights in the Health Careers profiles and limits
     * use to personal viewing, so Helix sends people there instead of copying
     * anything across. Its terms also forbid framing, hence target="_blank" —
     * the page has to load in the reader's whole window.
     */
    role && role.externalProfiles.length
      ? h("div", { class: "further-reading" }, [
          h("h3", { text: "Read more about this role" }),
          h("ul", { class: "plain" }, role.externalProfiles.map((entry) =>
            h("li", {}, [
              link(`${entry.provider} publishes a profile for this role`,
                   entry.source_url, { external: true }),
            ]))),
          h("p", { class: "hint", text: "Published by the organisation named, on "
            + "its own website. Helix links to it rather than reproducing it, so "
            + "you are reading their current wording rather than a copy." }),
        ])
      : null,

    h("h3", { text: "Typical background signals" }),
    h("p", { text: career.typical_entry_signal }),
    h("p", { class: "hint", text:
      "Indicative context for the family, not a rule and not a checklist." }),
    h("h3", { text: "Tags" }),
    h("ul", { class: "chips" }, (career.core_tags || []).map((tag) =>
      h("li", {}, [h("span", { class: "chip", text: tag })]))),
  ], { id: "about-heading" });
}

/* ---------------------------------------------------------- salary by region */

/**
 * How pay for this kind of work varies across the UK.
 *
 * Deliberately framed as *variation* rather than as a set of local salaries. The
 * level comes from the career's own evidence; only the regional shape comes from
 * ONS, so the honest claim is "health professionals in London earn about 13% more
 * than health professionals nationally", not "this job pays £X in London".
 *
 * Three things this must never do: offer a region ONS suppressed, show the UK
 * figure under a regional heading, or carry the UK figure's evidence class. All
 * three are handled in `market.salaryForRegion`, and the interface below simply
 * renders whichever answer it gets — including the refusal.
 */
function regionalBlock(app, career, pay, redraw) {
  if (!pay) return null;
  const context = market.regionalContext();
  if (!context) return null;
  const available = new Set(market.regionsWithData(career.id));
  if (!available.size) {
    return h("div", { class: "region-block" }, [
      h("h3", { text: "Salary by region" }),
      h("p", { class: "hint", text: "Helix has no regional breakdown for this "
        + "career's occupation group, so it does not estimate one. The figure "
        + "above is UK-wide." }),
    ]);
  }

  const selected = app.region();
  const regional = market.salaryForRegion(career.id, selected);

  const select = h("select", {
    id: "region-select", class: "region-select",
    onChange: (event) => { app.setRegion(event.target.value); redraw(); },
  }, REGIONS.filter((entry) => entry.key === "uk" || available.has(entry.key))
      .map((entry) => h("option", {
        value: entry.key, text: entry.label,
        selected: entry.key === selected ? "selected" : null,
      })));

  return h("div", { class: "region-block" }, [
    h("h3", { text: "Salary by region" }),
    h("div", { class: "region-picker" }, [
      h("label", { for: "region-select", text: "Show pay for" }),
      select,
    ]),

    isUk(selected)
      ? h("p", { class: "hint", text: "Showing the UK-wide figure. Choose a "
          + "region to see how pay for this kind of work varies." })
      : regionBody(regional, pay, context),

    h("p", { class: "hint" }, [
      `Regional variation from ${context.source} (${context.year}), `,
      context.source_url
        ? link("published data", context.source_url, { external: true })
        : h("span", { text: "published data" }),
      `, used under the ${context.licence}.`,
    ]),
  ]);
}

function regionBody(regional, pay, context) {
  if (!regional) return null;
  if (regional.unavailable) {
    return h("p", { class: "hint", text: regional.reason });
  }
  const higher = regional.differencePercent > 0;
  const same = Math.abs(regional.differencePercent) < 0.5;
  return h("div", { class: "stack" }, [
    h("p", { class: "pay-line" }, [
      h("strong", { class: "pay-headline", text: regional.range }),
      h("span", { class: "hint",
        text: ` a year · ${regionLabel(regional.region)}` }),
      evidenceBadge(regional),
    ]),
    h("p", { class: "region-delta" }, [
      same
        ? h("span", { text: "About the same as the UK figure for this kind of "
            + "work." })
        : h("span", {}, [
            h("strong", { text: `${higher ? "+" : ""}`
              + `${regional.differencePercent}%` }),
            ` against the UK figure. In ${regionLabel(regional.region)}, `
            + `${regional.occupationGroup.toLowerCase()} are paid `
            + `${higher ? "more" : "less"} than the same group nationally.`,
          ]),
    ]),
    h("p", { class: "hint", text: "Helix applies that regional difference to "
      + `this career's own UK range of ${pay.range}. No source publishes a `
      + "salary for this job in this region, which is why the estimate can "
      + "never be better evidenced than indicative however well evidenced the "
      + "UK figure is." }),
  ]);
}

/* ---------------------------------------------------------- salary by sector */

/**
 * What Helix can and cannot say about sector pay.
 *
 * This block is mostly an admission, and that is the point. The question "does
 * industry pay more than the NHS for this job?" is the one people most want
 * answered, and the honest answer today is that no official source publishes
 * earnings by occupation *and* sector. ASHE splits by sector or by occupation,
 * never both.
 *
 * So there are exactly two things to show: the pay framework somebody curated for
 * this career, where one exists, and the whole-economy public/private difference,
 * labelled unmistakably as whole-economy. Inventing a "pharma premium" from the
 * industry table would mean multiplying this career's range by the average pay of
 * everyone working in pharmaceutical manufacturing, cleaners and directors
 * included, and calling the result a scientist's salary.
 */
function sectorBlock(career, pay) {
  const context = market.sectorContext();
  if (!pay) return null;

  const medians = (context && context.medians) || {};
  const publicUk = (medians["public sector"] || {}).uk;
  const privateUk = (medians["private sector"] || {}).uk;
  const gap = (Number.isFinite(publicUk) && Number.isFinite(privateUk))
    ? Math.round(((publicUk / privateUk) - 1) * 1000) / 10 : null;

  return h("div", { class: "region-block" }, [
    h("h3", { text: "Salary by sector" }),
    h("p", { text: "Helix does not publish a sector-by-sector salary for this "
      + "career, because no official source publishes earnings broken down by "
      + "occupation and sector at the same time. What follows is context, not a "
      + "figure for this job." }),

    pay.payFramework
      ? h("p", {}, [
          h("strong", { text: "Public sector: " }),
          `${pay.payFramework.framework}, ${pay.payFramework.band}. `,
          "That is the framework a public-sector employer would use for this "
          + "role. It is a curated mapping, not an inference from the job title.",
        ])
      : h("p", { class: "hint", text: "No public-sector pay band has been curated "
          + "for this career. Helix will not infer one from a job title, because "
          + "words like Senior and Specialist mean different things in different "
          + "organisations." }),

    gap !== null
      ? h("p", { class: "hint", text: "Across the whole UK economy, median "
          + `full-time pay in the public sector was ${gap > 0 ? gap : Math.abs(gap)}% `
          + `${gap > 0 ? "higher" : "lower"} than in the private sector in `
          + `${context.year} (${money(publicUk)} against ${money(privateUk)}). `
          + "That covers every occupation in the country, not this one — sector "
          + "differences vary enormously by job, and this figure should not be "
          + "applied to the range above." })
      : null,
  ]);
}

/* -------------------------------------------------------- salary and hours */

/**
 * Salary and working life, with the provenance one click away.
 *
 * The drill-down is a dialog rather than a hover tooltip: provenance that only
 * appears under a mouse pointer is provenance that a phone and a keyboard cannot
 * reach, and this is the part of the screen most worth checking.
 */
function economicsCard(career, pay, work, app, redraw) {
  const level = (value) => value && value !== "unknown"
    ? sentenceCase(value) : "Not yet available";

  return panel("Salary and working life", [
    pay
      ? h("div", { class: "stack" }, [
          h("p", { class: "pay-line" }, [
            h("strong", { class: "pay-headline", text: pay.range }),
            h("span", { class: "hint", text: ` a year · ${pay.geography}` }),
            evidenceBadge(pay),
          ]),
          /*
           * Say which end is which. A published career range spans entry to
           * experienced, and without labels its top end gets read as the
           * ceiling of a single pay grade — which is how a biomedical
           * scientist's £53k comes to look wrong against an NHS Band 5.
           */
          pay.spansCareer
            ? h("p", { class: "pay-ends" }, [
                h("span", {}, [h("strong", { text: money(pay.starter) }),
                               " starting out"]),
                h("span", { class: "pay-ends-sep", "aria-hidden": "true",
                            text: "→" }),
                h("span", {}, [h("strong", { text: money(pay.experienced) }),
                               " when experienced"]),
              ])
            : null,
          pay.spansCareer
            ? h("p", { class: "hint", text: "That is the span of a whole career, "
                + "from a starting salary to an experienced one. It is not the "
                + "range of a single pay grade, and the upper figure usually "
                + "reflects progression into more senior posts." })
            : null,
          h("p", { class: "hint", text: `${pay.methodLabel}. Last checked `
            + `${pay.lastVerified}.`
            + (pay.stale ? " This record is past its review date." : "") }),
          h("div", { class: "card-actions" }, [
            button("About this salary", () => salaryDialog(career, pay),
                   { variant: "quiet" }),
          ]),
          pay.payFramework
            ? h("div", { class: "callout callout-info" }, [
                h("h3", { class: "callout-title",
                          text: "Public-sector pay context" }),
                h("p", { text: `${pay.payFramework.framework}: `
                  + `${pay.payFramework.band}. This is the pay framework a `
                  + `public-sector employer would use. It does not mean everybody `
                  + `with this job title is on that band.` }),
              ])
            : null,
          h("p", { class: "hint", text: pay.disclaimer }),
        ])
      : empty("No salary record exists for this career."),

    regionalBlock(app, career, pay, redraw),
    sectorBlock(career, pay),

    h("h3", { text: "Working life" }),
    h("dl", { class: "summary" }, [
      h("dt", { text: "Typical weekly hours" }),
      h("dd", { text: work && work.hours ? work.hours : "Not yet available" }),
      h("dt", { text: "Work patterns" }),
      h("dd", { text: work && work.patterns.length
        ? sentenceCase(work.patterns.join(", ")) : "Not yet available" }),
      h("dt", { text: "Work settings" }),
      h("dd", { text: work && work.settings.length
        ? work.settings.join(", ") : "Not yet available" }),
      h("dt", { text: "Patient contact" }),
      h("dd", { text: level(work && work.patientContact) }),
      h("dt", { text: "Laboratory intensity" }),
      h("dd", { text: level(work && work.laboratory) }),
      h("dt", { text: "Research intensity" }),
      h("dd", { text: level(work && work.research) }),
      h("dt", { text: "Commercial intensity" }),
      h("dd", { text: level(work && work.commercial) }),
      h("dt", { text: "Remote or hybrid potential" }),
      h("dd", { text: level(work && work.remote) }),
      h("dt", { text: "Travel" }),
      h("dd", { text: level(work && work.travel) }),
    ]),
    work && work.qualitativeNote
      ? h("p", { class: "hint", text: work.qualitativeNote })
      : null,
    work && work.sourced
      ? h("p", { class: "hint", text: "Hours and work patterns come from an "
          + "official job profile for this career." })
      : h("p", { class: "hint", text: "No official job profile records hours or "
          + "work patterns for this career yet." }),
  ], { id: "economics-heading" });
}

/** The salary provenance disclosure, in the words of §40. */
function salaryDialog(career, pay) {
  dialog(`About the salary for ${career.title}`, [
    h("dl", { class: "summary" }, [
      h("dt", { text: "Evidence" }),
      h("dd", { text: `${pay.evidenceLabel} — ${pay.evidenceExplain}` }),
      h("dt", { text: "Method" }),
      h("dd", { text: pay.methodLabel }),
      h("dt", { text: "Geography" }),
      h("dd", { text: pay.geography }),
      h("dt", { text: "Range" }),
      h("dd", { text: `${pay.range} a year` }),
      ...(pay.spansCareer ? [
        h("dt", { text: "What the two ends mean" }),
        h("dd", { text: `${money(pay.starter)} is a starting salary and `
          + `${money(pay.experienced)} an experienced one. The range covers a `
          + `whole career including progression, not one pay grade. Where a role `
          + `sits on a public-sector pay framework, that framework's bands are `
          + `the thing to compare a specific post against.` }),
      ] : []),
      h("dt", { text: "Last checked" }),
      h("dd", { text: pay.lastVerified || "Not recorded" }),
      h("dt", { text: "Next review due" }),
      h("dd", { text: pay.reviewDue || "Not recorded" }),
      ...(pay.sources.length ? [
        h("dt", { text: "Source" }),
        h("dd", {}, pay.sources.map((source) => h("p", {}, [
          source.source_url
            ? link(source.provider, source.source_url, { external: true })
            : h("span", { text: source.provider }),
          source.license ? h("span", { class: "hint",
                                       text: ` · ${source.license}` }) : null,
        ]))),
      ] : []),
      ...(pay.notes.length ? [
        h("dt", { text: "How it was produced" }),
        h("dd", { text: pay.notes.join(" ") }),
      ] : []),
      ...(pay.derivedFrom.length ? [
        h("dt", { text: "Derived from" }),
        h("dd", { text: `${pay.derivedFrom.length} related careers with stronger `
          + `salary evidence.` }),
      ] : []),
    ]),
    h("p", { class: "hint", text: pay.disclaimer }),
  ]);
}

/* ------------------------------------------------------------- entry route */

/**
 * How people enter, with the four kinds of requirement kept apart.
 *
 * Verified, must-be-confirmed, usually expected and optional are four different
 * strengths of claim, and collapsing them into one list is how a career tool ends
 * up telling somebody a preference is a rule.
 */
function entryCard(career, pack, analysis) {
  const gaps = analysis ? analysis.gaps : null;
  const groups = [
    ["Verified requirements", pack && pack.requirementsVerified
      ? pack.required : [],
     "Confirmed against a current official source on the date shown below."],
    ["Usually expected", (pack && pack.usuallyExpected) || [],
     "Commonly expected by employers or training routes. Not a rule."],
    ["Career-enhancing or optional", (pack && pack.optional) || [],
     "Helpful, but not a barrier to entry."],
  ];

  return panel("How people enter this career", [
    career.derived.regulated
      ? h("div", { class: "callout callout-warn" }, [
          h("p", { text: "Entry requirements for this career must be confirmed "
            + `with ${career.regulator_or_body || "the official regulator"}. `
            + "Helix does not assert requirements it has not verified." }),
        ])
      : null,

    ...groups.flatMap(([title, items, hint]) => items.length ? [
      h("h3", { text: title }),
      h("p", { class: "hint", text: hint }),
      h("ul", { class: "req-list" }, items.map((item) => h("li", {}, [
        h("span", { text: item.title }),
        item.detail ? h("span", { class: "hint", text: ` ${item.detail}` }) : null,
      ]))),
    ] : []),

    !pack
      ? h("p", { class: "hint", text: "Helix has not yet researched a "
          + "requirements pack for this career, so it shows the dataset's general "
          + "entry signal above and links to the official sources below rather "
          + "than asserting a rule." })
      : null,

    gaps && gaps.requiresOfficialConfirmation
      ? h("p", { text: "Something here has to be confirmed officially before you "
          + "can plan around it. The pathway screen sets out what to ask." })
      : null,
  ], { id: "entry-heading" });
}

function noProfileCard(app) {
  return panel("Why this may fit you", [
    empty("Build a profile and Helix will show which parts of this career "
        + "your experience already covers, how big the move would be, and how "
        + "well it matches your priorities."),
    h("div", { class: "card-actions" }, [
      link("Upload my CV", "#/upload", { class: "btn btn-primary" }),
      link("Build a profile manually", "#/profile", { class: "btn" }),
    ]),
  ], { id: "fit-heading" });
}

/* ---------------------------------------------------------- fit for the user */

function fitCard(app, career, analysis) {
  const { match, gaps, effort, why, fit } = analysis;
  const indicators = developmentIndicators(match);
  const transitions = gaps.transitions;

  return panel("Why this may fit you", [
    h("p", {}, [
      h("strong", { text: match.label }),
      " — this is a development alignment indicator from your profile, not a "
      + "prediction about recruitment.",
    ]),
    why && why.why ? h("p", { text: why.why }) : null,
    why && why.stretch ? h("p", { text: why.stretch }) : null,

    /* Preference fit, kept in its own block so it reads as a separate answer. */
    fit && fit.scored
      ? h("div", { class: "fit-block" }, [
          h("h3", { text: "Fit with your stated priorities" }),
          h("p", {}, [fitBadge(fit), h("span", { text: ` ${fit.summary}` })]),
          fit.reasons.length
            ? h("div", {}, [
                h("h4", { text: "Why" }),
                h("ul", { class: "plain" }, fit.reasons.slice(0, 4).map((item) =>
                  h("li", { text: item.text }))),
              ])
            : null,
          fit.mismatches.length
            ? h("div", {}, [
                h("h4", { text: "Possible mismatch" }),
                h("ul", { class: "plain" }, fit.mismatches.slice(0, 3)
                  .map((item) => h("li", { text: item.text }))),
              ])
            : null,
          fit.unscored.length
            ? h("p", { class: "hint", text: "Not scored for this career: "
                + fit.unscored.map((item) => `${lowerLabel(item.label)} `
                  + `(${item.why})`).join("; ") + "." })
            : null,
        ])
      : h("div", { class: "fit-block" }, [
          h("h3", { text: "Fit with your stated priorities" }),
          h("p", { class: "hint", text: app.hasPreferences()
            ? "None of the priorities you stated could be compared with what "
              + "Helix knows about this career."
            : "You have not set any career priorities yet. They produce a "
              + "separate preference fit and do not affect your alignment." }),
          h("div", { class: "card-actions" }, [
            link(app.hasPreferences() ? "Review my priorities"
                                      : "Set my priorities",
                 "#/preferences", { class: "btn btn-quiet" }),
          ]),
        ]),

    /* Transition effort, likewise separate. */
    effort
      ? h("div", { class: "fit-block" }, [
          h("h3", { text: "How big a move this would be" }),
          h("p", {}, [effortBadge(effort), h("span", { text: ` ${effort.summary}` })]),
          h("ul", { class: "plain" }, effort.reasons.map((reason) =>
            h("li", { text: reason }))),
          h("p", { class: "hint", text: "Effort describes the distance to cover, "
            + "not your chances of covering it. A high-effort route is a fact "
            + "about the route, not a reason not to take it." }),
        ])
      : null,

    h("h3", { text: "Strengths already demonstrated" }),
    transitions.transferable.length
      ? h("ul", { class: "chips" }, transitions.transferable.map((item) =>
          h("li", {}, [h("span", { class: "chip chip-good", text: item.label })])))
      : empty("None identified in your profile for this career yet."),

    transitions.translation.length
      ? h("div", {}, [
          h("h3", { text: "Strengths that may need translating" }),
          h("p", { class: "hint", text:
            "You appear to hold these, but from a sector that describes them "
            + "differently. That is a wording problem, not a development gap." }),
          h("ul", { class: "chips" }, transitions.translation.map((item) =>
            h("li", {}, [h("span", { class: "chip", text: item.label })]))),
        ])
      : null,

    h("h3", { text: "Likely development areas" }),
    transitions.development.length
      ? h("ul", { class: "chips" }, transitions.development.map((item) =>
          h("li", {}, [h("span", { class: "chip chip-gap", text: item.label })])))
      : empty("Nothing significant identified — check the pathway for detail."),

    h("h3", { text: "Hard requirements" }),
    gaps.verifiedRequirements.length
      ? h("ul", { class: "req-list" }, gaps.verifiedRequirements.map((item) =>
          h("li", {}, [statusPill(item.status), h("span", { text: item.title })])))
      : h("p", { text: gaps.requiresOfficialConfirmation
          ? "A requirement applies here but has to be confirmed with the "
            + "official body — see the pathway for what to ask."
          : "No verified mandatory requirements are recorded for this career." }),

    h("h3", { text: "Development indicators" }),
    h("table", { class: "indicators" }, [
      h("thead", {}, [h("tr", {}, [
        h("th", { text: "Area" }), h("th", { text: "From your profile" })])]),
      h("tbody", {}, indicators
        .filter((indicator) => indicator.relevantToCareer)
        .map((indicator) => h("tr", {}, [
          h("th", { scope: "row", text: indicator.label }),
          h("td", {}, [h("span", { class: `ind ind-${indicator.status}`,
                                   text: indicator.statusLabel })]),
        ]))),
    ]),
    h("p", { class: "hint", text:
      "Profile-based development indicators. “Not identified” means Helix "
      + "did not find it in your profile, not that you lack it." }),

    h("div", { class: "card-actions" }, [
      link("Build my pathway and next actions", `#/pathway/${career.id}`,
           { class: "btn btn-primary" }),
    ]),
  ], { id: "fit-heading" });
}

/* ------------------------------------------------------------- progression */

/**
 * Progression, where each step carries its own salary rather than a percentage.
 *
 * A title's range is not a ladder. Linking to the next career's own record means
 * the figure shown for a senior role is that role's published estimate with its
 * own evidence class, not this role's number multiplied by an invented uplift.
 */
function progressionCard(app, career, pack, role, redraw) {
  const next = adjacentCareers(career, app.catalogue.careers,
                               { mode: "next", limit: 4 });
  const researched = (pack && pack.progression.length ? pack.progression : [])
    .concat(role && role.progression.length ? role.progression : []);

  return panel("Possible progression", [
    researched.length
      ? h("div", {}, [
          h("h3", { text: "From the researched pathway for this career" }),
          h("ol", { class: "plain" }, researched.map((step) =>
            h("li", { text: step }))),
        ])
      : h("p", { class: "hint", text:
          "No researched progression ladder exists for this career yet, so "
          + "Helix shows related careers a step more senior rather than "
          + "inventing job titles." }),
    next.length
      ? h("div", { class: "grid grid-2" }, next.map((item) =>
          careerCard(item.career, cardOptions(app, item.career, redraw))))
      : empty("No clear next-step careers were found in the dataset."),
    h("p", { class: "hint", text: "Each career above carries its own salary "
      + "estimate and its own evidence class. Helix does not assume a percentage "
      + "increase between steps." }),
  ], { id: "progression-heading" });
}

function similarCard(app, career, pack, redraw) {
  const similar = adjacentCareers(career, app.catalogue.careers,
                                  { mode: "similar", limit: 6, pack });
  const pivots = adjacentCareers(career, app.catalogue.careers,
                                 { mode: "pivot", limit: 4 });
  return panel("Similar careers and pivots", [
    h("h3", { text: "Similar careers" }),
    h("div", { class: "grid grid-3" }, similar.map((item) =>
      careerCard(item.career, {
        ...cardOptions(app, item.career, redraw),
        note: item.curated ? "Listed in the researched pack for this career" : null,
      }))),
    h("h3", { text: "Career pivots using similar skills" }),
    h("p", { class: "hint", text: "Different career family, overlapping skills." }),
    h("div", { class: "grid grid-3" }, pivots.map((item) =>
      careerCard(item.career, cardOptions(app, item.career, redraw)))),
  ], { id: "similar-heading" });
}

/** Card options shared by the progression and adjacency lists. */
function cardOptions(app, career, redraw) {
  return {
    match: app.hasProfile() ? app.matchFor(career) : null,
    fit: scoredFit(app, career),
    saved: app.isSaved(career.id),
    comparing: app.isComparing(career.id),
    onCompare: (id) => { app.toggleCompare(id); redraw(); },
    onSave: () => { app.toggleSaved(career.id); redraw(); },
  };
}

/* --------------------------------------------------------------- evidence */

/**
 * Sources and evidence, with the two provenance systems kept apart.
 *
 * A career can have a well-sourced salary and entirely unverified professional
 * requirements, or the reverse. Listing them in one block invites the strength of
 * one to be read as the strength of the other, so they are separate headings with
 * separate dates.
 */
function evidenceCard(app, career, pay, work, role, pack) {
  return panel("Sources and evidence", [
    sourceList(app.sourcesFor(career), career.last_verified,
               { title: "Career and regulation sources" }),

    h("h3", { text: "Salary evidence" }),
    pay
      ? h("dl", { class: "summary" }, [
          h("dt", { text: "Evidence class" }),
          h("dd", { text: `${pay.evidenceLabel} — ${pay.evidenceExplain}` }),
          h("dt", { text: "Method" }),
          h("dd", { text: pay.methodLabel }),
          h("dt", { text: "Last checked" }),
          h("dd", { text: pay.lastVerified || "Not recorded" }),
          ...(pay.sources.length ? [
            h("dt", { text: "Source" }),
            h("dd", {}, pay.sources.map((source) => source.source_url
              ? link(source.provider, source.source_url, { external: true })
              : h("span", { text: source.provider }))),
          ] : []),
        ])
      : h("p", { class: "hint", text: "No salary record." }),

    h("h3", { text: "Requirement verification" }),
    h("p", { text: pack && pack.requirementsVerified
      ? `Requirements for this career were verified on ${pack.verifiedDate}. `
        + `Confirm them with the official body before acting on them.`
      : "Helix has not verified a role-specific requirements pack for this "
        + "career. Use the official sources above to confirm current entry and "
        + "registration requirements." }),

    h("h3", { text: "Role description" }),
    h("p", { text: role && role.summary
      ? "The description on this page comes from an official job profile matched "
        + "to this career, and is attributed to its publisher."
      : "No organisation publishes a job profile for this exact title, so the "
        + "description on this page is composed by Helix from the career's own "
        + "recorded attributes — its grade, family, subject areas, regulatory "
        + "status and working-life profile. Every statement in it traces to a "
        + "recorded field. It is not an official job description, and Helix does "
        + "not write prose about duties or employers it has no source for." }),

    h("p", { class: "hint", text: `Helix content depth for this career: `
      + `${depthWords(career.pathway_depth)}. That describes how much researched `
      + `guidance has been written, not the standing of the career.` }),
    h("p", { class: "hint", text: career.production_note }),
  ], { id: "evidence-heading" });
}

function depthWords(depth) {
  return { Deep: "detailed guidance available",
           Standard: "core guidance available",
           Explorer: "career overview available" }[depth] || String(depth);
}

function sentenceCase(text) {
  const value = String(text || "");
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}
