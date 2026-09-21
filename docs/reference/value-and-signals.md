# Value & signals — data reference

What the app computes per player from the synced data, how each number is defined, and where it is shown today. Written for the UI redesign: the **data** sections are the contract (types in `src/shared/types.ts`, computed in `src/main/value/`); the **rendering** section is the current v0.12.0 presentation and is free to change.

Design rationale lives in `docs/superpowers/specs/2026-09-17-slice4-value-and-signals-design.md`; slice 5 (expert layer) rationale in `docs/superpowers/specs/2026-09-18-slice5-expert-layer-design.md`; slice 6a (lineup model) rationale in `docs/superpowers/specs/2026-09-20-slice6a-lineup-model-design.md`. This file documents what shipped.

## How the data reaches the renderer

| Call (`window.api.players`)                           | Returns                                                                                | Notes                                                                                                                                                                                                                                                                                                                                            |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `value(season)`                                       | `PlayersValue { context: ValueContext; rows: PlayerValueRow[] }`                       | One row per candidate player: lineup positions only (`QB RB WR TE K DEF`, FB counted as RB), and the player is rostered in the league, on the watchlist, or on an NFL team and not `Inactive`.                                                                                                                                                   |
| `detail(season, playerId)`                            | `PlayerDetail { row: PlayerValueRow; weeks: DetailWeek[]; schedule: ScheduleEntry[] }` | Same build, plus the per-week series and the remaining schedule.                                                                                                                                                                                                                                                                                 |
| `week({ season, week })`                              | `PlayersWeek { rows: PlayerWeekRow[] }`                                                | Same candidates with one week of data; since v0.8.0 each row also carries `expert: ExpertWeek \| null` — this week's FantasyPros `{ ecrPosRank, grade, projPts, spread }`.                                                                                                                                                                       |
| `news(playerId, force?)`                              | `PlayerNews { items: NewsItem[]; fetchedAt: string }`                                  | Sleeper's aggregated player news (FantasyPros, RotoWire, RotoBaller), newest first, ≤ 25 items. Not from the value build: its own per-player in-memory cache (`src/main/news/newsCache.ts`, 15 min), `force` refetches, failures are never cached, nothing is stored, nothing in `sync_log`. Empty for team defenses.                            |
| `lineup.week({ season, week })` (`window.api.lineup`) | `LineupWeek`                                                                           | My team and its opponent for the week: optimal lineup, the lineup set on Sleeper, swaps, close calls, bench, unavailable, status. Built from the value build plus `matchups`, `roster_players.starter_index` and Sleeper's `roster_positions`; cached with the value build (same invalidation). FantasyPros weekly rank/grade attached per call. |
| `lineup.strength(season)`                             | `TeamStrength[]`                                                                       | Every team's optimal totals over weeks `currentWeek..18` on its current roster, ranked; `null` without projections or after the season. Shown on the League screen cards (`ROS {rosTotal} · #{rank}`) and drives their _ROS strength_ sort.                                                                                                      |

Both read a per-(league, season) build cached in the main process (`valueCache` in `src/main/ipc/handlers.ts`). The cache is cleared on a successful sync and on a rules change; a watchlist toggle only re-decorates `watched`. A full-season build costs ~0.1 s (current season) to ~0.5 s (18 played weeks) on the dev DB. Nothing is persisted — every number below is recomputed from the DB.

### Conventions used throughout

- **Game** = a week with a `player_week_points` row for the player (the team played and the player was matched to nflverse). A played week scoring 0 counts; byes and weeks before the player's first appearance do not.
- **Current week** = Sleeper's `nfl_state.week`, clamped to 1–18; a past season is fully played (19), a future one untouched (1).
- **Shares and rates are 0–1 fractions** (`0.24` = 24 %). Points are league points under the league's own scoring rules.
- **`null` = not computable** (gate not met, no data, no projections). The UI renders `—`.
- Points-like values are rounded to 2 decimals in the payload and shown with 2 (as Sleeper does); other one-decimal stats (SOS, expert spread, TD delta, yards per opportunity) keep 1.
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
| `expert`            | `{ scoring, ecrUpdatedAt, marketUpdatedAt }`: the FantasyPros scoring bucket derived from the rules' `rec` points (`PPR` ≥ 1, `HALF` in (0, 1), else `STD`), and the `updated_at` of the stored ROS rankings / market values (`null` when none are stored — e.g. a past season).                                                                                                            |
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

