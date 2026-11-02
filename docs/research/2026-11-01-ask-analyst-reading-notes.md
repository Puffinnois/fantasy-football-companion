# LLM data-analyst agents — reading notes

**Date:** 2026-11-01 · **Plan:** `2026-11-01-ask-analyst-research-plan.md` (§5 template) · **Report:** `2026-11-01-ask-analyst-state-of-the-art.md`

Notes on the papers and industry sources read in depth, grouped by the plan's topics. Each lead the plan listed in _italics_ was checked against arXiv / OpenAlex / the publisher before it went in here; the ones that did not hold up are listed at the end. "Models" is the size range the result was shown on; "frontier" means GPT-4-class or newer closed models. Benchmark numbers are as reported by the authors unless marked otherwise.

Access note: arXiv's API and Semantic Scholar rate-limited this session, so abstracts and metadata were pulled from OpenAlex (by arXiv DOI) and the papers' arXiv HTML pages. Citation counts were not used to rank papers, because OpenAlex splits them between preprint and published records.

## 3.1 Agent architecture

### Spider 2.0 — Evaluating Language Models on Real-World Enterprise Text-to-SQL Workflows (ICLR 2025, arXiv 2411.07763)

Link: https://arxiv.org/abs/2411.07763 · Evidence: peer-reviewed · Models: frontier (o1-preview, GPT-4o, Claude 3.5)
Claim: Text-to-SQL on real enterprise schemas (often > 1,000 columns, BigQuery / Snowflake dialects, project code to read) is far harder than Spider 1.0 or BIRD.
Method: 632 workflow tasks; an agent framework that explores metadata, docs and code before writing SQL.
Result: o1-preview agent solves 21.3 % vs 91.2 % on Spider 1.0 and 73.0 % on BIRD.
For us: Free-form SQL over a big, unfamiliar schema is the hard case even for frontier models. Our warehouse (raw + derived + model tables) is closer to that than to Spider 1.0, which argues against raw SQL as the main path.
Adopt? now — keep the structured engine as the primary path · Cost: S

### BIRD — Can LLM Already Serve as a Database Interface? (NeurIPS 2023 D&B, arXiv 2305.03111)

Link: https://arxiv.org/abs/2305.03111 · Evidence: peer-reviewed · Models: all sizes (leaderboard)
Claim: Database values and "external knowledge" (domain definitions) are what make text-to-SQL hard; also measures SQL efficiency (VES).
Method: 12,751 question–SQL pairs over 95 databases (33.4 GB), each question with an evidence hint written by experts.
Result: The "evidence" hints are a large part of accuracy; the benchmark is now saturated in the low 70s % for frontier pipelines (CHASE-SQL 73.0 % test).
For us: BIRD's evidence field is exactly what our catalogue descriptions and the dimension glossary supply. The lesson carries: write domain definitions down, don't make the model guess them.
Adopt? now — glossary and metric definitions in the brief / `describe` · Cost: S

### BIRD-Interact — Re-imagining Text-to-SQL Evaluation via Dynamic Interactions (ICLR 2026, arXiv 2510.05318)

Link: https://arxiv.org/abs/2510.05318 · Evidence: peer-reviewed · Models: frontier (GPT-5, Claude, Gemini)
Claim: Real use is multi-turn — ambiguity, execution errors, changing requirements — and static benchmarks miss it.
Method: 600 (full) + 300 (lite) tasks with a user simulator; a conversational protocol (c-Interact) and an agentic one where the model decides when to ask the user or explore the database (a-Interact). Follow-up tasks change the request after the first answer.
Result: GPT-5 completes 8.67 % in c-Interact and 17.00 % in a-Interact. Asking the user well is a major driver of success.
For us: Follow-ups and clarifying questions deserve their own evaluation categories, scored as interactions, not single turns. A user simulator (an LLM playing the user with the hidden intent) is the standard way to grade "ask when ambiguous".
Adopt? now — multi-turn + ambiguity categories in §7 with a simulated user · Cost: M

### DIN-SQL — Decomposed In-Context Learning of Text-to-SQL with Self-Correction (NeurIPS 2023, arXiv 2304.11015)

Link: https://arxiv.org/abs/2304.11015 · Evidence: peer-reviewed · Models: GPT-4, CodeX, ChatGPT
Claim: Decomposing generation (schema linking → classification by difficulty → generation → self-correction) beats one-shot prompting by about 10 points.
Method: Prompt pipeline of four modules.
Result: Spider test 85.3 % EX; BIRD test 55.9 %.
For us: Early evidence that classifying the question first and routing to a simpler prompt helps. Our resolver + task-shaped tools are a stronger version of that (the decomposition is in code, not prompts).
Adopt? now (already in the design) · Cost: S

### MAC-SQL — A Multi-Agent Collaborative Framework for Text-to-SQL (COLING 2025, arXiv 2312.11242)

Link: https://arxiv.org/abs/2312.11242 · Evidence: peer-reviewed · Models: GPT-4; fine-tuned Code Llama 7B
Claim: A decomposer agent plus a selector (sub-database) and a refiner (fixes failing SQL from execution errors).
Result: GPT-4 59.59 % BIRD test; a fine-tuned 7B (SQL-Llama) reaches 43.94 vs 46.35 for vanilla GPT-4.
For us: The refiner = "errors teach". A 7B model can do most of a strong model's job once the pipeline is narrow and it is fine-tuned on it.
Adopt? now (error-feedback retries) · Cost: S

### DAIL-SQL — Text-to-SQL Empowered by LLMs: A Benchmark Evaluation (VLDB 2024, arXiv 2308.15363)

Link: https://doi.org/10.14778/3641204.3641221 · Evidence: peer-reviewed · Models: GPT-4, GPT-3.5, open 7–33B
Claim: Systematic comparison of question representation, example selection and example organisation for in-context text-to-SQL.
Result: Selecting few-shot examples by similarity of both the question (with domain words masked) and the predicted query skeleton, and showing them as question–SQL pairs, was best; Spider 86.6 %. Open-source models gained far less from in-context examples than GPT-4 — fine-tuning helped them more.
For us: Few-shot examples should be retrieved by similarity of the masked question ("who leads {pos} in {metric} since week {n}") and of the call shape, not by raw text. Small local models may gain less from examples than strong ones — measure it.
Adopt? design a seam (verified-example store, §D9) · Cost: M

