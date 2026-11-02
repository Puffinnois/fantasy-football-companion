# Ask — a personal data analyst — design

**Date:** 2026-11-01, revised 2026-11-02 from the research · **Status:** draft, under review · **Plans:** AF1 (analyst tools, resolver, semantic model), AF2 (MCP server + bridge), AG (agent loop, providers, evaluation), AH (Ask screen + Ctrl+K)

**Sources:**

- The stats-analysis spec (`2026-10-15-stats-analysis-design.md`): the query engine (§7) and the NLQ groundwork (§10).
- The code that exists today: `StatsQuery` and its JSON Schema (`src/shared/stats/querySchema.ts`), the metric catalogue (326 metrics, `src/shared/stats/catalogue.ts`), and the outlook, games, player and ownership endpoints.
- The research report `docs/research/2026-11-01-ask-analyst-state-of-the-art.md`. Its decisions D1–D12, recommendations R1–R35 and the probes run on this laptop (its Appendix B) are cited below as "report Dn / Rn / P1–P4".

**Goal.** You ask a football question in plain words, such as "who leads WRs in yards per route run since week 5?", "how does Bijan do against man coverage?" or "best free-agent TE by target share". You get a written answer backed by the engine's real rows, shown as a table or chart that opens in the app. You can follow up ("only in the red zone", "now 2024"). This is a **personal data analyst**: it reads data and explains it. A **fantasy adviser** (start/sit, trade ideas) is a later spec, built once this is in place.

**Constraint.** The data stays free and keyless (stats-analysis spec). The language model is **your choice**, and every kind is supported: your Claude subscription through MCP, a paid or free API, or a local model on the PC. Nothing is sent anywhere until you set one up.

## 1. Decisions

