/**
 * The shared career vocabulary.
 *
 * Everything the application compares — a phrase in a CV, a dataset core tag, a
 * career title, a user's stated interest — is first resolved to a *domain* from
 * the list below. Matching then happens between sets of domains rather than
 * between free text, which is what makes the results explainable: every point a
 * career scores can be traced back to a domain and the evidence that produced it.
 *
 * This file is configuration, deliberately. Keywords live here rather than being
 * scattered through the parser and the views, so extending the vocabulary is a
 * data change. Nothing here contains a regulatory rule: domains describe subject
 * matter, not eligibility.
 */

/** Work orientations, used for the Explorer filters and preference matching. */
export const ORIENTATIONS = {
  laboratory: "Laboratory",
  patientFacing: "Patient-facing",
  research: "Research",
  digital: "Digital / data",
  leadership: "Leadership",
  qualityRegulatory: "Quality / regulatory",
  commercial: "Commercial",
  publicHealth: "Public health",
};

/**
 * Domains. `group` buckets a domain into the profile signal list it belongs to,
 * which is how the parser knows whether "led a team" is a leadership signal or a
 * technical one. `orientations` drive the Explorer filters.
 */
export const DOMAINS = {
  laboratory_science: {
    label: "Laboratory science", group: "technical",
    orientations: ["laboratory"],
  },
  diagnostics: {
    label: "Diagnostics", group: "technical", orientations: ["laboratory"],
  },
  pathology: {
    label: "Pathology", group: "technical", orientations: ["laboratory"],
  },
  microbiology: {
    label: "Microbiology", group: "technical", orientations: ["laboratory"],
  },
  genomics: {
    label: "Genomics and omics", group: "technical",
    orientations: ["laboratory", "research"],
  },
  advanced_biology: {
    label: "Cell, gene and advanced biology", group: "technical",
    orientations: ["laboratory", "research"],
  },
  clinical_practice: {
    label: "Clinical practice", group: "technical",
    orientations: ["patientFacing"],
  },
  patient_care: {
    label: "Patient care", group: "technical", orientations: ["patientFacing"],
  },
  rehabilitation: {
    label: "Rehabilitation and therapies", group: "technical",
    orientations: ["patientFacing"],
  },
  nursing: {
    label: "Nursing and midwifery", group: "technical",
    orientations: ["patientFacing"],
  },
  pharmacy: {
    label: "Pharmacy and medicines", group: "technical",
    orientations: ["patientFacing"],
  },
  dentistry: {
    label: "Dentistry", group: "technical", orientations: ["patientFacing"],
  },
  psychology: {
    label: "Psychological practice", group: "technical",
    orientations: ["patientFacing"],
  },
  research: {
    label: "Research", group: "research", orientations: ["research"],
  },
  academia: {
    label: "Academia and teaching", group: "research",
    orientations: ["research"],
  },
  clinical_research: {
    label: "Clinical research and trials", group: "research",
    orientations: ["research"],
  },
  gcp: {
    label: "Good Clinical Practice", group: "research",
    orientations: ["research", "qualityRegulatory"],
  },
  epidemiology: {
    label: "Epidemiology", group: "research",
    orientations: ["research", "publicHealth"],
  },
  quality: {
    label: "Quality management", group: "quality",
    orientations: ["qualityRegulatory"],
  },
  regulatory: {
    label: "Regulatory affairs", group: "quality",
    orientations: ["qualityRegulatory"],
  },
  gxp: {
    label: "GxP and validation", group: "quality",
    orientations: ["qualityRegulatory"],
  },
  compliance: {
    label: "Compliance and audit", group: "quality",
    orientations: ["qualityRegulatory"],
  },
  safety: {
    label: "Safety and pharmacovigilance", group: "quality",
    orientations: ["qualityRegulatory"],
  },
  manufacturing: {
    label: "Manufacturing and bioprocessing", group: "technical",
    orientations: ["laboratory"],
  },
  biotechnology: {
    label: "Biotechnology", group: "technical",
    orientations: ["laboratory", "research"],
  },
  pharma: {
    label: "Pharmaceutical industry", group: "technical", orientations: [],
  },
  medical_devices: {
    label: "Medical devices and MedTech", group: "technical",
    orientations: [],
  },
  engineering: {
    label: "Engineering", group: "technical", orientations: [],
  },
  data: {
    label: "Data and analytics", group: "digital", orientations: ["digital"],
  },
  bioinformatics: {
    label: "Bioinformatics", group: "digital",
    orientations: ["digital", "research"],
  },
  ai: {
    label: "AI and machine learning", group: "digital",
    orientations: ["digital"],
  },
  health_informatics: {
    label: "Health informatics", group: "digital", orientations: ["digital"],
  },
  public_health: {
    label: "Public health", group: "technical",
    orientations: ["publicHealth"],
  },
  policy: {
    label: "Health policy", group: "technical",
    orientations: ["publicHealth"],
  },
  environmental_health: {
    label: "Environmental and One Health", group: "technical",
    orientations: ["publicHealth"],
  },
  leadership: {
    label: "Leadership and management", group: "leadership",
    orientations: ["leadership"],
  },
  operations: {
    label: "Operations and service delivery", group: "leadership",
    orientations: ["leadership"],
  },
  project_management: {
    label: "Project management", group: "transferable",
    orientations: ["leadership"],
  },
  education: {
    label: "Training and education", group: "training", orientations: [],
  },
  communication: {
    label: "Communication and writing", group: "transferable",
    orientations: [],
  },
  medical_affairs: {
    label: "Medical affairs", group: "commercial",
    orientations: ["commercial"],
  },
  commercial: {
    label: "Commercial and business", group: "commercial",
    orientations: ["commercial"],
  },
  market_access: {
    label: "Market access", group: "commercial",
    orientations: ["commercial"],
  },
  health_economics: {
    label: "Health economics", group: "commercial",
    orientations: ["commercial", "publicHealth"],
  },
  consulting: {
    label: "Consulting and advisory", group: "commercial",
    orientations: ["commercial"],
  },
  innovation: {
    label: "Innovation and product development", group: "technical",
    orientations: [],
  },
};