### CHESS — Contextual Harnessing for Efficient SQL Synthesis (arXiv 2405.16755, v3 2024)

Link: https://arxiv.org/abs/2405.16755 · Evidence: preprint (widely replicated) · Models: GPT-4 / Gemini; an open-source variant
Claim: For big schemas, a pipeline of value retrieval (LSH over column values + keyword extraction + vector search over the catalogue), schema pruning, candidate generation and unit-test-based selection.
Result: BIRD dev 65 %, test 66.69 %; open-source variant 61.5 % dev; schema cut from hundreds of columns to usually fewer than ten.
For us: The model for our resolver: retrieve values ("Niners", "Bijan") and metric candidates in code, then give the model only those. Their value-retrieval step (exact + LSH fuzzy) is cheap and needs no model.
Adopt? now (resolver design) · Cost: M

### CHASE-SQL — Multi-Path Reasoning and Preference-Optimized Candidate Selection (ICLR 2025, arXiv 2410.01943)

Link: https://arxiv.org/abs/2410.01943 · Evidence: peer-reviewed · Models: Gemini 1.5 Pro, Claude 3.5; fine-tuned selector
Claim: Generate diverse candidates (divide-and-conquer, query-plan CoT, synthetic examples) and pick with a trained pairwise selector.
Result: BIRD 73.0 % test (top at submission).
For us: Candidate generation + selection costs N× calls: fine for a cloud model, too slow on an 8 GB GPU. Note for later only.
Adopt? reject for now (latency on local models) · Cost: L

### ReFoRCE — A Text-to-SQL Agent with Self-Refinement, Consensus Enforcement and Column Exploration (ICLR 2025 workshop, arXiv 2502.00675 v5)

Link: https://arxiv.org/abs/2502.00675 · Evidence: workshop + preprint · Models: frontier (o1/o3, GPT-4o, Claude)
Claim: For Spider 2.0-scale schemas: compress the schema by grouping similar tables, vote across parallel candidate workflows, and explore columns with small probe queries when the vote is split.
Result: Spider 2.0-Snow 35.83, Spider 2.0-Lite 36.56 (v5; earlier versions lower).
For us: Even the best agents over raw enterprise schemas are under 40 %. "Explore with cheap probe queries" is the agent-first pattern of §3.4.
Adopt? reject as a path; keep the probe idea for `describe` / `find` · Cost: —

### Data-agent benchmarks (skimmed as a group)

- **DABstep** (arXiv 2506.23719, 2025): 450+ multi-step tasks from a payments platform, code + documentation. Best agent 14.55 % on the hard set. Lesson: reading domain docs correctly is the bottleneck.
- **DA-Code** (EMNLP 2024, arXiv 2410.07331): agentic data-science code tasks; best LLM 30.5 %.
- **InfiAgent-DABench** (ICML 2024, arXiv 2401.05507): 257 questions over 52 CSVs, closed-form answers via "format prompting" so grading is automatic.
- **DSBench** (ICLR 2025, arXiv 2409.07703): 466 analysis + 74 modelling tasks; best agent solves 34.12 % of analysis tasks.
- **KramaBench** (arXiv 2506.06541, MIT): data-lake → insight pipelines; best system 55 % end-to-end, 62 % with perfect retrieval.
- **TableBench** (AAAI 2025, arXiv 2408.09174): table QA in industrial scenarios, 18 fields; models well below humans.
- **Data Interpreter** (arXiv 2402.18679, MetaGPT): hierarchical task graph + verified code nodes; InfiAgent-DABench 75.9 → 94.9 %.

For us: Open-ended code agents (pandas in a sandbox) are measured at 15–55 % on realistic tasks even with frontier models. Our questions are narrower and better served by tools, but a few questions ("correlation of X and Y", "fit a trend") need maths the engine does not do. InfiAgent's closed-form answer format is a cheap way to grade numeric answers.
Adopt? design a seam (an optional, strong-model-only calc tool) · Cost: M

## 3.2 Semantic layers and semantic consistency

### data.world KG benchmark — A Benchmark to Understand the Role of Knowledge Graphs on LLM Accuracy for Q&A on Enterprise SQL Databases (arXiv 2311.07509, 2023) + follow-up (arXiv 2405.11706, 2024)

Link: https://arxiv.org/abs/2311.07509 · Evidence: preprint, authors' own benchmark · Models: GPT-4
Claim: Giving the model a business ontology (knowledge graph) instead of the raw SQL schema raises accuracy a lot.
Method: Insurance schema (13 tables), 43 questions in four complexity quadrants; zero-shot GPT-4 on SQL vs SPARQL over a KG. The follow-up adds an ontology-based check of the query and an LLM repair loop.
Result: 16.7 % (SQL) → 54.2 % (KG); follow-up 72.55 %, plus 8 % "I don't know".
For us: The original evidence that business semantics, not model size, is the bottleneck. The repair loop (check the query against the ontology, explain the violation, retry) is our "errors teach".
Adopt? now · Cost: S

### dbt Labs semantic-layer benchmark (industry, 2023; re-run April 2026)

Link: https://docs.getdbt.com/blog/semantic-layer-vs-text-to-sql-2026 · https://github.com/dbt-labs/semantic-layer-llm-benchmarking · Evidence: industry claim, vendor · Models: GPT-4 (2023); Claude Sonnet 4.6, Opus 4.6, GPT-5.2 / 5.3-Codex (2026)
Claim: Answering through a semantic layer (LLM picks metrics + dimensions + filters; MetricFlow compiles SQL) is more accurate than text-to-SQL whenever the layer covers the question.
Method: The data.world insurance set (11 questions, 15 tables), each run 20 times; text-to-SQL got the whole schema in context.
Result: Modeled project — Sonnet 4.6 text-to-SQL 90.0 % vs semantic layer 98.2 %; GPT-5.3-Codex 84.1 % vs 100 %. Questions needing more joins than the layer models: semantic layer 0 % until 3 new models were added. Failure modes differ: **text-to-SQL returns plausible wrong numbers; the semantic layer returns errors.** Higher reasoning effort did not help and raised latency (≈ 8 s → > 20 s).
For us: Strong support for the structured engine as the default, and for "coverage gaps are fixed by modelling (a new derived table or metric), not by giving up structure". Errors instead of silent wrong answers is the property we want.
Adopt? now · Cost: S

