# Helix upgrade — handoff for a fresh session

Paste this whole file as the opening prompt of a new session.

---

## What you are working on

**Helix Career Pathway Planner** — a static, privacy-first, rules-based career
navigator for UK life sciences and healthcare. 677 careers. No backend, no
accounts, no AI.

- Local: `C:\Users\dmamp\OneDrive\D A Mamphey Private\OPTYMUM SS LTD (Latest)\CODING\Claude Code\career-pathway`
- Repo: `https://github.com/dmamphey/helix-career-pathway-planner`
- Live: `https://tools.optymumss.com/helix-career-pathway-planner/`
- Spec pack: `C:\Users\dmamp\Downloads\Helix_CareerPath_Upgrade_Pack_v1.zip`
  (extract to a SHORT path such as `C:\Users\dmamp\AppData\Local\Temp\hx` —
  the filenames blow past Windows MAX_PATH inside a deep temp folder)

**Read `HELIX_CLAUDE_CODE_MASTER_UPGRADE_PROMPT.md` from that pack in full before
changing anything.** It is 2,238 lines and is the implementation specification.
The four JSON files beside it are already copied into `data/reference/`.

## Two known conflicts in the spec — do not silently "fix" these

1. **§4 and §74 name `/career-pathway/` as production and call
   `/helix-career-pathway-planner/` stale. That is inverted.** The pack predates a
   repository rename. `/career-pathway/` now 404s; the long path is live. Keep the
   live URL. Do not revert the references. Ask the user before changing either.
2. **§75 NCS API.** A Starter subscription exists and `NCS_API_KEY` is available,
   but there is nothing to call: the developer portal publishes **0 APIs**, every
   candidate route 404s, and the gateway answers identically with no key, a bad key
   and the real key — so requests never reach an API and auth is never evaluated.
   This is a product/routing problem at NCS, not a credential problem. The user is
   chasing an Unlimited subscription and asking NCS to attach the API. The provider
   already reads `NCS_API_BASE` from the environment, so no code change is needed
   when a route appears.

## State: three commits of upgrade work, all pushed

| Commit | What |
|---|---|
`26d5d1d` | Market-data pipeline + published dataset, 677/677 salary coverage |
`d52789b` | Browser market-data layer, salary on cards, Compare as first-class |
`797297d` | Transition effort + why-this-career |
`9bfd88f` | Metered-subscription controls: `--limit`, `--career-ids`, `--sample`, resumability |

### Done and verified

- `tools/market_data/` — cache, four providers (NCS API + NCS public, ONS, NHS,
  Skills England), title matcher, derive, resolver, validate, report, CLI.
- `data/helix_market_data_uk_v1.json` — 677/677 salary: **54 VERIFIED_GUIDE**
  (career-specific National Careers Service profiles), **202 INDICATIVE**,
  **421 LIMITED_DATA**. Validation passes.
- `js/market-data.js`, `js/comparison.js`, `js/transition-effort.js`,
  `js/views/compare.js`.
- Career cards: salary, evidence badge, hours, Compare toggle. Career ID and
  pathway-depth badges removed from cards.
- Compare: own state separate from Saved, toggles on Explorer/My Options/Saved
  cards, persistent tray, `#/compare/CP-003,CP-019` shareable route, "what stands
  out", mobile stacked layout.
- 54 pre-existing browser tests still pass.

## Invariants — breaking any of these is a regression

1. `data/careerpath_uk_careers_v1.json` is the supplied file, byte for byte.
   `sha256 835d7738a024706b020f09a30d8a5288d8205c80e6d1d97cc91f50bd099a1518`.
   Never edit it. Questionable records go in `docs/DATASET-AUDIT.md`.
2. No salary is published without `estimate_method`, `evidence_quality` and either
   a source record or methodology notes. `validate.py` enforces this independently
   of the resolver and must keep doing so.
3. **Seniority variants are never direct matches.** "Senior Biomedical Scientist"
   token-matches the "Biomedical scientist" profile at 1.0; accepting that would
   publish an entry-grade range as career-specific fact. They go to derivation.
4. **A registration gate is a floor, not a subtractable cost** (`transition-effort.js`).
   Adjacency discounts must not be able to make a regulated route somebody is not
   on read as a "lower transition". The check requires the recorded *profession* to
   match, not just the regulator — HCPC registers fifteen professions.
5. **A stated interest is never evidence.** Interests may nudge matching; they must
   never mark a capability as demonstrated.