/** Dataset `core_tags` resolved to domains. Every tag in v1.0 is covered. */
export const TAG_DOMAINS = {
  "laboratory": ["laboratory_science"],
  "diagnostics": ["diagnostics"],
  "clinical science": ["laboratory_science", "diagnostics"],
  "healthcare science": ["laboratory_science", "diagnostics"],
  "pathology": ["pathology"],
  "microbiology": ["microbiology"],
  "genomics": ["genomics"],
  "omics": ["genomics"],
  "advanced biology": ["advanced_biology"],
  "bioscience": ["laboratory_science"],
  "clinical practice": ["clinical_practice"],
  "patient care": ["patient_care"],
  "rehabilitation": ["rehabilitation"],
  "nursing": ["nursing"],
  "pharmacy": ["pharmacy"],
  "medicines": ["pharmacy"],
  "dentistry": ["dentistry"],
  "psychology": ["psychology"],
  "specialty training": ["clinical_practice", "education"],
  "imaging": ["diagnostics", "clinical_practice"],
  "research": ["research"],
  "academia": ["academia"],
  "science": ["research"],
  "clinical research": ["clinical_research"],
  "clinical trials": ["clinical_research"],
  "trials": ["clinical_research"],
  "GCP": ["gcp"],
  "epidemiology": ["epidemiology"],
  "quality": ["quality"],
  "regulatory": ["regulatory"],
  "compliance": ["compliance"],
  "safety": ["safety"],
  "drug safety": ["safety"],
  "toxicology": ["safety", "research"],
  "manufacturing": ["manufacturing"],
  "process development": ["manufacturing"],
  "bioassay": ["laboratory_science"],
  "biotech": ["biotechnology"],
  "biotechnology": ["biotechnology"],
  "pharma": ["pharma"],
  "R&D": ["research", "innovation"],
  "oncology": ["clinical_practice", "research"],
  "medical devices": ["medical_devices"],
  "medtech": ["medical_devices"],
  "engineering": ["engineering"],
  "technical": ["engineering", "laboratory_science"],
  "product development": ["innovation"],
  "innovation": ["innovation"],
  "technology": ["data"],
  "data": ["data"],
  "bioinformatics": ["bioinformatics"],
  "AI": ["ai"],
  "informatics": ["health_informatics"],
  "digital health": ["health_informatics"],
  "public health": ["public_health"],
  "population health": ["public_health"],
  "policy": ["policy"],
  "environmental health": ["environmental_health"],
  "one health": ["environmental_health"],
  "leadership": ["leadership"],
  "operations": ["operations"],
  "project delivery": ["project_management"],
  "education": ["education"],
  "writing": ["communication"],
  "communications": ["communication"],
  "medical affairs": ["medical_affairs"],
  "commercial": ["commercial"],
  "market access": ["market_access"],
  "health economics": ["health_economics"],
  "consulting": ["consulting"],
};

/**
 * Phrases that indicate a domain in free text — a CV, or a career title.
 *
 * Order matters only in that longer phrases are checked before shorter ones, so
 * "clinical research associate" resolves to clinical research rather than only
 * to clinical practice. The parser matches on word boundaries, so "lab" does not
 * fire on "labour".
 */
