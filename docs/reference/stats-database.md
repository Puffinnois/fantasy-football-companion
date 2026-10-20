# Stats database — data reference

Added in v0.25.0 (Plan X; spec `docs/superpowers/specs/2026-10-15-stats-analysis-design.md` §2–§4, amended in §15). It replaces the SQLite stats warehouse of v0.20–v0.24 (`warehouse.db`, deleted on the first launch of v0.25.0). Every stat the free, keyless sources publish, 2019 through the current season, in a DuckDB file, `stats.duckdb` beside `companion.db`. Deleting the file makes the next refresh rebuild it in about 2½ minutes.

v0.26.0 (Plan Y; spec §5–§7, amended in §16) adds the derived tables, the metric catalogue and the query engine the stats screens read through. The file is about 350 MB after the backfill (measured 2026-10-17).

v0.27.0 (Plan Z; spec §8, amended in §17) adds the models: team Elo and the season simulation, opponent-adjusted EPA, SRS, luck and schedule strength, the field-goal model, the combine profile, metric stability, shrinkage and opponent adjustment, and the player outlook.

## Engine

- One worker thread (`out/main/statsWorker.js`, `src/main/stats/worker.ts`) owns the file. The main process talks to it through `StatsClient` (`src/main/stats/client.ts`): `refresh`, `setLeague`, `query`, `catalogue`, `status`, `games`, `outlook`, `selfTest`, `close`.
- Writes (`refresh`, `setLeague`, `selfTest`, `close`) run one after another. Reads (`query`, `catalogue`, `status`, `games`, `outlook`) run at once, each on its own connection, so a screen never waits behind a refresh or another read. During a rebuild DuckDB runs on one thread, reads included; during a forced refresh, queries took 16 ms (median) and under 0.1 s at most. Closing refuses new reads and waits for the running ones.
- DuckDB `@duckdb/node-api` 1.5.6. Its native binding loads from `app.asar.unpacked` (`asarUnpack` in `electron-builder.yml`). Parquet, JSON and ICU are built in, and no extension is ever downloaded.
- Settings: `memory_limit` 512 MB, 2 threads, `preserve_insertion_order` off, spill files in `<userData>/stats-tmp/duckdb`. The backfill peaks around 1.8–2.2 GB of process memory, and a forced daily refresh around 0.8 GB.
- `FantasyCompanion.exe --stats-self-test=<file>` opens a throwaway database in the worker, writes, reads and round-trips Parquet. It checks `read_json` and an ICU time zone, answers an engine query over a throwaway schema, writes `{"ok":true,"duckdb":"v1.5.6","rows":1000,"parquet":true,"json":true,"icu":true,"query":true}` to `<file>` and exits 0. The Release and Package check workflows run it on the Windows build.
- **Postseason weeks differ by source.** Sleeper numbers playoff weeks 1–4 (`season_type` `POST`); nflverse numbers them after the regular season (18–21 through 2020, 19–22 since). NGS skips the Pro Bowl week (Super Bowl 22 / 23) and QBR uses 1–4. Join postseason rows on `game_id` or on the team and the game's date, not on `week`.

## Tables

Source tables keep **every column the source publishes, as published, typed**, including zeros. The only changes are the standard columns below. When a later season adds a column, it is added to the table. When a column's type changes between seasons, it is widened (two integer types to `BIGINT`, other numbers to `DOUBLE`, anything else to `VARCHAR`), and the step message says so.

Standard columns: `season` and `week` as `INTEGER` (whatever type the file uses); `season_type` (`REG` / `POST`, from nflverse's game types `WC` / `DIV` / `CON` / `SB` where a file has no season type); and team codes normalised to nflverse's current ones (`OAK` → `LV`, `SD` → `LAC`, `STL` / `LAR` → `LA`, `WSH` → `WAS`, `JAC` → `JAX`), in place in the source's own team columns (NGS's `team_abbr`, QBR's `team_abb` / `opp_abb` and the weekly depth charts' `club_code` included). Id columns keep their published names (`player_id`, `gsis_id`, `pfr_player_id`, …).

