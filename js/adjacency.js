/**
 * The career graph.
 *
 * Adjacency is computed, not curated: 716 careers would need hundreds of
 * thousands of hand-made connections, and they would rot. Instead a similarity
 * score is derived from what the dataset already knows — shared tags, family
 * proximity, title wording and seniority — and a rule pack can override or add to
 * the result where somebody has done the research.
 *
 * The same computation answers three different questions, which is why they share
 * one function: similar careers, next moves up, and pivots that reuse existing
 * skills.
 */

import { RELATED_FAMILIES } from "./ontology.js";
import { seniorityOf } from "./career-data.js";

/**
 * Similarity between two careers, 0 to 1.
 *
 * Weights: shared tags carry the most, because they are the dataset's own
 * statement about what a career involves. Family relationships fill in where tags
 * are sparse, which matters for Explorer-depth records.
 */
export function similarity(a, b) {
  if (a.id === b.id) return 1;

  const tagsA = new Set(a.core_tags || []);
  const tagsB = new Set(b.core_tags || []);
  const sharedTags = [...tagsA].filter((tag) => tagsB.has(tag)).length;
  const tagScore = sharedTags / Math.max(1, Math.min(tagsA.size, tagsB.size));

  const domainsA = new Set(a.derived.domains);
  const domainsB = new Set(b.derived.domains);
  const sharedDomains = [...domainsA].filter((d) => domainsB.has(d)).length;
  const domainScore = sharedDomains
    / Math.max(1, Math.min(domainsA.size, domainsB.size));

  let familyScore = 0;
  if (a.family === b.family) familyScore = 1;
  else if ((RELATED_FAMILIES[a.family] || []).includes(b.family)) familyScore = 0.6;

  const tokensA = new Set(a.derived.titleTokens);
  const tokensB = new Set(b.derived.titleTokens);
  const sharedTokens = [...tokensA].filter((t) => tokensB.has(t)).length;
  const titleScore = sharedTokens
    ? sharedTokens / Math.max(1, Math.min(tokensA.size, tokensB.size)) : 0;

  return 0.35 * tagScore + 0.25 * domainScore + 0.25 * familyScore
       + 0.15 * titleScore;
}

/**
 * Careers adjacent to one career.
 *
 * `mode` shapes what "adjacent" means:
 *   similar   closest overall, any seniority
 *   next      similar but a step more senior — the progression question
 *   pivot     shares real skills but sits in a different family
 */
export function adjacentCareers(career, careers, options = {}) {
  const mode = options.mode || "similar";
  const limit = options.limit || 6;
  const pack = options.pack || null;
  const here = seniorityOf(career.title);

  const scored = [];
  for (const other of careers) {
    if (other.id === career.id) continue;
    let score = similarity(career, other);
    const there = seniorityOf(other.title);

    if (mode === "next") {
      // One step up is the interesting answer; two steps is aspiration and the
      // same level is a sideways move, so both are damped rather than excluded.
      const step = there - here;
      if (step <= 0) score *= 0.25;
      else if (step === 1) score *= 1.25;
      else score *= 0.7;
    } else if (mode === "pivot") {
      if (other.family === career.family) continue;
      // A pivot has to be reachable: real overlap, different field.
      if (score < 0.2) continue;
      score *= 1.1;
    }
    scored.push({ career: other, score });
  }

  scored.sort((a, b) => b.score - a.score
    || a.career.id.localeCompare(b.career.id));

  // Curated ids from a rule pack come first, in the order the pack lists them.
  const curated = [];
  if (pack && pack.adjacentCareerIds.length && mode === "similar") {
    const byId = new Map(careers.map((c) => [c.id, c]));
    for (const id of pack.adjacentCareerIds) {
      const found = byId.get(id);
      if (found) curated.push({ career: found, score: 1, curated: true });
    }
  }

  const seen = new Set(curated.map((item) => item.career.id));
  const out = [...curated];
  for (const item of scored) {
    if (out.length >= limit) break;
    if (seen.has(item.career.id)) continue;
    seen.add(item.career.id);
    out.push(item);
  }
  return out.slice(0, limit);
}

/**
 * Careers that reuse a profile's strengths but sit outside its current family.
 *
 * Used on the profile screen, where the question is "what else could I do?"
 * rather than "what is like this job?".
 */
export function pivotsFromProfile(ranked, profile, limit = 6) {
  const home = profile.currentCareerFamily;
  const out = [];
  const families = new Set();
  for (const match of ranked) {
    if (out.length >= limit) break;
    if (!home || match.career.family === home) continue;
    if (families.has(match.career.family)) continue;
    if (match.score < 30) continue;
    families.add(match.career.family);
    out.push(match);
  }
  return out;
}
