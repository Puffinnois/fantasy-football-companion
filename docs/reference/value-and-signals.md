# Value & signals — data reference

What the app computes per player from the synced data, how each number is defined, and where it is shown today. Written for the UI redesign: the **data** sections are the contract (types in `src/shared/types.ts`, computed in `src/main/value/`); the **rendering** section is the current v0.6.0 presentation and is free to change.

Design rationale lives in `docs/superpowers/specs/2026-09-17-slice4-value-and-signals-design.md`; this file documents what shipped.

## How the data reaches the renderer

| Call (`window.api.players`) | Returns                                                                                | Notes                                                                                                                                                                                          |
| --------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `value(season)`             | `PlayersValue { context: ValueContext; rows: PlayerValueRow[] }`                       | One row per candidate player: lineup positions only (`QB RB WR TE K DEF`, FB counted as RB), and the player is rostered in the league, on the watchlist, or on an NFL team and not `Inactive`. |
| `detail(season, playerId)`  | `PlayerDetail { row: PlayerValueRow; weeks: DetailWeek[]; schedule: ScheduleEntry[] }` | Same build, plus the per-week series and the remaining schedule.                                                                                                                               |

Both read a per-(league, season) build cached in the main process (`valueCache` in `src/main/ipc/handlers.ts`). The cache is cleared on a successful sync and on a rules change; a watchlist toggle only re-decorates `watched`. A full-season build costs ~0.1 s (current season) to ~0.5 s (18 played weeks) on the dev DB. Nothing is persisted — every number below is recomputed from the DB.

### Conventions used throughout

- **Game** = a week with a `player_week_points` row for the player (the team played and the player was matched to nflverse). A played week scoring 0 counts; byes and weeks before the player's first appearance do not.
- **Current week** = Sleeper's `nfl_state.week`, clamped to 1–18; a past season is fully played (19), a future one untouched (1).
- **Shares and rates are 0–1 fractions** (`0.24` = 24 %). Points are league points under the league's own scoring rules.
- **`null` = not computable** (gate not met, no data, no projections). The UI renders `—`.
- Points-like values are rounded to 2 decimals in the payload; the UI shows 1.
- Team codes are Sleeper's (`LAR`, `WAS`, …).

## `ValueContext`

| Field               | Meaning                                                                                                                                                                                                                                                                                                                                                                                     |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `season`            | Season the build covers.                                                                                                                                                                                                                                                                                                                                                                    |
| `currentWeek`       | Rest-of-season starts here (see conventions).                                                                                                                                                                                                                                                                                                                                               |
| `projectionsStored` | Whether any Sleeper projection rows exist for the season. When `false`, every ROS field is `null`.                                                                                                                                                                                                                                                                                          |
| `hasMyTeam`         | A `teams` row is flagged `is_me` (set at import from the Sleeper user). When `false`, `vsMine`, `droppable` and every `mine[pos]` are `null`, and the UI hides the Mine group and the My team chip.                                                                                                                                                                                         |
| `mine[pos]`         | `{ playerId, fullName, rosValue } \| null` per lineup position: my startable player (not IR / taxi) with the lowest `rosValue` — the `vsMine` baseline. `null` when I roster nobody startable with a ROS value there.                                                                                                                                                                       |
| `teamCount`         | League size (`leagues.total_rosters`).                                                                                                                                                                                                                                                                                                                                                      |
| `replacement[pos]`  | `{ std, ros }` per lineup position (`QB RB WR TE K DEF`); each is `{ level, starters } \| null`. `starters` = dedicated slots × teams plus the flex slots handed greedily to whichever eligible position has the best next player; `level` = the metric of the `(starters + 1)`-th best player (PPG for `std`, ROS points for `ros`). `null` when no player at the position has the metric. |

## `PlayerValueRow`

### Identity and roster (`PlayerBaseRow`, shared with the week rows)