| Table                                                        | From                                                                                                                                                                                                                                                                  | Grain                    | Id                          |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | --------------------------- |
| `games`                                                      | nflverse `schedules/games`                                                                                                                                                                                                                                            | game                     | `game_id`                   |
| `src_players`                                                | nflverse `players/players` (every player, all ids, bio, draft)                                                                                                                                                                                                        | player                   | `gsis_id`                   |
| `src_crosswalk`                                              | DynastyProcess `db_playerids.csv` (all text, `NA` = missing)                                                                                                                                                                                                          | player                   | `sleeper_id`, `gsis_id`, …  |
| `src_combine`                                                | nflverse `combine` (every year)                                                                                                                                                                                                                                       | prospect                 | `pfr_id`, `cfb_id`          |
| `src_player_stats`, `src_team_stats`                         | nflverse `stats_player_week`, `stats_team_week`                                                                                                                                                                                                                       | player- / team-week      | `player_id` (gsis) / `team` |
| `src_snaps`                                                  | nflverse `snap_counts`                                                                                                                                                                                                                                                | player-week              | `pfr_player_id`             |
| `src_ff_opportunity`                                         | ffverse `ep_weekly` (expected fantasy points; team totals in `*_team` columns)                                                                                                                                                                                        | player-week              | `player_id` (gsis)          |
| `src_ngs_passing`, `src_ngs_rushing`, `src_ngs_receiving`    | nflverse `nextgen_stats` (week 0 = season)                                                                                                                                                                                                                            | player-week              | `player_gsis_id`            |
| `src_pfr_pass`, `src_pfr_rush`, `src_pfr_rec`, `src_pfr_def` | nflverse `pfr_advstats` (weekly)                                                                                                                                                                                                                                      | player-week              | `pfr_player_id`             |
| `src_qbr_week`, `src_qbr_season`                             | nflverse `espn_data` (ESPN's nickname moves to `team_name`; `team`, `opponent` are codes; `week` = `game_week`; `season_type` REG / POST from ESPN's Regular / Playoffs, version 2)                                                                                   | player-week / season     | `player_id` (espn)          |
| `src_injuries`                                               | nflverse `injuries`                                                                                                                                                                                                                                                   | player-week              | `gsis_id`                   |
| `src_depth_charts`                                           | nflverse `depth_charts`, weekly rows through 2024                                                                                                                                                                                                                     | player × slot × week     | `gsis_id`                   |
| `src_depth_chart_snapshots`                                  | nflverse `depth_charts`, timestamped snapshots from 2025                                                                                                                                                                                                              | player × slot × snapshot | `gsis_id`, `espn_id`        |
| `src_rosters`                                                | nflverse `weekly_rosters`                                                                                                                                                                                                                                             | player-week              | `gsis_id`, `sleeper_id`, …  |
| `src_sleeper`, `src_sleeper_def`, `src_sleeper_team`         | Sleeper `api.sleeper.com/stats/nfl/{season}/{week}`: players, fantasy defenses (`player_id` = a 2–3 letter team code; player ids can be 1–3 digits), team offense (`TEAM_<code>`); every stat key a `DOUBLE` column (keys that are not plain identifiers are dropped) | player- / team-week      | `player_id` (sleeper)       |
| `src_sleeper_players`                                        | the same responses: each id's name, position and team that season                                                                                                                                                                                                     | player-season            | `player_id`                 |
| `src_pbp`                                                    | nflverse `pbp/play_by_play` (below)                                                                                                                                                                                                                                   | play                     | `game_id`, `play_id`        |
| `play_players`                                               | built from `src_pbp` (below)                                                                                                                                                                                                                                          | player × role × play     | `gsis`                      |
| `src_ftn`                                                    | nflverse `ftn_charting`, 2022+ (`game_id`, `play_id` from nflverse's)                                                                                                                                                                                                 | play                     | `game_id`, `play_id`        |
| `src_participation`                                          | nflverse `pbp_participation`, through the prior season, without its player lists                                                                                                                                                                                      | play                     | `game_id`, `play_id`        |
| `on_field`                                                   | the participation player lists                                                                                                                                                                                                                                        | player × play            | `gsis`                      |
| `players`, `sleeper_ids`, `combine_ids`                      | identity (below)                                                                                                                                                                                                                                                      |                          |                             |
| `sync_log`, `source_state`                                   | the sync's own log and per-source state                                                                                                                                                                                                                               |                          |                             |

## Play-by-play

- **`src_pbp`** keeps 234 of nflverse's 372 columns, including `desc`. Dropped by pattern (`PBP_DROPPED`, `src/main/stats/sources.ts`): running home/away totals, the home/away/defense copies of win probability, the score-type probabilities, clock strings, player-name and jersey copies, per-tackler team columns, and game-level copies already in `games` (coaches, weather, roof, surface, lines, scores). `play_id` is an `INTEGER`. Deleted plays are kept here and filtered by the views.
- **`play_players`**: every player a non-deleted play names, about 2.9 per play. Roles: `passer`, `dropback` (nflfastR's `passer_id`, scrambles and sacks included), `rusher`, `receiver`, `interception`, `sack`, `half_sack`, `qb_hit`, `tackle_for_loss`, `solo_tackle`, `assist_tackle`, `tackle_with_assist`, `pass_defense`, `forced_fumble`, `fumbled`, `fumble_recovery`, `kicker`, `punter`, `kick_returner`, `punt_returner`, `own_kickoff_recovery`, `blocked_kick`, `touchdown`, `safety`, `penalty`, and the `lateral_*` roles.
- **`on_field`**: `season`, `game_id`, `play_id`, `side` (`O` / `D`), `gsis`, `position` (from 2023; NULL before). Every play participation lists, special teams included.

## Views

Recreated after every refresh that loaded rows (a view's `*` is bound when it is created).

- **`plays`**: `src_pbp` without deleted plays, `LEFT JOIN`ed to `src_ftn` and `src_participation` on `game_id` + `play_id`, plus the counting flags of the warehouse spec §11–§12:

| Flag          | Rule                                                                                                                |
| ------------- | ------------------------------------------------------------------------------------------------------------------- |
| `counts`      | not wiped out by a penalty (`play_type` ≠ `no_play`) and not a two-point try                                        |
| `is_snap`     | `pass`, `rush`, `qb_kneel` or `qb_spike`; penalty-wiped snaps and two-point tries included (nflverse's snap counts) |
| `is_dropback` | counts, `qb_dropback`, `passer_id` set                                                                              |
| `is_carry`    | counts, a run or a kneel, `rusher_player_id` set                                                                    |
| `is_target`   | counts, `receiver_player_id` set, a pass attempt that is not a sack                                                 |

They reproduce nflverse's own counts. Carries, targets and receptions match `src_player_stats` on 99.99–100 % of player-weeks in every season 2019–2026. Snaps from `on_field` are within one of `src_snaps` on 99.48–99.98 % (offense) and 99.48–99.97 % (defense) every season. FTN rows find their play 100 %, participation 98.3–98.6 % through 2022 (deleted plays) and 100 % after (2026-10-16).

- **`depth_chart_week`**: one row per player × slot × week with `season`, `season_type`, `week`, `gsis_id`, `espn_id`, `team`, `player_name`, `formation`, `position`, `depth`, `snapshot`. Through 2024 it holds nflverse's weekly rows. From 2025, week w takes the last snapshot before that week's first kickoff (games in Eastern time), **playoff weeks included**. A week kicking off after the latest snapshot is left out, except the next one, which takes the latest.

## Identity

Rebuilt after every refresh that loaded rows (`stats:identity` in the log).

- **`players`**: one row per person in nflverse `players`, keyed by `gsis_id`. Columns: `name`, `first_name`, `last_name`, `position`, `position_group`, `birth_date`, `height`, `weight`, `college`, draft (`draft_year`, `draft_round`, `draft_pick`, `draft_team`), `rookie_season`, `last_season`, `team`, `status`, `headshot`, every id (`pfr_id`, `espn_id`, `pff_id`, `nfl_id`, `smart_id`, `sportradar_id`, `fantasypros_id`, `sleeper_id`).
- **`sleeper_ids`** (`sleeper_id`, `gsis_id`, `resolution`), first hit wins:
  1. the crosswalk;
  2. nflverse rosters' own `sleeper_id`;
  3. a name + position-group match (`nameKey`, `src/main/sync/identity.ts`) against nflverse players active that season and not already linked to another Sleeper id, taken only when exactly one matches.

  Sleeper players with points: 3,002 of 3,007 mapped (2026-10-16); the rest are junk ids and two defenders.

- **`combine_ids`** (`season`, `player_name`, `school`, `gsis_id`, `resolution`): by PFR id, else name and draft year, else name and rookie season (the combine year or the next). It resolves 2,415 of 2,749 combine rows since 2019, including 71 of the 95 with neither a PFR nor a college id. Join it to `src_combine` on `season`, `player_name` and `school`.

`nameKey` spells out nickname first names (Matt → Matthew) and compares positions by group (OL ⊇ G / T / C; DL ⊇ DE / DT / NT; LB ⊇ ILB / OLB / MLB; DB ⊇ CB / S / FS / SS). The fantasy side's resolver (`player_ids` in `companion.db`) uses the same key.

## Sync

- **When it runs.**
  - After every refresh and league import, as before.
  - **At launch when no league exists**: the stats section is standalone, and the worker fetches the Sleeper NFL state itself.
  - One run at a time. The Refresh result does not wait for it.
- **Freshness.** These are the warehouse rules, kept:
  - Nothing is retried within 24 h of its last finished attempt, except a forced refresh of the current season and the all-seasons files.
  - The current season and the all-seasons files are refreshed daily, the prior season weekly.
  - Older seasons are fetched once and sealed. A source's `version` bump re-fetches them.
- **Steps.** Each source × season is one step, logged as `stats:<source>:<season>` (or `stats:<source>` for an all-seasons file) in the file's own `sync_log`.
  - A file that is not published (404) is `skipped` and retried the next day; participation for the current season is the usual case.
  - A step replaces its season's rows in one transaction, so a failed load keeps the old rows.
  - **Quitting** closes the worker first: the running download is aborted, the running statement interrupted, and the step logged `interrupted`. The app quits within a few hundred milliseconds (after 3 s at most, the worker is ended). An `interrupted` step is not an attempt: the next run retries it. Steps a crashed app left `running` are marked `interrupted` on the next open, and stale temp files are cleared.
- **The derived rebuild.** After the steps, when one loaded rows (or the derived tables are missing or older than `DERIVED_VERSION`), `stats:derived` rebuilds the derived tables for the seasons whose rows changed. A file of all seasons (players, QBR, combine) counts as the current season. A forced daily refresh rebuilds the current season in about 1.5 s. The first build (every season) takes about 25 s.
- **The models.** `stats:models` follows every successful derived rebuild, a `MODELS_VERSION` change, and a run that failed (`models_pending`). A first build takes about 40 s, a daily one about 4.5 s (below).
- **Downloads.** Parquet from nflverse and ffverse, CSV for the crosswalk, JSON for Sleeper. Files are written to `<userData>/stats-tmp`, read by DuckDB, and deleted. A full backfill downloads about 210 MB of Parquet plus Sleeper's JSON and takes 2–3 minutes. A forced daily refresh runs 24 steps in about 12 s.

## Derived tables

Built by `src/main/stats/derived/` after each refresh (spec §5). Every rate is stored as its numerator and denominator (components), and the engine divides when it reads, so any week range or group is exact.

| Table               | Grain                                        | Holds                                                                                                                                                                                                                                                                                                                                                                        |
| ------------------- | -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `team_week`         | team × game (scheduled games too, `games` 0) | `off_*` (by `posteam`) and `def_*` (by `defteam`) sums of the team play components; result, points, `line_margin` (the team's expected margin), `total_line`, `implied_points`; drives (`drives`, `drive_points`, `td_drives`, `three_and_outs`, `drive_start_sum`, `def_drives`, `def_drive_points`); neutral pace; special teams from `src_team_stats`.                    |
| `player_week`       | gsis × season × season type × week           | About 230 components: passing, dropbacks, rushing, receiving, on-field, defense (from `plays`, `on_field`, `play_players`), the box score (kicking, punting, returns, fumbles, tackles for loss), snaps, NGS, PFR, QBR, ffopportunity; `position` (the week's nflverse roster), `team`, `opponent`, `home`, the team context for shares (`tm_*`), `routes` and `routes_est`. |
| `player_season`     | gsis × season × season type                  | `player_week` summed, with the latest team and the most common position; NGS and QBR from their season rows.                                                                                                                                                                                                                                                                 |
| `team_season`       | team × season × season type                  | `team_week` summed over played games.                                                                                                                                                                                                                                                                                                                                        |
| `fantasy_week`      | Sleeper id × week × scoring                  | `points` and `xpoints` under `ppr`, `half`, `std` and (with a league) `league`; `gsis_id` through `sleeper_ids`; weeks in nflverse's numbering.                                                                                                                                                                                                                              |
| `team_fantasy_week` | defense × week × scoring                     | `fpa_qb`, `fpa_rb`, `fpa_wr`, `fpa_te`, `fpa_k`: fantasy points each position scored against it.                                                                                                                                                                                                                                                                             |

- **Play components** (`src/main/stats/derived/plays.ts`) are written once, as an expression over one row of `plays`, with the role that gets the credit: `passer`, `dropback`, `rusher`, `receiver`, `onO`, `onD`, `kicker`, `punter`, `defender`. The same expressions build the weekly tables and answer situational queries, so the grains cannot disagree.
- **Rates need their own denominators.** Participation (pressure, coverage, personnel, box) is known on 89–90 % of dropbacks through 2022 and on every one since; FTN starts in 2022. Each such rate divides by its own "known" count (`db_pressure_known`, `tgt_ftn`, …).
- **Routes** are dropbacks a player was on the field for, blocking snaps included. In the current season (no participation yet) they are estimated as team dropbacks × offensive snap share, and `routes_est` counts the estimated weeks.
- **NGS** publishes a week only for players over its weekly minimum (the weekly attempts of only 12 % of rushers add up to their season row), so season values come from NGS's season rows (week 0). Postseason weeks are mapped to nflverse's numbering for NGS (Pro Bowl week skipped), QBR and Sleeper (1–4).
- **Fantasy scoring.** The presets are Sleeper's current default scoring with 1, ½ and 0 points a reception (`src/shared/stats/scoring.ts`). Lines are scored in SQL by the twin of the app's scoring engine (`DERIVED_STATS`): it gives the same points as `scoreStatLine` on 82,880 of 82,958 lines (2019, 2025, 2026, the user's league). The 78 others are pre-2024 kickers: Sleeper then had one 50+ bucket (`fgm_50p`), which counts here as 50–59. Sleeper's own stored `pts_*` for past seasons use its defaults of the time (an interception −2 through 2021, a 14–20-points-allowed defense 0), so they are not a reference before 2026.
- **Expected points** score ffopportunity's expected stats with the same rules (bonuses and fumbles have no expected count). Under ffopportunity's own rules they match its `total_fantasy_points_exp` within 0.1 on 99.5–99.8 % of player-weeks (r = 0.999995).
- **Agreement with nflverse** (2019–2026): targets, receptions, passing yards and sacks 100 %, carries ≥ 99.995 %, rushing yards ≥ 99.98 %, receiving yards ≥ 99.85 % (laterals) of player-weeks; team passing yards, carries and targets 99.8–100 %, rushing yards 99.3–100 % of team-games.
- **Teams.** A player-week's team, opponent and team context come from the box score and snaps first. Plays credit a team only where it is the player's own: scrimmage plays, field goals and extra points for kickers, punts for punters. On kickoffs `posteam` is the receiving team.
- **Missing sources.** A source that is not loaded, or a column a source dropped, reads as NULL instead of failing the rebuild.
- **Memory.** Each season is built on its own, each source into a temporary table first, on one thread: writing `player_week` on two threads needs more than the 512 MB limit.

## Models

Built by `src/main/stats/models/` (spec §8, amended in §17), after the derived tables. Every table is replaced in one transaction; the simulations are cached.

| Table               | Grain                                      | Holds                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------- | ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `elo_games`         | game (scheduled games too)                 | Pre-game Elo of both teams, `home_field`, the home team's Elo win probability (`home_wp`) and expected margin (`elo_spread`), the market's no-vig probability (`vegas_home_wp`), post-game ratings.                                                                                                                                                                                                                                                                                                  |
| `team_forecast`     | team × season × week (0 = before week 1)   | The season simulation as of that week: `wins`, `losses`, `ties`, `playoffs`, `division`, `bye`, `conference`, `superBowl`, and its `runs`.                                                                                                                                                                                                                                                                                                                                                           |
| `team_model_week`   | team × season × week, 0 to the last played | States at the end of the week (byes included): `elo`, `srs`, `mov`, `adj_[recent_]{off,def}[_pass,_rush]_epa`, `sos_elo`, `sos_adj`, `sos_left_elo`, `sos_left_adj`, `games_left`, the simulation (`proj_wins`, `playoff_pct`, …, `sb_pct`; the end-of-season odds in the postseason). Sums over that week's game: `elo_games`, `elo_wp`, `vegas_games`, `vegas_wp`, `elo_pre`, `opp_elo_pre`, `fg_model_att`, `fg_model_made`, `fg_xmade`, fumbles and interceptions (`off_xints` NULL before FTN). |
| `player_model_week` | kicker × week                              | `fg_model_att`, `fg_model_made`, `fg_xmade`.                                                                                                                                                                                                                                                                                                                                                                                                                                                         |
| `player_profile`    | combine attendee with a gsis id            | Height (inches), weight, forty, bench, vertical, broad jump, cone, shuttle; each as a 0–10 `*_score` (mid-rank percentile within the position group, every combine since 2000); `ras_measures`, `ras` (four measures at least), `speed_score`.                                                                                                                                                                                                                                                       |
| `metric_stability`  | metric                                     | `year_to_year`, `pairs`, `split_half`, `prior`, `reliability`, `through` (the last season read).                                                                                                                                                                                                                                                                                                                                                                                                     |

- **Elo**: K 20, home field 48 (0 at a neutral site and in 2020), nfelo's margin multiplier, a third regressed to 1500 between seasons, 2019 as the burn-in. Brier 2021–2025: 0.224 (Vegas 0.211).
- **Simulation**: 10,000 runs of the current season's remaining games from the current Elo, ratings updated within each run; tiebreakers through head-to-head, division, common games, conference, strength of victory and of schedule, then a coin flip. A sealed season's weeks run 2,000 times, once. The final week reproduces every playoff field and bye 2019–2025.
- **Adjusted EPA**: a ridge regression (300 plays of prior per team effect) of EPA per play on offense, defense and home field, garbage time left out, as of every week; the recency-weighted version halves a game's weight every four weeks.
- **FG model**: logistic regression on distance (a knot every 5 yards), indoors, cold, wind, wind × distance and grass, fitted on every attempt before the current season, recent seasons weighted more. Coefficients in `stats_settings` (`fg_model`).
- **Stability**: per metric, within each position and pooled; measured on 2019 to the prior season whenever a past season changes (about 20 s).
- **The `outlook` read** (player): ceiling and floor, boom and bust rates, usage trend (last four games against the games before), regression flags, and the remaining schedule. **The `games` read**: a season's games with Elo and the market.

```sql
-- Playoff odds now, with Elo and adjusted EPA margin
SELECT team, round(elo) AS elo, round(adj_off_epa - adj_def_epa, 3) AS adj_net,
       round(proj_wins, 1) AS wins, round(playoff_pct, 3) AS playoffs, round(sb_pct, 3) AS sb
FROM team_model_week
WHERE season = 2026 AND week = (SELECT max(week) FROM team_model_week WHERE season = 2026)
ORDER BY sb DESC LIMIT 10;
```

## Metric catalogue and query engine

- **Catalogue** (`src/shared/stats/catalogue.ts`): 324 metrics, 204 for players and 120 for teams. Each has a formula over component sums (`{targets} / nullif({tm_targets}, 0)`), model states at the end of the scope (`{last:elo}`) or weekly quantiles (`{p80:fp}`), its sample component and minimum, unit, direction, tier (`core` 116, `extended` 176, `stored` 32), family, sources and coverage. 163 can be split by situation. The catalogue the renderer reads carries each metric's stability.
- **Missing counts.** At the week and season grains, a play-by-play or box-score component a player never had (carries for a receiver) sums as 0. FTN, participation, NGS, PFR and QBR components stay NULL when missing: there, NULL means "not measured".
- **Query** (`StatsQuery`, `src/shared/stats/types.ts`; JSON Schema in `src/shared/stats/querySchema.ts`): entity, metrics, scope, situation (down, distance, quarter, field zone, score margin, win probability, neutral, two-minute — the last two minutes of the 2nd and 4th quarters, since v0.29.0 — and the participation and charting filters), groupBy, transform (`raw`, `perGame`, `percentile`, `zScore`, `vsLeague`, `shrunk`, `opponentAdjusted`), sort, limit, scoring. The engine (`src/main/stats/engine/`) validates it, compiles it to parameterised SQL over the season tables, the weekly tables or the plays, and runs it for 5 s at most.
- **Results** carry, per metric, the value (after the transform), the raw value, the sample, `qualified`, the percentile and rank among qualified rows of the same position and group, and `estimated`. Notes state the coverage the answer depends on.
- **Qualification.** `minSample` is per 17 games, scaled to the weeks a row covers (about one game per opponent row) and, at the play grain, to the share of plays each row keeps (its situation and play-dimension group, among its teams' plays when the query filters teams or players on the field).
- **Transforms.** `shrunk` pulls a rate toward the qualified rows' sample-weighted mean by its stability prior: (s·v + k·μ) / (s + k). `opponentAdjusted` subtracts the sample-weighted average of how much more than the league each opponent allowed in the same metric and position (weekly rows; rates only, since a total is not comparable with the league total). A metric a transform does not apply to is returned raw, with a note.
- **Speed** on the full database: leaderboards of 15 metrics 60–100 ms, a player's weekly line 46 ms, situational splits 60–75 ms, five seasons of a metric 40 ms; 40 metrics over every player 0.7 s.

```sql
-- The same numbers the engine reads: 2025 receivers by yards per route run
SELECT pl.name, s.team, s.routes, round(s.rec_yds / s.routes, 2) AS yprr,
       round(s.targets / s.tm_targets, 3) AS target_share
FROM player_season s JOIN players pl USING (gsis_id)
WHERE s.season = 2025 AND s.season_type = 'REG' AND s.position = 'WR' AND s.routes >= 300
ORDER BY yprr DESC LIMIT 10;
```

## Reading it

```sql
-- Targets per route on the field (past seasons: participation lags a season)
SELECT f.gsis, any_value(pl.name) AS name,
       count(*) FILTER (p.is_dropback) AS routes,
       count(*) FILTER (p.is_target AND p.receiver_player_id = f.gsis) AS targets
FROM on_field f JOIN plays p USING (game_id, play_id) JOIN players pl ON pl.gsis_id = f.gsis
WHERE p.season = 2025 AND p.season_type = 'REG' AND f.side = 'O' AND f.position = 'WR'
GROUP BY f.gsis HAVING routes >= 300 ORDER BY targets / routes DESC LIMIT 10;

-- Yards per catch when the QB was pressured, weeks 4–9
SELECT p.receiver_player_id, count(*) AS catches, round(avg(p.yards_gained), 1) AS ypc
FROM plays p WHERE p.season = 2025 AND p.week BETWEEN 4 AND 9 AND p.is_target
  AND p.complete_pass = 1 AND p.was_pressure
GROUP BY 1 HAVING count(*) >= 5 ORDER BY ypc DESC LIMIT 5;

-- A Sleeper player's weekly half-PPR points and nflverse targets
SELECT s.week, s.pts_half_ppr, ps.targets
FROM src_sleeper s JOIN sleeper_ids i ON i.sleeper_id = s.player_id
LEFT JOIN src_player_stats ps ON ps.player_id = i.gsis_id AND ps.season = s.season AND ps.week = s.week
WHERE s.player_id = '4866' AND s.season = 2025 AND s.season_type = 'REG' ORDER BY s.week;
```