### Semantic Layers for Reliable LLM-Powered Data Analytics: a paired benchmark (arXiv 2604.25149, April 2026)

Link: https://arxiv.org/abs/2604.25149 · Evidence: preprint · Models: Claude Opus 4.7, Sonnet 4.6, GPT-5.4
Claim: A 4 KB hand-written document of measures, conventions and disambiguation rules lifts all three frontier models by the same amount; the effect is structural, not model capability.
Method: 100 questions over a retail dataset in ClickHouse; paired design, schema only vs schema + semantic document.
Result: 45.5–50.5 % → 67.7–68.7 %; the three models are statistically indistinguishable within each condition; every cross-condition difference p < 0.01.
For us: The glossary (§4.2) is worth roughly 20 points by itself even for raw SQL. Model choice mattered less than context.
Adopt? now — glossary + conventions in the brief, shared with the `describe` tool · Cost: S

### Snowflake Cortex Analyst (industry, 2024)

Link: https://www.snowflake.com/en/blog/engineering/snowflake-cortex-analyst-behind-the-scenes/ · https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-analyst/semantic-model-spec · Evidence: industry claim · Models: Llama, Mistral (multi-model)
Claim: Semantic model (YAML: logical tables, dimensions, time dimensions, measures, filters, synonyms, sample values, relationships) + "verified queries" + a multi-agent pipeline gives > 90 % SQL accuracy on their internal BI set, ~2× single-shot GPT-4o.
Method: Agents in sequence: **classification** (ambiguous / non-data / non-SQL questions are declined and the user is shown similar answerable questions) → feature extraction (time series, period-over-period, ranking → picks prompts) → context enrichment (similar verified queries; literal values by semantic search) → several SQL generators on different LLMs, each writing against a simplified _logical_ schema → error correction with the compiler → a synthesiser picks the final SQL. Evaluation re-runs verified queries as ground truth, removing each from the model's context while it is tested.
Result: Vendor-reported only; a practitioner case study reports complex questions 40 → 75 % after adding a verified-query feedback loop.
For us: Three ideas carry over directly: (1) decline-with-suggestions for ambiguous or out-of-scope questions; (2) a verified-query repository used both as few-shot context and as the evaluation set (with leave-one-out); (3) synonyms and sample values attached to dimensions, not only metrics.
Adopt? now (1, 3); design a seam (2) · Cost: M

### Databricks AI/BI Genie (industry, docs 2025–26)

Link: https://docs.databricks.com/aws/en/genie/concepts · Evidence: industry docs · Models: undisclosed
Claim: A "space" is curated context: instructions, example SQL, and "trusted assets" (parameterised queries and SQL functions whose logic an author verified). An answer built from a trusted asset is badged **Trusted**. Benchmarks (question + reference SQL) are kept separate from context and are never used to inform answers.
For us: The trusted badge maps to our result cards: an answer that came through a task-shaped tool is engine-verified; one that came through the free `query` tool is less so. Keeping evaluation questions out of the few-shot store avoids grading on memorised answers.
Adopt? now (keep eval and examples apart); consider a "verified" mark per card · Cost: S

### Cube / Looker / open-source semantic layers (skimmed)

Cube's replication of the dbt benchmark claims 100 % on the answerable questions (vendor). Looker's conversational analytics grounds Gemini on LookML. Open-source "boring semantic layer" and similar MCP servers expose measures / dimensions / filters as tools rather than SQL. None publishes a peer-reviewed comparison. The common format pattern across vendors is the same: **entities, dimensions (incl. time), measures with aggregation, filters, synonyms, sample values, relationships, verified queries**. The Open Semantic Interchange (OSI) initiative (2025) aims at a shared format; check its status before adopting.
Adopt? design a seam (export the catalogue to a YAML in this shape) · Cost: S

## 3.3 Schema linking, entity resolution and retrieval

### The Death of Schema Linking? (arXiv 2408.07702, 2024)

Link: https://arxiv.org/abs/2408.07702 · Evidence: preprint · Models: frontier long-context models
Claim: Frontier long-context models use the right schema elements even among many irrelevant ones; filtering the schema hurts more by dropping needed columns than it helps.
Result: BIRD 71.83 % (top at the time) with no schema linking when the schema fits in context; they put effort into augmentation, selection and correction instead.
For us: For strong models, give the whole metric list (310 ids + one-liners ≈ 10–15k tokens) or let them call `find`; don't over-prune. For small models with 8k–32k context the trade-off is the opposite (see Less is More, RAG-MCP).
Adopt? now — profile-dependent candidate counts · Cost: S

### RSL-SQL — Robust Schema Linking (arXiv 2411.00073, 2024)

Link: https://arxiv.org/abs/2411.00073 · Evidence: preprint · Models: GPT-4o, DeepSeek
Claim: Bidirectional linking (forward from the question, backward from a draft SQL), then a binary choice between full and pruned schema, then self-correction. Linking risk = omitting a needed element.
For us: The "draft then link back" idea suggests the resolver can be re-run on the model's first tool call (the metric it picked) to offer alternatives in the error message, rather than pruning harder up front.
Adopt? now (cheap: recall-oriented candidates + fallback to the full list) · Cost: S

### RESDSQL (AAAI 2023) and CodeS (SIGMOD 2024, 1B–15B open models)

Links: https://doi.org/10.1609/aaai.v37i11.26535 · https://doi.org/10.1145/3654930 · Evidence: peer-reviewed · Models: small (T5, 1–15B)
Claim: For small models, a separate ranking step that keeps only the relevant schema items, plus value retrieval (BM25 then longest-common-substring on column values), is essential. CodeS-7B/15B with this prompt reach near-GPT-4 accuracy on Spider/BIRD after incremental pre-training on SQL.
For us: The opposite finding to "Death of schema linking" — at small sizes, linking matters. Confirms profile-dependent design: compact profile gets narrowed enums; full profile gets everything.
Adopt? now · Cost: S

