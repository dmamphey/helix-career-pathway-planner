# Helix market-data audit

Generated 2026-08-20 · dataset version 1.0 · jurisdiction United Kingdom

This report is produced by `tools/market_data/report.py` as part of every enrichment run. It exists to make data quality visible: which salaries come from a career-specific official source, which are derived, and what a person should look at next.

## Coverage

| | |
|---|---|
| Careers in the base taxonomy | 734 |
| Market-data records | 734 |
| Careers with a published salary range | **727** |
| Careers with typical weekly hours | 156 |
| Careers with an authoritative role description | 150 |
| Records past their review date | 0 |
| Records flagged for manual review | 0 |

## Salary evidence quality

| Evidence class | Careers | What it means |
|---|---|---|
| Career-specific guide (`VERIFIED_GUIDE`) | 156 | A career-specific salary range published by an official careers source for this job. |
| Strong estimate (`STRONG_ESTIMATE`) | 0 | A high-quality occupation or pay-framework mapping, but not a range published for this exact job title. |
| Indicative estimate (`INDICATIVE`) | 413 | Derived from closely related careers that do have stronger evidence, with any seniority difference priced in. |
| Limited-data estimate (`LIMITED_DATA`) | 158 | A median across the career's family and seniority level. A broad indication only. |

## Salary method

| Method | Careers |
|---|---|
| Derived from related careers | 413 |
| Family and seniority median | 158 |
| National Careers Service career profile | 156 |
| none | 7 |

## Title matching against external profiles

| Outcome | Careers |
|---|---|
| `no_match` | 562 |
| `exact_title` | 101 |
| `curated_alias` | 57 |
| `review_candidate` | 9 |
| `seniority_variant_rejected` | 5 |

`seniority_variant_rejected` is a deliberate outcome, not a failure. A career such as *Senior Biomedical Scientist* matches the *Biomedical scientist* profile on every content word, and accepting that would publish an entry-grade range as though it were career-specific fact. Those careers are derived instead, with the seniority difference applied and the evidence labelled honestly.

## Provider availability this run

- NCS_API_KEY is not set, so the Job Profiles API was not called. Salary evidence came from the public National Careers Service profiles and from derivation instead.
- 631 NHS Health Careers role pages indexed from the sitemap. Helix links to them and reproduces none of their content.

## Sources used

| Provider | Salary records |
|---|---|
| National Careers Service (public job profile) | 156 |

## Attribution

- Contains public sector information licensed under the Open Government Licence v3.0.
- Career salary and working-hours guidance: National Careers Service, Crown copyright.
- Links to NHS Health Careers are provided under the linking permission in its terms of use. Its content is not reproduced here and remains the property of NHS England.

## Alias candidates for human review

9 careers have a strong but inexact title match against an external job profile. None is used: only an exact title or a curated alias is accepted, because a wrong direct match publishes another job's salary as this one's fact.

Each row is one human decision. Confirming a row means adding the career's normalised title to `data/reference/ncs_career_aliases.json`, after which the next run promotes that career from a derived estimate to career-specific evidence. Rejecting a row means leaving it derived, which is already correct — so doing nothing here is safe.

Seniority variants are **not** listed. They are rejected on purpose and must stay rejected: aliasing one to its base profile would publish an entry-grade range for a senior post.

A score of 1.00 does **not** mean the two are the same job. Matching drops setting words such as *clinical*, *healthcare* and *NHS*, because they usually describe where a job is done rather than what it is. When the dropped word is the whole difference between the two titles, the score is high for the wrong reason — *Clinical Photographer* and *Photographer* are not one occupation. Those rows are flagged below and need the most careful reading, not the least.

| Career | Helix title | Closest external profile | Score | Currently | Note |
|---|---|---|---|---|---|
| CP-007 | Clinical Biochemist | Biochemist (`biochemist`) | 1.00 | Indicative estimate | Scores high only because *clinical* was dropped — check these are really one occupation |
| CP-018 | Clinical Photographer | Photographer (`photographer`) | 1.00 | Indicative estimate | Scores high only because *clinical* was dropped — check these are really one occupation |
| CP-135 | Clinical Dental Technician | Dental technician (`dental-technician`) | 1.00 | Indicative estimate | Scores high only because *clinical* was dropped — check these are really one occupation |
| CP-136 | Clinical Geneticist | Geneticist (`geneticist`) | 1.00 | Indicative estimate | Scores high only because *clinical* was dropped — check these are really one occupation |
| CP-312 | Clinical Pharmacologist | Pharmacologist (`pharmacologist`) | 1.00 | Indicative estimate | Scores high only because *clinical* was dropped — check these are really one occupation |
| CP-492 | Health Economist | Economist (`economist`) | 1.00 | Indicative estimate | Scores high only because *health* was dropped — check these are really one occupation |
| CP-427 | Healthcare Business Intelligence Analyst | Business analyst (`business-analyst`) | 0.67 | Indicative estimate | Scores high only because *healthcare* was dropped — check these are really one occupation |
| CP-515 | Pharmaceutical Sales Representative | Sales representative (`sales-representative`) | 0.67 | Indicative estimate |  |
| CP-560 | Public Health Intelligence Analyst | Intelligence analyst (`criminal-intelligence-analyst`) | 0.67 | Limited-data estimate | Scores high only because *health* was dropped — check these are really one occupation |

## Warnings

- 44 careers share the range (32000.0, 57000.0) outside the family fallback — check the resolver
- 47 careers share the range (27000.0, 57000.0) outside the family fallback — check the resolver

## Limitations

- Salary figures are estimates for career comparison. They vary by employer, sector, location, experience, hours and working pattern.
- Derived estimates are statistics over careers that do have stronger evidence. They are not surveys of the specific job.
- Qualitative working-life fields (patient contact, laboratory, research and commercial intensity, remote potential, travel) are inferred from the taxonomy, not from labour-market surveys, and are labelled as derived.
- Professional registration requirements are a separate layer with its own verification state. Strong salary evidence never implies verified eligibility requirements, and the reverse is also true.
