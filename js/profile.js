/**
 * The structured career profile.
 *
 * This is the only thing the matching, pathway, gap and action engines are
 * allowed to see. A CV, the manual builder and the demonstration profiles all
 * produce exactly this shape, which is what makes the engines indifferent to
 * where a profile came from.
 *
 * It deliberately has nowhere to put a name, an email address, a phone number,
 * an address or an employer name. A field that does not exist cannot be filled
 * in by accident later.
 */

import {
  DOMAINS, domainGroup, domainLabel, orientationsFor
} from "./ontology.js";

export const PROFILE_VERSION = 1;

/** Profile keys that hold signal lists, keyed by the domain group they take. */
export const SIGNAL_KEYS = {
  technical: "technicalSkills",
  transferable: "transferableSkills",
  leadership: "leadershipSignals",
  training: "trainingSignals",
  quality: "qualitySignals",
  research: "researchSignals",
  digital: "digitalSignals",
  commercial: "commercialSignals",
};

export const ALL_SIGNAL_KEYS = Object.values(SIGNAL_KEYS);

/** Interests the user can declare, mapped to the domains they imply. */
export const INTEREST_OPTIONS = [
  { id: "specialist", label: "Specialist / technical depth",
    domains: ["laboratory_science", "diagnostics", "pathology"] },
  { id: "patient_facing", label: "Patient-facing practice",
    domains: ["clinical_practice", "patient_care"] },
  { id: "laboratory", label: "Laboratory science",
    domains: ["laboratory_science", "diagnostics"] },
  { id: "research", label: "Research", domains: ["research", "academia"] },
  { id: "clinical_research", label: "Clinical research",
    domains: ["clinical_research", "gcp"] },
  { id: "leadership", label: "Leadership",
    domains: ["leadership", "operations"] },
  { id: "education", label: "Education", domains: ["education", "academia"] },
  { id: "quality", label: "Quality", domains: ["quality", "gxp", "compliance"] },
  { id: "regulatory", label: "Regulatory affairs",
    domains: ["regulatory", "safety"] },
  { id: "digital", label: "Digital / data",
    domains: ["data", "health_informatics", "bioinformatics", "ai"] },
  { id: "pharma_biotech", label: "Pharma / biotech",
    domains: ["pharma", "biotechnology", "manufacturing"] },
  { id: "commercial", label: "Commercial / medical affairs",
    domains: ["medical_affairs", "commercial", "market_access"] },
  { id: "public_health", label: "Public health",
    domains: ["public_health", "epidemiology", "policy"] },
];

/**
 * Career priorities: what somebody wants from working life, as opposed to what
 * they have already done.
 *
 * These drive preference fit and nothing else. They are deliberately kept out of
 * background alignment — see `preference-fit.js` for why the two must not be
 * blended — and every one of them is optional. "No preference" is the default and
 * is a real answer: an unstated preference is not scored at all rather than being
 * treated as indifference.
 *
 * Each question is here only because the market data can actually answer it.
 * There is no question whose answer Helix would quietly discard.
 */
export const PREFERENCE_GROUPS = [
  { id: "pay", title: "Pay" },
  { id: "hours", title: "Hours and working pattern" },
  { id: "where", title: "Where and how you work" },
  { id: "work", title: "The kind of work" },
  { id: "change", title: "How much change you want" },
];

const SEEK_SOME_AVOID = [
  ["seek", "I want a lot of this"],
  ["some", "Some is fine"],
  ["avoid", "I would rather avoid it"],
];

