# LLM data-analyst agents: state of the art — research plan

**Date:** 2026-11-01 · **Status:** ready to run (in its own session) · **Feeds:** the Ask spec (`docs/superpowers/specs/2026-11-01-ask-analyst-design.md`, §11 "Research first") before Plan AF

## 1. Why

The Ask spec turns plain-language football questions into calls on our stats engine, with any model: Claude through MCP, a paid or free API, or a local model on an 8 GB GPU. Before we build it, we want to know what the research community has learnt about LLM-powered data-analyst agents. The question is whether the database, the app and the project environment should change to make that job easier, more correct and faster, for strong and weak models alike. The field moves fast, so the answer must also say which parts to keep swappable.

## 2. What we have today (the baseline every finding is compared to)

- **Warehouse:** `stats.duckdb`, one analytics worker thread owns it. Raw layer (nflverse play-by-play, participation with players on the field, NGS, PFR, FTN charting, Sleeper), identity tables, derived weekly / season tables with component sums and "paired sums" (rates only over weeks where both sides are known), model tables (Elo + season simulation, opponent-adjusted EPA, SRS, FG model, empirical-Bayes shrinkage, stability). 2019 → current season, ~300 MB.
- **Semantic layer, informally:** a catalogue of 310 metrics (`src/shared/stats/catalogue.ts`). Each has an id, label, description written for an LLM, formula over component sums, sample, positions, grain, first season, unit, direction, tier, and a measured stability.
- **Query engine:** `StatsQuery` (entity, metrics, scope, play-grain situation filters, groupBy, transform, sort, limit, scoring), validated against the catalogue and compiled to parameterised, read-only SQL with a 5 s timeout and row cap. Its JSON Schema is generated for an LLM (`src/shared/stats/querySchema.ts`). Results carry value, sample, qualified, percentile, rank, estimated flag and caveat notes. Wide queries are split into parallel narrow ones, because DuckDB ranks each metric in its own window step.
- **Ask spec draft:** task-shaped tools over the engine, a deterministic resolver (names, teams, metrics, dates, screen context) before the model is called, a compact tool profile for small models, structured (schema-constrained) mode, a number check on answers, an execution-graded evaluation of about 150 questions, MCP server + stdio bridge, providers (Anthropic, OpenAI-compatible, Ollama / LM Studio).
- **Constraints:** Electron + TypeScript desktop app for Windows; works offline; free, keyless data; one user; the user's laptop is an i7-13620H with 32 GB RAM and an RTX 4060 Laptop GPU (8 GB). Ollama (WSL: `gemma3:4b`, `gemma3:12b`, `bge-m3`, `nomic-embed-text`) and LM Studio (Windows) are installed.

## 3. Research questions

Each topic lists what to find out, then the decision in our project it settles. Names in _italics_ are **leads to verify**, written from memory: confirm that each exists and says what we think before citing it, and drop it if not.

### 3.1 Agent architecture: how the model reaches the data

- Text-to-SQL vs a semantic layer / DSL with tools vs code generation (Python / pandas in a sandbox): accuracy, robustness and safety, especially for small models. Single loop (ReAct-style) vs planner / executor / verifier multi-agent designs; self-correction from execution errors.
- Leads: Spider 2.0, BIRD and BIRD-Interact, _DIN-SQL_, _MAC-SQL_, _CHESS_, _CHASE-SQL_, _DAIL-SQL_, _ReFoRCE_, data-agent benchmarks (_DABstep_, _DA-Code_, _InfiAgent-DABench_, _DSBench_, _KramaBench_, _TableBench_), Data Interpreter.
- **Decides:** keep the structured engine as the only path? Add a guarded raw-SQL tool for strong models? A Python sandbox for ad-hoc maths? One loop or several agents? (Spec §3, §5.)

### 3.2 Semantic layers and semantic consistency

- Does a semantic layer (metrics, dimensions, joins, synonyms, verified example queries) measurably beat raw schemas for LLM accuracy? How do industry systems model it, and how do they keep one question → one definition across rephrasings and turns?
- Leads: _dbt Semantic Layer / MetricFlow LLM benchmark_, _Snowflake Cortex Analyst semantic model and "verified queries"_, _Databricks AI/BI Genie_, _Looker conversational analytics_, _Cube_, knowledge-graph / ontology grounding papers (_data.world benchmark on knowledge graphs vs SQL_).
- **Decides:** should the catalogue become a formal semantic model (dimensions as first-class, synonyms, verified-query library, relationships) and in what format, ideally one an outside tool could read? (Spec §4.2.)

### 3.3 Schema linking, entity resolution and retrieval

- How systems pick the right columns, metrics and values out of hundreds; lexical vs embedding vs LLM-based linking; value retrieval ("Niners" → SF, nicknames, misspellings); few-shot example retrieval by similarity.
- Leads: _CHESS_ (schema pruning + value retrieval), _RESDSQL_, _CodeS_, _"The Death of Schema Linking?"_, _RSL-SQL_, example-selection studies.
- **Decides:** the resolver's design (§4.1): lexical aliases only, or local embeddings (`bge-m3`) too; how many candidates to pass a small model; a retrieval store of past verified question → call pairs.

