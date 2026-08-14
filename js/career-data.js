/**
 * The career dataset: loading, indexing and derived attributes.
 *
 * The supplied JSON is treated as read-only source of truth. Nothing here edits,
 * reorders or filters out a supplied record. What it does add is *derived* view
 * data — domains, work orientations, a search index — all computed from fields
 * the dataset already contains, so adding career 678 needs no code change.
 */

import {
  TAG_DOMAINS, FAMILY_META, RELATED_FAMILIES, DOMAINS, orientationsFor,
  resolveText,
} from "./ontology.js";

const DATASET_URL = new URL("../data/careerpath_uk_careers_v1.json",
                            import.meta.url);
const ADDITIONS_URL = new URL("../data/helix_additional_careers_v1.json",
                              import.meta.url);

/** Regulatory statuses that mean "a register or protected title is involved". */
const REGULATED_STATUSES = new Set([
  "Statutory / regulated",
  "Statutory / protected",
  "Professional / voluntary register",
  "Legal function / appointment",
  "Professionally governed / role-dependent",
  "Role-dependent",
]);

/** Statuses where a statutory register is explicitly asserted by the dataset. */
const STATUTORY_STATUSES = new Set([
  "Statutory / regulated",
  "Statutory / protected",
]);

let dataset = null;

/**
 * Load and index the dataset once.
 *
 * Resolves to a catalogue object; subsequent calls return the same instance, so
 * the JSON is fetched and indexed a single time per page load.
 */
export async function loadCareers() {
  if (dataset) return dataset;
  let payload;
  try {
    const response = await fetch(DATASET_URL, { cache: "no-cache" });
    if (!response.ok) {
      throw new Error(`the server returned ${response.status}`);
    }
    payload = await response.json();
  } catch (cause) {
    throw new Error(
      "The career dataset could not be loaded. If you are running Helix "
      + "from a local folder, serve it over http rather than opening the file "
      + `directly. (${cause.message})`);
  }

  /*
   * Careers added after launch live in their own file.
   *
   * The supplied taxonomy is treated as immutable and its hash is checked on
   * every pipeline run, so growing the catalogue in place would break the one
   * guarantee that says nothing has quietly rewritten it. Additions are merged
   * here instead, from ids starting at CP-701 so an addition is recognisable
   * and can never collide with the supplied range.
   *
   * A missing or broken additions file is not fatal: the catalogue is simply
   * the supplied one, which is exactly how Helix behaved before.
   */
  const additions = await loadAdditions();
  dataset = buildCatalogue(payload, additions);
  return dataset;
}

async function loadAdditions() {
  try {
    const response = await fetch(ADDITIONS_URL, { cache: "no-cache" });
    if (!response.ok) return [];
    const payload = await response.json();
    return Array.isArray(payload.careers) ? payload.careers : [];
  } catch (ignored) {
    return [];
  }
}

/** The catalogue, or null before loadCareers() has resolved. */
export function catalogue() {
  return dataset;
}

/**
 * Turn the raw payload into an indexed catalogue.
 *
 * Exported so tests can build a catalogue from a fixture without a network call.
 */
export function buildCatalogue(payload, additions = []) {
  const supplied = Array.isArray(payload.careers) ? payload.careers : [];
  // An addition that reuses a supplied id is dropped rather than allowed to
  // shadow it: the supplied record is the one everything else is keyed to.
  const suppliedIds = new Set(supplied.map((career) => career.id));
  const extra = additions.filter((career) => career && !suppliedIds.has(career.id));
  const raw = [...supplied, ...extra];
  const careers = raw.map(decorate);
  const byId = new Map(careers.map((career) => [career.id, career]));
  const families = [...new Set(careers.map((c) => c.family))].sort();
  const depths = ["Deep", "Standard", "Explorer"]
    .filter((depth) => careers.some((c) => c.pathway_depth === depth));
  const tags = [...new Set(careers.flatMap((c) => c.core_tags))].sort();

  return {
    meta: {
      name: payload.dataset_name || "Helix career dataset",
      version: payload.version || "unknown",
      generated: payload.generated || "",
      jurisdiction: payload.jurisdiction || "United Kingdom",
      // The supplied file still declares its own 677; the catalogue is that
      // plus whatever has been added since.
      declaredCount: (payload.career_count ?? supplied.length) + extra.length,
      suppliedCount: payload.career_count ?? supplied.length,
      addedCount: extra.length,
      designIntent: payload.design_intent || "",
    },
    sources: payload.source_registry || {},
    careers,
    byId,
    families,
    depths,
    tags,
    get: (id) => byId.get(id) || null,
    count: careers.length,
  };
}

