# Multi-Team Trades — Design

**Status:** design approved by the user on 2026-09-30 (approach and sections 1–5 reviewed one by one); written spec awaiting review.
**Builds on:** slice 6b (`v0.13.0`–`v0.14.0`): `evaluateTrade` / `sideResult` (window strength before → after per side, auto-drops, week skip, market sums), `suggestTrades` (1-for-1 / 2-for-1 / 1-for-2, stance, `acceptanceOf` with `ACCEPT_LOSS_PER_WEEK`, dominance, the Plan M exact prunes and their property test); slice 6c (`v0.16.0`–`v0.17.0`): the engine worker (`runEngine`, `out/main/engineWorker.js`), `trade:openSpot`.

## 1. Goal

The 6b trade tools stop at two teams (a 6b non-goal). This spec lifts that limit:

1. The **builder** takes any number of teams: each player a team sends has a destination, and the verdict shows every team.
2. The **suggestion search** finds deals of 2 up to _N_ teams in one merged list that fills in **live** while the search runs, with a Stop button. Multi-team deals are cycles (me → B → C → me), 1–2 players per hop.

**Quality rule (user requirement).** Raising _N_ may cost search time, never result quality. Every prune is exact: the optimized search must return exactly what a brute-force search returns (§7).

Delivered as two plans (Q, R) under this spec (§9).

### Decisions taken in brainstorming