### Experts (added in v0.8.0)

Slice 5 spec §4; attached in `src/main/value/expert.ts` from `expert_ranks` (week 0 = rest of season) and `market_values`, both synced by `src/main/sync/expertSync.ts` from keyless endpoints (FantasyPros legacy partner API, FantasyCalc). Current season only; both blocks are `null` for past seasons.

| Field               | Definition                                                                                                                                                                                                                                                                            | `null` when                                       |
| ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| `expert.ecrRank`    | FantasyPros rest-of-season expert consensus rank, overall across positions.                                                                                                                                                                                                           | no FP ROS row for the player (whole block `null`) |
| `expert.ecrPosRank` | The same rank within the player's position (numeric part of FP's `RB12`).                                                                                                                                                                                                             | —                                                 |
| `expert.spread`     | `rank_std`: standard deviation of the experts' ranks — disagreement.                                                                                                                                                                                                                  | FP omits it                                       |
| `expert.experts`    | Number of experts behind the consensus (ROS: ~6).                                                                                                                                                                                                                                     | —                                                 |
| `expert.ecrDelta`   | `ecrPosRank − rosRank`. **Positive = we rank the player higher than the experts** (they are cheaper than we think: buy cue); negative = lower (sell-high cue). No team-count adjustment: both ranks are ordinal within position, but FLEX is in our replacement level and not in ECR. | no `rosRank`                                      |
| `market.value`      | FantasyCalc redraft trade value (top ≈ 10 000), from real Sleeper/MFL trades; format-agnostic.                                                                                                                                                                                        | outside FantasyCalc's list (whole block `null`)   |
| `market.posRank`    | FantasyCalc rank within position.                                                                                                                                                                                                                                                     | —                                                 |
| `market.tier`       | FantasyCalc tier.                                                                                                                                                                                                                                                                     | FantasyCalc gives none                            |
| `market.trend30d`   | 30-day change of `value`.                                                                                                                                                                                                                                                             | —                                                 |

Join (spec §3.3): FP `player_id` → `crosswalk.fantasypros_id` → Sleeper id, else normalized name + position against Sleeper players, DST by team code through `FP_TO_SLEEPER_TEAM` (`JAC → JAX`); unmatched rows are dropped and counted in the step message. FantasyCalc rows join on their own `sleeperId`.

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

## `PlayerNews` (added in v0.9.0)

Slice 5 spec §5; fetched on demand by `src/main/sources/sleeperNews.ts` (`POST https://sleeper.com/graphql`, `get_player_news`, keyless, 8 s timeout) and shaped by its pure mapper. Transient: never written to the DB.

| Field                 | Content                                                                                                                                                  |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `items[].id`          | `${source}:${source_key}` — unique per outlet article (React key).                                                                                       |
| `items[].source`      | `fantasy_pros` \| `rotowire` \| `rotoballer` \| any outlet Sleeper adds (`unknown` when missing). Rendered as `FP` / `RW` / `RB` / raw by `sourceBadge`. |
| `items[].publishedAt` | ISO, from Sleeper's millisecond timestamp. Items without one are dropped.                                                                                |
| `items[].title`       | Headline; items without one are dropped.                                                                                                                 |
| `items[].description` | Factual one-liner, `null` when blank.                                                                                                                    |
| `items[].analysis`    | Analyst paragraph, `null` when the outlet gives none (RotoBaller).                                                                                       |
| `items[].url`         | Source article; `null` unless `http(s)`.                                                                                                                 |
| `fetchedAt`           | When the main process fetched it (shown as the section note).                                                                                            |

## Lineup (added in v0.10.0)

Slice 6a spec §2–§4; engine `src/main/lineup/optimal.ts` (pure), assembly `src/main/lineup/build.ts`, matchups synced by `src/main/sync/matchupsSync.ts` (one step `sleeper:matchups:{season}`, weeks 1–18; past weeks re-fetched after 30 d, current and future weeks every refresh) into `matchups` (migration 006).

### Conventions

