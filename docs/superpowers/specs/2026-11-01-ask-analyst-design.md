# Ask — a personal data analyst — design

**Date:** 2026-11-01 · **Status:** draft, under review; waits on the research in §11 · **Plans:** AF (analyst tools + MCP server), AG (agent loop, providers, evaluation), AH (Ask screen + Ctrl+K)

**Sources:** the stats-analysis spec (`2026-10-15-stats-analysis-design.md`): the query engine (§7) and the NLQ groundwork (§10), plus the code that exists today: `StatsQuery` and its JSON Schema (`src/shared/stats/querySchema.ts`), the metric catalogue (310 metrics, `src/shared/stats/catalogue.ts`), and the outlook, games, player and ownership endpoints.

**Goal.** You ask a football question in plain words, such as "who leads WRs in yards per route run since week 5?", "how does Bijan do against man coverage?" or "best free-agent TE by target share". You get a written answer backed by the engine's real rows, shown as a table or chart that opens in the app. You can follow up ("only in the red zone", "now 2024"). This is a **personal data analyst**: it reads data and explains it. A **fantasy adviser** (start/sit, trade ideas) is a later spec, built once this is in place.

**Constraint.** The data stays free and keyless (stats-analysis spec). The language model is **your choice**, and every kind is supported: your Claude subscription through MCP, a paid or free API, or a local model on the PC. Nothing is sent anywhere until you set one up.

## 1. Decisions (brainstorm 2026-11-01)

