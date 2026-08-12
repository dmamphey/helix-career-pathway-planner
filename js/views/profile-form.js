/**
 * The profile editor.
 *
 * One implementation, used by both the CV review screen and the manual builder,
 * because §25 of the specification is right that the matching engine must not care
 * where a profile came from — and the same is true of the editing experience. If
 * the two screens had separate forms they would drift.
 */

import { h, button, chip, clear, append } from "../ui.js";
import {
  DOMAINS, QUALIFICATION_LEVELS, REGISTRATION_BODIES, SECTOR_SIGNALS,
  domainLabel, domainGroup,
} from "../ontology.js";
import {
  INTEREST_OPTIONS, PRIORITY_OPTIONS, SIGNAL_KEYS, addSignal, allSignals,
  removeSignal,
} from "../profile.js";

const LEVELS = [...new Set(QUALIFICATION_LEVELS.map((entry) => entry.level))];

/**
 * Build the editor.
 *
 * @param {object} draft   a profile object, mutated in place as the user types
 * @param {object} options { families, onChange, showInterests }
 */
export function profileForm(draft, options = {}) {
  const families = options.families || [];
  const onChange = options.onChange || (() => {});

  const node = h("div", { class: "stack form" }, [
    section("Current position", [
      field("Current or most recent role", "role",
        h("input", { id: "role", type: "text", value: draft.currentRole,
          autocomplete: "off", placeholder: "e.g. Senior Biomedical Scientist",
          onInput: (event) => { draft.currentRole = event.target.value; onChange(); } })),
      field("Career family", "family",
        select("family", ["", ...families], draft.currentCareerFamily,
          (value) => { draft.currentCareerFamily = value; onChange(); },
          "Not sure / not listed")),
      field("Approximate years of experience", "years",
        h("input", { id: "years", type: "number", min: "0", max: "60", step: "1",
          value: draft.yearsExperience === null ? "" : draft.yearsExperience,
          onInput: (event) => {
            const value = event.target.value;
            draft.yearsExperience = value === "" ? null : Number(value);
            onChange();
          } }),
        "An estimate is fine. It is used to judge the seniority of a career, "
        + "not to score you."),
    ]),

    listSection("Education", "qualification", draft, "qualifications",
      (item) => [item.level, item.subject].filter(Boolean).join(" "),
      () => qualificationInputs(draft, onChange), onChange),

    listSection("Professional registration", "registration", draft,
      "registrations",
      (item) => `${item.body}${item.profession ? ` — ${item.profession}` : ""}`
        + ` (${item.status})`,
      () => registrationInputs(draft, onChange), onChange,
      "A professional-body membership is not the same thing as statutory "
      + "registration, so they are recorded separately. CareerPath never treats "
      + "either as established eligibility."),

    sectorSection(draft, onChange),
    signalSection(draft, onChange),
    options.showInterests === false ? null : interestSection(draft, onChange),
  ]);

  return node;
}

function section(title, children, hint) {
  return h("fieldset", { class: "form-section" }, [
    h("legend", { text: title }),
    hint ? h("p", { class: "hint", text: hint }) : null,
    ...children,
  ]);
}

function field(label, id, control, hint) {
  return h("div", { class: "field" }, [
    h("label", { for: id, text: label }),
    control,
    hint ? h("p", { class: "hint", text: hint }) : null,
  ]);
}

function select(id, values, selected, onSelect, blankLabel) {
  return h("select", { id, onChange: (event) => onSelect(event.target.value) },
    values.map((value) => h("option", {
      value, selected: value === selected ? true : null,
    }, value === "" ? (blankLabel || "Select…") : value)));
}

/** A list of structured items with add and remove. */
function listSection(title, itemNoun, draft, key, describe, inputsFactory,
                     onChange, hint) {
  const list = h("ul", { class: "chips chips-list" });
  const redraw = () => {
    clear(list);
    if (!draft[key].length) {
      append(list, h("li", { class: "empty",
        text: `No ${itemNoun} recorded yet.` }));
      return;
    }
    for (const [index, item] of draft[key].entries()) {
      append(list, h("li", { class: "chip chip-removable" }, [
        h("span", { text: describe(item) }),
        h("button", { type: "button", class: "chip-remove",
          "aria-label": `Remove ${describe(item)}`,
          onClick: () => {
            draft[key].splice(index, 1);
            redraw();
            onChange();
          } }, "×"),
      ]));
    }
  };
  redraw();

  const inputs = inputsFactory();
  inputs.onAdded = redraw;
  return section(title, [
    hint ? h("p", { class: "hint", text: hint }) : null,
    list,
    inputs.node,
  ]);
}

