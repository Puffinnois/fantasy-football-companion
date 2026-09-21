# Slice 6a — Lineup Model — Design

**Status:** approved by the user on 2026-09-20 (approach and sections 1–5 reviewed one by one).
**Builds on:** slice 5 (`v0.9.0`): the per-(league, season) value build (`loadSeries` → `SeriesBundle` with every rostered player's per-week league-scored `projected` / `points`, `ownerRosterId`, `rosterSlot`), the app-owned `roster_slots` and `FLEX_ELIGIBILITY`, `roster_players.starter_index`, `leagues.sleeper_raw`, the `runStep` sync pipeline with freshness constants, `PlayerWeekRow.expert` (FantasyPros weekly), `PlayerSignals.floor / ceiling`, the defense-vs-position ranks, `PlayerDetailPanel`, `valueCache` / `invalidateCaches()`.

## 1. Goal

Slice 6 (decision tools) is decomposed into three sub-slices, each with its own spec → plan cycle:

- **6a — lineup model (this spec):** the weekly optimal lineup for any roster under the league's slots and scoring, and the rest-of-season strength of a roster derived from it. It is the building block the other two need to measure *team* impact instead of summing player values.
- **6b — trade evaluator:** my players vs. theirs, valued by our model, the market and the experts, and by the change in both teams' strength.
- **6c — waiver / free-agent recommendations:** cross-position drop/add advice (today's `vsMine` / `droppable` are same-position only), aware of the league's waiver type.

What 6a delivers to the user:

1. A **Lineup screen**: for a chosen week, my optimal lineup next to the lineup I actually set on Sleeper, the swaps that close the gap, the close calls with the context to judge them (floor/ceiling, expert rank and grade, matchup), and this week's opponent with both projected totals. Past weeks become a retrospective (points left on the bench).
2. A **power ranking**: every team's rest-of-season strength on the League screen cards.

Delivered as two plans (J, K) under this spec.

### Decisions taken in brainstorming

| Question | Decision |
| --- | --- |
| Projection the lineup is optimised on | Sleeper's weekly projections scored under the league rules — the same number as `rosPoints`, exact under our scoring. FantasyPros weekly ECR / grade is shown as a second opinion, never in the math. |
| Weekly matchup | Synced from Sleeper (keyless). The optimiser stays on maximum projected points; the matchup provides context (opponent total, margin) and floor/ceiling is surfaced on close calls for the user to lean either way. |
| Rest-of-season team strength | Built now, surfaced as a power ranking; reused by 6b / 6c. |
| Placement | New `Lineup` screen in the sidebar; ROS strength on the League screen team cards. |
| Engine location | Pure module in the main process on top of the existing series bundle (approach A). Renderer-side computation would duplicate scoring conventions; persisting optimal lineups would go stale between syncs for no gain (16 teams × 18 weeks of tiny assignments). |

### Non-goals

- Projected standings, playoff odds, schedule-strength of the fantasy schedule — needs a win model; the matchup pairings stored here make it possible later.
- Letting the matchup change the picks (ceiling-when-underdog mode) — deferred; the data to do it is in place.
- Trade and waiver logic (6b, 6c).
- Editing the lineup on Sleeper from the app.
- IDP positions and slots — ignored as everywhere else in the app.

## 2. Optimal lineup engine (`src/main/lineup/optimal.ts`)

Pure, no DB access.

### 2.1 Slot model

Lineup slots come from the league's `rosterSlots` (app-owned, Sleeper-prefilled, user-editable), expanded to one entry per slot in Sleeper's order: dedicated positions `QB RB WR TE K DEF` accept their own position; flex slots accept `FLEX_ELIGIBILITY[slot]`; `BN`, `IR`, `TAXI`, `IDP_FLEX`, `DL`, `LB`, `DB` and unknown slot names are not lineup slots.

### 2.2 Player value for a week

```
value(player, week) = points        if the week is played (a points row exists)
                    = projected     else, when a league-scored projection exists
                    = 0             else (bye, no projection)
```

The same rule `rosPoints` uses: a Thursday player counts as played while everyone else's week stays projected.

### 2.3 Availability

- Players in an `ir` or `taxi` roster slot are never eligible (`UNSTARTABLE_SLOTS`, as in `roster.ts`).
- **Current week only:** `injuryStatus ∈ UNAVAILABLE_STATUSES = { Out, Doubtful, IR, PUP, Sus, COV, NA, DNR }` → value 0 and the player is listed as *unavailable*; `Questionable` keeps its value and is flagged. Future weeks use raw projections — the status is a snapshot, not a forecast — and past weeks use actuals.
- A player on bye has value 0 and flag `bye`; they stay eligible (the optimiser will only pick them when nobody else fits).

### 2.4 Optimisation

`optimalLineup(slots, players)` solves an exact **maximum-weight assignment** of players to lineup slots (Hungarian algorithm on a matrix of at most ~20 players × ~10 slots; ineligible pairs weigh −∞; with fewer eligible players than slots the leftover slots stay empty). Exact even with mixed flex kinds (`FLEX` + `SUPER_FLEX` + `REC_FLEX`), where greedy "dedicated first, then flex" is not guaranteed optimal. Ties are broken deterministically (higher value, then dedicated slot before flex, then name) so results are stable between renders.

Output: one `SlotEntry` per lineup slot in slot order, the `total`, and the ordered `bench` (eligible players not chosen, best first).

### 2.5 Derived comparisons

Given a team's **current** starters for the week (§3.4), the engine also derives:

- `currentTotal` — Σ value of the current starters (`null` when the current lineup is unknown).
- `swaps` — for every slot whose optimal player differs from the current one: `{ slot, out, in, delta }`, `delta = value(in) − value(out)`. Slots are matched by slot name and index; a player who merely moves between two slots is not a swap.
- `closeCall` per slot — the best bench player eligible for that slot when `value(starter) − value(alt) ≤ CLOSE_CALL_PTS = 2.0`; `null` otherwise. Bench here excludes unavailable players.

## 3. Matchups (Plan J)

### 3.1 Source

Sleeper `GET /v1/league/{league_id}/matchups/{week}` — documented, keyless. One row per roster: `roster_id`, `matchup_id` (the two rosters sharing it play each other; `null` on a bye), `starters` (ordered like the league's `roster_positions`), `players`, `points`. Added to `SleeperClient` as `getMatchups(leagueId, week): Promise<SleeperMatchup[]>`; an empty array is a normal answer (playoff weeks before the bracket exists).

### 3.2 Table (migration `006_matchups.sql`)

```
matchups (
  league_id     TEXT NOT NULL REFERENCES leagues ON DELETE CASCADE,
  season        TEXT NOT NULL,
  week          INTEGER NOT NULL,
  roster_id     INTEGER NOT NULL,
  matchup_id    INTEGER,
  starters_json TEXT NOT NULL,   -- JSON array of player ids in slot order ('0' = empty slot, as Sleeper sends it)
  players_json  TEXT NOT NULL,
  points        REAL NOT NULL,
  updated_at    TEXT NOT NULL,
  PRIMARY KEY (league_id, season, week, roster_id)
)
```

Repo `src/main/db/repos/matchups.ts`: `replaceWeek(leagueId, season, week, rows)` in one transaction (delete the week, insert), `forSeason(leagueId, season)` → all rows, `weekUpdatedAt(leagueId, season, week)` for the freshness rule.

### 3.3 Sync step

Step `matchups` (`source = matchups:{season}`) in the Sleeper part of `refreshAll`, after rosters, for the current season:

- Weeks `1..18`. A week `< currentWeek` is re-fetched only when its stored `updated_at` is older than `MATCHUPS_PAST_FRESHNESS_MS = 30 d` (final scores and lineups don't change); weeks `≥ currentWeek` are fetched every refresh (owners set lineups until kickoff).
- An empty answer stores nothing for that week (and removes stale rows for it, if any).
- Message: `"{fetched} weeks fetched, {teams} teams"`; a failure is one failed step like the expert steps — the rest of the refresh continues.

### 3.4 Current lineup of a team for a week

- From the team's `matchups` row: `starters_json[i]` ↔ the i-th entry of Sleeper's `roster_positions` **with its `BN` entries removed** (Sleeper's `starters` covers only the starting slots; IR is the separate `reserve` list), read from `leagues.sleeper_raw` — Sleeper's real slot list, not the editable `rosterSlots`. `'0'` = empty slot. Entries that are not lineup slots (IDP) are dropped.
- Fallback for the current week when no row exists yet: `roster_players.starter_index` with the same `roster_positions` mapping.
- If the app's `rosterSlots` and Sleeper's `roster_positions` disagree (the user edited slots), the *current* lineup still renders as Sleeper has it; the *optimal* one follows the app's slots; swaps are computed slot-by-slot where the names match and the unmatched slots show without a Δ.

## 4. Lineup build and read model (Plan J)

### 4.1 Build (`src/main/lineup/build.ts`)

`buildLineups(bundle: SeriesBundle, rosterSlots, rosterPositions, matchups, rosterStarters)` → `LineupBuild`:

- Groups `bundle.players` by `ownerRosterId`; per team and per week `1..18` computes value/availability (§2.2–2.3) and the optimal lineup (§2.4). Weeks are computed lazily and memoised; the whole league for a season is milliseconds.
- **Team strength** per team: `thisWeek` = optimal total of `currentWeek`; `rosTotal` = Σ optimal totals over weeks `≥ currentWeek` (byes cost what they cost: a bye week's lineup lacks those players); `rosPerWeek` = `rosTotal / remaining weeks`; `rank` by `rosTotal` (ties: `rosPerWeek`, then team name). All `null` when `!projectionsStored` or the season is over (`currentWeek = 19`).
- Cached next to the value build in `handlers.ts` (same key `(leagueId, season)`, same `invalidateCaches()` on sync and rules change).

### 4.2 IPC

| Call (`window.api.lineup`) | Returns |
| --- | --- |
| `week({ season, week })` | `LineupWeek` for my team and its opponent that week. |
| `strength(season)` | `TeamStrength[]`, every team, sorted by `rank`. |

Both read the cached lineup build; `week` also decorates players with the FantasyPros weekly `{ ecrPosRank, grade }` (the same `expertWeek` join `players.week` uses), `signals.floor / ceiling` from the value build rows, and the opponent's defense-vs-position rank for that week (`schedule.ts`).

### 4.3 Shared types (`src/shared/types.ts`)

```ts
export type LineupFlag = 'out' | 'doubtful' | 'questionable' | 'bye' | null

export interface LineupPlayer {
  playerId: string; fullName: string; position: string; team: string | null
  opponent: string | null           // NFL opponent that week; null on a bye
  dvpRank: number | null            // defense-vs-position rank of that opponent, 1 = hardest
  value: number                     // §2.2 after §2.3
  played: boolean
  injuryStatus: string | null
  flag: LineupFlag
  expert: { ecrPosRank: number; grade: string | null } | null
  floor: number | null; ceiling: number | null
}

export interface SlotEntry { slot: string; player: LineupPlayer | null; closeCall: LineupPlayer | null }
export interface Swap { slot: string; out: LineupPlayer | null; in: LineupPlayer; delta: number }

export interface TeamLineup {
  rosterId: number; name: string; isMe: boolean
  optimal: SlotEntry[]; optimalTotal: number
  current: SlotEntry[] | null; currentTotal: number | null
  actualTotal: number | null        // Sleeper's `points` for a played week, else null
  bench: LineupPlayer[]; unavailable: LineupPlayer[]
  swaps: Swap[]
}

export type LineupWeekStatus = 'upcoming' | 'inProgress' | 'final'

export interface LineupWeek {
  season: number; week: number; currentWeek: number
  status: LineupWeekStatus          // none / some / all of the involved teams' players played
  projectionsStored: boolean
  matchupId: number | null
  me: TeamLineup | null             // null when no team is flagged is_me
  opponent: TeamLineup | null       // null: bye week or no matchup row
}

export interface TeamStrength {
  rosterId: number; name: string; isMe: boolean
  thisWeek: number | null; rosTotal: number | null; rosPerWeek: number | null; rank: number | null
}
```

Conventions follow `docs/reference/value-and-signals.md`: `null` = not computable, points rounded to 2 decimals, team codes are Sleeper's.

## 5. UI

### 5.1 Lineup screen (Plan J)

Sidebar entry `Lineup` (icon: clipboard-list), enabled when a league is imported.

1. **Header** — week picker `1..18` (default `currentWeek`) and the matchup line. Upcoming / in progress: `You 118.9 optimal · 112.4 current  vs  {Opponent} 109.7`, the opponent total being their current starters when known (labelled *current*), else their optimal (labelled *optimal*). Final: `You 121.3 – {Opponent} 98.0 · W`, then `Left on bench: +12.3` for each side (`optimalTotal − actualTotal` on actuals). Bye / no row: `No matchup this week`.
2. **Slot table** — one row per lineup slot: Slot · Your starter · value · Optimal starter · value · Δ. Rows where the two differ are tinted. A close call adds `≈ {alt}` after the optimal starter with a tooltip listing, for both players: value, floor / ceiling, FP ECR + grade, NFL opponent + DvP rank. Flags render as small badges `Q` (amber), `D` / `O` (red), `BYE` (muted). A player's name opens the existing `PlayerDetailPanel` slide-over.
3. **Swaps** — "Start *A* over *B* (FLEX, +3.1)" per swap, largest Δ first; empty state "Your lineup is optimal". When the current lineup is unknown: "Lineup not set on Sleeper yet".
4. **Bench** and **Unavailable** — compact lists with the week's value and flag.
5. **Opponent** (Plan K) — a collapsed section with the opponent's slot table (their current vs their optimal) and their swaps, so the header's number can be inspected.

Empty states: no `is_me` team → "Your team isn't identified — re-import from Setup"; `!projectionsStored` → the "No projections stored" note (values are actuals only).

### 5.2 League screen (Plan K)

Each team card gains a third line `ROS {rosTotal} · #{rank}` (`—` when null) and the header gains a sort toggle **Record / ROS strength** (default Record) with a one-sentence note on the basis: "Optimal lineup on Sleeper projections under your scoring, summed over the remaining weeks". The selected-team roster panel is unchanged.

### 5.3 Data reference

`docs/reference/value-and-signals.md` gains a **Lineup** section: the value/availability conventions, the types above, the constants, and where each number is shown — the redesign consumes it.

## 6. Error handling

- Matchups fetch fails → one failed `sync_log` step; the Lineup screen still works from stored rows (or falls back to `starter_index` for the current week) and the status bar shows the step.
- `roster_positions` missing from `sleeper_raw` (older import) → current lineup `null` for every team; the screen shows the optimal side only with the "Lineup not set" note; a re-import fixes it.
- Fewer eligible players than slots → `player: null` entries; totals sum what is there.
- Past season (`currentWeek = 19`) → every week `final`, strength fields `null`, the screen is a retrospective.
- Renderer: `lineup.week` errors render the screen's error line like the other screens; a week change cancels the previous request's state (keyed by week, as `NewsSection` does by player).

## 7. Testing

- `optimal.ts` — property test against brute-force enumeration on random rosters (≤ 8 players, ≤ 5 slots) including mixed flex kinds, ties, ineligible positions, fewer players than slots; a fixed case for the user's league shape (1 QB, 2 RB, 2 WR, 1 TE, 2 FLEX, 1 K, 1 DEF).
- `build.ts` — fixture bundle: played-vs-projected values, the current-week-only injury rule, bye handling, swaps and close calls, current-lineup mapping from `starters_json` with `'0'` slots and a `roster_positions` that disagrees with `rosterSlots`, strength ranks and `null` cases.
- Matchups — client mapper on a recorded payload (incl. an empty week), repo replace-per-week, freshness rule for past vs. current weeks.
- Renderer — `lib/lineupView.ts` helpers as pure tests (header line, badges, tooltip text); one DOM test for the "optimal" and "not set" states.
- Real-data check on the dev DB (throwaway `tests/zz-*.test.ts`) before the Windows build, as in earlier plans; stop the dev app by PID.

## 8. Structure

```
src/main/sources/sleeper.ts            + getMatchups, SleeperMatchup type
src/main/db/migrations/006_matchups.sql
src/main/db/repos/matchups.ts
src/main/sync/matchupsSync.ts          step + freshness constant
src/main/lineup/optimal.ts             slots, values, availability, assignment, swaps, close calls (pure)
src/main/lineup/build.ts               per-team per-week lineups, strength, LineupBuild
src/main/ipc/handlers.ts               lineup.week, lineup.strength, cache
src/shared/types.ts                    §4.3 types
src/renderer/src/screens/LineupScreen.tsx
src/renderer/src/lib/lineupView.ts
src/renderer/src/components/Sidebar.tsx  Lineup entry
src/renderer/src/screens/LeagueScreen.tsx  ROS line + sort toggle (Plan K)
docs/reference/value-and-signals.md    Lineup section
```

Constants (single sources): `CLOSE_CALL_PTS = 2.0`, `UNAVAILABLE_STATUSES`, `QUESTIONABLE_STATUS = 'Questionable'` in `optimal.ts`; `MATCHUPS_PAST_FRESHNESS_MS = 30 d` in `matchupsSync.ts`.

## 9. Phasing

- **Plan J** — matchups (client, migration, repo, sync step), engine, build, both IPC calls, Lineup screen §5.1 items 1–4 (including the final-week header), data reference → `v0.10.0`.
- **Plan K** — League screen power ranking + sort toggle (§5.2), the Opponent section (§5.1 item 5) → `v0.11.0`.

Then 6b (trade evaluator) and 6c (waiver recommendations), each brainstormed against this engine.