export const SYNONYMS = {
  laboratory_science: ["laboratory", "laboratories", "lab based", "lab-based",
    "bench work", "benchwork", "assay", "assays", "specimen", "specimens",
    "sample processing", "analyser", "analyzer", "pipetting", "wet lab",
    "biomedical science", "biomedical scientist", "medical laboratory"],
  diagnostics: ["diagnostic", "diagnostics", "point of care", "point-of-care",
    "test validation", "reference range", "result authorisation",
    "result authorization", "reporting results"],
  pathology: ["pathology", "histology", "histopathology", "cytology",
    "cellular pathology", "haematology", "hematology", "transfusion",
    "blood transfusion", "biochemistry", "clinical chemistry", "immunology",
    "blood sciences", "mortuary"],
  microbiology: ["microbiology", "bacteriology", "virology", "mycology",
    "infection control", "antimicrobial", "culture and sensitivity"],
  genomics: ["genomics", "genomic", "genetics", "sequencing", "ngs",
    "next generation sequencing", "pcr", "molecular biology", "proteomics",
    "metabolomics", "transcriptomics", "omics"],
  advanced_biology: ["cell therapy", "gene therapy", "cell and gene",
    "atmp", "advanced therapy", "stem cell", "car-t", "car t", "tissue culture",
    "cell culture", "bioprocessing"],
  clinical_practice: ["clinical practice", "clinic", "clinics", "ward",
    "wards", "outpatient", "inpatient", "patient assessment", "diagnosis",
    "treatment plan", "caseload", "clinical decision", "consultant",
    "registrar", "junior doctor", "foundation year", "specialty training"],
  patient_care: ["patient care", "patients", "patient facing",
    "patient-facing", "bedside", "care plan", "safeguarding", "person centred",
    "person-centred", "clinical care"],
  rehabilitation: ["physiotherapy", "occupational therapy", "rehabilitation",
    "rehab", "speech and language", "dietetics", "dietitian", "podiatry",
    "orthotics", "prosthetics", "audiology"],
  nursing: ["nursing", "nurse", "midwife", "midwifery", "ward sister",
    "charge nurse", "staff nurse", "health visitor"],
  pharmacy: ["pharmacy", "pharmacist", "dispensing", "medicines management",
    "medicines optimisation", "pharmacology", "formulary", "prescribing"],
  dentistry: ["dentistry", "dental", "dentist", "oral health", "orthodontic"],
  psychology: ["psychology", "psychologist", "psychological", "cbt",
    "mental health practitioner", "counselling"],
  research: ["research", "researcher", "publication", "publications",
    "peer reviewed", "peer-reviewed", "manuscript", "conference abstract",
    "poster presentation", "grant", "grants", "phd", "postdoctoral",
    "post-doctoral", "postdoc", "principal investigator", "literature review",
    "experimental design", "hypothesis"],
  academia: ["lecturer", "senior lecturer", "professor", "university",
    "teaching fellow", "academic", "module lead", "supervised students",
    "phd supervision", "curriculum"],
  clinical_research: ["clinical trial", "clinical trials", "clinical research",
    "study coordination", "study coordinator", "trial coordination",
    "research nurse", "cra", "clinical research associate", "monitoring visit",
    "site initiation", "informed consent", "case report form", "crf",
    "protocol deviation", "recruitment target", "ethics approval",
    "irb", "rec approval", "sponsor", "investigator site", "nihr portfolio"],
  gcp: ["gcp", "good clinical practice", "ich gcp", "ich-gcp",
    "clinical trials regulation", "trial master file", "tmf"],
  epidemiology: ["epidemiology", "epidemiological", "incidence",
    "prevalence", "outbreak", "surveillance", "cohort study",
    "case control", "case-control", "communicable disease"],
  quality: ["quality management", "quality system", "qms", "iso 15189",
    "iso 9001", "iso 13485", "ukas", "accreditation", "internal audit",
    "quality audit", "audit", "audits", "auditing", "nonconformance",
    "non-conformance", "root cause", "corrective action", "capa",
    "quality improvement", "document control", "sop", "sops",
    "standard operating procedure", "external quality assessment", "eqa",
    "internal quality control", "quality control"],
  regulatory: ["regulatory affairs", "regulatory submission", "regulatory",
    "mhra", "ema", "fda", "ce mark", "ukca", "technical file",
    "marketing authorisation", "marketing authorization", "dossier",
    "clinical evaluation report", "notified body", "ivdr", "mdr",
    "510k", "510(k)"],
  gxp: ["gmp", "glp", "gdp", "gxp", "good manufacturing practice",
    "good laboratory practice", "good distribution practice", "validation",
    "iq oq pq", "qualification protocol", "deviation", "deviations",
    "change control", "batch record", "qualified person"],
  compliance: ["compliance", "governance", "risk assessment", "risk register",
    "information governance", "data protection", "gdpr", "caldicott",
    "inspection readiness", "regulatory inspection"],
  safety: ["pharmacovigilance", "drug safety", "adverse event",
    "adverse events", "serious adverse", "signal detection", "safety report",
    "yellow card", "incident reporting", "health and safety", "coshh",
    "risk mitigation", "toxicology", "vigilance"],
  manufacturing: ["manufacturing", "production", "bioprocess", "upstream",
    "downstream", "fermentation", "fill finish", "fill-finish", "scale up",
    "scale-up", "tech transfer", "technology transfer", "cleanroom",
    "clean room", "aseptic", "batch"],
  biotechnology: ["biotechnology", "biotech", "biologics", "biosimilar",
    "monoclonal", "vaccine", "protein expression", "recombinant"],
  pharma: ["pharmaceutical", "pharma", "drug development", "drug discovery",
    "medicinal product", "cro", "cdmo", "contract research organisation"],
  medical_devices: ["medical device", "medical devices", "medtech",
    "in vitro diagnostic", "ivd", "device development", "usability engineering",
    "post market surveillance", "post-market surveillance", "implant"],
  engineering: ["engineering", "engineer", "mechanical", "electronic",
    "electrical", "cad", "solidworks", "instrumentation", "calibration",
    "maintenance", "commissioning", "automation", "robotics"],
  data: ["data analysis", "data analytics", "dataset", "datasets", "sql",
    "power bi", "tableau", "excel modelling", "statistics", "statistical",
    "spss", "stata", "dashboard", "dashboards", "kpi", "kpis",
    "data visualisation", "data visualization", "reporting suite"],
  bioinformatics: ["bioinformatics", "bioinformatician", "python", " r ",
    "rstudio", "linux", "command line", "pipeline development", "nextflow",
    "snakemake", "genome analysis", "variant calling", "computational biology"],
  ai: ["machine learning", "artificial intelligence", "deep learning",
    "neural network", "predictive model", "algorithm development",
    "natural language processing", "tensorflow", "pytorch", "scikit"],
  health_informatics: ["health informatics", "informatics", "lims",
    "laboratory information", "electronic patient record", "epr", "emis",
    "systmone", "clinical coding", "interoperability", "hl7", "fhir",
    "digital transformation", "digital health", "nhs digital", "middleware",
    "system implementation", "configuration"],
  public_health: ["public health", "population health", "health promotion",
    "health protection", "screening programme", "immunisation",
    "immunization", "health inequalities", "ukhsa", "health needs assessment"],
  policy: ["policy", "policy development", "guidance development",
    "consultation response", "strategy development", "commissioning",
    "stakeholder engagement", "briefing"],
  environmental_health: ["environmental health", "one health",
    "food safety", "water quality", "air quality", "zoonotic",
    "veterinary", "sustainability", "contaminated land", "waste management",
    "environmental monitoring"],
  leadership: ["line management", "line managed", "line manage", "managed a team",
    "managed the team", "team leader", "team lead", "supervised",
    "supervision of", "led a team", "leading a team", "head of",
    "service manager", "department manager", "operational lead",
    "deputy manager", "appraisals", "performance management", "recruitment of",
    "budget", "rota", "rostering", "workforce planning", "leadership"],
  operations: ["service delivery", "operational", "operations",
    "capacity planning", "turnaround time", "workflow", "process improvement",
    "lean", "six sigma", "logistics", "procurement", "contract management",
    "business continuity"],
  project_management: ["project management", "project manager",
    "project lead", "prince2", "agile", "scrum", "gantt", "workstream",
    "programme management", "project delivery", "implementation project",
    "milestone"],
  education: ["training", "trained", "teaching", "taught", "mentoring",
    "mentored", "mentor", "preceptor", "competency assessment",
    "competency assessor", "assessor", "supervised trainees",
    "delivered training", "induction", "cpd", "e-learning", "lecture",
    "practice educator"],
  communication: ["report writing", "medical writing", "scientific writing",
    "presentation", "presented", "presenting", "public speaking",
    "stakeholder communication", "newsletter", "publication writing",
    "protocol writing", "technical writing", "editorial"],
  medical_affairs: ["medical affairs", "medical science liaison", "msl",
    "medical information", "medical advisor", "medical adviser",
    "scientific engagement", "key opinion leader", "kol",
    "advisory board", "field medical"],
  commercial: ["commercial", "business development", "sales", "account management",
    "key account", "tender", "bid", "marketing", "product manager",
    "customer", "revenue", "pricing", "territory"],
  market_access: ["market access", "reimbursement", "nice submission",
    "health technology assessment", "hta", "payer", "value proposition",
    "value dossier", "formulary submission"],
  health_economics: ["health economics", "cost effectiveness",
    "cost-effectiveness", "economic model", "qaly", "budget impact",
    "outcomes research", "real world evidence", "real-world evidence"],
  consulting: ["consultancy", "consulting", "consultant advisory",
    "client engagement", "advisory", "due diligence", "benchmarking",
    "transformation programme"],
  innovation: ["innovation", "product development", "new product",
    "design control", "prototype", "feasibility study", "intellectual property",
    "patent", "commercialisation", "commercialization", "spin out", "spin-out"],
};

