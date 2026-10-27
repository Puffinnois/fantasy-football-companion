# Stats analysis — design

**Date:** 2026-10-15 · **Status:** approved 2026-10-16, amended 2026-10-16 (§15: Plan X), 2026-10-17 (§16: Plan Y), 2026-10-18 (§17: Plan Z), 2026-10-20 (§18: Plan AA), 2026-10-20 (§19: Plan AB), 2026-10-21 (§20: paired sums), 2026-10-21 (§21: Plan AC), 2026-10-24 (§22: Plan AD1), 2026-10-25 (§23: Plan AD2) and 2026-10-27 (§24: Plan AE) · **Plans:** X (DuckDB foundation), Y (metric layer + query engine), Z (models), AA (Stats screen), AB (team dashboard), AC (player dashboard), AD (explore: charts, compare, trends), AE (matchup preview); natural-language queries get their own spec after AE.

**Sources:** the stats catalog (`docs/research/2026-10-09-nfl-stats-catalog.md`), the predictive-metrics catalogue (`docs/research/nfl_predictive_metrics.md`), the coverage audit (`docs/research/2026-10-14-warehouse-coverage-audit.md`), and a DuckDB vs SQLite benchmark on 2023–2025 play-by-play and participation (§3.2).

**Goal.** Turn the stats warehouse into a statistics analysis section for players and teams, offense and defense: leaderboards, a dashboard per player and per team with specialised tabs, a chart explorer, comparisons, multi-season trends and matchup previews. It helps in the fantasy league, and it is also a **second, standalone way to use the app**: a football data-analysis tool that works without a league.

**Constraint.** Free, keyless sources only (as the warehouse spec). No paid API, no scraping of sites that forbid it.

## 1. Decisions (brainstorm 2026-10-15)

| Topic                          | Decision                                                                                                                                                                                            |
| ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Players covered                | Every position, individual defenders included (pass rush, coverage, tackling).                                                                                                                      |
| Entry from the fantasy screens | The player slide-over stays the quick fantasy view and gains **Open stats dashboard**. The Stats screen opens dashboards directly.                                                                  |
| Standalone                     | Stats works on a fresh install with no league. Fantasy numbers take a scoring picker: My league (when imported) / PPR / Half / Standard. A league adds extras (rostered-by badges, my-team filter). |
| Metric set                     | The shortlist in §6, taken from the predictive-metrics catalogue: popular, free, computable here. **Everything is stored; only a curated part is displayed.**                                       |
| Forecasts                      | Signals, ratings and team forecasts (Elo, season simulation). Fantasy projections stay Sleeper / FantasyPros. Our own projection model is a follow-up spec.                                         |
| Tools                          | Chart explorer, matchup preview, custom views + CSV export, multi-season trends, compare.                                                                                                           |
| Natural-language queries       | Last, own spec. Everything before it runs on one structured query engine (§7) so NLQ only has to translate a question into a query.                                                                 |
| Play-level data                | Store plays **and the players on the field** for every play.                                                                                                                                        |
| Engine                         | The warehouse moves wholly to **DuckDB**, typed columns, no JSON blobs. `companion.db` stays SQLite. The app stays TypeScript.                                                                      |
| UI design                      | Mockups in Claude Design in the Edition language of the v0.24.0 redesign (§9.6).                                                                                                                    |

## 2. Architecture

```
nflverse / ffverse / Sleeper ──► ingest steps (warehouse worker) ──► stats.duckdb
                                                                       ├─ raw layer      (§4: one typed table per source, plays, on-field)
                                                                       ├─ identity       (§4.3: players, teams)
                                                                       ├─ derived layer  (§5: weekly + season metric tables, percentiles)
                                                                       └─ model layer    (§8: Elo, ratings, FG model, stability …)
renderer ──IPC──► main ──► analytics worker (owns the DuckDB connection) ──► query engine (§7) ──► rows
companion.db (SQLite): league, rosters, rules, settings, saved views  ──(ids, rules copied in)──►
```