export const PREFERENCE_FIELDS = [
  {
    key: "salaryTarget", group: "pay", kind: "number",
    question: "Is there a salary you are aiming for?",
    hint: "Matched against each career's typical range. It is a target to compare "
        + "against, not a prediction of what you would be offered.",
    options: [
      [25000, "Around £25k"], [30000, "Around £30k"], [40000, "Around £40k"],
      [50000, "Around £50k"], [60000, "Around £60k"], [75000, "Around £75k"],
      [100000, "£100k or more"],
    ],
  },
  {
    key: "earningsImportance", group: "pay",
    question: "How much does earning potential matter to you?",
    options: [["high", "A great deal"], ["medium", "Somewhat"],
              ["low", "Not much"]],
  },
  {
    key: "workLifeBalance", group: "hours",
    question: "How important are predictable, contained working hours?",
    hint: "Only scored for careers where an official profile records typical "
        + "weekly hours.",
    options: [["high", "Very important"], ["medium", "Fairly important"],
              ["low", "Not important"]],
  },
  {
    key: "unsocialHours", group: "hours",
    question: "How do you feel about shifts, evenings, weekends or on-call?",
    options: [["willing", "Happy to work them"],
              ["occasionally", "Occasionally is fine"],
              ["prefer_standard", "I would rather work standard hours"]],
  },
  {
    key: "remoteWorking", group: "where",
    question: "How important is remote or hybrid working?",
    options: [["important", "Important to me"], ["nice", "Nice to have"],
              ["not_important", "Not important"]],
  },
  {
    key: "travelTolerance", group: "where",
    question: "How much work travel suits you?",
    options: [["happy", "I am happy to travel"], ["some", "Some travel is fine"],
              ["minimal", "I would rather keep travel to a minimum"]],
  },
  {
    key: "patientContact", group: "work",
    question: "How much direct patient contact do you want?",
    options: SEEK_SOME_AVOID,
  },
  {
    key: "laboratoryWork", group: "work",
    question: "How much laboratory work do you want?",
    options: SEEK_SOME_AVOID,
  },
  {
    key: "researchWork", group: "work",
    question: "How much research do you want in the role?",
    options: SEEK_SOME_AVOID,
  },
  {
    key: "commercialWork", group: "work",
    question: "How much commercial or business-facing work do you want?",
    options: SEEK_SOME_AVOID,
  },
  {
    key: "leadershipWork", group: "work",
    question: "How much do you want to lead teams or services?",
    options: SEEK_SOME_AVOID,
  },
  {
    key: "retrainingTolerance", group: "change",
    question: "How much retraining are you prepared to take on?",
    hint: "Only scored once you have a profile, because it is matched against the "
        + "transition effort for you specifically.",
    options: [["willing", "I am open to a full retraining route"],
              ["some", "Some study or a qualification is fine"],
              ["minimal", "I would rather build on what I already have"]],
  },
  {
    key: "openToSectorChange", group: "change",
    question: "Are you open to moving outside your current profession or sector?",
    options: [["yes", "Yes"], ["maybe", "Maybe"], ["no", "No"]],
  },
];

/** Preference keys and the values each will accept. */
const PREFERENCE_VALUES = new Map(PREFERENCE_FIELDS.map((field) =>
  [field.key, new Set(field.options.map(([value]) => value))]));

/**
 * Preference keys that earlier versions stored as booleans.
 *
 * Nothing in the interface ever wrote them, but an exported file could carry
 * them, and a migration that silently dropped a stated preference would be a
 * quiet way of losing somebody's answer.
 */
const LEGACY_PREFERENCES = {
  patientFacing: ["patientContact", "seek", "avoid"],
  laboratoryBased: ["laboratoryWork", "seek", "avoid"],
  researchIntensity: ["researchWork", "seek", "avoid"],
  leadershipInterest: ["leadershipWork", "seek", "avoid"],
  commercialInterest: ["commercialWork", "seek", "avoid"],
  remoteWorkInterest: ["remoteWorking", "important", "not_important"],
};

/** What matters most right now — used to order the next actions. */
export const PRIORITY_OPTIONS = [
  { id: "progression", label: "Progression" },
  { id: "specialist", label: "Specialist expertise" },
  { id: "leadership", label: "Leadership" },
  { id: "research", label: "Research opportunity" },
  { id: "industry", label: "Industry transition" },
  { id: "flexibility", label: "Flexibility" },
  { id: "patient_impact", label: "Patient impact" },
  { id: "options", label: "Broader career options" },
];

