# Helix Career Pathway Planner

**Career navigation for life sciences and healthcare professionals.**

A tool by Optymum SS. Production URL:
`https://tools.optymumss.com/helix-career-pathway-planner/`

Helix answers four questions for somebody working in, or moving into, UK life
sciences and healthcare:

1. Where am I now?
2. What career options are realistically open to me?
3. What am I missing for the route I choose?
4. What should I do next?

It turns a CV — or a manually built profile — into a structured career profile,
compares that profile against 677 UK career destinations, and produces a pathway,
a gap analysis and exactly three next actions.

It is a static browser application. No backend, no accounts, no AI service.

## What it is not

- It is not an AI career adviser. There is no LLM anywhere in it. Matching is
  deterministic: the same profile always produces the same ranking.
- It does not predict whether you will get a job, and never shows a percentage
  chance of anything.
- It does not determine professional eligibility. Where a career is regulated,
  Helix says so, links to the regulator, and asks you to confirm your own
  position. It does not restate registration criteria it has not verified.

## Architecture

```text
CV or manual entry
        │
        ▼
ProfileInterpreter.parse()        rule-based, local, replaceable
        │
        ▼
Structured career profile         the only thing the engines see
        │
        ├──► Career matching engine     deterministic score, qualitative labels
        │
        ├──► Gap engine                 four requirement categories
        │
        ├──► Pathway engine             milestones, from a rule pack or generated
        │
        ├──► Action engine              exactly three, prioritised
        │
        ├──► Adjacency engine           similar careers, next moves, pivots
        │
        ├──► Preference fit             stated priorities, scored separately
        │
        └──► Transition effort          how big the move is, separately again
```

Three measures are reported, and they are deliberately never merged:

| Measure | Answers | Source |
|---|---|---|
| **Background alignment** | How much of this career do I already do? | `matcher.js` |
| **Preference fit** | Would I want this job? | `preference-fit.js` |
| **Transition effort** | How big a move is it? | `transition-effort.js` |

A career can score well on one and badly on another — that is the information a
single blended number would destroy. Changing a stated preference cannot move an
alignment score, and the suite tests that directly.

Vanilla ES modules, no build step, no framework.

```text
helix-career-pathway-planner/
├── index.html                  application shell
├── styles.css                  all styling, including the print stylesheet
├── js/
│   ├── app.js                  state and wiring
│   ├── router.js               hash routing
│   ├── ontology.js             domains, synonyms, family metadata  ← configuration
│   ├── career-data.js          dataset loading, indexing, derived attributes
│   ├── profile.js              profile schema, demo profiles
│   ├── cv-parser.js            text extraction and the profile interpreter
│   ├── matcher.js              scoring, banding, grouping
│   ├── gap-engine.js           requirement categories and gap analysis
│   ├── pathway-engine.js       milestones and statuses
│   ├── action-engine.js        the next three actions
│   ├── adjacency.js            the career graph
│   ├── rules.js                career rule pack loader
│   ├── market-data.js          salary, hours and role context
│   ├── preference-fit.js       stated priorities, scored separately
│   ├── transition-effort.js    how big a move is, and why
│   ├── comparison.js           compare selection and "what stands out"
│   ├── storage.js              localStorage, export and import
│   ├── ui.js                   shared interface components
│   └── views/                  one module per screen
├── data/
│   ├── careerpath_uk_careers_v1.json    the supplied dataset, unmodified
│   ├── helix_market_data_uk_v1.json     generated: salary and working life
│   ├── career_rules/                    optional researched packs
│   └── reference/                       schema, seed and source registry
├── tools/market_data/          the enrichment pipeline, and its tests
├── assets/vendor/              PDF.js and Mammoth (fetched, not committed)
├── docs/
│   ├── DATASET-AUDIT.md            generated audit of the launch dataset
│   ├── MARKET-DATA-AUDIT.md        generated salary coverage and quality
│   └── MARKET-DATA-METHODOLOGY.md  where every salary comes from
├── .github/workflows/          monthly market-data refresh
├── tests/                      browser test suite and CV fixtures
└── tools/                      dev server, library fetch, dataset audit
```