/**
 * Add derived fields to one supplied record.
 *
 * The original fields are copied through untouched. Derived data is namespaced
 * under keys the dataset does not use, so it is always clear which is which.
 */
function decorate(record) {
  const familyMeta = FAMILY_META[record.family] || { domains: [], sectors: [] };

  // Domains come from three independent places, strongest first: the curated tag
  // map, the family, and finally the title itself, which is what gives Explorer
  // careers enough signal to be matched at all.
  const fromTags = new Set();
  for (const tag of record.core_tags || []) {
    for (const domain of TAG_DOMAINS[tag] || []) fromTags.add(domain);
  }
  const fromTitle = new Set(resolveText(record.title).keys());
  const fromFamily = new Set(familyMeta.domains);

  const domains = new Set([...fromTags, ...fromFamily, ...fromTitle]);
  const weights = new Map();
  for (const domain of domains) {
    // A domain named by a career's own tags is a stronger claim about that
    // career than one inherited from its family.
    let weight = 0.5;
    if (fromFamily.has(domain)) weight = 0.7;
    if (fromTitle.has(domain)) weight = 0.9;
    if (fromTags.has(domain)) weight = 1;
    weights.set(domain, weight);
  }

  const orientations = orientationsFor([...domains]);
  const regulated = REGULATED_STATUSES.has(record.regulatory_status);

  return {
    ...record,
    derived: {
      domains: [...domains].filter((d) => DOMAINS[d]),
      domainWeights: weights,
      orientations: [...orientations],
      regulated,
      statutory: STATUTORY_STATUSES.has(record.regulatory_status),
      titleTokens: tokenise(record.title),
      familyAbout: familyMeta.about || "",
      familySectors: familyMeta.sectors || [],
      relatedFamilies: RELATED_FAMILIES[record.family] || [],
      searchText: [
        record.title, record.family, record.regulatory_status,
        record.regulator_or_body, ...(record.core_tags || []),
        record.typical_entry_signal,
      ].join(" ").toLowerCase(),
    },
  };
}

/** Words in a title, minus noise, for title-similarity comparisons. */
const STOP_WORDS = new Set(["and", "or", "of", "the", "in", "for", "a", "an",
  "to", "with", "&", "senior", "junior", "lead", "principal", "chief",
  "head", "deputy", "assistant", "associate", "trainee", "specialist",
  "advanced", "higher", "consultant"]);

export function tokenise(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/[\s-]+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word));
}

/**
 * Seniority implied by a title, so a pathway can tell a step up from a sideways
 * move. Deliberately crude: it reads title conventions, nothing more.
 */
export function seniorityOf(title) {
  const text = String(title || "").toLowerCase();
  if (/\b(director|chief|head of|executive)\b/.test(text)) return 4;
  if (/\b(principal|consultant|lead|manager|professor)\b/.test(text)) return 3;
  if (/\b(senior|specialist|advanced|higher)\b/.test(text)) return 2;
  if (/\b(trainee|assistant|junior|graduate|apprentice|support)\b/.test(text)) {
    return 0;
  }
  return 1;
}

/**
 * Resolve a career's source codes to the registry.
 *
 * One place does this lookup so the registry cannot drift between views, and an
 * unknown code is reported rather than silently dropped.
 */
export function sourcesFor(career, registry) {
  return (career.official_source_codes || []).map((code) => {
    const entry = registry[code];
    return entry
      ? { code, name: entry.name, url: entry.url, known: true }
      : { code, name: `Unknown source code (${code})`, url: "", known: false };
  });
}