- **One process owns DuckDB**: a long-lived analytics worker thread. Sync writes and UI reads go through it, so the main thread never blocks on a scan and the file has a single writer. Reads queue behind a running write only for the few seconds a table swap takes (§5.3).
- `companion.db` is not attached (DuckDB's SQLite reader is a download-on-demand extension). The worker receives the rows it needs (id crosswalk, league rules, roster ownership) from main and keeps them in small tables.
- The existing fantasy pipeline (`player_week_stats`, `sleeper_week_stats`, values, lineup, trade, waivers) does not change in this update.

## 3. Engine: DuckDB

### 3.1 Why

The workload is analytical: scan millions of rows, filter on many dimensions, group, rank. SQLite is a row store built for keyed lookups; DuckDB is a columnar, vectorised engine built for this, embedded in-process like SQLite, with window functions, quantiles, correlation and regression built in, and native Parquet reading (nflverse publishes Parquet). The language around it barely matters: the heavy work runs inside the engine, so TypeScript stays (Rust or Python would cost a rewrite or a bundled runtime for no measurable gain; our own models run on thousands of rows, §8).

### 3.2 Benchmark (2026-10-15, 2023–2025: 143 585 plays, 137 271 participation rows, 3 019 631 on-field rows)

|                                                              | SQLite (`node:sqlite`, indexed) | DuckDB (`@duckdb/node-api` 1.5.6) |
| ------------------------------------------------------------ | ------------------------------- | --------------------------------- |
| File size                                                    | 379 MB                          | 37 MB                             |
| Load                                                         | 27 s                            | 4 s                               |
| WR yards per catch when the QB was pressured, 2025 weeks 4–9 | 76 ms                           | 112 ms                            |
| Every player: team EPA/dropback with him on the field        | 5 749 ms                        | 104 ms                            |
| Success rate by down × formation × personnel × coverage      | 303 ms                          | 51 ms                             |
| Percentile rank of every passer by season                    | 67 ms                           | 30 ms                             |

Selective lookups are a tie; broad questions (the dashboards', the explorer's, NLQ's) are 6–55× faster, and the file is 10× smaller.

### 3.3 Risk and gate

DuckDB is the app's first native module (`node:sqlite` is built in). `@duckdb/node-api` ships prebuilt N-API binaries (`win32-x64`, `linux-x64`), so no compiler is needed, but they must load from the packaged app. **Plan X Task 1 is a gate:** a packaged Windows build opens a DuckDB file, writes, reads and closes, from the analytics worker, with the binary unpacked from the asar (`asarUnpack`). If it fails, stop and report before anything else is built.

## 4. Raw layer (Plan X)

`stats.duckdb` beside `companion.db` replaces `warehouse.db`. It is rebuilt by a backfill on first launch of the new version; `warehouse.db` is deleted once the backfill has finished. Deleting `stats.duckdb` makes the next refresh rebuild it (as today).

### 4.1 Source tables

One table per source, columns as the source publishes them (typed: integers, doubles, text, booleans, dates), plus `season`, `season_type`, `week`, the entity key and `team` / `opponent` in normalised form. Zeros are kept (columnar compression makes them nearly free, and "0" and "missing" stop being ambiguous). New columns a source adds are picked up (`union_by_name`); a missing key column fails the step, as today.

| Table                                                        | From                                      | Key                                      |
| ------------------------------------------------------------ | ----------------------------------------- | ---------------------------------------- |
| `src_sleeper`, `src_sleeper_def`, `src_sleeper_team`         | Sleeper weekly stats                      | sleeper id / team                        |
| `src_player_stats`, `src_team_stats`                         | nflverse `stats_player`, `stats_team`     | gsis / team                              |
| `src_snaps`                                                  | nflverse `snap_counts`                    | pfr                                      |
| `src_ff_opportunity`, `src_ff_opportunity_team`              | ffverse `ep_weekly`                       | gsis / team                              |
| `src_ngs_pass`, `src_ngs_rush`, `src_ngs_rec`                | nflverse `nextgen_stats`                  | gsis                                     |
| `src_pfr_pass`, `src_pfr_rush`, `src_pfr_rec`, `src_pfr_def` | nflverse `pfr_advstats`                   | pfr                                      |
| `src_qbr`                                                    | nflverse `espn_data` (week + season)      | espn                                     |
| `src_injuries`, `src_depth_charts`, `src_rosters`            | nflverse                                  | gsis                                     |
| `src_combine`                                                | nflverse `combine`                        | pfr, cfb, else name + year (audit fix 3) |
| `games`                                                      | nflverse `schedules/games` (every column) | game_id                                  |

### 4.2 Plays

| Table          | Rows             | Holds                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| -------------- | ---------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `plays`        | ~48 000 a season | One row per play, deleted plays and preseason dropped. Game and situation (season, week, teams, quarter, clock, down, distance, yard line, score margin, win probability, roof, surface, weather), play type and outcome (yards, air yards, YAC, first down, TD, turnover, penalty), models (EP, EPA, WP, WPA, CP, CPOE, xYAC, xPass, PROE), formation flags (shotgun, no huddle), the existing counting flags (§11 of the warehouse spec: kneels, spikes, no_play, two-point), drive id. Plus the FTN columns (2022+: play action, RPO, screen, motion, box, blitzers, read thrown, catchable, contested, created, drop, interception-worthy, QB fault sack …) and the participation columns (personnel, formation, box, pass rushers, time to throw, pressure, route, man/zone, coverage). About 120 columns. |
| `play_players` | ~3 a play        | Every player the play names, with a role: passer, rusher, receiver, tackler, assist tackler, sack, QB hit, pass defended, interception, forced fumble, fumble recovery, kicker, punter, returner, penalty.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      |
| `on_field`     | ~22 a play       | Every player on the field, with side (O / D) and the position participation lists. Through the prior season (participation for the current season is published after it ends).                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                  |

The counting rules of the warehouse spec §11–§12 (what counts as a carry, a dropback, a snap) move from the aggregation code into **views over `plays`**, so they hold everywhere and the weekly aggregates are a query, not a separate code path. The agreement gates of Plans U and V (targets, carries, snaps against nflverse) are re-run on the new tables.

### 4.3 Identity

- `players`: one row per person, keyed by gsis id, with sleeper, pfr, espn, sportradar ids, name, position, birth date, height, weight, college, draft, headshot. Built from rosters + the crosswalk + Sleeper players. A source row whose id maps to no gsis keeps its own key and stays queryable.
- `teams`: nflverse code, name, conference, division, colors, and the code each source uses. **All team codes are normalised on write** (audit fix 2: 2019 `OAK` → `LV`; ESPN `LAR`/`WSH`).
- Audit fixes 1 (2025+ playoff depth charts), 3 (combine fallback key) and 4 (nickname-aware name match: Matt/Matthew, OL ⊇ G/T/C) land in Plan X.

### 4.4 Sync

- Same freshness rules as today (warehouse spec §4.2): sealed seasons, prior season weekly, current season daily and on a forced refresh, no retry within 24 h.
- Parquet where nflverse publishes it, CSV otherwise; Sleeper JSON as today.
- **Runs without a league.** The warehouse fetches the Sleeper NFL state itself (`/state/nfl`) instead of reading it from the league sync, and starts after app launch when no league exists.
- A startup sweep marks `sync_log` rows left `running` by a closed app as `interrupted` (audit).
- Size target ≤ 400 MB for 2019 → current (estimate ~250 MB: plays + on-field ~120 MB, sources ~100 MB, derived ~30 MB). Backfill target ≤ 10 min on the user's connection.

## 5. Derived layer (Plan Y)

### 5.1 Sums, not averages

Every rate is stored as its **numerator and denominator** and divided when read (warehouse spec rule). So any week range, team, split or group is exact, and never an average of averages.

### 5.2 Tables

| Table                      | Grain                                | Holds                                                                                                                                                                                                                                                                                       |
| -------------------------- | ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `player_week`              | player × season × season type × week | Every catalogue component (§6) for that week, all sources joined on gsis: counts, numerators, denominators, team context (team plays, dropbacks, targets, air yards, carries) for shares.                                                                                                   |
| `player_season`            | player × season × season type        | Sum of `player_week`, plus season-only sources (NGS / QBR week 0), rates, **percentile and rank within position among qualified players** (§6.2 minimum samples).                                                                                                                           |
| `team_week`, `team_season` | team × …                             | Offense and defense (`off_` / `def_`, as the warehouse spec), special teams, drives, tendencies, record, fantasy points allowed by position.                                                                                                                                                |
| `fantasy_week`             | player × week × scoring              | Points under each scoring preset and under the league rules (Sleeper lines scored in DuckDB with the rules copied from `companion.db`); **expected points under the same rules** from the ffopportunity components (expected receptions, yards, TDs, first downs, two-points by play type). |

Rebuilt in the worker after each sync, only for the seasons the sync touched. Each rebuild writes new tables and swaps them in one transaction, so readers never see half a rebuild.

### 5.3 Freshness in the UI

Every dashboard shows "data through week N, updated <time>" from `sync_log`. A rebuild in progress shows a quiet indicator; screens re-query when it completes.

## 6. Metric catalogue (Plan Y)

### 6.1 Shape

One TypeScript module (`src/shared/stats/catalogue.ts`), one entry per metric:

| Field                    | Meaning                                                                                                                         |
| ------------------------ | ------------------------------------------------------------------------------------------------------------------------------- |
| `id`, `label`, `short`   | `rec_yprr`, "Yards per route run", "YPRR"                                                                                       |
| `description`            | One or two plain sentences: what it measures, how to read it, its caveat. Written for a person **and for an LLM** (§10).        |
| `family`                 | `traditional` / `advanced` / `ngs` / `charting` / `predictive` — a badge and a filter, not a tab.                               |
| `entity`                 | `player` / `team` (and `offense` / `defense` for team metrics).                                                                 |
| `positions`              | Where it applies (QB, RB, WR, TE, K, P, DL, LB, DB, or all).                                                                    |
| `expr`                   | Numerator and denominator as expressions over components, or a model output reference.                                          |
| `grains`                 | `play`, `week`, `season`: where it can be computed. Play-grain metrics accept situational filters (§7).                         |
| `format`, `direction`    | Units and decimals; higher-is-better or lower-is-better (for colour and percentiles).                                           |
| `minSample`              | Denominator and threshold for "qualified" (e.g. 100 dropbacks, 30 targets, 50 carries, 150 pass-rush snaps).                    |
| `sources`, `firstSeason` | Where it comes from; 2022 for FTN metrics, 2019 otherwise; `estimatedSeasons` for proxies (routes in the current season).       |
| `tier`                   | `core` (shown by default), `extended` (shown in its tab / column picker), `stored` (in the database and the query engine only). |
| `stability`              | Filled by Plan Z (§8.6).                                                                                                        |

### 6.2 The set

Stored in full; the **tier** decides what screens show. _(c)_ = core, _(e)_ = extended, _(s)_ = stored only. Labels follow the predictive-metrics catalogue (Forecast / Indicator / Evaluation).

**Traditional (all positions, c/e).** Every box-score stat of the catalog Part 1 for passing, rushing, receiving, scrimmage, ball security, individual defense, kicking, punting, returns, snaps, penalties, fantasy points; team Part 3 (results, offense, defense, special teams, drives).

**Quarterbacks.** EPA/dropback (c), success rate (c), CPOE (c), EPA+CPOE composite (e), ESPN QBR (c), ANY/A (c), NY/A (e), passer rating (e), sack rate (e), pressure-to-sack rate (e), pressured % (e), clean vs pressured EPA (e, through the prior season; from FTN/PFR for the current one), time to throw (c), aggressiveness (e), aDOT (c), air yards to the sticks (e), expected completion % (e), bad-throw % (e), interception-worthy rate (e, 2022+), play action rate and EPA (e), vs blitz EPA (e), deep attempt rate and EPA (e), designed runs, scrambles, scramble yards, QB rushing EPA (e), red-zone and goal-line rushing (e).

**Receivers (WR, TE, RB receiving).** Target share (c), air-yards share (c), WOPR (c), aDOT (c), YPRR (c), TPRR (c), route participation (c), 1D/RR (e), RACR (e), catch rate (e), YAC/rec (e), YAC over expected (e), separation (c, NGS), cushion (e, NGS), drops / drop rate (e), contested targets and catch rate (e, 2022+), catchable-target % (e), end-zone and inside-10 targets (e), slot / wide / inline rate (s, from participation positions), man vs zone TPRR and YPRR (e, through the prior season). Routes in the current season are **estimated** as team dropbacks × the player's offensive snap share, marked "est.", and exact for past seasons.

**Running backs.** Carry share (c), opportunity share (c), snap share (c), high-value touches (c), red-zone / inside-10 / inside-5 carries (e), RYOE and RYOE/att (c, NGS), rush % over expected (e), yards before / after contact per attempt (e), broken tackles per touch (e), stuff rate (e), explosive-run rate and breakaway % (e), rush EPA and success rate (e), 8+ box rate (e), gap and direction splits (s), two-minute / long-down-and-distance snap share (e, through the prior season).

**Fantasy opportunity (offense).** Expected fantasy points and FPOE under the chosen scoring (c), expected TDs and TD − xTD (c), weighted opportunities (e), fantasy points share (e).

**Defenders.** Pressures, sacks, QB hits, hurries (c), pressure rate per pass-rush snap (e, through the prior season; pass-rush snaps from participation), blitz rate (e), tackles, solo, assists, TFL, stuffs (c), missed-tackle % (e), average depth of tackle (e), coverage: targets, completion %, yards per target, passer rating allowed, aDOT and YAC allowed, TDs and INTs allowed (c for DBs and LBs), coverage EPA allowed per target (e), passes defended, forced fumbles, interceptions (c), snaps and snap share (c).

**Kickers and punters.** FG % by distance (c), **FG over expected** (c, §8.4), PAT % (e), kicker EPA (e), kickoff touchback % (e); punter net average, inside-20 rate, touchback rate, punter EPA (c).

**Teams.** EPA/play and success rate, offense and defense, pass and rush (c); **opponent-adjusted EPA/play** with a recency-weighted version (c, §8.2); early-down EPA, third/fourth-down conversion (e); explosive-play rate (e); havoc rate (e); line yards (e), sack rate and pressure rate, both sides (e); red-zone TD %, points and EPA per drive, three-and-out rate, average starting field position (e); PROE, neutral pass rate, neutral pace, no-huddle and shotgun rates (c); personnel, formation, motion, play action, RPO, screen rates (e); blitz rate, pass rushers per dropback, man vs zone and coverage-shell rates (e); turnover margin, fumble recovery rate (e); fantasy points allowed by position, raw and opponent-adjusted, and pass/run funnel (c); Vegas spread, total, implied team total (c).

**Ratings and forecasts (Plan Z, §8).** Elo rating and game win probability (c), projected wins and playoff / division / Super Bowl odds (c), SRS (c), Pythagorean wins and luck (c), strength of schedule played and remaining (c), turnover luck (e).

**Player outlook (Plan Z, §8).** Ceiling / floor / boom / bust rates (c), trend and role change (c), regression flags (c), shrunk rates (s), stability of each metric (shown as a reliability marker on every stat).

**Profile.** RAS (c), Speed Score (c), combine measurables with position percentiles (e), age, experience, draft capital (c).

**Not included** (no free source, or no college data): PFF grades and WAR, BTT/TWP, ESPN win rates and receiver scores, Reception Perception, Yards Created, Utilization Score, SIS Total Points, DVOA/DYAR, QBASE, BackCAST, Playmaker, SackSEER, dominator, breakout age, tracking research models (STRAIN, tackle / pressure probability), an injury-risk model (our 2026-10-07 study found no usable signal), a QB Elo.

## 7. Query engine (Plan Y)

### 7.1 The query

Every leaderboard, dashboard card, chart and comparison is a `StatsQuery` (TypeScript type, plus a JSON Schema generated from it):

```ts
interface StatsQuery {
  entity: 'player' | 'team'
  metrics: string[] // catalogue ids
  scope: {
    seasons: number[]
    seasonType?: 'REG' | 'POST' | 'ALL'
    weeks?: [number, number]
    lastNGames?: number
    positions?: string[]
    teams?: string[]
    opponents?: string[]
    players?: string[]
    qualifiedOnly?: boolean // the catalogue's minSample
  }
  situation?: {
    // play-grain filters: only play-grain metrics accept them
    down?: number[]
    distance?: [number, number]
    quarter?: number[]
    fieldZone?: 'redzone' | 'inside10' | 'inside5' | 'own20'
    scoreMargin?: [number, number]
    winProbability?: [number, number]
    neutral?: boolean
    pressure?: boolean
    blitz?: boolean
    playAction?: boolean
    coverage?: 'man' | 'zone' | string[]
    formation?: string[]
    personnel?: string[]
    box?: [number, number]
    airYards?: [number, number]
    withOnField?: string[]
    withoutOnField?: string[]
  }
  groupBy?: (
    | 'season'
    | 'week'
    | 'team'
    | 'opponent'
    | 'down'
    | 'quarter'
    | 'personnel'
    | 'coverage'
    | 'formation'
  )[]
  transform?:
    | 'raw'
    | 'perGame'
    | 'perPlay'
    | 'percentile'
    | 'zScore'
    | 'shrunk'
    | 'opponentAdjusted'
    | 'vsLeague'
  sort?: { metric: string; dir: 'asc' | 'desc' }
  limit?: number
}
```

### 7.2 Compilation

- The engine **validates** the query against the catalogue (metric exists, applies to the entity and positions, supports the grain the filters need, minimum samples) and returns a readable error otherwise.
- It picks the grain: only scope filters → the weekly / season tables; any situation filter → `plays` / `play_players` / `on_field`.
- It compiles to parameterised, read-only SQL over the derived and raw tables; no string-built SQL from user values; a per-query timeout (5 s) and row cap.
- Results carry, per metric, the value, the sample (denominator), qualified or not, percentile, the "est." flag and the source season range, so every screen can show context the same way.

### 7.3 Why one engine

It is the single place where counting and qualification rules live, it is testable without the UI, and it is the **tool interface for the natural-language feature**: an LLM reads the catalogue (§6.1 descriptions are written for it), turns a question into a `StatsQuery`, the engine validates and runs it, and the LLM explains the rows. Nothing has to be rebuilt for NLQ.

## 8. Models (Plan Z)

All computed in the worker after each sync, stored in model tables, versioned (a parameter change re-runs history).

### 8.1 Team Elo and season simulation

- nfelo-style Elo from 2019 game results: K = 20, home field 48 points (reduced for neutral sites, 0 without fans in 2020), margin-of-victory multiplier `ln(|MOV| + 1) × 2.2 / (Elo diff × 0.001 + 2.2)`, one third regressed to the mean between seasons, rest and QB adjustments out of scope. 2019 is burn-in.
- Outputs per game: win probability and Elo spread (Elo diff / 25), shown beside the Vegas line.
- **Gate:** Brier score 2021–2025 below 0.25 (coin flip) and reported against the Vegas-implied probability (we expect to be worse than Vegas; the point is a transparent, consistent model, not beating the market).
- Season simulation: 10 000 runs of the remaining schedule from current Elo (ratings updated within each run), NFL tiebreakers to the level of head-to-head, division, common games, conference record, then coin flip (documented as an approximation). Outputs: projected wins, playoff / division / bye / Super Bowl odds.

### 8.2 Opponent-adjusted EPA

Per season and as of each week: ridge regression of play EPA on offense and defense team effects (plus home), separately for all / pass / rush plays, garbage time excluded (win probability outside 10–90 % in the fourth quarter). A recency-weighted version halves a game's weight every 4 weeks. Shown as "Adjusted EPA/play", never as DVOA.

### 8.3 SRS, Pythagorean wins, luck, schedule strength

SRS by iteration (MOV + average opponent SRS). Pythagorean win % with exponent 2.37; luck = wins − Pythagorean wins. Strength of schedule played and remaining from adjusted EPA and from Elo. Turnover luck: fumble recovery rate vs 50 %, interceptions vs interception-worthy throws (2022+).

### 8.4 Field-goal make probability and FG over expected

Logistic regression on 2019 → prior-season field-goal attempts: distance (spline), roof / indoor, temperature, wind, surface. **Gate:** calibration within ±3 points in each 5-yard bucket on held-out 2025. FGOE = makes − Σ probability, and its percentage form.

### 8.5 Shrinkage, ceiling / floor, regression flags, trend

- Empirical Bayes: proportions (catch rate, success rate, TD rate) with a beta prior, means (YPRR, EPA/play) with a normal prior, both from the position-season distribution of qualified players. Used by the `shrunk` transform and the outlook; raw stays the default display.
- Ceiling / floor: 80th / 20th percentile of the player's weekly fantasy points this season (and last 16 games); boom / bust rates against position thresholds (top-12 / outside top-36 weekly finishes by position, top-24 / 48 for RB and WR).
- Regression flags: FPOE, TD − xTD and YACOE beyond a threshold, weighted by the metric's stability (§8.6). Worded as "running hot / cold vs expected", not as a promise.
- Trend: last 4 games vs season for snap, route, target, carry and opportunity share, with a role-change flag when the shift is beyond noise for that sample.

### 8.6 Stability

For each metric: year-over-year Pearson r among players qualified in both seasons (2019 → prior season), and split-half reliability within a season. Stored in the catalogue (`stability`) and shown as a reliability marker (high / medium / low) next to every stat. This is where the catalogue's §11 point becomes visible: volume and share metrics are sticky, efficiency and TD rates much less.

### 8.7 Profile models

RAS: each combine measure scored by percentile within position over all combines since 2000, averaged to a 0–10 scale (missing drills reduce the denominator, shown as partial). Speed Score = 200 × weight / 40-time⁴.

## 9. Screens (Plans AA–AE)

Layout and visuals come from Claude Design mockups (§9.6). This section fixes what each screen contains.

### 9.1 Navigation and standalone

- A **Stats** entry in the top navigation (`TopNav`, v0.24.0), always enabled, with its own sub-navigation: Players, Teams, Explore, Matchups, Saved views.
- With no league, the app opens on Stats; Setup stays available to import a league later. Fantasy screens stay disabled without a league, as today.
- Global controls on every Stats screen: season (2019 → current), season type, week range, scoring (My league / PPR / Half / Standard).

### 9.2 Stats home (Plan AA)

- Players and Teams leaderboards: position, team, qualified-only and family filters, search, sortable columns, a column picker over the catalogue (tiers core / extended).
- Every value: number, percentile bar, sample on hover, "est." marker, reliability marker, tooltip from the catalogue.
- **Custom views**: a named leaderboard (query + columns + sort) saved in `companion.db`; **CSV export** of any table.
- With a league: rostered-by badge, "my team" and "free agents" filters.

### 9.3 Team dashboard (Plan AB)

| Tab           | Content                                                                                                                                                                                 |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Overview      | Record, points for / against, Elo and SRS, adjusted EPA offense / defense with ranks, weekly EPA trend, next game (Elo + Vegas), key players.                                           |
| Offense       | Efficiency (EPA, success, explosives), passing and rushing splits, line yards, sack rate allowed, red zone and third down.                                                              |
| Defense       | Efficiency allowed, pass rush (pressure, sacks, blitz), coverage (man / zone, shell, EPA allowed), run defense (stuffs, line yards allowed), havoc, fantasy points allowed by position. |
| Special teams | Kicking, punting, returns, field position, FGOE.                                                                                                                                        |
| Situational   | Drives, red zone, third / fourth down, two-minute, by quarter and score state.                                                                                                          |
| Tendencies    | PROE, neutral pace, personnel and formation mix, motion, play action, RPO, screens; defensive personnel, box, blitz and coverage mix.                                                   |
| Players       | Snap, route, target, carry and air-yards distribution across the roster, by week.                                                                                                       |
| Schedule      | Game log with result, Vegas line, Elo probability, weather; remaining schedule with strength.                                                                                           |
| Forecast      | Short term: next game probability and spread (Elo vs Vegas). Long term: simulated wins, playoff odds, adjusted EPA trend, remaining schedule strength, luck indicators.                 |

### 9.4 Player dashboard (Plan AC)

A header (photo, team, position, age, experience, draft, injury status, fantasy rank under the chosen scoring) and tabs by position group:

| Group        | Tabs                                                                                   |
| ------------ | -------------------------------------------------------------------------------------- |
| QB           | Overview · Passing · Under pressure · Rushing · Game log · Splits · Forecast · Profile |
| RB           | Overview · Usage · Rushing · Receiving · Game log · Splits · Forecast · Profile        |
| WR / TE      | Overview · Usage · Receiving · vs Coverage · Game log · Splits · Forecast · Profile    |
| K / P        | Overview · Kicking (or Punting) · Game log · Profile                                   |
| DL / LB / DB | Overview · Pass rush · Coverage · Run defense & tackling · Game log · Splits · Profile |

- Overview: 6–8 core cards with percentiles, weekly fantasy points vs expected, season line, career line.
- Splits: home / away, by opponent, last N, by quarter and score state, and the play-grain splits the position supports (pressure, coverage, formation, personnel, with / without a teammate on the field).
- Forecast (offense): short term — next opponent's adjusted defense against the position, Sleeper / FantasyPros projection, ceiling / floor; long term — trend and role change, regression flags, rest-of-season projection and schedule strength, the stability-weighted profile.
- Profile: bio, combine with position percentiles, RAS, Speed Score, career by season.
- The fantasy slide-over gains **Open stats dashboard**; the dashboard links back to the fantasy panel when a league exists.

### 9.5 Explore and matchups (Plans AD, AE)

- **Chart explorer:** any metric against any other, players or teams, scatter with league-average quadrant lines, labels, size or colour by a third metric, filters as the leaderboard, click a dot to open the dashboard.
- **Compare:** 2–4 players or teams side by side, every metric with percentiles, and a weekly overlay chart.
- **Multi-season trends:** a metric by season for a player or team (2019 → now), with year-over-year deltas and age context.
- **Matchup preview** (Plan AE): any game; both teams side by side, each offense against the opposing defense by phase (pass, rush, pass rush vs protection, coverage vs receivers), Elo and Vegas forecast, weather, key player matchups.

### 9.6 Design

The global overhaul shipped on 2026-10-16 as the Edition redesign (v0.24.0, fantasy screens only). The stats screens are mocked in the same Claude Design project in the Edition language, with invented demo data, while Plans X–Z build the data layer, and implemented from the approved mockups. The brief in `docs/design/2026-10-15-stats-section-brief.md` lists what they need from the shell and components. Charts follow the dataviz skill (one palette system for categorical, sequential and diverging scales, light and dark).

## 10. Toward natural-language queries (later spec)

Built now, so NLQ later is translation only:

- the query engine (§7) with its JSON Schema as the tool definition;
- catalogue descriptions written to be read by an LLM, plus a dimension glossary (what "pressure", "neutral situation", "route" mean here, and their season coverage);
- results that carry samples and caveats, so an answer can state them;
- every query logged in the worker (development only) as a corpus of real questions.

## 11. Testing

- Unit tests per source mapping, per counting view, per catalogue expression (fixtures of a few plays / weeks).
- **Agreement gates** on real data: our player-week counts against nflverse `stats_player` (targets, carries, receptions, yards ≥ 99.9 %), snaps against `snap_counts` (as Plan V), FPOE components against ffopportunity, team EPA against nflverse team stats.
- **Model gates**: Elo Brier (§8.1), FG calibration (§8.4), stability computed and plausible (target share r > TD rate r).
- **Performance budgets** on the full database: dashboard first paint ≤ 300 ms, leaderboard ≤ 500 ms, situational play-grain query ≤ 1 s, derived rebuild of the current season ≤ 30 s, backfill ≤ 10 min, file ≤ 400 MB.
- Packaged Windows gate (§3.3) and a packaged smoke test at each release (the worker opens the file and answers a query).

## 12. Plans

| Plan | Scope                                                                                                                                                                                                                        | Version |
| ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| X    | DuckDB gate; analytics worker; raw layer (§4) with every current source, plays, play players, on-field; identity; audit fixes 1–4; interrupted-run sweep; standalone sync; backfill; agreement gates; `warehouse.db` retired | v0.25.0 |
| Y    | Derived tables (§5), catalogue (§6), query engine (§7), fantasy scoring presets and league-rules xFP, IPC                                                                                                                    | v0.26.0 |
| Z    | Models (§8): Elo + simulation, adjusted EPA, SRS / Pythagorean / luck / schedule, FG model, shrinkage, ceiling / floor, flags, trend, stability, RAS / Speed Score                                                           | v0.27.0 |
| AA   | Stats navigation + standalone launch, leaderboards, custom views, CSV                                                                                                                                                        | v0.28.0 |
| AB   | Team dashboard                                                                                                                                                                                                               | v0.29.0 |
| AC   | Player dashboard (all positions) + slide-over link                                                                                                                                                                           | v0.30.0 |
| AD1  | Compare (players and teams), multi-season trends, Explore                                                                                                                                                                    | v0.34.0 |
| AD2  | Chart explorer                                                                                                                                                                                                               | v0.35.0 |
| AE   | Matchup preview                                                                                                                                                                                                              | v0.36.0 |

X, Y and Z have no visible UI change beyond a working warehouse; they run while the design overhaul finishes. Each plan is written when the previous one ships, so later plans use what was learned. v0.31.0–v0.33.0 went to dev mode and its notes, so AD (split in two, §22) and AE moved up.

## 13. Out of scope

- Our own fantasy projection model (follow-up spec; it must beat Sleeper's projections in a 2019–2025 backtest to ship).
- Natural-language queries (own spec after AE).
- Paid sources, college data, tracking research models, IDP scoring in the fantasy pipeline.
- Changing the existing fantasy pipeline's storage (it keeps SQLite and its two-season tables).

## 14. Risks

- **Native module packaging** (§3.3), gated first.
- **Current-season gaps**: participation (on-field, routes, coverage, pressure) only through the prior season; the UI states it and uses the documented estimates.
- **Size and backfill time** on the user's Windows machine: measured in Plan X against §4.4 targets.
- **Scope**: eight plans. Each ships on its own, and the order puts the data and engine first so the screens are thin.

## 15. Amendment 2026-10-16: the DuckDB foundation (Plan X)

Measured on the live sources while Plan X was written (its Planning findings), and taken into the build. `docs/reference/stats-database.md` documents the result.

- **A. One step per source.** FTN and participation are their own steps and tables, joined to play-by-play by the `plays` view instead of inside the worker. The per-source due-ness that Plan V needed inside one step is gone.
- **B. Table set (§4.1).**
  - QBR is `src_qbr_week` and `src_qbr_season`.
  - Depth charts are `src_depth_charts` (weekly rows, through 2024) and `src_depth_chart_snapshots` (2025+), read through the `depth_chart_week` view.
  - There is no `src_ff_opportunity_team`: the team totals stay as `*_team` columns of `src_ff_opportunity`, and Plan Y derives team rows.
  - Added: `src_sleeper_players` (each Sleeper id's name and position, for identity) and `play_players`.
- **C. Standard columns** are `season`, `season_type` and team codes normalised in place. Id columns keep their published names. ESPN's nickname column moves to `team_name`.
- **D. Zeros are kept, and types widen** when a season disagrees: two integer types to `BIGINT`, other numbers to `DOUBLE`, anything else to `VARCHAR`. The step message names the column (`goal_to_go` in 2020). `season` and `week` are `INTEGER` in every table.
- **E. Play-by-play keeps 234 of its 372 columns** (§4.2 said about 120), including `desc`. Dropped by pattern: running home/away totals, win-probability copies, score-type probabilities, clock strings, names and jerseys, per-tackler team columns, and game-level copies already in `games`. That halves `src_pbp` (211 → 106 MB).
- **F. `play_players`** holds about 2.9 rows per play (1.0 M rows for 2019–2026).
- **G. Identity (§4.3).**
  - `sleeper_ids` resolves a Sleeper id by the crosswalk, then nflverse rosters' `sleeper_id`, then a name + position-group match among nflverse players active that season, only when exactly one matches.
  - `combine_ids` resolves by PFR id, then name + draft year, then name + rookie season.
  - The name key spells out nicknames and compares positions by group (OL, DL, LB, DB). The fantasy resolver uses the same key.
  - A name match never takes a gsis already linked to another Sleeper id (in `sleeper_ids` and in the fantasy resolver).
  - Measured: 3,002 of 3,007 Sleeper players with points mapped, and 71 of the 95 id-less combine rows resolved.
- **H. Engine settings.** `memory_limit` 512 MB (256 MB fails on play-by-play), 2 threads, insertion order not preserved.
  - The backfill: 135–140 s, 283–285 MB, peak process memory 1.8–2.0 GB.
  - A forced daily refresh: 12 s and 0.8 GB, and the file stays at 301–306 MB.
- **I. Logging.**
  - Steps log as `stats:<source>[:<season>]` in `stats.duckdb`'s own `sync_log`.
  - `stats:state` logs a failed NFL-state fetch; `stats:identity` logs the identity and views rebuild.
  - `interrupted` marks steps a closed app left `running`.
- **J. Retirement and launch.** `warehouse.db` is deleted on the first launch of v0.25.0 (nothing read it). Stats refresh at launch when no league exists, and after every refresh or league import otherwise.
- **K. CI.** `--stats-self-test=<file>` runs in the Release workflow and in a `Package check` workflow (`workflow_dispatch`, or a push to `check/**`).
- **L. From the final review.**
  - Sleeper defenses are told apart by their letter ids: players with 1–3 digit ids (Rodgers, Brady, Stafford) had been filed as defenses. The Sleeper source is at version 2.
  - Quitting closes the worker first (abort the download, interrupt the statement), because Electron aborts if the process exits mid-statement. Interrupted steps are retried on the next run.
  - Team columns are normalised in place in every source (`depth_charts` version 2).
  - Sleeper stat keys that are not plain identifiers are dropped. The self-test also checks `read_json` and ICU.

## 16. Amendment 2026-10-17: the metric layer and the query engine (Plan Y)

Measured on the live database while Plan Y was written (its Planning findings), and taken into the build. `docs/reference/stats-database.md` documents the result.

- **A. Building the derived tables (§5.2).** One season at a time, each source into a temporary table first, on one thread (two threads need more than the 512 MB limit to write `player_week`'s ~230 columns). Each season is one transaction (delete, insert), instead of swapping whole tables. The first build takes about 25 s, a forced daily refresh's about 1.5 s. A source or column that is missing reads as NULL.
- **B. Percentiles and ranks are computed by the engine (§5.2, §7.2)**, among the qualified rows of the query's own population (same position, same group). `player_season` holds sums only. Any week range, scoring or split then ranks correctly.
- **C. Fantasy tables.** `fantasy_week` has one row per player-week and scoring (`ppr`, `half`, `std`, `league`), and `team_fantasy_week` holds the points each defense allowed by position. The presets are Sleeper's current defaults. Sleeper's stored `pts_*` follow older defaults in past seasons, so the gate is "the SQL scoring equals the app's scoring engine". Sleeper's single 50+ field-goal bucket before 2024 counts as 50–59. The team rows of ffopportunity (§15 B) are not needed.
- **D. The query (§7.1).**
  - It gains `scoring`.
  - Plan Y's transforms are `raw`, `perGame`, `percentile`, `zScore` and `vsLeague`. `shrunk` and `opponentAdjusted` come with Plan Z's models. `perPlay` is dropped: the rates already are per play.
  - The JSON Schema is written by hand, typed so that the compiler fails if it and the type drift apart.
- **E. Qualification.** `minSample` is per 17 games, scaled to the weeks a row covers (about one game per opponent row) and, at the play grain, to the share of plays each row keeps: its situation and play-dimension group, counted among its teams' plays when the query filters teams or players on the field.
- **F. The catalogue (§6.2)** has 259 metrics (177 player, 82 team); 162 can be split by situation. Left out or changed:
  - The EPA + CPOE composite needs league standardisation and moves to Plan Z.
  - Slot / wide / inline rates are out: participation lists positions, not alignment.
  - Coverage EPA per defender is out: play-by-play does not name the covering defender, so coverage comes from PFR.
  - Defender pressure rate uses pass snaps (opponent dropbacks on the field), since participation does not say who rushed.
  - Two-minute and long-down snap shares are out.
  - Red-zone TD % becomes the TD drive rate.
- **G. Routes** are dropbacks on the field (blocking included), exact through the prior season and estimated in the current one (§6.2).
- **H. Season sources.** NGS and QBR season values come from their season rows. Postseason weeks of NGS, QBR and Sleeper are mapped to nflverse's numbering.
- **I. Reads never wait (§2).**
  - Queries and the status run at once, each on its own connection, so a timeout interrupts only its own query. Refreshes and league rules take turns. A rebuild runs DuckDB on one thread, reads included.
  - A query is interrupted after 5 s.
  - Main sends the league's scoring rules before each refresh and on every rules change. Only a change rebuilds the fantasy tables (about 2.5 s).
- **J. Sync.** `stats:derived` follows `stats:identity`. It rebuilds the seasons whose rows changed, and the current season for an all-seasons file.
- **K. QBR's season type** was ESPN's "Regular" / "Playoffs"; it is now REG / POST (source version 2).
- **L. The self-test** also answers an engine query (§11: the packaged worker answers a query).

## 17. Amendment 2026-10-18: the models (Plan Z)

Measured on the live database while Plan Z was written (its Planning findings), and taken into the build. `docs/reference/stats-database.md` documents the result.

- **A. The models step.** `stats:models` follows `stats:derived` after every successful rebuild, after a `MODELS_VERSION` change, and until a run succeeds. It writes `elo_games`, `team_forecast`, `team_model_week`, `player_model_week`, `player_profile` and `metric_stability`.
  - A first build takes about 40 s: the simulations about 20 s, stability about 20 s.
  - A daily refresh's takes about 4.5 s.
- **B. The engine reads models as components (§6.1, §7).**
  - `{last:x}` is a model state at the end of the scope: a team's Elo, ratings and odds, or a player's combine profile.
  - Model sums (expected wins, FG model, turnover luck) join like the fantasy components.
  - `{p80:fp}` and `{p20:fp}` are weekly quantiles, so those metrics read the weekly tables.
  - The catalogue gains 65 metrics: 324 in all, 204 for players and 120 for teams.
  - It serves each metric's stability (`MetricInfo.stability`).
- **C. Elo (§8.1).**
  - Home field is 0 at a neutral site and in 2020. A tie moves nothing (ln 1 = 0).
  - The market's probability is the no-vig moneyline, else the spread with a 13.5-point spread of margins.
  - Measured Brier 2021–2025: Elo 0.224, Vegas 0.211.
- **D. Season simulation (§8.1).**
  - The tiebreakers add strength of victory and of schedule: those decided 2023 (GB / SEA) and 2024 (LA / SEA). With them, the final regular-season week reproduces every playoff field and bye 2019–2025.
  - Divisions are a fixed map: the database has no teams table.
  - Each run wins a game with its Elo probability; the margin for the in-run update is drawn around the Elo spread.
  - It runs as of every regular-season week, cached: 2,000 runs for a sealed season's weeks, 10,000 for the current season's, whose latest week runs again each time. The postseason keeps the end-of-season odds.
- **E. Adjusted EPA (§8.2).**
  - The ridge's prior is 300 plays per team effect. It was chosen by predicting each next week's game EPA, 2019–2025: RMSE 0.2138, against 0.2239 for the league mean alone.
  - It is fitted as of every week, for all plays, dropbacks and other runs, plain and recency-weighted.
- **F. Ratings, luck and schedule (§8.3).**
  - SRS is solved directly. Iterating oscillates on a week-1 schedule, where every team has played once.
  - Elo luck is wins minus the sum of the Elo probabilities.
  - Schedule strength (played and left) is the mean current Elo, or adjusted EPA margin, of the opponents.
  - Interception luck (FTN, 2022+) compares interceptions with the interception-worthy throws × that season's league rate: FTN's charting changed (0.44 an interception-worthy throw in 2022, 0.69 in 2025).
- **G. FG model (§8.4).**
  - Distance is a spline with a knot every 5 yards from 25 to 55. A season weighs half as much as the one two seasons after it: kickers improved from long range.
  - **The gate changes.** A one-season 5-yard bucket carries 2–9 points of noise, so ±3 points in every bucket fails even for a calibrated model. The gate is Hosmer–Lemeshow over the eight buckets of held-out 2025 (p ≥ 0.05), and the season total within ±3 points.
  - Measured: χ² 9.8 (critical 15.5), total +2.1 points.
- **H. Shrinkage (§8.5).**
  - Proportions and means take one formula: (s·v + k·μ) / (s + k). s is the sample, μ the qualified rows' sample-weighted mean, and k the metric's stability prior: the sample at which split halves say half of the rate is signal (the beta and normal priors of §8.5 in one form).
  - It applies to rates only; for anything else, a note says it was not shrunk.
- **I. The player outlook (§8.5)** is a read of its own (`outlook`), not a query:
  - ceiling and floor this season and over the last 16 games;
  - boom and bust rates;
  - trend: the last four games against the games before. Its z uses the player's own weekly spread, because a binomial test flagged every small move (snaps and routes come in series). A role change is |z| ≥ 2.
  - regression flags: the expected move back, (1 − r)(v − μ) with r the year-to-year stability, of at least one position standard deviation;
  - the remaining schedule: the opponents' fantasy points allowed to the position, against the league.
  - A `games` read lists a season's games with Elo and the market.
- **J. Stability (§8.6).**
  - It is computed within each position and pooled, and needs 30 pairs. Reliability is high from r 0.6, medium from 0.35.
  - It is measured again when a past season changes (the weekly prior-season refresh), in about 20 s.
  - Measured: 305 metrics. Target share r 0.68 > TD over expected 0.07; WOPR 0.70 > FPOE 0.20.
- **K. Transforms (§7.1).**
  - `shrunk` (H).
  - `opponentAdjusted`: the value minus the sample-weighted average of how much more than the league each opponent allowed, in the same metric and position. It is one step, not iterated, on the weekly rows. It applies to rates only: a count's total is not comparable with the league's.
- **L. Profile (§8.7).**
  - Combine scores are mid-rank percentiles: ties share the middle, so a common 4.50 forty is not scored the slowest.
  - The score is named "Athletic score (RAS-style)". It averages raw measures, so it is not Kent Lee Platte's RAS (DK Metcalf: 7.2 here, 9.07 there). It needs four measures.
- **M. The EPA + CPOE composite** (moved from Plan Y) averages the two in standard deviations of qualified 2019–2025 QB seasons, with fixed norms.
- **N. Plan Y follow-up.** At the week and season grains, a counted component a player never had (carries for a receiver) read NULL, so sums of components did too (touches, opportunity share, ANY/A). Play-by-play and box-score components now read 0. FTN, participation, NGS and PFR stay NULL: there, NULL means "not measured".

## 18. Amendment 2026-10-20: the Stats screen (Plan AA)

Decided with the user and measured on the live database while Plan AA was written (its Planning findings), and taken into the build. `docs/reference/stats-screens.md` documents the result.

- **A. Two products (§9.1, §9.6).** Stats follows the approved design handoff (2026-10-16, "Companion Stats"), not a `TopNav` entry: its own shell, cobalt palette and nav (Leaderboards · Players · Teams · Games · Glossary).
  - The Fantasy nav gains "Stats ↗"; the Stats nav has "Fantasy ↗", which opens Setup when no league is imported.
  - Games stays disabled until a later plan; Explore and Matchups join the nav with Plans AD and AE.
  - Saved views are a Views menu on the leaderboards and chips on the home, not a nav item.
- **B. The home (§9.2)** is the handoff's eight boards (top six, Totals / Per game, my players marked, my best one under a dashed line when outside the top six). A row needs half the regular-season games in range on top of the metric's qualification. A row or "All →" opens the full leaderboard sorted by that metric.
- **C. The leaderboard table** is the handoff's Ledger (round 1, 3d).
  - The percentile is the cell's shading in seven steps, not a bar; a neutral metric is unshaded. The percentile, rank and sample are in the cell's hover.
  - The reliability marker sits in the column head, since stability is a metric's, not a value's; so does the catalogue entry, on hover.
  - The games column is the row's games: `perGame` of the games metric reads 1.
- **D. Qualification is the tab's.** A count's sample is its games, with no minimum, so "qualified only" changed nothing on 8 of the 10 player tabs. Each tab qualifies a row on one metric's `minSample`, scaled as the engine scales it: QB dropbacks, RB carries, WR and TE targets, K field-goal attempts, P punts, defenders' defensive snaps, All offense's offensive snaps. 2025 measured: 38 of 82 QBs, 110 of 253 WRs. Teams always qualify. The table's percentiles and ranks are among the rows the tab qualifies, per position, so a count is not ranked among every player with a game.
- **E. The family filter** sets the columns to that family's core metrics on the tab (extended ones fill in to 12).
- **F. Custom views** save the board: entity, tab, columns, sort, per game, qualified only, team and owner filter. The season, weeks and scoring stay the screen's, so a view carries over from week to week. A name is unique regardless of case; saving under it replaces the view. Table `stats_views` in `companion.db` (migration 11).
- **G. Rosters.** Main keys the league's rosters by gsis id (`player_ids`) and team defenses by nflverse code (`stats.ownership`). My team and Free agents filter the engine's rows, so percentiles stay among the whole position. My players carry the amber dot, another team's a hollow ring naming it.
- **H. Samples in words.** `MetricInfo.sampleLabel` names what each of the catalogue's 78 samples counts ("routes", "dropbacks faced"), for the hover and for NLQ (§10).
- **I. CSV** holds every row the filters keep: unformatted numbers, percentages in percent, gsis ids. It is saved through a dialog (Downloads by default), in UTF-8 with a byte-order mark for Excel.
- **J. The scope** (season, season type, the regular season's weeks, scoring) is shared by every Stats screen for the session and not saved. Postseason and Both have no week range.
- **K. Measured** (2026 week 6): the home's eight boards on screen in about 90 ms, a leaderboard tab 100–210 ms from click to table, a 40-column query 265 ms (budgets 300 ms and 500 ms, §11).

## 19. Amendment 2026-10-20: the team dashboard (Plan AB)

Decided with the user and measured on the live database while Plan AB was written (its Planning findings), and taken into the build. `docs/reference/stats-screens.md` documents the result.

- **A. The handoff's team page is the dashboard's frame (§9.3, §9.6).** Its header (team select with ‹ ›, name and division place, the abbreviation, four tiles, a results strip) tops every tab, and its tables (who gets the targets, the carries, who throws) open the Overview. The spec's tabs follow in the Stats language. The handoff's Defense tiles give way to the spec's ratings; defense has its own tab.
  - Teams in the nav opens the dashboard on the team viewed last; the first time, on the team of my top fantasy scorer in range, else ARI. The team leaderboard is under "Team leaderboards →" and the home's "All →"; a team row there, or on a home board, opens the dashboard.
  - A share in the Overview's tables is of the team's total in range (handoff), not the engine's share of the games a player played.
- **B. Ranks are among the league.** Each tab asks for every team (one query per split) and finds the team's row. The dashboard ranks among the teams that qualify: a tie shares a rank ("T-3rd") and its percentile sits at the middle of the tie (30 teams with no special-teams touchdown are near the median, not last). A metric with no better side reads "11th highest" and is not shaded. The percentile is the handoff profile's pill on a track; the league's mean is beside the rank.
- **C. Two-minute (§7.1).** The engine gains `situation.twoMinute`: the last two minutes of the second and fourth quarters. The Situational tab splits by red zone, two-minute, leading by 9+, within 8, trailing by 9+ and quarter, each ranked among the 32 in the same split.
- **D. What the data cannot give (§9.3).**
  - Red-zone TD % is the TD drive rate (as §16 F), with red-zone EPA and success beside it.
  - Coverage shell, formation mix and defensive personnel have no metric: man / zone rate and EPA, shotgun rate, personnel groupings, box count and blitz rate stand in. Participation's columns (pressure, coverage, personnel) end with the prior season, and a line says so.
  - The Players tab covers QB, RB, WR and TE.
- **E. Schedule and Forecast.** Games come from `stats.games`: result, Elo and market probability, the line, weather, and the opponent's Elo before the game as its strength (1550 and up hard, 1450 and below easy). The Forecast charts playoff and division odds and adjusted EPA as of each week.
- **F. Charts** are drawn as SVG (no chart library): a line per series in the handoff's `--s1` / `--s2`, checked with the dataviz validator for colour-blind separation (the dark values moved into the dark lightness band: `#5d8ff2`, `#26a092`), gaps for byes, end labels and a hover with every series that week.
- **G. Teams' names and divisions** live in `src/shared/stats/nflTeams.ts`; the season simulation reads its divisions from there. A division place is the regular season's win %, then margin (an approximation of the tiebreakers).
- **H. Measured** (2026 week 6): each tab's queries 25–120 ms, the eleven of Situational 145–170 ms; in the app, Teams 140 ms from click to the Overview and a tab 65–275 ms (budget 300 ms, §11).

## 20. Amendment 2026-10-21: paired sums (v0.29.1)

Found while checking Plans AA and AB on live data. Sources are published at different times: play-by-play the night of a game, snap counts, PFR and ffopportunity a day or two later. §5.1's sums divide over every week in scope, so until a week's snap counts were out, its targets counted against the earlier weeks' routes: 130 of 145 receivers targeted in 2026 week 6 had no routes yet, and targets per route read 41.7 % for a receiver at 26.2 %.

- A rate whose two sides come from different sources divides **paired sums**: the plays' side summed only over the weeks where the other side is known (`<base>__<when>`, `src/main/stats/derived/paired.ts`). That covers TPRR, YPRR, first downs per route and route participation (with routes); bad-throw %, PFR pressure %, broken tackles per touch, pressure rate and blitz rate (with PFR); FPOE and expected points per game (with ffopportunity).
- At the play grain, a target pairs with routes when participation lists the play's players.
- Broken tackles per touch counts a missing PFR side as 0: it was blank for the receivers without a PFR rushing row (52 of 112 qualifying 2025 WRs).
- `DERIVED_VERSION` 2: the first refresh after the update rebuilds the derived tables and the models (about 50 s), then measures stability again.

## 21. Amendment 2026-10-21: the player dashboard (Plan AC)

Decided with the user and measured on the live database while Plan AC was written (its Planning findings), and taken into the build. `docs/reference/stats-screens.md` documents the result.

- **A. The handoff's player profile is the dashboard's frame (§9.4, §9.6).** A rail (the nine positions, a search, a rank-by metric, the qualified players best first with the value shaded by percentile; ↑ / ↓ or J / K) beside the profile: a header with Sleeper's headshot (initials when it does not load), the handoff's tiles and percentile rankings opening the Overview, then the spec's tabs by position group.
  - Players in the nav opens it on the player viewed last; the first time, on my top fantasy scorer in range, else the leading WR. With a league, the default waits for the rosters (the team dashboard's too: no flash of the first team). Picking a position in the rail opens its leader.
  - The player leaderboards are under "Player leaderboards →" and the home's "All →". A player row there, on a home board or in a team dashboard's tables opens the dashboard.
  - The name is the one he goes by (nflverse's `first_name` is the legal one: John for Matthew Stafford). His age is his age that season.
- **B. Ranks are among the position.** Each line asks for every player at his position and ranks him among those his position's leaderboard qualifies (§18 D) who also meet the metric's own sample, "4th of 110"; ties as §19 B. Below the qualifier, values without ranks. "Lg" is the qualified players' mean.
- **C. Splits (§9.4, §7.1).** The engine gains `scope.home` (home or road games; qualification counts half the weeks). The Splits tab: all, home, away, last 4 games, each quarter and down (one grouped query each), red zone and score state, then pressured and clean pocket, blitzed or not and play action (QB) or man and zone (WR, TE); each cell ranked among the position's qualified players in the same split. Then his rows by opponent, and with and without a teammate on the field (participation; receivers and backs first in the list, a lineman on for every snap leaves "without" empty). `situation.withoutOnField` now counts only plays participation lists: before, every play of the current season (no participation yet) counted as one without him.
- **D. The game log** reads his weekly rows with their opponent and each result from the side of the team he played for that week. A week without his row is a bye, or "Did not play", for the team he played for nearest that week. 69 of 190,218 played player-weeks (0.04 %) have no team in `player_week`; the log takes the team of his nearest game.
- **E. Forecast (offense).** The next game and its defense against the position, ranked among the 32 with the handoff's matchup tone (a stingy defense reads red). With a league and in the current season, Fantasy's file gives Sleeper's projection of the next game, the rest of the season and its rank, and FantasyPros' rank (the league's scoring); without one, a line says a league adds them. Then §8.5: the range of outcomes, role (the last 4 games against the games before), running hot or cold, the schedule from here, and the core rates raw and shrunk (the stability-weighted profile).
- **F. The status now** comes from a new read, `stats.player`: the latest roster week's reserve list (`src_rosters` R01 / R48 injured reserve, R04 PUP, R05 non-football injury, R40 suspended, another RES "Reserve") or the latest week's injury report (Out, Doubtful, Questionable; a missed or limited practice before a game status). The latest season only. Fantasy's Sleeper injury status is not used: Stats works without a league.
- **G. The two products link (§9.4).** The player file gains the handoff's "Full stats ↗" (a team defense opens its team dashboard). The dashboard gains the handoff's owner chip ("On your fantasy team", "Rostered by …", "Free agent in your league"), which opens his Fantasy file, for QB, RB, WR, TE and K only (no IDP in Fantasy, §13). The ids map through the league's `player_ids` (`stats.link`).
- **H. What the data cannot give.** A line a source left a player out of says so ("No NFL Next Gen Stats value for him.": NGS and ESPN QBR publish players over their own minimums); a split whose source has nothing for the season says "Not published for 2026 yet." or "Charted from 2022.". Compare stays disabled until Plan AD. Counts are totals (no per-game switch on the dashboard).
- **I. Measured** (2026 week 6): each tab's queries 21–137 ms, Splits (10–16 queries) 181–342 ms, Forecast 197–252 ms with the outlook; in the app, Players 230–290 ms from click to the Overview, a tab 70–135 ms, Splits 265–480 ms, a rail position 135–275 ms (budgets 300 ms, and 1 s for situational queries, §11).

## 22. Amendment 2026-10-24: Explore, Compare and Trends (Plan AD1)

Decided with the user (2026-10-23 and 2026-10-24) and measured on the live database while Plan AD1 was written (its Planning findings), and taken into the build. The design is the "Stats Explore" canvas and its handoff (`docs/design/2026-10-23-stats-explore-handoff/`); `docs/reference/stats-screens.md` documents the result.

- **A. Explore (§9.5, §9.1).** One nav item between Teams and Games. Its sub-tabs at the left of the bar: Chart (the chart explorer, Plan AD2), Compare, Trends, each keeping its state for the session. AD is split: AD1 Compare and Trends, AD2 the chart explorer.
- **B. Compare** is three slots (not 2–4): the handoff's player compare at one position, and the same layout for teams.
  - Players: the position leaderboard's groups, each cell ranked among the position's qualified players who meet the metric's own sample (§21 B); counts per game or totals. Teams: Offense, Defense, Special teams, Situational, among the 32.
  - The best value of a row is bold and counts toward "Leads n of m" (none on a tie between every slot, or a metric with no better side).
  - Defaults: the position's top three by its leaderboard's sort, my best player in slot 3 when none of mine is there; teams by Elo. A dashboard's Compare seeds that player and the position's top two, or that team and the two teams nearest it in Elo.
  - A weekly chart: fantasy points (players), EPA per play offense or defense (teams), the pool's median each week dashed; lower-is-better upside down.
- **C. Trends.** A metric by season, 2019 → now, for a player or a team and up to two more of the same position. One query over the position grouped by season gives the lines, the position's qualified median and 25th–75th band, and each season's rank among that season's pool. A season below the qualifier is a hollow point and a faded row. Team changes and his age under each season; the change from the season before toned by the better side; six core metrics at a glance as percentile sparklines; coverage notes ("Charted from 2022.", "Not published for 2026 yet.", "Estimated for 2026."). One season: "Trends need two seasons". The age curve (§9.5 "age context") is deferred: it needs a typical value by age that the engine does not serve yet.
- **D. Qualification by season (§7.2).** A query grouped by season (not by week) qualifies each season against its own weeks. Before, every season was held to the average of the seasons in scope: 2026 week 7 qualified 48 of its 98 WRs (QBs 20 of 34, DBs 44 of 158).
- **E. Catalogue (§6.2).** Red-zone TD rate for teams, both sides (`off_rz_td_pct`, `def_rz_td_pct`: touchdown drives among drives with a snap inside the opponent's 20; the try after a touchdown, snapped from the 15 or the 2, does not count); `team_week` gains the drive counts, `DERIVED_VERSION` 3 (one rebuild, about 25 s). 2025: 57.2 % on average (43.5–68.3 %). A defense's sack and pressure rates are named for what it does ("Sack rate (defense)", "Pressure rate (defense)"), not "allowed".
- **F. Entry points.** The player and team dashboards' Compare buttons; a stat line's trend icon (on hover or focus; not on split lines) opens Trends on its metric.
- **G. Charts.** Every series has its own marker shape (circle, square, diamond) as well as its colour; --s3 joins the series colours. --s1 and --s2 stay (the user chose shapes over a new --s2 for colour-blind separation).
- **H. Measured** (2026 week 7): in the worker, Compare's query 21–89 ms (nine positions and the teams), its weekly chart 12–37 ms, Trends' query over a position's eight seasons 44–188 ms, the derived rebuild 25.5 s; in the app, Explore to Compare on screen 160–205 ms, a position or Players / Teams 135–185 ms, the Trends tab 245–255 ms, a new metric 220–290 ms (budget 300 ms, §11).

## 23. Amendment 2026-10-25: the chart explorer (Plan AD2)

Decided with the user (2026-10-23 to 2026-10-25) and measured on the live database while Plan AD2 was written (its Planning findings), and taken into the build. The design is the "Stats Explore" canvas and its handoff, section "15. Chart explorer"; `docs/reference/stats-screens.md` documents the result.

- **A. The chart explorer (§9.5)** is Explore's first tab: Explore opens on it the first time. Players at one of the rail's nine positions, or the 32 teams; any metric with a season grain (core or extended) on either axis, a metric with no better side too. One query over the position (or the 32) per choice of axes, size and colour; counts per game or totals for players, never per game for teams (§22).
- **B. Presets** per position, a volume against an efficiency (WR and TE: targets per game against yards per route run, targets against air-yards share; QB: attempts against EPA per dropback, CPOE against EPA per dropback; RB: carries against RYOE per carry, carry share against target share; K, P, DL, LB, DB one each), and the teams' offense against defense EPA per play and pass against rush EPA. "Pressure vs sack rate" from the handoff is not a preset: pressure rate is published through the prior season only, so it would open on an empty chart in the season in progress (user, 2026-10-25). Choosing an axis by hand leaves the preset.
- **C. Qualified and ranked.** A dot qualifies when the row meets the position's leaderboard qualifier and each axis's own sample; "Qualified only" (on by default) hides the rest. Percentiles (chips, size, colour) are among the position's qualified players who meet the metric's own sample, as Compare's (§22 B). The quadrant lines are the qualified mean of each axis (not the league average §9.5 said), and r is computed with both axes oriented, so positive is better on both.
- **D. Orientation.** A lower-is-better axis runs reversed and is marked "↓": up and right is always better, and the corners say so in words ("High volume, efficient"; teams "Good offense, good defense").
- **E. Filters.** A team (only its dots; the axes and means stay the position's), qualified only, my players (ringed, with a league), and a search that rings and labels the dots it finds. The leaderboard's owner filter is not repeated.
- **F. Picks.** Shift-click (a dot or a table row) picks up to three; "Compare these" opens Compare with them in its slots. No lasso (user, 2026-10-25). A click opens the player's or team's dashboard.
- **G. States.** Fewer than 10 dots: "Too few qualifiers to chart", with the full range of weeks and "Show all" when they would help. An axis the season lacks: "Pressure rate is not published for 2026 yet." with the season before, or "… starts in 2022.".
- **H. Measured** (2026 week 7): every preset's query 15–47 ms in the worker (with size and colour 32 ms), 30–167 qualified dots; in the app (three runs), Explore to the chart on screen 60–106 ms, a position 41–105 ms, Teams 28–70 ms, Compare from the picks 85–92 ms (budget 300 ms, §11).

## 24. Amendment 2026-10-27: Games and the matchup preview (Plan AE)

Decided with the user (2026-10-27) and measured on the live database while Plan AE was written (its Planning findings), and taken into the build. The design is the "Stats Games" canvas, built on the handoff's "9. Game"; `docs/reference/stats-screens.md` documents the result.

- **A. Games (§9.1, §9.5).** The matchup preview lives in the Stats nav's Games item, not a separate Matchups item (user, 2026-10-27). A rail of a week's games: the shared scope's season, the screen's own week (the next game's at first, else the last played), my games first with the amber dot, then by kickoff, and the teams on a bye. Any game opens a Preview; a final game also has the handoff's Box score and opens on it.
- **B. The preview.** The header: each team's record, Elo and last four results before the game, and its Elo win probability (its score once final). The forecast: Elo against the market's no-vig probability and whether they agree; the spread (the market's and Elo's), the total and each team's implied points; the conditions. Phase by phase: each offense against the other defense over the weeks before the game (week 1 reads the season before, a postseason game its regular season; 2019 week 1 has nothing before it and says so): adjusted EPA, success and explosive-play rate; EPA and success per dropback; EPA per carry and stuff rate; sack and pressure rate (protection against the pass rush); red-zone TD rate and third-down rate. Each side is ranked among the 32 on its own better side; the bar leans toward the side with the edge (the offense's percentile minus the defense's), and the biggest edge is said in words. §9.5's "coverage vs receivers" is the passing rows and the receivers' key matchups: coverage is charted through the prior season only.
- **C. Key matchups** (user, 2026-10-27). Each team's QB, RB, two WRs and TE by fantasy points before the game, chosen among the players of its last game (a player out does not lead; a final game: its box score), against the other defense's rank in fantasy points allowed per game to the position (1st the toughest; the handoff's tones: 11th or better bad, 22nd or worse good). Then the other defense's leading pass rusher (sacks, then QB hits) against the line's sack rate. No receiver–cornerback pairs: participation ends with the prior season.
- **D. With a league** (user, 2026-10-27): my players marked, and Sleeper's projection for the week from Fantasy's file (regular-season games not played yet); a final game shows the points each scored. Without one, a line says a league adds them.
- **E. The box score** (handoff "9. Game"): the top five fantasy performances; passing, rushing and receiving per team; the kicker's field goals; the defense's sacks and touchdowns (its defenders' sums) and takeaways (the team's: the opponents' interceptions and lost fumbles; a defender's fumble recoveries include his own team's). No extra points (the catalogue has their rate only) and no team-defense fantasy points (Stats scores no D/ST).
- **F. Kickoff (§8.1).** `stats.games` gains each game's `kickoff` (UTC, from nflverse's Eastern `gameday` and `gametime`); the screens show it in the machine's time zone.
- **G. Narrow queries.** DuckDB ranks every metric in its own window step, 10–30 ms each even over a few dozen rows: a 19-metric box score took 279–365 ms as one query and 114–135 ms as three narrow ones at once. Games splits its wide queries that way: the matchup into offenses, defenses and fantasy points allowed; the box score into passing, rushing and receiving, and the rest.
- **H. Measured** (2026 week 7 data, week 8 next): every game of 2026 weeks 1–8, 2025 (every fourth week and the postseason) and 2019 weeks 1–2: a preview's queries at once 84–204 ms (median 142), a box score's 64–132 ms; every team had its five key players, a pass rusher and matchup ranks. Weather is thin: none for games not played yet, none in 2026 since week 5 (45 of 272 games), 107 of 284 in 2022. In the app (three runs): Games on screen 219–225 ms from click (342 ms the first time after launch), another game 37–42 ms, a final week's box score 141–156 ms, the Preview tab 29–44 ms (budget 300 ms, §11).
