# Helix market-data audit

Generated 2026-08-13 · dataset version 1.0 · jurisdiction United Kingdom

This report is produced by `tools/market_data/report.py` as part of every enrichment run. It exists to make data quality visible: which salaries come from a career-specific official source, which are derived, and what a person should look at next.

## Coverage

| | |
|---|---|
| Careers in the base taxonomy | 677 |
| Market-data records | 677 |
| Careers with a published salary range | **677** |
| Careers with typical weekly hours | 54 |
| Careers with an authoritative role description | 54 |
| Records past their review date | 0 |
| Records flagged for manual review | 0 |

## Salary evidence quality

| Evidence class | Careers | What it means |
|---|---|---|
| Career-specific guide (`VERIFIED_GUIDE`) | 54 | A career-specific salary range published by an official careers source for this job. |
| Strong estimate (`STRONG_ESTIMATE`) | 0 | A high-quality occupation or pay-framework mapping, but not a range published for this exact job title. |
| Indicative estimate (`INDICATIVE`) | 202 | Derived from closely related careers that do have stronger evidence, with any seniority difference priced in. |
| Limited-data estimate (`LIMITED_DATA`) | 421 | A median across the career's family and seniority level. A broad indication only. |

## Salary method

| Method | Careers |
|---|---|
| Family and seniority median | 421 |
| Derived from related careers | 202 |
| National Careers Service career profile | 54 |

## Title matching against external profiles

| Outcome | Careers |
|---|---|
| `no_match` | 576 |
| `exact_title` | 54 |
| `review_candidate` | 42 |
| `seniority_variant_rejected` | 5 |

`seniority_variant_rejected` is a deliberate outcome, not a failure. A career such as *Senior Biomedical Scientist* matches the *Biomedical scientist* profile on every content word, and accepting that would publish an entry-grade range as though it were career-specific fact. Those careers are derived instead, with the seniority difference applied and the evidence labelled honestly.

## Provider availability this run

- NCS_API_KEY is not set, so the Job Profiles API was not called. Salary evidence came from the public National Careers Service profiles and from derivation instead.

## Sources used

| Provider | Salary records |
|---|---|
| National Careers Service (public job profile) | 54 |

## Attribution

- Contains public sector information licensed under the Open Government Licence v3.0.
- Career salary and working-hours guidance: National Careers Service, Crown copyright.

## Limitations

- Salary figures are estimates for career comparison. They vary by employer, sector, location, experience, hours and working pattern.
- Derived estimates are statistics over careers that do have stronger evidence. They are not surveys of the specific job.
- Qualitative working-life fields (patient contact, laboratory, research and commercial intensity, remote potential, travel) are inferred from the taxonomy, not from labour-market surveys, and are labelled as derived.
- Professional registration requirements are a separate layer with its own verification state. Strong salary evidence never implies verified eligibility requirements, and the reverse is also true.