/**
 * Family-level context. `about` is a careful, non-committal description of the
 * kind of work a family covers: it is the safe generic description the career
 * detail screen uses, because the launch dataset carries no per-career prose and
 * inventing some would be exactly the wrong thing to do.
 */
export const FAMILY_META = {
  "Healthcare Science & Diagnostics": {
    about: "Scientific and technical roles that produce, interpret and assure "
      + "the diagnostic information clinical teams rely on, usually within "
      + "healthcare science services.",
    domains: ["laboratory_science", "diagnostics", "clinical_practice"],
    sectors: ["healthcare", "diagnostic laboratory"],
  },
  "Allied Health & Clinical Practice": {
    about: "Registered and practitioner roles that assess and treat patients "
      + "directly, typically as part of a multidisciplinary clinical team.",
    domains: ["clinical_practice", "patient_care", "rehabilitation"],
    sectors: ["healthcare"],
  },
  "Nursing, Midwifery & Pharmacy": {
    about: "Patient-facing professions with their own statutory registers, "
      + "spanning nursing, midwifery and the safe supply and use of medicines.",
    domains: ["nursing", "pharmacy", "patient_care"],
    sectors: ["healthcare"],
  },
  "Medicine & Dentistry": {
    about: "Medical and dental practice, including specialty training routes "
      + "and consultant-level clinical roles.",
    domains: ["clinical_practice", "patient_care", "dentistry"],
    sectors: ["healthcare"],
  },
  "Laboratory, Pathology & Technical Operations": {
    about: "The technical and operational backbone of laboratory services: "
      + "sample handling, analytical platforms, equipment and service delivery.",
    domains: ["laboratory_science", "pathology", "operations"],
    sectors: ["diagnostic laboratory", "healthcare"],
  },
  "Research & Academia": {
    about: "Generating new knowledge and teaching it, in universities, "
      + "institutes and research-active healthcare organisations.",
    domains: ["research", "academia", "education"],
    sectors: ["university", "research"],
  },
  "Clinical Research & Trials": {
    about: "Designing, delivering and overseeing clinical studies to Good "
      + "Clinical Practice standards, on the sponsor or the site side.",
    domains: ["clinical_research", "gcp", "project_management"],
    sectors: ["clinical research", "pharmaceutical", "healthcare"],
  },
  "Pharma, Biotech R&D & Manufacturing": {
    about: "Discovering, developing and manufacturing medicines and biological "
      + "products, from early research through to commercial supply.",
    domains: ["pharma", "biotechnology", "manufacturing", "research"],
    sectors: ["pharmaceutical", "biotechnology"],
  },
  "Quality, Regulatory, Safety & Compliance": {
    about: "Making sure products, services and studies meet the standards and "
      + "regulations that apply to them, and demonstrating that they do.",
    domains: ["quality", "regulatory", "gxp", "compliance", "safety"],
    sectors: ["pharmaceutical", "healthcare", "medical devices"],
  },
  "Digital Health, Data, Informatics & AI": {
    about: "Turning health and laboratory data into usable systems, analysis "
      + "and decision support, including informatics and analytical roles.",
    domains: ["data", "health_informatics", "bioinformatics", "ai"],
    sectors: ["healthcare", "technology"],
  },
  "Medical Devices, MedTech & Engineering": {
    about: "Designing, testing, manufacturing and supporting devices and "
      + "engineered systems used in diagnosis, treatment and monitoring.",
    domains: ["medical_devices", "engineering", "innovation"],
    sectors: ["medical devices", "healthcare"],
  },
  "Medical Affairs, Commercial, Market Access & Communications": {
    about: "Scientific and commercial roles that explain evidence, secure "
      + "access to products and connect organisations with clinical practice.",
    domains: ["medical_affairs", "commercial", "market_access", "communication"],
    sectors: ["pharmaceutical", "medical devices"],
  },
  "Public Health, Epidemiology & Health Policy": {
    about: "Protecting and improving health at population level through "
      + "surveillance, analysis, programmes and policy.",
    domains: ["public_health", "epidemiology", "policy"],
    sectors: ["public health", "government", "healthcare"],
  },
  "Leadership, Education, Operations & Consulting": {
    about: "Running services, developing people and advising organisations, "
      + "usually on the strength of prior professional or technical experience.",
    domains: ["leadership", "operations", "education", "consulting"],
    sectors: ["healthcare", "consulting"],
  },
  "Environmental & One Health": {
    about: "Work at the intersection of human, animal and environmental "
      + "health, including environmental protection and food and water safety.",
    domains: ["environmental_health", "public_health", "laboratory_science"],
    sectors: ["public health", "government", "environmental"],
  },
  "Cell & Gene Therapy, Omics & Advanced Biology": {
    about: "Advanced therapies and high-throughput biology, from laboratory "
      + "development through to manufacture and clinical application.",
    domains: ["advanced_biology", "genomics", "manufacturing", "research"],
    sectors: ["biotechnology", "pharmaceutical", "research"],
  },
};