### RAG-MCP — Mitigating Prompt Bloat in LLM Tool Selection (arXiv 2505.03275, 2025)

Link: https://arxiv.org/abs/2505.03275 · Evidence: preprint · Models: frontier (GPT-4o-class)
Claim: Retrieving the relevant tool descriptions before the call beats listing all tools.
Result: Tool-selection accuracy 43.13 % vs 13.62 % baseline in a stress test with many MCP servers; > 50 % fewer prompt tokens.
For us: Our 12 tools are well below the point where this bites. Applies to the 310 metrics, which behave like a large tool set inside one tool — retrieve candidates.
Adopt? now (metric candidates), reject for tools · Cost: S

### Less is More — Optimizing Function Calling for LLM Execution on Edge Devices (arXiv 2411.15399, 2024)

Link: https://arxiv.org/abs/2411.15399 · Evidence: preprint · Models: small open models on edge hardware
Claim: Showing a small model fewer, query-relevant tools improves both its accuracy and its speed, with no retraining.
Method: Offline clustering of tools into levels; online controller picks the level for the query; evaluated on BFCL and GeoEngine.
For us: Direct support for the compact profile and resolver-narrowed enums on the RTX 4060.
Adopt? now · Cost: S

## 3.4 Query optimisation and OLAP for agent workloads

### Supporting Our AI Overlords: Redesigning Data Systems to be Agent-First (arXiv 2509.00997, 2025, UC Berkeley)

Link: https://arxiv.org/abs/2509.00997 · Evidence: preprint (vision paper with case studies) · Models: GPT-4o-mini, o3
Claim: Agents send a high volume of exploratory, redundant and steerable queries ("agentic speculation"); data systems should support it natively.
Method: Case studies on BIRD and a two-database task; proposals for an agent-first architecture.
Result: Success rose 14–70 % with more parallel attempts or steps; across 50 attempts per problem the distinct sub-plans were often under 10–20 % of all sub-plans (lots of shared work); o3 traces averaged 12.67 SQL queries per task, and **expert hints cut that by 18 %** (up to 37 % for partial-query attempts). Proposals: _probes_ (queries with a natural-language brief of intent and accuracy needed), approximate / "satisficing" answers during exploration, multi-query optimisation and shared sub-plans, caching and materialisation from query history, an agentic memory store (semantic cache of past results with grounding), proactive steering (hints, why-empty explanations, cost estimates), and in-database "sleeper agents".
For us: Most of this is for cloud warehouses with many agents. What carries over at our scale: (1) steering in results — our `notes`, the "errors teach" messages and why-empty explanations ("no qualified WR: lower `minSample`?"); (2) an exact result cache keyed on the compiled query, which follow-ups and evaluation re-runs hit often; (3) a trace of every query per turn to measure redundancy before optimising anything.
Adopt? now (1, 3), now-cheap (2); reject approximate answers (our data is small, exact is fast) · Cost: S

### Agentic Plan Caching: Test-Time Memory for Fast and Cost-Efficient LLM Agents (NeurIPS 2025, arXiv 2506.14852)

Link: https://arxiv.org/abs/2506.14852 · Evidence: peer-reviewed · Models: frontier planner + small adapter models
Claim: Cache _plan templates_ from finished agent runs and adapt them to new similar tasks with a small model, rather than caching answers.
Result: About 50 % lower cost and 27 % lower latency on average with performance kept (NeurIPS version; arXiv v1 reports 46.6 % and 96.7 % of optimal).
For us: Caching the _answer_ to a question is wrong for us (data changes weekly, and "now 2024" is a different question); caching the _plan_ — the verified tool call for a question shape — is exactly the verified-example library of D9.
Adopt? design a seam (D9) · Cost: M

### vCache: Verified Semantic Prompt Caching (ICLR 2026, arXiv 2502.03771) and MeanCache (IPDPS 2025, arXiv 2403.02694)

Link: https://arxiv.org/abs/2502.03771 · Evidence: peer-reviewed · Models: embedding models + LLMs
Claim: Static cosine-similarity thresholds for semantic caches give unpredictable error rates; vCache learns a per-entry threshold under a user-set error bound.
Result: Up to 12.5× higher hit rate and 26× lower error than static thresholds; practitioner reports of static-threshold false hits range from a few % (0.95) to most hits (0.7).
For us: Reject answer-level semantic caching — a false hit returns a confident wrong number, the failure we most want to avoid. Exact caching of tool results keyed on the canonical query is safe.
Adopt? reject (semantic answer cache); now (exact result cache) · Cost: S

### LLM-driven query optimisation (skimmed)

LLM-assisted rewriting and plan hinting (LLM-R2, λ-Tune and similar, 2024–25) target large OLAP workloads where the optimiser is the bottleneck. DuckDB on a 300 MB file returns our queries in milliseconds to ~1 s, while a local model takes seconds to tens of seconds per call.
Adopt? reject — the model, not the database, dominates latency · Cost: —

## 3.5 Efficient aggregation

### Classic and DuckDB-specific background (skimmed)

- **View / cube selection** — Harinarayan, Rajaraman & Ullman, _Implementing Data Cubes Efficiently_ (SIGMOD 1996): pick the materialised group-bys that minimise query cost under a space budget. Our derived weekly / season tables are already that choice for the common grains.
- **Incremental view maintenance** — OpenIVM (SIGMOD 2024 demo, arXiv 2404.16486, CWI): compiles view definitions to SQL that propagates deltas, as a DuckDB extension. Our warehouse rebuilds derived tables weekly in a worker; IVM would only matter if rebuilds became slow.
- **Sketches** — DuckDB already ships `approx_count_distinct` (HyperLogLog) and `approx_quantile` (t-digest), plus a DataSketches community extension (KLL, etc.). Exact percentiles over a few thousand player-rows cost nothing; sketches pay off at millions of rows.
- **Approximate query processing** — Chaudhuri, Ding & Kandula, _AQP: No Silver Bullet_ (SIGMOD 2017): sampling-based AQP rarely reached products because error bounds are hard for users and break on selective filters. Selective filters (one player, red zone, 3rd down) are exactly our situational questions.
  For us: Nothing in the literature argues for new aggregation machinery at 300 MB with one user. The one measured need is the play-grain situational path (≤ 1 s); if traces show repeated situational shapes, a materialised play-grain cube for the top shapes (team × week × down × red zone × pressure …) is the classic answer.
  Adopt? design a seam: measure with query traces first; reject AQP and sketches · Cost: S–M

