/**
 * The market-data layer: salary, working life and role context.
 *
 * Loaded from one static file published by the enrichment pipeline. The browser
 * contacts nobody for this — no salary API call per career, no request per card.
 *
 * Two rules shape the interface this module offers:
 *
 * Nothing is presented as equally certain. Every salary carries an evidence class,
 * and the label for it is the first thing a caller gets alongside the figure, so a
 * derived estimate cannot be rendered as though it were a published range.
 *
 * Absent data stays absent. `hours` returns null rather than a guess, and callers
 * show "Not yet available". Salary completeness is mandatory; completeness of every
 * secondary field is not, and pretending otherwise would be the dishonest kind of
 * polish.
 */

const DATA_URL = new URL("../data/helix_market_data_uk_v1.json", import.meta.url);

/** Evidence classes, in descending strength, with the words users see. */
export const EVIDENCE = {
  VERIFIED_GUIDE: {
    label: "Career-specific guide",
    rank: 0,
    explain: "A salary range published for this specific job by an official "
           + "careers source.",
  },
  STRONG_ESTIMATE: {
    label: "Strong estimate",
    rank: 1,
    explain: "A high-quality occupation or pay-framework mapping, but not a range "
           + "published for this exact job title.",
  },
  INDICATIVE: {
    label: "Indicative estimate",
    rank: 2,
    explain: "Derived from closely related careers that have stronger evidence, "
           + "with any difference in seniority taken into account.",
  },
  LIMITED_DATA: {
    label: "Limited-data estimate",
    rank: 3,
    explain: "A median across this career's family and seniority level. A broad "
           + "indication only — no source specific to this job was available.",
  },
};

export const METHOD_LABELS = {
  ncs_career_specific: "Career-specific job profile",
  public_sector_framework: "Public-sector pay framework",
  ons_soc_occupation: "Occupation earnings estimate",
  related_career_derived: "Derived from related careers",
  family_seniority_fallback: "Family and seniority median",
};

/** Qualitative working-life levels, for display and filtering. */
export const LEVELS = ["low", "medium", "high", "variable", "unknown"];

const SALARY_DISCLAIMER =
  "Salary figures are indicative and can vary by employer, location, experience, "
  + "sector, hours and working pattern.";

let dataset = null;
let loadFailure = null;

/**
 * Load and index the market data.
 *
 * Never throws. A failure is recorded and reported through `status()`, because the
 * application must still start and be useful without salary data — the career
 * taxonomy, matching, pathways and gaps do not depend on it.
 */
export async function loadMarketData() {
  if (dataset || loadFailure) return dataset;
  try {
    const response = await fetch(DATA_URL, { cache: "no-cache" });
    if (!response.ok) throw new Error(`the server returned ${response.status}`);
    const payload = await response.json();
    const records = Array.isArray(payload.records) ? payload.records : [];
    if (!records.length) throw new Error("the file contained no records");

    const byId = new Map();
    for (const record of records) {
      if (record && typeof record.career_id === "string") {
        byId.set(record.career_id, record);
      }
    }
    dataset = {
      meta: {
        name: payload.dataset_name || "Market data",
        version: payload.version || "unknown",
        generated: payload.generated || "",
        jurisdiction: payload.jurisdiction || "UK",
        attribution: payload.attribution || [],
        directEvidenceCount: payload.direct_evidence_count || 0,
      },
      byId,
      count: byId.size,
    };
  } catch (error) {
    loadFailure = error.message || String(error);
    dataset = null;
  }
  return dataset;
}

export function status() {
  if (dataset) {
    return { ok: true, count: dataset.count, meta: dataset.meta };
  }
  return {
    ok: false,
    count: 0,
    message: "Salary and working-life information could not be loaded, so it is "
           + "not shown. Everything else in Helix works normally.",
    detail: loadFailure || "not loaded",
  };
}

export function meta() {
  return dataset ? dataset.meta : null;
}

/** The raw record for a career, or null. */
export function forCareer(careerId) {
  return dataset ? dataset.byId.get(careerId) || null : null;
}

/* --------------------------------------------------------------- salary */

/**
 * The salary view of a career: the numbers, how to say them, and how much to
 * trust them. Returns null when there is no market record at all.
 */