Routing is hash-based (`#/explore`, `#/career/CP-003`, `#/pathway/CP-003`) so every
URL resolves to `index.html`. A refresh or a shared link cannot produce a GitHub
Pages 404. All paths are relative, so the app works from any subdirectory.

## Local CV processing

The CV is read in the browser and never leaves the device.

- `extractText()` reads the file with PDF.js, Mammoth or `File.text()`.
- `redactPersonalData()` strips emails, telephone numbers, postcodes and links
  from the working text **before** any parsing happens.
- `ProfileInterpreter.parse()` builds the structured profile from the redacted
  text. Evidence strings attached to the profile are always phrases from
  Helix's own vocabulary in `ontology.js`, never spans copied out of the
  document — so a sentence containing a name or a patient detail cannot travel
  with the profile.
- The raw text is a local variable in the upload handler. It is never assigned to
  application state, storage or a global, and goes out of scope when the handler
  returns.
- The profile schema has no fields for name, email address, telephone number,
  postal address or employer. A field that does not exist cannot be filled in
  later by mistake.

Profile confirmation is mandatory. Extraction is a draft; the person it describes
is the only authority on whether it is right, and every field is editable.

### Supported formats

| Format | Reader | Notes |
|---|---|---|
| PDF (text-based) | PDF.js | Lines are reconstructed from glyph positions |
| DOCX | Mammoth | |
| TXT | native | |

There is no OCR. A scanned PDF produces a clear message and an offer to build the
profile manually — never a silently empty profile.

The two libraries are fetched into `assets/vendor/` and served from your own
domain:

```bash
python tools/fetch_libraries.py
```

If `assets/vendor/` is absent the app falls back to a public CDN, so development
works without the download. A real deployment should run it: a privacy-first tool
should not have to contact a third party in order to read a CV.

## Dataset

```text
Helix UK Life Sciences & Healthcare Career Dataset
Version 1.0, generated 2026-08-12, 677 careers, United Kingdom
```

`data/careerpath_uk_careers_v1.json` is the supplied file, byte for byte. Nothing
in the codebase edits, reorders or filters out a supplied record.

Each record carries an id, title, family, jurisdiction, regulatory status,
regulator or body, pathway depth, core tags, a typical entry signal, official
source codes and a verification date. There are no per-career descriptions or
requirements, which is why Helix describes a career's *family* rather than
inventing prose about the role.

Derived attributes — domains, work orientations, a search index — are computed at
load time from fields the dataset already contains, under a `derived` key so it is
always clear which is which.

`pathway_depth` (Deep 66, Standard 438, Explorer 173) controls how much structure
is built, never how trustworthy the content is. All 677 careers are searchable,
matchable, selectable as a target, and able to produce a pathway.

## How matching works

Every career is scored out of 100 across eight components:

| Component | Weight |
|---|---|
| Role and title similarity | 15 |
| Skill and subject overlap | 25 |
| Education alignment | 15 |
| Relevant sector exposure | 10 |
| Relevant experience | 10 |
| Transferable strengths | 10 |
| Stated interests | 10 |
| Professional context | 5 |

Scores map to four labels — Strong alignment, Good alignment, Worth exploring,
Bigger career pivot — and the labels are what the interface shows. The number is
described as an internal development alignment indicator, never as a probability.

Ties break on career id, so the ranking is reproducible. Results group into
*closest*, *strong adjacent* and *bigger pivots*, each capped per career family so
that "bigger pivots" does not fill up with twelve variants of one job.

**Mandatory requirements are computed separately from the score**, in
`gap-engine.js`. That separation is the point: a strong alignment can never bury a
registration requirement, because the two never touch.

**Stated working-life preferences are not part of this score either.** They used
to contribute to the "stated interests" component, which meant one number was
answering two questions — how much of this career do I already do, and how much
would I enjoy it. They now feed `preference-fit.js` alone.

## How preference fit works

Twelve optional questions about what somebody wants from working life: a salary
target, how much hours and pattern matter, remote working, travel, and how much
patient contact, laboratory work, research, commercial work and leadership they
want. Every one defaults to "No preference", and an unanswered question is left
out of the scoring rather than counted as indifference.

Three rules keep the result honest:

1. **A dimension is scored only when both halves exist** — a stated preference
   and a recorded value for that career. Typical weekly hours exist for 54 of the
   677 careers, so the hours dimension is simply absent for the other 623.
2. **The result is normalised over the dimensions actually scored**, never over
   the full list.
3. **Missing career data never subtracts.** There is no neutral filler and no
   penalty term.

A stated tolerance that rules nothing out is also left unscored: somebody happy
to work shifts is not better matched to a shift job than to a nine-to-five one,
and scoring it would inflate every label they see without telling them anything.

Results are labelled Very strong fit, Strong fit, Mixed fit, Low fit, or "Not
enough preference data", and the contributing reasons and mismatches are shown
alongside. It is never described as a probability.

## How transition effort works

A third measure again, from `transition-effort.js`: verified requirements, formal
training routes, the number of genuine development gaps, and how adjacent the
person's existing sector and skills are. Salary and popularity are deliberately
not inputs.

One rule matters more than the rest: **a registration gate is a floor, not a cost
that adjacency can pay off.** Without it, an HCPC-registered biomedical scientist
was told that Clinical Scientist is a "lower transition" — the same-family
discount cancelled out the registration requirement. Registration as one
profession is not a licence to practise as another, even under the same
regulator, so the check requires the recorded *profession* to match, not just the
regulator. HCPC registers fifteen of them.

## Requirements and verification

Four categories:

| Category | Meaning |
|---|---|
| **Required** | Verified against a current official source. Only a rule pack with `requirementsVerified: true` can produce one. |
| **Must be confirmed officially** | The dataset shows a requirement applies; Helix cannot say what it means for you. |
| **Usually expected** | Common expectations. Not universal rules. |
| **Career-enhancing / Optional** | Strengthens a move, or is route-dependent. |

`rules.js` enforces the first row in code: an unverified pack's `required` items
are demoted to "usually expected" and labelled as demoted, whatever the file says.
Mandatory-sounding content and verified provenance travel together or not at all.

Where nothing is verified, the interface says so and links to the source:

> Helix has not yet verified a full role-specific requirements pack for this
> career. Use the official sources below to confirm current entry and registration
> requirements.

## What is and is not stored

Stored, in one `localStorage` key on the user's own device:

- the structured career profile
- selected target career id and saved career ids
- milestone progress, keyed by career id
- the dataset version the progress was built against

Never stored: the CV, its text, name, email address, telephone number, postal
address, employer names. `storage.js` passes everything through
`normaliseProfile()`, which copies known fields and drops the rest — so unknown or
injected fields cannot survive a save.

Export and import use a plain JSON file. Reset deletes everything after a
confirmation dialogue.

## Running locally

```bash
python tools/serve.py
```

Then open `http://localhost:8766/`. It must be served over http, not opened as a
file: ES modules and the dataset `fetch` both need an http origin. The dev server
sends `Cache-Control: no-store`, because heuristic caching of ES modules makes
edits appear to do nothing.

## Testing

```text
http://localhost:8766/tests/
```

90 checks run in the browser — that is where the parsers need real `File` objects
and the storage guarantees need a real `localStorage`. They cover dataset
integrity, ontology coverage, PDF/DOCX/TXT extraction, the scanned-PDF fallback,
determinism, grouping, the requirement separation, pathway generation for a sample
spanning every family and depth, exactly-three actions, adjacency, storage
including hostile input, market-data completeness for all 677 careers, comparison
selection and its shareable route, preference determinism and its separation from
alignment, and the deployment path rules.

Build the CV fixtures first (they are generated, not committed):

```bash
python tests/make_fixtures.py
```

Note: the storage tests write to and clear Helix's localStorage key on that
origin. Do not run them in a browser profile holding a profile you want to keep.

The enrichment pipeline has its own suite, which needs no browser and no network:

```bash
python tools/market_data/tests.py
```

65 checks covering title matching (including the rule that a seniority variant is
never a direct match), salary derivation, range rounding, profile-page parsing,
record freshness, the alias worklist, the published file's completeness, and the
validator's ability to reject data the resolver would never produce.

### Testing privacy yourself

1. Open the app with the browser developer tools on the Network tab.
2. Upload `tests/fixtures/fictional-cv.txt`, which contains the deliberately
   recognisable fake values `Jane Example`, `jane.example@example.test`,
   `07123 456789` and `Example Diagnostics Ltd`.
