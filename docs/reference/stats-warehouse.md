# Stats warehouse — data reference

Added in v0.20.0 (Plan T; spec `docs/superpowers/specs/2026-10-09-stats-warehouse-design.md`). Every stat the free, keyless sources publish, 2019 through the current season, in its own SQLite file, `warehouse.db` beside `companion.db` (about 540 MB with every light source, measured 2026-10-11). Deleting the file just makes the next refresh rebuild it. **Nothing in the app reads it yet**: it is storage for later features and research.

## Tables

| Table             | Key                                           | Holds                                                                                                                                                                                |
| ----------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `wh_player_week`  | source, season, season_type, week, player_key | One row per source × player × week. `key_type` says which id `player_key` is (`gsis`, `pfr`, `espn`, `sleeper`, `cfb`). Week 0 = a season-level row the source publishes (NGS, QBR). |
| `wh_team_week`    | source, season, season_type, week, team       | One row per source × team × week (nflverse team codes).                                                                                                                              |
| `wh_game`         | game_id                                       | Every column of nflverse `games.csv` (Vegas lines, rest, roof, surface, weather, coaches, referee).                                                                                  |
| `wh_player`       | source, player_key                            | Profiles: `combine` (every draft year), `rosters` (each player's latest bio, `as_of` = season × 100 + week).                                                                         |
| `wh_source_state` | source, season                                | What was fetched, when, at which adapter version; `sealed` seasons are never re-fetched. Season 0 = an all-seasons file.                                                             |

`data_json` holds the columns the source publishes: numbers as numbers, text as text, `*_id` columns as text. Empty / `NA` values and **zeros are dropped** (read a missing count as 0), and so are the columns the row already stores in its own fields (season, week, season type, team, opponent, the id). Weekly `rosters` rows keep only status, depth position, jersey and position; the bio is in `wh_player`. `ff_opportunity` team totals (`*_team`) are team-week rows. Depth charts store their slots as `entries: [{ formation, position, rank }]`.

## Sources

| `source`                                     | From                                                                                    | Id                | Table                     |
| -------------------------------------------- | --------------------------------------------------------------------------------------- | ----------------- | ------------------------- |
| `sleeper`                                    | `api.sleeper.com/stats/nfl/{season}/{week}` (REG 1–17/18, POST 1–4)                     | sleeper           | player-week               |
| `sleeper_def`, `sleeper_team`                | same response: DEF rows, `TEAM_<code>` rows                                             | team              | team-week                 |
| `schedules`                                  | nflverse `schedules/games.csv`                                                          | game_id           | `wh_game`                 |
| `nflverse_player`, `nflverse_team`, `snaps`  | nflverse `stats_player`, `stats_team`, `snap_counts`                                    | gsis / team / pfr | player-week, team-week    |
| `ff_opportunity`                             | ffverse `ep_weekly_{season}.csv` (expected fantasy points)                              | gsis              | player-week               |
| `ngs_pass`, `ngs_rush`, `ngs_rec`            | nflverse `nextgen_stats` (all seasons)                                                  | gsis              | player-week               |
| `pfr_pass`, `pfr_rush`, `pfr_rec`, `pfr_def` | nflverse `pfr_advstats`                                                                 | pfr               | player-week               |
| `qbr`                                        | nflverse `espn_data` (weekly + season)                                                  | espn              | player-week               |
| `injuries`                                   | nflverse `injuries`                                                                     | gsis              | player-week               |
| `depth_charts`                               | nflverse `depth_charts` (from 2025: the last snapshot before each week's first kickoff) | gsis              | player-week               |
| `rosters`                                    | nflverse `weekly_rosters`                                                               | gsis              | player-week + `wh_player` |
| `combine`                                    | nflverse `combine.csv`                                                                  | pfr, else cfb     | `wh_player`               |

## Sync

- Runs in the background after every refresh and import (`refreshWarehouse`), one run at a time. The Refresh result does not wait for it.
- Freshness:
  - Nothing is retried within 24 h of its last finished attempt.
  - The current season and all-seasons files are refreshed daily, and on a forced refresh.
  - The prior season is refreshed weekly.
  - Older seasons are fetched once and sealed. Only a version bump in `src/main/sync/warehouseSteps.ts` re-fetches them.
- Steps log to `warehouse.db`'s own `sync_log` as `wh:<id>:<season>` (or `wh:<id>`), so their errors never reach the status bar.

## Reading it

Attach the app database to reach `player_ids` (`ATTACH 'companion.db' AS app`), then join to Sleeper players through `app.player_ids` (`gsis_id`, `pfr_id`, `espn_id`), or by Sleeper id for `sleeper` rows:

```sql
-- expected vs actual fantasy points by week for one Sleeper player, 2025
SELECT w.week,
       json_extract(w.data_json, '$.total_fantasy_points_exp') AS xfp,
       json_extract(w.data_json, '$.total_fantasy_points') AS fp
FROM wh_player_week w JOIN app.player_ids p ON p.gsis_id = w.player_key
WHERE w.source = 'ff_opportunity' AND w.season = 2025 AND p.player_id = ?
ORDER BY w.week;
```
