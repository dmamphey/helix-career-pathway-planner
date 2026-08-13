# How Helix works out salary and working-life information

This document explains where every salary figure in Helix comes from, how firmly
each one is grounded, and what it does and does not mean. It is written to be
read by anyone assessing whether the numbers can be trusted — no programming
knowledge is needed.

The short version: Helix publishes a salary range for all 677 careers, but it
does not pretend they are all equally well evidenced. **54 come from an official
careers guide written for that exact job. The other 623 are estimates, and every
one of them is labelled as an estimate wherever it appears.**

---

## 1. What the numbers are, and what they are not

A Helix salary range is **a decision-support estimate for comparing careers**. It
is a description of what a career typically pays in the UK.

It is **not**:

- an offer, or a prediction of what you personally would be paid
- a statement about a particular employer, region or grade
- a guarantee that any job at that salary currently exists

Pay varies substantially by employer, sector, location, experience, hours and
working pattern. Two people with the same job title can be paid very differently
and both be normal.

Helix rounds figures to sensible whole amounts. You will see "£30k to £53k", not
"£43,281". False precision is a way of implying research that was never done.

---

## 2. The two datasets, and why they are separate

Helix keeps two files, deliberately apart:

| File | What it holds | How often it changes |
|---|---|---|
| `data/careerpath_uk_careers_v1.json` | The 677 UK careers themselves: titles, families, tags, regulation status, official sources | Rarely. Treated as supplied and never edited by the pipeline |
| `data/helix_market_data_uk_v1.json` | Salary, hours, working patterns and role descriptions, one record per career | Monthly, or whenever a source updates |

Salary is volatile; a career taxonomy is not. Mixing them would mean rewriting
the careers file every time a pay figure moved, and every rewrite of a hand-built
reference file is a chance to corrupt it. The two are joined in memory by career
id when the application loads.

The refresh process checks that the careers file has not changed at all, and
fails if it has.

---

## 3. Where the data comes from

All sources are official UK bodies. Helix does not use recruitment marketing
pages, salary blogs, forums or search-engine results as evidence of anything.

### National Careers Service

The National Careers Service publishes a job profile for each of roughly 737
careers, including a salary range for a starter and for an experienced worker,
typical weekly hours, working patterns and a description of the role. This is the
preferred source, because it is written about a specific job rather than a
statistical occupation group.

Helix uses it in two ways: through the Job Profiles API where a subscription key
is configured, and otherwise from the public job-profile pages. Both are Crown
copyright, published under the Open Government Licence v3.0.

**Current status:** the Job Profiles API is subscribed to but not yet reachable —
the developer portal currently publishes no APIs to call, and every candidate
route returns "not found" whether a key is supplied or not. This is a
provisioning matter with the National Careers Service, not a problem with the
key. The pipeline is written against the API and will use it the moment a working
base URL exists; until then it uses the public profiles, which carry the same
published figures.

### Office for National Statistics

ONS Annual Survey of Hours and Earnings data gives earnings by occupation, keyed
to Standard Occupational Classification (SOC) codes. It is the main official
fallback when no career-specific guide exists.

A four-digit SOC code describes a reasonably specific occupation; a two-digit
code describes a broad group. Helix records which was used and grades the
evidence accordingly. A broad group estimate is never presented as though it
described the exact job.

### NHS and public-sector pay frameworks

Where a career has been deliberately mapped to a public-sector pay band by a
person, Helix can show that band as **context alongside** the market estimate,
never instead of it.

Helix will not infer an Agenda for Change band from a job title. Words like
"Senior", "Specialist" and "Manager" mean different things in different
organisations, and guessing a band from one of them would produce an official
looking number with nothing behind it. England, Scotland, Wales and Northern
Ireland are kept separate, because their pay frameworks are separate.

### Skills England

Used for occupational mapping where it links a career to a SOC code. Not used as
a salary source.

---

## 4. How a salary is chosen

Every career goes through the same five steps, in order, and stops at the first
one that produces a defensible answer.

**Step 1 — A careers guide written for this exact job.**
If a National Careers Service profile matches the career by title, and the two
are genuinely compatible, its published range is used directly.
Result: **Career-specific guide**.

**Step 2 — A verified public-sector pay framework.**
Only where somebody has curated the mapping. Used as the main range only when it
is more specific to the role than anything else available.
Result: **Strong estimate**.

**Step 3 — Official occupation earnings.**
ONS earnings for the most detailed SOC code that can be defended.
Result: **Strong estimate** for a specific four-digit mapping, **Indicative
estimate** for a broad group.

**Step 4 — Closely related careers.**
Where no direct source exists, the range is derived from careers that *do* have
stronger evidence and are genuinely similar — measured on shared subject tags,
career family, seniority level and title wording. It uses a similarity-weighted
median across several careers, not the highest or the nearest single one.
Result: **Indicative estimate**.

**Step 5 — Family and seniority median.**
The last resort, and the reason all 677 careers have a figure: a robust median
across careers in the same family at a comparable level.
Result: **Limited-data estimate**.

### Why a good match is sometimes refused

Title matching does not accept a match merely because it would improve coverage.
"Senior Biomedical Scientist" matches the "Biomedical scientist" profile
perfectly on words, but accepting it would publish an entry-grade range as a
career-specific fact about a senior post. Seniority variants are always sent to
derivation instead.

A transparent derived estimate is better than a confident wrong one.

---

## 5. What the evidence labels mean

Every figure in Helix carries one of these, and it is shown next to the number
rather than hidden in a footnote.

