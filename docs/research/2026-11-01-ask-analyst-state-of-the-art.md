# LLM data-analyst agents: state of the art — report

**Date:** 2026-11-01 · **Plan:** `2026-11-01-ask-analyst-research-plan.md` · **Feeds:** the Ask spec (`docs/superpowers/specs/2026-11-01-ask-analyst-design.md`) before Plan AF — §6 and Appendix B applied to the spec on 2026-11-02 · **Notes:** `2026-11-01-ask-analyst-reading-notes.md` (one entry per source, template §5 of the plan)

**Scope read.** About 75 sources checked, 45 read in depth (abstract, method and results; full text where the result mattered), 2023 → 2026 plus the classic database work. Every lead the plan listed in _italics_ was verified before use; none turned out to be invented, a few are industry-only (no published study), and those are marked. Probes P1–P4 were run on this laptop on 2026-11-01/02 (Appendix B, harness in `docs/research/ask-probes/`). They confirmed D1, changed the details of D3 and D8, found one bug in our own schema, and added design rules for the compact tools (finding 7).

**Evidence labels used below:** **[PR]** peer-reviewed · **[pre]** preprint · **[ind]** industry claim · **[F]** shown on frontier models only · **[S]** shown on small (≤ 15B) models too.

---

## 1. Summary — the six findings that change our plans

1. **Structure beats raw SQL, and the two fail differently.** Answering through a semantic layer is more accurate than text-to-SQL whenever the layer covers the question — dbt Labs' 2026 re-run: Claude Sonnet 4.6 90.0 → 98.2 %, GPT-5.3-Codex 84.1 → 100 % [ind, F]. More important for us: **text-to-SQL returns plausible wrong numbers; the semantic layer returns errors.** Raw SQL over large real schemas stays hard even for frontier agents (Spider 2.0: 21 %; ReFoRCE ≈ 36 %) [PR, F]. → Keep the structured engine as the only path in the app; fix coverage gaps by adding metrics and dimensions, not by adding raw SQL (D1).

2. **Written definitions are worth more than a bigger model.** A 4 KB document of measures, conventions and disambiguation rules lifted three frontier models by the same 17–23 points, and the models were statistically indistinguishable within each condition [pre, F]. BIRD's "evidence" hints, the data.world ontology study (16.7 → 54.2 → 72.6 %) and Snowflake's semantic model say the same [PR/ind]. → The glossary, dimension definitions and synonyms become a first-class, tested artefact: dimensions get the same treatment metrics already have (D2).

3. **Small models need narrowing; strong models need breadth.** Frontier long-context models do best with the whole schema ("Death of schema linking", BIRD 71.8 %) [pre, F], while small models need ranked, pruned candidates (RESDSQL, CodeS 1–15B) [PR, S] and do better with fewer tools (Less is More on edge models; RAG-MCP 13.6 → 43.1 % tool-selection accuracy) [pre]. → The resolver serves both: recall-oriented candidates for everyone, enums narrowed to the top few only for the compact profile, and a way out ("none of these → `find`") (D3).

4. **The same model reviewing itself does not help; checks in code do.** Intrinsic self-correction does not improve reasoning and can hurt; self-correction works with reliable external feedback (execution, checkers) [PR]. → No critic pass. Spend the effort on deterministic checks — the number check plus a sample check, a base-rate-before-split rule and a causal-language flag — and on errors that explain the fix (D5, D6).

5. **Reliability, not one lucky answer, is the gate.** τ-bench: gpt-4o solves < 50 % of tasks and the same task in all 8 tries < 25 % (pass^8) [PR]; paraphrases cost robust models 14 % (Dr.Spider) [PR]; models rarely notice ambiguity (AMBROSIA, AmbiQT) [PR]; multi-turn with a simulated user is the new standard (BIRD-Interact: GPT-5 at 8.7–17 %) [PR, F]. → The evaluation adds pass^k, paraphrase groups, penalty scoring for "should decline / should ask", a simulated user for follow-ups and clarifications, and a held-out split (D7).

6. **Our installed local models can't call tools natively, but small models can be made reliable.** Ollama reports `gemma3:4b` / `12b` as completion + vision only, so they need structured mode. Fine-tuned 1–8B models match GPT-4-class tool calling on a fixed tool set (TinyAgent, Octopus v2, ToolACE, xLAM) [PR, S], and execution-verified synthetic data trains small text-to-SQL models to near-frontier (OmniSQL, Arctic-Text2SQL-R1) [PR, S]. → Add tool-capable families and a function-calling fine-tune to the matrix; use constrained decoding with a free reasoning field first; keep "fine-tune our own small analyst" as a follow-up spec, triggered by AG's results (D8).

7. **Measured on this laptop: the environment matters more than the model (Appendix B).** With the tools as first drafted, the local models got 2–9 of 20 test questions right. Five changes, each measured, raised that to 15/20 for gemma3:4b (1.3 s per call), 17/20 for gemma3:12b (5.2 s) and 15/20 for qwen3:4b (2.5 s):
   - Code picks the tool from the resolver's output.
   - The schema drops every slot the resolver already filled (time, ids, team).
   - A slot appears only when the resolver saw words for it.
   - Every optional choice has a neutral value.
   - Arrays and the reasoning field have length caps.

   qwen3:4b with native tool calls reached 16/20 without these changes, but at 18 s per call. Raw SQL from gemma3:12b got 5/10 rankings right, against 9/10 for the engine's DSL, and its wrong answers were confident (unqualified leaders). One bug in our own code surfaced: `querySchema.ts` bounds seasons with `minimum: 2019`, which grammar-constrained decoding turns into years like 2600 and 2126. No query ran until the bound became an enum.

One more idea runs through several topics: **one library of verified question → tool-call pairs** serves as few-shot examples (DAIL-SQL), plan cache (Agentic Plan Caching), "verified queries" (Snowflake), "trusted assets" (Databricks) and workflow memory (AWM). We design the seam now and fill it from the Dev-mode log (D9).

What the literature does **not** support for us: new aggregation machinery (sketches, approximate answers, incremental views), semantic answer caching, LLM query optimisation, multi-agent LLM pipelines on a local GPU, a Python sandbox, or free-form chart specs written by the model.

---

## 2. Findings by topic

### 2.1 Agent architecture (plan §3.1)