3. Walk through review, questions, a pathway and the plan.
4. Search the network log for those values. Requests for the app's own files,
   the dataset and the rule packs are expected. Nothing else should appear, and
   none of those values should appear in any request.
5. In Application → Local Storage, open `careerpath.v1` and search it for the
   same values.

## Deploying to GitHub Pages

The app is a static site. From the repository root:

```bash
python tools/fetch_libraries.py
```

Commit everything including `assets/vendor/`, then enable Pages for the branch.
Because all paths are relative and routing is hash-based, it works unchanged at
`/helix-career-pathway-planner/` or any other subdirectory. `.nojekyll` is present
so that Pages does not run the files through Jekyll.

Live deployment:

| | |
|---|---|
| Application | <https://tools.optymumss.com/helix-career-pathway-planner/> |
| Alternative URL | <https://dmamphey.github.io/helix-career-pathway-planner/> |
| Repository | <https://github.com/dmamphey/helix-career-pathway-planner> |

The path comes from the repository name: the custom domain is attached to the
`dmamphey.github.io` user site, and project repositories are served beneath it. So
renaming the repository renames the public URL, and the two cannot drift apart.

> **If you are working from the v1 upgrade pack, ignore its §4.** That document
> names `/career-pathway/` as production and calls `/helix-career-pathway-planner/`
> a stale reference to be cleaned up. It is the wrong way round: the pack predates
> the repository rename, the short path now 404s, and the long one is live. This
> has been confirmed and the URLs above are correct. Do not "fix" them.

## Extending it

**Add a career.** Add the record to
`data/careerpath_uk_careers_v1.json`, keeping the same fields, and bump
`career_count` and `version`. No code changes: domains, orientations, search and
matching are all derived. If it introduces a new `core_tags` value, map that tag to
domains in `TAG_DOMAINS` in `js/ontology.js` — the test suite fails if a tag is
unmapped.

**Add or update a career rule pack.** Create `data/career_rules/CP-xxx.json` and
add the id to `data/career_rules/index.json`. Use `CP-272.json` (unregulated) or
`CP-003.json` (statutory) as templates. Leave `required` empty and
`requirementsVerified: false` until the requirements have actually been checked
against current official sources; then set `requirementsVerified: true` with a
`verifiedDate`. The order items appear in a pack is treated as editorial priority
and is respected by the action engine.

**Update source verification dates.** `last_verified` per career in the dataset,
`verifiedDate` per rule pack. Both are displayed. Re-run
`python tools/audit_dataset.py` afterwards.

**Add a jurisdiction.** The profile carries `jurisdiction`, and the dataset is
UK-only. A future jurisdiction pack would be a second dataset file plus a
jurisdiction selector; nothing in the engines assumes the UK beyond the
configuration in `ontology.js` and `matcher.js`.

**Add AI later.** Implement an alternative `ProfileInterpreter.parse()`. Nothing
downstream sees raw CV text, so an AI interpreter can only produce a structured
profile — it cannot invent career requirements, because the deterministic rules and
the official-source layer remain the source of truth for those.

## Dataset audit

```bash
python tools/audit_dataset.py
```

Writes `docs/DATASET-AUDIT.md`. It never modifies the dataset: questionable
records stay in the launch taxonomy and are documented for a human decision.

## Limitations

- No per-career descriptions exist in the dataset, so the detail screen describes
  the career *family* and says that it is doing so.
- Requirements are unverified for all 677 careers at launch. Two structural rule
  packs exist (CP-003, CP-272), neither carrying verified requirements.
- The parser is rule-based and conservative. It will miss things, which is why
  review is mandatory and every field is editable.
- No OCR, so scanned CVs cannot be read.
- No salary data, and none should be added without a maintainable UK source.
- Alignment reflects the dataset's tags and your profile, not the live job market.
  The third action on every plan is to check the plan against real adverts.

## Disclaimer

Helix provides career-development guidance and decision support. It does not
determine professional eligibility, guarantee employment or replace advice from
regulators, professional bodies, employers or training providers. Always confirm
current mandatory requirements with the relevant official organisation.