| Label | What it means | Count |
|---|---|---|
| **Career-specific guide** | An official careers source published this range for this exact job | 54 |
| **Strong estimate** | A high-quality occupation or pay-framework mapping, but not published for this exact title | 0 |
| **Indicative estimate** | Derived from closely related careers with stronger evidence | 202 |
| **Limited-data estimate** | A median across the career's family and seniority level. A broad indication only | 421 |

There are currently no Strong estimates. That is because the ONS occupation step
requires a defensible SOC mapping, and Helix does not yet have human-verified SOC
codes for these careers. Curating them is the single change that would move the
largest number of careers up a grade, and it is the honest reason the figure is
zero rather than an oversight.

The other route to better coverage is a curated list of alternative titles for
the National Careers Service profiles. 737 public profiles exist and only 54
matched by exact title, so a set of human-checked aliases would convert a
substantial share of today's Limited-data estimates into career-specific
evidence. Each alias is a judgement a person has to make, which is why they are
not generated automatically.

`docs/MARKET-DATA-AUDIT.md` lists the 42 careers currently one decision away,
each with the profile it nearly matched. Two warnings apply to that list. A high
score is not agreement: matching ignores setting words like *clinical* and
*healthcare*, so *Clinical Photographer* and *Photographer* both reduce to the
same tokens and score 1.00 while plainly being different jobs — those rows are
flagged. And seniority variants are excluded entirely, because aliasing *Senior
Biomedical Scientist* to the entry-grade profile would publish a starter salary
as fact about a senior post.

---

## 6. Working life: hours, patterns and the inferred measures

Two very different kinds of information sit side by side here, and Helix
distinguishes them everywhere they appear.

**Recorded by a source.** Typical weekly hours and working patterns — shifts,
evenings and weekends, on-call, bank holidays — come from official job profiles.
They exist for the 54 careers with a matched profile. For the other 623 Helix
shows "Not yet available" rather than estimating them.

**Inferred from the taxonomy.** Patient contact, laboratory intensity, research
intensity, commercial intensity, remote potential and travel are worked out from
what each career's own subject tags say it involves. They exist for all 677.

The second kind is genuinely useful for narrowing a list of careers, and it is
not survey data. Every screen that shows these values says so.

---

## 7. Role descriptions

Where an official job profile has been matched, Helix shows that profile's
description of the role and attributes it.

Where none has been matched, Helix shows a description of the **career family**
and states plainly that this is what it is. It does not generate a role-specific
description. Writing confident prose about 623 jobs from nothing would be the
fastest way to make everything else on the page untrustworthy.

---

## 8. How often it is checked, and how you can tell

Every record carries the date it was last checked and a date it is next due for
review.

"Last checked" means **the date the evidence was obtained**, not the date the
pipeline last ran. A record whose salary came from a National Careers Service
profile is dated the day that page was actually fetched, and re-running the
pipeline against its local cache does not move that date forward — otherwise
every record would look permanently fresh and nothing would ever be flagged for
review. Only a derived estimate carries the date of the run, because the
derivation genuinely is the thing that happened that day.

| Source | Review interval |
|---|---|
| National Careers Service | Every 90 to 180 days |
| NHS and public-sector pay | After each annual pay announcement, and at least yearly |
| ONS earnings | After each annual release |
| Derived estimates | Recomputed whenever the sources they derive from change |

A record past its review date is shown with a "due review" note. Stale data is
flagged, not hidden.

The refresh runs automatically on the third of each month and can also be
triggered by hand. It never writes to the live site directly: it opens a pull
request for a person to review, because a salary figure moving is a content
decision. Before a pull request can be opened at all, the run must show that all
677 careers still have a publishable salary, that the data still matches its
schema, that the careers file is untouched, and that no API key appears anywhere
in the generated output.

Any figure that has moved by more than 30 per cent is flagged for a human to look
at rather than being published silently.

---

## 9. Privacy

The end-user browser never contacts the National Careers Service, the ONS, NHS
Employers, Skills England or any salary website. Opening a career page triggers
no outside request of any kind.

All market data is read from one static file served by Helix itself. This is why
the figures never change between page views, why the application works offline
once loaded, and why using Helix reveals nothing to anybody about which careers
you looked at.

Data collection happens only in the enrichment pipeline, which runs on a build
machine, never in a browser, and never sees a CV. API keys exist only as build
secrets; the refresh fails if one ever appears in a published file.

---

## 10. Attribution

Contains public sector information licensed under the
[Open Government Licence v3.0](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/).

Career salary and working-hours guidance: National Careers Service, Crown
copyright. Earnings statistics: Office for National Statistics, Crown copyright.

Helix does not claim ownership of Crown copyright source data.

---

## 11. Known limitations

- **Regional variation is not modelled.** All figures are UK-wide. The schema can
  hold regional ranges, but applying a blanket London uplift to every career
  would invent a pattern that does not exist evenly across sectors.
- **No progression forecasting.** Helix will not tell you what you might earn in
  five years. Where it shows a progression route, each step links to that
  career's own published range with its own evidence label.
- **No live vacancy data.** Helix does not know how many roles are currently
  advertised.
- **The salary and requirements evidence are independent.** A career can have a
  well-sourced salary and entirely unverified entry requirements, or the reverse.
  They are shown separately, with separate dates, so neither is read as
  vouching for the other.
- **Coverage depends on title matching.** A career with an unusual title gets a
  weaker estimate than an identical job with a common one. This is a limitation
  of matching by name, and it is why the evidence label is shown every time.

---

## 12. Where to look next

- `docs/MARKET-DATA-AUDIT.md` — the current counts: coverage, evidence classes,
  methods, records needing review, stale records
- `docs/DATASET-AUDIT.md` — questions raised about the supplied career taxonomy
- `data/reference/helix_salary_source_registry_uk_v1.json` — the approved source
  list and the priority order
- The **My data** screen inside Helix — the same figures, in the application