function qualificationInputs(draft, onChange) {
  const level = select("qual-level", ["", ...LEVELS], "", () => {},
                       "Level (e.g. BSc)");
  const subject = h("input", { id: "qual-subject", type: "text",
    placeholder: "Subject (e.g. Biomedical Science)", autocomplete: "off" });
  const api = { onAdded: () => {} };
  const add = button("Add qualification", () => {
    if (!level.value && !subject.value.trim()) return;
    draft.qualifications.push({ level: level.value,
                                subject: subject.value.trim() });
    level.value = "";
    subject.value = "";
    api.onAdded();
    onChange();
  }, { variant: "quiet" });
  api.node = h("div", { class: "row" }, [
    h("div", { class: "field" }, [h("label", { for: "qual-level",
      text: "Level" }), level]),
    h("div", { class: "field grow" }, [h("label", { for: "qual-subject",
      text: "Subject" }), subject]),
    h("div", { class: "field field-action" }, [add]),
  ]);
  return api;
}

function registrationInputs(draft, onChange) {
  const codes = REGISTRATION_BODIES.map((body) => body.code);
  const body = select("reg-body", ["", ...codes], "", () => {}, "Body");
  const profession = h("input", { id: "reg-profession", type: "text",
    placeholder: "Profession as registered (optional)", autocomplete: "off" });
  const status = select("reg-status",
    ["current", "in progress", "lapsed", "unknown"], "current", () => {});
  const api = { onAdded: () => {} };
  const add = button("Add registration", () => {
    if (!body.value) return;
    const known = REGISTRATION_BODIES.find((item) => item.code === body.value);
    draft.registrations.push({
      body: body.value,
      profession: profession.value.trim(),
      status: status.value,
      statutory: Boolean(known && known.statutory),
    });
    body.value = "";
    profession.value = "";
    api.onAdded();
    onChange();
  }, { variant: "quiet" });
  api.node = h("div", { class: "row" }, [
    h("div", { class: "field" }, [h("label", { for: "reg-body",
      text: "Body" }), body]),
    h("div", { class: "field grow" }, [h("label", { for: "reg-profession",
      text: "Profession" }), profession]),
    h("div", { class: "field" }, [h("label", { for: "reg-status",
      text: "Status" }), status]),
    h("div", { class: "field field-action" }, [add]),
  ]);
  return api;
}

function sectorSection(draft, onChange) {
  const sectors = Object.keys(SECTOR_SIGNALS);
  return section("Sectors you have worked in", [
    h("ul", { class: "chips" }, sectors.map((sector) => {
      const id = `sector-${sector.replace(/\W+/g, "-")}`;
      return h("li", {}, [
        h("input", { type: "checkbox", id, class: "chip-check",
          checked: draft.sectors.includes(sector) ? true : null,
          onChange: (event) => {
            if (event.target.checked) {
              if (!draft.sectors.includes(sector)) draft.sectors.push(sector);
            } else {
              draft.sectors = draft.sectors.filter((item) => item !== sector);
            }
            onChange();
          } }),
        h("label", { for: id, class: "chip chip-toggle", text: sector }),
      ]);
    })),
  ], "Sector exposure is matched separately from skills, because the same skill "
   + "reads differently in a different sector.");
}

/**
 * Skills and evidence.
 *
 * Grouped by the same domain groups the parser uses, so what a user adds by hand
 * is indistinguishable from what a CV produced.
 */