| Topic        | Decision                                                                                                                                                                                                                                                           |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Model        | **Every option.** (1) An MCP server, so Claude desktop or Claude Code asks with your subscription (the user's own choice, built first). (2) An API: Anthropic, or any OpenAI-compatible service, paid or free tier. (3) A local model through Ollama or LM Studio. |
| Weak models  | The environment does the hard parts, so a small local model only has to pick a tool and fill a few slots: names, teams, metrics and dates are resolved before the model is called (§4), the tools are few and flat (§3), and errors tell it how to fix the call.   |
| Local models | Tested thoroughly on this machine (§7): i7-13620H, 32 GB RAM, RTX 4060 Laptop with 8 GB VRAM. Ollama (WSL) and LM Studio (Windows) are already installed. The results decide which local models the app recommends.                                                |
| Shape        | A chat with follow-ups. Each answer is text plus result cards (table or chart) rendered from the engine's rows, never from the model's text.                                                                                                                       |
| Placement    | Both: a **Stats › Ask** tab with threads, and **Ctrl+K** anywhere in the app, which opens Ask with the question and what is on screen.                                                                                                                             |
| Reach        | The stats engine (leaderboards, splits, game logs, trends, compare, outlook, games, forecasts) and your league's data, read only (rosters, who rosters whom, free agents, league scoring). No advice.                                                              |

## 2. Architecture

```
            Claude desktop / Claude Code                   Ask screen, Ctrl+K (renderer)
                      │ MCP (stdio bridge → HTTP)                    │ IPC
                      ▼                                              ▼
main ── MCP server (127.0.0.1) ──┐                    agent loop (§5) ── provider adapter (§6)
                                 ▼                                   │        ├ Anthropic
                       analyst tools (§3) ◄──────────────────────────┘        ├ OpenAI-compatible (cloud, free tiers)
                         │ resolver (§4) · analyst brief (§4.4)                └ local server (Ollama, LM Studio)
                         ▼
             stats worker: query engine, outlook, games ── stats.duckdb
             companion.db: league, rosters, rules, threads, provider settings
```

- **One tool layer** (`src/main/analyst/`) serves both paths: MCP hands it to Claude, and the in-app agent loop hands it to whichever model is set up. The tools call the existing engine; nothing in the engine changes except metric aliases (§4.2).
- **Read only.** No tool writes data. The one tool with a side effect, `open_in_app`, only navigates the app.
- **The model never sees the database.** It calls tools; the engine validates, compiles parameterised SQL, and caps rows and time, as today (§7.2 of the stats spec).

## 3. Analyst tools

Few tools, each the shape of a question, with flat arguments and defaults filled by the app (current season, regular season, qualified only, league scoring when a league exists). A small model fills two or three fields; a strong model can use the rest.

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
- **Two tool profiles.** _Full_ (MCP and strong models): every tool. _Compact_ (small local models): `leaderboard`, `player_stats`, `team_stats`, `compare`, `games`, `league`, `describe`, with enums narrowed to the candidates the resolver found (§4). Which profile a model gets is a setting, defaulted per provider from the evaluation (§7).
- **Errors teach.** An invalid call returns why and how to fix it ("`yprr` needs a WR, TE or RB position; did you mean `position: WR`?", "`Bijan` matched 1 player: 00-0039… Bijan Robinson"), never a stack trace. At most 3 retries per question.
- **What the model sees is compact.** A result reaches the model as at most 15 rows × 6 columns, rounded to the catalogue's decimals, with rank, percentile, sample and the engine's `notes` (coverage, estimates). The screen gets the full result.

## 4. Making the job easy for any model

### 4.1 The resolver (no model involved)

Before the model is called, deterministic code reads the question and attaches a **context block**:

- **Players**: fuzzy match on names in the identity table, with common short forms ("CMC", "ARSB", "Bijan"), position and team to break ties; ambiguity is listed, not guessed.
- **Teams**: codes, cities, nicknames ("Niners", "Bolts", "the Rams" → LA).
- **Metrics**: the top candidates from the catalogue by alias, label and description (§4.2), each with its id and one line.
- **Time**: "this year", "last season", "since week 5", "last 4 games", "2022–24" → seasons, weeks, `lastNGames`. "Now" = the warehouse's latest week (`StatsStatus.through`).
- **Screen context** (Ctrl+K): the product, screen, player or team and scope on screen, reusing the dev-notes context parts, so "this player" and "here" resolve.
- **Thread state**: the last query of the thread, so "now 2024" changes one field.

A strong model may ignore the block; a small one copies ids from it.

### 4.2 Metric aliases and the glossary

- `MetricDef.aliases`: the words people use ("yards per route", "YPRR", "aDOT", "air yards per target", "pressure rate allowed"). Written for every core and extended metric; tested so no alias points at two metrics.
- A **dimension glossary** (stats spec §10): pressure, neutral, route, red zone, personnel, coverage, est., qualified, and each source's season coverage. The same text serves the analyst brief and dev note N-007 (stat explanations in the app).

### 4.3 Answers that can be checked

- Every number in the answer must come from a tool result. After an answer, the app checks each number against the results of that turn (after rounding); an unmatched number is underlined and marked "not from the data".
- Answers state the sample and the caveats the result carries ("on 61 routes", "2026 routes are estimated").
- The question can't be answered → the model says so and why (no data before 2019, a metric we don't have, advice).

### 4.4 The analyst brief

