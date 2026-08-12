/**
 * Career rule packs.
 *
 * A pack adds researched, career-specific structure — entry routes, bridge roles,
 * milestones, progression — on top of what the dataset can say generically. The
 * application must work perfectly well without any packs, so this loader is
 * allowed to return null and every consumer treats that as normal.
 *
 * One rule is enforced here rather than trusted to whoever authors a pack: a pack
 * whose `requirementsVerified` flag is false cannot contribute *required* items,
 * whatever its file says. Mandatory-sounding content and verified provenance
 * travel together or not at all. Anything a pack asserts without verification is
 * downgraded to "usually expected", which the interface presents as a common
 * expectation rather than a rule.
 */

const RULES_BASE = new URL("../data/career_rules/", import.meta.url);

let indexPromise = null;
const packs = new Map();

/** Load the list of available packs once. Absent index means "no packs". */
export async function loadRuleIndex() {
  if (!indexPromise) {
    indexPromise = fetch(new URL("index.json", RULES_BASE), { cache: "no-cache" })
      .then((response) => (response.ok ? response.json() : { packs: [] }))
      .then((data) => new Set(Array.isArray(data.packs) ? data.packs : []))
      .catch(() => new Set());
  }
  return indexPromise;
}

/**
 * The rule pack for a career, or null.
 *
 * Results are cached, including the null, so a career without a pack costs one
 * lookup per session.
 */
export async function loadRulePack(careerId) {
  if (packs.has(careerId)) return packs.get(careerId);
  const index = await loadRuleIndex();
  if (!index.has(careerId)) {
    packs.set(careerId, null);
    return null;
  }
  let pack = null;
  try {
    const response = await fetch(new URL(`${careerId}.json`, RULES_BASE),
                                 { cache: "no-cache" });
    if (response.ok) pack = normalisePack(careerId, await response.json());
  } catch (ignored) {
    pack = null; // a missing or malformed pack must never break the pathway
  }
  packs.set(careerId, pack);
  return pack;
}

/** Whether any packs exist at all, for the README-ish note in the interface. */
export async function packCount() {
  return (await loadRuleIndex()).size;
}

/**
 * Coerce a pack into a known shape, applying the verification rule.
 *
 * Exported for the test suite, which checks that an unverified pack cannot smuggle
 * in a required item.
 */
export function normalisePack(careerId, raw) {
  const verified = raw.requirementsVerified === true
    && typeof raw.verifiedDate === "string" && raw.verifiedDate.length >= 8;

  const required = verified ? requirementList(raw.required) : [];
  // Unverified "required" content is not discarded — it is demoted, so the work
  // is not lost and the claim is not overstated.
  const demoted = verified ? [] : requirementList(raw.required).map((item) => ({
    ...item,
    demotedFromRequired: true,
  }));

  return {
    careerId,
    ruleVersion: String(raw.ruleVersion || "0"),
    requirementsVerified: verified,
    verifiedDate: verified ? raw.verifiedDate : (raw.verifiedDate || ""),
    required,
    usuallyExpected: [...requirementList(raw.usuallyExpected), ...demoted],
    careerEnhancing: requirementList(raw.careerEnhancing),
    optional: requirementList(raw.optional),
    milestones: milestoneList(raw.milestones),
    entryRoutes: textList(raw.entryRoutes),
    bridgeRoles: textList(raw.bridgeRoles),
    progression: textList(raw.progression),
    adjacentCareerIds: textList(raw.adjacentCareerIds),
    officialSources: (Array.isArray(raw.officialSources) ? raw.officialSources : [])
      .map((source) => ({
        code: String(source.code || ""),
        name: String(source.name || source.code || "Official source"),
        url: String(source.url || ""),
      }))
      .filter((source) => source.url),
    notes: typeof raw.notes === "string" ? raw.notes : "",
  };
}

function requirementList(value) {
  return (Array.isArray(value) ? value : [])
    .map((item, position) => ({
      id: String(item.id || `item_${position}`),
      domain: String(item.domain || ""),
      title: String(item.title || "").slice(0, 160),
      detail: String(item.detail || "").slice(0, 600),
      sourceCode: String(item.sourceCode || ""),
    }))
    .filter((item) => item.title);
}

function milestoneList(value) {
  return (Array.isArray(value) ? value : [])
    .map((item, position) => ({
      id: String(item.id || `milestone_${position}`),
      title: String(item.title || "").slice(0, 160),
      meaning: String(item.meaning || "").slice(0, 600),
      why: String(item.why || "").slice(0, 600),
      action: String(item.action || "").slice(0, 600),
      domain: String(item.domain || ""),
      kind: ["gate", "development", "evidence", "role"].includes(item.kind)
        ? item.kind : "development",
      sourceCode: String(item.sourceCode || ""),
    }))
    .filter((item) => item.title);
}

function textList(value) {
  return (Array.isArray(value) ? value : [])
    .map((item) => String(item).slice(0, 160))
    .filter(Boolean);
}