`playerId`, `fullName`, `position`, `team`, `byeWeek`, `injuryStatus`, `rookie`, `watched`, `ownerRosterId`, `ownerName`, `ownerIsMe` (the owner is the `is_me` team), and `statsAvailable` (false when the player could not be matched to nflverse — value fields that need stats are then `null` and `signals` is `null`).

### Value (added in v0.5.0)

| Field         | Definition                                                                                                                                                                                                                         | `null` when                    |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------ |
| `gamesPlayed` | Number of games (see conventions).                                                                                                                                                                                                 | never (0)                      |
| `ppg`         | Mean league points over games played.                                                                                                                                                                                              | 0 games                        |
| `stdValue`    | `ppg − replacement[pos].std.level`. Can be negative.                                                                                                                                                                               | no PPG or no replacement level |
| `stdRank`     | 1-based rank within the position by `stdValue` (ties: higher PPG, then name).                                                                                                                                                      | no `stdValue`                  |
| `rosPoints`   | Σ of the player's Sleeper projections, scored with the league's rules, for weeks `≥ currentWeek` that have **no** points row for this player (so a Thursday player's week counts as played while everyone else's stays projected). | no projections stored          |
| `rosValue`    | `rosPoints − replacement[pos].ros.level`.                                                                                                                                                                                          | no ROS or no replacement level |
| `rosRank`     | Rank within position by `rosValue`.                                                                                                                                                                                                | no `rosValue`                  |
| `overallRank` | Rank across all positions by `rosValue`.                                                                                                                                                                                           | no `rosValue`                  |

### Roster-relative (added in v0.7.0)

Spec §4; computed in `src/main/value/roster.ts`, same position only (FLEX is in the replacement level but cross-position drops need a lineup model — slice 6).

| Field       | Definition                                                                                                                                                                                                                                                                         | `null` when                                                                                  |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `vsMine`    | Free agents only: `rosValue − mine[pos].rosValue`. Can be negative; 0 when equal.                                                                                                                                                                                                  | rostered by anyone (mine or not), no `mine[pos]`, no `rosValue` on either side, no team mine |
| `droppable` | My startable players only: `{ playerId, fullName, delta }` of the best free agent at the position when its `rosValue` is **strictly** higher; `delta` = its `rosValue − mine`. Several of my players can carry it; the one on my weakest player equals that free agent's `vsMine`. | not mine, IR / taxi, no better free agent, no `rosValue` on either side, no team mine        |

### `signals: PlayerSignals | null` (added in v0.6.0)

`null` for players unmatched to nflverse. Otherwise every sub-field is present and individually nullable. Computed in `src/main/value/signals.ts` (usage, efficiency, projection, consistency) and `src/main/value/schedule.ts` (schedule); all thresholds are exported constants of `signals.ts`.

#### Usage trends — `signals.usage.{snapPct, targetShare, rushShare, airYardsShare, wopr}`

Each is `UsageTrend | null` with `{ season, recent, trend }`:

| Part     | Definition                                                                                                                                                                                             |
| -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `season` | Mean of the metric over the games that have it.                                                                                                                                                        |
| `recent` | Mean over the last `RECENT_GAMES = 3` of those games (fewer → all of them, so `recent = season`).                                                                                                      |
| `trend`  | `'rising'` when `recent − season ≥ threshold`, `'falling'` when `≤ −threshold`, else `'flat'`. Threshold `SNAP_TREND_THRESHOLD = 0.05` for snap %, `SHARE_TREND_THRESHOLD = 0.03` for the four shares. |

Gate: `MIN_GAMES_USAGE = 2` games **with the metric** (a played week without a snap row is not a snap-% game). Per-week sources:

| Metric          | Source                                                                          |
| --------------- | ------------------------------------------------------------------------------- |
| `snapPct`       | `player_week_snaps.offense_pct`                                                 |
| `targetShare`   | nflverse `target_share`, else `targets / team pass attempts`                    |
| `rushShare`     | `carries / team rush attempts`                                                  |
| `airYardsShare` | nflverse `air_yards_share`, else `receiving_air_yards / team passing air yards` |
| `wopr`          | nflverse `wopr`, else `1.5 × targetShare + 0.7 × airYardsShare`                 |