6. CV stays local: no raw text in storage, no personal fields in the profile
   schema, no CV content to any provider. API keys never in frontend, output, logs
   or commits.
7. localStorage key stays `careerpath.v1`. Migrations add fields with defaults and
   never discard a saved profile.
8. Partial enrichment runs only ever *improve* a record (`improves()` in
   `enrich.py`). A limited run has few anchors, so unresolved careers come back
   empty — those must not overwrite good published records.

## What remains

### Phase 3 (finish) — preference fit  ← start here
Spec §30–§32. The biggest missing piece.
- New profile fields: salary aspiration, work-life-balance importance, shift and
  on-call tolerance, remote/hybrid preference, travel tolerance, patient-contact
  preference, lab/research/commercial/leadership orientation, retraining tolerance.
  Optional and skippable; local only; no personal identifiers.
- `js/preference-fit.js`: deterministic, scores only dimensions where **both** the
  preference and the career data exist, normalises over what is available, and
  never penalises a career for missing data. Labels: Very strong / Strong / Mixed /
  Low fit / Not enough preference data. Show contributing reasons and mismatches.
- **Must stay separate from background alignment.** Changing preferences must not
  change alignment scores — the spec asks for a test proving it.
- Wiring already exists: `careerCard({ fit })` renders a badge, and the Compare
  "Fit for you" panel has a slot.

### Phase 4 — Explorer, career detail, PDF
- **Explorer** (§35–§38): salary filter ("typical salary reaches at least £30k /
  £40k / …"), salary sort by `typical_high` descending with title-then-id
  tie-break, work-pattern/hours/remote/patient-contact/lab/research/commercial
  filters, effort and fit filters when a profile exists. Remove or demote pathway
  depth.
- **Career detail** (§39–§41): currently untouched and now inconsistent with the
  cards. Needs a decision header (salary, evidence, hours, work pattern, alignment,
  fit, effort), salary + working-life section with drill-down, role-specific
  description where authoritative (54 careers have one), Compare and Save actions,
  and removal of the career-ID and pathway-depth badges.
- **PDF plan** (§44): add salary and evidence label, working-life summary,
  transition effort, preference fit, and optionally "other options considered".

### Phase 5 — automation, docs, tests
- `.github/workflows/refresh-market-data.yml` (§47): `workflow_dispatch` + monthly,
  pinned deps, reads `NCS_API_KEY`, runs enrich → validate → audit, **fails if
  coverage is not 677/677 or if secrets appear in output**, opens a PR rather than
  pushing to `main`.
- `docs/MARKET-DATA-METHODOLOGY.md` (§66): readable by a non-developer.
- Tests (§56–§58): market-data integrity, resolver fixtures (exact match, alias,
  ambiguous rejection, derivation, family fallback, anomaly, large-change flag),
  Compare behaviour, preference determinism, privacy, GitHub Pages paths.
  Existing suite: `tests/suite.js`, run at `/tests/` in a browser.

## How to run and verify

```bash
python tools/serve.py                 # http://localhost:8766 (threaded, no-cache)
```
Tests: open `http://localhost:8766/tests/` — 54 should pass. They need fixtures:
```bash
python tests/make_fixtures.py
```
Enrichment (offline is safe and costs no API quota):
```bash
python tools/market_data/enrich.py --sample --limit 16 --offline --dry-run
python tools/market_data/enrich.py --all          # rebuilds the published dataset
python tools/market_data/validate.py
python tools/audit_dataset.py
```
When an NCS route finally exists:
```bash
NCS_API_BASE="<base URL>" NCS_API_KEY="<key>" python tools/market_data/enrich.py --sample --limit 10
```

## House style

Vanilla ES modules, no build step, no framework. Relative paths, hash routing.
Build DOM with `h()` from `js/ui.js`, never `innerHTML` for data. Every status
carries text or a symbol, never colour alone. British English. Comments explain
*why*, not what. Verify in a real browser before claiming something works.

## Ask the user about

1. The `/career-pathway/` vs `/helix-career-pathway-planner/` URL conflict.
2. Whether NCS has attached the API and supplied a base URL.
3. Whether to curate `data/reference/ncs_career_aliases.json` — 737 public NCS
   profiles exist and only 54 matched by exact title, so curated aliases would
   convert a large share of the 421 LIMITED_DATA estimates into career-specific
   evidence without waiting for anyone. Each entry is a human judgement.