/** Related families, used by the adjacency engine to rank plausible moves. */
export const RELATED_FAMILIES = {
  "Healthcare Science & Diagnostics": [
    "Laboratory, Pathology & Technical Operations",
    "Cell & Gene Therapy, Omics & Advanced Biology",
    "Digital Health, Data, Informatics & AI",
    "Quality, Regulatory, Safety & Compliance"],
  "Allied Health & Clinical Practice": [
    "Nursing, Midwifery & Pharmacy", "Medicine & Dentistry",
    "Leadership, Education, Operations & Consulting",
    "Public Health, Epidemiology & Health Policy"],
  "Nursing, Midwifery & Pharmacy": [
    "Allied Health & Clinical Practice", "Medicine & Dentistry",
    "Clinical Research & Trials",
    "Leadership, Education, Operations & Consulting"],
  "Medicine & Dentistry": [
    "Allied Health & Clinical Practice", "Clinical Research & Trials",
    "Medical Affairs, Commercial, Market Access & Communications",
    "Public Health, Epidemiology & Health Policy"],
  "Laboratory, Pathology & Technical Operations": [
    "Healthcare Science & Diagnostics",
    "Quality, Regulatory, Safety & Compliance",
    "Pharma, Biotech R&D & Manufacturing",
    "Medical Devices, MedTech & Engineering"],
  "Research & Academia": [
    "Clinical Research & Trials",
    "Cell & Gene Therapy, Omics & Advanced Biology",
    "Pharma, Biotech R&D & Manufacturing",
    "Digital Health, Data, Informatics & AI"],
  "Clinical Research & Trials": [
    "Research & Academia", "Pharma, Biotech R&D & Manufacturing",
    "Quality, Regulatory, Safety & Compliance",
    "Medical Affairs, Commercial, Market Access & Communications"],
  "Pharma, Biotech R&D & Manufacturing": [
    "Cell & Gene Therapy, Omics & Advanced Biology",
    "Quality, Regulatory, Safety & Compliance",
    "Clinical Research & Trials", "Research & Academia"],
  "Quality, Regulatory, Safety & Compliance": [
    "Pharma, Biotech R&D & Manufacturing",
    "Medical Devices, MedTech & Engineering",
    "Laboratory, Pathology & Technical Operations",
    "Clinical Research & Trials"],
  "Digital Health, Data, Informatics & AI": [
    "Healthcare Science & Diagnostics",
    "Public Health, Epidemiology & Health Policy",
    "Research & Academia",
    "Leadership, Education, Operations & Consulting"],
  "Medical Devices, MedTech & Engineering": [
    "Quality, Regulatory, Safety & Compliance",
    "Medical Affairs, Commercial, Market Access & Communications",
    "Laboratory, Pathology & Technical Operations",
    "Digital Health, Data, Informatics & AI"],
  "Medical Affairs, Commercial, Market Access & Communications": [
    "Clinical Research & Trials", "Pharma, Biotech R&D & Manufacturing",
    "Medical Devices, MedTech & Engineering",
    "Leadership, Education, Operations & Consulting"],
  "Public Health, Epidemiology & Health Policy": [
    "Environmental & One Health",
    "Digital Health, Data, Informatics & AI",
    "Research & Academia", "Leadership, Education, Operations & Consulting"],
  "Leadership, Education, Operations & Consulting": [
    "Laboratory, Pathology & Technical Operations",
    "Healthcare Science & Diagnostics",
    "Quality, Regulatory, Safety & Compliance",
    "Public Health, Epidemiology & Health Policy"],
  "Environmental & One Health": [
    "Public Health, Epidemiology & Health Policy",
    "Laboratory, Pathology & Technical Operations",
    "Quality, Regulatory, Safety & Compliance",
    "Research & Academia"],
  "Cell & Gene Therapy, Omics & Advanced Biology": [
    "Pharma, Biotech R&D & Manufacturing", "Research & Academia",
    "Healthcare Science & Diagnostics",
    "Quality, Regulatory, Safety & Compliance"],
};