| Topic                    | Decision                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Model                    | **Every option.** (1) An MCP server, so Claude desktop or Claude Code asks with your subscription (the user's own choice, built first). (2) An API: Anthropic, or any OpenAI-compatible service, paid or free tier. (3) A local model through Ollama or LM Studio.                                                                                                                      |
| Weak models              | The environment does the hard parts, so a small local model only fills a few slots. Names, teams, metrics, dates and the question type are resolved in code before the model is called (§4). The tool is picked by code, and the schema shows only the slots still open (§3.2). Errors tell the model how to fix the call.                                                              |
| Local models             | Tested thoroughly on this machine (§7): i7-13620H, 32 GB RAM, RTX 4060 Laptop with 8 GB VRAM. Ollama (WSL) and LM Studio (Windows) are already installed. The results decide which local models the app recommends.                                                                                                                                                                     |
| Shape                    | A chat with follow-ups. Each answer is text plus result cards (table or chart) rendered from the engine's rows, never from the model's text.                                                                                                                                                                                                                                            |
| Placement                | Both: a **Stats › Ask** tab with threads, and **Ctrl+K** anywhere in the app, which opens Ask with the question and what is on screen.                                                                                                                                                                                                                                                  |
| Reach                    | The stats engine (leaderboards, splits, game logs, trends, compare, outlook, games, forecasts) and your league's data, read only (rosters, who rosters whom, free agents, league scoring). No advice.                                                                                                                                                                                   |
| Research (2026-11-01/02) | **Structured engine only:** the model never writes SQL or code (report D1, P4). Dimensions become first-class with synonyms (D2). One loop; the planning and checking around it are deterministic code, not extra model calls (D11, D6). Statistics are computed in results (D5). The evaluation uses pass^k, paraphrases, penalty scoring, a simulated user and a held-out split (D7). |

## 2. Architecture

```
            Claude desktop / Claude Code                   Ask screen, Ctrl+K (renderer)
                      │ MCP (stdio bridge → HTTP)                    │ IPC
                      ▼                                              ▼
main ── MCP server (127.0.0.1) ──┐                    agent loop (§5) ── provider adapter (§6)
                                 ▼                                   │        ├ Anthropic
                       analyst tools (§3) ◄──────────────────────────┘        ├ OpenAI-compatible (cloud, free tiers)
                         │ resolver + classifier (§4.1) · brief (§4.4)         └ local server (Ollama, LM Studio)
                         │ answer checks (§4.3) · traces (§5.3)
                         ▼
             stats worker: query engine (+ result cache), outlook, games ── stats.duckdb
             companion.db: league, rosters, rules, threads, examples, provider settings
```

- **One tool layer** (`src/main/analyst/`) serves both paths: MCP hands it to Claude, and the in-app agent loop hands it to whichever model is set up.
- **Engine changes are few.** The tools call the existing engine. What changes in it:
  - Metric aliases and dimension definitions (§4.2).
  - Splits that carry their base, an interval and a noise flag, and results that explain why they are empty (§3.3).
  - An exact result cache and query timings (§5.3).
  - Seasons in `querySchema.ts` given as an enum (§3.2).
- **Read only.** No tool writes data. The one tool with a side effect, `open_in_app`, only navigates the app.
- **The model never sees the database and never writes SQL or code.** It calls tools; the engine validates, compiles parameterised SQL, and caps rows and time, as today (§7.2 of the stats spec). Coverage gaps (questions the tools can't express) are logged and fixed by adding metrics, dimensions or derived tables (report R1).

## 3. Analyst tools

### 3.1 The tools

Few tools, each the shape of a question, with flat arguments. Defaults are filled by the app: current season, regular season, qualified only, and league scoring when a league exists.

| Tool           | Answers                                                     | Main arguments (all optional except the first)                                                                                         |
| -------------- | ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `find`         | "who / which metric is …": ids for names, teams and metrics | `text`, `kind` (player, team, metric)                                                                                                  |
| `leaderboard`  | rankings                                                    | `metric` (+ `also` up to 5), `entity`, `position`, `seasons`, `weeks`, `team`, `rostered` (mine, free, any), situation fields, `limit` |
| `player_stats` | a player's line, game log or splits                         | `player`, `metrics`, `seasons`, `weeks`, `by` (week, season, opponent, down, quarter, coverage, personnel …), situation fields         |
| `team_stats`   | a team's line, by week or split                             | `team`, `side` (offense, defense), `metrics`, `seasons`, `by`, situation fields                                                        |
| `compare`      | 2–4 players or teams side by side                           | `ids`, `metrics`, `seasons`                                                                                                            |
| `trend`        | a metric across seasons                                     | `id`, `metric`, `from`, `to`                                                                                                           |
| `outlook`      | a player's forecast signals (ceiling, floor, regression)    | `player`                                                                                                                               |
| `games`        | schedule, results, Elo vs Vegas, box score, preview         | `season`, `week`, `team`                                                                                                               |
| `league`       | rosters, ownership, free agents, league scoring             | `what` (my_roster, roster, owner_of, scoring), `team`, `player`                                                                        |
| `describe`     | what a metric means, its sample, coverage and stability     | `metric`                                                                                                                               |
| `query`        | anything `StatsQuery` can express                           | a full `StatsQuery` (the existing schema)                                                                                              |
| `open_in_app`  | "show me": opens a dashboard, Explore chart or Compare      | `target`, `ids`, `metrics`                                                                                                             |

- **Situation fields** are the common play-grain filters, flat: `down`, `red_zone`, `third_down`, `pressure`, `blitz`, `play_action`, `coverage` (man, zone), `neutral`, `two_minute`, `personnel`, `with_player`, `without_player`. The rest stays in `query`.
- **Result-producing tools** take an optional `chart` hint (`table`, `bar`, `line`, `scatter`); the app has the last word (§8).

### 3.2 Two profiles

- **Full** (MCP and strong models): every tool, with the schemas above. The resolver's context block (§4.1) is a hint, never a restriction.
- **Compact** (small local models): `leaderboard`, `player_stats`, `team_stats`, `compare`, `games`, `league`, `describe`. Built from the rules the probes measured (report D8, P2/P3, R31–R33):
  1. **The classifier picks the tool** (§4.1). The model fills only that tool's arguments: `{thought, args}`.
  2. **No slot the resolver fills** (seasons, weeks, player, team, ids) **and none the metric fixes** (entity, side). The app applies them from the context block.
  3. **A slot appears only when the resolver detected words for it** ("red zone", "game log", "WRs"), with only the detected options. Situation flags become one `filters` list.
  4. **Every optional enum starts with a neutral value** (`any`, `none`). Under constrained decoding small models write out every listed field, so an enum without a neutral value gets a wrong value.
  5. **Metric enums are the resolver's top 5 candidates plus `other`.** `other` makes the loop re-resolve with the top 10 and ask once more.
  6. **Every array has `maxItems` and `thought` has `maxLength`.** Without them, small models repeat an item until they run out of tokens.
  7. **Numeric bounds are enums**, never `minimum` / `maximum`. With the shipped `querySchema.ts`, grammar-constrained decoding produced seasons like 2600 and 2126. `querySchema.ts` is fixed in AF1: seasons become an enum of the warehouse's seasons, weeks an enum of 1–22.
- **Which profile and calling mode a model gets** (§5.2) is a setting, defaulted per provider and model from the evaluation (§7).
- **Measured on this laptop (report P2/P3), 20 questions:** with these rules, gemma3:4b got 15/20 right (1.3 s per call), gemma3:12b 17/20 (5.2 s) and qwen3:4b 15/20 (2.5 s). Letting the model pick the tool from one schema covering all tools gave 2–9/20.

### 3.3 What the tools return

- **Names with ids:** "Bijan Robinson (ATL) · 00-0038542", never an id alone.
- **Compact for the model:** at most 15 rows × 6 columns, rounded to the catalogue's decimals, with rank, percentile, sample, qualification and the engine's `notes`. A `detail: concise | full` switch (default concise) lets a strong model ask for more. The screen always gets the full result.
- **Splits carry their base** (report D5): any `by` split returns the overall row first. Each split row carries its difference from the base, an interval and a `withinNoise` flag. The interval comes from the metric's sample and its measured split-half reliability. Rates under the qualified sample also show the empirical-Bayes shrunk value beside the raw one.
- **Stability travels with the metric:** year-to-year r and the half-signal sample, in `describe` and on results.
- **A split counter:** when a turn has looked at many splits, results say so ("1 of 9 splits examined").
- **Empty or thin results explain themselves:** why ("no qualified TE: 3 have ≥ 30 targets") and what to change ("lower `minSample`?", "the metric starts in 2022").
- **Errors teach.** An invalid call returns why and how to fix it, never a stack trace. Errors re-run the resolver on the failing argument and list the nearest valid ids ("`yprr` needs a WR, TE or RB position; did you mean `position: WR`?", "`Bijan` matched 1 player: 00-0038542 Bijan Robinson"). At most 3 retries per question.

## 4. Making the job easy for any model

### 4.1 The resolver and classifier (no model involved)

Before the model is called, deterministic code reads the question and attaches a **context block**:

- **Players:** fuzzy match on names in the identity table, with common short forms ("CMC", "ARSB", "Bijan"); position and team break ties. Ambiguity is listed, not guessed.
- **Teams:** codes, cities, nicknames ("Niners", "Bolts", "the Rams" → LA).
- **Metrics** (report D3, P1):
  - Lexical matching over aliases, label, short name and description.
  - An entity / position filter from the words. It needs care: "his team's targets" is not a team question, and "pressure on the quarterback" is a defensive one.
  - `bge-m3` embeddings are an optional add-on that fills the last two of five slots when a local embedding server is found.
  - Target: the right metric in the top 5 for ≥ 95 % of evaluation questions. P1 measured 0.93 before any aliases existed: word matching alone 0.85, embeddings alone 0.70.
  - Embeddings miss our abbreviations (YPRR, aDOT, PPG), and `bge-m3` in Ollama 0.16.2 returned NaN for 12 of 326 entries, so it stays optional.
- **Time:** "this year", "last season", "since week 5", "last 4 games", "2022–24" → seasons, weeks, `lastNGames`. "Now" = the warehouse's latest week (`StatsStatus.through`).
- **Slots detected in the words:** situation phrases ("red zone", "under pressure", "vs man"), groupings ("game log", "by week", "by opponent") and position words. They decide which slots the compact schema shows (§3.2).
- **Question type** (report R7): lookup, leaderboard, split, compare, trend, games, league, definition, advice, out of range.
  - It picks the compact tool. One player → `player_stats`; two or more → `compare`; one team and no player → `team_stats`; "what is / what does … mean" with no player → `describe`; schedule words → `games`; roster words → `league`; otherwise `leaderboard`. This rule was right on 20/20 probe questions, while the models picking for themselves were wrong on a third to half.
  - It also declines advice and pre-2019 questions before any model is called.
- **Ambiguity → a question back.** "Which Mike Williams?" is asked before the model runs. Over MCP it is asked by elicitation where the client supports it.
- **Screen context** (Ctrl+K): the product, screen, player or team and scope on screen, reusing the dev-notes context parts, so "this player" and "here" resolve.
- **Thread state:** the last query of the thread, so "now 2024" changes one field.

A strong model may ignore the block; a small one copies ids from it.

### 4.2 Semantic model: metrics, dimensions, aliases and the glossary

- **`MetricDef.aliases`:** the words people use ("yards per route", "YPRR", "aDOT", "air yards per target", "pressure rate allowed", "gets rid of the ball fast"). Written for every core and extended metric.
- **`DimensionDef`** (new, `src/shared/stats/dimensions.ts`), for every situation field and `by` value: id, label, description, synonyms, allowed values (each with label and synonyms, e.g. coverage: man / zone; personnel: 11 → "three-wide"), grain (play, week, season), first season and sources, and the entities and positions it applies to (report D2).
- **The glossary:** pressure, neutral, route, red zone, personnel, coverage, est., qualified, and each source's season coverage. It is built from the metric and dimension definitions and serves the analyst brief, `describe` and dev note N-007 (stat explanations in the app). Written definitions moved accuracy about 20 points in the literature, more than model size did (report §1, finding 2).
- **Tests:** no alias or synonym points at two ids; every metric and dimension has a description and at least one synonym; resolver recall on the evaluation questions (§10).
- **Export:** `scripts/export-semantic-model.ts` writes `semantic-model.yaml` in an OSI-like shape (datasets, metrics, dimensions). It is exposed as an MCP resource and regenerated in CI. TypeScript stays the source of truth (report R4).

### 4.3 Answers that can be checked

After an answer, code checks it against the results of that turn. No second model pass: a model reviewing itself does not improve answers and can make them worse, while checks against the data are reliable (report D6).

1. **Every number comes from a tool result** (after rounding); an unmatched number is underlined and marked "not from the data".
2. **A rate from an unqualified row states its sample** ("on 61 routes").
3. **A split is reported with its base** (the overall line first).
4. **Causal words** ("because", "due to") with no comparison behind them are flagged softly (underlined, not blocked).

Answers state the caveats the result carries ("2026 routes are estimated"). When a question can't be answered, the model says so and why (no data before 2019, a metric we don't have, advice).

### 4.4 The analyst brief

One system text, shared by MCP (the server's `instructions` and an `analyst` prompt) and the agent loop. It covers:

- who the analyst is, the data's range and the current week;
- the conventions: seasons 2019 →, nflverse team codes, REG by default;
- the glossary and the rules of §4.3;
- "no advice yet";
- the statistical rules: the overall line before any split; no causal claim without a comparison; state the sample when a row is not qualified; use "within noise" when results say so; describe low-stability metrics as such (report D5).

A short variant serves the compact profile. Briefs and tool descriptions are versioned files per profile, and their hash goes into every trace (§5.3).

## 5. The agent loop (in-app)

### 5.1 A turn

1. Resolver and classifier (§4.1). Ambiguity → ask; advice or out of range → decline. No model is called in either case.
2. The model gets the brief, the thread, the context block and the tools of its profile.
3. Tool calls run, in parallel when independent; `other` re-resolves once with the top 10.
4. The model writes the answer.
5. The checks run (§4.3).
6. The message and its result cards go to the renderer, streamed.

- **One loop for every model** (report D11). The planner (classifier) and the verifier (validation, errors, checks) are code. There is no planner, critic or verifier model: on 8 GB each extra model call costs seconds and the literature shows no gain from it.
- **Limits:**
  - 8 tool calls and 3 failed calls per turn.
  - An output cap per model call and a token cap per turn.
  - A thinking budget for reasoning models (setting; report R34).
  - A 90 s turn timeout, and Stop in the UI.
- **Sample-k seam:** for an invalid first call on a fast cloud model, re-sample instead of re-prompting. Off by default; evaluated in AG.

### 5.2 Calling modes

- **Native tool calling** when the model supports it. The app reads the `tools` capability from the local server's model info. The installed `gemma3:4b` / `12b` have none.
- **Structured mode** otherwise, or when the evaluation says it is better: one constrained JSON object (Ollama `format`, LM Studio / OpenAI `response_format: json_schema`) following §3.2. The compact profile uses `{thought, args}` for the classifier's tool; the full profile uses `{thought, tool, args}`. In both, `thought` comes first and is capped. The answer is written in a second call.
- **Measured (report P3):** qwen3:4b with native tools got 16/20, but it reasons before every call (18 s median, 26 s slowest 10 %). The same model in structured compact mode got 15/20 at 2.5 s. The evaluation picks the mode per model; both stay available.

### 5.3 Threads, traces and cache

- **Threads** in `companion.db`: `ask_threads`, and `ask_messages` (role, text, tool calls, results, model, tokens, ms). Kept until deleted.
- **A trace per turn** (`trace.ts`): brief hash, model, profile, mode, resolver output, each tool call (arguments, compiled-query hash, ms, rows, cache hit, error), tokens, check results. Threads keep a summary. In Dev mode the full trace is appended to `<userData>/ask/log.jsonl`. That log is the corpus of real questions (stats spec §10), which feeds the evaluation set and the example library.
- **Exact result cache** in the stats worker: LRU, keyed on the compiled SQL and parameters, cleared when `StatsStatus.through` changes. Follow-ups and evaluation re-runs are the expected hits. No semantic (similar-question) answer cache: a false hit returns a confident wrong number (report D4).
- **No new aggregation machinery.** No sketches, approximate answers or incremental views: the data is 300 MB and the model dominates latency. A play-grain cube for the most-asked situational shapes is added only if traces show one recurring above its 1 s budget (report R16).
- **`ask_examples`** (schema in AF1, used from AG; report D9): verified question → tool-call pairs. Fields: question, masked question (`{player}`, `{metric}`, `{week}`), slots, call, result hash, source (`user` thumbs-up in Dev mode, or `seed`), verified date.
  - Retrieved by masked-question similarity; the top 3 go to the compact prompt, and MCP clients get them as a resource.
  - Evaluation questions never enter it.
  - Whether examples help small models is measured in AG.

## 6. Providers and MCP

### 6.1 MCP server (Plan AF2, the user's own path)

- **In the app**, because only one process can hold `stats.duckdb`: a Streamable HTTP MCP server on `127.0.0.1`, random port, bearer token, Origin checked; **off by default**, turned on in Settings › Ask.
- **Claude desktop** speaks stdio, so a **bridge** forwards stdio ↔ HTTP. The bridge is the app's own exe run as Node (`ELECTRON_RUN_AS_NODE` + a bundled `mcp-bridge.js`), reading the port and token from a file in `userData`. If the app is not running, the bridge starts it minimised and waits up to 30 s. This is gated first on the packaged Windows build, like DuckDB was.
- **Claude Code** connects to the HTTP endpoint directly.
- **Settings › Ask** shows **Add to Claude desktop** (edits `%APPDATA%\Claude\claude_desktop_config.json` after you confirm, with a backup) and **Copy Claude Code command**.
- **What the server exposes:**
  - The full tool profile.
  - Results as `structuredContent` with an `outputSchema` (the result-card shape), plus the compact text for clients that ignore structured output.
  - Elicitation for ambiguity where the client supports it.
  - The brief as `instructions` and an `analyst` prompt.
  - Resources: the glossary, `semantic-model.yaml` and the verified examples.

  Answers appear in Claude; `open_in_app` shows them in the app.

### 6.2 APIs and local servers (Plan AG)

| Provider          | How                                                                                                                                                                                                                                         |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Anthropic         | Messages API with native tools; your key.                                                                                                                                                                                                   |
| OpenAI-compatible | Base URL + key + model. Presets: OpenAI, Google Gemini (free tier), Groq (free tier), OpenRouter (free models), Mistral; "Custom" for anything else.                                                                                        |
| Local server      | Ollama (`localhost:11434`) or LM Studio (`localhost:1234`) through their OpenAI-compatible endpoints. The app detects a running server, lists its models and reads each model's capabilities (tools, thinking) to default the calling mode. |

- Keys are encrypted with Electron `safeStorage` (Windows DPAPI) in `companion.db`; never logged, never sent to another provider.
- Settings › Ask states what leaves the PC for each provider: the question, the tool results (stats rows, league team and player names). Local: nothing.
- Each answer shows the model and tokens used. No price table in the app (prices change); the provider's own dashboard is linked.
- A bundled model runtime (no Ollama needed) is **not** in this spec; the evaluation tells whether it would be worth its size.

## 7. Evaluation

The heart of the work for local models: a fixed test that every model, prompt or tool change is measured against (report D7).

- **Question set** (`tests/ask/questions/`):
  - About 150 base questions, each with a reference tool call and 2 paraphrases (synonyms, nicknames, typos, word order): ≈ 450 items.
  - Written from real phrasings, then grown from the Dev-mode log. The probe question sets (`docs/research/ask-probes/data/`) are the seed.
  - Split 2/3 **dev** (for tuning the brief, tool descriptions and candidate counts) and 1/3 **held-out** (for gates only).
- **Categories:**
  - lookup, leaderboard, situational split, compare, trend, games and forecasts, league data;
  - follow-ups and clarifications, run against a **simulated user** (a strong model given the hidden intent);
  - ambiguous (must ask), vague ("best", "lately", "good matchup"), leading ("isn't X declining?" → must give the base first), unanswerable or advice (must decline).
- **Frozen database:** a snapshot of `stats.duckdb` (and a league fixture) at a fixed week, so answers don't move.
- **Grading:**
  - _Primary, by execution:_ the reference rows are in the answer's top k and the metric values match after rounding, whatever the exact arguments.
  - _Secondary:_ call validity (BFCL-style structural match), retries, number-check pass, latency p50 / p90, tokens.
  - _Must-ask and must-decline categories:_ penalty scoring (+1 right, 0 decline or ask, −1 wrong answer), so declining beats guessing.
  - _Prose:_ a fixed rubric judged by a strong model (states the sample, gives the base before a split, no advice, no causal claim). Never used for numbers; the judge also triages failures.
- **Consistency:** pass^1 and pass^3 per category (the same question right in 3 of 3 runs). A 60-question core subset runs k = 3 times for local models; the full set runs once.
- **Runner:** `npm run eval:ask -- --provider <p> --model <m> [--profile compact] [--mode structured]`. It writes a report in `docs/research/ask-eval-<date>-<model>.md` plus JSON with the same fields. Every report records model, profile, mode, brief hash and engine version. The runner is not part of `npm test`; the unit suite uses recorded model replies (§10).
- **Model matrix** (Plan AG), shortlisted from the function-calling leaderboard (BFCL) at plan time, not from this spec:
  - Claude: strong and fast tiers, through the API.
  - One free cloud tier.
  - **Current local models, light** (fit in 8 GB at 4-bit) **and larger** (12–30B, or small mixture-of-experts models offloaded to the 32 GB of RAM), in native and structured mode, compact and full profile.
  - At least one function-calling fine-tune.
  - One Q4-vs-Q8 row of the same light model.
  - `gemma3:4b` / `12b` and `qwen3:4b` from the probes as the baseline.
  - MCP is spot-checked by hand in Claude desktop.
- **Gates** (to confirm):
  - The strong Claude tier: ≥ 90 % pass^1 and ≥ 85 % pass^3 on the held-out set.
  - The recommended local model: ≥ 70 % pass^1 and ≥ 60 % pass^3 on lookup, leaderboard, compare and follow-ups, p50 ≤ 15 s on this laptop, and a penalty score ≥ 0 on the must-ask / must-decline categories.
  - If no local model reaches its gate, the app still offers local models, marked as experimental.

  The probes put old 4–12B models at 75–85 % on single-turn questions with the compact rules, so the local gate looks reachable.

## 8. Screens (Plan AH, mocked in Claude Design first)

- **Stats › Ask**: thread list on the left; the thread in the middle. An answer is its text, then its result cards.
  - A card is a table with percentile bars like the leaderboards, or a chart (bar, line or the Explore scatter).
  - **The app picks the chart from the result's shape:** a time grain → line; one ranked metric → bar; two metrics → scatter; otherwise a table. The model's `chart` hint is followed when it fits the shape (report D10).
  - Each card has **Open in Explore / Dashboard / Compare**, CSV export, and **Show query** (the tool calls, their arguments and the compiled query).
  - Numbers flagged by the checks (§4.3) are underlined with the reason on hover.
  - In Dev mode, a thumbs-up adds the turn to `ask_examples`.
  - The composer has example questions and a chip naming the model in use.
- **Ctrl+K**, on any screen (fantasy ones too): a one-line box. Enter opens Stats › Ask in a new thread with the screen context attached (§4.1).
- **Setup** when no model is configured: three cards — _Use Claude (MCP)_, _Use an API key_, _Use a local model_ (detects Ollama / LM Studio and recommends a model from §7).
- Works without a league (league tools then say there is none) and with no model set up (setup cards only).

## 9. Code layout

- `src/main/analyst/`:
  - `tools.ts`: definitions, profiles, JSON Schemas, compact schema builder.
  - `resolve.ts` and `classify.ts`: context block, question type, detected slots.
  - `brief.ts`.
  - `compact.ts`: results for the model.
  - `checks/`: one file per answer check.
  - `examples.ts`, `trace.ts`, `loop.ts`.
  - `providers/`: anthropic, openaiCompatible.
  - `mcp/`: server, bridge.
  - `threads.ts`.
- `src/shared/ask.ts`: thread, message and result-card types; IPC channels `ask:*`.
- `src/shared/stats/dimensions.ts`: `DimensionDef`s. `querySchema.ts`: seasons and weeks as enums.
- `src/renderer/src/stats/ask/`: the screen, cards, setup; `CommandBar` in the shell.
- `scripts/eval-ask.ts`, `scripts/ask-replay.ts`, `scripts/export-semantic-model.ts`, `tests/ask/`.

## 10. Testing

- **Unit tests:**
  - per tool (arguments → `StatsQuery`), and the compact schema builder (§3.2 rules: no resolved slots, neutral defaults, `maxItems`, enum bounds);
  - the resolver (names, nicknames, dates, ambiguity, detected slots) and the classifier;
  - aliases and synonyms (no collisions), and resolver recall@5 on the evaluation questions;
  - the compact form, and the answer checks (true and false flags);
  - each provider adapter against recorded replies;
  - the MCP server (initialize, list tools, call a tool, `structuredContent`, bad token, bad Origin).
- **Replay:** recorded model replies are re-graded against the current engine in `npm test`, so an engine change that alters an answer fails without any model running. `npm run ask:replay -- <trace>` re-runs a trace's tool calls against the frozen database and can re-ask the model.
- **The evaluation (§7) is the quality gate of Plans AF1–AH:**
  - AF1 reports the reference tool calls passing on the frozen database, and resolver recall.
  - AF2 reports the same reference calls passing through the MCP server.
  - AG reports the model matrix.
  - AH re-runs the recommended local model and one Claude tier after the UI work.
- **Packaged Windows gates:** the MCP bridge (AF2) and a walk-through of Ask (AH), as in previous plans.

## 11. Plans

**Research — done (2026-11-01/02).** The literature review, decision answers and on-device probes are in `docs/research/2026-11-01-ask-analyst-state-of-the-art.md` (notes: `…-reading-notes.md`; probe harness: `docs/research/ask-probes/`). This revision applies its §6 and Appendix B.

| Plan | Scope                                                                                                                                                                                                                                                                                                                                                                                                                                         | Version |
| ---- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| AF1  | Analyst tools and both profiles (compact schema builder, §3.2). Resolver + classifier + slot detection. Metric aliases, `DimensionDef`, glossary and YAML export. Engine: split base / interval / noise, why-empty notes, `querySchema.ts` enums, exact result cache and query timings. Analyst brief (versioned). Answer checks. Traces. `ask_examples` (schema). Question set (dev / held-out) + frozen database; the reference calls pass. | v0.37.0 |
| AF2  | MCP server (Streamable HTTP, token, Origin check; structured output, elicitation, resources) + stdio bridge (packaged Windows gate) + Settings › Ask (MCP part: on / off, Add to Claude desktop, Copy Claude Code command).                                                                                                                                                                                                                   | v0.38.0 |
| AG   | Agent loop, provider adapters, keys, calling modes (capability detection, thinking budget, output caps). Evaluation runner (pass^k, paraphrases, penalty scoring, simulated user, rubric judge). Replay re-grading in `npm test`. Model matrix on this laptop with current light and larger models. Example library on / off and sample-k trials. Tuning of the compact profile and brief on the dev split. Report.                           | v0.39.0 |
| AH   | Ask screen, threads, result cards (chart picked by shape, flagged numbers, Show query), Dev-mode thumbs-up → examples, Ctrl+K command bar, setup cards, provider settings UI (from the Claude Design mockups).                                                                                                                                                                                                                                | v0.40.0 |

**AF is split in two (user, 2026-11-02):** AF1 builds the tool layer the MCP server and the agent loop share, testable without any model; AF2 puts it behind MCP. The user's own path still comes first: after AF2, Claude desktop answers questions from the app's data. AG has no visible UI beyond settings; its report decides the defaults AH shows.

**Follow-up specs, each started only by evidence:**

- A fine-tuned small local analyst trained on engine-verified synthetic data, if AG finds no local model at the gate (report R22).
- A prompt optimiser that tunes briefs on the dev split (R28).
- A read-only `sql` tool for MCP in Dev mode, or a fixed-function `calc` tool, if the coverage-gap log shows a steady need (R2).
- An `insights` tool over the outlook and stability signals (R29).

## 12. Out of scope

- Fantasy advice: start/sit, trades, waivers (the adviser spec, later).
- The model writing SQL or code (no raw SQL, no Python sandbox) in this spec.
- A critic, planner or verifier model; sentence-level citations.
- A semantic (similar-question) answer cache.
- Model-written chart specifications.
- Learnt free-form memory about the user (league facts reach the model through tools).
- A bundled model runtime; fine-tuning a model (a possible follow-up, §11).
- Voice; asking from a phone; sharing threads.
- Writing anything (custom views, notes) from a chat.

## 13. Risks

- **Small models stay weak at multi-step questions.** Mitigated by the resolver, classifier, compact profile and structured mode. Measured, not assumed (§7). Local stays "experimental" if it misses the gate.
- **The probe numbers are optimistic.** The compact rules were tuned on the probe questions themselves. AG confirms them on the held-out split, and the brief is never tuned on held-out questions.
- **Local models without tool support** (the installed Gemma 3): structured mode. **Reasoning models are slow** (qwen3:4b: 18 s per call native): a thinking budget, and the evaluation picks the mode.
- **Leading questions and selective splits:** splits carry their base, the brief requires it, and the checks flag a split without it.
- **The bridge on Windows** (Electron as Node, Claude desktop's process launch): gated first in AF2.
- **Free tiers change** their limits and models; presets are editable and nothing depends on one.
- **Wrong numbers in prose:** the number check (§4.3) and result cards rendered from rows keep the data honest.
- **The field moves fast:** decisions rest on our own evaluation, not on leaderboards. Models, prompts and tool profiles are swappable and re-validated by the same evaluation (report §5, flexibility map).

## 14. Open points for review

1. Reach: league data read only, no advice — as written in §1?
2. MCP when the app is closed: the bridge starts the app minimised (§6.1), or answers "open FantasyCompanion first"?
3. Evaluation gates (§7): Claude 90 % pass^1 / 85 % pass^3; the recommended local model 70 % / 60 % and 15 s.
4. Free cloud presets (§6.2): Gemini, Groq and OpenRouter; any to add or drop?