## 3.6 Statistical correctness

### StatQA — Are Large Language Models Good Statisticians? (NeurIPS 2024 D&B, arXiv 2406.07815)

Link: https://doi.org/10.52202/079017-2005 · Evidence: peer-reviewed · Models: GPT-4o, LLaMA-3 (8B/70B), fine-tuned small models
Claim: LLMs pick and apply hypothesis tests poorly; their characteristic error is _applicability_ — using a test whose assumptions the data does not meet.
Result: Best (GPT-4o) 64.83 %; fine-tuned small models beat all in-context methods; humans make different errors (task confusion).
For us: Don't let the model choose statistical methods freely. Expose a small set of fixed, correctly-implemented tests as tools (or fields on results) with assumptions checked in code.
Adopt? now (statistics in tools, not in prose) · Cost: M

### QRData — Are LLMs Capable of Data-based Statistical and Causal Reasoning? (ACL Findings 2024, arXiv 2402.17644)

Link: https://doi.org/10.18653/v1/2024.findings-acl.548 · Evidence: peer-reviewed · Models: GPT-4; open models up to 33B
Claim: Statistical and especially causal reasoning over data is weak, and combining causal knowledge with data is the hardest part.
Result: GPT-4 58 %; best open model (DeepSeek-Coder) 37 %.
For us: "Why" questions ("is his drop because of the new QB?") invite causal claims the data can't support. The brief should forbid causal language unless a tool result supports a comparison, and small models should not be asked to reason causally at all.
Adopt? now (brief rule + answer check for causal words) · Cost: S

### BLADE (EMNLP Findings 2024, arXiv 2408.09667) and DiscoveryBench (ICLR 2025, arXiv 2407.01725)

Links: https://arxiv.org/abs/2408.09667 · https://arxiv.org/abs/2407.01725 · Evidence: peer-reviewed · Models: GPT-4-class, open 7–70B
Claim: Agents doing open-ended data analysis default to basic analyses and make narrow analytic choices; data-driven discovery is far from solved.
Result: BLADE: agents interacting with the data do better but still lack the diversity of expert analyses. DiscoveryBench: best system 25 %.
For us: Open-ended "what's interesting about X" questions are where analyst agents are weakest. Keep them out of the first version or route them to fixed analyses (the outlook signals, stability).
Adopt? now (scope) · Cost: S

### The Agentic Garden of Forking Paths (arXiv 2607.01507, 2026)

Link: https://arxiv.org/abs/2607.01507 · Evidence: preprint · Models: frontier agents
Claim: Agents given different prior beliefs reach opposite conclusions from the same data through defensible analysis choices; reviews rarely catch it.
Result: Agents reproduced 72 % of the human ideological gap in a 42-team many-analysts study; 86 % of the divergent reports passed AI review and 78 % passed human expert majority review. Proposes the m-value (where a result sits among all reasonable analyses) estimated by sampling analysis paths.
For us: The fantasy version is a leading question ("isn't Bijan declining?") that steers the model to the one split that agrees. Guardrails: the brief tells the model to report the overall line before any split, and the answer check flags a split reported without its base rate. The m-value idea maps to "how unusual is this split among all splits we could have shown".
Adopt? now (base-rate-first rule); design a seam (split significance tool) · Cost: S–M

### POPPER — Automated Hypothesis Validation with Agentic Sequential Falsifications (ICML 2025, arXiv 2502.09858)

Link: https://arxiv.org/abs/2502.09858 · Evidence: peer-reviewed · Models: frontier
Claim: Agents testing hypotheses inflate false positives; converting each test to an e-value and combining sequentially controls Type-I error.
Result: Type-I error ≤ 0.1 vs up to 0.248 for plain ReAct / code agents.
For us: Evidence that "let the agent run tests until something is significant" is a real failure mode. If we expose a significance tool, it should count the tests run in the turn and adjust (or say "this is one of N splits looked at").
Adopt? design a seam · Cost: M

## 3.7 Faithfulness, provenance and verification

### Large Language Models Cannot Self-Correct Reasoning Yet (ICLR 2024, arXiv 2310.01798) + When Can LLMs Actually Correct Their Own Mistakes? (TACL 2024, arXiv 2406.01297)

Links: https://arxiv.org/abs/2310.01798 · https://arxiv.org/abs/2406.01297 · Evidence: peer-reviewed · Models: GPT-3.5/4, PaLM, Llama
Claim: Intrinsic self-correction (the model reviews itself with no external signal) does not help and can hurt; self-correction works when feedback is reliable and external (execution, tools, checkers).
Result: The survey finds no study showing successful self-correction from prompted-LLM feedback except on tasks unusually suited to it.
For us: A second "critic" call by the same small model is not worth its latency. Spend the effort on code checks: the number check, unit / sample checks, and "errors teach" messages are reliable external feedback.
Adopt? now (code checks); reject (same-model critic pass) · Cost: S

### Chain-of-Verification (ACL Findings 2024, arXiv 2309.11495) and Self-Consistency (ICLR 2023, arXiv 2203.11171)

Links: https://arxiv.org/abs/2309.11495 · https://arxiv.org/abs/2203.11171 · Evidence: peer-reviewed · Models: Llama 65B, PaLM, GPT-3
Claim: CoVe — plan verification questions and answer them independently — reduces factual hallucination in list and long-form answers. Self-consistency — sample several reasoning paths and take the majority — improves accuracy on reasoning tasks.
For us: Both multiply calls. For tool calls, self-consistency is cheap to approximate: if a small model's call is invalid, re-sample rather than re-prompt; in evaluation, pass^k measures the same thing. For prose, our verification is deterministic (numbers come from tool results), which is stronger than CoVe for numeric claims.
Adopt? design a seam (sample-k for low-confidence calls on fast models) · Cost: M

