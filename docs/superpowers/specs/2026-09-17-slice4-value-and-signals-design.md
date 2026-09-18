# Slice 4 — Computed Value & Signals — Design

**Status:** approved by the user on 2026-09-17 (sections 1–5 reviewed one by one).
**Builds on:** slice 1 (`v0.3.0`) and the Players screen redesign (`v0.4.0`): `player_week_points`, Sleeper projections for every week 1–18 (`player_week_projections`), `player_week_stats` (`stats_json`), `player_week_snaps`, `team_week_stats`, `games`, `roster_slots`, `roster_players`, `teams.is_me`, `watchlist`, `nfl_state`.

## 1. Goal

Turn the raw weekly data into decision-grade numbers, computed for every player (rostered or not) under this league's exact rules:

1. **Value** — one league-aware number per player: points over the replacement level implied by the league's roster slots, both season-to-date and rest-of-season.
2. **Signals** — usage trends, efficiency/regression, consistency and schedule, so a value can be read together with *why* ("good so far, but the target share is falling and the schedule gets hard").
3. **Roster-relative view** — for free agents, how much they improve *my* roster; for my players, whether a free agent is better.

Delivered as three plans (E, F, G) under this one spec. Slice 6 (decision tools) builds trade values, waiver recommendations and lineup logic on top of these numbers; none of that is in scope here.

### Non-goals

- No new data sources (everything is computed from tables that already exist).
- No trade values, lineup optimizer, or cross-position drop advice ("drop a WR to add this RB") — slice 6.
- No persisted computed values: everything is rebuilt from the DB on demand and cached in memory.
- No IDP positions; positions with no roster slot get no value.
- The per-player detail panel gains charts, but no charting library is added — small inline SVG components only.

## 2. Value model (Plan E)

### 2.1 Per-player inputs

For a (league, season) and each player:

- **Games played** = weeks with a `player_week_points` row (the player's team played and the player was matched to nflverse). A played week scoring 0 counts. Bye weeks and weeks before the player's first appearance do not.
- **PPG** (season-to-date) = mean points over games played. `null` when 0 games.
- **Current week** = `nfl_state.week` (Sleeper).
- **ROS points** = Σ scored projections (`scoreStatLine` on the stored Sleeper line, so league rules apply) for weeks `w ≥ currentWeek` that have **no** points row for this player. This is per player, so mid-week (Thursday game played, others not) is handled naturally: Thursday players' week counts as played; everybody else's week-N projection stays in ROS. `null` when no projection rows exist for the season.

### 2.2 Replacement level

Derived from `roster_slots` and the league's team count (16). For each position with a dedicated slot (QB, RB, WR, TE, K, DEF):

- `base(pos) = slots(pos) × teams`.
- The FLEX slots (eligibility per Sleeper slot name as `tabsForSlots` already maps it: `FLEX` = RB/WR/TE, `SUPER_FLEX` = QB/RB/WR/TE, `REC_FLEX` = WR/TE) are allocated greedily: `flexCount = slots(flex) × teams`; repeat `flexCount` times — among the flex-eligible positions, take the position whose next-best unallocated player has the highest metric, and give that position one more starter.
- **Replacement level** for a position = the metric of the `(starters(pos) + 1)`-th best player at that position. If fewer players exist, the lowest one.
- This is computed twice, independently: once with PPG (STD replacement, players with `ppg != null` only), once with ROS points (ROS replacement, `ros != null` only).

### 2.3 Value and ranks

- `stdValue = ppg − replacementPpg(pos)`; `rosValue = ros − replacementRos(pos)`. Both may be negative. `null` when the input is `null`.
- `stdRank` / `rosRank` = 1-based rank within position by the respective value (ties: higher raw metric first, then name).
- `overallRank` = rank across all positions by `rosValue`.

Per-player output (phase 1): `gamesPlayed, ppg, stdValue, stdRank, rosPoints, rosValue, rosRank, overallRank`.

## 3. Signals (Plan F)

All computed from the same per-week series the value build loads. Every threshold lives in one module (`signals.ts`) as an exported constant so it can be tuned without touching the UI. "Games" below always means games played (§2.1).

### 3.1 Usage trends

Per-week usage metrics:

| Metric | Source |
|---|---|
| `snapPct` | `player_week_snaps.offense_pct` |
| `targetShare` | `stats_json.target_share` (nflverse), else `targets / team pass attempts` from `team_week_stats` |
| `rushShare` | `carries / team rush attempts` from `team_week_stats` |
| `airYardsShare` | `stats_json.air_yards_share`, else derived from team stats |
| `wopr` | `stats_json.wopr`, else `1.5 × targetShare + 0.7 × airYardsShare` |

For each metric: `season` = mean over games, `recent` = mean over the last 3 games, `trend` ∈ {`rising`, `flat`, `falling`}: `recent − season ≥ +threshold` → rising, `≤ −threshold` → falling, else flat. Thresholds: 0.03 for shares/WOPR, 0.05 for snap %. Requires ≥ 2 games, else the metric is `null`.

The **primary usage metric** per position (used in the table column): WR/TE → `targetShare`; RB → `snapPct`; QB, K, DEF → none.

### 3.2 Efficiency & regression

- **Opportunities** per game: RB/WR/TE → `targets + carries`; QB → `pass attempts + carries`; K/DEF → not computed.
- **Positional TD rate** = Σ TDs / Σ opportunities across all players at the position for the season (league-wide, all rostered or not).
- **TD regression**: `expectedTds = opportunities × positionalTdRate`; `tdDelta = actualTds − expectedTds`. Flag `down` when `tdDelta ≥ +1.5`, `up` when `≤ −1.5`, else none.
- **Yards per opportunity**: `ypo = (rush + receiving [+ passing for QB] yards) / opportunities`; `ypoDelta = ypo − positional mean ypo`.
- **vs projection (STD)**: over weeks that have both a points row and a projection, `vsProjPoints = Σ points − Σ projected` and `vsProjPct = vsProjPoints / Σ projected` (`null` when Σ projected is 0).

### 3.3 Consistency

Requires ≥ 3 games, else all `null`:

- `floor` = 25th percentile of weekly points, `ceiling` = 75th percentile (linear interpolation), `stdev` = population standard deviation.
- `startRate` = share of games with points ≥ the position's STD replacement PPG ("would have been worth starting").

### 3.4 Schedule

- **Defense vs position**: for every NFL team `T` and position `pos`, `allowed(T, pos)` = mean over `T`'s games of Σ `player_week_points` scored against `T` by players at `pos`. Ranked 1 (allows fewest — hardest matchup) to 32 (allows most — easiest). Uniform for K and DEF (points scored by opposing kickers / defenses against `T`). Computed from played weeks of the current season only.
- Per player: `nextOpponent` (team + rank, `null` on a bye or at season end), `rosSos` = mean rank of remaining opponents (weeks ≥ current week without a points row, from `games`), `byesRemaining` = number of remaining weeks with no game for the player's team.

## 4. Roster-relative view (Plan G)

"My" team = the `teams` row with `is_me = 1` (set at import). If none exists, this whole section is hidden in the UI and the fields are `null`.

- **vsMine** — for a player rostered by nobody, at position `pos`: `vsMine = rosValue − min(rosValue of my rostered players at pos)`. `null` when I roster nobody at `pos` (tooltip: "no K rostered") or when either side has no ROS value. Players rostered by other teams: `null` (trade territory).
- **droppable** — for my own players: set when the best free agent at the same position has a strictly higher `rosValue`; carries `{ playerId, fullName, delta }` of that free agent. It is the same comparison seen from the other side, so the two always agree.
- **FLEX** — same-position comparison only. FLEX is already reflected in the replacement level, so values are cross-position comparable, but cross-position drops need a lineup model (slice 6). Stated in the UI tooltip.
- **IR** — if a league has IR slots, players in IR are excluded from "my players at pos". (This league has none.)
- **My team chip** — a fourth filter chip next to Free agents / Watchlist / Rookies: shows my roster only. Available in all three table modes.

## 5. Read model and IPC

### 5.1 Shared types (`src/shared/types.ts`)

```ts
export type TableMode = 'proj' | 'stats' | 'value'

/** Identity/roster fields shared by week rows and value rows; the renderer filters on these. */
export interface PlayerBaseRow {
  playerId: string; fullName: string; position: string | null; team: string | null
  byeWeek: number | null; injuryStatus: string | null; rookie: boolean; watched: boolean
  ownerRosterId: number | null; ownerName: string | null; ownerIsMe: boolean
}

export type Trend = 'rising' | 'flat' | 'falling'
export interface UsageTrend { season: number; recent: number; trend: Trend }

export interface PlayerSignals {
  usage: { snapPct: UsageTrend | null; targetShare: UsageTrend | null; rushShare: UsageTrend | null
           airYardsShare: UsageTrend | null; wopr: UsageTrend | null }
  tdDelta: number | null; tdFlag: 'up' | 'down' | null
  ypo: number | null; ypoDelta: number | null
  vsProjPoints: number | null; vsProjPct: number | null
  floor: number | null; ceiling: number | null; stdev: number | null; startRate: number | null
  nextOpponent: { team: string; rank: number } | null
  rosSos: number | null; byesRemaining: number
}

export interface PlayerValueRow extends PlayerBaseRow {
  gamesPlayed: number; ppg: number | null; stdValue: number | null; stdRank: number | null
  rosPoints: number | null; rosValue: number | null; rosRank: number | null; overallRank: number | null
  signals: PlayerSignals | null          // null until Plan F; null for players unmatched to nflverse
  vsMine: number | null                   // Plan G
  droppable: { playerId: string; fullName: string; delta: number } | null   // Plan G
  statsAvailable: boolean
}

export interface ValueContext {
  season: number; currentWeek: number; projectionsStored: boolean; hasMyTeam: boolean
  replacement: Record<string, { std: number | null; ros: number | null; starters: number }>
}

export interface PlayersValue { context: ValueContext; rows: PlayerValueRow[] }

export interface DetailWeek {
  week: number; opponent: string | null; played: boolean
  points: number | null; projected: number | null
  snapPct: number | null; targetShare: number | null; rushShare: number | null; wopr: number | null
  stats: Record<string, number>          // Sleeper keys, as WeekStats.stats today
}
export interface PlayerDetail {
  row: PlayerValueRow
  weeks: DetailWeek[]                     // every week 1..18 that has a game or projection, ascending
  schedule: { week: number; opponent: string | null; rank: number | null }[]   // weeks ≥ currentWeek
}
```

`PlayerWeekRow` is redefined as `PlayerBaseRow & { …its week-specific fields }` — no field is removed, so existing consumers are unaffected apart from the new `ownerIsMe`.

### 5.2 IPC

| Channel | Args | Returns | Notes |
|---|---|---|---|
| `players:value` | `{ leagueId, season }` | `PlayersValue` | Cached build; `watched` decorated at serve time. |
| `players:detail` | `{ leagueId, season, playerId }` | `PlayerDetail` | Served from the same cached build. Supersedes `players:weeklyStats`, which is removed once the panel is migrated. |

Both live in `src/main/ipc/handlers.ts` beside `players:week`.

### 5.3 Build and cache

`src/main/value/`:

| Module | Responsibility | Touches DB |
|---|---|---|
| `series.ts` | One pass per (league, season): `Map<playerId, PlayerSeries>` with per-week points, scored projection, usage metrics, opponent; plus team schedules and the league-wide per-position totals needed by signals. | yes |
| `replacement.ts` | `replacementLevels(slots, teamCount, metricByPosition)` — §2.2, pure. | no |
| `signals.ts` | §3.1–3.3, pure; exports the threshold constants. | no |
| `schedule.ts` | §3.4, pure. | no |
| `roster.ts` | §4, pure (Plan G). | no |
| `build.ts` | `buildValueSeason(db, leagueId, season): ValueBuild` — runs the above, produces rows, `detailByPlayer` and `context`. | via `series.ts` |

`valueCache: Map<"league:season", ValueBuild>` sits next to `weekCache` in `handlers.ts` and is cleared by the same hooks: successful sync entries and rules update / re-import. **Watchlist toggle does not clear it** — `watched` is joined at serve time because the value build is the expensive one. Budget: a full-season build ≤ 500 ms on the dev DB (measured during Plan E, not enforced by a test).

## 6. Screen

### 6.1 Value mode in the Players table

- Mode toggle becomes `Proj | Stats | Value`. In Value mode the week select is hidden (value is a season aggregate); the season select, position tabs, search, chips and owner column work unchanged.
- Column groups, identical for every tab:

| Season | Rest of season | Signals (Plan F) | Mine (Plan G) |
|---|---|---|---|
| G · PPG · **Value** · Rk | ROS pts · **Value** · Rk · SOS · Byes | Floor/Ceil · Start% · Usage · TD · vs Proj | vs mine · droppable |

- SOS and Byes belong to the Rest-of-season group visually but are schedule signals (§3.4), so they arrive with Plan F.
- Default sort: ROS value desc (the ALL tab therefore shows a cross-position ranking). Every numeric column sorts; `null` sorts last.
- *Usage* = the position's primary metric (§3.1) as `recent` with a `↑ → ↓` arrow; blank for QB/K/DEF. *TD* = `↓` (regression down) / `↑` (regression up) badge or blank. *SOS* = `rosSos` tinted from easy to hard. *vs Proj* = `vsProjPct`. `null` renders "—".
- Hovering a Value header shows that position's replacement level ("RB replacement: 8.4 PPG / 91 ROS pts, 44 starters").
- *droppable* renders as a marker with the free agent's name and delta in the tooltip; *vs mine* as a signed number.

### 6.2 Player detail panel

The existing slide-over becomes `PlayerDetailPanel.tsx`, fed by `players:detail`. Sections top to bottom (Plan E delivers 1 and 6; Plan F adds 2–5):

1. **Header strip** — PPG · STD value (pos rank) · ROS value (rank); Plan F appends next opponent with rank · byes remaining.
2. **Points vs projection** — per-week bars (actual) with the projection as a marker, inline SVG (`BarsVsMarker`).
3. **Usage** — sparklines (`Sparkline`) for snap %, target or rush share (by position), WOPR; each with season / last-3 numbers and the trend label.
4. **Signals text** — e.g. "TDs +2.3 vs expected — regression candidate", "Yds/opp −0.8 vs position", "Floor 6.1 · Ceiling 17.4 · start-worthy 63 %".
5. **Upcoming schedule** — remaining weeks with opponent and rank, byes marked.
6. **Game log** — the table that exists today.

### 6.3 Empty states

- No projections stored for the season → ROS columns "—", header strip and schedule note "No projections stored".
- No points yet (preseason) → STD columns "—", ROS still ranks.
- Player unmatched to nflverse (`statsAvailable = false`) → today's message; value fields `null`.
- < 3 games → consistency shows "needs 3 games"; < 2 games → usage trends "—".
- No team flagged as mine → *Mine* group and *My team* chip hidden.

## 7. Error handling

A build failure propagates through the existing IPC error path exactly like `players:week`; the renderer shows the same error state as today and keeps the last good rows. No partial builds are cached.

## 8. Testing

vitest, as today:

- `replacement.test.ts` — greedy FLEX on a 2-team fixture with 1 RB, 1 WR, 1 FLEX; ties; fewer players than starters; positions without slots.
- `signals.test.ts` — trend labels at the thresholds; opportunities per position; TD flag boundaries; percentiles/stdev on known series; `startRate`; the ≥ 2 / ≥ 3 games gates.
- `schedule.test.ts` — defense-vs-position ranks on a synthetic 4-team schedule; `rosSos`, `byesRemaining`, `nextOpponent` around the current week and on a bye.
- `roster.test.ts` — vsMine/droppable symmetry; no player at position; no `is_me` team; IR exclusion.
- `build.test.ts` — integration on the in-memory SQLite fixture (`tests/fixtures/db.ts`) with seeded points, projections and rosters; mid-week case (one team played the current week).
- `playersTableView.test.ts` — VALUE column groups, sort with nulls last, chips over `PlayerBaseRow`.
- Windows verification per plan, with a sanity read of the RB/WR top-10 in Value mode.

## 9. Structure

- `src/main/value/{series,replacement,signals,schedule,roster,build}.ts`
- `src/main/ipc/handlers.ts` — `players:value`, `players:detail`, `valueCache`
- `src/shared/types.ts` — §5.1 types; `src/shared/ipc.ts` — the two channels
- `src/renderer/src/lib/playersTableView.ts` — base-row generalisation, `VALUE` column groups
- `src/renderer/src/screens/PlayersScreen.tsx` — mode toggle, week-select hiding, chip
- `src/renderer/src/components/PlayerDetailPanel.tsx`, `Sparkline.tsx`, `BarsVsMarker.tsx`

## 10. Phasing

| Plan | Version | Scope |
|---|---|---|
| E | v0.5.0 | `series` (complete loader, incl. usage fields), `replacement`, `build`, cache, `players:value` / `players:detail` (`players:weeklyStats` removed), Value mode (Season + ROS groups without SOS/Byes), panel header strip, `PlayerDetailPanel` extraction, `PlayerBaseRow` refactor |
| F | v0.6.0 | `signals`, `schedule`, Signals column group + SOS/Byes columns, header-strip opponent/byes, panel sections 2–5, SVG components |
| G | v0.7.0 | `roster`, Mine column group, My team chip |