- **Lineup slots** = the league's `rosterSlots` expanded one entry per slot in Sleeper's order: `QB RB WR TE K DEF` take their position, `FLEX / SUPER_FLEX / REC_FLEX / WRRB_FLEX` take `FLEX_ELIGIBILITY`; `BN IR TAXI`, IDP and unknown slots are not lineup slots.
- **Week value** = `points` when the week is played, else the league-scored projection, else 0 (bye, no projection) — the `rosPoints` rule.
- **Availability** — `ir` / `taxi` players never start (from the current week on). In the **current week only**, `injuryStatus ∈ UNAVAILABLE_STATUSES` (`Out Doubtful IR PUP Sus COV NA DNR`) → value 0, listed under `unavailable`; `Questionable` keeps its value and is flagged. Future weeks use raw projections.
- **Optimal** = exact maximum-weight assignment (Hungarian); every slot that can be filled is filled; ties are seated deterministically (dedicated slots first, best player; then flex from the most restrictive).
- **Current lineup** = Sleeper's `starters` mapped onto `roster_positions` minus `BN IR TAXI` (`'0'` = empty). Source: the week's `matchups` row, else `roster_players.starter_index` for the current week, else `null`.
- **Roster basis** — a past week uses the roster that played (`matchups.players_json`); the current and future weeks use the current roster.

### `LineupWeek`

| Field                           | Meaning                                                                                                                                          |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| `season`, `week`, `currentWeek` | As the value build.                                                                                                                              |
| `status`                        | `final` before the current week (and in it once every player with a game has played), `upcoming` after it or before any game, else `inProgress`. |
| `projectionsStored`             | As `ValueContext`; when false values are actuals only.                                                                                           |
| `matchupId`                     | Sleeper's pairing id for my team that week; `null` on a bye / without a row.                                                                     |
| `me`                            | `TeamLineup` for the `is_me` team; `null` without one.                                                                                           |
| `opponent`                      | `TeamLineup` for the roster sharing `matchupId`; `null` otherwise.                                                                               |

### `TeamLineup`

| Field                       | Meaning                                                                                                                                                                                                                       |
| --------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `optimal[]`                 | One `SlotEntry { slot, player, closeCall }` per lineup slot; `player` null when nobody eligible is left; `closeCall` = best eligible bench player within `CLOSE_CALL_PTS = 2.0`.                                              |
| `optimalTotal`              | Σ values of the optimal starters.                                                                                                                                                                                             |
| `current[]`, `currentTotal` | The Sleeper lineup as `SlotEntry` (no close calls) and its Σ; `null` when unknown.                                                                                                                                            |
| `actualTotal`               | Sleeper's `points` for a `final` week; `null` otherwise.                                                                                                                                                                      |
| `bench[]`                   | Startable players left out, best first.                                                                                                                                                                                       |
| `unavailable[]`             | IR / taxi and current-week Out / Doubtful players.                                                                                                                                                                            |
| `swaps[]`                   | `{ slot, out, in, delta }`: starters the optimal lineup adds, each paired with one it removes (same position first, weakest first); `out` null when the current slot was empty; a player who only changes slot is not a swap. |

### `LineupPlayer`

`playerId`, `fullName`, `position`, `team`, `statsAvailable` (the `DetailTarget` the detail panel opens on), `opponent` (NFL, `null` on a bye), `dvpRank` (that opponent's defense-vs-position rank at the player's position, 1 = hardest), `value`, `played`, `injuryStatus`, `flag` (`out | doubtful | questionable | bye | null`), `expert` (`{ ecrPosRank, grade }` from FantasyPros weekly, `null` without a row), `floor`, `ceiling` (from `signals`).

### `TeamStrength`

`rosterId`, `name`, `isMe`, `thisWeek` (optimal total of the current week), `rosTotal` (Σ over `currentWeek..18`), `rosPerWeek`, `rank` (1 = strongest). All `null` when `!projectionsStored` or the season is over.

### Where it is shown (v0.12.0) — Lineup screen