DEF and K rows have no per-player usage, so all five are `null`. **Primary usage metric** per position (what the table's USAGE column shows): WR/TE → `targetShare`, RB → `snapPct`, QB/K/DEF → none (`PRIMARY_USAGE` in `src/renderer/src/lib/playersTableView.ts`).

#### Efficiency and regression

| Field                               | Definition                                                                                                                                        | `null` when                                               |
| ----------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------- |
| _opportunities_ (not exported)      | Per game, from the Sleeper-keyed line: RB/WR/TE → `rec_tgt + rush_att`; QB → `pass_att + rush_att`; K/DEF → none.                                 | —                                                         |
| _positional TD rate_ (not exported) | Σ TDs / Σ opportunities over **every** candidate at the position for the season (rostered or not). TDs = `rush_td + rec_td` (+ `pass_td` for QB). | —                                                         |
| `tdDelta`                           | `actual TDs − opportunities × positional TD rate`. Positive = scored more TDs than the opportunities predict.                                     | K/DEF; 0 opportunities; position has no opportunities yet |
| `tdFlag`                            | `'down'` when `tdDelta ≥ TD_FLAG_THRESHOLD (1.5)` (regression candidate), `'up'` when `≤ −1.5` (due for more), else `null`.                       | `tdDelta` null or inside the band                         |
| `ypo`                               | Yards per opportunity: `(rush_yd + rec_yd [+ pass_yd for QB]) / opportunities`.                                                                   | K/DEF; 0 opportunities                                    |
| `ypoDelta`                          | `ypo − positional mean ypo` (opportunity-weighted: Σ yards / Σ opportunities across the position).                                                | as `ypo`, or no positional totals                         |

#### Projection accuracy

| Field          | Definition                                                               | `null` when                    |
| -------------- | ------------------------------------------------------------------------ | ------------------------------ |
| `vsProjPoints` | Over played weeks that also have a projection: `Σ points − Σ projected`. | no such week                   |
| `vsProjPct`    | `vsProjPoints / Σ projected`.                                            | as above, or `Σ projected = 0` |

#### Consistency

Gate: `MIN_GAMES_CONSISTENCY = 3` games; below it all four are `null`.

| Field       | Definition                                                                                                                                           |
| ----------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| `floor`     | 25th percentile of weekly points (linear interpolation between ranks).                                                                               |
| `ceiling`   | 75th percentile.                                                                                                                                     |
| `stdev`     | Population standard deviation of weekly points.                                                                                                      |
| `startRate` | Share of games with points `≥ replacement[pos].std.level` ("would have been worth starting"). `null` when the position has no STD replacement level. |

#### Schedule

Built from the regular-season `games` table (Sleeper codes) and the played weeks.

| Field                                                                         | Definition                                                                                                                                                                                                                                                                                                                                                                                                               | `null` / 0 when                                                       |
| ----------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------- |
| _defense-vs-position rank_ (per `ScheduleEntry.rank` and `nextOpponent.rank`) | For every defense `T` and position: the mean, over `T`'s **played** weeks (weeks with any points row against `T`), of the league points scored against `T` by players at that position. Ranked ascending: **1 = allows the fewest = hardest matchup**, N = easiest, where N is the number of defenses that have played (≤ 32; small early in the season). Uniform for K and DEF (points by opposing kickers / defenses). | defense has not played yet                                            |
| `nextOpponent`                                                                | `{ team, rank }` for the first remaining week (`≥ currentWeek`, not yet played by this player).                                                                                                                                                                                                                                                                                                                          | that week is a bye; season over; player has no team / no stored games |
| `rosSos`                                                                      | Mean rank of the **ranked** remaining opponents. Low = hard schedule.                                                                                                                                                                                                                                                                                                                                                    | no ranked remaining opponent                                          |
| `byesRemaining`                                                               | Remaining weeks (from `currentWeek` to the last week with any stored game) in which the player's team has no game.                                                                                                                                                                                                                                                                                                       | 0 when the team has no stored game                                    |

## `PlayerDetail`

| Field                       | Content                                                                                                                                                                                                                                                                                                                                                               |
| --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `row`                       | The player's `PlayerValueRow` (as above).                                                                                                                                                                                                                                                                                                                             |
| `weeks: DetailWeek[]`       | Every week 1–18 with a game, a projection or a points row, ascending: `week`, `opponent`, `played`, `points`, `projected` (scored under league rules), `snapPct`, `targetShare`, `rushShare`, `wopr`, and `stats` — the actual line in **Sleeper stat keys** (`rush_att`, `rec_tgt`, `pass_yd`, …, plus display-only `fga`, `xpa`, `fgm_0_39`); `{}` when not played. |
| `schedule: ScheduleEntry[]` | Remaining weeks for the player's team: `{ week, opponent, rank }`, `opponent: null` on a bye, `rank: null` when that defense is unranked at the player's position. Empty when the season is over or the team has no stored games.                                                                                                                                     |

## Constants (single sources)

| Where                                                     | Constants                                                                                                                                                                                               |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/main/value/signals.ts`                               | `RECENT_GAMES = 3`, `SHARE_TREND_THRESHOLD = 0.03`, `SNAP_TREND_THRESHOLD = 0.05`, `MIN_GAMES_USAGE = 2`, `MIN_GAMES_CONSISTENCY = 3`, `TD_FLAG_THRESHOLD = 1.5`, `OPPORTUNITY_POSITIONS = QB RB WR TE` |
| `src/main/value/roster.ts`                                | `UNSTARTABLE_SLOTS = {ir, taxi}` — roster slots that never count as "my players at the position"                                                                                                        |
| `src/renderer/src/lib/playersTableView.ts` (display only) | `PRIMARY_USAGE` (RB → snap %, WR/TE → target share), `TREND_ARROW` (↑ → ↓), SOS tint buckets `SOS_HARD_MAX = 11` / `SOS_EASY_MIN = 22`                                                                  |

## Where each number is shown today (v0.7.0)

### Players table, Value mode (`columnGroups(tab, 'value')` — identical on every position tab)

| Group          | Column  | Field                                                                                                                                                | Format         | Colour               |
| -------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | -------------------- |
| Season         | G       | `gamesPlayed`                                                                                                                                        | integer        | —                    |
|                | PPG     | `ppg`                                                                                                                                                | 1 decimal      | —                    |
|                | VAL     | `stdValue`                                                                                                                                           | signed         | green ≥ 0 / red < 0  |
|                | RK      | `stdRank`                                                                                                                                            | integer        | —                    |
| Rest of season | ROS     | `rosPoints`                                                                                                                                          | 1 decimal      | —                    |
|                | VAL     | `rosValue`                                                                                                                                           | signed, bold   | green / red          |
|                | RK      | `rosRank`                                                                                                                                            | integer        | —                    |
|                | SOS     | `signals.rosSos`                                                                                                                                     | 1 decimal      | red ≤ 11, green ≥ 22 |
|                | BYES    | `signals.byesRemaining`                                                                                                                              | integer        | —                    |
| Signals        | FLOOR   | `signals.floor`                                                                                                                                      | 1 decimal      | —                    |
|                | CEIL    | `signals.ceiling`                                                                                                                                    | 1 decimal      | —                    |
|                | START%  | `signals.startRate`                                                                                                                                  | percent        | —                    |
|                | USAGE   | primary usage `recent` + trend arrow (`27% ↑`)                                                                                                       | percent        | —                    |
|                | TD      | `signals.tdFlag` as a badge: `↓` regression candidate (red), `↑` due for more (green), blank when inside the band, `—` when null; sorts by `tdDelta` | badge          | red / green          |
|                | VS PROJ | `signals.vsProjPct`                                                                                                                                  | signed percent | green ≥ 0 / red < 0  |
| Mine           | VS MINE | `vsMine`                                                                                                                                             | signed         | green ≥ 0 / red < 0  |
|                | DROP?   | `droppable` as a marker `●` (red) with the free agent's name and delta in the cell tooltip; blank otherwise; sorts by `delta`                        | marker         | red                  |

Default sort: ROS VAL descending (the ALL tab is therefore a cross-position ranking). Every column sorts; `null` sorts last in both directions. Header tooltips carry each column's one-line definition (`Column.description`), and the VAL headers add the tab positions' replacement levels. The ⓘ button opens `ValueHelp` (definitions, the Signals list generated from the same descriptions, the league's replacement table). The Mine group exists only when `context.hasMyTeam`; the VS MINE header tooltip lists `mine[pos]` for the tab positions, and an empty VS MINE cell of a free agent reads "no K rostered" when `mine[pos]` is null. The **My team** chip (all modes, shown when a team is mine) filters on `ownerIsMe`.

Not shown in the table: `stdev`, `ypo`, `ypoDelta`, `vsProjPoints`, `tdDelta` as a number, the four non-primary usage trends, `nextOpponent`, `overallRank`.

### Player detail panel (`PlayerDetailPanel`, from `players.detail`)

1. **Header strip** — PPG (`gamesPlayed` G) · Season VAL (`stdRank`) · ROS VAL (`rosRank`, `rosPoints`) · Next (`nextOpponent.team`, "DvP rank N" / "DvP unranked"; `BYE` when the next week is a bye) · Byes (`byesRemaining`).
2. **Points vs projection** — `BarsVsMarker` over `weeks` that were played or have a projection: bar = `points`, tick = `projected`, x = week; hover title per week. "No projections stored" note when `rosPoints` is null.
3. **Usage** — one `Sparkline` per row of `usageRows(position)` over the played weeks' `DetailWeek` values, with `season` / `recent` / trend from `signals.usage`: QB → snap %; RB → snap %, rush share, WOPR; WR/TE → snap %, target share, WOPR; K/DEF → section hidden. "— (needs 2 games)" below the gate.
4. **Signals** — text lines from `signalLines()`: TDs `tdDelta` vs expected (+ flag wording) · Yds/opp `ypo` and `ypoDelta` · vs projection `vsProjPoints` (`vsProjPct`) · Floor/Ceiling/start-worthy (`floor`, `ceiling`, `startRate`) or "Consistency: needs 3 games (N played)".
5. **Upcoming schedule** — one chip per `schedule` entry: `Wk N OPP · rank`, `BYE` for byes, tinted with the SOS buckets.
6. **Game log** — played `weeks`: points, snap %, and the position's stat columns from `stats`.

Not shown in the panel: `stdev`, `airYardsShare`, `overallRank`.

## Module map

| Module                                            | Role                                                                                                                                     |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `src/main/value/series.ts`                        | The only DB reader: per player and week — points, scored projection, Sleeper-keyed line, usage shares, opponent; plus the team schedule. |
| `src/main/value/replacement.ts`                   | Starter counts (greedy flex) and replacement levels.                                                                                     |
| `src/main/value/signals.ts`                       | Usage trends, opportunities / production, positional totals, percentiles, `statSignals`.                                                 |
| `src/main/value/schedule.ts`                      | Defense-vs-position ranks, per-player remaining schedule (`nextOpponent`, `rosSos`, `byesRemaining`).                                    |
| `src/main/value/roster.ts`                        | Roster-relative view: `vsMine`, `droppable`, my per-position baseline.                                                                   |
| `src/main/value/build.ts`                         | Assembles rows, context, detail.                                                                                                         |
| `src/renderer/src/lib/playersTableView.ts`        | Column model, cell values/text/tones, sorting.                                                                                           |
| `src/renderer/src/lib/detailView.ts`, `charts.ts` | Panel view model (usage rows, bar items, signal text) and SVG geometry.                                                                  |
