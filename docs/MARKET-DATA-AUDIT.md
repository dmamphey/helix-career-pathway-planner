# Helix market-data audit

Generated 2026-08-14 · dataset version 1.0 · jurisdiction United Kingdom

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

## Alias candidates for human review

42 careers have a strong but inexact title match against an external job profile. None is used: only an exact title or a curated alias is accepted, because a wrong direct match publishes another job's salary as this one's fact.

Each row is one human decision. Confirming a row means adding the career's normalised title to `data/reference/ncs_career_aliases.json`, after which the next run promotes that career from a derived estimate to career-specific evidence. Rejecting a row means leaving it derived, which is already correct — so doing nothing here is safe.

Seniority variants are **not** listed. They are rejected on purpose and must stay rejected: aliasing one to its base profile would publish an entry-grade range for a senior post.

A score of 1.00 does **not** mean the two are the same job. Matching drops setting words such as *clinical*, *healthcare* and *NHS*, because they usually describe where a job is done rather than what it is. When the dropped word is the whole difference between the two titles, the score is high for the wrong reason — *Clinical Photographer* and *Photographer* are not one occupation. Those rows are flagged below and need the most careful reading, not the least.

| Career | Helix title | Closest external profile | Score | Currently | Note |
|---|---|---|---|---|---|
| CP-007 | Clinical Biochemist | Biochemist (`biochemist`) | 1.00 | Indicative estimate | Scores high only because *clinical* was dropped — check these are really one occupation |
| CP-018 | Clinical Photographer | Photographer (`photographer`) | 1.00 | Indicative estimate | Scores high only because *clinical* was dropped — check these are really one occupation |
| CP-068 | Health Psychologist | Clinical psychologist (`clinical-psychologist`) | 1.00 | Indicative estimate | Scores high only because *health* was dropped — check these are really one occupation |
| CP-097 | Clinical Pharmacist | Pharmacist (`pharmacist`) | 1.00 | Indicative estimate | Scores high only because *clinical* was dropped — check these are really one occupation |
| CP-135 | Clinical Dental Technician | Dental technician (`dental-technician`) | 1.00 | Indicative estimate | Scores high only because *clinical* was dropped — check these are really one occupation |
| CP-136 | Clinical Geneticist | Geneticist (`geneticist`) | 1.00 | Indicative estimate | Scores high only because *clinical* was dropped — check these are really one occupation |
| CP-312 | Clinical Pharmacologist | Pharmacologist (`pharmacologist`) | 1.00 | Limited-data estimate | Scores high only because *clinical* was dropped — check these are really one occupation |
| CP-402 | Clinical Data Scientist | Data scientist (`data-scientist`) | 1.00 | Limited-data estimate | Scores high only because *clinical* was dropped — check these are really one occupation |
| CP-406 | Clinical Systems Analyst | Systems analyst (`systems-analyst`) | 1.00 | Limited-data estimate | Scores high only because *clinical* was dropped — check these are really one occupation |
| CP-412 | Data Protection Officer - Healthcare | Data protection officer (`data-protection-officer`) | 1.00 | Limited-data estimate | Scores high only because *healthcare* was dropped — check these are really one occupation |
| CP-428 | Healthcare Data Scientist | Data scientist (`data-scientist`) | 1.00 | Limited-data estimate | Scores high only because *healthcare* was dropped — check these are really one occupation |
| CP-492 | Health Economist | Economist (`economist`) | 1.00 | Limited-data estimate | Scores high only because *health* was dropped — check these are really one occupation |
| CP-501 | Marketing Manager - Healthcare | Marketing manager (`marketing-manager`) | 1.00 | Limited-data estimate | Scores high only because *healthcare* was dropped — check these are really one occupation |
| CP-572 | Clinical Service Manager | Health service manager (`health-service-manager`) | 1.00 | Limited-data estimate | Scores high only because *clinical* was dropped — check these are really one occupation |
| CP-577 | Healthcare Careers Adviser | Careers adviser (`careers-adviser`) | 1.00 | Limited-data estimate | Scores high only because *healthcare* was dropped — check these are really one occupation |
| CP-587 | Management Consultant - Healthcare | Management consultant (`management-consultant`) | 1.00 | Limited-data estimate | Scores high only because *healthcare* was dropped — check these are really one occupation |
| CP-184 | Biochemistry Laboratory Technician | Laboratory technician (`laboratory-technician`) | 0.67 | Limited-data estimate |  |
| CP-191 | Genomics Laboratory Technician | Laboratory technician (`laboratory-technician`) | 0.67 | Limited-data estimate |  |
| CP-192 | Haematology Laboratory Technician | Laboratory technician (`laboratory-technician`) | 0.67 | Limited-data estimate |  |
| CP-194 | Immunology Laboratory Technician | Laboratory technician (`laboratory-technician`) | 0.67 | Limited-data estimate |  |
| CP-199 | Laboratory Robotics Technician | Laboratory technician (`laboratory-technician`) | 0.67 | Limited-data estimate |  |
| CP-202 | Laboratory Training Officer | Training officer (`training-officer`) | 0.67 | Limited-data estimate |  |
| CP-205 | Microbiology Laboratory Technician | Laboratory technician (`laboratory-technician`) | 0.67 | Limited-data estimate |  |
| CP-206 | Molecular Laboratory Technician | Laboratory technician (`laboratory-technician`) | 0.67 | Limited-data estimate |  |
| CP-215 | Transfusion Laboratory Technician | Laboratory technician (`laboratory-technician`) | 0.67 | Limited-data estimate |  |
| CP-216 | Animal Research Scientist | Research scientist (`research-scientist`) | 0.67 | Indicative estimate |  |
| CP-219 | Cancer Research Scientist | Research scientist (`research-scientist`) | 0.67 | Indicative estimate |  |
| CP-235 | Preclinical Research Scientist | Research scientist (`research-scientist`) | 0.67 | Indicative estimate |  |
| CP-271 | Clinical Project Manager | Business project manager (`business-project-manager`) | 0.67 | Limited-data estimate | Scores high only because *clinical* was dropped — check these are really one occupation |
| CP-334 | Production Manager - Pharmaceuticals | Production manager (manufacturing) (`production-manager-manufacturing-`) | 0.67 | Limited-data estimate |  |
| CP-420 | Epidemiological Data Scientist | Data scientist (`data-scientist`) | 0.67 | Limited-data estimate |  |
| CP-422 | Genomics Data Scientist | Data scientist (`data-scientist`) | 0.67 | Limited-data estimate |  |
| CP-423 | Health Data Analyst | Data analyst-statistician (`data-analyst-statistician`) | 0.67 | Limited-data estimate | Scores high only because *health* was dropped — check these are really one occupation |
| CP-427 | Healthcare Business Intelligence Analyst | Business analyst (`business-analyst`) | 0.67 | Limited-data estimate | Scores high only because *healthcare* was dropped — check these are really one occupation |
| CP-515 | Pharmaceutical Sales Representative | Sales representative (`sales-representative`) | 0.67 | Limited-data estimate |  |
| CP-523 | Scientific Events Manager | Events manager (`events-manager`) | 0.67 | Limited-data estimate |  |
| CP-560 | Public Health Intelligence Analyst | Intelligence analyst (`criminal-intelligence-analyst`) | 0.67 | Limited-data estimate | Scores high only because *health* was dropped — check these are really one occupation |
| CP-598 | Project Manager - Healthcare | Business project manager (`business-project-manager`) | 0.67 | Limited-data estimate | Scores high only because *healthcare* was dropped — check these are really one occupation |
| CP-606 | Scientific Careers Adviser | Careers adviser (`careers-adviser`) | 0.67 | Limited-data estimate |  |
| CP-631 | Food Safety Scientist | Food scientist (`food-scientist`) | 0.67 | Indicative estimate |  |
| CP-663 | Omics Data Scientist | Data scientist (`data-scientist`) | 0.67 | Limited-data estimate |  |
| CP-485 | Business Development Manager - Life Sciences | Business development manager (`business-development-manager`) | 0.60 | Limited-data estimate |  |

## Limitations

- Salary figures are estimates for career comparison. They vary by employer, sector, location, experience, hours and working pattern.
- Derived estimates are statistics over careers that do have stronger evidence. They are not surveys of the specific job.
- Qualitative working-life fields (patient contact, laboratory, research and commercial intensity, remote potential, travel) are inferred from the taxonomy, not from labour-market surveys, and are labelled as derived.
- Professional registration requirements are a separate layer with its own verification state. Strong salary evidence never implies verified eligibility requirements, and the reverse is also true.
