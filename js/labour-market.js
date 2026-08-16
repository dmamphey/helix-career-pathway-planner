/**
 * Labour market signals: is anybody hiring for this kind of work?
 *
 * Reads one static file written by the enrichment run. The browser never talks
 * to a job board, holds no API key, and has no runtime dependency on anybody's
 * uptime — a labour market provider being down cannot take a career page with it.
 *
 * The four things this module refuses to do
 * -----------------------------------------
 *
 * 1. Report a vacancy count. The published source is an index of advert volume
 *    against a February 2020 baseline. Turning that into "1,240 vacancies" would
 *    require a total nobody published.
 *
 * 2. Report regional demand. The source is UK-wide. An empty region list here
 *    means "this source does not break down by region", and `null` says so
 *    rather than rendering as "no regions are hiring".
 *
 * 3. Say "no jobs available". A missing file, a failed refresh and a category
 *    with no series all produce "no current signal" — which is a statement about
 *    Helix's evidence, not about the job market.
 *
 * 4. Present a stale index as current. The signal carries its own age, and an
 *    old release is capped at a weak signal strength however dense the series is.
 */

const DATA_URL = new URL("../data/helix_labour_market_uk_v1.json",
                         import.meta.url);

/** Signal strengths, strongest first, with the words a reader sees. */
export const SIGNAL = {
  strong: {
    key: "strong", rank: 0, label: "Strong signal",
    explain: "A long, dense run of recent observations for this category.",
  },
  moderate: {
    key: "moderate", rank: 1, label: "Moderate signal",
    explain: "Enough observations to show a direction, but not a long run.",
  },
  limited: {
    key: "limited", rank: 2, label: "Limited signal",
    explain: "Few observations, or a source release old enough that it "
           + "describes a market that has since moved.",
  },
  insufficient: {
    key: "insufficient", rank: 3, label: "Insufficient current data",
    explain: "Not enough published data to say anything about demand.",
  },
};

export const TREND = {
  increasing: { key: "increasing", label: "Increasing", symbol: "▲" },
  stable: { key: "stable", label: "Broadly stable", symbol: "▬" },
  decreasing: { key: "decreasing", label: "Decreasing", symbol: "▼" },
  unknown: { key: "unknown", label: "Not known", symbol: "–" },
};

let dataset = null;
let loadFailure = null;

/**
 * Load the signals. Never throws.
 *
 * Labour market data is the most optional thing in Helix: it is external, it is
 * experimental, and it goes stale. Every failure path here ends in the interface
 * saying it has no current signal, and nothing else on the page changes.
 */
export async function loadLabourMarket() {
  if (dataset || loadFailure) return dataset;
  try {
    const response = await fetch(DATA_URL, { cache: "no-cache" });
    if (!response.ok) throw new Error(`the server returned ${response.status}`);
    const payload = await response.json();
    if (!payload || typeof payload.signals !== "object") {
      throw new Error("the file contained no signals");
    }
    dataset = payload;
  } catch (error) {
    loadFailure = error.message || String(error);
    dataset = null;
  }
  return dataset;
}

export function status() {
  if (dataset) {
    return {
      ok: true,
      categories: Object.keys(dataset.signals).length,
      provider: dataset.primary_provider || "",
      generated: dataset.generated || "",
    };
  }
  return {
    ok: false,
    // Deliberately about Helix, not about the job market.
    message: "Helix has no current labour market signal loaded. Everything else "
           + "on this page is unaffected.",
    detail: loadFailure || "not loaded",
  };
}

export function meta() {
  return dataset;
}

/**
 * The demand signal for one career.
 *
 * Resolved through the career's *family*, because the published source is
 * categorised by advertising category rather than by occupation. The returned
 * object always says so — a reader must never think this is a count of adverts
 * for their exact job title.
 */
export function demandFor(career) {
  if (!dataset || !career) return null;
  const category = dataset.family_categories[career.family];
  const signal = category ? dataset.signals[category] : null;
  if (!signal) return null;

  const strength = SIGNAL[signal.signal_strength] || SIGNAL.insufficient;
  const trend = TREND[signal.trend] || TREND.unknown;

  return {
    category,
    categoryLabel: signal.category_label || dataset.category_labels[category] || "",
    familyReason: dataset.family_reasons[career.family] || "",

    index: signal.index,
    baseline: signal.baseline,
    /*
     * Always null from the current source, and present in the shape so that a
     * caller reads "no count available" rather than reaching for the index and
     * rendering it as if it were one.
     */
    vacancyCount: signal.vacancy_count === null ? null : signal.vacancy_count,

    trendKey: trend.key,
    trendLabel: trend.label,
    trendSymbol: trend.symbol,
    trendChangePercent: signal.trend_change_percent,
    trendWindow: signal.trend_window || "",
    history: signal.history || [],

    strengthKey: strength.key,
    strengthLabel: strength.label,
    strengthExplain: strength.explain,
    strengthRank: strength.rank,

    stale: Boolean(signal.stale),
    ageDays: signal.age_days || 0,

    /*
     * `null` and `[]` mean different things and are kept apart all the way to
     * the interface: null is "this source does not measure that", empty is
     * "it measured and found none".
     */
    topRegions: signal.top_regions,
    topSectors: signal.top_sectors,
    commonSkills: signal.common_skills,
    topEmployers: signal.top_employers,

    source: signal.source,
    sourceUrl: signal.source_url,
    licence: signal.licence,
    released: signal.released,
    retrieved: signal.retrieved,
    notes: signal.notes || [],
    limits: dataset.limits || [],
  };
}

/** What Helix cannot answer here, and why — for the methodology screen. */
export function providerReport() {
  if (!dataset) return [];
  return (dataset.providers || []).map((entry) => ({
    provider: entry.provider,
    available: Boolean(entry.available),
    reason: entry.reason || "",
    capabilities: entry.capabilities || {},
    categoriesAnswered: entry.categories_answered || 0,
  }));
}

/**
 * Rank careers by demand signal, for comparison.
 *
 * Returns null rather than a tie-break when two careers share a category, which
 * they very often do: saying one of two healthcare careers has "the stronger
 * market" when both read the same index would be inventing a distinction.
 */
export function strongestDemand(careers) {
  const seen = new Map();
  for (const career of careers) {
    const signal = demandFor(career);
    if (!signal || signal.strengthRank >= SIGNAL.insufficient.rank) continue;
    seen.set(career.id, { career, signal });
  }
  const values = [...seen.values()];
  if (values.length < 2) return null;
  const categories = new Set(values.map((item) => item.signal.category));
  if (categories.size < 2) return null;

  const order = { increasing: 0, stable: 1, decreasing: 2, unknown: 3 };
  values.sort((a, b) =>
    order[a.signal.trendKey] - order[b.signal.trendKey]
    || (b.signal.index || 0) - (a.signal.index || 0)
    || a.career.id.localeCompare(b.career.id));

  const best = values[0];
  const runnerUp = values[1];
  if (best.signal.trendKey === runnerUp.signal.trendKey
      && best.signal.index === runnerUp.signal.index) {
    return null;
  }
  return best;
}