| Question               | Decision                                                                                                                                                                                   |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Scope                  | Builder and suggestions.                                                                                                                                                                   |
| Team count             | N everywhere: the builder has no cap; the search takes `maxTeams`. Exact prunes only.                                                                                                      |
| Search shapes          | Cycles; each hop carries 1 or 2 players; at most one 2-player hop per deal (k = 2 is exactly 6b's three shapes).                                                                           |
| Results list           | One merged list over 2..`maxTeams` teams, streamed live, with Stop. An "Up to N teams" control, default 3.                                                                                 |
| Grouping               | One card per _my side_ (what I give, what I get): the simplest deal every manager accepts; other working deals at that size as "+n other ways".                                            |
| Acceptance             | 6b's rule, applied to every other team in the deal.                                                                                                                                        |
| Engine approach        | _My side first_: rank my sides lazily best-first, search bridges per my side (approach A). Results equal a size-by-size or whole-cycle enumeration, found faster, streamed in final order. |
| Run ownership          | The main process owns one active run; the Trade screen re-attaches after a tab switch.                                                                                                     |
| "Must include" default | Any team (was: the builder's partner, only because the blocking scan took 16–23 s).                                                                                                        |

### Non-goals

- Non-cycle shapes in the **search** (a team sending players to two teams; me receiving from two teams). The builder evaluates them.
- More than one 2-player hop per suggested deal; any team giving 2 _and_ getting 2 in a suggestion.
- Draft picks, FAAB (unchanged from 6b).
- Sending offers to Sleeper; reading pending offers.
- Several concurrent searches; keeping a run across app restarts.
- A probability-of-acceptance model (acceptance stays 6b's yes/no rule).

## 2. The N-team deal model

### 2.1 Proposal

```ts
/** One player changing teams; the source is his current roster. */
export interface TradeMove {
  playerId: string
  to: number
}
export interface TradeProposal {
  moves: TradeMove[]
}
```

It replaces 6b's `{ rosterId, give, get }`; a 2-team deal is the special case, one code path serves both.

**Validation** (`INVALID_TRADE`, plain messages, §6): every `playerId` is on some roster and appears once; `to` is a league team other than his current one; I am one of the teams; at least two teams; every team in the deal sends ≥ 1 player and gets ≥ 1 player. The teams of a deal are every source and destination.

### 2.2 Evaluation — `evaluateTrade(build, proposal)`

Per team _T_: gives = players moving out of _T_, gets = players moving into _T_; `sideResult` runs unchanged on (T, gives, gets) — before, after-roster (roster − gives + gets − auto-drops), after, Δ, Δ/week, this week's Δ, market sums, weeks changed, this week's swaps. A side's result depends only on its own gives and gets.

```ts
export interface TradeSideResult {
  // … every 6b field, with:
  give: (TradePlayer & { to: number })[] // destination roster
  get: (TradePlayer & { from: number })[] // source roster
}
export interface TradeEvaluation {
  season
  currentWeek
  lastWeek
  weeks
  tradeDeadlinePassed // unchanged
  /** Me first, then the other teams in order of first appearance in `moves`. */
  sides: TradeSideResult[]
  /** Every side's delta > 0 (was `winWin`). */
  everyoneGains: boolean
  /** Every side receives ≥ MARKET_FAIR of the market value it gives. */
  marketFair: boolean
}
```

`starterWeeks` of a received player is counted on his source team (6b counted it on "the other side"). Auto-drops, the week skip and the market rules are 6b §2.3 unchanged.

### 2.3 Side memo

`sideFor(memo, build, rosterId, gives, gets)` wraps `sideResult` with a memo keyed by `rosterId|sorted gives|sorted gets`. `evaluateTrade` and the search (§3) both go through it, so a suggestion card and the builder show identical numbers. The memo lives for one call (evaluate) or one run (search).

### 2.4 Open spots

`trade:openSpot(season, proposal)` returns `{ sides: (OpenSpot | null)[] }`, aligned with `evaluation.sides`; each entry is 6c §7's rule for that side.

## 3. Suggestion search

### 3.1 Query and definitions

```ts
export interface TradeSuggestQuery {
  season: number
  focus: TradeFocus // unchanged
  stance: TradeStance // unchanged
  /** 2..number of teams; clamped. */
  maxTeams: number
  /** The deal must involve this team; null = any. */
  mustInclude: number | null
}
```

A **k-team deal** is a cycle T₀ = me → T₁ → … → T_{k−1} → me of distinct teams. Hop _i_ carries players from Tᵢ to T_{i+1} (T_k = me); each team gives its outgoing hop and gets its incoming hop. Each hop carries 1 or 2 players; at most one hop carries 2.

A **my side** is (x, z, C): x = hop 0 (what I give), z = hop k−1 (what I get), C = T_{k−1} (the team z comes from). The **bridge** is everything in between: T₁ … T_{k−2} and hops 1 … k−2. For k = 2 there is no bridge: C takes x and sends z.

Constants unchanged: `MARKET_FAIR = 0.90`, `ACCEPT_LOSS_PER_WEEK = 1`, `DOMINANCE_PTS = 0.5`, `SUGGEST_MAX = 30`, the `STANCES` table.

### 3.2 My sides, in rank order

**Candidates.**

- x: 1 or 2 of my players (IR and taxi included); with `focus.give`, x contains that player.
- z: 1 or 2 of C's players, each able to enter my lineup in at least one window week (6b `entersLineup`); with `focus.want`, at least one of z has that position.
- x and z are not both pairs.
- When `maxTeams = 2` and `mustInclude` is set, C = `mustInclude`.
- Market precheck (no solve): my market ratio ≥ the stance's ratio.

The candidates left after the precheck are the progress total (§4.1).

**Stance.** A my side passes when `passesStance(stance, myΔ/week, my market ratio)` holds on my side's exact result `sideFor(me, x, z)`. It does not depend on who receives x.

**Rank key** (6b §3.4's sort, all on my side): my Δ desc, my market ratio desc, C's name asc, then x's and z's sorted ids asc.

**Lazy best-first.** For each z, the bound U(z) = my window total on (my roster ∪ z) with no gives and no drop rule, minus my before-total. The lineup optimum is monotone in the roster and my after-roster is a subset of (my roster ∪ z), so myΔ(x, z) ≤ U(z) for every x.

- When `stanceDelta(stance, U(z) / weeks)` fails, every my side with that z is discarded without a solve.
- The others enter a priority queue at their bound. The top entry is popped: a bound entry is replaced by its exact result (or discarded if it fails the stance) and re-queued; an exact entry is the next my side in rank order.
- At equal Δ, bound entries sort ahead of exact ones, so an exact entry is only taken when nothing unevaluated can tie or beat it; exact entries compare on the full rank key.
- Plan M's monotonicity bound applies: when the contained my side that gives one player fewer (same z) needed no drops and failed `stanceDelta`, a pair x fails too.

### 3.3 The smallest deal that works

For each my side taken from the queue, sizes k = 2, 3, … up to `min(maxTeams, number of teams)`:

- **k = 2:** C gets x, gives z.
- **k ≥ 3:** a depth-first search over ordered distinct bridge teams T₁ … T_{k−2} (not me, not C) and what each sends (any 1 or 2 of its players, IR and taxi included). A bridge hop may carry 2 only when x and z are singles and no other bridge hop does.
- **mustInclude**, when set and not C, must be one of the bridge teams (so k = 2 is skipped for that my side).
- **Checks as early as possible.** Tᵢ is checked as soon as both its hops are fixed: T₁ once hop 1 is chosen, …, C once hop k−2 is chosen. The check is 6b's `acceptanceOf(Δ, market ratio, Δ/week)` on `sideFor(Tᵢ, gives, gets)`.
- **Exact prunes before a solve:**
  - a side whose market ratio is < `MARKET_FAIR` and whose gets cannot enter its lineup in any window week is rejected (6b's rule, per team);
  - a side that gives a pair is rejected when its contained version giving one of the two (same gets) was rejected and needed no drops — its Δ, Δ/week and market ratio can only be lower (Plan M, generalized).
- The first k with any working deal is the card's size; **every** working deal of that size is collected. If no k works, the my side yields no card.

### 3.4 Cards, dominance, early stop

**Card.** One per my side. The deal shown maximizes the least-happy other team's Δ/week; ties by fewer players moved, then the sides' team names in cycle order, then player ids. The other working deals of that size are `alternatives`, in the same order.

**Dominance** (6b §3.4 generalized). A my side with a pair (x or z) is dropped when a contained single my side (one player fewer on that end, the other end equal) passes the stance, has a working deal of the same or fewer teams, and my Δ with the pair − my Δ with the single ≤ `DOMINANCE_PTS`. It is resolved when the pair is taken from the queue — the contained side's stance and bridge search run then and are memoized — so an emitted card is never withdrawn.

**Early stop.** My sides are taken in final rank order, so the search ends when `SUGGEST_MAX` cards exist (`full`), or when the queue is empty (`complete`). The emitted cards are exactly the top `SUGGEST_MAX` of: my sides that pass the stance, are not dominated, and have a working deal of ≤ `maxTeams` teams, in rank order.

### 3.5 Suggestion type

```ts
export type TradeAcceptance = 'lineup' | 'market' | 'both'
export interface TradeAlternative {
  proposal: TradeProposal
  /** e.g. "via Gridiron Gang: J. Cook". */
  label: string
  worstDeltaPerWeek: number
}

(Amended 2026-10-04, Plan S: `proposal` is now `moves: DealMove[]`, each move with the team it leaves, so a stale list can prune an alternative.)

export interface TradeSuggestion {
  /** Exactly what `trade:evaluate` returns for the shown deal. */
  evaluation: TradeEvaluation
  /** Number of teams, 2..maxTeams. */
  teams: number
  /** Aligned with evaluation.sides; null for me. */
  acceptance: (TradeAcceptance | null)[]
  alternatives: TradeAlternative[]
}
```

The search is a generator, `suggestDeals(build, query, opts)`, yielding cards and progress in order; the worker batches what it yields and tests consume it synchronously.

## 4. Streaming

### 4.1 Worker

The engine worker keeps its one-shot jobs (evaluate, open spot, waivers). The suggestion job gets a streaming runner, `runEngineStream(dbPath, leagueId, job, onEvent) → { stop() }`. The worker posts, batched at most every ~250 ms:

```ts
export interface SuggestProgress {
  checked: number // my sides resolved (discarded, failed, searched)
  total: number // my-side candidates after the market precheck
  found: number // cards so far
  size: number // k being tried for the current my side
  elapsedMs: number
}
export type SuggestEvent =
  | { runId: number; type: 'cards'; cards: TradeSuggestion[] }
  | { runId: number; type: 'progress'; progress: SuggestProgress }
  | {
      runId: number
      type: 'done'
      reason: 'complete' | 'full' | 'stopped' | 'stale'
      progress: SuggestProgress
    }
  | { runId: number; type: 'error'; message: string }
```

Cards arrive in final rank order: the list only appends. `stop()` terminates the worker.

### 4.2 Run manager — main process

One active run, owned by main (`src/main/trade/suggestRun.ts`): its id, query, cards so far, progress and status (`running` or the `done` reason, or `error`).

| Channel                                             | Direction       | Does                                                                                                    |
| --------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------- |
| `trade:suggestStart(query) → runId`                 | invoke          | Starts a run; stops the previous one (`stopped`). Refused during a league refresh (amended 2026-10-04). |
| `trade:suggestStop()`                               | invoke          | Stops the active run (`stopped`); cards stay.                                                           |
| `trade:suggestSnapshot() → SuggestSnapshot \| null` | invoke          | The active or last run: `runId`, `query`, `cards`, `progress`, `status`, `message?`.                    |
| `trade:suggestEvent`                                | main → renderer | `SuggestEvent`s via `webContents.send`.                                                                 |

- Preload: `api.trade.suggestStart / suggestStop / suggestSnapshot / onSuggestEvent(cb) → unsubscribe`.
- The one-shot `trade:suggest` is removed (in Plan R; §9).
- **Stale data.** When `invalidateCaches()` runs (sync, rules save), main marks the active or last run `stale` — stopping it if it is still running: the cards stay visible under "League data changed — run again". _Open in builder_ on a stale card prunes its deal to the current rosters and evaluates it afresh instead of showing the card's verdict. (Amended 2026-10-03, Plan R Task 11 review: originally only a running search went stale, so a finished list kept old verdicts after a sync.)
- **During a refresh** (amended 2026-10-04, Plan S): `trade:suggestStart` is refused while a league refresh is in flight — "League data is refreshing — Find again when it finishes" — before anything stops; the renderer then re-attaches to main's run (snapshot), so the shown list stays. The controls stay as the user set them.
- App quit terminates the worker.
- The renderer ignores events whose `runId` is not the one it follows.

## 5. UI — Trade screen

### 5.1 Builder

- **Teams row:** "Me" (fixed), one chip per other team (× removes it), "+ add team" listing every other team. With two teams it replaces 6b's partner select. No team cap.
- **One card per team — what it sends:** 6b's player picker on that team's roster; each chosen player has a "→ destination" select over the other teams of the deal, shown only with 3+ teams. Defaults: my players go to the first other team, everyone else's go to me. A "gets:" line under each card lists what it receives and from whom.
- **Removing a team** drops the players it sends; players headed to it return to their default destination.
- **Inline validation:** Evaluate is disabled until §2.1 holds; a hint names the problem ("Tank Mode gets nobody").
- **Verdict card:** one column per side (grid wraps after 3), each with 6b's side block (Δ total and Δ/week, before → after, drops, open-spot line, market line); received players show "from X" with 3+ teams. Badges: **Everyone gains**, **Market-fair**. "This week" swaps: my side only.
- **Builder state:** the ordered list of other teams plus the moves; "Open in builder" loads a suggestion's or alternative's proposal whole.

### 5.2 Suggestions card

- **Controls:** Focus, Stance (unchanged), **Up to [2 … league size] teams** (default 3), **Must include** (any team by default), **Find** / **Stop**.
- **Status line:** while running, "Searching 3-team deals · 412 of 18 900 ideas checked · 12 found · 0:37". When done, by reason:
  - `full`: "Done: best 30 found — nothing left could rank higher"
  - `complete`: "Done: 7 found, every idea checked" (0 found: 6b's empty-state hints)
  - `stopped`: "Stopped: 12 found so far"
  - `stale`: "League data changed — run again"
  - `error`: "Search failed: …"
- **Rows:** my Δ/week, a `k-team` chip, the path in send order ("I send D. Adams → Gridiron Gang · Gridiron Gang sends J. Cook → Tank Mode · Tank Mode sends B. Robinson → me"; 2-team rows keep 6b's give/get layout), each other team's Δ/week and acceptance reason, "+n other ways ▸" expanding the alternatives (each with Open in builder), Open in builder.
- **Re-attach:** on mount the screen reads `suggestSnapshot()`, restores the controls from its query and the list, and subscribes to events; unmounting unsubscribes and leaves the run going.
- **Find is explicit:** editing a control does not restart a run; with a run shown, the status line adds "Controls changed — Find to rerun".

## 6. Error handling

| Case                                 | Behaviour                                                                                                                                                                                          |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Invalid proposal (§2.1)              | `INVALID_TRADE`: "Tank Mode gets nobody", "J. Cook is no longer on Gridiron Gang", "A player can only move once", "Pick at least one other team". The builder prevents all but the post-sync case. |
| No projections / no me / past season | Unchanged (6b §6).                                                                                                                                                                                 |
| Nothing found                        | `complete` with 0 cards — a normal answer; 6b's hints.                                                                                                                                             |
| Focus player no longer on my roster  | `complete` with 0 cards.                                                                                                                                                                           |
| `maxTeams` out of range              | Clamped to 2..number of teams.                                                                                                                                                                     |
| `mustInclude` is me or unknown       | `INVALID_TRADE` on start; the UI never offers it.                                                                                                                                                  |
| Worker error or unexpected exit      | `error` event; cards so far stay.                                                                                                                                                                  |
| Sync during or after a run           | `stale` (§4.2).                                                                                                                                                                                    |
| Find during a refresh                | Refused with "League data is refreshing — Find again when it finishes"; the shown run is unchanged (§4.2).                                                                                         |
| Packaged-asar worker                 | Unchanged from v0.16 (fallback: add `out/main/engineWorker.js` to `asarUnpack`).                                                                                                                   |

## 7. Testing

- **Evaluator.** `evaluate.test.ts` cases move to the moves shape with identical expected numbers. A hand-computed 3-team fixture checks every side's Δ, drops, `to` / `from`, `starterWeeks` from the source team, `everyoneGains`, `marketFair`. Validation cases for each §2.1 rule. `openSpot.test.ts` per side.
- **Search property test — the quality guarantee.** A brute-force oracle (`tests/main/trade/suggestOracle.ts`) enumerates every cycle of 2..`maxTeams` teams in the §3.1 shapes, evaluates every side with no memo, no week skip and no prunes, applies §3.3–3.4's acceptance, smallest size, representative, alternatives and dominance, sorts fully and caps. `suggestDeals` must equal it on small fixture leagues for `maxTeams` 2, 3, 4 × the three stances × focus give / want / none × must-include set / unset.
- **Streaming invariants.** The cards yielded, concatenated, equal the final list; a run that stopped at `full` equals the first `SUGGEST_MAX` of a run forced to exhaust the queue.
- **6b parity.** At `maxTeams = 2` the existing `suggest.test.ts` expectations hold: the same suggestions in the same order, except that exact ties (equal my Δ, ratio and partner) now order by player ids.
- **Run manager.** Start, stop, snapshot, a new start supersedes the old run, `stale` on `invalidateCaches()`, events of an old run are dropped — with a stubbed stream.
- **Renderer.** `TradeScreen.test.tsx`: add / remove a team, destinations and defaults, inline validation, the N-column verdict; live cards and the status line per reason, Stop, re-attach from a snapshot, "Controls changed".
- **Budget** (`npm run test:budget`): time to the first card on the synthetic 16-team fixture. Final-list times are measured, not asserted.
- **Real-league check:** time to first card and to the final list for `maxTeams` 2 / 3 / 4 × any team / must-include, recorded in the plan's Status block.

## 8. Structure

```
src/shared/types.ts              TradeMove, TradeProposal (moves), TradeSideResult to/from,
                                 TradeEvaluation.sides / everyoneGains, TradeOpenSpots.sides,
                                 TradeSuggestQuery (maxTeams, mustInclude), TradeSuggestion,
                                 TradeAlternative, SuggestProgress, SuggestEvent, SuggestSnapshot
src/shared/ipc.ts                trade.suggestStart / suggestStop / suggestSnapshot / onSuggestEvent
src/main/trade/deal.ts           proposal validation → per-team gives / gets
src/main/trade/sideMemo.ts       sideFor: memoized sideResult
src/main/trade/evaluate.ts       evaluateTrade over N sides
src/main/trade/openSpot.ts       per side
src/main/trade/mySides.ts        my-side candidates, bound U(z), best-first queue
src/main/trade/bridge.ts         bridge DFS for one my side, smallest working size
src/main/trade/suggest.ts        suggestDeals generator: order, dominance, cards, early stop
src/main/trade/suggestRun.ts     the active run, snapshot, stale
src/main/engine/runEngine.ts     + runEngineStream
src/main/engine/jobs.ts          streaming suggest job
src/renderer/src/screens/TradeScreen.tsx   N-team builder, live suggestions
src/renderer/src/lib/tradeView.ts          path line, status line, badges, destinations
tests/main/trade/suggestOracle.ts          brute force for the property test
```

`TradeScreen.tsx` is 621 lines today; the builder (teams row, team cards, verdict) and the suggestions card move to their own components, `src/renderer/src/components/TradeBuilder.tsx` and `TradeSuggestions.tsx`, as part of this work.

## 9. Phasing

- **Plan Q → `v0.18.0` — N-team deals.** §2 and §5.1: moves proposal, validation, N-side evaluation, side memo, open spots per side, the N-team builder. The existing one-shot 2-team search is adapted to the new types only (`sides`, `acceptance` array, `teams = 2`, no alternatives), same results; the app ships fully working.
- **Plan R → `v0.19.0` — multi-team search and streaming.** §3, §4, §5.2, in this order: the oracle and property test, the side memo in the search, my sides best-first, bridge DFS, grouping, dominance, early stop; then the streaming worker, run manager and Suggestions card; `trade:suggest` removed.
  - **Measurement gate:** once `suggestDeals` passes the property test and before the UI work, it is measured on the user's league. If 3-team deals on any team are impractically slow, work stops and the numbers go to the user; the remedies are a new exact prune or a different default (`mustInclude`, `maxTeams`), never an inexact shortcut.
- **Docs:** `docs/reference/value-and-signals.md` gains the N-team model, the bridge search and streaming, in each plan's docs task.
