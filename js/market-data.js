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
      regional: payload.regional_context || null,
      sectorContext: payload.sector_context || null,
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
    /*
     * The two ends of a career, where the source gave them separately.
     *
     * This matters more than it looks. A National Careers Service range runs
     * from a starting salary to an experienced one *across the whole career*,
     * so a biomedical scientist's £30k to £53k spans entry through to the
     * senior grades — it is not the span of one pay band, and reading it as one
     * makes the top look implausible against an NHS Band 5. Naming the two ends
     * is the difference between a figure that can be checked and a figure that
     * invites the wrong comparison.
     */
    starter: Number.isFinite(raw.starter) ? raw.starter : null,
    experienced: Number.isFinite(raw.experienced) ? raw.experienced : null,
    spansCareer: Number.isFinite(raw.starter) && Number.isFinite(raw.experienced)
      && raw.starter !== raw.experienced,
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

/* ------------------------------------------------------- regional context */

/** The ONS index table, or null when the extract was never built. */
export function regionalContext() {
  return dataset ? dataset.regional : null;
}

/** Whole-economy public/private medians, published as context only. */
export function sectorContext() {
  return dataset ? dataset.sectorContext : null;
}

/**
 * The same career's salary, seen from one UK region.
 *
 * Multiplies the career's own UK range by the ONS regional index for the
 * occupation group its family maps to. The level is Helix's; only the regional
 * shape is ONS's — which is why the result can never be better evidenced than
 * "indicative" however good the UK figure was. Nobody published a regional range
 * for this job.
 *
 * Returns null, never a fallback, when:
 *   - the region is the UK (the caller already has that from `salary()`)
 *   - the extract is absent
 *   - the career's family has no mapped occupation group
 *   - ONS suppressed that region for that group
 *
 * A null is rendered as "not available for this region". Showing the UK figure
 * under a regional heading would be the one dishonest option.
 */
export function salaryForRegion(careerId, regionKey) {
  if (!regionKey || regionKey === "uk") return null;
  const base = salary(careerId);
  const context = regionalContext();
  if (!base || !context) return null;

  const record = forCareer(careerId);
  const groupKey = record && record.salary && record.salary.regional_soc_group;
  const group = groupKey ? context.groups[groupKey] : null;
  if (!group) return null;

  const index = group.regions[regionKey];
  if (!Number.isFinite(index)) {
    return {
      unavailable: true,
      region: regionKey,
      reason: `The Office for National Statistics does not publish a separate `
            + `figure for ${context.group_labels[groupKey] || "this occupation "
            + "group"} in this area, so Helix does not estimate one.`,
    };
  }

  const step = context.precision || 500;
  const low = Math.round((base.low * index) / step) * step;
  const high = Math.round((base.high * index) / step) * step;
  const evidence = EVIDENCE[worseOf(base.evidenceKey, context.evidence_floor)]
    || EVIDENCE.INDICATIVE;

  return {
    unavailable: false,
    region: regionKey,
    low,
    high,
    range: `${money(low)} to ${money(high)}`,
    index,
    /*
     * The comparison people actually want: is this region above or below the
     * national figure, and by how much. Expressed as a percentage of the UK
     * figure rather than a pound difference, because the index is what ONS
     * measured and the pounds are the derivation.
     */
    differencePercent: Math.round((index - 1) * 1000) / 10,
    ukLow: base.low,
    ukHigh: base.high,
    occupationGroup: context.group_labels[groupKey] || "",
    basis: (record.salary && record.salary.regional_basis) || "",
    evidenceKey: worseOf(base.evidenceKey, context.evidence_floor),
    evidenceLabel: evidence.label,
    evidenceExplain: evidence.explain,
    evidenceRank: evidence.rank,
    method: "ons_regional_index",
    methodLabel: "ONS regional index applied to the UK range",
    year: context.year,
    source: context.source,
    sourceUrl: context.source_url,
    licence: context.licence,
    disclaimer: SALARY_DISCLAIMER,
  };
}

/** Which of two evidence keys is the weaker. */
function worseOf(a, b) {
  const rankA = (EVIDENCE[a] || EVIDENCE.LIMITED_DATA).rank;
  const rankB = (EVIDENCE[b] || EVIDENCE.LIMITED_DATA).rank;
  return rankA >= rankB ? a : b;
}

/**
 * Which regions have a figure for this career, for building a selector that
 * cannot offer a dead option.
 */
export function regionsWithData(careerId) {
  const record = forCareer(careerId);
  const context = regionalContext();
  const groupKey = record && record.salary && record.salary.regional_soc_group;
  const group = context && groupKey ? context.groups[groupKey] : null;
  if (!group) return [];
  return Object.keys(group.regions);
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
  const authoritative = raw.summary_kind === "authoritative";
  return {
    /*
     * `summary` stays the sourced one, and only the sourced one.
     *
     * Every consumer that treats a summary as evidence — the attribution line,
     * the sources panel, the tests that check nothing unsourced is attributed —
     * reads this field, so widening it would quietly turn a composed sentence
     * into an official description. The composed text is a separate field that
     * a caller has to ask for by name and label for itself.
     */
    summary: authoritative ? raw.summary : null,
    composedSummary: authoritative ? null : (raw.summary || null),
    summaryNote: raw.summary_note || "",
    summaryKind: raw.summary_kind || "pending",
    alternativeTitles: raw.alternative_titles || [],
    progression: raw.progression || [],
    sources: raw.source_records || [],
    /*
     * Where else this role is written about.
     *
     * Links, never text. NHS Health Careers reserves all rights in its content
     * and limits use to personal viewing, while explicitly permitting links —
     * so Helix points at it and copies nothing, not even a page title. Anything
     * that appears beside one of these links comes from Helix's own taxonomy.
     */
    externalProfiles: (raw.external_profiles || [])
      .filter((entry) => entry && typeof entry.source_url === "string"
              && entry.source_url.startsWith("https://")),
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