/**
 * Qualification levels, ranked so education alignment can be compared without
 * treating a higher level as automatically better for a given career.
 */
export const QUALIFICATION_LEVELS = [
  { level: "GCSE", rank: 1, patterns: ["gcse", "o level", "o-level"] },
  { level: "A level", rank: 2, patterns: ["a level", "a-level", "a levels",
    "a-levels", "as level", "btec", "access to he", "highers"] },
  { level: "HNC/HND", rank: 3, patterns: ["hnc", "hnd", "higher national"] },
  { level: "Foundation Degree", rank: 3, patterns: ["foundation degree",
    "fdsc", "foundation science"] },
  { level: "Apprenticeship", rank: 3, patterns: ["apprenticeship",
    "degree apprenticeship", "level 4 apprenticeship"] },
  { level: "BSc", rank: 4, patterns: ["bsc", "b.sc", "bachelor of science",
    "bachelors", "bachelor's", "ba (hons)", "bs hons"] },
  { level: "BEng", rank: 4, patterns: ["beng", "b.eng"] },
  /*
   * Catch-alls for the qualifications this list will never enumerate.
   *
   * UK life sciences and healthcare draws people from everywhere, and the named
   * entries above cover the common British routes and little else. Somebody with
   * a BTech, an LLB, a DVM or a professional doctorate had no honest option but
   * to pick a level that was not theirs, which puts a wrong qualification into a
   * profile that education matching then reads. The patterns are only the
   * unambiguous abbreviations; anything else is chosen from the dropdown.
   */
  { level: "Other Bachelors", rank: 4,
    patterns: ["btech", "b.tech", "llb", "bvsc", "bvetmed", "bpharm"] },
  { level: "MPharm", rank: 5, patterns: ["mpharm", "pharmd"] },
  { level: "MEng", rank: 5, patterns: ["meng", "m.eng"] },
  { level: "MBBS/MBChB", rank: 6, patterns: ["mbbs", "mbchb", "mb bs",
    "bachelor of medicine"] },
  { level: "BDS", rank: 6, patterns: ["bds", "bchd", "bachelor of dental"] },
  { level: "PGDip", rank: 5, patterns: ["pgdip", "postgraduate diploma",
    "pgcert", "postgraduate certificate", "pgce"] },
  { level: "MSc", rank: 5, patterns: ["msc", "m.sc", "master of science",
    "masters", "master's", "mmedsci"] },
  { level: "MRes", rank: 5, patterns: ["mres", "m.res"] },
  { level: "MPH", rank: 5, patterns: ["mph", "master of public health"] },
  { level: "MBA", rank: 5, patterns: ["mba"] },
  // "LLM" is deliberately absent: in a life sciences or digital-health CV it now
  // reads as large language model at least as often as Master of Laws.
  { level: "Other Masters", rank: 5,
    patterns: ["mtech", "m.tech", "mmath", "mbiol", "mgeol"] },
  { level: "MPhil", rank: 6, patterns: ["mphil", "m.phil"] },
  { level: "PhD", rank: 7, patterns: ["phd", "ph.d", "dphil", "doctorate",
    "doctor of philosophy"] },
  { level: "MD", rank: 7, patterns: ["md (res)", "doctor of medicine"] },
  /*
   * A professional doctorate, so it ranks with the others.
   *
   * The bare abbreviation is deliberately not a pattern. In a life sciences and
   * healthcare CV, "DBA" far more often means database administrator than Doctor
   * of Business Administration, and reading a job title as a doctorate is a
   * worse error than failing to spot one — the person can always add it by hand
   * from the dropdown, which is what this entry is mainly here to provide.
   */
  { level: "DBA", rank: 7,
    patterns: ["doctor of business administration", "d.b.a."] },
  /*
   * Two obvious abbreviations are left out on purpose, both because they collide
   * with far commoner words in exactly this sector: "EdD" against the estimated
   * due date that appears throughout obstetric and midwifery work, and "DHSc"
   * against the Department of Health and Social Care. Either would read a
   * routine sentence as a doctorate.
   */
  { level: "Other Doctorate", rank: 7,
    patterns: ["dvm", "engd", "eng.d", "psyd", "dclinpsy",
               "professional doctorate", "doctor of education"] },
];

