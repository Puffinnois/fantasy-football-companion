# Stats database — data reference

Added in v0.25.0 (Plan X; spec `docs/superpowers/specs/2026-10-15-stats-analysis-design.md` §2–§4, amended in §15). It replaces the SQLite stats warehouse of v0.20–v0.24 (`warehouse.db`, deleted on the first launch of v0.25.0). Every stat the free, keyless sources publish, 2019 through the current season, in a DuckDB file, `stats.duckdb` beside `companion.db`. It is about 285 MB after the backfill and settles around 305 MB under daily refreshes (measured 2026-10-16). Deleting the file makes the next refresh rebuild it in 2–3 minutes. **Nothing in the app reads it yet**: Plan Y builds the metric layer and query engine on it.

## Engine

- One worker thread (`out/main/statsWorker.js`, `src/main/stats/worker.ts`) owns the file. The main process talks to it through `StatsClient` (`src/main/stats/client.ts`): `refresh`, `selfTest`, `close`.
- DuckDB `@duckdb/node-api` 1.5.6. Its native binding loads from `app.asar.unpacked` (`asarUnpack` in `electron-builder.yml`). Parquet, JSON and ICU are built in, and no extension is ever downloaded.
- Settings: `memory_limit` 512 MB, 2 threads, `preserve_insertion_order` off, spill files in `<userData>/stats-tmp/duckdb`. The backfill peaks around 1.8 GB of process memory, and a forced daily refresh around 0.8 GB.
- `FantasyCompanion.exe --stats-self-test=<file>` opens a throwaway database in the worker, writes, reads and round-trips Parquet. It writes `{"ok":true,"duckdb":"v1.5.6","rows":1000,"parquet":true}` to `<file>` and exits 0. The Release and Package check workflows run it on the Windows build.

## Tables

Source tables keep **every column the source publishes, as published, typed**, including zeros. The only changes are the standard columns below. When a later season adds a column, it is added to the table. When a column's type changes between seasons, it is widened (numbers to `DOUBLE`, anything else to `VARCHAR`), and the step message says so.

Standard columns: `season`; `season_type` (`REG` / `POST`, from nflverse's game types `WC` / `DIV` / `CON` / `SB` where a file has no season type); and team codes normalised to nflverse's current ones (`OAK` → `LV`, `SD` → `LAC`, `STL` / `LAR` → `LA`, `WSH` → `WAS`, `JAC` → `JAX`), in place in the source's own team columns. Id columns keep their published names (`player_id`, `gsis_id`, `pfr_player_id`, …).

| Table                                                        | From                                                                                                                                                                | Grain                    | Id                          |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------ | --------------------------- |
| `games`                                                      | nflverse `schedules/games`                                                                                                                                          | game                     | `game_id`                   |
| `src_players`                                                | nflverse `players/players` (every player, all ids, bio, draft)                                                                                                      | player                   | `gsis_id`                   |
| `src_crosswalk`                                              | DynastyProcess `db_playerids.csv` (all text, `NA` = missing)                                                                                                        | player                   | `sleeper_id`, `gsis_id`, …  |
| `src_combine`                                                | nflverse `combine` (every year)                                                                                                                                     | prospect                 | `pfr_id`, `cfb_id`          |
| `src_player_stats`, `src_team_stats`                         | nflverse `stats_player_week`, `stats_team_week`                                                                                                                     | player- / team-week      | `player_id` (gsis) / `team` |
| `src_snaps`                                                  | nflverse `snap_counts`                                                                                                                                              | player-week              | `pfr_player_id`             |
| `src_ff_opportunity`                                         | ffverse `ep_weekly` (expected fantasy points; team totals in `*_team` columns)                                                                                      | player-week              | `player_id` (gsis)          |
| `src_ngs_passing`, `src_ngs_rushing`, `src_ngs_receiving`    | nflverse `nextgen_stats` (week 0 = season)                                                                                                                          | player-week              | `player_gsis_id`            |
| `src_pfr_pass`, `src_pfr_rush`, `src_pfr_rec`, `src_pfr_def` | nflverse `pfr_advstats` (weekly)                                                                                                                                    | player-week              | `pfr_player_id`             |
| `src_qbr_week`, `src_qbr_season`                             | nflverse `espn_data` (ESPN's nickname moves to `team_name`; `team`, `opponent` are codes; `week` = `game_week`)                                                     | player-week / season     | `player_id` (espn)          |
| `src_injuries`                                               | nflverse `injuries`                                                                                                                                                 | player-week              | `gsis_id`                   |
| `src_depth_charts`                                           | nflverse `depth_charts`, weekly rows through 2024                                                                                                                   | player × slot × week     | `gsis_id`                   |
| `src_depth_chart_snapshots`                                  | nflverse `depth_charts`, timestamped snapshots from 2025                                                                                                            | player × slot × snapshot | `gsis_id`, `espn_id`        |
| `src_rosters`                                                | nflverse `weekly_rosters`                                                                                                                                           | player-week              | `gsis_id`, `sleeper_id`, …  |
| `src_sleeper`, `src_sleeper_def`, `src_sleeper_team`         | Sleeper `api.sleeper.com/stats/nfl/{season}/{week}`: players, fantasy defenses (`player_id` = team), team offense (`TEAM_<code>`); every stat key a `DOUBLE` column | player- / team-week      | `player_id` (sleeper)       |
| `src_sleeper_players`                                        | the same responses: each id's name, position and team that season                                                                                                   | player-season            | `player_id`                 |
| `src_pbp`                                                    | nflverse `pbp/play_by_play` (below)                                                                                                                                 | play                     | `game_id`, `play_id`        |
| `play_players`                                               | built from `src_pbp` (below)                                                                                                                                        | player × role × play     | `gsis`                      |
| `src_ftn`                                                    | nflverse `ftn_charting`, 2022+ (`game_id`, `play_id` from nflverse's)                                                                                               | play                     | `game_id`, `play_id`        |
| `src_participation`                                          | nflverse `pbp_participation`, through the prior season, without its player lists                                                                                    | play                     | `game_id`, `play_id`        |
| `on_field`                                                   | the participation player lists                                                                                                                                      | player × play            | `gsis`                      |
| `players`, `sleeper_ids`, `combine_ids`                      | identity (below)                                                                                                                                                    |                          |                             |
| `sync_log`, `source_state`                                   | the sync's own log and per-source state                                                                                                                             |                          |                             |

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
  3. a name + position-group match (`nameKey`, `src/main/sync/identity.ts`) against nflverse players active that season, taken only when exactly one matches.

  Sleeper players with points: 2,853 of 2,857 mapped (2026-10-16); the rest are junk ids.

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
  - Steps still `running` when the app closed are marked `interrupted` on the next open.
- **Downloads.** Parquet from nflverse and ffverse, CSV for the crosswalk, JSON for Sleeper. Files are written to `<userData>/stats-tmp`, read by DuckDB, and deleted. A full backfill downloads about 210 MB of Parquet plus Sleeper's JSON and takes 2–3 minutes. A forced daily refresh runs 24 steps in about 12 s.

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