/** A profile with every field present and nothing invented. */
export function emptyProfile() {
  return {
    profileVersion: PROFILE_VERSION,
    jurisdiction: "UK",
    source: "manual",
    createdAt: null,

    currentRole: "",
    currentCareerFamily: "",
    yearsExperience: null,

    qualifications: [],
    registrations: [],
    sectors: [],
    disciplines: [],

    technicalSkills: [],
    transferableSkills: [],
    leadershipSignals: [],
    trainingSignals: [],
    qualitySignals: [],
    researchSignals: [],
    digitalSignals: [],
    commercialSignals: [],

    // Every preference starts unstated, and unstated is not the same as "no
    // strong feeling": an unstated dimension is left out of preference fit
    // entirely rather than scored as neutral.
    preferences: {
      salaryTarget: null,
      earningsImportance: null,
      workLifeBalance: null,
      unsocialHours: null,
      remoteWorking: null,
      travelTolerance: null,
      patientContact: null,
      laboratoryWork: null,
      researchWork: null,
      commercialWork: null,
      leadershipWork: null,
      retrainingTolerance: null,
      openToSectorChange: null,

      // Kept because an older export may carry it. No market-data field
      // describes how digital a career is, so it is not scored; keeping the key
      // loses nothing, and inventing a dimension to justify it would.
      dataDigitalInterest: null,
    },

    careerGoal: null,
    careerInterests: [],
    priorities: [],
  };
}

/**
 * Coerce anything profile-shaped into a valid profile.
 *
 * Used on imported files and on data restored from localStorage, where the shape
 * cannot be trusted. Unknown keys are dropped rather than carried forward, which
 * is also the mechanism that strips personal fields out of an older or
 * hand-edited file.
 */
export function normaliseProfile(input) {
  const base = emptyProfile();
  if (!input || typeof input !== "object") return base;

  base.jurisdiction = "UK";
  base.source = ["cv", "manual", "demo"].includes(input.source)
    ? input.source : "manual";
  base.createdAt = typeof input.createdAt === "string" ? input.createdAt : null;
  base.currentRole = cleanText(input.currentRole, 120);
  base.currentCareerFamily = cleanText(input.currentCareerFamily, 120);
  base.yearsExperience = cleanYears(input.yearsExperience);

  base.qualifications = asArray(input.qualifications)
    .map((item) => ({
      level: cleanText(item && item.level, 40),
      subject: cleanText(item && item.subject, 80),
    }))
    .filter((item) => item.level || item.subject)
    .slice(0, 20);

  base.registrations = asArray(input.registrations)
    .map((item) => ({
      body: cleanText(item && item.body, 40),
      profession: cleanText(item && item.profession, 80),
      status: ["current", "lapsed", "in progress", "unknown"]
        .includes(item && item.status) ? item.status : "unknown",
      statutory: Boolean(item && item.statutory),
    }))
    .filter((item) => item.body)
    .slice(0, 10);

  base.sectors = uniqueStrings(input.sectors, 20);
  base.disciplines = uniqueStrings(input.disciplines, 30);

  for (const key of ALL_SIGNAL_KEYS) {
    base[key] = asArray(input[key])
      .map(normaliseSignal)
      .filter((signal) => signal && DOMAINS[signal.domain])
      .slice(0, 40);
  }

  const prefs = (input.preferences && typeof input.preferences === "object")
    ? input.preferences : {};

  // A salary target is a number, and only one of the offered rungs: an arbitrary
  // figure typed into a URL or an edited export must not become a filter value.
  const targetRungs = new Set(PREFERENCE_FIELDS
    .find((field) => field.key === "salaryTarget").options.map(([value]) => value));
  base.preferences.salaryTarget = targetRungs.has(Number(prefs.salaryTarget))
    ? Number(prefs.salaryTarget) : null;

  for (const [key, allowed] of PREFERENCE_VALUES) {
    if (key === "salaryTarget") continue;
    base.preferences[key] = allowed.has(prefs[key]) ? prefs[key] : null;
  }
  base.preferences.dataDigitalInterest =
    typeof prefs.dataDigitalInterest === "boolean"
      ? prefs.dataDigitalInterest : null;

  // Booleans written by an earlier version become the equivalent stated answer,
  // but never overwrite one the current schema already holds.
  for (const [legacy, [key, whenTrue, whenFalse]] of
       Object.entries(LEGACY_PREFERENCES)) {
    if (base.preferences[key] !== null) continue;
    if (prefs[legacy] === true) base.preferences[key] = whenTrue;
    else if (prefs[legacy] === false) base.preferences[key] = whenFalse;
  }

  base.careerGoal = ["target", "explore"].includes(input.careerGoal)
    ? input.careerGoal : null;
  const interestIds = new Set(INTEREST_OPTIONS.map((o) => o.id));
  base.careerInterests = uniqueStrings(input.careerInterests, 20)
    .filter((id) => interestIds.has(id));
  const priorityIds = new Set(PRIORITY_OPTIONS.map((o) => o.id));
  base.priorities = uniqueStrings(input.priorities, 8)
    .filter((id) => priorityIds.has(id));

  return base;
}