/**
 * Registration and membership signals.
 *
 * `statutory` records whether the body maintains a statutory register in the UK.
 * It is used to keep a *membership* of a professional body from being presented
 * as statutory registration, which is a distinction the product must not blur.
 * It is never used to assert that a particular user is eligible for anything.
 */
export const REGISTRATION_BODIES = [
  { code: "HCPC", statutory: true, patterns: ["hcpc",
    "health and care professions council", "health & care professions"] },
  { code: "NMC", statutory: true, patterns: ["nmc",
    "nursing and midwifery council"] },
  { code: "GMC", statutory: true, patterns: ["gmc", "general medical council"] },
  { code: "GDC", statutory: true, patterns: ["gdc", "general dental council"] },
  { code: "GPHC", statutory: true, patterns: ["gphc",
    "general pharmaceutical council"] },
  { code: "GOC", statutory: true, patterns: ["goc", "general optical council"] },
  { code: "RCVS", statutory: true, patterns: ["rcvs",
    "royal college of veterinary surgeons"] },
  { code: "IBMS", statutory: false, patterns: ["ibms",
    "institute of biomedical science", "mibms", "fibms"] },
  { code: "AHCS", statutory: false, patterns: ["ahcs",
    "academy for healthcare science"] },
  { code: "RSB", statutory: false, patterns: ["royal society of biology",
    "rsci biol", "mrsb", "frsb"] },
  { code: "RSC", statutory: false,
    patterns: ["royal society of chemistry", "mrsc", "crsc"] },
  { code: "CIEH", statutory: false, patterns: ["cieh",
    "chartered institute of environmental health"] },
  { code: "TOPRA", statutory: false, patterns: ["topra"] },
  { code: "CQI", statutory: false, patterns: ["chartered quality institute",
    "cqi", "mcqi"] },
];

