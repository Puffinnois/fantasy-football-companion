# Stats analysis — design

**Date:** 2026-10-15 · **Status:** approved 2026-10-16, amended 2026-10-16 (§15: Plan X) · **Plans:** X (DuckDB foundation), Y (metric layer + query engine), Z (models), AA (Stats screen), AB (team dashboard), AC (player dashboard), AD (explore: charts, compare, trends), AE (matchup preview); natural-language queries get their own spec after AE.

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
| AD   | Chart explorer, compare, multi-season trends                                                                                                                                                                                 | v0.31.0 |
| AE   | Matchup preview                                                                                                                                                                                                              | v0.32.0 |

X, Y and Z have no visible UI change beyond a working warehouse; they run while the design overhaul finishes. Each plan is written when the previous one ships, so later plans use what was learned.

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