export function salary(careerId) {
  const record = forCareer(careerId);
  const raw = record && record.salary;
  if (!raw || !Number.isFinite(raw.typical_low) || !Number.isFinite(raw.typical_high)) {
    return null;
  }
  const evidence = EVIDENCE[raw.evidence_quality] || EVIDENCE.LIMITED_DATA;
  return {
    low: raw.typical_low,
    high: raw.typical_high,
    range: `${money(raw.typical_low)} to ${money(raw.typical_high)}`,
    currency: raw.currency || "GBP",
    period: raw.period || "year",
    geography: raw.geography || "UK",
    evidenceKey: raw.evidence_quality,
    evidenceLabel: evidence.label,
    evidenceExplain: evidence.explain,
    evidenceRank: evidence.rank,
    method: raw.estimate_method || "",
    methodLabel: METHOD_LABELS[raw.estimate_method] || raw.estimate_method || "",
    lastVerified: raw.last_verified || "",
    reviewDue: raw.next_review_due || "",
    stale: isStale(raw.next_review_due),
    notes: raw.methodology_notes || [],
    sources: raw.source_records || [],
    derivedFrom: raw.derived_from_career_ids || [],
    payFramework: record.pay_framework || null,
    disclaimer: SALARY_DISCLAIMER,
  };
}

/** £30k / £30,500 — thousands where the figure is round, to avoid false precision. */
export function money(value) {
  if (!Number.isFinite(value)) return "—";
  if (value >= 1000 && value % 1000 === 0) return `£${value / 1000}k`;
  return `£${Math.round(value).toLocaleString("en-GB")}`;
}

function isStale(due) {
  if (!due) return false;
  const date = new Date(due);
  return Number.isFinite(date.valueOf()) && date < new Date();
}

/* ----------------------------------------------------------- working life */

/**
 * Working-life facts, separated into what a source said and what was inferred
 * from the taxonomy. The distinction is shown in the interface: an inference is
 * not survey data and must not read like it.
 */
export function workLife(careerId) {
  const record = forCareer(careerId);
  const raw = record && record.work_life;
  if (!raw) return null;

  const hours = (Number.isFinite(raw.hours_min) && Number.isFinite(raw.hours_max))
    ? (raw.hours_min === raw.hours_max
        ? `${raw.hours_min} hours a week`
        : `${raw.hours_min} to ${raw.hours_max} hours a week`)
    : null;

  return {
    hours,
    hoursMin: Number.isFinite(raw.hours_min) ? raw.hours_min : null,
    hoursMax: Number.isFinite(raw.hours_max) ? raw.hours_max : null,
    patterns: raw.work_patterns || [],
    settings: raw.work_settings || [],
    patientContact: raw.patient_contact || "unknown",
    laboratory: raw.laboratory_intensity || "unknown",
    research: raw.research_intensity || "unknown",
    commercial: raw.commercial_intensity || "unknown",
    remote: raw.remote_potential || "unknown",
    travel: raw.travel || "unknown",
    sourced: (raw.source_records || []).length > 0,
    qualitativeNote: raw.qualitative_note || "",
    sources: raw.source_records || [],
  };
}

/** Role context, only when it came from an authoritative profile. */
export function role(careerId) {
  const record = forCareer(careerId);
  const raw = record && record.role;
  if (!raw) return null;
  return {
    summary: raw.summary_kind === "authoritative" ? raw.summary : null,
    summaryKind: raw.summary_kind || "pending",
    alternativeTitles: raw.alternative_titles || [],
    progression: raw.progression || [],
    sources: raw.source_records || [],
  };
}

/* ---------------------------------------------------------------- summary */

/** Counts for the data-and-methodology screen. */
export function coverage() {
  if (!dataset) return null;
  const byEvidence = {};
  const byMethod = {};
  let withHours = 0;
  let withRole = 0;
  let stale = 0;
  for (const record of dataset.byId.values()) {
    const key = (record.salary || {}).evidence_quality || "unknown";
    byEvidence[key] = (byEvidence[key] || 0) + 1;
    const method = (record.salary || {}).estimate_method || "unknown";
    byMethod[method] = (byMethod[method] || 0) + 1;
    if (Number.isFinite((record.work_life || {}).hours_min)) withHours += 1;
    if ((record.role || {}).summary_kind === "authoritative") withRole += 1;
    if (isStale((record.salary || {}).next_review_due)) stale += 1;
  }
  return { total: dataset.count, byEvidence, byMethod, withHours, withRole, stale };
}

/**
 * Sort key for "highest typical salary".
 *
 * Documented deliberately: it sorts on the upper end of the typical range, which
 * is what the label says. Ties break on title then id so the order is stable.
 */
export function salaryHigh(careerId) {
  const value = salary(careerId);
  return value ? value.high : -1;
}