1. **Header** — week picker (default `currentWeek`); `You {optimalTotal} optimal · {currentTotal} current vs {opponent.name} {currentTotal ?? optimalTotal} current|optimal`; final weeks `You {actualTotal} – {opponent} {actualTotal} · W/L/T` and `Left on bench: +Δ` (`optimalTotal − actualTotal`) for both sides; notes `No matchup this week`, `No projections stored — values are actuals only`, `Your team isn't identified — re-import from Setup`.
2. **Slot table** — Slot · Your starter · Pts · Optimal · Pts · Δ; rows whose optimal starter is not among the current starters are tinted and carry Δ = `value(optimal) − value(current in that slot ?? 0)`; `≈ {alt}` (amber) with the close-call tooltip (both players' value, floor/ceiling, ECR + grade, opponent + DvP); flags `Q` amber, `D`/`O` red, `BYE` muted; names open `PlayerDetailPanel`.
3. **Swaps** — `Start A over B (SLOT, +Δ)`; empty states `Your lineup is optimal` / `Lineup not set on Sleeper yet`.
4. **Bench** / **Unavailable** — name, team, opponent, flag, value.
5. **Opponent** — a collapsed card `Opponent · {name}` (`aria-expanded` toggle) with the opponent's slot table (`Their starter` · Pts · Optimal · Pts · Δ, same tinting and close calls) and **Their swaps** (`Start A over B (SLOT, +Δ)`; empty states `Their lineup is optimal` / `Lineup not set on Sleeper yet`). Hidden when `opponent` is null.

### Where it is shown (v0.12.0) — League screen

Each team card's third line is `ROS {rosTotal} · #{rank}` (`ROS —` when null; tooltip = the basis note). The header toggle **Record / ROS strength** (default Record) orders the cards by standings (wins, ties, points for) or by `rank` ascending with unranked teams last; while ROS strength is selected the note "Optimal lineup on Sleeper projections under your scoring, summed over the remaining weeks" is shown under the toggle. Helpers: `lib/leagueView.ts` (`rosLine`, `sortTeams`, `STRENGTH_NOTE`).

Not shown yet: `TeamStrength.thisWeek` / `rosPerWeek` (in the payload), `expert` on bench players (in the payload).

## Constants (single sources)

| Where                                                           | Constants                                                                                                                                                                                               |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/main/value/signals.ts`                                     | `RECENT_GAMES = 3`, `SHARE_TREND_THRESHOLD = 0.03`, `SNAP_TREND_THRESHOLD = 0.05`, `MIN_GAMES_USAGE = 2`, `MIN_GAMES_CONSISTENCY = 3`, `TD_FLAG_THRESHOLD = 1.5`, `OPPORTUNITY_POSITIONS = QB RB WR TE` |
| `src/main/value/roster.ts`                                      | `UNSTARTABLE_SLOTS = {ir, taxi}` — roster slots that never count as "my players at the position"                                                                                                        |
| `src/main/sync/expertSync.ts`                                   | `FP_PAST_WEEK_FRESHNESS_MS = 30 d`, `FP_CURRENT_WEEK_FRESHNESS_MS = 3 h`, `FP_ROS_FRESHNESS_MS = 12 h`, `FANTASYCALC_FRESHNESS_MS = 12 h`, `WEEKLY_POSITIONS = FLX QB K DST`                            |
| `src/shared/rules.ts`, `src/shared/teams.ts`                    | `scoringFormat(rules)` (rec ≥ 1 PPR / (0, 1) HALF / STD), `FP_TO_SLEEPER_TEAM = { JAC: 'JAX' }`                                                                                                         |
| `src/main/sources/sleeperNews.ts`, `src/main/news/newsCache.ts` | `NEWS_LIMIT = 25`, `NEWS_TIMEOUT_MS = 8 s`, `SLEEPER_NEWS_USER_AGENT`, `NEWS_TTL_MS = 15 min`, `NEWS_CACHE_MAX = 64`                                                                                    |
| `src/renderer/src/lib/playersTableView.ts` (display only)       | `PRIMARY_USAGE` (RB → snap %, WR/TE → target share), `TREND_ARROW` (↑ → ↓), SOS tint buckets `SOS_HARD_MAX = 11` / `SOS_EASY_MIN = 22`, `ECR_DELTA_TONE = 3`, `GRADE_ORDER` (F … A+)                    |
| `src/renderer/src/lib/newsView.ts` (display only)               | `NEWS_PAGE_SIZE = 8`, badge map `fantasy_pros → FP`, `rotowire → RW`, `rotoballer → RB`                                                                                                                 |
| `src/main/lineup/optimal.ts`, `src/main/sync/matchupsSync.ts`   | `CLOSE_CALL_PTS = 2`, `UNAVAILABLE_STATUSES` (`Out Doubtful IR PUP Sus COV NA DNR`), `QUESTIONABLE_STATUS`, `RESERVE_SLOTS = BN IR TAXI`; `MATCHUPS_PAST_FRESHNESS_MS = 30 d`                           |

## Where each number is shown today (v0.12.0)

### Players table, Value mode (`columnGroups(tab, 'value')` — identical on every position tab)

| Group          | Column  | Field                                                                                                                                                | Format         | Colour                  |
| -------------- | ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- | ----------------------- |
| Season         | G       | `gamesPlayed`                                                                                                                                        | integer        | —                       |
|                | PPG     | `ppg`                                                                                                                                                | 2 decimals     | —                       |
|                | VAL     | `stdValue`                                                                                                                                           | signed         | green ≥ 0 / red < 0     |
|                | RK      | `stdRank`                                                                                                                                            | integer        | —                       |
| Rest of season | ROS     | `rosPoints`                                                                                                                                          | 2 decimals     | —                       |
|                | VAL     | `rosValue`                                                                                                                                           | signed, bold   | green / red             |
|                | RK      | `rosRank`                                                                                                                                            | integer        | —                       |
|                | SOS     | `signals.rosSos`                                                                                                                                     | 1 decimal      | red ≤ 11, green ≥ 22    |
|                | BYES    | `signals.byesRemaining`                                                                                                                              | integer        | —                       |
| Signals        | FLOOR   | `signals.floor`                                                                                                                                      | 2 decimals     | —                       |
|                | CEIL    | `signals.ceiling`                                                                                                                                    | 2 decimals     | —                       |
|                | START%  | `signals.startRate`                                                                                                                                  | percent        | —                       |
|                | USAGE   | primary usage `recent` + trend arrow (`27% ↑`)                                                                                                       | percent        | —                       |
|                | TD      | `signals.tdFlag` as a badge: `↓` regression candidate (red), `↑` due for more (green), blank when inside the band, `—` when null; sorts by `tdDelta` | badge          | red / green             |
|                | VS PROJ | `signals.vsProjPct`                                                                                                                                  | signed percent | green ≥ 0 / red < 0     |
| Experts        | ECR     | `expert.ecrPosRank`                                                                                                                                  | integer        | —                       |
|                | Δ ECR   | `expert.ecrDelta`                                                                                                                                    | signed integer | green > +3 / amber < −3 |
|                | SPREAD  | `expert.spread`                                                                                                                                      | 1 decimal      | —                       |
|                | MKT     | `market.value`                                                                                                                                       | integer        | —                       |
|                | TREND   | `market.trend30d`                                                                                                                                    | signed integer | green ≥ 0 / red < 0     |
| Mine           | VS MINE | `vsMine`                                                                                                                                             | signed         | green ≥ 0 / red < 0     |
|                | DROP?   | `droppable` as a marker `●` (red) with the free agent's name and delta in the cell tooltip; blank otherwise; sorts by `delta`                        | marker         | red                     |

Default sort: ROS VAL descending (the ALL tab is therefore a cross-position ranking). Every column sorts; `null` sorts last in both directions. Header tooltips carry each column's one-line definition (`Column.description`), and the VAL headers add the tab positions' replacement levels. The ⓘ button opens `ValueHelp` (definitions, the Signals list generated from the same descriptions, the league's replacement table). The Mine group exists only when `context.hasMyTeam`; the VS MINE header tooltip lists `mine[pos]` for the tab positions, and an empty VS MINE cell of a free agent reads "no K rostered" when `mine[pos]` is null. The **My team** chip (all modes, shown when a team is mine) filters on `ownerIsMe`.

**Projection mode** gains an Experts group right after Fantasy on every tab: `ECR` (`PlayerWeekRow.expert.ecrPosRank`) and `GRADE` (`expert.grade`, shown as the letter, sorted by `GRADE_ORDER`). Stats mode is unchanged. The ⓘ help panel's Experts section lists the sources, the synced scoring bucket, how to read Δ ECR, and the freshness of both stores.

Not shown in the table: `stdev`, `ypo`, `ypoDelta`, `vsProjPoints`, `tdDelta` as a number, the four non-primary usage trends, `nextOpponent`, `overallRank`, `expert.ecrRank`, `expert.experts`, `market.posRank`, `market.tier`, `ExpertWeek.projPts` / `.spread`.

### Player detail panel (`PlayerDetailPanel`, from `players.detail`)

1. **Header strip** — PPG (`gamesPlayed` G) · Season VAL (`stdRank`) · ROS VAL (`rosRank`, `rosPoints`) · Next (`nextOpponent.team`, "DvP rank N" / "DvP unranked"; `BYE` when the next week is a bye) · Byes (`byesRemaining`).
2. **Points vs projection** — `BarsVsMarker` over `weeks` that were played or have a projection: bar = `points`, tick = `projected`, x = week; hover title per week. "No projections stored" note when `rosPoints` is null.
3. **Usage** — one `Sparkline` per row of `usageRows(position)` over the played weeks' `DetailWeek` values, with `season` / `recent` / trend from `signals.usage`: QB → snap %; RB → snap %, rush share, WOPR; WR/TE → snap %, target share, WOPR; K/DEF → section hidden. "— (needs 2 games)" below the gate.
4. **Signals** — text lines from `signalLines()`: TDs `tdDelta` vs expected (+ flag wording) · Yds/opp `ypo` and `ypoDelta` · vs projection `vsProjPoints` (`vsProjPct`) · Floor/Ceiling/start-worthy (`floor`, `ceiling`, `startRate`) or "Consistency: needs 3 games (N played)".
5. **Upcoming schedule** — one chip per `schedule` entry: `Wk N OPP · rank`, `BYE` for byes, tinted with the SOS buckets.
6. **Game log** — played `weeks`: points, snap %, and the position's stat columns from `stats`.
7. **News** — `NewsSection` from `players.news`, under the game log, requested when the panel opens in parallel with `players.detail`: per item a source badge, `newsAge` (`5m` / `2h` / `3d` / `Sep 12`), the title (a link opening in the system browser through `setWindowOpenHandler`), the description, and an _Analysis_ toggle open on the newest item only; 8 items then "Show more (N)". States: skeleton / "Couldn't load news" + Retry (`force`) / "No news". Not rendered for DEF rows.

Not shown in the panel: `stdev`, `airYardsShare`, `overallRank`.

## Module map

| Module                                                                                                                            | Role                                                                                                                                     |
| --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------- |
| `src/main/value/series.ts`                                                                                                        | The only DB reader: per player and week — points, scored projection, Sleeper-keyed line, usage shares, opponent; plus the team schedule. |
| `src/main/value/replacement.ts`                                                                                                   | Starter counts (greedy flex) and replacement levels.                                                                                     |
| `src/main/value/signals.ts`                                                                                                       | Usage trends, opportunities / production, positional totals, percentiles, `statSignals`.                                                 |
| `src/main/value/schedule.ts`                                                                                                      | Defense-vs-position ranks, per-player remaining schedule (`nextOpponent`, `rosSos`, `byesRemaining`).                                    |
| `src/main/value/roster.ts`                                                                                                        | Roster-relative view: `vsMine`, `droppable`, my per-position baseline.                                                                   |
| `src/main/value/expert.ts`                                                                                                        | Pure attach of the expert / market blocks and `ecrDelta`; `expertWeek` for the week rows.                                                |
| `src/main/value/build.ts`                                                                                                         | Assembles rows, context, detail.                                                                                                         |
| `src/main/sync/expertSync.ts`, `src/main/sources/{fantasypros,fantasycalc}.ts`, `src/main/db/repos/{expertRanks,marketValues}.ts` | Expert-layer sync: clients, FP → Sleeper join, one `sync_log` step per unit, replace-per-key storage.                                    |
| `src/main/sources/sleeperNews.ts`, `src/main/news/newsCache.ts`                                                                   | Player news: GraphQL client + pure mapper; per-player 15-min in-memory cache behind `players.news`.                                      |
| `src/renderer/src/lib/playersTableView.ts`                                                                                        | Column model, cell values/text/tones, sorting.                                                                                           |
| `src/renderer/src/lib/detailView.ts`, `charts.ts`                                                                                 | Panel view model (usage rows, bar items, signal text) and SVG geometry.                                                                  |
| `src/renderer/src/lib/newsView.ts`, `src/renderer/src/components/NewsSection.tsx`                                                 | News view helpers (badge, age) and the panel section with its own fetch and states.                                                      |
| `src/main/lineup/optimal.ts`                                                                                                      | Lineup engine (pure): slot expansion, Hungarian assignment, deterministic seating, swaps, close calls, week value / flag.                |
| `src/main/lineup/build.ts`                                                                                                        | Per-team week lineups from the value build + matchups + starters, current-lineup mapping, `lineupWeek`, `teamStrengths`.                 |
| `src/main/sync/matchupsSync.ts`, `src/main/db/repos/matchups.ts`                                                                  | Matchups sync step (one per refresh) and replace-per-week storage.                                                                       |
| `src/renderer/src/lib/lineupView.ts`, `src/renderer/src/screens/LineupScreen.tsx`                                                 | Lineup view helpers (header, flags, swaps, close-call tooltip) and the screen.                                                           |