One system text, shared by MCP (the server's `instructions` and an `analyst` prompt) and the agent loop: who it is, the data's range and current week, the conventions (seasons 2019 →, nflverse team codes, REG by default), the glossary, the rules of §4.3, and "no advice yet". A short variant for the compact profile.

## 5. The agent loop (in-app)

- In main, per turn: resolver → model with the brief, the thread, the context block and the tools → run tool calls (in parallel when independent) → model writes the answer → number check → the message and its result cards to the renderer, streamed.
- **Limits:** 8 tool calls and 3 failed calls per turn, a token cap per turn, a 90 s turn timeout (local models can be slow), and Stop in the UI.
- **Two calling modes:** native tool calling when the model supports it; otherwise **structured mode**: the model returns one JSON object `{tool, args}` constrained by the tool's JSON Schema (Ollama `format`, LM Studio / OpenAI `response_format: json_schema`), then writes the answer in a second call. The evaluation picks the mode per model.
- **Threads** in `companion.db` (`ask_threads`, `ask_messages`: role, text, tool calls, results, model, tokens, ms). Kept until deleted.
- In Dev mode every turn is also appended to `<userData>/ask/log.jsonl`: the corpus of real questions (stats spec §10), which feeds the evaluation set.

## 6. Providers and MCP

### 6.1 MCP server (Plan AF, the user's own path)

- **In the app**, because only one process can hold `stats.duckdb`: a Streamable HTTP MCP server on `127.0.0.1`, random port, bearer token, Origin checked; **off by default**, turned on in Settings › Ask.
- **Claude desktop** speaks stdio, so a **bridge** forwards stdio ↔ HTTP: the app's own exe run as Node (`ELECTRON_RUN_AS_NODE` + a bundled `mcp-bridge.js`), reading the port and token from a file in `userData`. If the app is not running, the bridge starts it minimised and waits up to 30 s. This is gated first on the packaged Windows build, like DuckDB was.
- **Claude Code** connects to the HTTP endpoint directly.
- Settings › Ask shows **Add to Claude desktop** (edits `%APPDATA%\Claude\claude_desktop_config.json` after you confirm, with a backup) and **Copy Claude Code command**.
- The server exposes the full tool profile, the brief as `instructions`, an `analyst` prompt and the glossary as a resource. Answers appear in Claude; `open_in_app` shows them in the app.

### 6.2 APIs and local servers (Plan AG)

| Provider          | How                                                                                                                                                          |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Anthropic         | Messages API with native tools; your key.                                                                                                                    |
| OpenAI-compatible | Base URL + key + model. Presets: OpenAI, Google Gemini (free tier), Groq (free tier), OpenRouter (free models), Mistral; "Custom" for anything else.         |
| Local server      | Ollama (`localhost:11434`) or LM Studio (`localhost:1234`) through their OpenAI-compatible endpoints; the app detects a running server and lists its models. |

- Keys are encrypted with Electron `safeStorage` (Windows DPAPI) in `companion.db`; never logged, never sent to another provider.
- Settings › Ask states what leaves the PC for each provider: the question, the tool results (stats rows, league team and player names). Local: nothing.
- Each answer shows the model and tokens used. No price table in the app (prices change); the provider's own dashboard is linked.
- A bundled model runtime (no Ollama needed) is **not** in this spec; the evaluation tells whether it would be worth its size.

## 7. Evaluation

The heart of the work for local models: a fixed test that every model, prompt or tool change is measured against.

- **Question set** (`tests/ask/questions/`): about 150 questions with a reference tool call each, in categories: lookup, leaderboard, situational split, compare, trend, games and forecasts, league data, two- and three-turn follow-ups, ambiguous (must ask), unanswerable or advice (must decline). Written from real phrasings, then grown from the Dev-mode log.
- **Frozen database**: a snapshot of `stats.duckdb` (and a league fixture) at a fixed week, so answers don't move.
- **Grading by execution**: a question passes when the model's final tool result matches the reference's (same rows in the top k, same metric values), whatever the exact arguments. Separate scores for: right result, valid first call, retries, number check passed, refusal and clarification behaviour, latency p50 / p90, tokens.
- **Runner**: `npm run eval:ask -- --provider <p> --model <m> [--profile compact] [--mode structured]` → a report in `docs/research/`. Not part of `npm test`: the unit suite uses recorded model replies.
- **Model matrix** (Plan AG): Claude (strong and fast tiers, through the API); one free cloud tier; local models that fit 8 GB of VRAM at 4-bit, in native and structured mode, compact and full profile, picked at plan time from current tool-capable open models (for example the Qwen, Gemma and Llama families; `gemma3:4b` and `gemma3:12b` are already in Ollama). MCP is spot-checked by hand in Claude desktop.
- **Gates** (to confirm): the strong Claude tier ≥ 90 % right results; the recommended local model ≥ 70 % on lookup, leaderboard, compare and follow-ups with p50 ≤ 15 s on this laptop. If no local model reaches its gate, the app still offers local models, marked as experimental.

## 8. Screens (Plan AH, mocked in Claude Design first)

- **Stats › Ask**: thread list on the left; the thread in the middle. An answer is its text, then its result cards: a table with percentile bars like the leaderboards, or a chart (bar, line or the Explore scatter), each with **Open in Explore / Dashboard / Compare**, CSV export, and **Show query** (the tool calls and their arguments). The composer has example questions and a chip naming the model in use.
- **Ctrl+K**, on any screen (fantasy ones too): a one-line box. Enter opens Stats › Ask in a new thread with the screen context attached (§4.1).
- **Setup** when no model is configured: three cards — _Use Claude (MCP)_, _Use an API key_, _Use a local model_ (detects Ollama / LM Studio and recommends a model from §7).
- Works without a league (league tools then say there is none) and with no model set up (setup cards only).

## 9. Code layout

- `src/main/analyst/`: `tools.ts` (definitions, profiles, JSON Schemas), `resolve.ts`, `brief.ts`, `compact.ts` (results for the model), `check.ts` (number check), `loop.ts`, `providers/` (anthropic, openaiCompatible), `mcp/` (server, bridge), `threads.ts`.
- `src/shared/ask.ts`: thread, message and result-card types; IPC channels `ask:*`.
- `src/renderer/src/stats/ask/`: the screen, cards, setup; `CommandBar` in the shell.
- `scripts/eval-ask.ts`, `tests/ask/`.

## 10. Testing

- Unit tests per tool (arguments → `StatsQuery`), the resolver (names, nicknames, dates, ambiguity), aliases (no collisions), the compact form, the number check, each provider adapter against recorded replies, the MCP server (initialize, list tools, call a tool, bad token, bad Origin).
- The evaluation (§7) as the quality gate of Plans AF–AH: AF reports the reference tool calls passing on the frozen database; AG reports the model matrix; AH re-runs the recommended local model and one Claude tier after the UI work.
- Packaged Windows gate for the MCP bridge (AF) and a walk-through of Ask (AH), as previous plans.

## 11. Plans

**Research first (user, 2026-11-01).** Before Plan AF, a literature review of the state of the art in LLM-powered data-analyst agents (arXiv and other paper platforms) goes to `docs/research/`. It covers query optimisation and OLAP, efficient aggregation, semantic layers and semantic consistency, scalability and flexibility, statistical correctness, performance validation, and newer ideas from the research community. It ends with recommendations for the database, the app and the project environment. This spec is revised from its findings before approval: the design must be novel, but flexible enough to follow a fast-moving field. The research plan, with the decision questions D1–D12 it must answer, is `docs/research/2026-11-01-ask-analyst-research-plan.md`.

| Plan | Scope                                                                                                                                                                           | Version |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| AF   | Analyst tools and profiles, resolver, metric aliases and glossary, analyst brief, number check, MCP server + bridge + Settings › Ask (MCP part), question set + frozen database | v0.37.0 |
| AG   | Agent loop, provider adapters, keys, structured mode, evaluation runner, model matrix on this laptop, tuning of the compact profile and brief from the results; report          | v0.38.0 |
| AH   | Ask screen, threads, result cards, Ctrl+K command bar, setup cards, provider settings UI (from the Claude Design mockups)                                                       | v0.39.0 |

AF ships the user's own path first: after it, Claude desktop answers questions from the app's data. AG has no visible UI beyond settings; its report decides the defaults AH shows.

## 12. Out of scope

- Fantasy advice: start/sit, trades, waivers (the adviser spec, later).
- A bundled model runtime; fine-tuning a model.
- Voice; asking from a phone; sharing threads.
- Writing anything (custom views, notes) from a chat.

## 13. Risks

- **Small models stay weak at multi-step questions.** Mitigated by the resolver, compact profile and structured mode; measured, not assumed (§7). Local stays "experimental" if it misses the gate.
- **The bridge on Windows** (Electron as Node, Claude desktop's process launch): gated first in AF.
- **Free tiers change** their limits and models; presets are editable and nothing depends on one.
- **Wrong numbers in prose**: the number check (§4.3) and result cards rendered from rows keep the data honest.

## 14. Open points for review

1. Reach: league data read only, no advice — as written in §1?
2. MCP when the app is closed: the bridge starts the app minimised (§6.1), or answers "open FantasyCompanion first"?
3. Evaluation gates (§7): 90 % for Claude, 70 % and 15 s for the recommended local model.
4. Free cloud presets (§6.2): Gemini, Groq and OpenRouter; any to add or drop?