- **Text-to-SQL** has climbed on BIRD from 55.9 % (DIN-SQL, 2023) through 59.6 % (MAC-SQL), 66.7 % (CHESS), 71.8 % (no schema linking) to 73.0 % (CHASE-SQL) [PR/pre, F], but the gains come from many LLM calls per question (decomposition, multiple candidates, trained selectors, unit tests). On enterprise-scale schemas the best agents are at 21–36 % (Spider 2.0, ReFoRCE) [PR, F]. Small fine-tuned models reach 44–64 % on BIRD (SQL-Llama 7B, CodeS, OmniSQL) [PR, S].
- **Semantic layer / DSL with tools:** higher accuracy where covered and, crucially, errors instead of wrong answers (dbt 2023 & 2026, data.world, Cortex Analyst, Genie) [ind/pre, F]. No peer-reviewed study compares the two on small models; the small-model evidence is indirect — narrow, fixed tool sets fine-tuned or narrowed for small models work (§2.9).
- **Code generation in a sandbox** (pandas): realistic data-agent benchmarks put the best systems at 14.6 % (DABstep hard), 25 % (DiscoveryBench), 30.5 % (DA-Code), 34 % (DSBench), 55 % (KramaBench) [PR/pre, F]. Strong at open-ended maths, weak at getting domain definitions right; costly to sandbox in an Electron app.
- **Single loop vs multi-agent:** multi-agent pipelines (MAC-SQL, CHESS, CHASE-SQL, Cortex Analyst's classify → enrich → generate → correct → synthesise) win on leaderboards with frontier models and several calls per question. Their transferable part is _deterministic_: classify the question, retrieve values and examples, validate with the compiler, explain errors. dbt found higher reasoning effort did not raise accuracy but did triple latency [ind, F].
- **Self-correction from execution errors** is the one LLM-in-the-loop step with consistent support (MAC-SQL refiner, data.world repair loop 54 → 72.6 %, ReFoRCE) [PR/pre].

### 2.2 Semantic layers and consistency (§3.2)

- The industry formats have converged on: **entities / logical tables, dimensions (incl. time), measures with aggregation, filters, synonyms, sample values, relationships, verified queries** (Snowflake semantic model YAML, dbt MetricFlow, LookML, Cube, Genie spaces) [ind]. The Open Semantic Interchange (OSI) — Snowflake, Salesforce, dbt Labs, later Databricks, Cube and others — published a v1.0 vendor-neutral YAML in 2025–26, Apache-2.0, moving to the ASF [ind].
- **Consistency across rephrasings and turns** comes from the same definitions being used every time: the model picks _ids_, the layer owns the formula. Our catalogue already does this for metrics (formula over component sums, sample, qualification); dimensions (pressure, neutral, red zone, coverage …) are defined in code and the glossary, but are not yet first-class with synonyms and allowed values.
- **Verified queries** are used two ways in industry: as retrieved few-shot context (Cortex: similar verified queries; Genie: example SQL), and as evaluation ground truth with the tested query removed from context (Cortex) or kept entirely separate (Genie benchmarks) [ind]. Practitioner report: complex questions 40 → 75 % after a verified-query feedback loop [ind].
- **Decline with suggestions:** Cortex classifies questions first and answers ambiguous or non-data ones with similar questions it _can_ answer [ind].

### 2.3 Schema linking, entity resolution, retrieval (§3.3)

- **Value retrieval** (CHESS: exact + LSH over column values + keyword extraction; CodeS: BM25 then longest-common-substring) is what makes "Niners" → SF or a misspelt surname work, and it needs no model [PR/pre, S].
- **Linking risk is omission**, not noise, for strong models (Death of schema linking; RSL-SQL links forwards from the question and backwards from a draft) [pre, F]. For small models, pruning is essential (RESDSQL, CodeS) [PR, S] and fewer tools help (Less is More [pre]; TinyAgent's tool retrieval [PR, S]).
- **Example selection:** DAIL-SQL's best setting picks few-shot examples by similarity of the _masked_ question (domain words removed) and of the predicted query skeleton, shown as question–answer pairs; open-source models gained much less from examples than GPT-4 did [PR, S/F].
- **Embedding vs lexical:** no source compares them on a 300-item metric catalogue. The text-to-SQL systems that work use both (keywords/BM25 for exact terms, embeddings for paraphrase). This is the cheapest probe to run on our data (Appendix A, P2).

### 2.4 Query optimisation for agent workloads (§3.4)

- The Berkeley agent-first paper documents "agentic speculation": many redundant, steerable queries (distinct sub-plans often < 10–20 % of all; expert hints cut queries 18 %) [pre, F]. Its proposals — probes with briefs, approximate answers, shared sub-plans, caching, an agentic memory store, proactive steering — target cloud warehouses with many agents.
- **Caching:** exact result caching is safe; semantic caching of _answers_ is not (static thresholds give unpredictable false hits; vCache needs a learnt per-entry threshold under an error bound) [PR]. Caching _plans_ (Agentic Plan Caching: −50 % cost, −27 % latency) is the agent-appropriate form [PR, F].
- **At our scale** (300 MB DuckDB, one user, ms – 1 s per query vs seconds – tens of seconds per local model call), the model dominates latency. What carries over: steering hints in results (why empty, what to change), a per-turn query trace, and an exact cache for follow-ups and evaluation re-runs.

### 2.5 Efficient aggregation (§3.5)

- Cube / view selection (Harinarayan et al. 1996), incremental maintenance (OpenIVM, a DuckDB extension, 2024), sketches (DuckDB ships HyperLogLog and t-digest; a DataSketches extension adds KLL) and approximate query processing all target data far larger than ours. AQP's long-standing weakness is selective filters (Chaudhuri et al., _No Silver Bullet_, 2017) [PR] — exactly our situational questions.
- **Recommendation:** measure first. Query traces will show whether any play-grain situational shape recurs and exceeds its budget; only then materialise a play-grain cube for the top shapes.

### 2.6 Statistical correctness (§3.6)

- LLMs pick statistical tests poorly; their typical error is applying a test whose assumptions fail (StatQA: GPT-4o 64.8 %; fine-tuned small models beat in-context GPT-4o) [PR, S/F]. Data-based causal reasoning is weak (QRData: GPT-4 58 %, best open 37 %) [PR, S/F]. Open-ended analyses stay basic (BLADE) and discovery is far from solved (DiscoveryBench 25 %) [PR].
- **Leading questions are the fantasy-shaped risk.** Agents given different priors reach opposite conclusions from the same data through defensible choices; 86 % of those reports passed AI review (Agentic Garden of Forking Paths, 2026) [pre, F]. Agents that test until significant inflate false positives (POPPER: plain agents up to 0.248 Type-I error; e-values bring it ≤ 0.1) [PR, F].
- **What works:** fixed, correctly-implemented statistics in code; reporting the overall line before any split; counting how many splits were looked at; sample-aware and stability-aware wording. Our engine already carries sample, qualification, percentile, estimated flags, empirical-Bayes shrinkage and measured stability — the guardrails mostly need surfacing, not inventing.

### 2.7 Faithfulness and verification (§3.7)

- Self-correction: no reliable gain from prompted self-feedback; gains with external feedback [PR]. Chain-of-Verification and self-consistency help, at several times the calls [PR, F].
- Products show provenance per answer, not per sentence: Genie's **Trusted** badge for answers built from verified logic, Cortex's verified queries, "show SQL" everywhere [ind]. Our result cards rendered from rows + "Show query" + the number check already exceed this.

### 2.8 Evaluation (§3.8)

- **pass^k** (τ-bench) for consistency; **paraphrase groups** (Dr.Spider) for robustness; **penalty-based scoring** so declining beats guessing (TrustSQL); **ambiguity** categories (AmbiQT, AMBROSIA: scope, attachment, vagueness); **multi-turn with a user simulator** (BIRD-Interact) [all PR].
- **Grading:** execution accuracy has false positives and negatives; an LLM judge with full context agrees better with experts (FLEX: κ 62 → 87) [PR]. LLM judges carry position, verbosity and self-preference biases (MT-Bench) [PR]. → Execution first; judge only prose qualities and failure triage.
- **Function-call validity:** BFCL's AST comparison is a good secondary score and its leaderboard the place to shortlist local models [PR].
- **Contamination:** our questions are private, so model contamination is not a concern; _self_-contamination is — examples in the few-shot library must not be evaluation questions (Genie keeps them apart).

### 2.9 Small and local models (§3.9)

- **Constrained decoding:** "Let Me Speak Freely?" reports reasoning loss under format restrictions [PR]; dottxt's rebuttal attributes it to prompts that hid task information and shows parity or gains when prompts are fair, larger for weak models [ind]. JSONSchemaBench shows big differences between engines in which schema features they support [pre]. → Constrain the _call_, let the model think first in a free field, keep schemas simple.
- **Function calling:** fine-tuned small models match frontier ones on fixed tool sets — TinyAgent-1.1B/7B on a MacBook ≥ GPT-4-Turbo; Octopus v2 (2B) > GPT-4 with 95 % shorter context; ToolACE-8B and xLAM rival GPT-4 on BFCL [PR, S].
- **Quantisation:** 4-bit weight-only (what fits 8 GB) is close to 8-bit on general benchmarks [PR, S–L]; its effect on tool-call validity is unmeasured — one Q4-vs-Q8 row settles it for us.
- **Synthetic data + RL with execution reward** (OmniSQL, Arctic-Text2SQL-R1, SQL-R1) is the recipe for a small specialist; our engine can verify any synthetic question → call pair by running it.
- **Locally:** Ollama lists the installed Gemma 3 models without the `tools` capability → structured mode only. Tool-capable families in Ollama include Qwen3, Llama 3.1+, Mistral / Ministral and Granite; newer Gemma releases add tool calling.

### 2.10 Flexibility (§3.10)

- **Stable** across the literature and industry: tool contracts, the semantic model, evaluation sets and grading, MCP. **Unstable**: models, prompting styles, agent frameworks, reasoning-effort settings, and specific benchmarks (several numbers changed between versions of the same preprint during this review).
- **MCP** 2025-06-18 added structured tool output (`outputSchema` / `structuredContent`) and elicitation; 2025-11-25 extended elicitation and added experimental tasks; the draft loosens schemas to JSON Schema 2020-12 [standard].
- **Tool design** (Anthropic, Sept 2025): few consolidated task-shaped tools, natural-language identifiers in results, a concise/detailed switch (≈ ⅓ the tokens), truncation with guidance, specific errors with a correct example, description tuning from held-out evaluation transcripts [ind].
- **Prompt optimisation** from an evaluation set is mature: DSPy / MIPROv2, TextGrad, and GEPA (reflects on full tool-call trajectories; > 10 % over MIPROv2 with far fewer rollouts) [PR/pre, S/F]. It needs a train / held-out split.

### 2.11 Newer ideas (§3.11)

- **TAG / semantic operators** (LOTUS, Palimpzest): questions that need world knowledge over query results; our engine-computes / model-reasons split is already TAG-shaped. Semantic operators over text (news) belong to the adviser spec.
- **NL → vis:** models write invalid or unreadable chart specs often (VisEval); working systems decompose (ChartGPT) or keep the human iterating (Data Formulator 2). → The app picks charts.
- **Proactive insights:** QuickInsights-style mining in code (outliers, trends, shifts with statistical scores) + narration; InsightBench shows planted-insight evaluation. → A later `insights` tool over existing outlook / stability signals.
- **Memory:** Agent Workflow Memory (+24.6 % / +51.1 % relative on web tasks) supports the verified-example library; learnt free-form user memory is still open (consistency with changing data is an open problem even in the agent-first paper).

---

## 3. Answers to the decision questions

### D1 — Structured engine only, or also guarded SQL and / or a Python sandbox?

**Recommendation: structured engine only, for every model, in AF–AH.** Design two seams, decide later from the Dev-mode log.

- **Evidence.** Structure wins where covered and fails safe (errors, not wrong numbers) [dbt 2026, data.world, Cortex]; raw SQL over real schemas is 21–36 % even for frontier agents [Spider 2.0, ReFoRCE]; code agents are 15–55 % on realistic tasks [DABstep, DSBench, KramaBench]. dbt's own guidance: try the semantic layer, then a small modelling change, and only then text-to-SQL.
- **Why not SQL for strong models.** The number check would pass a wrong SQL answer (its numbers _are_ from a tool result), so the one safety net we have would not catch the failure mode SQL introduces. The MCP user already has Claude; the app's job is to be the trustworthy path.
- **Seam 1 — `sql` tool (later, MCP + Dev mode only):** read-only, over documented views, 5 s / row cap, results badged "custom SQL — not checked against the catalogue". Trigger: the log shows a steady share of questions the engine can't express that a new metric or dimension wouldn't fix.
- **Seam 2 — maths.** Instead of a sandbox, add deterministic statistics to results (D5). A `calc` tool (correlation between two metrics, a linear trend) can come later as fixed functions, not code.
- **Coverage gaps** are logged: every `query` validation failure and every "can't answer" decline goes to the Dev-mode log with the question, to become new metrics, dimensions or derived tables.
- **Probe P4 (Appendix B).** Same 15 questions and context, gemma3:12b:
  - Rankings: the DSL got 9/10 right; raw SQL got 5/10.
  - SQL's misses were plausible wrong leaders and wrong joins. Examples: a 6.75 YPRR receiver and a 29.0 CPOE backup QB, both unqualified. The number check would pass these.
  - SQL won on lookups (5/5 vs 0/5) only because the free DSL let the model forget the player filter. The compact tools take the player from the resolver.
  - SQL took about 3× as long (p50 28.5 s vs 8.8 s).

### D2 — Should the catalogue become a formal semantic model, in which format?

**Recommendation: yes — make dimensions first-class and add synonyms, sample values and verified examples; keep TypeScript as the source of truth and generate a YAML export.**

- **Evidence.** All industry semantic layers share entities, dimensions, measures, filters, synonyms, sample values, relationships and verified queries [Cortex, MetricFlow, LookML, Cube, Genie]; definitions are worth ~20 points [2604.25149]; OSI v1.0 is the emerging interchange format [ind].
- **What changes.**
  - `MetricDef.aliases` (already planned, §4.2).
  - New `DimensionDef` for each situation filter and `by` value: id, label, description, synonyms, allowed values (each with label and synonyms, e.g. coverage: man / zone; personnel: 11 → "three-wide"), grain (play / week / season), first season and sources, which entities and positions it applies to.
  - Relationships stay implicit (the engine owns the joins); entities are player, team and game.
  - Verified examples live in `companion.db`, not in the catalogue (D9).
- **Format.** TypeScript stays authoritative (type-checked, tested for alias collisions). A script exports `semantic-model.yaml` in an OSI-like shape, published as an MCP resource next to the glossary; an outside tool could read it, and it is regenerated in CI so it cannot drift.

### D3 — Resolver: lexical, embeddings or both; how many candidates for a small model?

**Recommendation: lexical matching with metric aliases and an entity / position filter as the core. `bge-m3` is an optional add-on that fills the last two of five slots when a local embedding server is present. Compact profile: top 5 metrics (top 10 on a retry after `other`) and top 3 players. Full profile: hints only, no narrowing.**

- **Evidence.** Value retrieval in code is the stable module of text-to-SQL systems [CHESS, CodeS]; small models need narrowing [RESDSQL, CodeS, Less is More, RAG-MCP]; strong models do best without pruning [Death of schema linking]; the risk is omission [RSL-SQL].
- **Recall over precision.** The target is recall@k ≥ 95 % on the evaluation questions. Probe P1 (40 phrasings, no aliases yet):
  - Lexical alone reaches 0.85 at k = 5.
  - `bge-m3` alone reaches 0.70; it is weak on abbreviations (YPRR, aDOT, PPG).
  - Lexical top 3 + `bge-m3` top 2, with a position filter, reaches 0.93 (0.95 at k = 10).
  - The remaining misses are paraphrases ("gets rid of the ball fastest", "long-distance kicker") that aliases cover, so measure again once the aliases are written.
  - `bge-m3` in Ollama 0.16.2 returned NaN for 12 of 326 catalogue entries, which is another reason to keep it optional.
- **`other` means re-resolve.** In P2/P3, when the right metric was not among the candidates, qwen3:4b answered `other` instead of a plausible wrong id. The loop then retries with k = 10.
- **Re-link on error.** When a call fails, the error message re-runs the resolver on the model's chosen argument and offers the nearest valid ids (the RSL-SQL backward step, in code).
- **Ambiguity is detected here.** Two players matching "Mike Williams" yields an ambiguity entry; the loop asks before the model is called (MCP: elicitation where the client supports it).
- **Question-type classification** (lookup, leaderboard, split, compare, trend, games, league, advice, out of range) is added to the resolver, in code: it picks the compact tool subset and declines advice or pre-2019 questions before any model call (Cortex's classification agent, DIN-SQL's classifier — done deterministically).
- **The classifier picks the tool for the compact profile.** In P2 a rule over the resolver's output was right on 20/20 questions, while the models choosing for themselves were wrong on a third to half of them. The rule: one player → `player_stats`; two or more → `compare`; one team → `team_stats`; "what is …" with no player → `describe`; otherwise `leaderboard`.

### D4 — Database: result cache, cubes, sketches, new derived tables, budgets?

**Recommendation: a per-turn query trace and an exact result cache now; everything else measured first or rejected.**

| Item                                                                                                             | Verdict           | How measured                                                                |
| ---------------------------------------------------------------------------------------------------------------- | ----------------- | --------------------------------------------------------------------------- |
| Query trace (query hash, ms, rows, cache hit, turn id)                                                           | **adopt now**     | It is the measurement                                                       |
| Exact LRU result cache in the worker, keyed on compiled SQL + params, cleared when `StatsStatus.through` changes | **adopt now** (S) | Hit rate in traces; follow-ups and evaluation re-runs are the expected hits |
| Steering in results: why-empty explanations, "lower `minSample`?", "metric starts 2022"                          | **adopt now**     | Retries per question in the evaluation                                      |
| Play-grain cube for the top situational shapes                                                                   | **seam**          | Only if traces show a recurring shape above its 1 s budget                  |
| Sketches, approximate answers, IVM, LLM query optimisation                                                       | **reject**        | Data is 300 MB; exact is fast; the model dominates latency                  |
| Semantic (embedding) answer cache                                                                                | **reject**        | False hits return confident wrong numbers                                   |
| 5 s timeout, row cap, 8 calls / turn                                                                             | **keep**          | Revisit if traces show timeouts on valid queries                            |

### D5 — Statistical guardrails as tools or rules in the brief?

**Recommendation: both, with the weight on code. Statistics are computed in the engine and attached to results; the brief only tells the model how to talk about them.**

- **In results (code):**
  1. **Splits carry their base.** Any `by` split returns the overall row first, and each split row carries its difference from the base, an interval and a `withinNoise` flag. The interval uses the metric's sample and measured split-half reliability (already computed).
  2. **Shrunk alongside raw** for rates under the qualified sample (empirical-Bayes shrinkage exists).
  3. **Stability in `describe` and on results:** year-to-year r and the half-signal sample, already measured.
  4. **A per-turn split counter:** when the model has looked at many splits in one turn, the results say so ("1 of 9 splits examined").
- **In the brief (rules):** report the overall line before any split; no causal language ("because", "due to") unless a result directly compares the two conditions; state the sample when a row is not qualified; prefer "within noise" wording when flagged; describe low-stability metrics as such.
- **Not a tool the model chooses.** StatQA shows models pick tests badly; a "significance test" tool with a method argument would invite the error. Fixed computation in results avoids the choice.
- **Evidence:** StatQA, QRData, BLADE, the forking-paths study, POPPER.

### D6 — Verification: number check only, sentence provenance, critic pass, self-consistency?

**Recommendation: number check plus three cheap code checks; no sentence-level provenance; no critic pass; self-consistency only as pass^k in evaluation.**

- **Checks after each answer (code, no model):**
  1. Every number matches a result of the turn (as designed).
  2. A rate quoted from an unqualified row has its sample stated nearby.
  3. A split reported without its base is flagged.
  4. Causal words with no supporting comparison are flagged softly (underlined, not blocked).
- **Why no critic:** intrinsic self-correction doesn't help and can hurt [2310.01798, 2406.01297]; on a local GPU a critic doubles a 10–15 s turn.
- **Why no sentence citations:** every number is already tied to a result; cards and "Show query" give the provenance; products don't do more [Genie, Cortex].
- **Seam:** sample-k for an invalid first call on fast cloud models (re-sample rather than re-prompt) — evaluate in AG, off by default.

### D7 — Evaluation: size, categories, grading, pass^k, LLM judge, gates?

**Recommendation:**

- **Size.** About 150 base questions, each with 2 paraphrases (≈ 450 items). A 60-question **core** subset is run k = 3 times for local models; the full set once. Split 2/3 _dev_ (tuning the brief, tool descriptions and k) and 1/3 _held-out_ (gates only).
- **Categories.** As in the spec, plus: paraphrase groups (synonyms, nicknames, typos, word order); vagueness ("best", "lately", "good matchup"); leading questions ("isn't X declining?" → must give the base rate); multi-turn follow-ups and clarifications run against a **simulated user** (a strong model given the hidden intent).
- **Grading.**
  - _Primary:_ execution — the reference rows are contained in the answer's top k, and metric values match after rounding.
  - _Secondary:_ AST-style call validity (BFCL), retries, number-check pass, latency p50 / p90, tokens.
  - _Decline and ask categories:_ penalty scoring (+1 right, 0 decline or ask, −1 wrong answer; TrustSQL).
  - _Prose:_ a fixed rubric judged by a strong model (states the sample, gives the base before a split, no advice, no causal claim) — never used for numbers; the judge also triages failures.
- **pass^k.** Report pass^1 and pass^3 per category.
- **Gates (to confirm with you):**
  - The strong Claude tier: ≥ 90 % pass^1 and ≥ 85 % pass^3 on the held-out set.
  - The recommended local model: ≥ 70 % pass^1 and ≥ 60 % pass^3 on the core categories (lookup, leaderboard, compare, follow-ups), p50 ≤ 15 s, and a penalty score ≥ 0 on the decline / ask categories.
- **Hygiene.** Evaluation questions never enter the example library; every report records the model, profile, mode, brief hash and engine version.

### D8 — Local models: which families, constrained decoding, fine-tuning?

**Recommendation:**

- **Families for the AG matrix**, shortlisted from BFCL at plan time:
  - Qwen3 4B and 8B (native tools).
  - One Llama 3.1-class 8B.
  - One of Granite or Ministral.
  - The installed Gemma 3 4B / 12B, in structured mode only (no `tools` capability in Ollama).
  - One function-calling fine-tune (xLAM, ToolACE or Hammer family, GGUF).
  - One Q4-vs-Q8 row of the same 4B model.
- **Constrained decoding:** yes, for structured mode, with rules measured in P2 / P3 (Appendix B):
  1. The app picks the tool (the D3 classifier); the model fills only that tool's arguments.
  2. No slot the resolver fills (seasons, weeks, player, team, ids), and none the metric fixes (entity, side).
  3. A slot appears only when the resolver detected words for it ("red zone", "game log", "WRs"), with only the detected options. Every optional enum starts with a neutral value (`any`, `none`). Under constrained decoding small models write out every listed field, so an optional enum with no neutral value gets a wrong one.
  4. `maxItems` on every array, `maxLength` on `thought`, and an output cap per call. Without them gemma3:4b repeated an array item until it ran out of tokens.
  5. Numeric bounds as enums, never `minimum` / `maximum`. With the shipped `querySchema.ts`, grammar-constrained decoding produced seasons like 2600 and 2126, and 0 of 15 queries ran.
  6. A free `thought` field first helped gemma3:4b with the merged schema (2 → 4 of 20); it is kept, with a cap.
- **Native tool calls** on a tool-trained model (qwen3:4b) reached 16/20 without these rules. But this build always reasons first: p50 18 s, p90 26 s, and 2 of 20 ran out of a 2048-token thinking budget. The same model in structured mode with the rules got 15/20 at 2.5 s. Both modes stay in the matrix, and the thinking budget is a setting.
- **Newer models (your note, 2026-11-01).** The Gemma 3 models are old. AG re-runs the probe matrix on current light models (fit in 8 GB) and larger ones (12–30B, or small mixture-of-experts with RAM offload), shortlisted from BFCL at that time. `docs/research/ask-probes/run.sh` re-runs everything.
- **Fine-tuning:** worth a follow-up spec **only if** AG finds no local model at the gate. The evidence that it would work is strong (TinyAgent, Octopus v2, ToolACE, OmniSQL, Arctic-R1). The data pipeline is cheap for us: generate question → call pairs with a strong model, keep only those the engine runs and a second pass agrees on. Whether training fits this GPU is a question for that spec.

### D9 — Memory: a verified question → call library; per-user preferences?

**Recommendation: yes to the library (seam in AF, used in AG); no to learnt free-form memory.**

- **Library.** Table `ask_examples` in `companion.db`: question, masked question (slots replaced: `{player}`, `{metric}`, `{week}`), slots, tool call, result hash, source (`user` from a thumbs-up in Dev mode, or `seed`), verified date. Retrieved by masked-question similarity (lexical + optional embeddings), top 3 into the compact prompt; offered to MCP clients as a resource.
- **Evidence:** DAIL-SQL (masked-question selection), Cortex verified queries, Genie trusted assets, Agentic Plan Caching, Agent Workflow Memory.
- **Caution:** DAIL-SQL found open models gain less from examples than GPT-4 did — measure on/off in AG.
- **Preferences:** the facts that matter (league scoring, my roster, current week) already reach the model through tools and the context block. Free-form memory ("user likes target share") risks stale or wrong context and is unsolved research; reject for now.

### D10 — Charts: model specifies, or app picks?

**Recommendation: the app picks from the result's shape; the model may pass a `chart` hint from a small enum (`table`, `bar`, `line`, `scatter`).**

- **Rules:** a time grain gives a line; one ranked metric gives a bar; two metrics give a scatter; otherwise a table.
- **Evidence:** VisEval finds frequent validity, legality and readability errors in LLM-written specs; ChartGPT needs decomposition and fine-tuning; Data Formulator 2 keeps a human in the loop.
- `open_in_app` stays the way to a richer view (Explore, Dashboard, Compare).

### D11 — One loop or planner / executor / verifier roles?

**Recommendation: one loop for every model.** The planner is deterministic code (resolver + question-type classifier), and the verifier is deterministic code (validation, errors that teach, answer checks).

- **Strong models:** a single tool loop with the full profile; they plan internally.
- **Small models:** the same loop with the compact profile, a narrowed tool subset picked by the classifier, and top-3 examples.
- **Evidence:** multi-agent gains come from frontier models with many calls (MAC-SQL, CHESS, CHASE-SQL, Cortex); dbt found more reasoning didn't help; self-critique doesn't help (D6); on 8 GB each extra role costs seconds.
- **Seam:** the loop's steps are functions (classify → resolve → call → check), so a model-backed step can replace one later without changing the rest.

### D12 — Project environment: tracing, replay, CI evaluation, prompt optimisation

**Recommendation:**

1. **Trace every turn** (structured): brief hash, model, profile, mode, resolver output, each tool call (args, compiled-query hash, ms, rows, cache hit, error), tokens, check results. Threads keep a summary; Dev mode keeps full traces in `ask/log.jsonl`.
2. **Replay.** `npm run ask:replay -- <trace>` re-runs a trace's tool calls against the frozen database (deterministic) and, optionally, re-asks the model.
3. **CI with recorded replies.** The unit suite replays recorded model replies (as specified) _and_ re-grades them against the current engine, so an engine change that alters an answer fails `npm test` without any model running.
4. **Prompt optimisation (seam).** The brief and tool descriptions are versioned files per profile; the dev / held-out split exists from AF. A later step adds a GEPA-style optimiser: a strong model reads failing dev-set trajectories and proposes edits, gated on held-out scores. Written in TypeScript; no Python framework.
5. **Evaluation reports** go to `docs/research/ask-eval-<date>-<model>.md` plus a JSON with the same fields, so runs compare over time.

---

## 4. Recommendations table

| #   | Recommendation                                                                                      | Evidence                                         | Affects            | Spec §     | Effort | Priority                 |
| --- | --------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ------------------ | ---------- | ------ | ------------------------ |
| R1  | Structured engine is the only path; log coverage gaps                                               | dbt 2026, data.world, Spider 2.0, ReFoRCE        | tools, loop        | §1, §3     | S      | adopt now                |
| R2  | Read-only `sql` tool over views, MCP + Dev mode, badged                                             | dbt guidance                                     | tools              | §3         | M      | seam                     |
| R3  | `DimensionDef` with synonyms, values, coverage; aliases for metrics                                 | Cortex, MetricFlow, OSI, 2604.25149              | catalogue          | §4.2       | M      | adopt now                |
| R4  | Generated `semantic-model.yaml` (OSI-like) as MCP resource                                          | OSI                                              | catalogue, tooling | §4.2, §6.1 | S      | seam                     |
| R5  | Hybrid lexical + optional `bge-m3` retrieval; recall@k target                                       | CHESS, CodeS, RSL-SQL                            | resolver           | §4.1       | M      | adopt now                |
| R6  | Compact: top-5 metric / top-3 player enums + escape; full: no narrowing                             | Less is More, RAG-MCP, Death of SL               | tools, resolver    | §3, §4.1   | S      | adopt now                |
| R7  | Deterministic question-type classifier; early decline / ask                                         | Cortex, DIN-SQL                                  | resolver, loop     | §4.1, §5   | S      | adopt now                |
| R8  | Re-link on error (nearest valid ids in the message)                                                 | RSL-SQL, MAC-SQL                                 | tools              | §3         | S      | adopt now                |
| R9  | Names with ids in results; `detail` switch                                                          | Anthropic tools post                             | tools              | §3         | S      | adopt now                |
| R10 | Splits carry base row, interval, `withinNoise`; shrunk beside raw                                   | StatQA, forking paths, POPPER                    | engine, tools      | §3, §4.3   | M      | adopt now                |
| R11 | Answer checks: sample stated, base before split, causal flag                                        | Self-correction lit., QRData                     | loop, UI           | §4.3       | S      | adopt now                |
| R12 | No critic pass; no sentence citations                                                               | 2310.01798, 2406.01297                           | loop               | §4.3, §5   | —      | reject                   |
| R13 | Per-turn query trace                                                                                | Agent-first paper                                | database, tooling  | new        | S      | adopt now                |
| R14 | Exact result cache, cleared on warehouse refresh                                                    | Agent-first, vCache (contrast)                   | database           | new        | S      | adopt now                |
| R15 | Why-empty / steering notes in results                                                               | Agent-first paper                                | engine             | §3         | S      | adopt now                |
| R16 | Play-grain cube for top situational shapes                                                          | View selection                                   | database           | new        | M      | seam (measure)           |
| R17 | Sketches, AQP, IVM, semantic answer cache, LLM query opt.                                           | AQP No Silver Bullet, vCache                     | database           | —          | —      | reject                   |
| R18 | Eval: paraphrases, pass^3, penalty scoring, simulated user, held-out split                          | τ-bench, Dr.Spider, TrustSQL, BIRD-Interact      | evaluation         | §7         | M      | adopt now                |
| R19 | Execution-first grading; LLM judge for prose rubric + triage                                        | FLEX, MT-Bench                                   | evaluation         | §7         | S      | adopt now                |
| R20 | Matrix: Qwen3 4B/8B, Llama 8B, Granite/Ministral, Gemma 3 (structured), one FC fine-tune, Q4 vs Q8  | BFCL, TinyAgent, ToolACE, BF16-or-death          | evaluation         | §6.2, §7   | S      | adopt now                |
| R21 | Structured mode with `thought` first; simple schemas                                                | Let Me Speak Freely + rebuttal, JSONSchemaBench  | loop               | §5         | S      | adopt now                |
| R22 | Fine-tuned local analyst model on engine-verified data                                              | TinyAgent, Octopus, OmniSQL, Arctic-R1           | local models       | §12        | L      | seam (if AG misses gate) |
| R23 | `ask_examples` verified library, masked-question retrieval                                          | DAIL-SQL, Cortex, Genie, APC, AWM                | resolver, loop, DB | new        | M      | seam (AF), use (AG)      |
| R24 | App picks chart; model hint enum                                                                    | VisEval, ChartGPT, DF2                           | UI, tools          | §8         | S      | adopt now                |
| R25 | One loop; deterministic planner and verifier                                                        | MAC-SQL / CHESS (contrast), dbt                  | loop               | §5         | —      | adopt now                |
| R26 | MCP `structuredContent` + `outputSchema`; elicitation for ambiguity                                 | MCP 2025-06-18 / 11-25                           | MCP                | §6.1       | S      | adopt now                |
| R27 | Trace replay; CI re-grades recorded replies against the engine                                      | Anthropic tools post                             | project tooling    | §7, §10    | M      | adopt now                |
| R28 | Versioned briefs; GEPA-style optimiser later                                                        | DSPy, MIPROv2, GEPA                              | project tooling    | §4.4, §7   | M      | seam                     |
| R29 | `insights` tool over outlook / stability signals                                                    | QuickInsights, InsightBench                      | tools              | —          | M      | seam (later spec)        |
| R30 | Python sandbox; free-form charts; learnt user memory; multi-agent LLM roles; code-execution MCP     | DABstep / DSBench, VisEval, agent-first, MAC-SQL | —                  | §12        | —      | reject                   |
| R31 | Compact structured mode: app picks the tool; only unresolved, detected slots, with neutral defaults | Probes P2 / P3                                   | tools, loop        | §3, §5     | S      | adopt now                |
| R32 | `maxItems` / `maxLength` on every array and free-text field; output cap per call                    | Probe P2                                         | tools, loop        | §3, §5     | S      | adopt now                |
| R33 | Numeric bounds as enums in schemas the local path constrains (fix `querySchema.ts` seasons)         | Probe P4                                         | engine schema      | §3         | S      | adopt now                |
| R34 | Thinking budget for reasoning models; native vs structured chosen per model by the evaluation       | Probe P3                                         | providers, loop    | §5, §6.2   | S      | adopt now                |
| R35 | Re-run the probe matrix on current light and larger models in AG                                    | Your note; probe harness                         | evaluation         | §7         | S      | adopt now                |

---

## 5. Flexibility map

**Contracts** — stable, versioned and tested; changing one is a spec change:

| Contract                                                | Where                                               | Guarded by                              |
| ------------------------------------------------------- | --------------------------------------------------- | --------------------------------------- |
| Tool names, input JSON Schemas, error shape             | `src/main/analyst/tools.ts`                         | unit tests; MCP `tools/list` snapshot   |
| Result shape (= result card = MCP `outputSchema`)       | `src/shared/ask.ts`                                 | type checks; replay tests               |
| `StatsQuery` DSL                                        | `src/shared/stats/querySchema.ts`                   | existing engine tests                   |
| Semantic model (metrics, dimensions, aliases, glossary) | `catalogue.ts`, new `dimensions.ts`, generated YAML | collision tests; YAML regenerated in CI |
| Context block (resolver output)                         | `resolve.ts` types                                  | resolver tests (recall@k)               |
| Trace format                                            | `trace.ts`                                          | replay tests                            |
| Evaluation item and grading rules                       | `tests/ask/questions/`, `scripts/eval-ask.ts`       | runner self-test on reference calls     |

**Plug-ins** — swappable; each swap is re-validated by the same evaluation:

| Plug-in                                                | Swap by                                   | Re-validate with                                                        |
| ------------------------------------------------------ | ----------------------------------------- | ----------------------------------------------------------------------- |
| Provider adapter (Anthropic, OpenAI-compatible, local) | new adapter file + recorded-reply tests   | one matrix row on the held-out set                                      |
| Model                                                  | setting                                   | `eval:ask --model …`; profile and mode defaults updated from the report |
| Calling mode (native / structured)                     | setting per model                         | matrix row in both modes                                                |
| Tool profile (full / compact) and candidate k          | setting; k in config                      | dev set to tune, held-out to confirm                                    |
| Brief and tool descriptions                            | versioned files (hash in traces)          | held-out set; never tuned on it                                         |
| Retrievers (lexical, embedding)                        | `retrieve(text) → candidates[]` interface | resolver recall@k on evaluation questions                               |
| Example library on / off, k                            | setting                                   | matrix row with and without                                             |
| Answer checks                                          | list of `(answer, results) → flags`       | unit tests + false-flag rate on the evaluation                          |
| Chart picker                                           | rule table                                | snapshot tests                                                          |
| Future tools (`sql`, `calc`, `insights`)               | added to the full profile only            | new evaluation category before release                                  |

**The rule:** any plug-in change runs `eval:ask` on the held-out set and is compared with the last report for that configuration. A drop below the gate blocks the default, not the option.

---

## 6. Proposed changes to the Ask spec, section by section

**§1 Decisions** — add a row:

> **Research (2026-11-01)** — Structured engine only (no raw SQL, no Python sandbox); dimensions become first-class with synonyms; deterministic classifier, planner and verifier around a single loop; statistics computed in results; evaluation with pass^k, paraphrases, penalty scoring and a simulated user. Report: `docs/research/2026-11-01-ask-analyst-state-of-the-art.md`.

**§2 Architecture** — in the diagram and bullets:

- The resolver gains a **classifier** (question type → tool subset, early decline or ask).
- The stats worker gains a **query trace** and an **exact result cache** (cleared when `StatsStatus.through` changes).
- `companion.db` gains `ask_examples` (D9).
- Add the line: "The model never writes SQL or code; coverage gaps are logged and fixed by adding metrics, dimensions or derived tables."

**§3 Analyst tools**

- Results give names with ids ("Bijan Robinson (ATL) · 00-0039…").
- Add `detail: concise | full` (default concise for the model).
- Any `by` split returns the base row first, plus a difference, interval and `withinNoise` per split row, and shrunk beside raw for unqualified rates.
- Empty or thin results explain why and what to change.
- Errors re-run the resolver on the failing argument and list the nearest valid ids.
- Compact profile: enums narrowed to the top 5 metrics and top 3 players, plus an `other` value that makes the loop re-resolve with k = 10.
- Compact structured mode follows the D8 rules: the tool is picked by the classifier; the schema has only slots the resolver left open and detected, with neutral defaults, `maxItems` / `maxLength`, and enum bounds.
- Fix `querySchema.ts`: seasons as an enum of the seasons in the warehouse, not `minimum: 2019`.
- Add an optional `chart` hint (`table`, `bar`, `line`, `scatter`) on result-producing tools.

**§4.1 Resolver**

- Lexical matching with aliases and an entity / position filter always; `bge-m3` optional, filling the last two of five slots; target recall@5 ≥ 95 % on the evaluation questions (P1: 0.93 before aliases).
- A deterministic question-type classifier that also picks the compact tool, and slot detection (situation words, "game log" / "by week", position words) that decides which slots the schema shows.
- Ambiguous names produce a clarification before the model is called.

**§4.2 → "Semantic model, aliases and the glossary"**

- Add `DimensionDef` (id, label, description, synonyms, values with labels and synonyms, grain, first season and sources, applicable entities and positions) for every situation field and `by` value.
- Tests: no alias or synonym points at two ids; every metric and dimension has a description and at least one synonym.
- A generated `semantic-model.yaml` (OSI-like), exposed as an MCP resource.

**§4.3 Answers that can be checked** — beside the number check:

- A sample-stated check for unqualified rows.
- A base-before-split check.
- A soft causal-language flag.
- State explicitly that there is no second model pass, and why (§3 D6 of the report).

**§4.4 Analyst brief**

- Add the statistical rules (base rate first, no causal claims without a comparison, sample and stability wording, "within noise").
- Briefs are versioned files per profile; the hash goes in every trace.

**§5 Agent loop**

- Turn: classify → resolve → (ask, if ambiguous) → model → tools → checks.
- Structured mode: `{thought, args}` for the tool the classifier picked, `thought` first and capped (`{thought, tool, args}` only on the full profile).
- An output cap per call and a thinking budget for reasoning models.
- Each turn writes a trace.
- Optional sample-k for an invalid first call (off by default, evaluated in AG).
- State that there is one loop for all models, and no planner, critic or verifier model.

**§6.1 MCP**

- Tool results as `structuredContent` with an `outputSchema` (the result-card shape) plus the compact text.
- Elicitation for ambiguity where the client supports it; an ambiguity result otherwise.
- Resources: the glossary, `semantic-model.yaml`, verified examples.

**§6.2 Providers**

- Note that the installed Gemma 3 models have no tool capability in Ollama, so they run in structured mode.
- Detect `tools` from the local server's model info and default the mode accordingly.

**§7 Evaluation** — replace the bullets with D7:

- Paraphrase groups, the core subset at k = 3, the dev / held-out split.
- Categories: vagueness, leading questions, simulated-user multi-turn.
- Execution-first grading, AST validity, penalty scoring, a rubric judge for prose only.
- The proposed gates.
- Matrix families per D8, including a function-calling fine-tune and a Q4-vs-Q8 row.
- Examples kept out of the evaluation.

**§8 Screens**

- The card's chart is picked by the app from the result's shape (model hint optional).
- "Show query" shows the tool calls and the compiled query.
- A thumbs-up in Dev mode adds the turn to `ask_examples`.

**§9 Code layout** — add `classify.ts`, `examples.ts`, `trace.ts`, `checks/` (one file per check), `src/shared/stats/dimensions.ts`, `scripts/export-semantic-model.ts`, `scripts/ask-replay.ts`.

**§10 Testing**

- Resolver recall@k on the evaluation questions.
- Replay tests that re-grade recorded replies against the current engine.
- Tests for the answer checks (true and false flags).
- MCP `structuredContent` round trip.

**§11 Plans**

- **AF** adds: `DimensionDef` and synonyms, the classifier, traces and cache, split base / interval / noise in results, why-empty notes, the YAML export, `ask_examples` (schema only), the dev / held-out split.
- **AG** adds: pass^k, paraphrases, penalty scoring, simulated user, the matrix per D8, example library on / off, a sample-k trial.
- **Follow-up specs:** a fine-tuned local analyst (if AG misses the gate), a prompt optimiser, `sql` / `calc` tools (if the log shows the need), an `insights` tool.

**§12 Out of scope** — add: raw SQL and Python execution in v1; semantic answer caching; a critic or verifier model; model-written chart specs; learnt free-form memory.

**§13 Risks** — add:

- **Overfitting the brief to the evaluation:** mitigated by the held-out split.
- **Local models without tool support:** structured mode.
- **Leading questions and selective splits:** base-first results and checks.
- **Unstable numbers in fast-moving benchmarks:** decisions rest on our own evaluation, not on leaderboards.

**§14 Open points** — add: 5. Gates with pass^3 (D7 numbers). 6. Run probes P1–P4 now or fold them into AG.

---

## 7. Bibliography

Peer-reviewed venue given where known; arXiv id otherwise. Industry sources last.

**Text-to-SQL, agents, benchmarks**

- Lei et al. _Spider 2.0_ — ICLR 2025 — https://arxiv.org/abs/2411.07763
- Li et al. _BIRD: Can LLM Already Serve as a Database Interface?_ — NeurIPS 2023 D&B — https://arxiv.org/abs/2305.03111
- Huo et al. _BIRD-Interact_ — ICLR 2026 — https://arxiv.org/abs/2510.05318
- Pourreza & Rafiei. _DIN-SQL_ — NeurIPS 2023 — https://arxiv.org/abs/2304.11015
- Wang et al. _MAC-SQL_ — https://arxiv.org/abs/2312.11242
- Gao et al. _DAIL-SQL: Text-to-SQL Empowered by LLMs: A Benchmark Evaluation_ — VLDB 2024 — https://arxiv.org/abs/2308.15363
- Talaei et al. _CHESS_ — https://arxiv.org/abs/2405.16755
- Pourreza et al. _CHASE-SQL_ — ICLR 2025 — https://arxiv.org/abs/2410.01943
- Deng et al. _ReFoRCE_ — https://arxiv.org/abs/2502.00675
- Maamari et al. _The Death of Schema Linking?_ — https://arxiv.org/abs/2408.07702
- Cao et al. _RSL-SQL_ — https://arxiv.org/abs/2411.00073
- Li et al. _RESDSQL_ — AAAI 2023 — https://doi.org/10.1609/aaai.v37i11.26535
- Li et al. _CodeS_ — SIGMOD 2024 — https://doi.org/10.1145/3654930
- Liu et al. _A Survey of Text-to-SQL in the Era of LLMs_ — TKDE 2025 — https://arxiv.org/abs/2408.05109
- _DABstep_ — https://arxiv.org/abs/2506.23719 · _DA-Code_ — https://arxiv.org/abs/2410.07331 · _InfiAgent-DABench_ — https://arxiv.org/abs/2401.05507 · _DSBench_ — https://arxiv.org/abs/2409.07703 · _KramaBench_ — https://arxiv.org/abs/2506.06541 · _TableBench_ — AAAI 2025 — https://doi.org/10.1609/aaai.v39i24.34739 · _Data Interpreter_ — https://arxiv.org/abs/2402.18679
- _LLM/Agent-as-Data-Analyst: A Survey_ — https://arxiv.org/abs/2509.23988 · _A Survey of Data Agents_ — https://arxiv.org/abs/2510.23587

**Semantic layers**

- Sequeda, Allemang, Jacob. _Knowledge graphs and LLM accuracy on enterprise SQL_ — https://arxiv.org/abs/2311.07509 · follow-up https://arxiv.org/abs/2405.11706
- Rumiantsau & Fokeev. _Semantic Layers for Reliable LLM-Powered Data Analytics_ (2026) — https://arxiv.org/abs/2604.25149

**Retrieval and tools**

- _RAG-MCP_ — https://arxiv.org/abs/2505.03275
- Paramanayakam et al. _Less is More: Optimizing Function Calling for LLM Execution on Edge Devices_ — https://arxiv.org/abs/2411.15399
- Patil et al. _BFCL_ — ICML 2025 — https://proceedings.mlr.press/v267/patil25a.html

**Data systems for agents, caching, aggregation**

- Liu et al. _Supporting Our AI Overlords: Redesigning Data Systems to be Agent-First_ — https://arxiv.org/abs/2509.00997
- Zhang, Wornow, Olukotun. _Agentic Plan Caching_ — NeurIPS 2025 — https://arxiv.org/abs/2506.14852
- Schroeder et al. _vCache_ — ICLR 2026 — https://arxiv.org/abs/2502.03771 · _MeanCache_ — https://arxiv.org/abs/2403.02694
- Battiston, Kathuria, Boncz. _OpenIVM_ — SIGMOD 2024 demo — https://arxiv.org/abs/2404.16486
- Chaudhuri, Ding, Kandula. _Approximate Query Processing: No Silver Bullet_ — SIGMOD 2017 — https://www.microsoft.com/en-us/research/publication/approximate-query-processing-no-silver-bullet/
- Harinarayan, Rajaraman, Ullman. _Implementing Data Cubes Efficiently_ — SIGMOD 1996

**Statistics**

- _StatQA: Are Large Language Models Good Statisticians?_ — NeurIPS 2024 D&B — https://arxiv.org/abs/2406.07815
- _QRData_ — ACL Findings 2024 — https://arxiv.org/abs/2402.17644
- _BLADE_ — https://arxiv.org/abs/2408.09667 · _DiscoveryBench_ — https://arxiv.org/abs/2407.01725
- _The Agentic Garden of Forking Paths_ (2026) — https://arxiv.org/abs/2607.01507
- Huang et al. _POPPER_ — ICML 2025 — https://arxiv.org/abs/2502.09858

**Verification**

- Huang et al. _LLMs Cannot Self-Correct Reasoning Yet_ — ICLR 2024 — https://arxiv.org/abs/2310.01798
- Kamoi et al. _When Can LLMs Actually Correct Their Own Mistakes?_ — TACL 2024 — https://arxiv.org/abs/2406.01297
- Dhuliawala et al. _Chain-of-Verification_ — https://arxiv.org/abs/2309.11495
- Wang et al. _Self-Consistency_ — ICLR 2023 — https://arxiv.org/abs/2203.11171

**Evaluation**

- Yao et al. _τ-bench_ — https://arxiv.org/abs/2406.12045
- Chang et al. _Dr.Spider_ — ICLR 2023 — https://arxiv.org/abs/2301.08881
- Lee et al. _TrustSQL_ — https://arxiv.org/abs/2403.15879
- Bhaskar et al. _AmbiQT_ — EMNLP 2023 — https://doi.org/10.18653/v1/2023.emnlp-main.436
- Saparina & Lapata. _AMBROSIA_ — NeurIPS 2024 D&B — https://doi.org/10.52202/079017-2876
- Kim et al. _FLEX_ — https://arxiv.org/abs/2409.19014
- Zheng et al. _Judging LLM-as-a-Judge with MT-Bench_ — NeurIPS 2023 D&B — https://arxiv.org/abs/2306.05685

**Small models**

- Tam et al. _Let Me Speak Freely?_ — EMNLP 2024 Industry — https://arxiv.org/abs/2408.02442 · dottxt response — https://blog.dottxt.ai/say-what-you-mean.html
- _JSONSchemaBench_ — https://arxiv.org/abs/2501.10868
- Erdogan et al. _TinyAgent_ — https://arxiv.org/abs/2409.00608 · _Octopus v2_ — https://arxiv.org/abs/2404.01744
- _ToolACE_ — https://arxiv.org/abs/2409.00920 · _APIGen / xLAM_ — https://arxiv.org/abs/2406.18518
- _OmniSQL_ — VLDB 2025 — https://arxiv.org/abs/2503.02240 · _Arctic-Text2SQL-R1_ — https://arxiv.org/abs/2505.20315 · _SQL-R1_ — NeurIPS 2025 — https://arxiv.org/abs/2504.08600 · _XiYan-SQL_ — https://arxiv.org/abs/2411.08599
- Kurtic et al. _"Give Me BF16 or Give Me Death"?_ — ACL 2025 — https://arxiv.org/abs/2411.02355

**Flexibility and newer ideas**

- Khattab et al. _DSPy_ — https://arxiv.org/abs/2310.03714 · Opsahl-Ong et al. _MIPROv2_ — https://arxiv.org/abs/2406.11695 · Yuksekgonul et al. _TextGrad_ — https://arxiv.org/abs/2406.07496 · Agrawal et al. _GEPA_ — https://arxiv.org/abs/2507.19457
- Biswal et al. _Text2SQL is Not Enough: TAG_ — CIDR 2025 — https://arxiv.org/abs/2408.14717 · Patel et al. _LOTUS / Semantic Operators_ — https://arxiv.org/abs/2407.11418 · Liu et al. _Palimpzest_ — https://arxiv.org/abs/2405.14696
- Dibia. _LIDA_ — https://arxiv.org/abs/2303.02927 · Tian et al. _ChartGPT_ — TVCG 2024 — https://doi.org/10.1109/tvcg.2024.3368621 · Chen et al. _VisEval_ — TVCG 2024 — https://doi.org/10.1109/tvcg.2024.3456320 · Wang et al. _Data Formulator 2_ — https://arxiv.org/abs/2408.16119 · Luo et al. _nvBench_ — SIGMOD 2021
- Sahu et al. _InsightBench_ — https://arxiv.org/abs/2407.06423 · Ding et al. _QuickInsights_ — SIGMOD 2019
- Wang et al. _Agent Workflow Memory_ — https://arxiv.org/abs/2409.07429

**Industry and standards**

- dbt Labs. _Semantic Layer vs. Text-to-SQL: 2026 benchmark update_ — https://docs.getdbt.com/blog/semantic-layer-vs-text-to-sql-2026 · benchmark repo https://github.com/dbt-labs/semantic-layer-llm-benchmarking
- Snowflake. _Cortex Analyst: Behind the Scenes_ — https://www.snowflake.com/en/blog/engineering/snowflake-cortex-analyst-behind-the-scenes/ · semantic model spec — https://docs.snowflake.com/en/user-guide/snowflake-cortex/cortex-analyst/semantic-model-spec · verified query repository — https://docs.snowflake.com/en/user-guide/views-semantic/verified-query-repository
- Databricks. _Genie concepts_ — https://docs.databricks.com/aws/en/genie/concepts
- Open Semantic Interchange — https://www.getdbt.com/blog/the-osi-spec-updates
- Anthropic. _Writing effective tools for agents_ — https://www.anthropic.com/engineering/writing-tools-for-agents · _Code execution with MCP_ — https://www.anthropic.com/engineering/code-execution-with-mcp
- Model Context Protocol changelog (2025-11-25) — https://modelcontextprotocol.io/specification/2025-11-25/changelog

---

## Appendix A — Probes proposed (run 2026-11-01/02; results in Appendix B)

Each is ≤ 2 hours and uses what is installed. Together they fit the plan's half-day.

| Probe                                          | Question it settles                                                           | Setup                                                                                                                                                                                             | Output                                        |
| ---------------------------------------------- | ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| **P1** Metric linking: lexical vs `bge-m3`     | D3: is embedding retrieval worth its dependency; what k gives ≥ 95 % recall   | 40 phrasings of 25 metrics (synonyms, slang, abbreviations) written by hand; rank all 310 catalogue entries by a lexical score and by `bge-m3` cosine (Ollama `/api/embed`), plus the merged rank | recall@1/3/5/10 per method                    |
| **P2** Structured mode on `gemma3:4b` / `12b`  | D8: can the installed models produce valid calls; does a `thought` field help | 20 questions; Ollama `format` with the compact `leaderboard` / `player_stats` schemas, with and without `thought` first, and unconstrained JSON                                                   | valid-call rate, right-call rate, p50 latency |
| **P3** Native tools on a tool-capable model    | D8: native vs structured on the same model                                    | `ollama pull qwen3:4b` (~2.5 GB download), the same 20 questions in both modes                                                                                                                    | as P2                                         |
| **P4** Engine DSL vs raw SQL with `gemma3:12b` | D1 on a small model, on our own schema                                        | 15 questions; (a) `StatsQuery` JSON via `format`, (b) DuckDB SQL from the schema DDL; both executed read-only against a copy of `stats.duckdb`                                                    | right-result rate and kinds of failure        |

The commands and raw numbers are in Appendix B.

---

## Appendix B — Probe results (run 2026-11-01/02)

**Setup.** This laptop (RTX 4060 Laptop 8 GB, WSL2), Ollama 0.16.2, models at Q4_K_M: `gemma3:4b`, `gemma3:12b` (does not fit 8 GB, partly on the CPU), `qwen3:4b` (pulled for P3). A copy of the dev warehouse (2019 → 2026 week 7), opened read-only or as a copy; the app's own file was never touched. Temperature 0, seed 1, one run per question (no pass^k). P2 / P3: `num_ctx` 8192, output cap 512 tokens (2048 for qwen3:4b). P4: `num_ctx` 16384, cap 700. The harness, question sets, raw replies and results are in `docs/research/ask-probes/`.

**Caveats.**

- The sets are small: 40 phrasings in P1, 20 questions in P2 / P3, 15 in P4.
- The v3 rules and one classifier rule were written after reading misses on the same questions, so their numbers are optimistic. AG must confirm them on a held-out set.
- Grading is strict. Defensible variants count as wrong, e.g. `rz_carries` plus a red-zone filter, or `adj_off_epa` for "offensive EPA per play".
- Gemma 3 is an old family; only qwen3:4b is recent. The design findings are about the environment and should be re-checked on current models (R35).

### P1 — Metric linking: lexical vs embeddings

40 questions naming 34 metrics (slang, abbreviations, paraphrases), ranked over all 326 catalogue entries. Metric aliases do not exist yet, so this is the baseline before §4.2.

| Method                                              | R@1  | R@3  | R@5  | R@10 | MRR  |
| --------------------------------------------------- | ---- | ---- | ---- | ---- | ---- |
| Lexical (BM25 over label, short, id, description)   | 0.50 | 0.72 | 0.85 | 0.88 | 0.65 |
| `bge-m3` cosine                                     | 0.50 | 0.68 | 0.70 | 0.75 | 0.60 |
| `nomic-embed-text` cosine                           | 0.40 | 0.57 | 0.70 | 0.78 | 0.52 |
| Lexical + `bge-m3` (reciprocal-rank fusion)         | 0.62 | 0.72 | 0.75 | 0.88 | 0.70 |
| Lexical + position filter                           | 0.62 | 0.85 | 0.88 | 0.88 | 0.74 |
| Fusion + position filter                            | 0.70 | 0.80 | 0.88 | 0.95 | 0.78 |
| **Lexical top 3 + `bge-m3` top 2, position filter** | 0.62 | 0.85 | 0.93 | 0.95 | 0.74 |

- **Embeddings alone miss our abbreviations:** YPRR, TPRR, aDOT and PPG all ranked outside the top 10 with `bge-m3`.
- **Lexical misses are paraphrases:** "gets rid of the ball fastest" (time to throw), "most accurate relative to expectation" (CPOE), "long-distance kicker" (FG % 50+). Aliases fix exactly these.
- **The position / entity filter needs care.** A naive version broke "his team's targets" (read as a team question) and "pressure on the quarterback" (read as a QB question). Two rule fixes repaired both, and the table shows the fixed version.
- **`bge-m3` in Ollama 0.16.2** returned NaN for 12 of 326 catalogue entries (e.g. "Man coverage rate", "11 personnel rate"), even one at a time. Embedding all 326 took 23 s, then 14 ms per question; `nomic-embed-text` took 2 s and 5 ms but was weaker.

### P2 / P3 — Can a local model fill the compact tools?

20 questions: 8 leaderboards, 6 player lines or splits, 2 team lines, 2 compares, 2 definitions. Each had a resolved context block (player ids, team, time, top-5 metric candidates from the P1 winner), and a call counts as right when tool, metric, position, players, time, grouping and situation filters all match the reference. The resolver's candidates contained the right metric for 18 of 20 questions; the two misses were "yards per carry" and "run defense".

Modes:

- `json+thought` / `json`: one constrained JSON object holding every tool's arguments; the model picks the tool; with or without a free `thought` field first.
- `free json`: no constraint, the prompt asks for JSON.
- `classified`: the app picks the tool by rule; the schema is that tool's arguments minus the slots the resolver filled.
- `classified v3`: as `classified`, but a slot appears only if the resolver detected words for it, with the detected options and a neutral default; filters are one bounded list.
- `json+thought slim v3`: the v3 slots, but the model picks the tool.
- `native` / `native think`: Ollama tool calling with the full tools, thinking off / on. This qwen3:4b build reasons in either case.
- `native v3`: Ollama tool calling with v3-shaped parameters.

| Model      | Mode                 | Valid | Right / 20 | p50 s | p90 s |
| ---------- | -------------------- | ----- | ---------- | ----- | ----- |
| gemma3:4b  | json+thought         | 19    | 4          | 2.1   | 3.0   |
| gemma3:4b  | json                 | 18    | 2          | 1.3   | 1.9   |
| gemma3:4b  | free json            | 4     | 3          | 1.9   | 2.8   |
| gemma3:4b  | classified           | 20    | 10         | 1.5   | 2.5   |
| gemma3:4b  | **classified v3**    | 20    | **15**     | 1.3   | 1.6   |
| gemma3:4b  | json+thought slim v3 | 8     | 6          | 1.4   | 1.6   |
| gemma3:12b | json+thought         | 20    | 8          | 8.6   | 11.3  |
| gemma3:12b | json                 | 19    | 6          | 4.5   | 6.5   |
| gemma3:12b | free json            | 3     | 3          | 7.7   | 9.7   |
| gemma3:12b | classified           | 20    | 10         | 6.7   | 8.1   |
| gemma3:12b | **classified v3**    | 20    | **17**     | 5.2   | 6.1   |
| gemma3:12b | json+thought slim v3 | 18    | 9          | 6.2   | 8.2   |
| qwen3:4b   | native               | 18    | 16         | 18.7  | 26.1  |
| qwen3:4b   | native think         | 18    | 16         | 17.9  | 27.1  |
| qwen3:4b   | json+thought         | 19    | 9          | 4.0   | 5.1   |
| qwen3:4b   | **classified v3**    | 19    | **15**     | 2.5   | 3.7   |
| qwen3:4b   | native v3            | 16    | 6          | 13.7  | 30.8  |

What the misses showed, in the order the fixes were found:

1. **Models pick the wrong tool** when one schema holds all tools: player questions went to `leaderboard`. A rule over the resolver's output picked the right tool for 20/20 questions, after one fix ("what is …" counts as a definition only when no player is named). Letting the model choose from the slim v3 schema stayed at 6–9 / 20.
2. **Constrained small models fill every listed field.** They wrote seasons as `[2019 … 2026]`, invented week ranges, and chose `coverage: "zone"` when no option meant "none". Removing resolved slots and adding neutral values fixed most of this (`classified` → `classified v3`: 10 → 15–17).
3. **Enum arrays loop:** `["pressure", "pressure", …]` until the output cap. `maxItems` fixed it; the first stuck run is how it was found.
4. **Free JSON breaks types:** seasons came back as `"2019-2026"` and weeks as `"7"`; only 3–4 of 20 calls were valid.
5. **qwen3:4b reasons before every call.** That costs 18 s per call, and with a 512-token cap it never reached the call at all (1/20). With 2048 it got 16/20, but 2 of 20 still ran out of budget mid-thought. In structured mode its `thought` once ran past the cap, so `thought` needs `maxLength`.
6. **Escape hatch:** when the right metric was not offered, qwen3:4b chose `other` (gemma picked a plausible wrong id). This supports re-resolving on `other`.

### P4 — The engine's DSL vs raw SQL, graded by execution

15 questions: 10 rankings and 5 single-player lookups. Both paths got the same context. The DSL path wrote a `StatsQuery` constrained by the app's own JSON Schema and ran on the real engine. The SQL path got the table definitions (≈ 720 columns), conventions, the candidate metrics' formulas and `minSample`, and one example, and ran read-only with the engine's 5 s limit. A ranking is right when the reference top 3 are in the answer's top 5; a lookup is right when the value is within 1 %. Failed queries got one retry with the error message.

| Model      | Path                         | Ran first time | Right (after retry) / 15 | Rankings / 10 | Lookups / 5 | p50 s |
| ---------- | ---------------------------- | -------------- | ------------------------ | ------------- | ----------- | ----- |
| gemma3:12b | DSL, schema as shipped       | 0              | 0                        | 0             | 0           | 16.9  |
| gemma3:12b | DSL, numeric bounds as enums | 15             | 9                        | **9**         | 0           | 8.8   |
| gemma3:12b | Raw SQL                      | 10             | 10                       | 5             | 5           | 28.5  |
| qwen3:4b   | DSL, schema as shipped       | 0              | 0                        | 0             | 0           | 2.3   |
| qwen3:4b   | DSL, numeric bounds as enums | 15             | 9                        | **8**         | 1           | 1.0   |
| qwen3:4b   | Raw SQL                      | 5              | 4                        | 1             | 3           | 16.8  |

- **The schema as shipped fails under constrained decoding.** `querySchema.ts` gives seasons as `integer, minimum: 2019`, and both models produced 2600, 2206, 2126 and 2105, which pass the bound but are not what they meant. Writing the bound as an enum fixed it (R33). Claude through MCP is not grammar-constrained and is unaffected.
- **SQL's ranking misses were confident.** Examples: "top WRs by YPRR" returned David Moore (6.75) and Jeshaun Jones (6.40) with no qualification; "best CPOE 2025" returned Nick Mullens (+29.0). Others were joins of team tables to the players table that returned player names as teams. All of these ran without error, so the number check would pass them.
- **The DSL's lookup misses** came from the model leaving out `scope.players` and ranking everyone; the compact `player_stats` takes the player from the resolver, so this does not arise there.
- **Prompt cost:** the SQL prompt was about 4–5k tokens against about 1k for the DSL, which is most of the extra latency.

### How to re-run

```bash
bash docs/research/ask-probes/run.sh
```

It copies the dev warehouse to a work folder (`WORK`, a new temporary folder by default), builds the engine runners with esbuild, exports the catalogue, and runs P1, P2 (gemma3:4b and 12b), P3 (qwen3:4b) and P4, then prints the tables above. To try another model later, keep the work folder and run one mode set against it, for example:

```bash
WORK=~/ask-probes bash docs/research/ask-probes/run.sh
```

```bash
ollama pull qwen3:8b && python3 -I ~/ask-probes/scripts/p23.py qwen3:8b "native,classified v3" ~/ask-probes/results/p23.jsonl && python3 -I ~/ask-probes/scripts/summarise.py
```