function normaliseSignal(item) {
  if (!item) return null;
  if (typeof item === "string") {
    return DOMAINS[item] ? { domain: item, evidence: [] } : null;
  }
  return {
    domain: cleanText(item.domain, 60),
    evidence: uniqueStrings(item.evidence, 4).map((text) => text.slice(0, 60)),
  };
}

function cleanText(value, max) {
  if (typeof value !== "string") return "";
  return value.replace(/\s+/g, " ").trim().slice(0, max);
}

function cleanYears(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0) return null;
  return Math.min(Math.round(number * 10) / 10, 60);
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function uniqueStrings(value, max) {
  const out = [];
  for (const item of asArray(value)) {
    const text = cleanText(item, 80);
    if (text && !out.includes(text)) out.push(text);
    if (out.length >= max) break;
  }
  return out;
}

/** Add a signal, merging evidence when the domain is already present. */
export function addSignal(profile, domain, evidence = []) {
  if (!DOMAINS[domain]) return profile;
  const key = SIGNAL_KEYS[domainGroup(domain)] || SIGNAL_KEYS.technical;
  const existing = profile[key].find((signal) => signal.domain === domain);
  if (existing) {
    for (const item of evidence) {
      if (existing.evidence.length < 4 && !existing.evidence.includes(item)) {
        existing.evidence.push(item);
      }
    }
    return profile;
  }
  profile[key].push({ domain, evidence: [...evidence].slice(0, 4) });
  return profile;
}

/** Remove a signal wherever it sits. */
export function removeSignal(profile, domain) {
  for (const key of ALL_SIGNAL_KEYS) {
    profile[key] = profile[key].filter((signal) => signal.domain !== domain);
  }
  return profile;
}

/** Every signal across all groups, in a stable order. */
export function allSignals(profile) {
  const out = [];
  for (const key of ALL_SIGNAL_KEYS) {
    for (const signal of profile[key] || []) out.push({ ...signal, key });
  }
  return out.sort((a, b) => a.domain.localeCompare(b.domain));
}

/**
 * The profile as a weighted domain map, which is the form the matcher consumes.
 *
 * Weight reflects how firmly the profile evidences a domain: demonstrated in a
 * role beats mentioned once, and a declared interest is weaker still than
 * either. Interests are included at low weight so that "help me explore" can
 * respond to what the user says they want without drowning what they have done.
 */
