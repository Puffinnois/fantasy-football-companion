# Slice 6c — Waiver Recommendations — Design

**Status:** approved by the user on 2026-09-23 (approach and sections 1–5 reviewed one by one).
**Builds on:** slice 6a (`buildLineups` → `LineupBuild`, memoised `teamWeek`, `rosterWeek`, `optimalLineup`, `reservedNow`); slice 6b (`canEnter` / `reachableSlots`, the exact week skip, `rosterSize`, `windowWeeks`, `TradePlayer` / `tradePlayer()`, the `fromDb` → worker pattern of Plan M, `TradeError`); rest-of-season realism (`v0.15.0`: shelving, rank matching, weekly `ros_snapshots`); slice 5 (`PlayerValueRow.market` FantasyCalc, `.expert` FantasyPros ROS).

## 1. Goal

Slice 6 (decision tools) is 6a lineup model (done), 6b trade evaluator (done), **6c waiver recommendations (this spec)**.

What 6c delivers to the user, on one **Waivers** screen:

1. **Improves my lineup** — free agents whose add raises my rest-of-season team strength (6a's optimal-lineup engine), each with the best way to make room.
2. **Stash** — free agents with upside that team strength cannot see yet (a healthy starter's handcuff, a rookie before his breakout), ranked by market, trending and expert signals, with what making room costs.
3. **Streaming** — a one-week pickup for a chosen week, net of what the released player would have scored the rest of the way.

Plus two small additions elsewhere: my waiver priority in the header, and an *open spot* line in the 6b trade builder.

### Decisions taken in brainstorming

| Question | Decision |
| --- | --- |
| Modes | Rest-of-season adds and week-specific streaming on one screen (decided before Plan N). |
| Upside | Two lists: *Improves my lineup* ranked by team-strength Δ like 6b, and a separate *Stash* list ranked by upside signals — no blended score. |
| Signals for Stash | Sleeper trending adds (new, keyless), FantasyCalc market value, FantasyPros ROS rank; sortable columns, default market value. |
| Making room | Exact automatic choice among *open spot*, *IR move* and *drop*, with a per-row override dropdown showing every option's cost. No persistent "never drop" list. |
| Streaming horizon | Week picker: the upcoming week up to 3 weeks ahead. `net = weekGain − restCost`. |
| Freed spot in 6b | An info line in the trade builder only; the headline Δ and the suggestion search are unchanged. |
| Claims | My waiver priority only (header). No per-player waiver status. |
| History | Weekly snapshot of the two new signals (`market_value`, `trending_adds`) on `ros_snapshots`, for a later backtest. Lists are computed on demand, never stored. |
| Engine location | One-sided move evaluator in the main process on the cached `LineupBuild`, sharing 6b's machinery (approach A). A marginal add/drop table is wrong exactly when the add and the drop compete for a slot; modelling the wire as a fake 17th team drags 6b's two-sided logic in. |

### Non-goals

- FAAB bid advice (the user's league runs priority waivers — reverse standings).
- Per-player waiver / claim status, claim timing, executing claims in Sleeper.
- Multi-player adds (add two, drop two) and multi-week streaming chains.
- Storing the recommended lists.
- A persistent "never drop" / untouchable mark.
- Changes to the Players screen's `vsMine` / `droppable` (same-position; the Waivers screen is the cross-position view).
- Trending drops.
- The open-spot value inside 6b's headline Δ or its suggestion search.

## 2. The engine — `src/main/waiver/`

Pure modules, no DB access, on a `LineupBuild`. Free agents are already in `build.inputs.value.series` (`ownerRosterId === null`), so the lineup engine places them without extra loading.

### 2.1 Window and baseline

As in 6b: the window is `currentWeek..lastWeek` (`windowWeeks(build)`); `requireWindow` raises `NO_PROJECTIONS` when it is empty. For a roster `R`, `total(R, w) = rosterWeek(build, R, w).optimalTotal`; for my current roster the memoised `teamWeek(build, me, w)` is used. `before = Σ_w total(mine, w)`.

The core is roster-parameterised — `searchAdds(build, roster, options)` — so the same code serves my roster (§2–4) and a trade's after-roster (§7).

### 2.2 Releases

Every add needs room. A **release** is one of:

- `open` — the roster has an open spot: active players (roster slot not IR / taxi) < `rosterSize(build)`. Nothing leaves.
- `ir { playerId }` — move one of my active players to IR: needs a free IR slot (`irSlots` − my players in the IR slot > 0) and his injury status in `irStatuses` (§5.4). From the current week on he is `reservedNow`, so his remaining starts count as the cost — lineup-wise identical to a drop, but I keep him.
- `drop { playerId }` — release one of my active players.

When an `open` release exists it is the only option offered (a drop can never beat it). Otherwise the options are every IR-eligible move plus every active player as a drop.

### 2.3 Exact search for one free agent `a`

1. **Skip** `a` when `canEnter(a, w)` is false on the roster for every window week: then `roster + a` has the roster's optimum every week, and removing anyone cannot raise it — `Δ ≤ 0` for every release. (Stash, §3, evaluates such players anyway; it only needs the release costs.)
2. **Oversized solve.** `total(roster + a, w)` for each window week; weeks where `a` cannot enter reuse the baseline solve.
3. **Each release `r`.** If `r`'s player is not a starter in any week of the oversized solve, removing him leaves that optimum feasible and optimal: `after(r) = Σ_w oversized(w)` — the maximum possible. Otherwise re-solve only the weeks where he starts; every other week reuses the oversized solve (the same argument as 6b's post-drop reuse). `open` has `after = Σ_w oversized(w)`.
4. **Order the options** by `after` descending; ties prefer `open`, then `ir`, then the drop with the least upside — lowest market value (none = 0), then worst FantasyPros ROS rank (unranked = worst), then lowest `rosPoints`, then name.

Every option keeps its own numbers, so the row's override dropdown needs no recomputation.

### 2.4 Improves my lineup

Per option: `delta = after − before`, `deltaPerWeek = delta / weeks`, `thisWeekDelta` (the current week alone), `startWeeks` (window weeks `a` starts in that option's solve). A row lists its options best first.

Rows whose best option has `delta ≥ LINEUP_MIN_DELTA = 0.5` points over the window, sorted by best `delta` desc, then `thisWeekDelta` desc, then name; capped at `WAIVER_MAX = 30`.

## 3. Stash

- **Candidates:** free agents on an NFL team, not `Inactive`, whose best lineup `delta` is below `LINEUP_MIN_DELTA` (so nobody appears in both lists), with at least one signal: a trending count (§5.1), a FantasyCalc `market.value`, or a FantasyPros ROS rank.
- **Shortlist:** the union of the top `WAIVER_MAX` by each signal (≤ 90 players) — so re-sorting the table by any column still shows a correct top 30.
- **Release:** §2.3 steps 2–4 for each shortlisted player (no skip). A stash's add gains about nothing, so the row's headline is the best option's cost (`−delta`); a cost of 0 is tagged *free*.
- **Row:** the player, market value, trending adds (24 h), FantasyPros ROS positional rank (e.g. `RB34`), and the release options.
- **Order:** default market value desc (none last), then trending desc, then name; every signal column sorts. The UI shows 30 rows of the current sort.

## 4. Streaming

- **Target week** `t ∈ currentWeek..min(currentWeek + 3, lastWeek)`; default `currentWeek` (the week the Lineup screen shows).
- **Candidates:** free agents with `canEnter(a, t)` on my roster, excluding any whose week-`t` game has already been played (`WeekPlayer.player.played`).
- **Per release option:**
  - `weekGain = total(mine + a − r, t) − total(mine, t)`
  - `restCost = Σ_{w ∈ window, w ≠ t} (total(mine, w) − total(mine − r, w))` — computed once per release per call, independent of `a`; 0 for `open`. Weeks where `r` never starts cost 0 without a solve.
  - `net = weekGain − restCost`. Any other week the streamer might start is ignored on purpose — a streamer is dropped after his week.
- **Options** ordered by `net` desc with §2.3's tie order.
- **Rows** whose best `net ≥ STREAM_MIN_NET = 0.5`, sorted by `net` desc, then `weekGain` desc, then name. All passing rows are returned; the position chips filter client-side and the UI shows the top 30 of the current chip.
- **Opponent** for week `t` from `games` (home `vs CAR`, away `@ CAR`).

## 5. Data and sync

### 5.1 Trending adds

`GET https://api.sleeper.app/v1/players/nfl/trending/add?lookback_hours=24&limit=100` → `[{ player_id, count }]`, keyless. Fetched in `src/main/sources/sleeper.ts`, stored by a new sync step (`sleeper:trending:add`) that replaces `trending_adds(player_id TEXT PRIMARY KEY, count INTEGER NOT NULL, fetched_at TEXT NOT NULL)`. The step is non-fatal: on failure the old rows stay, and the Stash list shows the fetch time (or *unavailable*) above the column.

### 5.2 Signal snapshot

`ros_snapshots` gains `market_value INTEGER` and `trending_adds INTEGER` (nullable). `buildRosSnapshot` fills them from `market_values` and `trending_adds` at snapshot time; the trending step runs before the snapshot step. One row per player per week, next to the ROS values already there and the actual points in `player_week_points` — enough for a later backtest of which signal predicted breakouts.

### 5.3 Waiver position

`teams.waiver_position INTEGER` from Sleeper's roster `settings.waiver_position`, mapped in `src/main/sync/mappers.ts`. Null when absent.

### 5.4 IR settings

`LeagueSettings` gains:

- `irSlots?: number` — Sleeper `reserve_slots`.
- `irStatuses?: string[]` — `IR` always, plus `Out` / `Doubtful` / `Sus` / `NA` / `DNR` / `COV` for each `reserve_allow_out` / `_doubtful` / `_sus` / `_na` / `_dnr` / `_cov` flag that is `1`. `PUP` has no Sleeper flag; it is a user choice, off by default.

Both are mapped in `mappers.ts`, validated in `src/main/scoring/normalize.ts` (`irSlots` an integer 0–10; `irStatuses` a subset of `IR, PUP, Out, Doubtful, Sus, NA, DNR, COV`), and editable on the Rules screen next to the waiver fields: *IR slots* as a number field, the statuses as checkboxes (`IR` checked and locked). Without `irSlots` no IR release is offered.

### 5.5 Migration

`009_waivers.sql`: `trending_adds`, the two `ros_snapshots` columns, `teams.waiver_position`.

## 6. Shared types, IPC and the engine worker

```ts
type Release =
  | { kind: 'open' }
  | { kind: 'ir'; playerId: string }
  | { kind: 'drop'; playerId: string }

interface AddOption {
  release: Release
  releasePlayer: TradePlayer | null      // null for open
  delta: number
  deltaPerWeek: number
  thisWeekDelta: number
  startWeeks: number[]
}

interface AddRow { player: TradePlayer; options: AddOption[] }   // best first

interface StashRow {
  player: TradePlayer
  trending: number | null
  options: AddOption[]                   // cost = −delta
}

interface StreamOption {
  release: Release
  releasePlayer: TradePlayer | null
  weekGain: number
  restCost: number
  net: number
}

interface StreamRow { player: TradePlayer; opponent: string | null; options: StreamOption[] }

interface WaiverAdds {
  lineup: AddRow[]
  stash: StashRow[]
  window: { from: number; to: number }
  waiverType: WaiverType
  myWaiverPosition: number | null
  teamCount: number
  trendingFetchedAt: string | null
}
```

Market value and ROS rank come from `TradePlayer.market` / `.expert`.

IPC (preload + `src/main/ipc`):

- `waiver:adds { season }` → `WaiverAdds`.
- `waiver:stream { season, week }` → `StreamRow[]` — changing the week re-runs only this.
- `trade:openSpot { season, trade }` → §7.

**Engine worker.** Plan M's `src/main/trade/worker.ts` becomes `src/main/engine/worker.ts`, bundled as `out/main/engineWorker.js` (entry renamed in `electron.vite.config.ts`). Messages are `{ kind: 'tradeSuggest' | 'waiverAdds' | 'waiverStream' | 'openSpot', input }`; `runSuggest` becomes `runEngine(kind, input)`. Each call rebuilds from the DB in the worker (`fromDb`), so results are never stale after a sync. Plan M's packaging caveat carries over: if the worker fails inside the asar, add `out/main/engineWorker.js` to `asarUnpack`.

## 7. Trade builder: open-spot line

When a side's after-roster (after 6b's auto-drops) has fewer active players than `rosterSize`, the builder shows under that side's verdict: *"Open spot: best add Tyler Allgeier, +0.8/wk"*.

`trade:openSpot { season, trade }` → per side `{ rosterId, add: TradePlayer, deltaPerWeek } | null`: §2.3 on that side's after-roster with the release fixed to `open`, the baseline being the after-roster's window total, over free agents not in the trade. It runs in the engine worker after the verdict is shown; the verdict never waits for it. The headline Δ, the verdict flags and the suggestion search are unchanged.

## 8. The Waivers screen

A **Waivers** entry in the sidebar after Trade — `src/renderer/src/screens/WaiverScreen.tsx`, built from the Trade screen's cards.

- **Header:** *Waiver priority 12 of 16* (priority leagues with a known position only), the window (*weeks 3–17*), and a `Rest of season | Streaming` segmented control.
- **Rest of season** — two stacked cards:
  - *Improves my lineup*: player (position, NFL team, injury badge), **Δ/week** as the headline in green, window Δ, this week's Δ, start weeks (`wk 7, 9`, or `12 of 15 wks` when long), release cell.
  - *Stash*: player, market value, trending (24 h), ROS rank, release cell with its cost and a subtle *free* tag at 0; sortable columns, default market value.
- **Streaming**: week picker (upcoming week + 3, within the window) and position chips (All · QB · RB · WR · TE · K · DEF); rows show player, opponent, week gain, rest cost, **net** as the headline, release cell.
- **Release cell**: *Drop Kendre Miller · −0.0*, *Open spot*, or *IR: Caleb Williams*; a dropdown lists every option with its cost, and choosing one updates that row from the precomputed options. The choice is not saved.
- Row click opens the existing player detail panel (news, expert, market).
- *Rest of season* loads on screen open; *Streaming* on first switch and on each week change. Each card shows a spinner while the worker runs and keeps the previous result visible during a refresh.
- Advice only — claims are made in Sleeper.

## 9. Errors and empty states

- Past season, no stored projections, no team flagged as mine: 6b's `TradeError` codes (`NO_PROJECTIONS`, `NO_ME`), shown as the screen's error state.
- Empty lists explain themselves: *No free agent improves your lineup over the rest of the season*, *No streamer beats your lineup in week 5*, *No free agent carries a market, trending or expert signal*.
- Trending unavailable: the Stash column reads *—* and the card notes when trending was last fetched.

## 10. Testing

- **Engine unit tests** (`src/main/waiver/*.test.ts`): each release kind; IR eligibility from `irSlots` / `irStatuses` (full IR slots, ineligible status, no `irSlots`); the tie order; the skip; the non-starter shortcut; `open` being the only option when a spot is free; streaming `weekGain` / `restCost` / `net` and the played-game exclusion; the stash shortlist union.
- **Property test** (Plan M pattern): on generated leagues, `searchAdds` and the streaming search return exactly the rows of a brute-force run — every free agent × every release, every week solved.
- **Budget** (`npm run test:budget`): rest-of-season adds ≤ 3 s, one streaming week ≤ 1 s, open spot ≤ 1 s, on a fixture the size of the user's league (16 teams, ~550 free agents).
- **Sync and data**: `reserve_*` → `irSlots` / `irStatuses`; `waiver_position`; trending fetch parse and non-fatal failure; migration 009; snapshot columns filled; `normalize` validation.
- **Worker**: the renamed entry handles all four kinds; errors cross the thread boundary as before.
- **Component tests**: the mode switch, the release dropdown updating its row, the week picker and chips, the empty and error states, the Rules screen IR fields, the trade builder's open-spot line.
- **Real-data check**: on a copy of the dev DB, a throwaway test prints the user's top adds, stashes and streamers with their releases; each must be explainable. Never committed.

## 11. Files

| File | Change |
| --- | --- |
| `src/main/db/migrations/009_waivers.sql`, `migrations/index.ts` | `trending_adds`, snapshot columns, `teams.waiver_position` |
| `src/main/db/repos/trending.ts` (new), `repos/rosSnapshots.ts`, `repos/teams.ts` | read/write the new data |
| `src/main/sources/sleeper.ts`, `sleeper-types.ts` | trending endpoint; roster `settings.waiver_position`; league `reserve_*` |
| `src/main/sync/trendingSync.ts`, sync orchestration | the non-fatal step before the snapshot |
| `src/main/sync/mappers.ts`, `src/main/scoring/normalize.ts`, `src/shared/rules.ts` | `irSlots`, `irStatuses`, waiver position |
| `src/main/value/snapshot.ts` | fill `market_value`, `trending_adds` |
| `src/main/waiver/{search,release,stash,stream,fromDb}.ts` | the engine (§2–4) |
| `src/main/engine/worker.ts`, `runEngine.ts`; `electron.vite.config.ts` | generic worker (replaces `trade/worker.ts`, `trade/runSuggest.ts`) |
| `src/main/trade/openSpot.ts` | §7 |
| `src/shared/types.ts`, `src/preload/index.ts`, `index.d.ts`, `src/main/ipc/handlers.ts` | types and channels (§6) |
| `src/renderer/src/screens/WaiverScreen.tsx`, `App.tsx` sidebar | the screen |
| `src/renderer/src/screens/RulesScreen.tsx` | IR fields |
| `src/renderer/src/screens/TradeScreen.tsx` | open-spot line |
| `docs/reference/value-and-signals.md` | a Waivers section: releases, tie order, thresholds, streaming net |

## 12. Phasing

Two plans, one release each:

- **Plan O → `v0.16.0`:** data and sync (§5), the engine (§2), Stash (§3), the generic worker (§6), and the Waivers screen's *Rest of season* mode.
- **Plan P → `v0.17.0`:** Streaming (§4) and the trade builder's open-spot line (§7).

Follow-ups after 6c: multi-team trades (the user's request of 2026-09-21), and the ROS realism backtest from `ros_snapshots` mid-season — which can now also test the stash signals.