function signalSection(draft, onChange) {
  const groups = Object.entries(SIGNAL_KEYS);
  const held = new Set(allSignals(draft).map((signal) => signal.domain));

  const body = h("div", { class: "stack" });
  const redraw = () => {
    clear(body);
    const current = new Set(allSignals(draft).map((signal) => signal.domain));
    for (const [group, key] of groups) {
      const domains = Object.keys(DOMAINS)
        .filter((domain) => domainGroup(domain) === group);
      if (!domains.length) continue;
      append(body, h("div", { class: "signal-group" }, [
        h("h4", { text: groupLabel(group) }),
        h("ul", { class: "chips" }, domains.map((domain) => {
          const id = `signal-${domain}`;
          const on = current.has(domain);
          return h("li", {}, [
            h("input", { type: "checkbox", id, class: "chip-check",
              checked: on ? true : null,
              onChange: (event) => {
                if (event.target.checked) addSignal(draft, domain, []);
                else removeSignal(draft, domain);
                onChange();
              } }),
            h("label", { for: id, class: "chip chip-toggle",
                         text: domainLabel(domain) }),
          ]);
        })),
      ]));
    }
  };
  redraw();
  void held;

  return section("Skills and experience", [
    h("p", { class: "hint", text:
      "Tick anything you have real evidence for. Nothing here is a test — it is "
      + "what CareerPath compares against each career, so it is worth being "
      + "accurate in both directions." }),
    body,
  ]);
}

function groupLabel(group) {
  return {
    technical: "Technical and scientific",
    research: "Research",
    quality: "Quality and regulatory",
    digital: "Data and digital",
    leadership: "Leadership and operations",
    training: "Training and education",
    transferable: "Transferable",
    commercial: "Commercial",
  }[group] || group;
}

function interestSection(draft, onChange) {
  return section("Career interests", [
    h("p", { class: "hint", text: "What you want next, which is not always what "
      + "you have done so far." }),
    h("ul", { class: "chips" }, INTEREST_OPTIONS.map((option) => {
      const id = `interest-${option.id}`;
      return h("li", {}, [
        h("input", { type: "checkbox", id, class: "chip-check",
          checked: draft.careerInterests.includes(option.id) ? true : null,
          onChange: (event) => {
            if (event.target.checked) draft.careerInterests.push(option.id);
            else {
              draft.careerInterests = draft.careerInterests
                .filter((item) => item !== option.id);
            }
            onChange();
          } }),
        h("label", { for: id, class: "chip chip-toggle", text: option.label }),
      ]);
    })),
    h("h4", { text: "What matters most at this stage" }),
    h("ul", { class: "chips" }, PRIORITY_OPTIONS.map((option) => {
      const id = `priority-${option.id}`;
      return h("li", {}, [
        h("input", { type: "checkbox", id, class: "chip-check",
          checked: draft.priorities.includes(option.id) ? true : null,
          onChange: (event) => {
            if (event.target.checked) draft.priorities.push(option.id);
            else {
              draft.priorities = draft.priorities
                .filter((item) => item !== option.id);
            }
            onChange();
          } }),
        h("label", { for: id, class: "chip chip-toggle", text: option.label }),
      ]);
    })),
  ]);
}

/** A read-only summary of a profile, used on the review screen. */
export function profileSummary(profile) {
  const rows = [
    ["Current role", profile.currentRole || "Not identified"],
    ["Career family", profile.currentCareerFamily || "Not identified"],
    ["Experience", profile.yearsExperience === null
      ? "Not identified"
      : `Approximately ${profile.yearsExperience} years`],
    ["Education", (profile.qualifications || []).length
      ? profile.qualifications.map((q) => [q.level, q.subject]
          .filter(Boolean).join(" ")).join(" · ")
      : "Not identified"],
    ["Professional registration", (profile.registrations || []).length
      ? profile.registrations.map((r) =>
          `${r.body} (${r.statutory ? "statutory register" : "professional body"}`
          + `, status ${r.status})`).join(" · ")
      : "Not identified"],
    ["Sectors", (profile.sectors || []).join(" · ") || "Not identified"],
  ];
  return h("dl", { class: "summary" }, rows.flatMap(([label, value]) => [
    h("dt", { text: label }),
    h("dd", { text: value }),
  ]));
}

/** The career signals list, shown as chips. */
export function signalChips(profile) {
  const signals = allSignals(profile);
  if (!signals.length) return h("p", { class: "empty", text:
    "No career signals were identified." });
  return h("ul", { class: "chips" }, signals.map((signal) =>
    h("li", {}, [chip(domainLabel(signal.domain))])));
}