### Genie "Trusted" and Cortex verified queries (industry; see §3.2)

Provenance in industry products is shown per answer, not per sentence: the answer is badged when it came from verified logic, and "Show query" exposes the SQL. No product found shows sentence-level citations for numbers.
For us: Our design (result cards rendered from rows + "Show query" + number check underlining unmatched numbers) already matches or exceeds what products ship. Sentence-level citation adds little once every number is checked.
Adopt? now (as designed) · Cost: —

## 3.8 Evaluation and performance validation

### τ-bench — Tool-Agent-User Interaction in Real-World Domains (ICLR 2025, arXiv 2406.12045)

Link: https://arxiv.org/abs/2406.12045 · Evidence: peer-reviewed · Models: frontier function-calling models
Claim: Agents must be reliable across repeated trials, not just right once; a simulated user plus a final-state check makes grading automatic.
Result: gpt-4o succeeds on < 50 % of tasks; **pass^8 < 25 %** in retail — the same task solved in all 8 tries.
For us: pass^k is the right gate for a local model that will answer the same kinds of question every week. Report pass^1 and pass^k (k = 3–5) per category.
Adopt? now · Cost: S

### Dr.Spider — Diagnostic Evaluation Benchmark towards Text-to-SQL Robustness (ICLR 2023, arXiv 2301.08881)

Link: https://arxiv.org/abs/2301.08881 · Evidence: peer-reviewed · Models: pre-LLM and Codex-era models
Claim: 17 perturbations of questions, databases and SQL expose brittleness.
Result: The most robust model loses 14.0 % overall and 50.7 % on the hardest perturbation.
For us: Each evaluation question should have 2–3 paraphrases (synonyms, word order, nicknames, typos), scored as a group. Cheap to generate with a strong model and verify by execution.
Adopt? now · Cost: S

### TrustSQL (ICLR 2025, arXiv 2403.15879), AmbiQT (EMNLP 2023), AMBROSIA (NeurIPS 2024 D&B)

Links: https://arxiv.org/abs/2403.15879 · https://doi.org/10.18653/v1/2023.emnlp-main.436 · https://doi.org/10.52202/079017-2876 · Evidence: peer-reviewed
Claim: TrustSQL scores abstention with a penalty for wrong answers, so declining beats guessing; AmbiQT and AMBROSIA show models rarely notice ambiguity (scope, attachment, vagueness) and usually commit to one reading.
For us: Score "unanswerable / advice" and "ambiguous" with a penalty-based metric (wrong answer = −c, abstain = 0, right = +1), and include vagueness cases specific to us ("best", "lately", "good matchup").
Adopt? now · Cost: S

### FLEX — False-Less Execution metric (NAACL 2025, arXiv 2409.19014)

Link: https://arxiv.org/abs/2409.19014 · Evidence: peer-reviewed · Models: LLM judges
Claim: Execution accuracy has many false positives and negatives; an LLM judge with full context agrees with experts better.
Result: Cohen's κ with experts 62 (EX) → 87.04 (FLEX); rankings on Spider/BIRD change.
For us: Our grading compares engine results, so the main risk is false negatives (an equally valid call with a different `limit` or extra metric). Grade on the reference rows ⊆ answer rows and the metric value, and use an LLM judge only to review failures, never as the primary score.
Adopt? now (execution-first, judge for triage) · Cost: S

### BFCL — Berkeley Function Calling Leaderboard (ICML 2025, PMLR 267)

Link: https://proceedings.mlr.press/v267/patil25a.html · https://gorilla.cs.berkeley.edu/leaderboard.html · Evidence: peer-reviewed + live leaderboard · Models: all sizes
Claim: AST-based grading of function calls (serial, parallel, multi-turn, abstention); frontier models are good at single calls, weak at multi-turn state and long horizons.
For us: BFCL's AST grading (compare the call's structure, ignore argument order) is a useful _secondary_ score for "valid first call". The leaderboard is the place to shortlist local models for the matrix.
Adopt? now (shortlisting + AST-style call check) · Cost: S

### LLM-as-judge (skimmed)

MT-Bench (Zheng et al., NeurIPS 2023 D&B): GPT-4 judges agree with humans about as often as humans agree with each other, with position, verbosity and self-preference biases. Combined with FLEX: use a judge for prose qualities (states the sample, declines advice) with a fixed rubric, and never for numbers.
Adopt? now (rubric judge for prose only) · Cost: S

## 3.9 Small and local models

### Let Me Speak Freely? (EMNLP 2024 Industry, arXiv 2408.02442) vs dottxt's response, and JSONSchemaBench (arXiv 2501.10868, 2025)

Links: https://arxiv.org/abs/2408.02442 · https://blog.dottxt.ai/say-what-you-mean.html · https://arxiv.org/abs/2501.10868 · Evidence: peer-reviewed + vendor rebuttal + preprint
Claim: Tam et al. report that format restrictions (JSON mode, strict schemas) degrade reasoning. dottxt's rebuttal argues the drop came from prompts that hid task information, and that regex/schema-constrained decoding matches or beats free text when the prompt is fair (GSM8K 0.77 → 0.78 on their re-run; much bigger lifts for weak models in their own GSM8K study). JSONSchemaBench compares six constrained-decoding engines (Guidance, Outlines, llama.cpp, XGrammar, OpenAI, Gemini) on 10k real schemas: coverage of schema features and speed differ a lot between engines.
For us: Constrained decoding is safe for _the call_ (a short JSON object) as long as the model can think first — let it write its reasoning in a free field or a preceding turn, then constrain the call. Keep tool schemas to simple features (enums, required fields, no deep `anyOf`), because engines differ in what they support. Ollama's `format` uses llama.cpp grammars.
Adopt? now (structured mode with a free `thought` field first; simple schemas) · Cost: S

### TinyAgent — Function Calling at the Edge (EMNLP 2024 Demo, arXiv 2409.00608) and Octopus v2 (arXiv 2404.01744)

