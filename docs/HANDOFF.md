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
   `/helix-career-pathway-planner/` stale. That is inverted — and this is now
   settled.** The pack predates a repository rename. `/career-pathway/` 404s; the
   long path is live. **Confirmed by the repository owner: the live URL is
   `https://tools.optymumss.com/helix-career-pathway-planner/`.** Every reference
   in the repository already says so. Do not apply §4. The README carries the same
   warning beside the deployment table.
2. **§75 NCS API.** A Starter subscription exists and `NCS_API_KEY` is available,
   but there is nothing to call: the developer portal publishes **0 APIs**, every
   candidate route 404s, and the gateway answers identically with no key, a bad key
   and the real key — so requests never reach an API and auth is never evaluated.
   This is a product/routing problem at NCS, not a credential problem. The user is
   chasing an Unlimited subscription and asking NCS to attach the API. The provider
   already reads `NCS_API_BASE` from the environment, so no code change is needed
   when a route appears.

## State: the upgrade is complete against §74

All phases of the specification are implemented and verified in a browser.

### Earlier commits

| Commit | What |
|---|---|
`26d5d1d` | Market-data pipeline + published dataset, 677/677 salary coverage |
`d52789b` | Browser market-data layer, salary on cards, Compare as first-class |
`797297d` | Transition effort + why-this-career |
`9bfd88f` | Metered-subscription controls: `--limit`, `--career-ids`, `--sample`, resumability |

### Done and verified

- `tools/market_data/` — cache, four providers (NCS API + NCS public, ONS, NHS,
  Skills England), title matcher, derive, resolver, validate, report, CLI.
- `data/helix_market_data_uk_v1.json` — 677/677 salary: **86 VERIFIED_GUIDE**
  (career-specific National Careers Service profiles), **352 INDICATIVE**,
  **239 LIMITED_DATA**. Validation passes. 83 attributed role summaries.
  32 curated aliases in `data/reference/ncs_career_aliases.json` took
  career-specific coverage from 54 to 86, and better anchors moved a further
  182 careers off the family-median fallback.
- `js/market-data.js`, `js/comparison.js`, `js/transition-effort.js`,
  `js/preference-fit.js`, `js/views/compare.js`, `js/views/preferences.js`.
- Career cards: salary, evidence badge, hours, fit, effort, Compare toggle.
  Career ID and pathway-depth badges removed.
- Compare: own state separate from Saved, toggles on Explorer/My Options/Saved/
  career pages, persistent tray, `#/compare/CP-003,CP-019` shareable route,
  "what stands out", mobile stacked layout, preference-fit rows.
- **Preference fit** (§30–§32): 12 optional questions at `#/preferences` and
  folded into the onboarding questions step. Scores only dimensions where both
  the preference and the career data exist, normalises over what was scored, and
  never penalises missing data. Kept entirely out of alignment.
- **Explorer** (§35–§37): salary "reaches at least" filter, seven sort orders,
  work-pattern / remote / patient-contact / lab / research / commercial /
  evidence / fit filters. Pathway depth demoted to Advanced filters and renamed
  "Helix content depth".
- **Career detail** (§39–§41): decision header, salary and working-life section
  with an "About this salary" drill-down dialog, authoritative role descriptions
  where they exist, Compare and Save, separate evidence sections.
- **Saved** (§42): its duplicate comparison table removed; it now drives the same
  selection every other screen drives.
- **PDF plan** (§44): salary and evidence, working life, the three measures with
  their reasons, "other options considered" from the shortlist, salary source.
- `.github/workflows/refresh-market-data.yml` (§47) and
  `docs/MARKET-DATA-METHODOLOGY.md` (§66).
- **Tests: 90 browser checks and 65 Python checks, all passing.**

### Two behaviour changes worth knowing about

1. **`matcher.js` no longer reads `profile.preferences`.** The "stated interests"
   component used to fold in an orientation-preference term, which is the exact
   conflation §31 forbids. No interface ever wrote those fields, so the term was
   a constant 0.5 for every real profile; it was replaced by the constant it
   contributed, and **no alignment score anybody has seen has changed**. The
   suite now tests that changing a preference cannot move a single score.
2. **The NCS public-profile parser was producing role summaries full of page
   furniture** ("Biomedical scientist Biomedical scientist Alternative titles for
   this job include Biomedical scientists test patient samples…"). It was
   invisible until the career page started rendering summaries. Fixed by
   anchoring the description at the job title used as its subject; the dataset
   was regenerated offline from the HTTP cache, so it cost no API quota. All 54
   now extract cleanly, and both suites test for the regression.

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

## What would come next

Nothing in the specification is outstanding. What is left is data quality, and
all of it needs either a decision or an external unblock.

1. **More aliases.** 32 are curated and 10 candidates were examined and
   deliberately rejected, with the reason recorded in the alias file so they are
   not re-litigated. The remaining opportunity is careers that produced no
   candidate at all because their titles share too few words with any profile —
   finding those needs a different search than the audit currently runs.
2. **Human-verified SOC 2020 codes.** There are still zero STRONG_ESTIMATE
   records, because the ONS tier needs a defensible SOC mapping and none is
   verified. This is now the largest single lever.
3. **The NCS API**, once it exists — see the conflict note above.
4. **Regional salary contexts.** The schema holds them; no data is loaded, and a
   blanket London multiplier would be worse than nothing.
5. **Work settings.** `work_settings` is empty for all 677: the public profile
   pages do not carry it in a form the parser can trust. The career page and
   Compare already say "Not yet available" rather than guessing.

## How to run and verify

```bash
python tools/serve.py                 # http://localhost:8766 (threaded, no-cache)
```
Browser tests: open `http://localhost:8766/tests/` — **90 should pass**. They need
fixtures:
```bash
python tests/make_fixtures.py
```
Pipeline tests — no browser, no network, no API quota. **65 should pass**:
```bash
python tools/market_data/tests.py
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

Both conflicts noted at the top of this file are still open and still unresolved
in the pack's favour: the live URL has not been changed, and the NCS provider
still reads `NCS_API_BASE` from the environment.

## Ask the user about

1. The `/career-pathway/` vs `/helix-career-pathway-planner/` URL conflict. The
   long path is still live and the README still says so; §4 of the pack still
   says the opposite. Nothing has been changed either way.
2. Whether NCS has attached the API and supplied a base URL.
3. Whether to curate `data/reference/ncs_career_aliases.json`, and whether to
   commission verified SOC 2020 mappings — items 1 and 2 above.