export function profileDomains(profile) {
  const weights = new Map();
  const bump = (domain, weight) => {
    if (!DOMAINS[domain]) return;
    weights.set(domain, Math.max(weights.get(domain) || 0, weight));
  };

  for (const signal of allSignals(profile)) {
    // More distinct pieces of evidence for the same domain is a firmer claim.
    const evidence = signal.evidence.length;
    bump(signal.domain, evidence >= 3 ? 1 : evidence >= 1 ? 0.85 : 0.7);
  }
  for (const interest of profile.careerInterests || []) {
    const option = INTEREST_OPTIONS.find((o) => o.id === interest);
    for (const domain of (option && option.domains) || []) bump(domain, 0.45);
  }
  return weights;
}

/** Orientations the profile evidences, ignoring stated interests. */
export function profileOrientations(profile) {
  return orientationsFor(allSignals(profile).map((signal) => signal.domain));
}

/**
 * Has the user stated any preference at all?
 *
 * Views use this to decide whether to offer preference fit rather than showing
 * "Not enough preference data" against every career, which would be noise.
 * `openToSectorChange` is excluded: it is not one of the scored dimensions, so on
 * its own it cannot produce a fit result.
 */
export function hasPreferences(profile) {
  const prefs = (profile && profile.preferences) || {};
  return PREFERENCE_FIELDS.some((field) =>
    field.key !== "openToSectorChange" && prefs[field.key] !== null
    && prefs[field.key] !== undefined);
}

/** Enough to run a meaningful match? Used to decide what to prompt for. */
export function isUsableProfile(profile) {
  if (!profile) return false;
  const signals = allSignals(profile).length;
  return Boolean(profile.currentRole) || signals >= 3
    || (profile.qualifications || []).length > 0;
}

/** Short human summary of a profile, for headers and the PDF. */
export function describeProfile(profile) {
  const parts = [];
  if (profile.currentRole) parts.push(profile.currentRole);
  if (Number.isFinite(profile.yearsExperience)) {
    const years = profile.yearsExperience;
    parts.push(`approximately ${years} year${years === 1 ? "" : "s"} of experience`);
  }
  const top = (profile.qualifications || [])[0];
  if (top) parts.push([top.level, top.subject].filter(Boolean).join(" "));
  return parts.join(" · ") || "Profile not yet completed";
}

/** Domain labels for display, deduplicated and sorted. */
export function signalLabels(profile) {
  return [...new Set(allSignals(profile).map((s) => domainLabel(s.domain)))]
    .sort((a, b) => a.localeCompare(b));
}

/**
 * Fictional demonstration profiles.
 *
 * Every value here is invented. No real person, employer or organisation is
 * described, and none of these profiles claims a registration status that the
 * app would then treat as established.
 */