### 3.4 Query optimisation and OLAP for agent workloads

- Agents send bursts of exploratory, repetitive, partly speculative queries. What do data-systems researchers propose: agent-first database design, query and result caching (exact and semantic), shared sub-plans, speculative and progressive execution, budgets per question?
- Leads: _"Supporting Our AI Overlords: Redesigning Data Systems to be Agent-First"_ (Berkeley, 2025), semantic-cache papers, _LLM-driven query optimisation_, DuckDB-specific work (MotherDuck, extensions).
- **Decides:** a result cache in the worker; precomputed cubes for the questions asked most; whether to change the 5 s timeout and row cap; tracing every query for cost.

### 3.5 Efficient aggregation

- Pre-aggregation selection (materialised views, cubes, GROUPING SETS), incremental view maintenance, sketches (HyperLogLog, KLL / t-digest quantiles) for percentiles, approximate query processing with error bounds for interactive exploration.
- Leads: classic view-selection work and its LLM-era revisits, DuckDB's own aggregate and window performance notes.
- **Decides:** whether play-grain situational questions (≤ 1 s budget today) need new derived tables, and whether percentiles and ranks over a filtered population can be faster.

### 3.6 Statistical correctness

- How often LLM analysts make statistical errors (small samples, cherry-picked splits, Simpson's paradox, regression to the mean, multiple comparisons, correlation as causation), and which guardrails work: sample thresholds, uncertainty intervals, tests as tools, automatic caveats, critique passes.
- Leads: _BLADE_, _DiscoveryBench_, _QRData_, _StatQA_, _DSBench_ error analyses, "LLMs as data scientists" evaluations.
- **Decides:** statistical tools in the analyst (confidence intervals, significance of a split, shrunk vs raw, stability-aware wording); what the brief forbids; what the number check should also catch. (Spec §4.3.)

### 3.7 Faithfulness, provenance and verification

- Checking numeric claims against tool outputs, attributing each sentence to a result, verifier or critic models, self-consistency (several samples, majority answer), execution-based re-checks.
- **Decides:** is the number check enough; does every claim need a citation to a result card; is a second "critic" call worth its latency on local models?

### 3.8 Evaluation and performance validation

- How to measure an analyst agent: execution accuracy vs semantic equivalence; robustness to paraphrase; multi-turn follow-ups; ambiguity and clarifying questions; unanswerable detection; LLM-as-judge reliability; latency and cost reporting; contamination.
- Leads: _Dr.Spider_ (robustness), _CoSQL_ / _SParC_ / BIRD-Interact (multi-turn), _AmbiQT_, _AMBROSIA_ (ambiguity), _TrustSQL_ (abstention), _BFCL_ (function calling), _τ-bench_ (agent reliability, pass^k).
- **Decides:** the evaluation's size, categories, grading rules and gates (spec §7), including pass^k (the same question answered right k times out of k), not just one try.

### 3.9 Small and local models

- Tool calling quality of small open models; constrained decoding and its effect on reasoning (format-restriction studies, e.g. _"Let Me Speak Freely?"_); quantisation loss; context-length limits; fine-tuning or distilling a small model on synthetic, engine-verified question → tool-call pairs (_OmniSQL_, _Arctic-Text2SQL-R1_, _XiYan-SQL_, _SQL-R1_, RL with execution rewards).
- **Decides:** the compact profile and structured mode (spec §3, §5); whether a fine-tuned small "analyst" model is worth a follow-up spec; which model families to put in the evaluation matrix.

### 3.10 Flexibility in a fast-moving field

- Which parts the literature and industry treat as unstable (models, prompting styles, agent frameworks) vs stable (tool contracts, semantic layers, evaluation sets). Standards: MCP (tools, resources, prompts, elicitation), OpenAI-compatible APIs, prompt optimisation from an evaluation set (_DSPy_, _TextGrad_), agent "skills" and memory.
- **Decides:** the seams: what is a plug-in (provider, model, prompt, tool profile, retrieval), what is a contract (tool schemas, catalogue format, result format), and how the evaluation set lets us swap any part safely.

### 3.11 Newer ideas worth a look

- NL → visualisation (_nvBench_, _LIDA_, _ChartGPT_, _VisEval_); proactive insights and anomaly explanation (_QuickInsights_, auto-insight mining); semantic operators over tables (_LOTUS_, _Palimpzest_); learnt per-user memory and preferences; query-by-example; reasoning models and test-time compute for analysis; "agentic data science" end-to-end systems.
- **Decides:** what goes in the spec now, what is designed for later (a seam), and what is rejected.

## 4. Method

1. **Sources.** arXiv (cs.DB, cs.CL, cs.AI, cs.LG), ACL Anthology, VLDB / SIGMOD / CIDR / ICDE proceedings, NeurIPS and ICLR (incl. datasets and benchmarks), Semantic Scholar or Google Scholar for citation counts and "cited by" chains, plus industry engineering posts and technical reports (Anthropic, OpenAI, Snowflake, Databricks, dbt Labs, Google, MotherDuck, DuckDB Labs). Use the paper-search MCP server when connected; otherwise web search + arxiv.org.
2. **Window.** Mostly 2023 → 2026 (the LLM era), plus the classic database work each topic stands on. Prefer the latest version of a preprint.
3. **Search and snowball.** For each topic in §3: 3–5 queries, take the strongest 10–20 hits, read abstracts, then follow references backwards and "cited by" forwards from the 2–3 best. Stop a topic when new papers repeat known findings.
4. **Depth.** About 50–70 papers skimmed, 25–40 read in depth. For each one read in depth, a note (template in §5) in the appendix file.
5. **Evidence quality.** Mark each finding: peer-reviewed / preprint / industry claim; benchmark-only / real users; the model sizes it was shown on (a result shown only with frontier models may not hold at 4–12B). Prefer results replicated by a second group.
6. **Small probes (optional, ≤ half a day).** Where a claim would change our design and is cheap to test on our data, test it with the local models already installed, on 15–20 questions: e.g. our tools vs raw text-to-SQL over our schema with `gemma3:12b`; lexical vs `bge-m3` metric linking; constrained decoding on vs off. Record the setup and numbers; the full evaluation stays in Plan AG.
7. **Time-box.** One session for search and reading, one for synthesis and the report; ask the user before going beyond that.

## 5. Reading-note template (appendix)

```
### <short name> — <title> (<venue or arXiv id>, <year>)
Link: <url> · Evidence: peer-reviewed | preprint | industry · Models: <sizes>
Claim: <one or two sentences>
Method: <what they built or measured>
Result: <the numbers that matter, with the benchmark>
For us: <what it means for the warehouse, engine, tools, resolver, evaluation or local models>
Adopt? now | design a seam for later | reject — <why> · Cost: S | M | L
```

## 6. Deliverables

1. **Report** `docs/research/<date>-ask-analyst-state-of-the-art.md`:
   - a one-page summary: the five or six findings that change our plans;
   - findings by topic (§3.1–3.11), each with evidence and its quality;
   - **answers to the decision questions D1–D12 below**, each with a recommendation and its evidence;
   - a **recommendations table**: recommendation · evidence · affects (database / engine / catalogue / tools / resolver / loop / evaluation / UI / project tooling) · spec section · effort · priority (adopt now / seam for later / reject);
   - a **flexibility map**: contracts vs plug-ins, and how each plug-in is swapped and re-validated;
   - **proposed changes to the Ask spec**, section by section, ready to apply;
   - the bibliography with links (arXiv ids where they exist).
2. **Reading notes** `docs/research/<date>-ask-analyst-reading-notes.md` (template §5).
3. **Probe results**, if run, in the report's appendix with the commands to re-run them.

## 7. Decision questions the report must answer

| #   | Question                                                                                                                                   | Spec section |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------ | ------------ |
| D1  | Structured engine only, or also a guarded SQL tool and / or a Python sandbox, and for which models?                                        | §3           |
| D2  | Should the catalogue become a formal semantic model (dimensions, synonyms, relationships, verified queries), in which format?              | §4.2         |
| D3  | Resolver: lexical aliases, local embeddings, or both; how many candidates to give a small model?                                           | §4.1         |
| D4  | Database: result cache, pre-aggregated cubes, sketches, new derived tables, query budgets — which, and measured how?                       | new          |
| D5  | Statistical guardrails as tools (intervals, split significance, sample warnings) vs rules in the brief?                                    | §4.3, §4.4   |
| D6  | Verification: number check only, sentence-level provenance, a critic pass, self-consistency?                                               | §4.3         |
| D7  | Evaluation: size, categories, grading, pass^k, LLM-as-judge or not, gates?                                                                 | §7           |
| D8  | Local models: families to test, constrained decoding, and is fine-tuning a small model on engine-verified synthetic data worth a spec?     | §5, §7       |
| D9  | Memory: a growing library of verified question → call pairs used as few-shot examples; per-user preferences?                               | new          |
| D10 | Charts: does the model choose and specify charts (NL → vis), or does the app pick from the result's shape?                                 | §8           |
| D11 | One agent loop or planner / executor / verifier roles; does it differ between strong and weak models?                                      | §5           |
| D12 | Project environment: tracing and replay of agent runs, evaluation in CI with recorded replies, prompt optimisation from the evaluation set | §7, §10      |

## 8. Kickoff prompt for the research session

> Run the research plan in `docs/research/2026-11-01-ask-analyst-research-plan.md`. Read it and the Ask spec draft it feeds (`docs/superpowers/specs/2026-11-01-ask-analyst-design.md`) first. Use the paper-search MCP server for arXiv and other paper platforms. Verify every lead in _italics_ before citing it. Write the reading notes as you go, then the report with answers to D1–D12, and ask me before running the optional probes.