Links: https://arxiv.org/abs/2409.00608 · https://arxiv.org/abs/2404.01744 · Evidence: peer-reviewed demo + preprint · Models: 1.1B, 2B, 7B
Claim: Task-specific fine-tuning of small models on curated function-calling data, plus tool retrieval to shorten prompts and quantisation, matches or beats GPT-4-Turbo on a fixed tool set on a laptop.
Result: TinyAgent-1.1B / 7B on a MacBook ≥ GPT-4-Turbo on its 16-tool assistant task; Octopus v2 (2B) beats GPT-4 in accuracy and latency on its Android API set, with 95 % shorter context.
For us: The strongest evidence that a fine-tuned 1–8B model can handle our 7–12 tools reliably. The data can be generated: our engine verifies any synthetic question → call pair by execution.
Adopt? design a seam (follow-up spec after AG's matrix) · Cost: L

### ToolACE (ICLR 2025, arXiv 2409.00920) and APIGen / xLAM (NeurIPS 2024 D&B, arXiv 2406.18518)

Links: https://arxiv.org/abs/2409.00920 · https://arxiv.org/abs/2406.18518 · Evidence: peer-reviewed · Models: 1–8B
Claim: Synthetic function-calling data with rule-based + model-based verification trains 8B models to rival GPT-4 on BFCL.
For us: Their verification pipeline (format check → execution check → semantic check) is the template for generating our own training or few-shot data. Their released models (xLAM, ToolACE-8B, Hammer) are candidates for the evaluation matrix alongside general models.
Adopt? now (add 1–2 function-calling fine-tunes to the matrix) · Cost: S

### Text-to-SQL small-model line: CodeS (SIGMOD 2024), OmniSQL (VLDB 2025, arXiv 2503.02240), Arctic-Text2SQL-R1 (ACL Findings 2026, arXiv 2505.20315), SQL-R1 (NeurIPS 2025, arXiv 2504.08600), XiYan-SQL (arXiv 2411.08599)

Evidence: peer-reviewed / preprint · Models: 1.5–32B
Claim: Synthetic data at scale (OmniSQL: millions of verified pairs) and RL with an execution-correctness reward (Arctic-R1, SQL-R1) make 7–32B open models competitive with frontier models on BIRD / Spider. XiYan's M-Schema is a compact semi-structured schema format that helps models read schemas.
For us: The same recipe applies to our DSL: execution-verified synthetic pairs + a simple correctness reward. These are also the models to try _if_ a raw-SQL path is ever added for local models. Not for this spec.
Adopt? design a seam · Cost: L

### "Give Me BF16 or Give Me Death"? Accuracy-Performance Trade-Offs in LLM Quantization (ACL 2025, arXiv 2411.02355)

Link: https://doi.org/10.18653/v1/2025.acl-long.1304 · Evidence: peer-reviewed · Models: Llama 3.1 8B–405B
Claim: 4-bit weight-only quantisation (W4A16) is more competitive than expected, close to 8-bit; FP8 is lossless.
For us: Q4_K_M local models (what fits 8 GB) lose little on general benchmarks; tool-call reliability under quantisation is not covered and is worth one row in the matrix (Q4 vs Q8 of the same 4B model).
Adopt? now (one Q4-vs-Q8 row) · Cost: S

### Local probe on this machine (2026-11-01)

`ollama show` reports the installed `gemma3:4b` and `gemma3:12b` (Q4_K_M, 128k context) with capabilities **completion, vision — no `tools`**. Through Ollama they can only be used in structured mode (JSON `format`), not native tool calling. Tool-capable families in Ollama today include Qwen3, Llama 3.1+, Mistral / Ministral and Granite; newer Gemma releases add tool calling. The embedding models `bge-m3` and `nomic-embed-text` are installed for a resolver probe.

## 3.10 Flexibility in a fast-moving field

### Anthropic — Writing effective tools for agents (engineering blog, Sept 2025)

Link: https://www.anthropic.com/engineering/writing-tools-for-agents · Evidence: industry · Models: Claude
Claim: Build few, consolidated, task-shaped tools; namespace them; return natural-language identifiers rather than opaque ids; offer a `response_format` (concise ≈ ⅓ the tokens of detailed in their example); truncate with guidance; make errors specific with an example of a correct call; refine descriptions from evaluation transcripts on held-out tasks; collect accuracy, runtime, tool calls, tokens and tool errors.
For us: Our §3 already follows most of this. Additions: names alongside ids in results (the model should see "Bijan Robinson (ATL)", not only `00-0039…`); a `detail` switch; analysing transcripts for redundant calls and invalid-parameter errors as the routine tuning loop.
Adopt? now · Cost: S

### Anthropic — Code execution with MCP (engineering blog, Nov 2025) and Cloudflare "Code Mode"

Link: https://www.anthropic.com/engineering/code-execution-with-mcp · Evidence: industry · Models: Claude
Claim: Presenting MCP tools as a code API that the agent calls from a sandbox keeps intermediate results out of the context; their example went from ~150k to ~2k tokens.
For us: Pays off with many tools and large intermediate data. Our results are already compacted to 15 × 6, and our users' strong-model path is Claude through MCP, which has its own code tools. Not needed in the app.
Adopt? reject for the app; revisit if multi-step analyses grow · Cost: —

### Model Context Protocol (spec 2025-06-18 and 2025-11-25)

Link: https://modelcontextprotocol.io/specification/2025-11-25/changelog · Evidence: standard
Facts: 2025-06-18 added **structured tool output** (`outputSchema` + `structuredContent`) and **elicitation** (the server asks the user for input mid-call); 2025-11-25 extended elicitation (enum schemas, defaults, URL mode) and added experimental **tasks**; the draft moves tasks to an extension and allows any JSON Schema 2020-12 in schemas.
For us: Return results as `structuredContent` with an `outputSchema` (the same shape as our result cards), plus a compact text rendering for clients that ignore structured output. Elicitation is the standard way for the MCP path to ask a clarifying question ("Which Mike Williams?") — use it where the client supports it, fall back to an ambiguity result otherwise.
Adopt? now · Cost: S

### Prompt optimisation from an evaluation set: DSPy (ICLR 2024, arXiv 2310.03714), MIPROv2 (EMNLP 2024, arXiv 2406.11695), TextGrad (Nature 2025, arXiv 2406.07496), GEPA (arXiv 2507.19457, 2025)

Evidence: peer-reviewed · Models: all sizes, incl. small open models
Claim: Treat prompts (instructions + few-shot demos) as parameters and optimise them against a metric on a training split. GEPA reflects on full trajectories (reasoning, tool calls, tool outputs) in natural language and beats MIPROv2 by > 10 % and GRPO by 6 % on average with up to 35× fewer rollouts.
For us: Once the evaluation set and runner exist (AG), the brief and tool descriptions per model become optimisable artefacts. Needs a train / held-out split of the question set. Implement the loop ourselves in TypeScript (one optimiser, GEPA-style reflection by a strong model) rather than adopt a Python framework.
Adopt? design a seam (AG: split the set; follow-up: optimiser) · Cost: M

### Open Semantic Interchange (OSI) (industry standard, Sept 2025 → v1.0)

Link: https://www.getdbt.com/blog/the-osi-spec-updates · Evidence: industry standard (Apache-2.0, moving to ASF) · Models: —
Claim: Vendor-neutral YAML interchange for semantic definitions — datasets, metrics, dimensions, relationships — led by Snowflake, Salesforce and dbt Labs, with Databricks, Cube and others joining.
For us: If the catalogue is exported in a standard shape, OSI is the one to target; it is young, so export (a generated file) rather than make it the source of truth.
Adopt? design a seam (an export script) · Cost: S

## 3.11 Newer ideas

### Text2SQL is Not Enough: Unifying AI and Databases with TAG (CIDR 2025, arXiv 2408.14717) and semantic operators — LOTUS (arXiv 2407.11418) / Palimpzest (CIDR 2025, arXiv 2405.14696)

Evidence: peer-reviewed / preprint · Models: frontier + open
Claim: Many real questions need world knowledge or reasoning _over_ query results ("which of these RBs are in a contract year?"); text-to-SQL and RAG each answer ≤ 20 % of TAG-Bench. Semantic operators (LLM-powered filter / join / rank as query operators) with optimisers make that tractable.
For us: Our split is already TAG-shaped: the engine computes, the model reasons over compact results. Semantic operators over our tables (e.g., an LLM filter over news text) belong to the adviser spec, not this one.
Adopt? reject for now; note for the adviser spec · Cost: —

### NL → visualisation: nvBench (SIGMOD 2021), LIDA (ACL 2023 Demo, arXiv 2303.02927), ChartGPT (TVCG 2024), VisEval (TVCG 2024), Data Formulator 2 (CHI 2025, arXiv 2408.16119)

Evidence: peer-reviewed · Models: frontier + fine-tuned
Claim: LLMs can write chart specs, but VisEval's checkers find frequent validity, legality and readability errors across models; the systems that work decompose the task (ChartGPT) or keep the user iterating on intermediate steps (Data Formulator 2).
For us: Supports letting the app pick the chart from the result's shape (time grain → line; one metric ranked → bar; two metrics → scatter), with an optional `chart` hint the model may set from a small enum. A free-form chart spec from a 4B model would fail VisEval-style checks often.
Adopt? now (app picks; model hints from an enum) · Cost: S

### InsightBench (ICLR 2025, arXiv 2407.06423) and QuickInsights (SIGMOD 2019)

Evidence: peer-reviewed · Models: GPT-4o, LLaMA-3
Claim: Proactive insight generation (find what is notable without a question) can be benchmarked with planted insights; QuickInsights mines top-k insight types (outliers, trends, shifts) over cubes with statistical scores, no LLM needed.
For us: "What's notable this week?" is better done QuickInsights-style in code (the outlook's regression and stability signals already are), with the model only narrating the top findings.
Adopt? design a seam (later: an `insights` tool over existing signals) · Cost: M

### Agent memory: Agent Workflow Memory (ICML 2025, arXiv 2409.07429)

Link: https://arxiv.org/abs/2409.07429 · Evidence: peer-reviewed · Models: GPT-4
Claim: Inducing reusable workflows from past successful runs and giving them to the agent improves success (+24.6 % / +51.1 % relative on Mind2Web / WebArena) and reduces steps.
For us: The verified question → call library (D9) is the data-analyst version of workflow memory: harvested from Dev-mode logs after the user confirms, retrieved by masked-question similarity (DAIL-SQL).
Adopt? design a seam (D9) · Cost: M

### Surveys used for coverage (skimmed)

- _A Survey of Text-to-SQL in the Era of LLMs_ (TKDE 2025, arXiv 2408.05109): module-by-module map of NL2SQL; confirms value retrieval, example selection and correction as the stable modules.
- _LLM/Agent-as-Data-Analyst: A Survey_ (arXiv 2509.23988): four design goals — semantic-aware design, autonomous pipelines, tool-augmented workflows, open-world tasks.
- _A Survey of Data Agents: Emerging Paradigm or Overstated Hype?_ (arXiv 2510.23587): L0–L5 autonomy levels for data agents. Our Ask is an L1–L2 assistant (human asks, agent executes a bounded plan), which is where the literature says reliability is achievable today.

## Leads checked and not used

- _"Let Me Speak Freely?"_ exists and says what we thought, but its conclusion is disputed (see §3.9); cited with the rebuttal.
- _Snowflake "verified queries"_ exists as a feature with documentation; no published accuracy study of the feature itself, only vendor and practitioner numbers.
- _Databricks Genie_ benchmarks exist as a product feature; no published accuracy figures.
- _Looker conversational analytics_ and _Cube_: product docs and vendor blogs only; used for the format pattern, not as evidence.
- _MotherDuck / DuckDB agent work_: product material (MCP server with read-only `query`, per-agent compute isolation); no research results.
- _LLM-driven query optimisation_: exists (LLM-R2, λ-Tune), not relevant at our scale.
- _data.world KG benchmark_: confirmed (arXiv 2311.07509) with the follow-up 2405.11706.
- _BFCL_: confirmed as an ICML 2025 paper (PMLR 267), not on arXiv.
- Every other italic lead in the plan was found and says what the plan expected.