export const DEMO_PROFILES = [
  {
    id: "graduate",
    name: "Life science graduate",
    blurb: "Recent BSc, laboratory placement experience, no registration yet.",
    build: () => withSignals({
      ...emptyProfile(),
      source: "demo",
      currentRole: "Graduate Laboratory Assistant",
      currentCareerFamily: "Laboratory, Pathology & Technical Operations",
      yearsExperience: 1,
      qualifications: [{ level: "BSc", subject: "Biomedical Science" },
                       { level: "A level", subject: "Biology and Chemistry" }],
      registrations: [],
      sectors: ["diagnostic laboratory", "university"],
      disciplines: ["microbiology"],
      careerGoal: "explore",
      careerInterests: ["laboratory", "specialist", "research"],
      priorities: ["progression", "specialist"],
    }, [
      ["laboratory_science", ["sample processing", "assays"]],
      ["microbiology", ["culture and sensitivity"]],
      ["quality", ["standard operating procedure"]],
      ["communication", ["presented"]],
    ]),
  },
  {
    id: "bms",
    name: "Experienced biomedical scientist",
    blurb: "Nine years in a diagnostic laboratory, quality and training evidence.",
    build: () => withSignals({
      ...emptyProfile(),
      source: "demo",
      currentRole: "Senior Biomedical Scientist",
      currentCareerFamily: "Healthcare Science & Diagnostics",
      yearsExperience: 9,
      qualifications: [{ level: "MSc", subject: "Haematology" },
                       { level: "BSc", subject: "Biomedical Science" }],
      registrations: [{ body: "HCPC", profession: "Biomedical Scientist",
                        status: "current", statutory: true }],
      sectors: ["healthcare", "diagnostic laboratory"],
      disciplines: ["haematology", "transfusion science"],
      careerGoal: "explore",
      careerInterests: ["quality", "leadership", "education"],
      priorities: ["progression", "leadership"],
    }, [
      ["laboratory_science", ["assay validation", "analyser"]],
      ["pathology", ["haematology", "transfusion"]],
      ["diagnostics", ["result authorisation"]],
      ["quality", ["internal audit", "iso 15189", "capa"]],
      ["education", ["competency assessment", "delivered training"]],
      ["leadership", ["supervised", "rota"]],
    ]),
  },
  {
    id: "postdoc",
    name: "Postdoctoral researcher considering industry",
    blurb: "PhD and postdoc in molecular biology, exploring a move to industry.",
    build: () => withSignals({
      ...emptyProfile(),
      source: "demo",
      currentRole: "Postdoctoral Research Associate",
      currentCareerFamily: "Research & Academia",
      yearsExperience: 7,
      qualifications: [{ level: "PhD", subject: "Molecular Biology" },
                       { level: "BSc", subject: "Biochemistry" }],
      registrations: [],
      sectors: ["university", "research"],
      disciplines: ["molecular biology", "genomics"],
      careerGoal: "explore",
      careerInterests: ["pharma_biotech", "clinical_research", "digital"],
      priorities: ["industry", "research"],
    }, [
      ["research", ["experimental design", "publications", "grant"]],
      ["genomics", ["sequencing", "pcr"]],
      ["laboratory_science", ["wet lab"]],
      ["bioinformatics", ["python", "linux"]],
      ["data", ["statistics"]],
      ["education", ["supervised trainees"]],
      ["communication", ["manuscript", "conference abstract"]],
    ]),
  },
  {
    id: "clinical_pivot",
    name: "Healthcare professional considering a non-clinical transition",
    blurb: "Registered practitioner with audit, training and project evidence.",
    build: () => withSignals({
      ...emptyProfile(),
      source: "demo",
      currentRole: "Specialist Radiographer",
      currentCareerFamily: "Allied Health & Clinical Practice",
      yearsExperience: 11,
      qualifications: [{ level: "PGDip", subject: "Advanced Clinical Practice" },
                       { level: "BSc", subject: "Diagnostic Radiography" }],
      registrations: [{ body: "HCPC", profession: "Radiographer",
                        status: "current", statutory: true }],
      sectors: ["healthcare"],
      disciplines: ["imaging"],
      careerGoal: "explore",
      careerInterests: ["digital", "leadership", "quality"],
      priorities: ["options", "flexibility"],
    }, [
      ["clinical_practice", ["clinical decision", "caseload"]],
      ["patient_care", ["patient assessment"]],
      ["quality", ["audit", "quality improvement"]],
      ["education", ["mentored", "practice educator"]],
      ["project_management", ["implementation project"]],
      ["health_informatics", ["system implementation", "epr"]],
      ["leadership", ["supervised"]],
    ]),
  },
];

function withSignals(profile, pairs) {
  for (const [domain, evidence] of pairs) addSignal(profile, domain, evidence);
  profile.createdAt = new Date().toISOString();
  return profile;
}

/** Build a demonstration profile by id. */
export function demoProfile(id) {
  const demo = DEMO_PROFILES.find((item) => item.id === id);
  return demo ? demo.build() : null;
}
