# Slice 6b — Trade Evaluator — Design

**Status:** approved by the user on 2026-09-21 (approach and sections 1–6 reviewed one by one).
**Builds on:** slice 6a (`v0.12.0`): `buildLineups` → `LineupBuild` (memoised `teamWeek`, `optimalLineup` over the app-owned `rosterSlots` and `FLEX_ELIGIBILITY`, `swapsBetween`, availability flags), `teamStrengths`, the `lineupCache` cleared by `invalidateCaches()`; slice 5: `PlayerValueRow.market` (FantasyCalc) and `.expert` (FantasyPros ROS), `rosPoints` / `rosValue`; the app-owned `LeagueSettings` (`playoffStartWeek`, `playoffTeams`, `tradeDeadlineWeek`).

## 1. Goal

Slice 6 (decision tools) is 6a lineup model (done), **6b trade evaluator (this spec)**, 6c waiver recommendations.

What 6b delivers to the user:

1. A **trade builder**: my players ↔ one other team's players, with a verdict for each side — the change in rest-of-season team strength (6a's optimal-lineup engine on the swapped rosters), this week's change, and the market balance — plus the per-player model / market / expert values as context.
2. **Trade suggestions**: a scan of the league for 1-for-1, 2-for-1 and 1-for-2 offers that help me and that the other manager would plausibly accept, steered by a *focus* (a player I'd give, or a position I want) and a *stance* (how eager I am). Every suggestion opens in the builder with identical numbers.

Delivered as two plans (L, M) under this spec.

### Decisions taken in brainstorming

| Question | Decision |
| --- | --- |
| Scope | Builder first, suggestions second, both in this spec; suggestions reuse the evaluator. |
| Headline number | Team-strength delta per side (ROS optimal-lineup total after − before). Player value sums (model / market / expert) are context; the market balance is the *acceptance* signal. |
| Time window | The league's last fantasy week, derived from the playoff settings (§2.1). Fixes the power ranking as a side effect. No regular-season / playoff split. |
| Acceptance filter for suggestions | Passes when it helps *their* lineup (their Δ > 0) **or** is fair on the market for them (they receive ≥ 90 % of what they give); the card says which. |
| Eagerness | Per-query, not persistent: a *focus* (give a player / want a position) and a *stance* dial (premium / fair / overpay) that moves the thresholds on **my** side only. |
| Engine location | Pure modules in the main process on top of the cached `LineupBuild` (approach 1). A marginal-value table is not additive for the 2-for-1s that matter; renderer-side evaluation duplicates the scoring conventions. |
| Placement | New `Trade` screen in the sidebar: builder on top, suggestions below. |

### Non-goals

- Three-team trades, draft picks, FAAB in trades, 2-for-2 and larger shapes.
- Persistent per-player tags (untouchable / shopping).
- A regular-season vs. playoff split of the delta.
- Changing `rosPoints` / `rosValue` to the league window — they stay player-centric to week 18; moving them shifts replacement levels, `vsMine`, `droppable`.
- A win-probability / playoff-odds model.
- Sending offers to Sleeper; reading pending offers from Sleeper.
- The waiver value of a roster spot freed by a 2-for-1 (6c).

## 2. League window and the evaluation engine

### 2.1 League window

`LeagueSettings` gains `playoffRoundType?: number` (Sleeper `settings.playoff_round_type`: `0` one week per round, `1` two-week final, `2` two weeks per round), mapped in `src/main/sync/mappers.ts` and listed in `src/main/scoring/normalize.ts` like `playoffStartWeek`.

`lastFantasyWeek(settings)` in `src/shared/rules.ts`, pure:

```
no playoffStartWeek            → 18
rounds  = playoffTeams ? ceil(log2(playoffTeams)) : 1
weeks   = rounds                 (roundType 0 / undefined)
        = rounds + 1             (roundType 1)
        = rounds × 2             (roundType 2)
lastWeek = min(18, playoffStartWeek + weeks − 1)
```

`ValueContext` carries it as `lastWeek`, computed in `loadSeries` from the league's rules. The **window** is `currentWeek..lastWeek`; `weeks = lastWeek − currentWeek + 1` (0 for a past season). `teamStrengths` sums the window instead of `currentWeek..18`.

### 2.2 Trade model

Two rosters, at least one player on each side. No picks, no FAAB. A traded player keeps his availability flags: an IR / taxi player stays flagged on the receiving roster (he is still hurt), and the current-week injury rule applies unchanged.

### 2.3 `evaluateTrade(build, trade)` — `src/main/trade/evaluate.ts`

Pure, no DB access. For each side:

- `before` = Σ over the window of `teamWeek(build, rosterId, w).optimalTotal` (memoised by 6a).
- **Roster after** = current roster − given + received − `drops`. The league's roster size is the number of entries in Sleeper's `roster_positions` (IR and taxi are separate lists). When the after-roster exceeds it, `drops` are auto-picked among active (non-IR, non-taxi) players: fewest window weeks as a starter on the (oversized) after-roster, ties by lowest `rosPoints`, then name; `after` is then recomputed without them. Drops are shown, never silent. An already-oversized roster drops as many as needed and says so.
- `after` = Σ over the window of `rosterWeek(build, afterRoster, w).optimalTotal` — `rosterWeek` is the un-memoised sibling of `teamWeek` for a hypothetical roster (same candidates, flags and values).
- `delta = after − before`, `deltaPerWeek = delta / weeks`, `thisWeekDelta` = the current week alone.
- Market: `marketGive` / `marketGet` = Σ FantasyCalc `market.value` on each list; a player without a value counts 0 and is counted in `unvaluedGive` / `unvaluedGet`. Market ratio of a side = `marketGet / marketGive` (`+∞` when `marketGive = 0`).
- `weeksChanged` = window weeks whose optimal lineup differs; `thisWeekSwaps` = `swapsBetween(after, before)` for the current week.

**Week skip (exact).** A week's Δ is exactly 0 — no solve — when both hold:

1. no given player is a starter in that week's before-optimal, and
2. no received player *can enter*: `canEnter(p, w)` is true when a lineup slot is empty, or when `value(p, w)` exceeds the lowest-valued starter in any slot **reachable** from `p`'s position. Reachable = the closure over the flex chain: the slots `p` is eligible for, then the slots the starters in those slots are eligible for, and so on (a WR entering FLEX can push the FLEX WR to the WR slot and bench a weaker WR — "eligible" alone is unsound; "reachable" is exact because every improving augmentation ends by benching a reachable starter or filling an empty slot).

The closure is computed once per build from the slot model and the positions present.

### 2.4 Verdict

Per side: `delta`, `deltaPerWeek`, `thisWeekDelta`, `before → after`, drops, market line. Overall: `winWin` (both `delta > 0`) and `marketFair` (each side's market ratio ≥ `MARKET_FAIR = 0.90`). `tradeDeadlinePassed = tradeDeadlineWeek < currentWeek` when the setting exists.

Unavailable (error, §6) for a past season or without stored projections.

## 3. Suggestion search — `src/main/trade/suggest.ts`

### 3.1 Query

`{ season, focus, stance, partnerRosterId }` — `focus` is `{ give: playerId }`, `{ want: position }` or `null`; `stance` is `premium | fair | overpay`; `partnerRosterId` restricts the scan to one team (`null` = every other team).

### 3.2 Enumeration

- Shapes: 1-for-1, 2-for-1 (I give two), 1-for-2 (I get two).
- My give pool: my whole roster (IR and taxi included). With `focus.give`, every offer includes that player.
- Their pool per team: players with `canEnter(p, w)` true on **my** roster for at least one window week. With `focus.want`, at least one received player has that position. In a 1-for-2 both received players must pass — a throw-in that never starts for me only makes the offer worse for them.
- Each candidate is evaluated with `evaluateTrade`; the week skip is what keeps ~10 k candidates on a 16-team league under the budget (§6).

### 3.3 Filters

My side, by stance, on `deltaPerWeek` and my market ratio:

| stance | my Δ/week | my market ratio |
| --- | --- | --- |
| `premium` | ≥ +1.0 | ≥ 1.00 |
| `fair` | > 0 | ≥ 0.85 |
| `overpay` | ≥ −1.0 | ≥ 0.70 |

Consequences: giving only unvalued players passes the ratio (`+∞`); receiving only unvalued players for a valued one fails at every stance (ratio 0).

Their side (acceptance): `theirDelta > 0` **or** their market ratio ≥ 0.90. Label `lineup`, `market`, or `both`.

### 3.4 Dominance and ranking

- A 2-for-1 or 1-for-2 is dropped when the 1-for-1 it contains passes the same filters with a my-Δ within `DOMINANCE_PTS = 0.5` of it — the extra player was padding. 1-for-1s are evaluated first so the check is a map lookup.
- Sort by my `delta` desc, ties by my market ratio desc, then partner name. Cap at `SUGGEST_MAX = 30`.
- Each result carries the full `TradeEvaluation` and the acceptance label, so the card and the builder show identical numbers.

## 4. Shared types and IPC

### 4.1 Types (`src/shared/types.ts`)

```ts
export type TradeStance = 'premium' | 'fair' | 'overpay'
export type TradeFocus = { give: string } | { want: string } | null   // playerId | position

/** From my side: I give `give`, I get `get` from roster `rosterId`. */
export interface TradeProposal { rosterId: number; give: string[]; get: string[] }

/** A player as the trade table shows him; extends DetailTarget so the detail panel opens from any row. */
export interface TradePlayer extends DetailTarget {
  injuryStatus: string | null
  /** IR / taxi slot on his current roster; follows him through a trade. */
  reserve: 'ir' | 'taxi' | null
  rosPoints: number | null
  rosValue: number | null
  expert: ExpertRos | null
  market: MarketValue | null
  /** Window weeks in which he starts for his current owner (before the trade). */
  starterWeeks: number
}

export interface TradeSideResult {
  rosterId: number; name: string; isMe: boolean
  give: TradePlayer[]; get: TradePlayer[]
  /** Auto-picked to respect the roster size; empty when none needed. */
  drops: TradePlayer[]
  before: number; after: number; delta: number; deltaPerWeek: number
  thisWeekDelta: number
  marketGive: number; marketGet: number
  /** Players on each list without a FantasyCalc value (counted 0). */
  unvaluedGive: number; unvaluedGet: number
  weeksChanged: number
  thisWeekSwaps: Swap[]
}

export interface TradeEvaluation {
  season: number; currentWeek: number; lastWeek: number; weeks: number
  tradeDeadlinePassed: boolean
  me: TradeSideResult; them: TradeSideResult
  winWin: boolean; marketFair: boolean
}

export interface TradeSuggestion {
  evaluation: TradeEvaluation
  /** Why they'd take it. */
  acceptance: 'lineup' | 'market' | 'both'
}

export interface TradeSuggestQuery {
  season: number; focus: TradeFocus; stance: TradeStance; partnerRosterId: number | null
}

export interface TradePool {
  season: number; currentWeek: number; lastWeek: number; weeks: number
  tradeDeadlinePassed: boolean
  me: { rosterId: number; name: string; players: TradePlayer[] }
  teams: { rosterId: number; name: string; players: TradePlayer[] }[]
}
```

### 4.2 IPC (`src/shared/ipc.ts`, preload `api.trade`)

| Channel | Signature | Errors |
| --- | --- | --- |
| `trade:pool` | `(season) → TradePool` | `NO_PROJECTIONS`, `NO_ME` |
| `trade:evaluate` | `(season, TradeProposal) → TradeEvaluation` | `NO_PROJECTIONS`, `NO_ME`, `INVALID_TRADE` |
| `trade:suggest` | `(TradeSuggestQuery) → TradeSuggestion[]` | `NO_PROJECTIONS`, `NO_ME` |

`INVALID_TRADE`: an empty side, a player not on the stated roster, or a player id unknown to the build (traded on Sleeper between syncs). `[]` from `trade:suggest` is a normal answer.

All three read `cachedLineup(ctx, leagueId, season)`; a sync invalidates them with everything else. No new tables, no new sync step. `trade:suggest` runs synchronously in the handler.

## 5. UI — Trade screen

New sidebar entry **Trade** (`ArrowLeftRight`), enabled once a league is imported, re-fetching on `dataVersion` like the Lineup screen. Two stacked sections.

**Header line.** Season and window ("weeks 4–17 · 14 weeks"). When `tradeDeadlinePassed`, a banner says trades are closed; nothing is disabled.

### 5.1 Builder

```
 Partner: [ team ▾ ]                                    [ Suggest with this team ]
 ┌── I give ──────────────────┐   ┌── I get ───────────────────┐
 │ RB Player A   ROS 82  …    │   │ WR Player C   ROS 91  …    │
 │ + add player ▾             │   │ + add player ▾             │
 └────────────────────────────┘   └────────────────────────────┘
                              [ Evaluate ]
```

- Pickers are position-filterable dropdowns over `trade:pool`; a chosen player becomes a row: position badge, name, ROS pts / value, ECR, MKT, "starts 11/14" (`starterWeeks`/`weeks`), an IR / taxi tag when `reserve` is set. Rows open `PlayerDetailPanel`.
- **Evaluate** (disabled with an empty side) calls `trade:evaluate`; changing a side clears the verdict.
- **Verdict card**: two columns *Me* / *Them*. Headline `Δ` with `Δ/wk` (`fmtSigned`, green / red), then `before → after`, `this week Δ`, `drop: X` when present, and the market line `gives 4 200 → gets 3 900 (93 %)` with "1 unvalued" when relevant. Badges **Win-win** / **Market-fair** (muted when false). Below, my current-week swaps rendered as on the Lineup screen.
- "Suggest with this team" runs the suggestions section with `partnerRosterId` set.

### 5.2 Suggestions

```
 Focus: ( none | I give [player ▾] | I want [pos ▾] )   Stance: [ premium | fair | overpay ]   [ Find ]
 ─────────────────────────────────────────────────────────────────────────
 with Team X     Me +18.4 (+1.3/wk)   Them +6.1     market · lineup
   give  RB A, WR B      get  RB C                              [ Open in builder ]
```

- One row per suggestion in engine order; `acceptance` as one or two tags. With `focus.give`, the player's MKT and 30-day trend sit next to the focus control (the sell-high check).
- **Open in builder** sets the partner and both sides, runs Evaluate, scrolls to the builder.
- Spinner during Find; empty result reads "No offers at this stance — try *fair* / *overpay*".

Past season or no projections: the 6a-style notice, nothing else.

### 5.3 Data reference

`docs/reference/value-and-signals.md` gains a Trade section (window, Δ definitions, drops, market line, stance and acceptance tables, constants).

## 6. Error handling

- `NO_PROJECTIONS` / `NO_ME` → the screen's notice, as on the Lineup screen.
- `INVALID_TRADE` → the screen's error line; the builder keeps its sides so the user can fix them.
- Unknown player id (roster moved on Sleeper since the last sync) → `INVALID_TRADE`, never a crash.
- Received IR / taxi player → contributes 0 until a sync changes his slot; the row shows the IR / taxi tag.
- Oversized after-roster → auto-drops (§2.3), stated on the card.
- Empty search → `[]`, stance hint in the UI. A slow search is not an error; the spinner stays. Budget: ≤ 3 s on a 16-team, 16-player league; `worker_threads` is the recorded fallback if a league blows it — not built now.
- Trade deadline passed → banner only.

## 7. Testing

- `lastFantasyWeek` — table: no playoffs → 18; 6 teams from 15 → 17; 4 teams from 15 → 16; two-week final → 18 (cap); two-week rounds; missing `playoffTeams`.
- `evaluate.ts` — fixture bundle reused from 6a: Δ equals an independent recomputation with `buildLineups` on swapped rosters; auto-drop rule and ties; market sums with an unvalued player; `thisWeekDelta`; symmetry (my `give` is their `get`); IR flag follows the player.
- **Week-skip soundness** — property test on random rosters and trades: `evaluateTrade` with the skip equals the same with the skip disabled; the WR-through-FLEX chain as a fixed case.
- `suggest.ts` — shapes and focus constraints; stance boundaries (Δ/week exactly 0, ratio exactly 0.85, `marketGive = 0`); acceptance labels; dominance (padded 2-for-1 dropped, genuinely better one kept); cap, ordering, `partnerRosterId`.
- Budget — synthetic 16 × 16 league asserts `suggest` under 3 s; skipped in CI when flaky, always run locally before a build.
- Renderer — `lib/tradeView.ts` pure helpers (verdict strings, tags, market line); one DOM test for builder → verdict, one for "Open in builder".
- Real-data check on the dev DB (throwaway `tests/zz-*.test.ts`) before the Windows build.

## 8. Structure

| Path | Role |
| --- | --- |
| `src/shared/rules.ts` | `playoffRoundType`; `lastFantasyWeek` |
| `src/main/sync/mappers.ts`, `src/main/scoring/normalize.ts` | map / normalise the setting |
| `src/main/value/series.ts` | `ValueContext.lastWeek` |
| `src/main/lineup/build.ts` | `teamStrengths` over the window; `rosterWeek` |
| `src/main/trade/evaluate.ts` | `evaluateTrade`, drops, market sums, `canEnter` + reachable-slot closure |
| `src/main/trade/suggest.ts` | enumeration, filters, dominance, ranking; constants |
| `src/main/trade/pool.ts` | `TradePlayer` rows and `TradePool` |
| `src/main/ipc/handlers.ts`, `src/shared/ipc.ts`, `src/preload/index.ts` | three channels, `api.trade` |
| `src/renderer/src/screens/TradeScreen.tsx`, `src/renderer/src/lib/tradeView.ts`, `components/Sidebar.tsx` | screen, view helpers, nav entry |
| `docs/reference/value-and-signals.md` | Trade section |

Constants: `MARKET_FAIR = 0.90`, stance table (§3.3), `DOMINANCE_PTS = 0.5`, `SUGGEST_MAX = 30`.

## 9. Phasing

- **Plan L — evaluator** → `v0.13.0`: §2 (league window incl. the power-ranking fix, `evaluateTrade`), `trade:pool` + `trade:evaluate`, the Trade screen with builder and verdict card (§5.1), data reference.
- **Plan M — suggestions** → `v0.14.0`: §3, `trade:suggest`, the suggestions section (§5.2), "Open in builder", "Suggest with this team", the budget test.

Then 6c (waiver recommendations), brainstormed against this engine and the freed-roster-spot question left open here.
