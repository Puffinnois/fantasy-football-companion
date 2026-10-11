# Stats warehouse — data reference

Added in v0.20.0 (Plan T; spec `docs/superpowers/specs/2026-10-09-stats-warehouse-design.md`). Every stat the free, keyless sources publish, 2019 through the current season, in its own SQLite file, `warehouse.db` beside `companion.db` (about 540 MB with every light source, measured 2026-10-11, plus about 50 MB of play-by-play since v0.21.0). Deleting the file just makes the next refresh rebuild it. **Nothing in the app reads it yet**: it is storage for later features and research.

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
| `pbp`                                        | nflverse `pbp/play_by_play_{season}`, aggregated per player-week and team-week (below)  | gsis / team       | player-week, team-week    |

## Play-by-play (`pbp`, since v0.21.0)

One step per season (`wh:pbp:<season>`) downloads nflverse play-by-play (~19 MB) and aggregates it in a worker thread. No play-level rows are stored.

Counting rules. They reproduce nflverse's own counts: carries = `rush_carries` + `pass_kneels`, targets = `rec_targets`, on ≥ 99.9 % of player-weeks in every season 2019–2026.

- Deleted plays and preseason rows are dropped; aborted plays are kept.
- Penalty-wiped snaps (`no_play`) count only for penalties; two-point tries only for the two-point counts.
- Every value is a sum or a count, or a maximum for `*_long`. Rates are computed when read (`pass_qb_epa_sum / pass_dropbacks`). Sums are rounded to 4 decimals.

**Player-weeks** (`player_key` = gsis id):

| Prefix       | Rows                                                     | Keys                                                                                                                                                                                                                                                                                                                                                                            |
| ------------ | -------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pass_`      | dropbacks (sacks and scrambles), credited to `passer_id` | `dropbacks`, `qb_epa_sum`, `success_n`, `wpa_sum`, `cpoe_sum` / `cpoe_n` (percentage points), `scrambles`, `scramble_yds`, `early_dropbacks` / `early_epa_sum` (downs 1–2), `3d_dropbacks`, `3d_conv`; on attempts `air_epa_sum`, `yac_epa_sum`, `long_cmp`, `att_i20`, `att_i10`, `ez_att`, `deep_att` / `_cmp` / `_yds` / `_td` / `_int` (air yards ≥ 20); `kneels`, `spikes` |
| `rush_`      | runs (`play_type = run`: scrambles included, kneels not) | `carries`, `designed`, `epa_sum`, `success_n`, `wpa_sum`, `stuffs` (≤ 0 yards), `10p` / `15p` / `20p`, `long`, `i20` / `i10` / `i5` and `td_i20` / `td_i10` / `td_i5` (yards to the end zone at the snap), `gtg`, `first_downs`, `<left, middle, right, end, tackle, guard>_n` and `_yds`                                                                                       |
| `rec_`       | targets (pass attempts that are not sacks)               | `targets`, `air_yards_sum`, `epa_sum`, `success_n`, `wpa_sum`, `tgt_i20` / `tgt_i10` / `tgt_i5`, `ez_tgt` (air yards reach the end zone), `deep_tgt`, `3d_tgt`; on catches `xyac_sum` / `xyac_n`, `yac_sum`, `long`, `first_downs`                                                                                                                                              |
| `hvt`        |                                                          | high-value touches: carries inside the 10 plus targets                                                                                                                                                                                                                                                                                                                          |
| `k_`         | field goals, PATs, kickoffs                              | `epa_sum` (field goals and PATs), `kickoffs`, `ko_touchbacks`, `onside_att`, `onside_rec`                                                                                                                                                                                                                                                                                       |
| `p_`         | punts                                                    | `punts`, `epa_sum`, `inside_20`, `touchbacks`, `fair_catches`, `blocked`                                                                                                                                                                                                                                                                                                        |
| `kr_`, `pr_` | kick and punt returns                                    | `returns`, `yds`, `long`, `td`, `fair_catches`                                                                                                                                                                                                                                                                                                                                  |
| `def_`       | runs and catches, each credited tackler                  | `stuffs`, `tackle_depth_sum` / `tackle_depth_n` (yards gained at the tackle)                                                                                                                                                                                                                                                                                                    |
| `pen_`       | every accepted penalty, wiped-out snaps included         | `n`, `yds`, `types` (`{ type: count }`)                                                                                                                                                                                                                                                                                                                                         |

**Team-weeks** store every metric twice: `off_<m>` for the team's own snaps, and `def_<m>` for its opponents' snaps against it. `def_` values are not negated: `def_epa_sum` is EPA allowed, `def_punts` forced punts, `def_fourth_failed` fourth-down stops, `def_havoc` havoc plays.

- **Snaps:**
  - Volume and EPA: `plays`, `epa_sum`, `success_n`, the same three for `pass_` and `rush_`, `early_plays`, `early_epa_sum`.
  - Explosives: `explosive_rush` (10+), `explosive_pass` (20+).
  - Pass rate over expected: `xpass_sum`, `pass_oe_sum` (percentage points), `xpass_n`.
  - Neutral script and pace: `neutral_plays`, `neutral_passes` (win probability 20–80 %, quarters 1–3), `pace_sum` / `pace_n` (seconds between neutral snaps of a drive).
  - Formation: `no_huddle`, `shotgun`.
  - Downs: `third_att`, `third_conv`, `fourth_downs` (punts and field goals included), `fourth_go`, `fourth_conv`, `fourth_failed`.
  - `turnovers`, and `havoc` (a TFL, forced fumble, interception or pass defended).
- **Drives:** `drives`, `drive_plays`, `drive_yds`, `drive_seconds`, `drive_points`, `drive_start_sum` (yards to the end zone at the first snap), `three_and_outs`, `drive_scores`, `drive_turnovers`, `drive_punts`, `rz_trips`, `rz_tds`, `gtg_drives`, `gtg_tds`.
- **Other:**
  - `two_pt_att`, `two_pt_conv`, `punts`, `st_epa_sum`.
  - `ko_touchbacks`: nflverse gives kickoffs to the receiving team, so `off_ko_touchbacks` are touchbacks received.
  - Penalties on the play's offense (`pen_offense_n`, `pen_offense_yds`) and on its defense (`pen_defense_n`, `pen_defense_yds`).

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

```sql
-- EPA per dropback and success rate for one passer, 2025 regular season
SELECT SUM(json_extract(data_json, '$.pass_qb_epa_sum')) / SUM(json_extract(data_json, '$.pass_dropbacks')) AS epa_per_db,
       1.0 * SUM(json_extract(data_json, '$.pass_success_n')) / SUM(json_extract(data_json, '$.pass_dropbacks')) AS success
FROM wh_player_week
WHERE source = 'pbp' AND season = 2025 AND season_type = 'REG' AND player_key = '00-0036389';
```