/** Sector exposure signals, kept separate from domains. */
export const SECTOR_SIGNALS = {
  "healthcare": ["nhs", "hospital", "trust", "clinic", "healthcare",
    "health board", "primary care", "secondary care", "patient"],
  "diagnostic laboratory": ["pathology", "diagnostic laboratory",
    "clinical laboratory", "blood sciences", "microbiology laboratory",
    "laboratory medicine", "ukas", "iso 15189"],
  "pharmaceutical": ["pharmaceutical", "pharma", "cro", "cdmo",
    "drug development", "gmp", "marketing authorisation"],
  "biotechnology": ["biotech", "biotechnology", "biologics", "start-up",
    "startup", "spin-out", "vaccine"],
  "medical devices": ["medical device", "medtech", "ivd", "ce mark",
    "notified body", "iso 13485"],
  "university": ["university", "faculty", "school of", "institute",
    "postgraduate research", "academic"],
  "research": ["research institute", "research group", "laboratory group",
    "funded project", "grant", "wellcome", "ukri", "nihr"],
  "clinical research": ["clinical trial", "sponsor", "investigator site",
    "research delivery", "nihr", "crn"],
  "public health": ["public health", "ukhsa", "local authority",
    "health protection", "screening programme"],
  "government": ["department of health", "civil service", "government",
    "dhsc", "regulator", "mhra"],
  "technology": ["software", "saas", "platform", "digital", "informatics",
    "it services"],
  "environmental": ["environment agency", "environmental", "water company",
    "food standards", "waste"],
  "consulting": ["consultancy", "consulting", "advisory firm", "client"],
  "commercial": ["sales", "commercial", "distributor", "supplier", "vendor"],
};

/** All domain ids, in declaration order — used for deterministic output. */
export const DOMAIN_IDS = Object.keys(DOMAINS);

/** Human label for a domain id, falling back to the id itself. */
export function domainLabel(id) {
  return (DOMAINS[id] && DOMAINS[id].label) || id;
}

/** The profile signal bucket a domain belongs to. */
export function domainGroup(id) {
  return (DOMAINS[id] && DOMAINS[id].group) || "technical";
}

/** Orientations implied by a set of domains. */
export function orientationsFor(domainIds) {
  const found = new Set();
  for (const id of domainIds) {
    for (const orientation of (DOMAINS[id] || {}).orientations || []) {
      found.add(orientation);
    }
  }
  return found;
}

/**
 * Resolve free text to domains, with the evidence that triggered each one.
 *
 * Returns a Map of domain id -> array of matched phrases. Matching is on word
 * boundaries and case-insensitive; longer phrases are tried first so a specific
 * phrase wins over a substring of itself.
 */
export function resolveText(text) {
  const haystack = ` ${String(text || "").toLowerCase().replace(/\s+/g, " ")} `;
  const found = new Map();
  for (const [domain, phrases] of Object.entries(SYNONYMS)) {
    const ordered = [...phrases].sort((a, b) => b.length - a.length);
    for (const phrase of ordered) {
      if (!containsPhrase(haystack, phrase)) continue;
      if (!found.has(domain)) found.set(domain, []);
      const hits = found.get(domain);
      if (hits.length < 4 && !hits.includes(phrase)) hits.push(phrase.trim());
    }
  }
  return found;
}

/**
 * Whole-phrase containment.
 *
 * Guards against the classic false positives: "lab" inside "labour", "ai"
 * inside "said", "md" inside "amd".
 */
export function containsPhrase(haystack, phrase) {
  const needle = phrase.toLowerCase().trim();
  if (!needle) return false;
  let from = 0;
  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at < 0) return false;
    const before = haystack[at - 1] || " ";
    const after = haystack[at + needle.length] || " ";
    if (!/[a-z0-9]/.test(before) && !/[a-z0-9]/.test(after)) return true;
    from = at + 1;
  }
}
