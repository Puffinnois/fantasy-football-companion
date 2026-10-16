# Warehouse coverage audit — 2026-10-14

What the local stats are missing and why, checked on the dev profile (`~/.config/FantasyCompanion`, refreshed 2026-10-14 16:23 EDT, v0.23.0). Method: every source × season × season type × week in `warehouse.db` against the played games in `wh_game`, every team-game against the team-week sources, each step's "unparseable rows skipped" message traced in the raw nflverse / ffverse files, and the app tables in `companion.db` (`player_week_stats`, `sleeper_week_stats`, `player_week_snaps`, `team_week_stats`, `player_week_points`).

Coverage is otherwise complete: every source has every played week 2019 → 2026 week 5, and no step has ever failed.

## To fix (code)

| #   | Gap                                                                      | Cause                                                                                                                                                                                                                                                                           | Fix                                                                                                                                                                                        |
| --- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 1   | **2025 playoff depth charts** absent (2019–2024 have them)               | `parseSnapshots` in `src/main/sources/warehouse/depthCharts.ts` builds weeks from `firstKickoffs`, which keeps `game_type = REG` only, and writes `seasonType: 'REG'`. nflverse publishes 68 snapshots after 2026-01-05.                                                        | Include POST kickoffs (weeks 19–22) and set the season type from the game type. Re-fetch needs a `depth_charts` version bump (2025 is not sealed yet, so the next daily refresh would do). |
| 2   | **2019 Raiders split across `OAK` and `LV`**                             | Sources disagree. `OAK`: schedules, `sleeper` players, `sleeper_team`, rosters, snaps, `pfr_*`, `qbr`, injuries, depth charts. `LV`: `nflverse_player` / `_team`, `pbp`, `part`, `ff_opportunity`, `ngs_*`, `sleeper_def`. No row is lost, but team joins on 2019 Raiders miss. | Normalise `OAK` → `LV` at write time (a shared team-code map; there is already `ESPN_TEAM_CODES` for QBR). Seasons are sealed, so it needs version bumps.                                  |
| 3   | **~95 combine entries 2022–2026 dropped** (595 in all, mostly 2000–2005) | `parseCombine` keys by `pfr_id`, else `cfb_id`; nflverse leaves both empty for these. Includes Isaiah Davis, Jalen Coker, Chris Rodriguez Jr., Tyson Bagent, Andrei Iosivas, Bryce Lance, Cole Payton.                                                                          | Fallback key `name:<season>:<normalised name>` (new `key_type`), matched to players by name + draft year.                                                                                  |
| 4   | **Two scorers not linked Sleeper ↔ gsis**                                | Name / position variants: Matt (Sleeper 13324) / Matthew (00-0040879) Hibner, BAL TE; Brandon Coleman (Sleeper 11702, OL / nflverse G, 00-0039913), WAS. `player_ids.resolution = 'unresolved'`. Every other 2025–26 scorer is linked.                                          | Nickname-aware name match (Matt/Matthew …) and OL ⊇ G/T/C in the position check of the identity resolver (`src/main/sync/identity.ts`).                                                    |
| 5   | Depth-chart rows without `gsis_id` skipped                               | 25 094 rows in 2026, 5 577 in 2025, but almost all in offseason snapshots; the latest in-season snapshot has 5 (they all carry `espn_id`).                                                                                                                                      | Optional: key them by `espn_id` (`key_type = 'espn'`). Low value.                                                                                                                          |

## Stale at audit time (fixes itself)

- `wh:pbp:2026` stuck at `running` in `sync_log` (id 155): the app closed during the step on 2026-10-14 20:23Z. The last finished play-by-play fetch was 2026-10-12 21:55Z, before Monday night, so **BUF @ LA (2026 week 5)** is missing from `pbp`, and **FTN week 5** has 4 of 32 teams (FTN charts with a lag). The next refresh re-runs the step. The orphan `running` row stays in the log; a startup sweep marking unfinished rows `interrupted` would make that visible.

## Upstream gaps (not fixable here)

- **2023 playoff injuries:** nflverse `injuries_2023` has the Wild Card week only.
- **2026 participation:** published after the season; the step retries daily.
- Skipped rows that hold no player:
  - `ff_opportunity`: ~400 rows a season with no `player_id`; 0 actual points, ~1 270 expected points in 2025 credited to no one. They still count in the `*_team` totals.
  - `nflverse_player`: one blank placeholder row per week, 0 points.
  - `rosters`: 2–29 a season, development / reserve entries without a gsis id.
  - `part`: 716–809 rows a season match no play (deleted plays).

## Looks missing, isn't

- NGS playoff weeks skip the Pro Bowl week (Super Bowl = week 22 / 23); QBR numbers playoff weeks 1–4; week 0 = a season row (NGS, QBR).
- `depth_charts` through 2024 carry an extra REG week after the last regular week (nflverse labelling).
- Players with no 2026 line: Josh Jacobs (rosters status `EXE` every week; Sleeper rows have `gms_active` and no stats), Tyreek Hill (no team), and rostered IR / PUP players.
