# Plan R — Multi-team suggestion search and streaming (multi-team trades, phase 2)

**Status:** in progress — Tasks 0–6 and 13–16 done; second gate passed 2026-10-03; next Task 7 (order: 7–12). Gate 1 (Task 6) failed: real league up to 2 / any team 26.5 s / 31.2 s, up to 3 / any team 122.4 s / 164.9 s; remedies Tasks 13–15 adopted by the user. Gate 2 (Task 16, real league, 16 teams, weeks 4–17, no negative values, fair): up to 2 / any team — first card 1.4 s, 30 cards (full) in 1.7 s, list identical to gate 1's; up to 3 / any team — first 17.7 s, 30 (full) in 22.4 s; up to 4 / any team — first 236.3 s, 30 in 419.9 s; with a partner: up to 2 — 0.1 s (19, complete), up to 3 — 10.8 s / 11.7 s, up to 4 — 120.3 s / 141.6 s. Synthetic up to 3 / any team first card 4.8–5.2 s → `FIRST_CARD_MS` 8 000 (regression ceiling); two-team budgets < 1 s.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The suggestion search finds deals of 2 up to _N_ teams (cycles me → B → C → me, 1–2 players per hop) in one ranked list that fills in live while the search runs, with a Stop button — exact prunes only, so results equal a brute-force search. Ship `v0.19.0`.

**Architecture:** In main, a brute-force oracle (test code) defines the answer; the search reaches it faster. `mySides.ts` ranks my sides (what I give, what I get, from whom) lazily best-first on an upper bound; `bridge.ts` finds, per my side, every working deal of the smallest size (k = 2 directly, k ≥ 3 by a depth-first search over bridge teams); `suggest.ts` is a generator that adds dominance and the early stop and yields cards in final order. The engine worker gains a streaming runner that posts batched updates; a run manager in main owns the one active run (start / stop / snapshot / stale) and forwards events to the renderer; the Trade screen's Suggestions card moves to its own component that re-attaches to the run after a tab switch.

**Tech Stack:** unchanged — Electron 39, React 19, TypeScript strict, Tailwind 4 + shadcn, Vitest (jsdom + Testing Library for component tests), `node:sqlite`, `node:worker_threads`.

**Spec:** `docs/superpowers/specs/2026-09-30-multi-team-trades-design.md` — §3 (search), §4 (streaming), §5.2 (Suggestions card), §6 (errors), §7 (testing), §9 (Plan R = `v0.19.0`, with the measurement gate).

## Global Constraints

- Same as Plans C–Q: Node ≥ 22.13 (`source ~/.nvm/nvm.sh && nvm use` if `node --version` is not 22.x), no Electron imports outside `src/main/index.ts`, `src/main/ipc/`, `src/preload/`. Path aliases: `@main/*`, `@shared/*`, `@/*` (renderer). Tests import fixtures relatively (`../../fixtures/...`).
- **Payload conventions** (`docs/reference/value-and-signals.md`): points rounded with `round2`, shown with 2 decimals (`fmtPoints`), signed with `fmtSigned`.
- **Constants unchanged** (spec §3.1): `MARKET_FAIR = 0.90`, `ACCEPT_LOSS_PER_WEEK = 1`, `DOMINANCE_PTS = 0.5`, `SUGGEST_MAX = 30`, the `STANCES` table.
- **Quality rule** (spec §1): raising _N_ may cost search time, never result quality. Every prune is exact; the property test against the oracle is the guarantee. Never add an inexact shortcut — if something is slow, stop and report.
- **Shapes** (spec §3.1): a k-team deal is a cycle T₀ = me → T₁ → … → T_{k−1} = C → me; each hop carries 1 or 2 players; at most one hop carries 2. x = hop 0, z = hop k−1.
- **Rank key** (spec §3.2): my Δ desc, my market ratio desc, C's name asc, then x's and z's sorted ids asc.
- **Representative** (spec §3.4): the deal maximizing the least-happy other team's Δ/week; ties by fewer players moved, then the teams' names in cycle order, then player ids.
- Verification before every commit: `npm run typecheck && npm run lint && npm test`. Format only the files you touched with `npx prettier --write <files>` — **never** `npm run format` (it reformats unrelated docs). Conventional Commits, summary ≤ 50 chars, imperative, **no trailers** (no `Co-Authored-By`, no "Generated with").
- ESLint: explicit return types on every named function and component (and on `const` arrow helpers, as the codebase does), `react-hooks/set-state-in-effect` is an error (state is set only in promise callbacks / event handlers / subscription callbacks), no unused vars / imports, `react-refresh/only-export-components` (a `.tsx` file exports components only — types are fine).
- Decisions locked in here (not in the spec):
  - **Files.** The stance / acceptance thresholds move to `src/main/trade/thresholds.ts` (`bridge.ts` needs `acceptanceOf` and `suggest.ts` needs `bridge.ts` — one file each way would be an import cycle); `suggest.ts` re-exports them so importers don't change. What one search run shares (context, `MySide`, key and order helpers) lives in `src/main/trade/searchContext.ts`; the heap in `src/main/trade/heap.ts`. `entersLineup` moves to `enter.ts`, exported — the search and the oracle share the definition of "can enter my lineup".
  - **API.** `suggestTrades` is removed. `suggestDeals(build, query, opts)` is the generator; `collectDeals(build, query, opts) → { cards, end }` consumes it synchronously (tests, budget). `SuggestOptions = { max?, exhaust? }` — 6b's `prune` / `skip` test switches go: the oracle replaces the fast-vs-slow test.
  - **Bad `mustInclude`** (me, or not a team): `suggestDeals` throws `TradeError('INVALID_TRADE', 'Must include another team in this league')` before anything else; the worker posts it as an `error` update ("Search failed: …"). The UI never offers it.
  - **Labels.** Alternatives: `via <team>: <names> · <team>: <names>` (the bridge teams in cycle order, each hop's full names sorted, comma-joined) — the app shows full names everywhere, so not spec §3.5's "J. Cook". The path line uses 6b's `sideNames` (position + full name).
  - **Types.** `SuggestUpdate` is what the worker posts (no run id); `SuggestEvent = SuggestUpdate & { runId: number }`. `SuggestSnapshot.message` is `string | null` (spec: `message?`). `SuggestProgress` carries `elapsedMs`; the generator's `SearchProgress` does not (the worker stamps it).
  - **Re-attach ordering.** Events carry no card index. The renderer applies events only for the run it follows, and follows a run only once `suggestSnapshot()` or its own `suggestStart()` has answered; Electron delivers main → renderer messages (invoke replies and `webContents.send`) in order on one channel, so nothing is applied twice or lost.
  - **Progress ticks.** The bridge DFS yields after each first bridge team, so a long k ≥ 4 search still reports progress.
  - **App quit:** worker threads end with the process; no extra hook.
  - **Builder shortcut.** _Suggest with this team_ (2-team deal) sets **Must include** to that team and starts a run with the current **Up to**. An alternative's _Open in builder_ loads its proposal and evaluates it (an alternative carries no evaluation).
  - **Status line.** A start still waiting for its run id shows zero progress ("Searching 2-team deals · 0 of 0 ideas checked · 0 found · 0:00"); `complete` with 0 cards shows 6b's empty-state hint.
  - **Plan Q carry-overs** (Task 9): verdict columns follow the builder's card order; a stale evaluate answer is dropped; a screen test with a reordered open-spot answer; `SELECT_CLASS` / `TONE_CLASS` shared from `tradeView.ts`. Dropped: a per-run ownership map in `resolveDeal` — the search evaluates only the cards it emits (≤ 30), so `resolveDeal` is not on a hot path.
  - **Negative values** (added after Task 4's review, user decision 2026-10-02): the lineup solver fills every slot it can and weekly values can be negative (points already scored), so "more players never total less" fails when a negative player is forced into a slot. Every monotonicity prune carries a slack — `SearchContext.slack(rosterId, extra)`, the window's negative values on that roster plus `extra` — U(z) is widened by it (plus a cent for rounding), and the Plan M pair bound and both bridge prunes apply only when it is zero. `negativeSearchLeague(seed)` (teams 1 and 3 at −2 in the current week) joins every property test.
  - **Gate outcome** (2026-10-02, user decision): Task 6 failed the gate (see Status). The user chose all three measured exact remedies — Tasks 13 (refuse before solving), 14 (bound for received pairs) and 15 (greedy lineup solver), then Task 16 (measure again) — and kept the **Up to 3 teams** default. **Execution order: 0–6, 13–16, then 7–12.**
  - **Measurement gate** (Task 6): on the user's league, **Up to 3 teams, any team**, practical means time to first card ≤ 5 s **and** final list ≤ 60 s. Beyond either, work stops and the numbers go to the user.
  - **Stale lists** (added after Task 11's review, user decision 2026-10-03; spec §4.2 amended): `invalidateCaches()` marks the active **or last** run `stale` — a finished run too (`done: stale` with its last progress) — and _Open in builder_ on a stale card loads `pruneDeal(dealOf(card.evaluation), pool)` and evaluates it instead of showing the carried verdict. Commits `5fc1ed3`, `ee04533`.

---

### Task 0: Branch

**Files:** none.

- [ ] **Step 1: Create the branch from an up-to-date main**

```bash
git checkout main && git status --short && git checkout -b feat/multi-team-search
```

Expected: clean tree, on `feat/multi-team-search`.

---

### Task 1: Search types and shared definitions

The query and suggestion types take their final shape; the thresholds and `entersLineup` move to where the new modules can share them. The existing 2-team search keeps working on the new types.

**Files:**

- Modify: `src/shared/types.ts` (`TradeSuggestQuery`, `TradeSuggestion`, new `TradeAlternative`)
- Create: `src/main/trade/thresholds.ts`
- Modify: `src/main/trade/enter.ts` (add `entersLineup`)
- Modify: `src/main/trade/suggest.ts`
- Modify: `src/renderer/src/screens/TradeScreen.tsx` (the `find` call)
- Modify: `tests/fixtures/trade.ts`, `tests/main/trade/suggest.test.ts`, `tests/main/trade/suggestBudget.test.ts`, `tests/main/engine/jobs.test.ts`, `tests/renderer/components/TradeScreen.test.tsx`
- Test: `tests/main/trade/enter.test.ts`

**Interfaces:**

- Produces:
  - `TradeSuggestQuery { season: number; focus: TradeFocus; stance: TradeStance; maxTeams: number; mustInclude: number | null }` (replaces `partnerRosterId`).
  - `TradeAlternative { proposal: TradeProposal; label: string; worstDeltaPerWeek: number }`.
  - `TradeSuggestion { evaluation: TradeEvaluation; teams: number; acceptance: (TradeAcceptance | null)[]; alternatives: TradeAlternative[] }`.
  - `src/main/trade/thresholds.ts`: `STANCES`, `ACCEPT_LOSS_PER_WEEK`, `DOMINANCE_PTS`, `SUGGEST_MAX`, `stanceDelta(stance, deltaPerWeek): boolean`, `passesStance(stance, deltaPerWeek, ratio): boolean`, `acceptanceOf(theirDelta, theirRatio, theirDeltaPerWeek): TradeAcceptance | null` — moved verbatim from `suggest.ts`, which re-exports them.
  - `src/main/trade/enter.ts`: `entersLineup(build: LineupBuild, s: PlayerSeries, weeks: number[], teamWeeks: TeamWeek[]): boolean` — moved from `suggest.ts`.

- [ ] **Step 1: Write the failing test for `entersLineup`**

Append to `tests/main/trade/enter.test.ts` (add the imports at the top, merging with what is there):

```ts
import { teamWeek, windowWeeks } from '@main/lineup/build'
import { entersLineup } from '@main/trade/enter'
import type { PlayerSeries } from '@main/value/series'
import { SMALL_LEAGUE, syntheticBuild } from '../../fixtures/synthetic'

describe('entersLineup (spec 6b §3.2)', () => {
  it('lists who could raise my lineup in some window week', () => {
    const { build } = syntheticBuild(SMALL_LEAGUE)
    const weeks = windowWeeks(build)
    const mine = weeks.map((w) => teamWeek(build, 1, w))
    const series = (id: string): PlayerSeries =>
      [...build.rosters.values()].flat().find((s) => s.base.playerId === id) as PlayerSeries
    // Me: RB A20 · WR B8 · FLEX C18 — F, E (Rival) and I (Other) beat a starter they can reach.
    expect(
      ['E', 'F', 'G', 'H', 'I', 'J', 'K', 'L'].filter((id) =>
        entersLineup(build, series(id), weeks, mine)
      )
    ).toEqual(['E', 'F', 'I'])
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run tests/main/trade/enter.test.ts`
Expected: FAIL — `entersLineup` is not exported from `@main/trade/enter`.

- [ ] **Step 3: Move `entersLineup` into `enter.ts`**

In `src/main/trade/enter.ts`, change the first import and append the function (cut it from `suggest.ts`):

```ts
import { candidateFor, type LineupBuild, type TeamWeek } from '@main/lineup/build'
import type { Candidate, LineupSlot, Placed } from '@main/lineup/optimal'
import type { PlayerSeries } from '@main/value/series'
```

```ts
/** Spec 6b §3.2: whether `s` could raise that team's optimal lineup in at least one window week. */
export function entersLineup(
  build: LineupBuild,
  s: PlayerSeries,
  weeks: number[],
  teamWeeks: TeamWeek[]
): boolean {
  return weeks.some((w, i) => {
    const c = candidateFor(build, s, w)
    return c !== null && canEnter(c, build.slots, teamWeeks[i].optimal)
  })
}
```

- [ ] **Step 4: Create `src/main/trade/thresholds.ts`**

Move these from `src/main/trade/suggest.ts` verbatim (doc comments included): `STANCES`, `ACCEPT_LOSS_PER_WEEK`, `DOMINANCE_PTS`, `SUGGEST_MAX`, `stanceDelta`, `passesStance`, `acceptanceOf`. The file starts with:

```ts
import type { TradeAcceptance, TradeStance } from '@shared/types'
import { MARKET_FAIR } from './evaluate'
```

- [ ] **Step 5: Point `suggest.ts` at the moved code and the new types**

In `src/main/trade/suggest.ts`:

1. Delete the moved definitions and the local `entersLineup`; import and re-export instead:

```ts
import { entersLineup } from './enter'
import {
  ACCEPT_LOSS_PER_WEEK,
  acceptanceOf,
  DOMINANCE_PTS,
  passesStance,
  STANCES,
  stanceDelta,
  SUGGEST_MAX
} from './thresholds'

export {
  ACCEPT_LOSS_PER_WEEK,
  acceptanceOf,
  DOMINANCE_PTS,
  passesStance,
  STANCES,
  stanceDelta,
  SUGGEST_MAX
}
```

Drop the now-unused imports (`canEnter`, `candidateFor`, `TeamWeek`, `TradeAcceptance`, `TradeStance` where no longer referenced — let `npm run lint` tell you).

2. In `consider`, the suggestion becomes `{ evaluation, teams: 2, acceptance: [null, acceptance], alternatives: [] }`.
3. In `suggestTrades`, the partner filter reads `query.mustInclude` instead of `query.partnerRosterId` (this 2-team search ignores `maxTeams`; it is replaced in Task 5).

- [ ] **Step 6: Change the shared types**

In `src/shared/types.ts`, replace `TradeSuggestQuery` and `TradeSuggestion`:

```ts
export interface TradeSuggestQuery {
  season: number
  focus: TradeFocus
  stance: TradeStance
  /** Multi-team spec §3.1: deals of 2 up to this many teams; clamped to 2..number of teams. */
  maxTeams: number
  /** The deal must involve this team; null = any. */
  mustInclude: number | null
}
```

```ts
/** Multi-team spec §3.5: another working deal for the same my side, at the same size. */
export interface TradeAlternative {
  proposal: TradeProposal
  /** "via Gridiron Gang: James Cook" — the bridge teams and what each sends. */
  label: string
  /** The least happy other team's Δ/week. */
  worstDeltaPerWeek: number
}

export interface TradeSuggestion {
  /** Exactly what `trade:evaluate` returns for this proposal — the card and the builder agree. */
  evaluation: TradeEvaluation
  /** Number of teams in the deal, 2..maxTeams. */
  teams: number
  /** Aligned with `evaluation.sides`: null for me, why each other manager would take it. */
  acceptance: (TradeAcceptance | null)[]
  /** The other working deals of this size for the same my side, best first. */
  alternatives: TradeAlternative[]
}
```

- [ ] **Step 7: Follow the type change through callers and tests**

- `src/renderer/src/screens/TradeScreen.tsx`, in `find`: `api.trade.suggest({ season, focus, stance, maxTeams: 2, mustInclude: partnerRosterId })`.
- `tests/fixtures/trade.ts`, `tradeSuggestion()`: add `teams: 2,` before `acceptance` and `alternatives: [],` after it.
- `tests/main/trade/suggest.test.ts`: the `query` helper becomes `{ season: SEASON, focus: null, stance: 'fair', maxTeams: 2, mustInclude: null, ...over }`; every `partnerRosterId: N` becomes `mustInclude: N`.
- `tests/main/trade/suggestBudget.test.ts`: the `query` helper's `partnerRosterId: null` becomes `maxTeams: 2, mustInclude: null`; `partnerRosterId: 3` becomes `mustInclude: 3`.
- `tests/main/engine/jobs.test.ts`, "still answers trade suggestions": the query becomes `{ season: SEASON, focus: null, stance: 'fair' as const, maxTeams: 2, mustInclude: null }`.
- `tests/renderer/components/TradeScreen.test.tsx`: the three `suggestMock` expectations replace `partnerRosterId: X` with `maxTeams: 2, mustInclude: X`.

- [ ] **Step 8: Verify**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all green, the new `entersLineup` test included; every existing suggestion expectation unchanged.

- [ ] **Step 9: Commit**

```bash
npx prettier --write src/shared/types.ts src/main/trade/thresholds.ts src/main/trade/enter.ts src/main/trade/suggest.ts src/renderer/src/screens/TradeScreen.tsx tests/fixtures/trade.ts tests/main/trade/enter.test.ts tests/main/trade/suggest.test.ts tests/main/trade/suggestBudget.test.ts tests/main/engine/jobs.test.ts tests/renderer/components/TradeScreen.test.tsx
git add -A src tests
git commit -m "refactor(trade): reshape types for N-team search"
```

---

### Task 2: The brute-force oracle

The reference every later task is checked against (spec §7). It must be obviously correct: whole-deal evaluations, no memo, no week skip, no prunes. It is validated here against the existing 2-team search and a hand-computed 3-team fixture.

**Files:**

- Modify: `tests/fixtures/synthetic.ts` (add `TRIANGLE_LEAGUE`, `searchLeague`)
- Create: `tests/main/trade/suggestOracle.ts`
- Test: `tests/main/trade/suggestOracle.test.ts`

**Interfaces:**

- Consumes: `entersLineup` (`enter.ts`), `acceptanceOf`, `passesStance`, `DOMINANCE_PTS`, `SUGGEST_MAX` (`thresholds.ts`), `evaluateTrade`, `marketRatio` (`evaluate.ts`), `teamName`, `teamWeek`, `windowWeeks` (`@main/lineup/build`).
- Produces (test code, used by Tasks 3 and 5):
  - `type EvalCache = Map<string, TradeEvaluation>`
  - `interface Cycle { teams: Team[]; hops: PlayerSeries[][] }` — `teams` = T₁ … C; `hops[0]` = x … `hops[k−1]` = z.
  - `cycleKey(cycle: Cycle): string` — `"3>2|a2>c2>b2"` (team ids `>`-joined, then each hop's sorted ids `+`-joined, hops `>`-joined).
  - `cycleProposal(me: number, cycle: Cycle): TradeProposal` — moves hop by hop; hop i goes to `teams[i]`, the last hop to me.
  - `oracleDeals(build, side: { x: PlayerSeries[]; z: PlayerSeries[]; c: Team }, k: number, mustInclude: number | null, cache?: EvalCache): string[]` — sorted `cycleKey`s of every working deal of exactly k teams.
  - `oracleSuggest(build, query: TradeSuggestQuery, opts?: { max?: number; cache?: EvalCache }): TradeSuggestion[]`.
  - Fixtures: `TRIANGLE_LEAGUE: SyntheticLeague`; `searchLeague(seed: number): SyntheticLeague` (4 teams × 4 players, window weeks 3–5, roster size 4).

- [ ] **Step 1: Add the fixtures**

In `tests/fixtures/synthetic.ts`, after `CYCLE_LEAGUE`:

```ts
/**
 * Multi-team spec §3: a deal only three teams can make. Slots RB · WR · TE (+1 bench), roster
 * size 4, window weeks 16–17. Optimal per week: Me 35 (a1 · a3 · a4), Two 42 (b4 · b1 · b3),
 * Three 43 (c3 · c4 · c1).
 *
 * | Me (1)        | Two (2)       | Three (3)     |
 * | ------------- | ------------- | ------------- |
 * | a1 RB 20 4000 | b1 WR 20 4000 | c1 TE 20 4000 |
 * | a2 RB 15 1000 | b2 WR 15 3000 | c2 TE 14 1000 |
 * | a3 WR 5 300   | b3 TE 4 200   | c3 RB 5 300   |
 * | a4 TE 10 1500 | b4 RB 18 3500 | c4 WR 18 3000 |
 *
 * a2 for b2 fails with Two: a2 can't start behind b4, and 1 000 for 3 000 is not market-fair.
 * Through Three it works — a2 → Three, c2 → Two, b2 → me, everyone +10 a week. Three could also
 * send c1 (Three +4, Two +16), c2 + c3 (+10 / +10, Two drops b3) or c1 + c3 (+4 / +16, Two drops b3).
 */
export const TRIANGLE_LEAGUE: SyntheticLeague = {
  currentWeek: 16,
  weeks: [16, 17],
  rosterPositions: ['RB', 'WR', 'TE', 'BN'],
  rules: CYCLE_LEAGUE.rules,
  teams: [
    {
      rosterId: 1,
      name: 'Me',
      isMe: true,
      players: [
        { id: 'a1', position: 'RB', weekly: 20, market: 4000 },
        { id: 'a2', position: 'RB', weekly: 15, market: 1000 },
        { id: 'a3', position: 'WR', weekly: 5, market: 300 },
        { id: 'a4', position: 'TE', weekly: 10, market: 1500 }
      ]
    },
    {
      rosterId: 2,
      name: 'Two',
      players: [
        { id: 'b1', position: 'WR', weekly: 20, market: 4000 },
        { id: 'b2', position: 'WR', weekly: 15, market: 3000 },
        { id: 'b3', position: 'TE', weekly: 4, market: 200 },
        { id: 'b4', position: 'RB', weekly: 18, market: 3500 }
      ]
    },
    {
      rosterId: 3,
      name: 'Three',
      players: [
        { id: 'c1', position: 'TE', weekly: 20, market: 4000 },
        { id: 'c2', position: 'TE', weekly: 14, market: 1000 },
        { id: 'c3', position: 'RB', weekly: 5, market: 300 },
        { id: 'c4', position: 'WR', weekly: 18, market: 3000 }
      ]
    }
  ]
}
```

At the end of the file:

```ts
/**
 * Multi-team spec §7 property-test league: `generateLeague(seed, 4)` cut to 2 RB + 2 WR per team,
 * slots RB · WR · FLEX (+1 bench) so every 2-for-1 forces a drop, window weeks 3–5. Small enough
 * for the brute force to enumerate every 4-team cycle.
 */
export function searchLeague(seed: number): SyntheticLeague {
  const g = generateLeague(seed, 4)
  return {
    ...g,
    weeks: g.weeks.slice(0, 3),
    rosterPositions: ['RB', 'WR', 'FLEX', 'BN'],
    rules: rules({
      rosterSlots: [
        { slot: 'RB', count: 1 },
        { slot: 'WR', count: 1 },
        { slot: 'FLEX', count: 1 },
        { slot: 'BN', count: 1 }
      ],
      settings: { numTeams: 4, waiverType: 'faab', playoffStartWeek: 4, playoffTeams: 4 }
    }),
    teams: g.teams.map((t) => ({
      ...t,
      players: [t.players[2], t.players[3], t.players[7], t.players[8]].map((p) => ({
        ...p,
        weekly: Array.isArray(p.weekly) ? p.weekly.slice(0, 3) : p.weekly
      }))
    }))
  }
}
```

(`SHAPE` puts RBs at indexes 2–6 and WRs at 7–11, so these are each team's first two RBs and first two WRs.)

- [ ] **Step 2: Write the oracle**

Create `tests/main/trade/suggestOracle.ts`:

```ts
import { teamName, teamWeek, windowWeeks, type LineupBuild } from '@main/lineup/build'
import { entersLineup } from '@main/trade/enter'
import { evaluateTrade, marketRatio } from '@main/trade/evaluate'
import { acceptanceOf, DOMINANCE_PTS, passesStance, SUGGEST_MAX } from '@main/trade/thresholds'
import type { PlayerSeries } from '@main/value/series'
import type {
  Team,
  TradeEvaluation,
  TradeProposal,
  TradeSideResult,
  TradeSuggestion,
  TradeSuggestQuery
} from '@shared/types'

/**
 * Multi-team spec §7 — the reference the search must equal. Enumerates every cycle me → T1 → … →
 * C → me of 2..maxTeams teams in the §3.1 shapes and evaluates each deal whole with
 * `evaluateTrade(…, { skip: false })`: no side memo, no week skip, no prunes, no bound, no early
 * stop. Then §3.3–§3.4 as written: the smallest working size per my side, the representative and
 * its alternatives, dominance, the rank order, the cap. `cache` keeps whole-deal evaluations across
 * calls on one build — an evaluation depends on nothing but the build and the proposal.
 */

type Hop = PlayerSeries[]
export type EvalCache = Map<string, TradeEvaluation>

/** T1 … C, and hops[0] = what I give … hops[k − 1] = what I get. */
export interface Cycle {
  teams: Team[]
  hops: Hop[]
}
interface Working extends Cycle {
  evaluation: TradeEvaluation
}
interface Smallest {
  k: number
  deals: Working[]
}

const text = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)
const desc = (a: number, b: number): number => (a === b ? 0 : a > b ? -1 : 1)
const ids = (hop: Hop): string =>
  hop
    .map((s) => s.base.playerId)
    .sort()
    .join('+')
const playerIds = (list: { playerId: string }[]): string =>
  list
    .map((p) => p.playerId)
    .sort()
    .join('+')

/** Every 1- and 2-element subset: singles in list order, then pairs. */
function subsets<T>(list: T[]): T[][] {
  const out: T[][] = list.map((x) => [x])
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) out.push([list[i], list[j]])
  }
  return out
}

/** Ordered selections of n distinct items. */
function arrangements<T>(list: T[], n: number): T[][] {
  if (n === 0) return [[]]
  return list.flatMap((first, i) =>
    arrangements([...list.slice(0, i), ...list.slice(i + 1)], n - 1).map((rest) => [first, ...rest])
  )
}

/** One hop per bridge team; at most one of two players, none when x or z is already a pair. */
function hopChoices(build: LineupBuild, teams: Team[], pairFree: boolean): Hop[][] {
  let partial: { hops: Hop[]; pairUsed: boolean }[] = [{ hops: [], pairUsed: !pairFree }]
  for (const t of teams) {
    const options = subsets(build.rosters.get(t.rosterId) ?? [])
    partial = partial.flatMap((p) =>
      options
        .filter((hop) => hop.length === 1 || !p.pairUsed)
        .map((hop) => ({ hops: [...p.hops, hop], pairUsed: p.pairUsed || hop.length === 2 }))
    )
  }
  return partial.map((p) => p.hops)
}

export function cycleProposal(me: number, cycle: Cycle): TradeProposal {
  const last = cycle.hops.length - 1
  return {
    moves: cycle.hops.flatMap((hop, i) =>
      hop.map((s) => ({ playerId: s.base.playerId, to: i === last ? me : cycle.teams[i].rosterId }))
    )
  }
}

export function cycleKey(cycle: Cycle): string {
  return `${cycle.teams.map((t) => t.rosterId).join('>')}|${cycle.hops.map(ids).join('>')}`
}

function meOf(build: LineupBuild): Team {
  const me = build.inputs.teams.find((t) => t.isMe)
  if (!me) throw new Error('oracle: the league has no "me"')
  return me
}

function evaluator(build: LineupBuild, cache: EvalCache): (cycle: Cycle) => TradeEvaluation {
  const me = meOf(build).rosterId
  return (cycle) => {
    const proposal = cycleProposal(me, cycle)
    const key = JSON.stringify(proposal)
    const hit = cache.get(key)
    if (hit) return hit
    const evaluation = evaluateTrade(build, proposal, { skip: false })
    cache.set(key, evaluation)
    return evaluation
  }
}

/** Every cycle of exactly k teams around one my side, working or not. */
function cycles(build: LineupBuild, x: Hop, z: Hop, c: Team, k: number): Cycle[] {
  const bridge = build.inputs.teams.filter((t) => !t.isMe && t.rosterId !== c.rosterId)
  const pairFree = x.length === 1 && z.length === 1
  return arrangements(bridge, k - 2).flatMap((order) =>
    hopChoices(build, order, pairFree).map((middle) => ({
      teams: [...order, c],
      hops: [x, ...middle, z]
    }))
  )
}

/** Spec §3.3: every other team accepts (6b's rule), and the must-include team is in the deal. */
function works(evaluation: TradeEvaluation, cycle: Cycle, mustInclude: number | null): boolean {
  return (
    (mustInclude === null || cycle.teams.some((t) => t.rosterId === mustInclude)) &&
    evaluation.sides
      .slice(1)
      .every((s) => acceptanceOf(s.delta, marketRatio(s), s.deltaPerWeek) !== null)
  )
}

/** Brute force of spec §3.3 for one my side: the keys of every working deal of exactly k teams. */
export function oracleDeals(
  build: LineupBuild,
  side: { x: Hop; z: Hop; c: Team },
  k: number,
  mustInclude: number | null,
  cache: EvalCache = new Map()
): string[] {
  const evaluate = evaluator(build, cache)
  return cycles(build, side.x, side.z, side.c, k)
    .filter((cycle) => works(evaluate(cycle), cycle, mustInclude))
    .map(cycleKey)
    .sort()
}

export function oracleSuggest(
  build: LineupBuild,
  query: TradeSuggestQuery,
  opts: { max?: number; cache?: EvalCache } = {}
): TradeSuggestion[] {
  const me = meOf(build)
  const others = build.inputs.teams.filter((t) => !t.isMe)
  const kMax = Math.min(Math.max(query.maxTeams, 2), others.length + 1)
  const evaluate = evaluator(build, opts.cache ?? new Map())
  const weeks = windowWeeks(build)
  const myRoster = build.rosters.get(me.rosterId) ?? []
  const focusGive = query.focus !== null && 'give' in query.focus ? query.focus.give : null
  const want = query.focus !== null && 'want' in query.focus ? query.focus.want : null
  if (focusGive !== null && !myRoster.some((s) => s.base.playerId === focusGive)) return []
  const myWeeks = weeks.map((w) => teamWeek(build, me.rosterId, w))

  /** A my side that passes the stance (spec §3.2). */
  interface Candidate {
    x: Hop
    z: Hop
    c: Team
    key: string
    mine: TradeSideResult
  }
  const keyOf = (x: Hop, z: Hop, c: Team): string => `${ids(x)}|${ids(z)}|${c.rosterId}`
  const passing = new Map<string, Candidate>()
  for (const c of others) {
    if (kMax === 2 && query.mustInclude !== null && c.rosterId !== query.mustInclude) continue
    const pool = (build.rosters.get(c.rosterId) ?? []).filter((s) =>
      entersLineup(build, s, weeks, myWeeks)
    )
    for (const z of subsets(pool)) {
      if (want !== null && !z.some((s) => s.base.position === want)) continue
      for (const x of subsets(myRoster)) {
        if (focusGive !== null && !x.some((s) => s.base.playerId === focusGive)) continue
        if (x.length === 2 && z.length === 2) continue
        // My side depends only on what I give and get: read it off the 2-team deal.
        const mine = evaluate({ teams: [c], hops: [x, z] }).sides[0]
        if (!passesStance(query.stance, mine.deltaPerWeek, marketRatio(mine))) continue
        const key = keyOf(x, z, c)
        passing.set(key, { x, z, c, key, mine })
      }
    }
  }

  const smallest = new Map<string, Smallest | null>()
  const smallestOf = (cand: Candidate): Smallest | null => {
    const known = smallest.get(cand.key)
    if (known !== undefined) return known
    let found: Smallest | null = null
    for (let k = 2; k <= kMax && found === null; k++) {
      const deals = cycles(build, cand.x, cand.z, cand.c, k).flatMap((cycle): Working[] => {
        const evaluation = evaluate(cycle)
        return works(evaluation, cycle, query.mustInclude) ? [{ ...cycle, evaluation }] : []
      })
      if (deals.length > 0) found = { k, deals }
    }
    smallest.set(cand.key, found)
    return found
  }

  /** Spec §3.4: a contained single my side that works with no more teams and is nearly as good. */
  const dominated = (cand: Candidate, k: number): boolean => {
    const contained = [
      ...(cand.x.length === 2 ? cand.x.map((s) => keyOf([s], cand.z, cand.c)) : []),
      ...(cand.z.length === 2 ? cand.z.map((s) => keyOf(cand.x, [s], cand.c)) : [])
    ]
    return contained.some((key) => {
      const single = passing.get(key)
      if (!single) return false
      const hit = smallestOf(single)
      return hit !== null && hit.k <= k && cand.mine.delta - single.mine.delta <= DOMINANCE_PTS
    })
  }

  const worst = (d: Working): number =>
    Math.min(...d.evaluation.sides.slice(1).map((s) => s.deltaPerWeek))
  const moved = (d: Working): number => d.hops.reduce((n, hop) => n + hop.length, 0)
  const dealOrder = (a: Working, b: Working): number => {
    const byWorst = desc(worst(a), worst(b))
    if (byWorst !== 0) return byWorst
    const byMoved = moved(a) - moved(b)
    if (byMoved !== 0) return byMoved
    for (let i = 0; i < a.teams.length; i++) {
      const byName = teamName(a.teams[i]).localeCompare(teamName(b.teams[i]))
      if (byName !== 0) return byName
    }
    return text(a.hops.map(ids).join('>'), b.hops.map(ids).join('>'))
  }
  const label = (d: Working): string =>
    `via ${d.teams
      .slice(0, -1)
      .map(
        (t, i) =>
          `${teamName(t)}: ${d.hops[i + 1]
            .map((s) => s.base.fullName)
            .sort((p, q) => p.localeCompare(q))
            .join(', ')}`
      )
      .join(' · ')}`

  const cards: TradeSuggestion[] = []
  for (const cand of passing.values()) {
    const hit = smallestOf(cand)
    if (hit === null || dominated(cand, hit.k)) continue
    const [best, ...rest] = [...hit.deals].sort(dealOrder)
    cards.push({
      evaluation: best.evaluation,
      teams: hit.k,
      acceptance: best.evaluation.sides.map((s) =>
        s.isMe ? null : acceptanceOf(s.delta, marketRatio(s), s.deltaPerWeek)
      ),
      alternatives: rest.map((d) => ({
        proposal: cycleProposal(me.rosterId, d),
        label: label(d),
        worstDeltaPerWeek: worst(d)
      }))
    })
  }
  const mine = (s: TradeSuggestion): TradeSideResult => s.evaluation.sides[0]
  const from = (s: TradeSuggestion): string =>
    s.evaluation.sides[s.evaluation.sides.length - 1].name
  cards.sort(
    (a, b) =>
      desc(mine(a).delta, mine(b).delta) ||
      desc(marketRatio(mine(a)), marketRatio(mine(b))) ||
      from(a).localeCompare(from(b)) ||
      text(playerIds(mine(a).give), playerIds(mine(b).give)) ||
      text(playerIds(mine(a).get), playerIds(mine(b).get))
  )
  return cards.slice(0, opts.max ?? SUGGEST_MAX)
}
```

- [ ] **Step 3: Write the oracle's own tests**

Create `tests/main/trade/suggestOracle.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { windowWeeks } from '@main/lineup/build'
import { suggestTrades } from '@main/trade/suggest'
import type { TradeFocus, TradeSuggestion, TradeSuggestQuery } from '@shared/types'
import { SEASON } from '../../fixtures/season'
import {
  SMALL_LEAGUE,
  searchLeague,
  syntheticBuild,
  TRIANGLE_LEAGUE
} from '../../fixtures/synthetic'
import { oracleSuggest } from './suggestOracle'

const query = (over: Partial<TradeSuggestQuery> = {}): TradeSuggestQuery => ({
  season: SEASON,
  focus: null,
  stance: 'fair',
  maxTeams: 2,
  mustInclude: null,
  ...over
})
/** "a2→b2@2": my give ids, my get ids, the team I get from. */
const shape = (s: TradeSuggestion): string => {
  const ids = (list: { playerId: string }[]): string =>
    list
      .map((p) => p.playerId)
      .sort()
      .join('+')
  const sides = s.evaluation.sides
  return `${ids(sides[0].give)}→${ids(sides[0].get)}@${sides[sides.length - 1].rosterId}`
}
const byShape = (list: TradeSuggestion[]): TradeSuggestion[] =>
  [...list].sort((a, b) => (shape(a) < shape(b) ? -1 : shape(a) > shape(b) ? 1 : 0))

describe('the oracle at two teams is 6b’s search', () => {
  it('matches suggestTrades on the small league', () => {
    const { build } = syntheticBuild(SMALL_LEAGUE)
    const focuses: TradeFocus[] = [null, { give: 'C' }, { give: 'D' }, { want: 'WR' }]
    for (const stance of ['premium', 'fair', 'overpay'] as const) {
      for (const focus of focuses) {
        for (const mustInclude of [null, 2, 3]) {
          const q = query({ stance, focus, mustInclude })
          expect({ q, out: oracleSuggest(build, q) }).toEqual({ q, out: suggestTrades(build, q) })
        }
      }
    }
  })

  it('matches suggestTrades on random leagues (ties ordered apart)', () => {
    for (const seed of [1, 2, 3]) {
      const { build } = syntheticBuild(searchLeague(seed))
      expect(windowWeeks(build)).toEqual([3, 4, 5])
      for (const stance of ['premium', 'fair', 'overpay'] as const) {
        const q = query({ stance })
        expect({ seed, stance, out: byShape(oracleSuggest(build, q, { max: 1000 })) }).toEqual({
          seed,
          stance,
          out: byShape(suggestTrades(build, q, { max: 1000 }))
        })
      }
    }
  })
})

describe('the oracle beyond two teams', () => {
  const { build } = syntheticBuild(TRIANGLE_LEAGUE)
  const a2b2 = (list: TradeSuggestion[]): TradeSuggestion | undefined =>
    list.find((s) => shape(s) === 'a2→b2@2')

  it('reaches a2 for b2 through Three, with the other ways in order', () => {
    const card = a2b2(oracleSuggest(build, query({ maxTeams: 3 })))
    expect(card?.teams).toBe(3)
    expect(card?.evaluation.sides.map((s) => [s.name, s.deltaPerWeek])).toEqual([
      ['Me', 10],
      ['Three', 10],
      ['Two', 10]
    ])
    expect(card?.acceptance).toEqual([null, 'both', 'lineup'])
    expect(card?.alternatives.map((a) => [a.label, a.worstDeltaPerWeek])).toEqual([
      ['via Three: c2, c3', 10],
      ['via Three: c1', 4],
      ['via Three: c1, c3', 4]
    ])
  })

  it('does not offer it at two teams', () => {
    expect(a2b2(oracleSuggest(build, query({ maxTeams: 2 })))).toBeUndefined()
  })
})
```

If `windowWeeks(build)` on `searchLeague` is not `[3, 4, 5]`, adjust `playoffStartWeek` / `playoffTeams` in `searchLeague` until it is (the existing "prunes are exact" helper in `suggest.test.ts` gets `[3, 4, 5]` from these settings with 3 teams).

- [ ] **Step 4: Run the oracle tests**

Run: `npx vitest run tests/main/trade/suggestOracle.test.ts`
Expected: PASS. The oracle and the 6b search are independent implementations of the same rules at two teams; a mismatch is a bug in one of them — debug it (superpowers:systematic-debugging) before going on, do not loosen the comparison. (One known shape of a false alarm: a difference only in `thisWeekSwaps` by a 0.00-point swap means the lineup solver broke a value tie differently with and without the week skip — report it rather than patching around it; 6b's fast-vs-slow test never hit one.)

- [ ] **Step 5: Verify and commit**

```bash
npm run typecheck && npm run lint && npm test
npx prettier --write tests/fixtures/synthetic.ts tests/main/trade/suggestOracle.ts tests/main/trade/suggestOracle.test.ts
git add tests/fixtures/synthetic.ts tests/main/trade/suggestOracle.ts tests/main/trade/suggestOracle.test.ts
git commit -m "test(trade): add N-team brute-force oracle"
```

---

### Task 3: Search context and the bridge search

Everything one run shares, and — for one my side — every working deal of exactly k teams (spec §3.3): k = 2 directly, k ≥ 3 by a depth-first search over ordered bridge teams, each team checked as soon as both its hops are fixed, with 6b's two exact prunes generalized to every team.

**Files:**

- Create: `src/main/trade/searchContext.ts`
- Create: `src/main/trade/bridge.ts`
- Test: `tests/main/trade/bridge.test.ts`

**Interfaces:**

- Consumes: `sideFor`, `sideKey`, `SideCore`, `SideMemo`, `StartsOf` (`side.ts`); `myTeam`, `requireWindow`, `rosterSize`, `MARKET_FAIR`, `marketRatio`, `marketSum` (`evaluate.ts`); `startsByRoster` (`player.ts`); `entersLineup` (`enter.ts`); `acceptanceOf` (`thresholds.ts`); `teamName`, `teamWeek` (`@main/lineup/build`).
- Produces:
  - `searchContext.ts`: `SearchContext { build; weeks; size; startsOf; memo; me; others; mustInclude; enters(rosterId, s): boolean; hopsOf(rosterId, pairs): PlayerSeries[][] }`; `searchContext(build: LineupBuild, mustInclude: number | null): SearchContext`; `MySide { x: PlayerSeries[]; z: PlayerSeries[]; c: Team; key: string }`; `subsets<T>(list: T[]): T[][]`; `idsKey(list: PlayerSeries[]): string`; `mySideKey(x, z, c: Team): string`; `desc(a: number, b: number): number`; `byText(a: string, b: string): number`; `sideOf(ctx, team: Team, give, get): SideCore`.
  - `bridge.ts`: `Accepted { core: SideCore; acceptance: TradeAcceptance }`; `Deal { teams: Team[]; hops: PlayerSeries[][]; accepted: Accepted[] }`; `accepts(ctx, team, give, get): Accepted | null`; `dealsAt(ctx, side: MySide, k: number): Generator<void, Deal[]>` (yields after each first bridge team); `dealProposal(me: Team, deal: Deal): TradeProposal`; `bridgeLabel(deal: Deal): string`.

- [ ] **Step 1: Write the failing tests**

Create `tests/main/trade/bridge.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { bridgeLabel, dealProposal, dealsAt, type Deal } from '@main/trade/bridge'
import {
  mySideKey,
  searchContext,
  subsets,
  type MySide,
  type SearchContext
} from '@main/trade/searchContext'
import type { PlayerSeries } from '@main/value/series'
import { searchLeague, syntheticBuild, TRIANGLE_LEAGUE } from '../../fixtures/synthetic'
import { cycleKey, oracleDeals, type EvalCache } from './suggestOracle'

function drain<T>(it: Generator<void, T>): T {
  let step = it.next()
  while (!step.done) step = it.next()
  return step.value
}

function sideOfIds(ctx: SearchContext, x: string[], z: string[], c: number): MySide {
  const find = (id: string): PlayerSeries => {
    for (const roster of ctx.build.rosters.values()) {
      const hit = roster.find((s) => s.base.playerId === id)
      if (hit) return hit
    }
    throw new Error(`no player ${id}`)
  }
  const team = ctx.others.find((t) => t.rosterId === c)
  if (!team) throw new Error(`no team ${c}`)
  const xs = x.map(find)
  const zs = z.map(find)
  return { x: xs, z: zs, c: team, key: mySideKey(xs, zs, team) }
}

const labels = (deals: Deal[]): string[] => deals.map(bridgeLabel).sort()

describe('dealsAt on the triangle league (spec §3.3)', () => {
  const { build } = syntheticBuild(TRIANGLE_LEAGUE)

  it('finds no 2-team deal and every bridge through Three', () => {
    const ctx = searchContext(build, null)
    const side = sideOfIds(ctx, ['a2'], ['b2'], 2)
    expect(drain(dealsAt(ctx, side, 2))).toEqual([])
    const deals = drain(dealsAt(ctx, side, 3))
    expect(labels(deals)).toEqual([
      'via Three: c1',
      'via Three: c1, c3',
      'via Three: c2',
      'via Three: c2, c3'
    ])
    const viaC2 = deals.find((d) => bridgeLabel(d) === 'via Three: c2')
    expect(viaC2?.teams.map((t) => t.rosterId)).toEqual([3, 2])
    expect(viaC2?.accepted.map((a) => [a.acceptance, a.core.deltaPerWeek])).toEqual([
      ['both', 10],
      ['lineup', 10]
    ])
    expect(viaC2 && dealProposal(ctx.me, viaC2)).toEqual({
      moves: [
        { playerId: 'a2', to: 3 },
        { playerId: 'c2', to: 2 },
        { playerId: 'b2', to: 1 }
      ]
    })
    const viaC1C3 = deals.find((d) => bridgeLabel(d) === 'via Three: c1, c3')
    expect(viaC1C3?.accepted[1].core.drops.map((p) => p.playerId)).toEqual(['b3'])
  })

  it('keeps the must-include team in the deal', () => {
    // a2 for c2 works straight with Three…
    const free = searchContext(build, null)
    expect(drain(dealsAt(free, sideOfIds(free, ['a2'], ['c2'], 3), 2))).toHaveLength(1)
    // …but not when Two must be part of it: k = 2 has no bridge to put Two in.
    const withTwo = searchContext(build, 2)
    expect(drain(dealsAt(withTwo, sideOfIds(withTwo, ['a2'], ['c2'], 3), 2))).toEqual([])
    // When the must-include team is C itself, nothing changes.
    expect(labels(drain(dealsAt(withTwo, sideOfIds(withTwo, ['a2'], ['b2'], 2), 3)))).toHaveLength(
      4
    )
  })

  it('yields once per first bridge team', () => {
    const ctx = searchContext(build, null)
    const it = dealsAt(ctx, sideOfIds(ctx, ['a2'], ['b2'], 2), 3)
    let ticks = 0
    for (let step = it.next(); !step.done; step = it.next()) ticks++
    expect(ticks).toBe(1) // Three is the only possible bridge team
  })
})

describe('dealsAt equals a brute force (prunes are exact)', () => {
  it('finds exactly the working deals of every size on random leagues', () => {
    for (const seed of [1, 2]) {
      const { build } = syntheticBuild(searchLeague(seed))
      const cache: EvalCache = new Map()
      for (const mustInclude of [null, 3]) {
        const ctx = searchContext(build, mustInclude)
        const mine = build.rosters.get(ctx.me.rosterId) ?? []
        const xs = subsets(mine).slice(0, mine.length + 2) // singles and the first two pairs
        for (const c of ctx.others) {
          const theirs = build.rosters.get(c.rosterId) ?? []
          const zs = subsets(theirs).slice(0, theirs.length + 1) // singles and the first pair
          for (const x of xs) {
            for (const z of zs) {
              if (x.length === 2 && z.length === 2) continue
              const side: MySide = { x, z, c, key: mySideKey(x, z, c) }
              for (const k of [2, 3, 4]) {
                const fast = drain(dealsAt(ctx, side, k))
                  .map(cycleKey)
                  .sort()
                const slow = oracleDeals(build, side, k, mustInclude, cache)
                expect({ seed, mustInclude, side: side.key, k, deals: fast }).toEqual({
                  seed,
                  mustInclude,
                  side: side.key,
                  k,
                  deals: slow
                })
              }
            }
          }
        }
      }
    }
  }, 120_000)
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/main/trade/bridge.test.ts`
Expected: FAIL — cannot resolve `@main/trade/bridge` / `@main/trade/searchContext`.

- [ ] **Step 3: Write `src/main/trade/searchContext.ts`**

```ts
import { teamWeek, type LineupBuild, type TeamWeek } from '@main/lineup/build'
import type { PlayerSeries } from '@main/value/series'
import type { Team } from '@shared/types'
import { entersLineup } from './enter'
import { myTeam, requireWindow, rosterSize } from './evaluate'
import { startsByRoster } from './player'
import { sideFor, type SideCore, type SideMemo, type StartsOf } from './side'

/** Multi-team spec §3: what one search run shares. */
export interface SearchContext {
  build: LineupBuild
  weeks: number[]
  /** Roster spots that count against the league's size; null when unknown (no drops). */
  size: number | null
  startsOf: StartsOf
  /** Spec §2.3: one side memo per run, so a card and the builder show identical numbers. */
  memo: SideMemo
  me: Team
  /** Every team but me, in league order. */
  others: Team[]
  /** Spec §3.1: the team every deal must involve; null = any. */
  mustInclude: number | null
  /** 6b's `entersLineup` against that team's current lineups, cached per team and player. */
  enters(rosterId: number, s: PlayerSeries): boolean
  /** What a team could send on one hop: singles in roster order, then pairs when `pairs` is set. */
  hopsOf(rosterId: number, pairs: boolean): PlayerSeries[][]
}

/** Spec §3.1: a my side — what I give (x), what I get (z) and the team z comes from (C). */
export interface MySide {
  x: PlayerSeries[]
  z: PlayerSeries[]
  c: Team
  /** `x ids|z ids|C` — the my side's identity. */
  key: string
}

/** Every 1- and 2-element subset: singles in list order, then pairs. */
export function subsets<T>(list: T[]): T[][] {
  const out: T[][] = list.map((x) => [x])
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) out.push([list[i], list[j]])
  }
  return out
}

/** Player ids sorted, `+`-joined. */
export function idsKey(list: PlayerSeries[]): string {
  return list
    .map((s) => s.base.playerId)
    .sort()
    .join('+')
}

export function mySideKey(x: PlayerSeries[], z: PlayerSeries[], c: Team): string {
  return `${idsKey(x)}|${idsKey(z)}|${c.rosterId}`
}

/** Descending comparator that is safe on ±∞ (no `b - a` NaN). */
export function desc(a: number, b: number): number {
  return a === b ? 0 : a > b ? -1 : 1
}

/** Code-point order: ids compare as written. */
export function byText(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/** A side's verdict through this run's memo. */
export function sideOf(
  ctx: SearchContext,
  team: Team,
  give: PlayerSeries[],
  get: PlayerSeries[]
): SideCore {
  return sideFor(ctx.build, { team, give, get }, ctx.weeks, ctx.size, ctx.startsOf, {}, ctx.memo)
}

export function searchContext(build: LineupBuild, mustInclude: number | null): SearchContext {
  const weeks = requireWindow(build)
  const me = myTeam(build)
  const lineups = new Map<number, TeamWeek[]>()
  const entered = new Map<string, boolean>()
  const hops = new Map<number, { singles: PlayerSeries[][]; all: PlayerSeries[][] }>()
  return {
    build,
    weeks,
    size: rosterSize(build),
    startsOf: startsByRoster(build, weeks),
    memo: new Map(),
    me,
    others: build.inputs.teams.filter((t) => t.rosterId !== me.rosterId),
    mustInclude,
    enters(rosterId: number, s: PlayerSeries): boolean {
      const key = `${rosterId}|${s.base.playerId}`
      const known = entered.get(key)
      if (known !== undefined) return known
      let lineup = lineups.get(rosterId)
      if (!lineup) {
        lineup = weeks.map((w) => teamWeek(build, rosterId, w))
        lineups.set(rosterId, lineup)
      }
      const enters = entersLineup(build, s, weeks, lineup)
      entered.set(key, enters)
      return enters
    },
    hopsOf(rosterId: number, pairs: boolean): PlayerSeries[][] {
      let known = hops.get(rosterId)
      if (!known) {
        const all = subsets(build.rosters.get(rosterId) ?? [])
        known = { singles: all.filter((h) => h.length === 1), all }
        hops.set(rosterId, known)
      }
      return pairs ? known.all : known.singles
    }
  }
}
```

- [ ] **Step 4: Write `src/main/trade/bridge.ts`**

```ts
import { teamName } from '@main/lineup/build'
import type { PlayerSeries } from '@main/value/series'
import type { Team, TradeAcceptance, TradeProposal } from '@shared/types'
import { MARKET_FAIR, marketRatio, marketSum } from './evaluate'
import { sideOf, type MySide, type SearchContext } from './searchContext'
import { sideKey, type SideCore } from './side'
import { acceptanceOf } from './thresholds'

/** A team that takes its part of a deal: its verdict and why (6b §3.3). */
export interface Accepted {
  core: SideCore
  acceptance: TradeAcceptance
}

/** Spec §3.1: a working cycle me → teams[0] → … → teams[k − 2] (= C) → me. */
export interface Deal {
  /** T1 … C, the teams after me in cycle order. */
  teams: Team[]
  /** hops[0] = x (me → T1), hops[i] = teams[i − 1] → teams[i], hops[k − 1] = z (C → me). */
  hops: PlayerSeries[][]
  /** Aligned with `teams`. */
  accepted: Accepted[]
}

/**
 * Spec §3.3: whether `team` takes `get` for `give` — 6b's acceptance on the memoized side, after
 * two exact prunes that skip the solve.
 */
export function accepts(
  ctx: SearchContext,
  team: Team,
  give: PlayerSeries[],
  get: PlayerSeries[]
): Accepted | null {
  const ratio = marketRatio({
    marketGive: marketSum(ctx.build, give).total,
    marketGet: marketSum(ctx.build, get).total
  })
  // Nothing it gets can start for it, so its delta cannot be positive — and the market can't
  // carry the deal either (6b's rule, now for every team).
  if (ratio < MARKET_FAIR && !get.some((s) => ctx.enters(team.rosterId, s))) return null
  if (give.length === 2) {
    for (const one of give) {
      // Plan M generalized: giving both can only do worse than giving one of them for the same
      // players — when that smaller deal needed no drops, its after-roster contains this one's,
      // and it gives less market value. If the smaller deal was refused, so is this one.
      const smaller = ctx.memo.get(sideKey(team.rosterId, [one], get))
      if (
        smaller &&
        smaller.drops.length === 0 &&
        acceptanceOf(smaller.delta, marketRatio(smaller), smaller.deltaPerWeek) === null
      ) {
        return null
      }
    }
  }
  const core = sideOf(ctx, team, give, get)
  const acceptance = acceptanceOf(core.delta, marketRatio(core), core.deltaPerWeek)
  return acceptance === null ? null : { core, acceptance }
}

/**
 * Spec §3.3: every working deal of exactly k teams around one my side. k = 2: C takes x and sends
 * z. k ≥ 3: a depth-first search over ordered distinct bridge teams and what each sends; a bridge
 * hop may carry two players only when x and z are singles and no other bridge hop does. Yields
 * after each first bridge team so a long search can report progress.
 */
export function* dealsAt(ctx: SearchContext, side: MySide, k: number): Generator<void, Deal[]> {
  const { x, z, c } = side
  // The must-include team, when it is not C, has to be one of the bridge teams.
  const must = ctx.mustInclude !== null && ctx.mustInclude !== c.rosterId ? ctx.mustInclude : null
  if (k === 2) {
    if (must !== null) return []
    const closing = accepts(ctx, c, z, x)
    return closing ? [{ teams: [c], hops: [x, z], accepted: [closing] }] : []
  }
  const slots = k - 2
  const bridgeTeams = ctx.others.filter((t) => t.rosterId !== c.rosterId)
  const out: Deal[] = []
  const teams: Team[] = []
  const hops: PlayerSeries[][] = [x]
  const accepted: Accepted[] = []
  /** Distinct teams; the last slot is the must-include team's final chance. */
  const allowed = (t: Team): boolean =>
    !teams.includes(t) &&
    (must === null ||
      teams.length + 1 < slots ||
      t.rosterId === must ||
      teams.some((u) => u.rosterId === must))
  const place = (t: Team, prev: PlayerSeries[], pairOk: boolean): void => {
    for (const hop of ctx.hopsOf(t.rosterId, pairOk)) {
      // Spec §3.3: a team is checked as soon as both its hops are fixed.
      const taken = accepts(ctx, t, hop, prev)
      if (!taken) continue
      teams.push(t)
      hops.push(hop)
      accepted.push(taken)
      if (teams.length === slots) {
        const closing = accepts(ctx, c, z, hop)
        if (closing) {
          out.push({ teams: [...teams, c], hops: [...hops, z], accepted: [...accepted, closing] })
        }
      } else {
        for (const next of bridgeTeams) {
          if (allowed(next)) place(next, hop, pairOk && hop.length === 1)
        }
      }
      teams.pop()
      hops.pop()
      accepted.pop()
    }
  }
  for (const first of bridgeTeams) {
    if (!allowed(first)) continue
    place(first, x, x.length === 1 && z.length === 1)
    yield
  }
  return out
}

/** The deal as moves, hop by hop: hop i goes to `teams[i]`, the last hop to me. */
export function dealProposal(me: Team, deal: Deal): TradeProposal {
  const last = deal.hops.length - 1
  return {
    moves: deal.hops.flatMap((hop, i) =>
      hop.map((s) => ({
        playerId: s.base.playerId,
        to: i === last ? me.rosterId : deal.teams[i].rosterId
      }))
    )
  }
}

/** "via Gridiron Gang: James Cook · Tank Mode: Bijan Robinson" — the bridge teams and what each sends. */
export function bridgeLabel(deal: Deal): string {
  const stops = deal.teams.slice(0, -1).map(
    (t, i) =>
      `${teamName(t)}: ${deal.hops[i + 1]
        .map((s) => s.base.fullName)
        .sort((a, b) => a.localeCompare(b))
        .join(', ')}`
  )
  return `via ${stops.join(' · ')}`
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/main/trade/bridge.test.ts`
Expected: PASS. A brute-force mismatch means a prune or the must-include rule is wrong — fix the search, never the oracle.

- [ ] **Step 6: Verify and commit**

```bash
npm run typecheck && npm run lint && npm test
npx prettier --write src/main/trade/searchContext.ts src/main/trade/bridge.ts tests/main/trade/bridge.test.ts
git add src/main/trade/searchContext.ts src/main/trade/bridge.ts tests/main/trade/bridge.test.ts
git commit -m "feat(trade): find bridge deals for one my side"
```

---

### Task 4: My sides, best-first

The candidates (spec §3.2), the bound U(z), and a priority queue that hands out my sides in exact rank order while solving as few of them as possible.

**Files:**

- Create: `src/main/trade/heap.ts`
- Create: `src/main/trade/mySides.ts`
- Test: `tests/main/trade/heap.test.ts`, `tests/main/trade/mySides.test.ts`

**Interfaces:**

- Consumes: Task 3's `SearchContext`, `MySide`, `subsets`, `idsKey`, `mySideKey`, `desc`, `byText`, `sideOf`; `sideFor`, `sideKey`, `SideCore` (`side.ts`); `passesStance`, `stanceDelta`, `STANCES` (`thresholds.ts`); `marketRatio`, `marketSum` (`evaluate.ts`); `round2` (`@main/db/repos/points`).
- Produces:
  - `heap.ts`: `Heap<T> { push(item: T): void; pop(): T | undefined; readonly size: number }`; `heap<T>(before: (a: T, b: T) => boolean): Heap<T>`.
  - `mySides.ts`: `RankedSide extends MySide { core: SideCore; ratio: number }`; `rankOrder(a: RankedSide, b: RankedSide): number`; `MySideQueue { readonly sides: MySide[]; readonly total: number; readonly discarded: number; next(): RankedSide | null; exact(x, z, c: Team): RankedSide | null }`; `mySideQueue(ctx: SearchContext, query: TradeSuggestQuery, kMax: number): MySideQueue`.

- [ ] **Step 1: Write the failing tests**

Create `tests/main/trade/heap.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { heap } from '@main/trade/heap'

describe('heap', () => {
  it('pops in the order `before` defines', () => {
    const h = heap<number>((a, b) => a < b)
    for (const n of [5, 1, 4, 1, 3, 9, 2]) h.push(n)
    expect(h.size).toBe(7)
    const out: number[] = []
    for (let n = h.pop(); n !== undefined; n = h.pop()) out.push(n)
    expect(out).toEqual([1, 1, 2, 3, 4, 5, 9])
    expect(h.size).toBe(0)
  })

  it('interleaves pushes and pops', () => {
    const h = heap<number>((a, b) => a > b)
    h.push(2)
    h.push(7)
    expect(h.pop()).toBe(7)
    h.push(5)
    h.push(1)
    expect([h.pop(), h.pop(), h.pop(), h.pop()]).toEqual([5, 2, 1, undefined])
  })
})
```

Create `tests/main/trade/mySides.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { marketRatio, marketSum } from '@main/trade/evaluate'
import { mySideQueue, rankOrder, type RankedSide } from '@main/trade/mySides'
import { searchContext } from '@main/trade/searchContext'
import { STANCES } from '@main/trade/thresholds'
import type { TradeSuggestQuery } from '@shared/types'
import { SEASON } from '../../fixtures/season'
import {
  generateLeague,
  searchLeague,
  SMALL_LEAGUE,
  syntheticBuild
} from '../../fixtures/synthetic'

const query = (over: Partial<TradeSuggestQuery> = {}): TradeSuggestQuery => ({
  season: SEASON,
  focus: null,
  stance: 'fair',
  maxTeams: 3,
  mustInclude: null,
  ...over
})

describe('mySideQueue (spec §3.2)', () => {
  it('hands out every passing my side in exact rank order', () => {
    for (const seed of [1, 2, 3]) {
      const { build } = syntheticBuild(searchLeague(seed))
      for (const stance of ['premium', 'fair', 'overpay'] as const) {
        for (const [maxTeams, mustInclude] of [
          [2, null],
          [2, 3],
          [3, null],
          [3, 3]
        ] as const) {
          const q = query({ stance, maxTeams, mustInclude })
          const lazy = mySideQueue(searchContext(build, mustInclude), q, maxTeams)
          const popped: RankedSide[] = []
          for (let s = lazy.next(); s !== null; s = lazy.next()) popped.push(s)
          // Brute force: score every candidate, keep the passing ones, sort on the rank key.
          const eager = mySideQueue(searchContext(build, mustInclude), q, maxTeams)
          const all = eager.sides
            .map((s) => eager.exact(s.x, s.z, s.c))
            .filter((s): s is RankedSide => s !== null)
            .sort(rankOrder)
          const label = { seed, stance, maxTeams, mustInclude }
          expect({ ...label, keys: popped.map((s) => s.key) }).toEqual({
            ...label,
            keys: all.map((s) => s.key)
          })
          expect(lazy.total).toBe(lazy.sides.length)
          expect(lazy.discarded + popped.length).toBe(lazy.total)
        }
      }
    }
  }, 60_000)

  it('applies the focus, the wanted position, must-include and the market precheck', () => {
    const { build } = syntheticBuild(SMALL_LEAGUE)
    const ids = (list: { base: { playerId: string } }[]): string[] =>
      list.map((s) => s.base.playerId)
    const give = mySideQueue(searchContext(build, null), query({ focus: { give: 'C' } }), 3)
    expect(give.sides.length).toBeGreaterThan(0)
    expect(give.sides.every((s) => ids(s.x).includes('C'))).toBe(true)
    const want = mySideQueue(searchContext(build, null), query({ focus: { want: 'WR' } }), 3)
    expect(want.sides.every((s) => s.z.some((p) => p.base.position === 'WR'))).toBe(true)
    // Must-include restricts C only when the deal cannot have a bridge.
    const two = mySideQueue(searchContext(build, 3), query({ mustInclude: 3 }), 2)
    expect(new Set(two.sides.map((s) => s.c.rosterId))).toEqual(new Set([3]))
    const three = mySideQueue(searchContext(build, 3), query({ mustInclude: 3 }), 3)
    expect(new Set(three.sides.map((s) => s.c.rosterId))).toEqual(new Set([2, 3]))
    for (const stance of ['premium', 'fair', 'overpay'] as const) {
      const q = mySideQueue(searchContext(build, null), query({ stance }), 3)
      for (const s of q.sides) {
        const ratio = marketRatio({
          marketGive: marketSum(build, s.x).total,
          marketGet: marketSum(build, s.z).total
        })
        expect(ratio).toBeGreaterThanOrEqual(STANCES[stance].ratio)
        expect(s.x.length + s.z.length).toBeLessThanOrEqual(3)
      }
    }
  })

  it('solves lazily: the first my side costs far fewer solves than there are candidates', () => {
    const { build } = syntheticBuild(generateLeague(7))
    const ctx = searchContext(build, null)
    const q = mySideQueue(ctx, query(), 3)
    expect(q.next()).not.toBeNull()
    expect(ctx.memo.size).toBeLessThan(q.total / 10)
  }, 60_000)
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/main/trade/heap.test.ts tests/main/trade/mySides.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 3: Write `src/main/trade/heap.ts`**

```ts
/** A binary heap; `before(a, b)` means a leaves first. */
export interface Heap<T> {
  push(item: T): void
  pop(): T | undefined
  readonly size: number
}

export function heap<T>(before: (a: T, b: T) => boolean): Heap<T> {
  const items: T[] = []
  const swap = (i: number, j: number): void => {
    const t = items[i]
    items[i] = items[j]
    items[j] = t
  }
  return {
    push(item: T): void {
      items.push(item)
      let i = items.length - 1
      while (i > 0) {
        const parent = (i - 1) >> 1
        if (!before(items[i], items[parent])) break
        swap(i, parent)
        i = parent
      }
    },
    pop(): T | undefined {
      if (items.length === 0) return undefined
      const top = items[0]
      const last = items.pop() as T
      if (items.length > 0) {
        items[0] = last
        let i = 0
        for (;;) {
          const l = 2 * i + 1
          const r = l + 1
          let first = i
          if (l < items.length && before(items[l], items[first])) first = l
          if (r < items.length && before(items[r], items[first])) first = r
          if (first === i) break
          swap(i, first)
          i = first
        }
      }
      return top
    },
    get size(): number {
      return items.length
    }
  }
}
```

- [ ] **Step 4: Write `src/main/trade/mySides.ts`**

```ts
import { round2 } from '@main/db/repos/points'
import { teamName } from '@main/lineup/build'
import type { PlayerSeries } from '@main/value/series'
import type { Team, TradeSuggestQuery } from '@shared/types'
import { marketRatio, marketSum } from './evaluate'
import { heap } from './heap'
import {
  byText,
  desc,
  idsKey,
  mySideKey,
  sideOf,
  subsets,
  type MySide,
  type SearchContext
} from './searchContext'
import { sideFor, sideKey, type SideCore } from './side'
import { passesStance, STANCES, stanceDelta } from './thresholds'

/** A my side scored exactly: it passes the stance. */
export interface RankedSide extends MySide {
  core: SideCore
  ratio: number
}

export interface MySideQueue {
  /** Spec §3.2: every candidate left after the market precheck, in enumeration order. */
  readonly sides: MySide[]
  /** The progress total: `sides.length`. */
  readonly total: number
  /** Candidates resolved inside the queue: discarded on their bound or failing the stance. */
  readonly discarded: number
  /** The next my side in rank order that passes the stance; null when none is left. */
  next(): RankedSide | null
  /** The candidate with these ends, scored — null when it is no candidate or fails the stance. */
  exact(x: PlayerSeries[], z: PlayerSeries[], c: Team): RankedSide | null
}

/** Spec §3.2's rank key: my Δ desc, my market ratio desc, C's name asc, x's then z's ids asc. */
export function rankOrder(a: RankedSide, b: RankedSide): number {
  return (
    desc(a.core.delta, b.core.delta) ||
    desc(a.ratio, b.ratio) ||
    teamName(a.c).localeCompare(teamName(b.c)) ||
    byText(idsKey(a.x), idsKey(b.x)) ||
    byText(idsKey(a.z), idsKey(b.z))
  )
}

type Entry =
  | { kind: 'bound'; delta: number; seq: number; side: MySide }
  | { kind: 'exact'; delta: number; seq: number; side: RankedSide }

function before(a: Entry, b: Entry): boolean {
  if (a.delta !== b.delta) return a.delta > b.delta
  // Spec §3.2: at equal Δ an unevaluated side goes first — it might tie or beat the exact one.
  if (a.kind !== b.kind) return a.kind === 'bound'
  if (a.kind === 'exact' && b.kind === 'exact') return rankOrder(a.side, b.side) < 0
  return a.seq < b.seq
}

/**
 * Spec §3.2: my sides, lazily best-first. Each candidate enters the queue at its bound U(z) — my
 * window total on my roster plus z, nothing given, no drop rule, minus my total now. My
 * after-roster is a subset of that roster and the optimum is monotone in the roster, so U(z)
 * bounds my Δ for every x. A popped bound entry is replaced by its exact result; an exact entry
 * is popped only when nothing unevaluated can tie or beat it.
 */
export function mySideQueue(
  ctx: SearchContext,
  query: TradeSuggestQuery,
  kMax: number
): MySideQueue {
  const { build, me, weeks } = ctx
  const { stance } = query
  const focusGive = query.focus !== null && 'give' in query.focus ? query.focus.give : null
  const want = query.focus !== null && 'want' in query.focus ? query.focus.want : null
  const xs = subsets(build.rosters.get(me.rosterId) ?? []).filter(
    (x) => focusGive === null || x.some((s) => s.base.playerId === focusGive)
  )
  const sides: MySide[] = []
  const byKey = new Map<string, MySide>()
  const queue = heap<Entry>(before)
  let seq = 0
  let discarded = 0
  for (const c of ctx.others) {
    // Without a bridge, the must-include team can only be C.
    if (kMax === 2 && query.mustInclude !== null && c.rosterId !== query.mustInclude) continue
    const pool = (build.rosters.get(c.rosterId) ?? []).filter((s) => ctx.enters(me.rosterId, s))
    for (const z of subsets(pool)) {
      if (want !== null && !z.some((s) => s.base.position === want)) continue
      const getValue = marketSum(build, z).total
      const group: MySide[] = []
      for (const x of xs) {
        if (x.length === 2 && z.length === 2) continue
        // Market precheck: my ratio needs no solve.
        const ratio = marketRatio({ marketGive: marketSum(build, x).total, marketGet: getValue })
        if (ratio < STANCES[stance].ratio) continue
        const side: MySide = { x, z, c, key: mySideKey(x, z, c) }
        group.push(side)
        sides.push(side)
        byKey.set(side.key, side)
      }
      if (group.length === 0) continue
      const bound = sideFor(
        build,
        { team: me, give: [], get: z },
        weeks,
        null,
        ctx.startsOf,
        {}
      ).delta
      if (!stanceDelta(stance, round2(bound / weeks.length) ?? 0)) {
        discarded += group.length
        continue
      }
      // Singles before pairs at equal bound: the Plan M check below finds them solved.
      for (const side of group) queue.push({ kind: 'bound', delta: bound, seq: seq++, side })
    }
  }

  const score = (side: MySide): RankedSide | null => {
    const core = sideOf(ctx, me, side.x, side.z)
    const ratio = marketRatio(core)
    return passesStance(stance, core.deltaPerWeek, ratio) ? { ...side, core, ratio } : null
  }
  /** Plan M: giving a second player cannot beat a contained single (same z) that needed no drops. */
  const boundedOut = (side: MySide): boolean =>
    side.x.length === 2 &&
    side.x.some((s) => {
      const smaller = ctx.memo.get(sideKey(me.rosterId, [s], side.z))
      return (
        smaller !== undefined &&
        smaller.drops.length === 0 &&
        !stanceDelta(stance, smaller.deltaPerWeek)
      )
    })

  return {
    sides,
    total: sides.length,
    get discarded(): number {
      return discarded
    },
    next(): RankedSide | null {
      for (let e = queue.pop(); e !== undefined; e = queue.pop()) {
        if (e.kind === 'exact') return e.side
        if (boundedOut(e.side)) {
          discarded++
          continue
        }
        const ranked = score(e.side)
        if (ranked === null) {
          discarded++
          continue
        }
        queue.push({ kind: 'exact', delta: ranked.core.delta, seq: e.seq, side: ranked })
      }
      return null
    },
    exact(x: PlayerSeries[], z: PlayerSeries[], c: Team): RankedSide | null {
      const side = byKey.get(mySideKey(x, z, c))
      return side ? score(side) : null
    }
  }
}
```

- [ ] **Step 5: Run the tests**

Run: `npx vitest run tests/main/trade/heap.test.ts tests/main/trade/mySides.test.ts`
Expected: PASS.

- [ ] **Step 6: Verify and commit**

```bash
npm run typecheck && npm run lint && npm test
npx prettier --write src/main/trade/heap.ts src/main/trade/mySides.ts tests/main/trade/heap.test.ts tests/main/trade/mySides.test.ts
git add src/main/trade/heap.ts src/main/trade/mySides.ts tests/main/trade/heap.test.ts tests/main/trade/mySides.test.ts
git commit -m "feat(trade): rank my sides lazily best-first"
```

---

### Task 5: The search generator

`suggestDeals` ties it together (spec §3.3–§3.5): for each my side in rank order, the smallest size with a working deal, the representative and its alternatives, dominance resolved on the spot, the early stop. It replaces `suggestTrades`; the property test against the oracle is the quality guarantee.

**Files:**

- Modify: `src/main/trade/suggest.ts` (rewrite)
- Modify: `src/main/trade/fromDb.ts`
- Modify: `tests/main/trade/suggest.test.ts`, `tests/main/trade/suggestOracle.test.ts`, `tests/main/trade/suggestBudget.test.ts`, `tests/main/engine/jobs.test.ts`
- Test: `tests/main/trade/suggestProperty.test.ts`

**Interfaces:**

- Consumes: Task 3 (`searchContext`, `MySide`, `byText`, `desc`, `idsKey`, `dealsAt`, `dealProposal`, `bridgeLabel`, `Deal`), Task 4 (`mySideQueue`, `RankedSide`), `evaluateTrade`, `TradeError` (`evaluate.ts`), `DOMINANCE_PTS`, `SUGGEST_MAX` (`thresholds.ts`).
- Produces:
  - `SearchProgress { checked: number; total: number; found: number; size: number }`
  - `DealEvent = { type: 'card'; card: TradeSuggestion } | { type: 'progress'; progress: SearchProgress }`
  - `SearchEnd = 'complete' | 'full'`
  - `SuggestOptions { max?: number; exhaust?: boolean }`
  - `suggestDeals(build: LineupBuild, query: TradeSuggestQuery, opts?: SuggestOptions): Generator<DealEvent, SearchEnd>`
  - `collectDeals(build, query, opts?): { cards: TradeSuggestion[]; end: SearchEnd }`
  - `suggest.ts` still re-exports the thresholds. `suggestTrades` and its `prune` / `skip` options are gone.

- [ ] **Step 1: Write the property test (fails: `suggestDeals` does not exist yet)**

Create `tests/main/trade/suggestProperty.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { collectDeals, suggestDeals, type DealEvent } from '@main/trade/suggest'
import type { TradeEvaluation, TradeFocus, TradeStance, TradeSuggestQuery } from '@shared/types'
import { SEASON } from '../../fixtures/season'
import {
  NEGATIVE_LEAGUE,
  negativeSearchLeague,
  searchLeague,
  syntheticBuild,
  type SyntheticLeague
} from '../../fixtures/synthetic'
import { oracleSuggest } from './suggestOracle'

const SEEDS = [1, 2, 3]
const STANCE_LIST: TradeStance[] = ['premium', 'fair', 'overpay']
/**
 * Negative values break the optimum's monotonicity: the prunes must stay exact there too.
 * `negativeSearchLeague` is a regression net; `NEGATIVE_LEAGUE` is the fixture where a missing
 * negative-value guard actually changes the answer.
 */
const CASES: [string, SyntheticLeague][] = [
  ...SEEDS.flatMap((seed): [string, SyntheticLeague][] => [
    [`positive values, seed ${seed}`, searchLeague(seed)],
    [`negative values, seed ${seed}`, negativeSearchLeague(seed)]
  ]),
  ['hand-built negative values', NEGATIVE_LEAGUE]
]

describe('suggestDeals equals the brute force (spec §7)', () => {
  it.each(CASES)(
    '%s: every team count, stance, focus and must-include',
    (_label, league) => {
      const { build } = syntheticBuild(league)
      const cache = new Map<string, TradeEvaluation>()
      const mine = build.rosters.get(1) ?? []
      const focuses: TradeFocus[] = [null, { give: mine[0].base.playerId }, { want: 'WR' }]
      for (const maxTeams of [2, 3, 4]) {
        for (const stance of STANCE_LIST) {
          for (const focus of focuses) {
            for (const mustInclude of [null, 3]) {
              const query: TradeSuggestQuery = {
                season: SEASON,
                focus,
                stance,
                maxTeams,
                mustInclude
              }
              const expected = oracleSuggest(build, query, { cache })
              expect({ query, cards: collectDeals(build, query).cards }).toEqual({
                query,
                cards: expected
              })
              // The early stop: a capped run is exactly the head of the full list.
              expect({ query, cards: collectDeals(build, query, { max: 2 }).cards }).toEqual({
                query,
                cards: expected.slice(0, 2)
              })
            }
          }
        }
      }
    },
    180_000
  )

  it('exercises deals beyond two teams and alternatives', () => {
    // Guards the fixture: if it ever stops producing these, raise SEEDS (e.g. 1–6).
    let multi = 0
    let alternatives = 0
    for (const seed of SEEDS) {
      const { build } = syntheticBuild(searchLeague(seed))
      for (const stance of STANCE_LIST) {
        const query: TradeSuggestQuery = {
          season: SEASON,
          focus: null,
          stance,
          maxTeams: 4,
          mustInclude: null
        }
        for (const card of collectDeals(build, query).cards) {
          if (card.teams > 2) multi++
          alternatives += card.alternatives.length
        }
      }
    }
    expect(multi).toBeGreaterThan(0)
    expect(alternatives).toBeGreaterThan(0)
  }, 60_000)
})

describe('streaming (spec §7)', () => {
  const query: TradeSuggestQuery = {
    season: SEASON,
    focus: null,
    stance: 'overpay',
    maxTeams: 3,
    mustInclude: null
  }

  it('yields its cards in final order, with progress that only moves forward', () => {
    const { build } = syntheticBuild(searchLeague(2))
    const events: DealEvent[] = []
    const search = suggestDeals(build, query)
    let step = search.next()
    while (!step.done) {
      events.push(step.value)
      step = search.next()
    }
    const cards = events.flatMap((e) => (e.type === 'card' ? [e.card] : []))
    expect(cards).toEqual(collectDeals(build, query).cards)
    const progress = events.flatMap((e) => (e.type === 'progress' ? [e.progress] : []))
    for (let i = 1; i < progress.length; i++) {
      expect(progress[i].checked).toBeGreaterThanOrEqual(progress[i - 1].checked)
      expect(progress[i].found).toBeGreaterThanOrEqual(progress[i - 1].found)
    }
    const last = progress[progress.length - 1]
    expect(last.found).toBe(cards.length)
    if (step.value === 'complete') expect(last.checked).toBe(last.total)
    expect(progress.every((p) => p.size >= 2 && p.size <= 3)).toBe(true)
  })

  it('stops at the cap with exactly the head of an exhaustive run', () => {
    const { build } = syntheticBuild(searchLeague(2))
    const all = collectDeals(build, query, { max: 1, exhaust: true })
    expect(all.end).toBe('complete')
    expect(all.cards.length).toBeGreaterThan(1)
    const capped = collectDeals(build, query, { max: 1 })
    expect(capped.end).toBe('full')
    expect(capped.cards).toEqual(all.cards.slice(0, 1))
  })
})
```

Run: `npx vitest run tests/main/trade/suggestProperty.test.ts`
Expected: FAIL — `collectDeals` / `suggestDeals` are not exported.

- [ ] **Step 2: Rewrite `src/main/trade/suggest.ts`**

Replace the whole file:

```ts
import { teamName, type LineupBuild } from '@main/lineup/build'
import type { PlayerSeries } from '@main/value/series'
import type { TradeAlternative, TradeSuggestion, TradeSuggestQuery } from '@shared/types'
import { bridgeLabel, dealProposal, dealsAt, type Deal } from './bridge'
import { evaluateTrade, TradeError } from './evaluate'
import { mySideQueue, type RankedSide } from './mySides'
import {
  byText,
  desc,
  idsKey,
  searchContext,
  type MySide,
  type SearchContext
} from './searchContext'
import { DOMINANCE_PTS, SUGGEST_MAX } from './thresholds'

export {
  ACCEPT_LOSS_PER_WEEK,
  acceptanceOf,
  DOMINANCE_PTS,
  passesStance,
  STANCES,
  stanceDelta,
  SUGGEST_MAX
} from './thresholds'

/** Spec §4.1 without the clock — the worker stamps `elapsedMs`. */
export interface SearchProgress {
  /** My sides resolved: discarded on their bound, failed the stance, or searched. */
  checked: number
  /** My-side candidates after the market precheck. */
  total: number
  /** Cards so far. */
  found: number
  /** The deal size being tried for the current my side. */
  size: number
}

export type DealEvent =
  { type: 'card'; card: TradeSuggestion } | { type: 'progress'; progress: SearchProgress }

/** `full`: the cap was reached, nothing left could rank higher; `complete`: every my side resolved. */
export type SearchEnd = 'complete' | 'full'

export interface SuggestOptions {
  /** Result cap (default `SUGGEST_MAX`). */
  max?: number
  /** Tests only: keep going past `max` until every my side is resolved. */
  exhaust?: boolean
}

/** The smallest size with a working deal for one my side, and every working deal of that size. */
interface Found {
  k: number
  deals: Deal[]
}

const worstOf = (d: Deal): number => Math.min(...d.accepted.map((a) => a.core.deltaPerWeek))
const movedOf = (d: Deal): number => d.hops.reduce((n, hop) => n + hop.length, 0)

/** Spec §3.4: the least happy other team's Δ/week desc, fewer players moved, names in cycle order, ids. */
function dealOrder(a: Deal, b: Deal): number {
  const byWorst = desc(worstOf(a), worstOf(b))
  if (byWorst !== 0) return byWorst
  const byMoved = movedOf(a) - movedOf(b)
  if (byMoved !== 0) return byMoved
  for (let i = 0; i < a.teams.length; i++) {
    const byName = teamName(a.teams[i]).localeCompare(teamName(b.teams[i]))
    if (byName !== 0) return byName
  }
  return byText(a.hops.map(idsKey).join('>'), b.hops.map(idsKey).join('>'))
}

/** Spec §3.4–3.5: one card per my side — the representative evaluated whole, the rest as alternatives. */
function cardOf(ctx: SearchContext, found: Found): TradeSuggestion {
  const [best, ...rest] = [...found.deals].sort(dealOrder)
  return {
    evaluation: evaluateTrade(ctx.build, dealProposal(ctx.me, best), { memo: ctx.memo }),
    teams: found.k,
    acceptance: [null, ...best.accepted.map((a) => a.acceptance)],
    alternatives: rest.map((d): TradeAlternative => ({
      proposal: dealProposal(ctx.me, d),
      label: bridgeLabel(d),
      worstDeltaPerWeek: worstOf(d)
    }))
  }
}

/**
 * Multi-team spec §3: deals of 2..maxTeams teams, one card per my side, yielded in final rank
 * order — so the list only appends and the run can stop at the cap. Progress events interleave.
 */
export function* suggestDeals(
  build: LineupBuild,
  query: TradeSuggestQuery,
  opts: SuggestOptions = {}
): Generator<DealEvent, SearchEnd> {
  const ctx = searchContext(build, query.mustInclude)
  if (query.mustInclude !== null && !ctx.others.some((t) => t.rosterId === query.mustInclude)) {
    throw new TradeError('INVALID_TRADE', 'Must include another team in this league')
  }
  const kMax = Math.min(Math.max(Math.trunc(query.maxTeams), 2), ctx.others.length + 1)
  const max = opts.max ?? SUGGEST_MAX
  const focusGive = query.focus !== null && 'give' in query.focus ? query.focus.give : null
  const myRoster = build.rosters.get(ctx.me.rosterId) ?? []
  if (focusGive !== null && !myRoster.some((s) => s.base.playerId === focusGive)) return 'complete'

  const queue = mySideQueue(ctx, query, kMax)
  let found = 0
  let resolved = 0
  let size = 2
  const progress = (): DealEvent => ({
    type: 'progress',
    progress: { checked: queue.discarded + resolved, total: queue.total, found, size }
  })

  /** Per my side: how far its sizes were tried and what was found — dominance reuses it. */
  const searched = new Map<string, { upTo: number; hit: Found | null }>()
  function* search(side: MySide, upTo: number): Generator<DealEvent, Found | null> {
    let state = searched.get(side.key)
    if (!state) {
      state = { upTo: 1, hit: null }
      searched.set(side.key, state)
    }
    while (state.hit === null && state.upTo < upTo) {
      const k = state.upTo + 1
      size = k
      yield progress()
      const deals = dealsAt(ctx, side, k)
      let step = deals.next()
      while (!step.done) {
        yield progress()
        step = deals.next()
      }
      state.upTo = k
      if (step.value.length > 0) state.hit = { k, deals: step.value }
    }
    return state.hit !== null && state.hit.k <= upTo ? state.hit : null
  }

  /**
   * Spec §3.4: a pair is padding when a contained single my side passes the stance, works with no
   * more teams and is nearly as good. Resolved now — before the card is emitted — so a card is
   * never withdrawn; the single's search is remembered for when it comes up itself.
   */
  function* dominated(side: RankedSide, k: number): Generator<DealEvent, boolean> {
    const contained: [PlayerSeries[], PlayerSeries[]][] = [
      ...(side.x.length === 2
        ? side.x.map((s): [PlayerSeries[], PlayerSeries[]] => [[s], side.z])
        : []),
      ...(side.z.length === 2
        ? side.z.map((s): [PlayerSeries[], PlayerSeries[]] => [side.x, [s]])
        : [])
    ]
    for (const [x, z] of contained) {
      const single = queue.exact(x, z, side.c)
      if (single === null || side.core.delta - single.core.delta > DOMINANCE_PTS) continue
      if ((yield* search(single, k)) !== null) return true
    }
    return false
  }

  yield progress()
  for (let side = queue.next(); side !== null; side = queue.next()) {
    const hit = yield* search(side, kMax)
    if (hit !== null && !(yield* dominated(side, hit.k))) {
      found++
      yield { type: 'card', card: cardOf(ctx, hit) }
    }
    resolved++
    yield progress()
    if (found >= max && !opts.exhaust) return 'full'
  }
  return 'complete'
}

/** `suggestDeals` run to the end synchronously — tests and the budget check. */
export function collectDeals(
  build: LineupBuild,
  query: TradeSuggestQuery,
  opts: SuggestOptions = {}
): { cards: TradeSuggestion[]; end: SearchEnd } {
  const cards: TradeSuggestion[] = []
  const search = suggestDeals(build, query, opts)
  let step = search.next()
  while (!step.done) {
    if (step.value.type === 'card') cards.push(step.value.card)
    step = search.next()
  }
  return { cards, end: step.value }
}
```

- [ ] **Step 3: Point the one-shot worker job at the new search**

`src/main/trade/fromDb.ts`: import `collectDeals` instead of `suggestTrades`, and `suggestFromDb` returns `collectDeals(lineupBuildFromDb(db, leagueId, query.season), query).cards`. (The renderer still calls `trade:suggest` with `maxTeams: 2` until Task 11; the screen keeps working, now with ids breaking exact ties.)

`tests/main/engine/jobs.test.ts`, "still answers trade suggestions": compare with `collectDeals(build, query).cards` (import `collectDeals` from `@main/trade/suggest` instead of `suggestTrades`).

- [ ] **Step 4: Move the 6b tests onto `collectDeals`**

In `tests/main/trade/suggest.test.ts`:

1. Imports: replace `suggestTrades` with `collectDeals` in the `@main/trade/suggest` import; add `TRIANGLE_LEAGUE` to the synthetic import; drop `generateLeague`, `SyntheticLeague` and `rules` if they become unused.
2. `shape` names the team I get from by the last side (for a 2-team card that is still `sides[1]`):

```ts
const shape = (s: TradeSuggestion): string => {
  const ids = (list: { playerId: string }[]): string =>
    list
      .map((p) => p.playerId)
      .sort()
      .join('+')
  const sides = s.evaluation.sides
  return `${ids(sides[0].give)}→${ids(sides[0].get)}@${sides[sides.length - 1].rosterId}`
}
```

3. Add after `shapes` (import `LineupBuild` from `@main/lineup/build` and `SuggestOptions` from `@main/trade/suggest`):

```ts
/** The 6b tests read the finished list. */
const run = (b: LineupBuild, q: TradeSuggestQuery, opts: SuggestOptions = {}): TradeSuggestion[] =>
  collectDeals(b, q, opts).cards
```

Then replace every `suggestTrades(` with `run(` — the arguments stay as they are (`suggestTrades(build, query(…), { max: 3 })` becomes `run(build, query(…), { max: 3 })`, `suggestTrades(unvalued.build, …)` becomes `run(unvalued.build, …)`, and the `NO_ME` / `NO_PROJECTIONS` cases become `run(nobody.build, query())` / `run(blind.build, query())`). 4. In "restricts the scan to one partner", the unknown team now throws (spec §6):

```ts
it('restricts the scan to one partner and rejects a team outside the league', () => {
  expect(shapes(run(build, query({ mustInclude: 2 })))).toEqual(['C→F@2'])
  expect(shapes(run(build, query({ mustInclude: 3 })))).toEqual(['A+B→I@3'])
  expect(codeOf(() => run(build, query({ mustInclude: 9 })))).toBe('INVALID_TRADE')
  expect(codeOf(() => run(build, query({ mustInclude: 1 })))).toBe('INVALID_TRADE') // me
})
```

5. Add to the small-league `describe`:

```ts
it('marks every 2-team card as such, with no alternatives', () => {
  for (const s of run(build, query({ stance: 'overpay' }))) {
    expect(s.teams).toBe(2)
    expect(s.alternatives).toEqual([])
  }
})
```

6. Replace the whole `describe('prunes are exact', …)` block — the property test supersedes its first case — with the drop check alone plus the triangle cases:

```ts
describe('the week skip on an overflowing roster', () => {
  it('picks the same drops with the skip disabled', () => {
    const { build } = syntheticBuild(searchLeague(3))
    const me = build.rosters.get(1) ?? []
    const them = build.rosters.get(2) ?? []
    const proposal = twoTeam(
      1,
      2,
      [me[0].base.playerId],
      [them[0].base.playerId, them[1].base.playerId]
    )
    const fast = evaluateTrade(build, proposal)
    expect(fast.sides[0].drops).toHaveLength(1)
    expect(fast).toEqual(evaluateTrade(build, proposal, { skip: false }))
  })
})

describe('deals beyond two teams on the triangle league (spec §3)', () => {
  const { build } = syntheticBuild(TRIANGLE_LEAGUE)
  const a2b2 = (list: TradeSuggestion[]): TradeSuggestion | undefined =>
    list.find((s) => shape(s) === 'a2→b2@2')

  it('reaches a2 for b2 through Three, with the other ways in order', () => {
    const card = a2b2(collectDeals(build, query({ maxTeams: 3 })).cards)
    expect(card?.teams).toBe(3)
    expect(card?.evaluation.sides.map((s) => [s.name, s.deltaPerWeek])).toEqual([
      ['Me', 10],
      ['Three', 10],
      ['Two', 10]
    ])
    expect(card?.acceptance).toEqual([null, 'both', 'lineup'])
    expect(card?.alternatives.map((a) => [a.label, a.worstDeltaPerWeek])).toEqual([
      ['via Three: c2, c3', 10],
      ['via Three: c1', 4],
      ['via Three: c1, c3', 4]
    ])
    // the card carries exactly what the builder computes for it
    if (card) expect(evaluateTrade(build, proposalOf(card.evaluation))).toEqual(card.evaluation)
  })

  it('is not offered at two teams, and must-include Three keeps it', () => {
    expect(a2b2(collectDeals(build, query({ maxTeams: 2 })).cards)).toBeUndefined()
    expect(a2b2(collectDeals(build, query({ maxTeams: 3, mustInclude: 3 })).cards)?.teams).toBe(3)
  })
})
```

(`searchLeague(3)`: 4 players and a 4-spot roster, so 1-for-2 forces a drop — the same property the old 8-player helper had.) Import `searchLeague` from the synthetic fixture.

`tests/main/trade/suggestOracle.test.ts`: the two "matches suggestTrades" cases now compare with the new search, which breaks exact ties by ids exactly as the oracle does — so compare unsorted, full lists:

```ts
import { collectDeals } from '@main/trade/suggest'
```

replace `suggestTrades(build, q)` with `collectDeals(build, q).cards` and, in the random-league case, drop `byShape` on both sides and pass `{ max: 1000 }` to both (`collectDeals(build, q, { max: 1000 }).cards`). Rename the `describe` to `'the oracle at two teams agrees with the search'`. Remove `byShape` if unused.

`tests/main/trade/suggestBudget.test.ts`: replace `suggestTrades(build, q)` with `collectDeals(build, q).cards` (the import follows); the budget itself is rewritten in Task 6.

- [ ] **Step 5: Run the search tests**

Run: `npx vitest run tests/main/trade`
Expected: PASS. In particular the property test: `suggestDeals` equals the oracle for every seed, team count, stance, focus and must-include, capped and uncapped. A mismatch is a search bug (ordering, dominance, the smallest size, a prune) — debug it with superpowers:systematic-debugging; never change the oracle to agree.

- [ ] **Step 6: Verify and commit**

```bash
npm run typecheck && npm run lint && npm test
npx prettier --write src/main/trade/suggest.ts src/main/trade/fromDb.ts tests/main/trade/suggest.test.ts tests/main/trade/suggestOracle.test.ts tests/main/trade/suggestBudget.test.ts tests/main/trade/suggestProperty.test.ts tests/main/engine/jobs.test.ts
git add src/main/trade tests/main/trade tests/main/engine/jobs.test.ts
git commit -m "feat(trade): search N-team deals best-first"
```

---

### Task 6: Budget and the measurement gate

Spec §9: once `suggestDeals` passes the property test and **before** any UI work, measure it on the user's league. This task ends in a decision.

**Files:**

- Modify: `tests/main/trade/suggestBudget.test.ts` (rewrite)
- Modify: this plan (status block)
- Throwaway (never committed): `tests/zz-search.test.ts`

- [ ] **Step 1: Rewrite the budget test**

Replace `tests/main/trade/suggestBudget.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { suggestDeals } from '@main/trade/suggest'
import type { TradeSuggestQuery } from '@shared/types'
import { SEASON } from '../../fixtures/season'
import { generateLeague, syntheticBuild } from '../../fixtures/synthetic'

/** Spec §7: the time to the first card is what the streamed list makes the user wait. */
const FIRST_CARD_MS = 3000
/** 6b's two-team budgets, carried over: one partner stays interactive, every team is a ceiling. */
const FOCUSED_MS = 3000
const ALL_TEAMS_MS = 20000

interface Timing {
  first: number | null
  total: number
  cards: number
  end: string
}

/**
 * Timing-sensitive: `npm test` runs its files in parallel workers, which is enough contention to
 * make a wall-clock assertion flap, so this runs only under `npm run test:budget`. Run it locally
 * before every build.
 */
describe.skipIf(!process.env.FFC_BUDGET)('suggestDeals budget', () => {
  const { build } = syntheticBuild(generateLeague(7))
  const query = (over: Partial<TradeSuggestQuery>): TradeSuggestQuery => ({
    season: SEASON,
    focus: null,
    stance: 'fair',
    maxTeams: 2,
    mustInclude: null,
    ...over
  })
  /** Drives the search the way the worker does, noting when the first card arrives. */
  const time = (q: TradeSuggestQuery): Timing => {
    const t0 = performance.now()
    let first: number | null = null
    let cards = 0
    const search = suggestDeals(build, q)
    let step = search.next()
    while (!step.done) {
      if (step.value.type === 'card') {
        cards++
        if (first === null) first = performance.now() - t0
      }
      step = search.next()
    }
    return { first, total: performance.now() - t0, cards, end: step.value }
  }
  const show = (label: string, t: Timing): void => {
    const first = t.first === null ? '—' : `${t.first.toFixed(0)} ms`
    console.info(
      `${label}: first card ${first} · ${t.cards} cards (${t.end}) in ${t.total.toFixed(0)} ms`
    )
  }

  it('keeps the two-team searches within 6b’s budgets', () => {
    const partner = time(query({ mustInclude: 3 }))
    show('2 teams, with team 3', partner)
    expect(partner.total).toBeLessThan(FOCUSED_MS)
    const focus = time(query({ focus: { give: build.rosters.get(1)?.[2].base.playerId ?? '' } }))
    show('2 teams, focus give', focus)
    expect(focus.total).toBeLessThan(FOCUSED_MS)
    for (const stance of ['premium', 'fair', 'overpay'] as const) {
      const all = time(query({ stance }))
      show(`2 teams, any team, ${stance}`, all)
      expect(all.total).toBeLessThan(ALL_TEAMS_MS)
    }
  }, 180_000)

  it('shows the first card of an up-to-3-team search fast; the full list is measured only', () => {
    for (const stance of ['premium', 'fair', 'overpay'] as const) {
      const t = time(query({ maxTeams: 3, stance }))
      show(`up to 3 teams, any team, ${stance}`, t)
      if (t.cards > 0) expect(t.first ?? Number.POSITIVE_INFINITY).toBeLessThan(FIRST_CARD_MS)
    }
  }, 1_800_000)
})
```

- [ ] **Step 2: Run the budget**

Run: `npm run test:budget`
Record every printed line (they go into the status block). A failed two-team budget is a regression to fix before going on; a failed first-card budget is a gate finding (Step 4).

- [ ] **Step 3: Measure on the user's league**

Copy the dev DB and run a throwaway test (do **not** commit it):

```bash
mkdir -p "$SCRATCH" && cp ~/.config/FantasyCompanion/companion.db "$SCRATCH/real.db"
```

(`$SCRATCH` = your scratchpad directory.) Create `tests/zz-search.test.ts`:

```ts
import { it } from 'vitest'
import { openDatabase } from '@main/db/connection'
import { migrate } from '@main/db/migrate'
import { getSetting, SETTING_ACTIVE_LEAGUE } from '@main/db/repos/settings'
import { lineupBuildFromDb } from '@main/engine/lineupFromDb'
import { suggestDeals } from '@main/trade/suggest'
import type { TradeSuggestion, TradeSuggestQuery } from '@shared/types'

/** Gives up on one run after this long and reports what it had. */
const RUN_LIMIT_MS = 600_000

const path = (s: TradeSuggestion): string =>
  s.evaluation.sides
    .map(
      (side) =>
        `${side.isMe ? 'me' : side.name} sends ${side.give.map((p) => p.fullName).join(' + ')}`
    )
    .join(' → ')

it('measures the N-team search on the real league', () => {
  const db = openDatabase(`${process.env.SCRATCH}/real.db`)
  migrate(db)
  const leagueId = getSetting(db, SETTING_ACTIVE_LEAGUE)
  if (!leagueId) throw new Error('no active league in the copy')
  const build = lineupBuildFromDb(db, leagueId, 2026)
  db.close()
  const other = build.inputs.teams.find((t) => !t.isMe)
  if (!other) throw new Error('no other team')
  for (const maxTeams of [2, 3, 4]) {
    for (const mustInclude of [null, other.rosterId]) {
      const query: TradeSuggestQuery = {
        season: 2026,
        focus: null,
        stance: 'fair',
        maxTeams,
        mustInclude
      }
      const t0 = performance.now()
      let first: number | null = null
      const cards: TradeSuggestion[] = []
      let end = 'gave up'
      let checked = '0/0'
      const search = suggestDeals(build, query)
      for (let step = search.next(); ; step = search.next()) {
        if (step.done) {
          end = step.value
          break
        }
        if (step.value.type === 'card') {
          cards.push(step.value.card)
          if (first === null) first = performance.now() - t0
        } else {
          checked = `${step.value.progress.checked}/${step.value.progress.total}`
        }
        if (performance.now() - t0 > RUN_LIMIT_MS) break
      }
      const total = performance.now() - t0
      console.info(
        `up to ${maxTeams}, ${mustInclude === null ? 'any team' : `must include ${other.displayName}`}: ` +
          `first ${first === null ? '—' : `${(first / 1000).toFixed(1)} s`} · ` +
          `${cards.length} cards (${end}) in ${(total / 1000).toFixed(1)} s · checked ${checked} · ` +
          `by size ${[2, 3, 4].map((k) => `${k}:${cards.filter((c) => c.teams === k).length}`).join(' ')}`
      )
      for (const c of cards.slice(0, 3)) {
        console.info(
          `   ${c.evaluation.sides[0].deltaPerWeek}/wk · ${path(c)} (+${c.alternatives.length} other ways)`
        )
      }
    }
  }
}, 7_200_000)
```

Run: `SCRATCH=<scratchpad> npx vitest run tests/zz-search.test.ts` (use the Bash tool's `run_in_background` if it runs long). Then `rm tests/zz-search.test.ts`.

Check by eye: the top cards are plausible (each other team gains, or the market carries it); 2-team results at `maxTeams 2` are the cards v0.18.0 showed (same deals; exact ties may reorder).

- [ ] **Step 4: The gate**

Write the numbers into this plan's **Status** line (synthetic budget lines, the twelve real-league lines, the top cards in a sentence).

- **Practical** — on the real league, **up to 3 teams, any team**: first card ≤ 5 s **and** final list ≤ 60 s. Commit the status and the budget, and continue with Task 7:

```bash
npx prettier --write tests/main/trade/suggestBudget.test.ts
git add tests/main/trade/suggestBudget.test.ts docs/superpowers/plans/2026-10-02-plan-r-multi-team-search.md
git commit -m "test(trade): budget the N-team search"
```

- **Not practical** — commit the same files, then **stop executing this plan** and report to the user: the numbers, where the time goes (k = 3 DFS vs my-side solves — profile one slow run with `node --cpu-prof` if unclear), and the remedies the spec allows (§9), never an inexact shortcut:
  1. a new **exact** prune — the candidate is a loss bound: a team giving hop h and getting g has Δ ≤ (its window total without h − its total now) + g's window points, so when that is ≤ 0 and the market ratio is < `MARKET_FAIR` (or the bound is below −weeks), it refuses without a solve; "its total without h" costs one solve per team and hop per run, shared by every my side;
  2. a different default (`mustInclude` set to the builder's partner, or **Up to** 2).

  The user decides; record the decision in the Global Constraints and amend the remaining tasks before continuing.

---

### Task 13: Refuse early

Gate remedy 1 (profile: `.superpowers/sdd/task-6-profile.md` §6, items 1–2). The exact prunes move into `refuses(ctx, team, give, get)`; prune (b) solves the smaller deal when it is not known yet ("B-first"); and with **Up to 2 teams** the queue asks C's refusal **before** solving my side — at two teams C's refusal is the whole answer.

**Files:**

- Modify: `src/main/trade/bridge.ts` (`refuses`, `accepts`)
- Modify: `src/main/trade/mySides.ts` (`mySideQueue` takes an optional `refuse`)
- Modify: `src/main/trade/suggest.ts` (passes it when `kMax === 2`)
- Test: `tests/main/trade/bridge.test.ts`, `tests/main/trade/mySides.test.ts`

**Interfaces:**

- Produces: `refuses(ctx: SearchContext, team: Team, give: PlayerSeries[], get: PlayerSeries[]): boolean` (exported from `bridge.ts`); `mySideQueue(ctx, query, kMax, refuse?: (side: MySide) => boolean)`.

- [ ] **Step 1: Write the failing tests**

In `tests/main/trade/bridge.test.ts` add `refuses` to the `@main/trade/bridge` import and `sideKey` from `@main/trade/side`, then:

```ts
describe('refuses (spec §3.3, exact prunes alone)', () => {
  const { build } = syntheticBuild(TRIANGLE_LEAGUE)
  const player = (ctx: SearchContext, id: string): PlayerSeries => {
    for (const roster of ctx.build.rosters.values()) {
      const hit = roster.find((s) => s.base.playerId === id)
      if (hit) return hit
    }
    throw new Error(`no player ${id}`)
  }
  const team = (ctx: SearchContext, id: number): Team =>
    ctx.others.find((t) => t.rosterId === id) as Team

  it('refuses without a solve when nothing it gets can start and the market is short', () => {
    const ctx = searchContext(build, null)
    // Two gives b2 for a2: a2 can't start behind b4, 1 000 for 3 000.
    expect(refuses(ctx, team(ctx, 2), [player(ctx, 'b2')], [player(ctx, 'a2')])).toBe(true)
    expect(ctx.memo.size).toBe(0)
    // Three takes a2 for c2 (it starts a2 over c3): no prune applies.
    expect(refuses(ctx, team(ctx, 3), [player(ctx, 'c2')], [player(ctx, 'a2')])).toBe(false)
  })

  it('solves the smaller deal a pair is compared against (B-first)', () => {
    const ctx = searchContext(build, null)
    const [c2, c3, a2] = ['c2', 'c3', 'a2'].map((id) => player(ctx, id))
    // Three would take a2 for c2 alone and for c3 alone, so the pair is not refused…
    expect(refuses(ctx, team(ctx, 3), [c2, c3], [a2])).toBe(false)
    // …and both smaller deals are now solved and shared.
    expect(ctx.memo.has(sideKey(3, [c2], [a2]))).toBe(true)
    expect(ctx.memo.has(sideKey(3, [c3], [a2]))).toBe(true)
    expect(ctx.memo.has(sideKey(3, [c2, c3], [a2]))).toBe(false)
  })
})
```

(`Team` comes from `@shared/types`; add the imports the file lacks.)

In `tests/main/trade/mySides.test.ts` add `TRIANGLE_LEAGUE` to the fixture import, `refuses` from `@main/trade/bridge`, `sideKey` from `@main/trade/side`, and:

```ts
it('asks C first at two teams: a refused side is never scored', () => {
  const { build } = syntheticBuild(TRIANGLE_LEAGUE)
  const q = query({ maxTeams: 2 })
  const scoredKey = (ctx: ReturnType<typeof searchContext>): string => {
    const roster = build.rosters.get(1) ?? []
    const a2 = roster.filter((s) => s.base.playerId === 'a2')
    const b2 = (build.rosters.get(2) ?? []).filter((s) => s.base.playerId === 'b2')
    return sideKey(ctx.me.rosterId, a2, b2)
  }
  const plain = searchContext(build, null)
  const without = mySideQueue(plain, q, 2)
  while (without.next() !== null);
  expect(plain.memo.has(scoredKey(plain))).toBe(true) // a2 → b2 passes my stance: scored
  const early = searchContext(build, null)
  const withRefuse = mySideQueue(early, q, 2, (side) => refuses(early, side.c, side.z, side.x))
  const popped: string[] = []
  for (let s = withRefuse.next(); s !== null; s = withRefuse.next()) popped.push(s.key)
  expect(early.memo.has(scoredKey(early))).toBe(false) // Two refuses a2 for b2: never scored
  expect(popped).not.toContain('a2|b2|2')
  expect(withRefuse.discarded + popped.length).toBe(withRefuse.total)
})
```

Run: `npx vitest run tests/main/trade/bridge.test.ts tests/main/trade/mySides.test.ts`
Expected: FAIL — `refuses` is not exported; `mySideQueue` ignores the fourth argument.

- [ ] **Step 2: Split `refuses` out of `accepts`**

In `src/main/trade/bridge.ts`, replace `accepts` with:

```ts
/**
 * Spec §3.3, the exact prunes alone: true when `team` provably refuses `get` for `give`. It may
 * solve the smaller deals it compares against (shared through the run's memo), never this one.
 */
export function refuses(
  ctx: SearchContext,
  team: Team,
  give: PlayerSeries[],
  get: PlayerSeries[]
): boolean {
  // Every prune rests on "more players never total less", which holds unless a negative value
  // could be forced into a slot (`SearchContext.slack`).
  if (ctx.slack(team.rosterId, get) !== 0) return false
  const ratio = marketRatio({
    marketGive: marketSum(ctx.build, give).total,
    marketGet: marketSum(ctx.build, get).total
  })
  // Nothing it gets can start for it, so its delta cannot be positive — and the market can't
  // carry the deal either (6b's rule, now for every team).
  if (ratio < MARKET_FAIR && !get.some((s) => ctx.enters(team.rosterId, s))) return true
  if (give.length === 2) {
    for (const one of give) {
      // Plan M generalized: giving both can only do worse than giving one of them for the same
      // players — when that smaller deal needs no drops, its after-roster contains this one's and
      // it gives less market value. Solved now when unknown: it is shared and usually decisive.
      const smaller = sideOf(ctx, team, [one], get)
      if (
        smaller.drops.length === 0 &&
        acceptanceOf(smaller.delta, marketRatio(smaller), smaller.deltaPerWeek) === null
      ) {
        return true
      }
    }
  }
  return false
}

/** Spec §3.3: whether `team` takes `get` for `give` — the prunes first, then 6b's acceptance on the memoized side. */
export function accepts(
  ctx: SearchContext,
  team: Team,
  give: PlayerSeries[],
  get: PlayerSeries[]
): Accepted | null {
  if (refuses(ctx, team, give, get)) return null
  const core = sideOf(ctx, team, give, get)
  const acceptance = acceptanceOf(core.delta, marketRatio(core), core.deltaPerWeek)
  return acceptance === null ? null : { core, acceptance }
}
```

Remove the `sideKey` import if it becomes unused.

- [ ] **Step 3: Let the queue ask C first**

In `src/main/trade/mySides.ts`, `mySideQueue` gains a fourth parameter and its doc comment a sentence:

```ts
export function mySideQueue(
  ctx: SearchContext,
  query: TradeSuggestQuery,
  kMax: number,
  /** Up to 2 teams only: C's refusal of the 2-team deal, asked before my side is solved. */
  refuse?: (side: MySide) => boolean
): MySideQueue {
```

and in `next()`, first thing for a bound entry:

```ts
if (refuse?.(e.side) === true) {
  discarded++
  continue
}
```

(before the `boundedOut` check).

In `src/main/trade/suggest.ts`, import `refuses` from `./bridge` and build the queue as:

```ts
// Spec §3.3 at two teams: a my side has one deal, so C's refusal settles it before my side is
// solved. With a bridge, C receives something else and the side may still work.
const queue = mySideQueue(
  ctx,
  query,
  kMax,
  kMax === 2 ? (side) => refuses(ctx, side.c, side.z, side.x) : undefined
)
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/main/trade`
Expected: PASS — including `suggestProperty.test.ts` (the oracle comparison is the proof these stay exact) and the bridge brute force.

- [ ] **Step 5: Verify and commit**

```bash
npm run typecheck && npm run lint && npm test
npx prettier --write src/main/trade/bridge.ts src/main/trade/mySides.ts src/main/trade/suggest.ts tests/main/trade/bridge.test.ts tests/main/trade/mySides.test.ts
git add src/main/trade tests/main/trade
git commit -m "perf(trade): refuse deals before solving them"
```

---

### Task 14: A bound for getting two players

Gate remedy 2 (profile §6, item 3). With nothing below zero, a team's weekly lineup value is a max-weight matching with slot-independent values — a weighted matroid rank, monotone and submodular — so a pair adds at most what each player adds alone. That refuses most "get two for one" checks after three shared solves.

**Files:**

- Modify: `src/main/trade/bridge.ts` (`refuses`)
- Test: `tests/main/trade/bridge.test.ts`

**Interfaces:**

- Consumes: Task 13's `refuses`. Produces: `BOUND_SLACK = 0.05` (exported from `bridge.ts`).

- [ ] **Step 1: Write the failing test**

Add to the `refuses` `describe` in `tests/main/trade/bridge.test.ts`:

```ts
it('bounds a received pair by its two singles when nothing is below zero', () => {
  const ctx = searchContext(build, null)
  const [c4, a2, b3] = ['c4', 'a2', 'b3'].map((id) => player(ctx, id))
  // Three gives c4 (its only WR) for a2 + b3. a2 starts at RB, so the "can't start" prune
  // does not apply; but a2 alone is −16, b3 alone −36, nothing at all −36: the pair is at most
  // −16 and the market (1 200 for 3 000) is short — refused without solving the pair.
  expect(refuses(ctx, team(ctx, 3), [c4], [a2, b3])).toBe(true)
  expect(ctx.memo.has(sideKey(3, [c4], [a2]))).toBe(true)
  expect(ctx.memo.has(sideKey(3, [c4], [b3]))).toBe(true)
  expect(ctx.memo.has(sideKey(3, [c4], []))).toBe(true)
  expect(ctx.memo.has(sideKey(3, [c4], [a2, b3]))).toBe(false)
  // Two gives b1 for a4 + a3: a4 alone is +2, so the bound (+2) allows it — and indeed Two
  // gains with the pair (drops b3, starts a4 at TE).
  const [b1, a4, a3] = ['b1', 'a4', 'a3'].map((id) => player(ctx, id))
  expect(refuses(ctx, team(ctx, 2), [b1], [a4, a3])).toBe(false)
})
```

Run: `npx vitest run tests/main/trade/bridge.test.ts -t "received pair"`
Expected: FAIL — the pair is not refused (or is solved).

- [ ] **Step 2: Add the bound to `refuses`**

In `src/main/trade/bridge.ts`, import `ACCEPT_LOSS_PER_WEEK` with `acceptanceOf` from `./thresholds`, add above `refuses`:

```ts
/**
 * Rounding headroom for the pair bound: each delta is rounded to the cent (±0.005), the bound sums
 * three of them and the pair's own delta is rounded again — 0.02 at most; 0.05 to spare.
 */
export const BOUND_SLACK = 0.05
```

and, in `refuses`, after the `give.length === 2` block:

```ts
if (get.length === 2) {
  // With nothing below zero the weekly optimum is monotone and submodular in the roster, so the
  // pair adds at most what each player adds alone: Δ(pair) ≤ Δ(h1) + Δ(h2) − Δ(nothing), valid
  // when neither single needs a drop (drops only lower the pair's own total).
  const one = sideOf(ctx, team, give, [get[0]])
  const two = sideOf(ctx, team, give, [get[1]])
  if (one.drops.length === 0 && two.drops.length === 0) {
    const none = sideOf(ctx, team, give, [])
    const bound = one.delta + two.delta - none.delta + BOUND_SLACK
    const lineupFails = bound <= 0
    const marketFails =
      ratio < MARKET_FAIR || bound / ctx.weeks.length + 0.01 < -ACCEPT_LOSS_PER_WEEK
    if (lineupFails && marketFails) return true
  }
}
```

- [ ] **Step 3: Run the tests**

Run: `npx vitest run tests/main/trade`
Expected: PASS — the property test against the oracle stays green (seven leagues, negative values included).

- [ ] **Step 4: Verify and commit**

```bash
npm run typecheck && npm run lint && npm test
npx prettier --write src/main/trade/bridge.ts tests/main/trade/bridge.test.ts
git add src/main/trade/bridge.ts tests/main/trade/bridge.test.ts
git commit -m "perf(trade): bound received pairs by their singles"
```

---

### Task 15: A faster exact lineup solver

Gate remedy 3 (profile §6, item 4). `optimalLineup` builds a dense (slots + players)² matrix for the Hungarian algorithm; the lineup is a max-weight basis of a transversal matroid, which a greedy pass finds exactly: players by `byValueDesc`, each kept when the kept set can still be seated (augmenting path). Same objective — fill every slot it can, then the highest total — about 9× faster per call. The whole app uses this solver; only a tie between exactly equal values can pick a different, equally good set (and `byValueDesc` makes the greedy's choice independent of input order).

**Files:**

- Modify: `src/main/lineup/optimal.ts`
- Create: `tests/main/lineup/hungarianReference.ts` (the old solver, test-only)
- Test: `tests/main/lineup/optimal.test.ts`

**Interfaces:**

- `optimalLineup(slots, candidates): Optimal` keeps its signature and contract (starters one per slot in slot order, re-seated by `placeDeterministically`; `total` rounded; `bench` = everyone not chosen, `byValueDesc`). `assign` leaves `src` (moved to the test reference).

- [ ] **Step 1: Keep the old solver as a test reference**

Create `tests/main/lineup/hungarianReference.ts` with the current `assign` and the current body of `optimalLineup` (renamed `hungarianLineup`), copied verbatim from `src/main/lineup/optimal.ts`, plus the `FORBIDDEN` / `EMPTY_SLOT` constants they use. It imports `byValueDesc`, `round2` and the types from the source modules; `placeDeterministically` is private to `optimal.ts`, so the reference returns `starters: raw` — the tests compare totals and chosen sets, not seats. Move the existing `describe('assign', …)` test to target the reference's `assign`.

- [ ] **Step 2: Write the failing equivalence test**

Append to `tests/main/lineup/optimal.test.ts` (import `hungarianLineup` from `./hungarianReference`; reuse the file's existing random-roster helpers if it has them, otherwise build rosters inline with a seeded `rng` from `../../fixtures/synthetic`):

```ts
describe('optimalLineup equals the Hungarian reference', () => {
  it('on 5 000 random rosters: same total; same starters whenever values are distinct', () => {
    const r = rng(11)
    const positions = ['QB', 'RB', 'WR', 'TE', 'K', 'DEF', 'LB']
    const shapes = [
      lineupSlotsOf(['QB', 'RB', 'RB', 'WR', 'WR', 'TE', 'FLEX', 'K', 'DEF']),
      lineupSlotsOf(['QB', 'RB', 'WR', 'WR', 'FLEX', 'FLEX', 'SUPER_FLEX']),
      lineupSlotsOf(['RB', 'WR', 'FLEX'])
    ]
    for (let n = 0; n < 5000; n++) {
      const slots = shapes[n % shapes.length]
      const distinct = n % 2 === 0
      const candidates = Array.from({ length: 4 + Math.floor(r() * 14) }, (_, i) => ({
        id: `p${i}`,
        name: `P${i}`,
        position: r() < 0.05 ? null : positions[Math.floor(r() * positions.length)],
        // odd rosters draw from few values (ties) and some negatives
        value: distinct ? Math.round(r() * 3000) / 100 + i / 1e4 : Math.round(r() * 8) - 2
      }))
      const fast = optimalLineup(slots, candidates)
      const slow = hungarianLineup(slots, candidates)
      expect({ n, total: fast.total }).toEqual({ n, total: slow.total })
      if (distinct) {
        const ids = (o: { starters: { player: { id: string } | null }[] }): string[] =>
          o.starters.flatMap((p) => (p.player ? [p.player.id] : [])).sort()
        expect({ n, starters: ids(fast) }).toEqual({ n, starters: ids(slow) })
      }
    }
  })
})
```

`lineupSlotsOf(positions)` stands for however the file already builds `LineupSlot[]` from roster positions (it tests `lineupSlots` — use that function with the shape the existing tests pass it); adjust the helper name to what exists. Note `value: … + i / 1e4` keeps distinct rosters tie-free; values are not rounded to cents there, which is fine for the solver.

Run: `npx vitest run tests/main/lineup/optimal.test.ts`
Expected: PASS already (both are the Hungarian) — this is the safety net for Step 3, so also run it once with the next step's change to see it stay green.

- [ ] **Step 3: Replace the Hungarian with the greedy**

In `src/main/lineup/optimal.ts`, replace `optimalLineup`'s body (and delete `assign`, `FORBIDDEN`, `EMPTY_SLOT` when nothing else uses them) with:

```ts
/**
 * Spec §2.4: the optimal lineup — every slot it can fill filled, then the highest total. The sets
 * of players that can be seated together form a (transversal) matroid, so a greedy pass is exact:
 * players best first (`byValueDesc`), each kept when the kept set can still be seated (an
 * augmenting path over the slots). Ties resolve by `byValueDesc`, whatever the input order.
 */
export function optimalLineup(slots: LineupSlot[], candidates: Candidate[]): Optimal {
  const order = [...candidates].sort(byValueDesc)
  const eligible: number[][] = order.map((c) =>
    slots.flatMap((slot, i) =>
      c.position !== null && slot.eligible.includes(c.position) ? [i] : []
    )
  )
  /** The kept player seated in each slot (index into `order`), −1 when empty. */
  const seat = new Array<number>(slots.length).fill(-1)
  const chosen: Candidate[] = []
  for (let j = 0; j < order.length && chosen.length < slots.length; j++) {
    if (eligible[j].length === 0) continue
    const seen = new Array<boolean>(slots.length).fill(false)
    const place = (p: number): boolean => {
      for (const i of eligible[p]) {
        if (seen[i]) continue
        seen[i] = true
        if (seat[i] === -1 || place(seat[i])) {
          seat[i] = p
          return true
        }
      }
      return false
    }
    if (place(j)) chosen.push(order[j])
  }
  const raw: Placed[] = slots.map((slot, i) => ({
    slot: slot.slot,
    player: seat[i] >= 0 ? order[seat[i]] : null
  }))
  const chosenIds = new Set(chosen.map((c) => c.id))
  return {
    starters: placeDeterministically(slots, chosen) ?? raw,
    total: round2(chosen.reduce((sum, c) => sum + c.value, 0)) ?? 0,
    bench: candidates.filter((c) => !chosenIds.has(c.id)).sort(byValueDesc)
  }
}
```

- [ ] **Step 4: Run everything and account for every changed expectation**

Run: `npx vitest run tests/main/lineup/optimal.test.ts` — green, then `npm test`.

Any other test whose expectation changes must be explained as an exact tie (two players with the same value for the slot); write each case in the report (test, players, values). Fix such a test only by asserting the tie-independent fact (total, or either-of), never by pinning the new pick. A change that is **not** a tie is a bug — stop and report it.

- [ ] **Step 5: Verify and commit**

```bash
npm run typecheck && npm run lint && npm test
npx prettier --write src/main/lineup/optimal.ts tests/main/lineup/optimal.test.ts tests/main/lineup/hungarianReference.ts
git add src/main/lineup/optimal.ts tests/main/lineup
git commit -m "perf(lineup): solve lineups with an exact greedy"
```

---

### Task 16: Measure again

The gate after the remedies. Same measurements as Task 6 Steps 2–3 (the budget, and the throwaway `tests/zz-search.test.ts` on a fresh copy of the dev DB — never committed, deleted after; print the window and every team's `slack` too).

- [ ] **Step 1: Re-run the budget and the real league**

Run `npm run test:budget` (use `--silent=false` on the trade budget file to see every line) and the throwaway real-league test. Record every line.

- [ ] **Step 2: Set the first-card budget**

In `tests/main/trade/suggestBudget.test.ts`, set `FIRST_CARD_MS` to 1.5 × the slowest measured synthetic "up to 3 teams" first card, rounded up to the next 1 000 ms, and change its comment to say it is a regression ceiling measured on 2026-10-02 (the UX target is the real-league gate below). Commit:

```bash
npx prettier --write tests/main/trade/suggestBudget.test.ts
git add tests/main/trade/suggestBudget.test.ts
git commit -m "test(trade): reset the first-card budget"
```

- [ ] **Step 3: Gate 2**

Expected from the prototypes: up to 2 / any team ≈ 1.9 s; up to 3 / any team first card ≈ 19 s, final ≈ 25 s. **Continue to Task 7** when, on the real league, up to 2 / any team finishes within 5 s **and** up to 3 / any team shows its first card within 30 s and finishes within 60 s. Otherwise stop and report the numbers to the user. Either way, replace the plan's Status line with the new numbers and commit it as `docs(plan): record plan R second gate`.

---

### Task 7: The streaming worker

The engine worker learns to stream (spec §4.1): it runs `suggestDeals` and posts batched updates — cards in order, the latest progress, then `done` or `error`.

**Files:**

- Modify: `src/shared/types.ts` (streaming types)
- Modify: `src/main/engine/jobs.ts` (`StreamJob`, `StreamInput`, `BATCH_MS`, `runStreamJob`)
- Modify: `src/main/engine/worker.ts`
- Modify: `src/main/engine/runEngine.ts` (`StreamHandle`, `runEngineStream`)
- Test: `tests/main/engine/jobs.test.ts`

**Interfaces:**

- Consumes: Task 5's `suggestDeals`, `SearchProgress`.
- Produces:
  - `src/shared/types.ts`: `SuggestProgress { checked; total; found; size; elapsedMs }`; `SuggestDoneReason = 'complete' | 'full' | 'stopped' | 'stale'`; `SuggestUpdate` (`cards` / `progress` / `done` / `error`, no run id); `SuggestEvent = SuggestUpdate & { runId: number }`; `SuggestStatus = 'running' | SuggestDoneReason | 'error'`; `SuggestSnapshot { runId; query; cards; progress; status; message: string | null }`.
  - `jobs.ts`: `StreamJob = { kind: 'tradeSuggest'; query: TradeSuggestQuery }`; `StreamInput { dbPath; leagueId; stream: StreamJob }`; `BATCH_MS = 250`; `runStreamJob(input: StreamInput, post: (update: SuggestUpdate) => void, now?: () => number): void`.
  - `runEngine.ts`: `StreamHandle { stop(): void }`; `runEngineStream(dbPath: string, leagueId: string, job: StreamJob, onUpdate: (update: SuggestUpdate) => void): StreamHandle`.

- [ ] **Step 1: Add the streaming types**

In `src/shared/types.ts`, after `TradeSuggestion`:

```ts
/** Multi-team spec §4.1: how far a suggestion run has got. */
export interface SuggestProgress {
  /** My sides resolved: discarded on their bound, failed the stance, or searched. */
  checked: number
  /** My-side candidates after the market precheck. */
  total: number
  /** Cards so far. */
  found: number
  /** The deal size being tried for the current my side. */
  size: number
  elapsedMs: number
}

/** `complete`: every idea checked; `full`: the best 30 found; `stopped`: by the user; `stale`: league data changed. */
export type SuggestDoneReason = 'complete' | 'full' | 'stopped' | 'stale'

/** What the engine worker posts during a run; the run manager adds the run id. */
export type SuggestUpdate =
  | { type: 'cards'; cards: TradeSuggestion[] }
  | { type: 'progress'; progress: SuggestProgress }
  | { type: 'done'; reason: SuggestDoneReason; progress: SuggestProgress }
  | { type: 'error'; message: string }

/** Spec §4.1: one run's update as main sends it to the renderer. */
export type SuggestEvent = SuggestUpdate & { runId: number }

export type SuggestStatus = 'running' | SuggestDoneReason | 'error'

/** Spec §4.2: the active or last run, for a screen that (re)attaches. */
export interface SuggestSnapshot {
  runId: number
  query: TradeSuggestQuery
  cards: TradeSuggestion[]
  progress: SuggestProgress
  status: SuggestStatus
  /** The error text when `status` is `error`. */
  message: string | null
}
```

- [ ] **Step 2: Write the failing tests**

In `tests/main/engine/jobs.test.ts`, extend the imports (`runStreamJob` from `@main/engine/jobs`; `collectDeals` is already imported since Task 5; `TRIANGLE_LEAGUE` from the synthetic fixture; `import type { SuggestUpdate } from '@shared/types'`) and append:

```ts
describe('runStreamJob (the streaming worker body)', () => {
  const cardsOf = (posted: SuggestUpdate[]): Extract<SuggestUpdate, { type: 'cards' }>[] =>
    posted.filter((u): u is Extract<SuggestUpdate, { type: 'cards' }> => u.type === 'cards')

  it('posts every card in order, batched, then done with the final progress', () => {
    const path = join(dir, 'stream-trade.db')
    const { db, build } = syntheticBuild(TRIANGLE_LEAGUE, path)
    db.close()
    const query = {
      season: SEASON,
      focus: null,
      stance: 'overpay' as const,
      maxTeams: 3,
      mustInclude: null
    }
    const posted: SuggestUpdate[] = []
    let clock = 0
    runStreamJob(
      { dbPath: path, leagueId: 'L1', stream: { kind: 'tradeSuggest', query } },
      (u) => posted.push(u),
      () => (clock += 100) // every reading of the clock is 100 ms later
    )
    const expected = collectDeals(build, query).cards
    expect(expected.length).toBeGreaterThan(1)
    const batches = cardsOf(posted)
    expect(batches.flatMap((b) => b.cards)).toEqual(expected)
    expect(batches[0].cards).toHaveLength(1) // the first card goes out at once, alone
    expect(posted.some((u) => u.type === 'progress')).toBe(true)
    const done = posted[posted.length - 1]
    expect(done).toMatchObject({ type: 'done', reason: 'complete' })
    if (done.type === 'done') {
      expect(done.progress.found).toBe(expected.length)
      expect(done.progress.checked).toBe(done.progress.total)
      expect(done.progress.elapsedMs).toBeGreaterThan(0)
    }
  })

  it('posts the search error as an error update', () => {
    const path = join(dir, 'stream-bad.db')
    syntheticBuild(TRIANGLE_LEAGUE, path).db.close()
    const posted: SuggestUpdate[] = []
    runStreamJob(
      {
        dbPath: path,
        leagueId: 'L1',
        stream: {
          kind: 'tradeSuggest',
          query: { season: SEASON, focus: null, stance: 'fair', maxTeams: 3, mustInclude: 9 }
        }
      },
      (u) => posted.push(u)
    )
    expect(posted).toEqual([{ type: 'error', message: 'Must include another team in this league' }])
  })
})
```

Run: `npx vitest run tests/main/engine/jobs.test.ts`
Expected: FAIL — `runStreamJob` is not exported.

- [ ] **Step 3: Implement `runStreamJob`**

In `src/main/engine/jobs.ts`, add imports:

```ts
import { openDatabase } from '@main/db/connection'
import { lineupBuildFromDb } from '@main/engine/lineupFromDb'
import type { LineupBuild } from '@main/lineup/build'
import { suggestDeals, type SearchProgress } from '@main/trade/suggest'
```

(extend the `@shared/types` import with `SuggestProgress`, `SuggestUpdate`) and append:

```ts
/** Multi-team spec §4.1: the suggestion search, streamed. */
export type StreamJob = { kind: 'tradeSuggest'; query: TradeSuggestQuery }

export interface StreamInput {
  dbPath: string
  leagueId: string
  stream: StreamJob
}

/** Spec §4.1: at most one post per this many ms — except the first card, which goes out at once. */
export const BATCH_MS = 250

function buildFromDb(dbPath: string, leagueId: string, season: number): LineupBuild {
  const db = openDatabase(dbPath)
  try {
    return lineupBuildFromDb(db, leagueId, season)
  } finally {
    db.close()
  }
}

/**
 * The streaming worker's body: runs the search on its own connection and posts batched updates —
 * the cards in order with the latest progress, then `done` with the final progress, or `error`.
 */
export function runStreamJob(
  input: StreamInput,
  post: (update: SuggestUpdate) => void,
  now: () => number = () => performance.now()
): void {
  const started = now()
  let latest: SearchProgress = { checked: 0, total: 0, found: 0, size: 2 }
  let pending: TradeSuggestion[] = []
  let lastPost = started
  let firstCard = true
  const stamped = (): SuggestProgress => ({ ...latest, elapsedMs: Math.round(now() - started) })
  const flushCards = (): void => {
    if (pending.length === 0) return
    post({ type: 'cards', cards: pending })
    pending = []
  }
  try {
    const { query } = input.stream
    const search = suggestDeals(buildFromDb(input.dbPath, input.leagueId, query.season), query)
    let step = search.next()
    while (!step.done) {
      const event = step.value
      let urgent = false
      if (event.type === 'card') {
        pending.push(event.card)
        urgent = firstCard
        firstCard = false
      } else {
        latest = event.progress
      }
      if (urgent || now() - lastPost >= BATCH_MS) {
        flushCards()
        post({ type: 'progress', progress: stamped() })
        lastPost = now()
      }
      step = search.next()
    }
    flushCards()
    post({ type: 'done', reason: step.value, progress: stamped() })
  } catch (err) {
    flushCards()
    post({ type: 'error', message: err instanceof Error ? err.message : String(err) })
  }
}
```

- [ ] **Step 4: Route stream inputs in the worker entry**

Replace `src/main/engine/worker.ts`:

```ts
import { parentPort, workerData } from 'node:worker_threads'
import { runJob, runStreamJob, type EngineInput, type EngineOutput, type StreamInput } from './jobs'

/** Worker entry, bundled to `out/main/engineWorker.js`: a one-shot job answers once; a stream posts until done. */
const input = workerData as EngineInput | StreamInput
if ('stream' in input) {
  runStreamJob(input, (update) => parentPort?.postMessage(update))
} else {
  let output: EngineOutput
  try {
    output = { result: runJob(input) }
  } catch (err) {
    output = { error: err instanceof Error ? err.message : String(err) }
  }
  parentPort?.postMessage(output)
}
```

- [ ] **Step 5: Add `runEngineStream`**

In `src/main/engine/runEngine.ts`, extend the `./jobs` import with `StreamInput`, `StreamJob`, add `import type { SuggestUpdate } from '@shared/types'`, and append:

```ts
/** Multi-team spec §4.1: a running stream; `stop()` terminates its worker. */
export interface StreamHandle {
  stop(): void
}

/**
 * The suggestion search streams: its worker posts updates until `done` or `error`. A worker error
 * or an unexpected exit becomes an `error` update; after `stop()` nothing more is delivered.
 */
export function runEngineStream(
  dbPath: string,
  leagueId: string,
  job: StreamJob,
  onUpdate: (update: SuggestUpdate) => void
): StreamHandle {
  const workerData: StreamInput = { dbPath, leagueId, stream: job }
  const worker = new Worker(workerPath(), { workerData })
  let over = false
  const end = (): void => {
    if (over) return
    over = true
    void worker.terminate()
  }
  worker.on('message', (update: SuggestUpdate) => {
    if (over) return
    onUpdate(update)
    if (update.type === 'done' || update.type === 'error') end()
  })
  worker.on('error', (err) => {
    if (over) return
    onUpdate({ type: 'error', message: err.message })
    end()
  })
  worker.on('exit', (code) => {
    if (over) return
    over = true
    onUpdate({
      type: 'error',
      message: `Background calculation stopped unexpectedly (exit ${code})`
    })
  })
  return { stop: end }
}
```

- [ ] **Step 6: Verify and commit**

Run: `npm run typecheck && npm run lint && npm test` — green. Then `npm run build` once: it must still emit `out/main/engineWorker.js` (the worker entry changed).

```bash
npx prettier --write src/shared/types.ts src/main/engine/jobs.ts src/main/engine/worker.ts src/main/engine/runEngine.ts tests/main/engine/jobs.test.ts
git add src/shared/types.ts src/main/engine tests/main/engine/jobs.test.ts
git commit -m "feat(engine): stream the suggestion search"
```

---

### Task 8: The run manager and its channels

Main owns one active run (spec §4.2): start (stopping the previous one), stop, snapshot, `stale` when league data changes; every update is forwarded to the renderer with its run id. `trade:suggest` stays until the screen moves over in Task 11.

**Files:**

- Create: `src/shared/suggestRun.ts`
- Create: `src/main/trade/suggestRun.ts`
- Modify: `src/shared/ipc.ts`, `src/preload/index.ts`, `src/main/ipc/handlers.ts`
- Test: `tests/shared/suggestRun.test.ts`, `tests/main/trade/suggestRun.test.ts`

**Interfaces:**

- Consumes: Task 7's types and `StreamHandle`, `runEngineStream`.
- Produces:
  - `src/shared/suggestRun.ts`: `EMPTY_PROGRESS: SuggestProgress` (`size: 2`, everything else 0); `applyUpdate(snap: SuggestSnapshot, update: SuggestUpdate): SuggestSnapshot` — the run manager and the screen apply updates the same way.
  - `src/main/trade/suggestRun.ts`: `SuggestRunDeps { start(query, onUpdate): StreamHandle; send(event: SuggestEvent): void }`; `SuggestRuns { start(query): number; stop(): void; stale(): void; snapshot(): SuggestSnapshot | null }`; `suggestRuns(deps: SuggestRunDeps): SuggestRuns`.
  - IPC: `trade:suggestStart(query) → runId`, `trade:suggestStop()`, `trade:suggestSnapshot() → SuggestSnapshot | null`, event `trade:suggestEvent`; preload `api.trade.suggestStart / suggestStop / suggestSnapshot / onSuggestEvent(listener) → unsubscribe`.

- [ ] **Step 1: Write the failing tests**

Create `tests/shared/suggestRun.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { applyUpdate, EMPTY_PROGRESS } from '@shared/suggestRun'
import type { SuggestSnapshot } from '@shared/types'
import { tradeSuggestion } from '../fixtures/trade'

const running: SuggestSnapshot = {
  runId: 4,
  query: { season: 2026, focus: null, stance: 'fair', maxTeams: 3, mustInclude: null },
  cards: [],
  progress: EMPTY_PROGRESS,
  status: 'running',
  message: null
}
const progress = { checked: 5, total: 9, found: 1, size: 3, elapsedMs: 1200 }

describe('applyUpdate (spec §4)', () => {
  it('appends cards, replaces progress and ends on done or error', () => {
    const card = tradeSuggestion()
    const withCards = applyUpdate(running, { type: 'cards', cards: [card, card] })
    expect(withCards.cards).toEqual([card, card])
    expect(applyUpdate(withCards, { type: 'cards', cards: [card] }).cards).toHaveLength(3)
    expect(applyUpdate(running, { type: 'progress', progress }).progress).toEqual(progress)
    expect(applyUpdate(running, { type: 'done', reason: 'full', progress })).toMatchObject({
      status: 'full',
      progress
    })
    expect(applyUpdate(running, { type: 'error', message: 'boom' })).toMatchObject({
      status: 'error',
      message: 'boom'
    })
    expect(running.cards).toEqual([]) // never mutated
  })
})
```

Create `tests/main/trade/suggestRun.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { suggestRuns } from '@main/trade/suggestRun'
import type { SuggestEvent, SuggestUpdate, TradeSuggestQuery } from '@shared/types'
import { tradeSuggestion } from '../../fixtures/trade'

const QUERY: TradeSuggestQuery = {
  season: 2026,
  focus: null,
  stance: 'fair',
  maxTeams: 3,
  mustInclude: null
}
const PROGRESS = { checked: 3, total: 10, found: 1, size: 3, elapsedMs: 900 }

/** A run manager over a stubbed stream: each start is recorded with its update callback. */
function setup(): {
  runs: ReturnType<typeof suggestRuns>
  streams: { query: TradeSuggestQuery; push: (u: SuggestUpdate) => void; stopped: boolean }[]
  sent: SuggestEvent[]
} {
  const streams: {
    query: TradeSuggestQuery
    push: (u: SuggestUpdate) => void
    stopped: boolean
  }[] = []
  const sent: SuggestEvent[] = []
  const runs = suggestRuns({
    start: (query, onUpdate) => {
      const stream = { query, push: onUpdate, stopped: false }
      streams.push(stream)
      return {
        stop: (): void => {
          stream.stopped = true
        }
      }
    },
    send: (event) => sent.push(event)
  })
  return { runs, streams, sent }
}

describe('suggestRuns (spec §4.2)', () => {
  it('has nothing to show before the first run', () => {
    expect(setup().runs.snapshot()).toBeNull()
  })

  it('starts a run, forwards its updates with the run id and keeps the snapshot', () => {
    const { runs, streams, sent } = setup()
    const runId = runs.start(QUERY)
    expect(runId).toBe(1)
    expect(runs.snapshot()).toMatchObject({ runId: 1, query: QUERY, cards: [], status: 'running' })
    const card = tradeSuggestion()
    streams[0].push({ type: 'cards', cards: [card] })
    streams[0].push({ type: 'progress', progress: PROGRESS })
    expect(sent).toEqual([
      { runId: 1, type: 'cards', cards: [card] },
      { runId: 1, type: 'progress', progress: PROGRESS }
    ])
    expect(runs.snapshot()).toMatchObject({ cards: [card], progress: PROGRESS })
    streams[0].push({ type: 'done', reason: 'complete', progress: PROGRESS })
    expect(runs.snapshot()?.status).toBe('complete')
    // a finished run has nothing to stop
    runs.stop()
    expect(streams[0].stopped).toBe(false)
    expect(sent).toHaveLength(3)
  })

  it('stops the active run, keeps its cards and drops anything it sends afterwards', () => {
    const { runs, streams, sent } = setup()
    runs.start(QUERY)
    const card = tradeSuggestion()
    streams[0].push({ type: 'cards', cards: [card] })
    runs.stop()
    expect(streams[0].stopped).toBe(true)
    expect(sent[sent.length - 1]).toEqual({
      runId: 1,
      type: 'done',
      reason: 'stopped',
      progress: { checked: 0, total: 0, found: 0, size: 2, elapsedMs: 0 }
    })
    streams[0].push({ type: 'cards', cards: [card] })
    expect(runs.snapshot()).toMatchObject({ status: 'stopped', cards: [card] })
    expect(sent).toHaveLength(2)
  })

  it('supersedes the active run on a new start', () => {
    const { runs, streams, sent } = setup()
    runs.start(QUERY)
    const second = runs.start({ ...QUERY, maxTeams: 2 })
    expect(second).toBe(2)
    expect(streams[0].stopped).toBe(true)
    expect(sent).toEqual([expect.objectContaining({ runId: 1, type: 'done', reason: 'stopped' })])
    streams[0].push({ type: 'cards', cards: [tradeSuggestion()] }) // the old run, late
    expect(runs.snapshot()).toMatchObject({ runId: 2, cards: [], status: 'running' })
    expect(sent).toHaveLength(1)
  })

  it('marks a running search stale when league data changes, and only then', () => {
    const { runs, streams, sent } = setup()
    runs.stale() // nothing running: no-op
    expect(sent).toEqual([])
    runs.start(QUERY)
    runs.stale()
    expect(streams[0].stopped).toBe(true)
    expect(runs.snapshot()?.status).toBe('stale')
    expect(sent[sent.length - 1]).toMatchObject({ runId: 1, type: 'done', reason: 'stale' })
  })

  it('records a worker error, and a start that fails', () => {
    const { runs, streams } = setup()
    runs.start(QUERY)
    streams[0].push({ type: 'error', message: 'Background calculation stopped unexpectedly' })
    expect(runs.snapshot()).toMatchObject({
      status: 'error',
      message: 'Background calculation stopped unexpectedly'
    })
    const failing = suggestRuns({
      start: () => {
        throw new Error('no worker')
      },
      send: () => undefined
    })
    expect(() => failing.start(QUERY)).toThrow('no worker')
    expect(failing.snapshot()).toMatchObject({ status: 'error', message: 'no worker' })
  })
})
```

Run: `npx vitest run tests/shared/suggestRun.test.ts tests/main/trade/suggestRun.test.ts`
Expected: FAIL — modules not found.

- [ ] **Step 2: Write `src/shared/suggestRun.ts`**

```ts
import type { SuggestProgress, SuggestSnapshot, SuggestUpdate } from './types'

/** A run that has not reported yet. */
export const EMPTY_PROGRESS: SuggestProgress = {
  checked: 0,
  total: 0,
  found: 0,
  size: 2,
  elapsedMs: 0
}

/** Multi-team spec §4: a run after one update — main's run manager and the screen apply the same rule. */
export function applyUpdate(snap: SuggestSnapshot, update: SuggestUpdate): SuggestSnapshot {
  switch (update.type) {
    case 'cards':
      return { ...snap, cards: [...snap.cards, ...update.cards] }
    case 'progress':
      return { ...snap, progress: update.progress }
    case 'done':
      return { ...snap, progress: update.progress, status: update.reason }
    case 'error':
      return { ...snap, status: 'error', message: update.message }
  }
}
```

- [ ] **Step 3: Write `src/main/trade/suggestRun.ts`**

```ts
import type { StreamHandle } from '@main/engine/runEngine'
import { applyUpdate, EMPTY_PROGRESS } from '@shared/suggestRun'
import type { SuggestEvent, SuggestSnapshot, SuggestUpdate, TradeSuggestQuery } from '@shared/types'

export interface SuggestRunDeps {
  /** Starts the search; its updates arrive through `onUpdate` until `done`, `error` or `stop()`. */
  start(query: TradeSuggestQuery, onUpdate: (update: SuggestUpdate) => void): StreamHandle
  /** Forwards an event to the renderer. */
  send(event: SuggestEvent): void
}

export interface SuggestRuns {
  /** Starts a run, stopping the active one (`stopped`); returns the new run's id. */
  start(query: TradeSuggestQuery): number
  /** Stops the active run (`stopped`); its cards stay. */
  stop(): void
  /** League data changed under the active run: stops it (`stale`). */
  stale(): void
  /** The active or last run. */
  snapshot(): SuggestSnapshot | null
}

/** Multi-team spec §4.2: main owns one active suggestion run; updates of any other run are dropped. */
export function suggestRuns(deps: SuggestRunDeps): SuggestRuns {
  let lastId = 0
  let snap: SuggestSnapshot | null = null
  let handle: StreamHandle | null = null

  const end = (reason: 'stopped' | 'stale'): void => {
    if (snap === null || snap.status !== 'running') return
    handle?.stop()
    handle = null
    const event: SuggestEvent = { runId: snap.runId, type: 'done', reason, progress: snap.progress }
    snap = applyUpdate(snap, event)
    deps.send(event)
  }

  return {
    start(query: TradeSuggestQuery): number {
      end('stopped')
      const runId = ++lastId
      snap = { runId, query, cards: [], progress: EMPTY_PROGRESS, status: 'running', message: null }
      const onUpdate = (update: SuggestUpdate): void => {
        if (snap === null || snap.runId !== runId || snap.status !== 'running') return
        snap = applyUpdate(snap, update)
        if (snap.status !== 'running') handle = null
        deps.send({ ...update, runId })
      }
      try {
        const started = deps.start(query, onUpdate)
        if (snap.runId === runId && snap.status === 'running') handle = started
      } catch (err) {
        snap = applyUpdate(snap, {
          type: 'error',
          message: err instanceof Error ? err.message : String(err)
        })
        throw err
      }
      return runId
    },
    stop: () => end('stopped'),
    stale: () => end('stale'),
    snapshot: () => snap
  }
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run tests/shared/suggestRun.test.ts tests/main/trade/suggestRun.test.ts`
Expected: PASS.

- [ ] **Step 5: Wire the channels**

`src/shared/ipc.ts` — extend the `@shared/types` import with `SuggestEvent`, `SuggestSnapshot`; in `Api.trade`, after `suggest`:

```ts
    /** Multi-team spec §4.2: starts a suggestion run in the engine worker (stopping the active one); resolves to its id. */
    suggestStart(query: TradeSuggestQuery): Promise<number>
    /** Stops the active run; its cards stay. */
    suggestStop(): Promise<void>
    /** The active or last run, for a screen that (re)attaches; null before the first run. */
    suggestSnapshot(): Promise<SuggestSnapshot | null>
    /** Every run's updates; returns the unsubscribe function. */
    onSuggestEvent(listener: (event: SuggestEvent) => void): () => void
```

and in `IPC`, after `tradeSuggest`:

```ts
  tradeSuggestStart: 'trade:suggestStart',
  tradeSuggestStop: 'trade:suggestStop',
  tradeSuggestSnapshot: 'trade:suggestSnapshot',
  tradeSuggestEvent: 'trade:suggestEvent',
```

`src/preload/index.ts` — import the `SuggestEvent` type next to the other `@shared/types` imports and add to `trade`:

```ts
    suggestStart: (query) => ipcRenderer.invoke(IPC.tradeSuggestStart, query),
    suggestStop: () => ipcRenderer.invoke(IPC.tradeSuggestStop),
    suggestSnapshot: () => ipcRenderer.invoke(IPC.tradeSuggestSnapshot),
    onSuggestEvent: (listener) => {
      const handler = (_event: IpcRendererEvent, event: SuggestEvent): void => listener(event)
      ipcRenderer.on(IPC.tradeSuggestEvent, handler)
      return () => {
        ipcRenderer.removeListener(IPC.tradeSuggestEvent, handler)
      }
    },
```

`src/main/ipc/handlers.ts`:

1. Imports: `import { runEngine, runEngineStream } from '@main/engine/runEngine'`, `import { suggestRuns, type SuggestRuns } from '@main/trade/suggestRun'`, and `SuggestSnapshot` in the `@shared/types` import.
2. Above `invalidateCaches`:

```ts
/** Multi-team spec §4.2: the one suggestion run main owns; set when the handlers register. */
let activeRuns: SuggestRuns | null = null
```

3. `invalidateCaches` gains, as its last line:

```ts
// Spec §4.2: league data changed under a running search — its cards stay, marked stale.
activeRuns?.stale()
```

4. In `registerIpcHandlers`, after the `IPC.tradeSuggest` handler:

```ts
const runs = suggestRuns({
  start: (query, onUpdate) => {
    const id = activeLeagueId()
    if (!id) throw new Error('No league imported')
    return runEngineStream(ctx.dbPath, id, { kind: 'tradeSuggest', query }, onUpdate)
  },
  send: (event) => {
    const win = ctx.getWindow()
    if (win && !win.isDestroyed()) win.webContents.send(IPC.tradeSuggestEvent, event)
  }
})
activeRuns = runs

ipcMain.handle(IPC.tradeSuggestStart, (_event, query: TradeSuggestQuery): number => {
  if (!activeLeagueId()) throw new Error('No league imported')
  return runs.start(query)
})
ipcMain.handle(IPC.tradeSuggestStop, (): void => runs.stop())
ipcMain.handle(IPC.tradeSuggestSnapshot, (): SuggestSnapshot | null => runs.snapshot())
```

- [ ] **Step 6: Verify and commit**

Run: `npm run typecheck && npm run lint && npm test` — green.

```bash
npx prettier --write src/shared/suggestRun.ts src/main/trade/suggestRun.ts src/shared/ipc.ts src/preload/index.ts src/main/ipc/handlers.ts tests/shared/suggestRun.test.ts tests/main/trade/suggestRun.test.ts
git add src/shared src/main/trade/suggestRun.ts src/preload/index.ts src/main/ipc/handlers.ts tests/shared/suggestRun.test.ts tests/main/trade/suggestRun.test.ts
git commit -m "feat(trade): own one streamed search run in main"
```

---

### Task 9: Plan Q carry-overs

Small builder fixes Plan Q's final review left for this plan, done before the Suggestions card moves out so it starts from clean ground.

**Files:**

- Modify: `src/renderer/src/lib/tradeView.ts` (`SELECT_CLASS`, `TONE_CLASS`)
- Modify: `src/renderer/src/lib/tradeBuilder.ts` (`sidesInOrder`)
- Modify: `src/renderer/src/components/TradeBuilder.tsx`
- Modify: `src/renderer/src/screens/TradeScreen.tsx`
- Test: `tests/renderer/lib/tradeBuilder.test.ts`, `tests/renderer/components/TradeScreen.test.tsx`

**Interfaces:**

- Produces: `SELECT_CLASS: string`, `TONE_CLASS: Record<'green' | 'red' | 'muted', string>` (`tradeView.ts`); `sidesInOrder(ev: TradeEvaluation, deal: BuilderDeal, me: number): TradeSideResult[]` (`tradeBuilder.ts`); verdict columns carry `role="group"` and `aria-label` `Verdict for me` / `Verdict for <team>`.

- [ ] **Step 1: Write the failing tests**

`tests/renderer/lib/tradeBuilder.test.ts` — import `sidesInOrder` and `threeTeamEvaluation` (from `../../fixtures/trade`), and add:

```ts
describe('sidesInOrder (Plan Q follow-up)', () => {
  it('orders verdict columns as the builder orders its cards', () => {
    const ev = threeTeamEvaluation() // me (1), Rival (2), Tank Mode (3)
    const ids = (deal: BuilderDeal): number[] => sidesInOrder(ev, deal, 1).map((s) => s.rosterId)
    expect(ids({ teams: [3, 2], picks: [] })).toEqual([1, 3, 2])
    expect(ids({ teams: [2, 3], picks: [] })).toEqual([1, 2, 3])
    // a side whose team is not in the row (cannot happen on screen) goes last
    expect(ids({ teams: [3], picks: [] })).toEqual([1, 3, 2])
  })
})
```

(import the `BuilderDeal` type from `@/lib/tradeBuilder` if the file does not already.)

`tests/renderer/components/TradeScreen.test.tsx` — add `act` and `within` to the Testing Library import, `TradeEvaluation` to the type import, and these cases inside `describe('TradeScreen')`:

```ts
  it('drops an evaluate answer that lands after the deal changed', async () => {
    let answer: (ev: TradeEvaluation) => void = () => undefined
    evaluateMock.mockReturnValue(
      new Promise<TradeEvaluation>((resolve) => {
        answer = resolve
      })
    )
    render(<TradeScreen dataVersion={0} />)
    fireEvent.change(await screen.findByLabelText('Add to I send'), { target: { value: '6794' } })
    fireEvent.change(screen.getByLabelText('Add to Rival sends'), { target: { value: '7564' } })
    fireEvent.click(screen.getByText('Evaluate'))
    fireEvent.click(screen.getByLabelText('Remove Justin Jefferson'))
    await act(async () => answer(tradeEvaluation()))
    expect(screen.queryByText('Verdict')).toBeNull()
  })

  it('puts each open-spot line under its own side when the answer comes back reordered', async () => {
    evaluateMock.mockResolvedValue(tradeEvaluation())
    openSpotMock.mockResolvedValue({
      sides: [
        { rosterId: 2, add: null, deltaPerWeek: 0 },
        { rosterId: 1, add: bijan, deltaPerWeek: 0.8 }
      ]
    })
    render(<TradeScreen dataVersion={0} />)
    fireEvent.change(await screen.findByLabelText('Add to I send'), { target: { value: '6794' } })
    fireEvent.change(screen.getByLabelText('Add to Rival sends'), { target: { value: '7564' } })
    fireEvent.click(screen.getByText('Evaluate'))
    const mine = await screen.findByRole('group', { name: 'Verdict for me' })
    expect(
      await within(mine).findByText(`Open spot: best add ${bijan.fullName}, +0.80/wk`)
    ).toBeTruthy()
    expect(
      within(screen.getByRole('group', { name: 'Verdict for Rival' })).getByText(
        'Open spot: no free agent improves this lineup'
      )
    ).toBeTruthy()
  })

  it('orders the verdict columns as the builder’s cards', async () => {
    poolMock.mockResolvedValue(threeTeamPool())
    const [me, rival, tank] = threeTeamEvaluation().sides
    evaluateMock.mockResolvedValue({ ...threeTeamEvaluation(), sides: [me, tank, rival] })
    openSpotMock.mockResolvedValue({ sides: [null, null, null] })
    render(<TradeScreen dataVersion={0} />)
    fireEvent.change(await screen.findByLabelText('Add to I send'), { target: { value: '6794' } })
    fireEvent.change(screen.getByLabelText('Add team'), { target: { value: '3' } })
    fireEvent.change(screen.getByLabelText('Add to Rival sends'), { target: { value: '7564' } })
    fireEvent.change(screen.getByLabelText('Add to Tank Mode sends'), { target: { value: '5859' } })
    fireEvent.change(screen.getByLabelText("Destination of Ja'Marr Chase"), {
      target: { value: '3' }
    })
    fireEvent.click(screen.getByText('Evaluate'))
    await screen.findByText('+6.00 (+0.40/wk)')
    expect(
      screen
        .getAllByRole('group', { name: /^Verdict for/ })
        .map((g) => g.getAttribute('aria-label'))
    ).toEqual(['Verdict for me', 'Verdict for Rival', 'Verdict for Tank Mode'])
  })
```

Run: `npx vitest run tests/renderer/lib/tradeBuilder.test.ts tests/renderer/components/TradeScreen.test.tsx`
Expected: FAIL — `sidesInOrder` missing; no `group` roles; the stale verdict appears.

- [ ] **Step 2: Shared styles**

In `src/renderer/src/lib/tradeView.ts`, after `deltaTone`:

```ts
/** The Trade screen's select styling (builder and suggestions). */
export const SELECT_CLASS =
  'h-8 rounded-md border border-input bg-transparent px-2 text-sm text-foreground dark:bg-input/30'

/** Text colour per `deltaTone`. */
export const TONE_CLASS: Record<ReturnType<typeof deltaTone>, string> = {
  green: 'text-emerald-400',
  red: 'text-red-400',
  muted: 'text-muted-foreground'
}
```

In `TradeBuilder.tsx` and `TradeScreen.tsx`, delete the local `selectClass` and `TONE` constants, import `SELECT_CLASS` / `TONE_CLASS` from `@/lib/tradeView`, and rename every use.

- [ ] **Step 3: Verdict columns in card order**

`src/renderer/src/lib/tradeBuilder.ts` (add `TradeSideResult` to the type import):

```ts
/** Verdict columns in the builder's card order — me, then the teams row; anything else last. */
export function sidesInOrder(
  ev: TradeEvaluation,
  deal: BuilderDeal,
  me: number
): TradeSideResult[] {
  const order = [me, ...deal.teams]
  const rank = (rosterId: number): number => {
    const i = order.indexOf(rosterId)
    return i === -1 ? order.length : i
  }
  return [...ev.sides].sort((a, b) => rank(a.rosterId) - rank(b.rosterId))
}
```

`src/renderer/src/components/TradeBuilder.tsx`:

- `VerdictCard` takes `sides: TradeSideResult[]` beside `ev` and `spots`, and maps `sides` (not `ev.sides`) into `SideVerdict`s; `multi` and the this-week swaps still read `ev.sides`.
- The call site: `{verdict && <VerdictCard ev={verdict} sides={sidesInOrder(verdict, deal, me)} spots={spots} />}` (import `sidesInOrder`).
- `SideVerdict`'s root `div` becomes:

```tsx
    <div
      role="group"
      aria-label={side.isMe ? 'Verdict for me' : `Verdict for ${side.name}`}
      className="space-y-1 text-sm"
    >
```

- [ ] **Step 4: Drop stale evaluate answers**

In `src/renderer/src/screens/TradeScreen.tsx`:

```ts
/** Bumped on every deal change: an evaluate answer for an older deal is dropped. */
const dealSeq = useRef(0)
```

- In the pool effect's `.then`, add `dealSeq.current++` before `setDeal(...)`.
- `changeDeal` becomes:

```ts
const changeDeal = (d: BuilderDeal): void => {
  dealSeq.current++
  setDeal(d)
  setVerdict(null)
  setEvalError(null)
  setEvaluating(false)
}
```

- `evaluate` takes the deal to evaluate and ignores a late answer:

```ts
async function evaluate(d: BuilderDeal = deal): Promise<void> {
  if (season === null || !pool) return
  const seq = dealSeq.current
  setEvaluating(true)
  setEvalError(null)
  try {
    const ev = await api.trade.evaluate(season, proposalFrom(d, pool.me.rosterId))
    if (seq === dealSeq.current) setVerdict(ev)
  } catch (err) {
    if (seq === dealSeq.current) setEvalError(errorMessage(err))
  } finally {
    if (seq === dealSeq.current) setEvaluating(false)
  }
}
```

- `openInBuilder` starts with `changeDeal(dealOf(s.evaluation))` (replacing its `setDeal` and `setEvalError` lines), then `setVerdict(s.evaluation)` and the scroll.

- [ ] **Step 5: Verify and commit**

Run: `npm run typecheck && npm run lint && npm test` — green.

```bash
npx prettier --write src/renderer/src/lib/tradeView.ts src/renderer/src/lib/tradeBuilder.ts src/renderer/src/components/TradeBuilder.tsx src/renderer/src/screens/TradeScreen.tsx tests/renderer/lib/tradeBuilder.test.ts tests/renderer/components/TradeScreen.test.tsx
git add src/renderer tests/renderer
git commit -m "fix(ui): keep trade verdicts in order and current"
```

---

### Task 10: Suggestion view helpers

The pure text and state helpers the live Suggestions card needs (spec §5.2), each tested on its own.

**Files:**

- Modify: `src/renderer/src/lib/tradeView.ts`
- Modify: `src/renderer/src/lib/tradeBuilder.ts` (`dealFromProposal`)
- Modify: `tests/fixtures/trade.ts` (`threeTeamSuggestion`)
- Test: `tests/renderer/lib/tradeView.test.ts`, `tests/renderer/lib/tradeBuilder.test.ts`

**Interfaces:**

- Produces (`tradeView.ts`): `FocusKind = 'none' | 'give' | 'want'`; `SuggestControls { focusKind; focusGive: string; focusWant: string; stance; maxTeams: number; mustInclude: number | null }`; `DEFAULT_CONTROLS`; `queryOf(c: SuggestControls, season: number): TradeSuggestQuery`; `controlsOf(q: TradeSuggestQuery): SuggestControls`; `sameQuery(a, b): boolean`; `teamCountOptions(leagueSize: number): number[]`; `CONTROLS_CHANGED`; `fmtElapsed(ms: number): string`; `suggestStatusLine(snap: SuggestSnapshot): string`; `teamsChip(s): string`; `pathLine(s): string`; `otherSideLine(side: TradeSideResult): string`; `otherWaysLabel(n: number): string`; `alternativeLine(a: TradeAlternative): string`; `acceptanceTags(s, index = 1)` (was always index 1).
- Produces (`tradeBuilder.ts`): `dealFromProposal(proposal: TradeProposal, pool: TradePool): BuilderDeal`.
- Produces (fixture): `threeTeamSuggestion(): TradeSuggestion` — `threeTeamEvaluation()`, `teams: 3`, acceptance `[null, 'lineup', 'market']`, one alternative via Rival sending Bijan Robinson (worst −0.30/wk).

- [ ] **Step 1: Add the fixture**

In `tests/fixtures/trade.ts`, after `threeTeamEvaluation`:

```ts
/** Me → Rival → Tank Mode → me as a search card, with one other way: Rival sends Bijan instead. */
export function threeTeamSuggestion(): TradeSuggestion {
  return {
    evaluation: threeTeamEvaluation(),
    teams: 3,
    acceptance: [null, 'lineup', 'market'],
    alternatives: [
      {
        proposal: {
          moves: [
            { playerId: '6794', to: 2 },
            { playerId: '9509', to: 3 },
            { playerId: '5859', to: 1 }
          ]
        },
        label: 'via Rival: Bijan Robinson',
        worstDeltaPerWeek: -0.3
      }
    ]
  }
}
```

- [ ] **Step 2: Write the failing tests**

Append to `tests/renderer/lib/tradeView.test.ts` (extend its imports with the new names from `@/lib/tradeView`, `threeTeamSuggestion` and `tradeSuggestion` from `../../fixtures/trade`, and the `SuggestSnapshot` type):

```ts
describe('suggestion controls (multi-team spec §5.2)', () => {
  it('turns controls into a query and back', () => {
    expect(queryOf(DEFAULT_CONTROLS, 2026)).toEqual({
      season: 2026,
      focus: null,
      stance: 'fair',
      maxTeams: 3,
      mustInclude: null
    })
    const give = { ...DEFAULT_CONTROLS, focusKind: 'give' as const, focusGive: '4866' }
    expect(queryOf(give, 2026).focus).toEqual({ give: '4866' })
    // "I give" with nobody picked yet is no focus
    expect(queryOf({ ...give, focusGive: '' }, 2026).focus).toBeNull()
    const want = { ...DEFAULT_CONTROLS, focusKind: 'want' as const, focusWant: 'WR' }
    expect(queryOf(want, 2026).focus).toEqual({ want: 'WR' })
    for (const c of [
      DEFAULT_CONTROLS,
      give,
      want,
      { ...DEFAULT_CONTROLS, maxTeams: 4, mustInclude: 7 }
    ]) {
      expect(queryOf(controlsOf(queryOf(c, 2026)), 2026)).toEqual(queryOf(c, 2026))
    }
  })

  it('compares queries and lists the team counts', () => {
    const q = queryOf(DEFAULT_CONTROLS, 2026)
    expect(sameQuery(q, { ...q })).toBe(true)
    expect(sameQuery(q, { ...q, focus: { give: '1' } })).toBe(false)
    expect(sameQuery(q, { ...q, maxTeams: 4 })).toBe(false)
    expect(sameQuery(q, { ...q, mustInclude: 2 })).toBe(false)
    expect(sameQuery(q, { ...q, stance: 'premium' })).toBe(false)
    expect(teamCountOptions(2)).toEqual([2])
    expect(teamCountOptions(5)).toEqual([2, 3, 4, 5])
  })
})

describe('suggestion status line (multi-team spec §5.2)', () => {
  const snap = (over: Partial<SuggestSnapshot>): SuggestSnapshot => ({
    runId: 1,
    query: queryOf(DEFAULT_CONTROLS, 2026),
    cards: [],
    progress: { checked: 412, total: 18900, found: 12, size: 3, elapsedMs: 37_400 },
    status: 'running',
    message: null,
    ...over
  })
  const twelve = Array.from({ length: 12 }, () => tradeSuggestion())

  it('reads each state', () => {
    expect(fmtElapsed(0)).toBe('0:00')
    expect(fmtElapsed(37_400)).toBe('0:37')
    expect(fmtElapsed(725_000)).toBe('12:05')
    expect(suggestStatusLine(snap({ cards: twelve }))).toBe(
      'Searching 3-team deals · 412 of 18 900 ideas checked · 12 found · 0:37'
    )
    expect(suggestStatusLine(snap({ status: 'full', cards: twelve }))).toBe(
      'Done: best 12 found — nothing left could rank higher'
    )
    expect(suggestStatusLine(snap({ status: 'complete', cards: twelve }))).toBe(
      'Done: 12 found, every idea checked'
    )
    expect(suggestStatusLine(snap({ status: 'complete' }))).toBe(
      'No offers at this stance — try overpay'
    )
    expect(suggestStatusLine(snap({ status: 'stopped', cards: twelve }))).toBe(
      'Stopped: 12 found so far'
    )
    expect(suggestStatusLine(snap({ status: 'stale' }))).toBe('League data changed — run again')
    expect(suggestStatusLine(snap({ status: 'error', message: 'boom' }))).toBe(
      'Search failed: boom'
    )
  })
})

describe('suggestion rows (multi-team spec §5.2)', () => {
  it('shows a 3-team card as a path with every other team', () => {
    const s = threeTeamSuggestion()
    expect(teamsChip(s)).toBe('3-team')
    expect(teamsChip(tradeSuggestion())).toBe('2-team')
    expect(pathLine(s)).toBe(
      "I send WR Justin Jefferson → Rival · Rival sends WR Ja'Marr Chase → Tank Mode · Tank Mode sends WR Tee Higgins → me"
    )
    expect(s.evaluation.sides.slice(1).map(otherSideLine)).toEqual([
      'Rival +0.20/wk',
      'Tank Mode -0.10/wk'
    ])
    expect(acceptanceTags(s, 1)).toEqual(['lineup'])
    expect(acceptanceTags(s, 2)).toEqual(['market'])
    expect(acceptanceTags(tradeSuggestion())).toEqual(['market'])
  })

  it('labels the other ways', () => {
    expect(otherWaysLabel(1)).toBe('+1 other way')
    expect(otherWaysLabel(3)).toBe('+3 other ways')
    expect(alternativeLine(threeTeamSuggestion().alternatives[0])).toBe(
      'via Rival: Bijan Robinson · worst side -0.30/wk'
    )
  })
})
```

Append to `tests/renderer/lib/tradeBuilder.test.ts` (import `dealFromProposal`, and `threeTeamPool`, `threeTeamSuggestion` from the fixture):

```ts
describe('dealFromProposal (multi-team spec §5.2)', () => {
  it('rebuilds an alternative’s deal with every source from the pool', () => {
    const { proposal } = threeTeamSuggestion().alternatives[0]
    expect(dealFromProposal(proposal, threeTeamPool())).toEqual({
      teams: [2, 3],
      picks: [
        { playerId: '6794', from: 1, to: 2 },
        { playerId: '9509', from: 2, to: 3 },
        { playerId: '5859', from: 3, to: 1 }
      ]
    })
  })

  it('leaves out a player no longer on any roster', () => {
    expect(
      dealFromProposal({ moves: [{ playerId: 'gone', to: 2 }] }, threeTeamPool()).picks
    ).toEqual([])
  })
})
```

Run: `npx vitest run tests/renderer/lib`
Expected: FAIL — the new names are not exported.

- [ ] **Step 3: Implement the helpers**

In `src/renderer/src/lib/tradeView.ts` — extend the `@shared/types` import with `SuggestSnapshot`, `TradeAlternative`, `TradeFocus`, `TradeSuggestQuery`; change `acceptanceTags`:

```ts
/** Why the team at `index` of the deal would take it (1 = the only other team of a 2-team deal). */
export function acceptanceTags(s: TradeSuggestion, index = 1): string[] {
  const a = s.acceptance[index] ?? null
  return a === null ? [] : a === 'both' ? ['lineup', 'market'] : [a]
}
```

and append:

```ts
export type FocusKind = 'none' | 'give' | 'want'

/** Multi-team spec §5.2: the Suggestions card's controls. */
export interface SuggestControls {
  focusKind: FocusKind
  focusGive: string
  focusWant: string
  stance: TradeStance
  maxTeams: number
  /** null = any team. */
  mustInclude: number | null
}

/** Spec §5.2 defaults: no focus, fair, up to 3 teams, any team. */
export const DEFAULT_CONTROLS: SuggestControls = {
  focusKind: 'none',
  focusGive: '',
  focusWant: 'RB',
  stance: 'fair',
  maxTeams: 3,
  mustInclude: null
}

export function queryOf(c: SuggestControls, season: number): TradeSuggestQuery {
  const focus: TradeFocus =
    c.focusKind === 'give' && c.focusGive !== ''
      ? { give: c.focusGive }
      : c.focusKind === 'want'
        ? { want: c.focusWant }
        : null
  return { season, focus, stance: c.stance, maxTeams: c.maxTeams, mustInclude: c.mustInclude }
}

/** A run's query back into controls — the screen restores them when it re-attaches. */
export function controlsOf(q: TradeSuggestQuery): SuggestControls {
  const base: SuggestControls = {
    ...DEFAULT_CONTROLS,
    stance: q.stance,
    maxTeams: q.maxTeams,
    mustInclude: q.mustInclude
  }
  if (q.focus === null) return base
  return 'give' in q.focus
    ? { ...base, focusKind: 'give', focusGive: q.focus.give }
    : { ...base, focusKind: 'want', focusWant: q.focus.want }
}

/** Whether two queries ask for the same search. */
export function sameQuery(a: TradeSuggestQuery, b: TradeSuggestQuery): boolean {
  return (
    a.season === b.season &&
    a.stance === b.stance &&
    a.maxTeams === b.maxTeams &&
    a.mustInclude === b.mustInclude &&
    JSON.stringify(a.focus) === JSON.stringify(b.focus)
  )
}

/** "Up to" choices: 2 … the league's size. */
export function teamCountOptions(leagueSize: number): number[] {
  return Array.from({ length: Math.max(leagueSize - 1, 1) }, (_, i) => i + 2)
}

export const CONTROLS_CHANGED = 'Controls changed — Find to rerun'

/** "0:37", "12:05" */
export function fmtElapsed(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

/** Spec §5.2: the line under the controls, per run state. */
export function suggestStatusLine(snap: SuggestSnapshot): string {
  const n = snap.cards.length
  switch (snap.status) {
    case 'running': {
      const p = snap.progress
      return `Searching ${p.size}-team deals · ${fmtMarket(p.checked)} of ${fmtMarket(p.total)} ideas checked · ${n} found · ${fmtElapsed(p.elapsedMs)}`
    }
    case 'full':
      return `Done: best ${n} found — nothing left could rank higher`
    case 'complete':
      return n === 0 ? noOffersHint(snap.query.stance) : `Done: ${n} found, every idea checked`
    case 'stopped':
      return `Stopped: ${n} found so far`
    case 'stale':
      return 'League data changed — run again'
    case 'error':
      return `Search failed: ${snap.message ?? 'unknown error'}`
  }
}

/** "3-team" */
export function teamsChip(s: TradeSuggestion): string {
  return `${s.teams}-team`
}

/** Spec §5.2: "I send WR A → Gridiron Gang · Gridiron Gang sends RB B → me" — the sides in send order. */
export function pathLine(s: TradeSuggestion): string {
  const sides = s.evaluation.sides
  const name = (rosterId: number): string => {
    const side = sides.find((x) => x.rosterId === rosterId)
    return !side ? `team ${rosterId}` : side.isMe ? 'me' : side.name
  }
  return sides
    .map((side) => {
      const to = side.give[0]?.to
      const who = side.isMe ? 'I send' : `${side.name} sends`
      return `${who} ${sideNames(side.give)} → ${to === undefined ? '—' : name(to)}`
    })
    .join(' · ')
}

/** "Tank Mode +0.20/wk" — one other team of a 3+-team card. */
export function otherSideLine(side: TradeSideResult): string {
  return `${side.name} ${fmtSigned(side.deltaPerWeek)}/wk`
}

/** "+1 other way" / "+3 other ways" */
export function otherWaysLabel(n: number): string {
  return n === 1 ? '+1 other way' : `+${n} other ways`
}

/** "via Rival: Bijan Robinson · worst side -0.30/wk" */
export function alternativeLine(a: TradeAlternative): string {
  return `${a.label} · worst side ${fmtSigned(a.worstDeltaPerWeek)}/wk`
}
```

In `src/renderer/src/lib/tradeBuilder.ts` — import `dealTeams` from `@shared/deal` next to `dealProblem`, and append:

```ts
/** An alternative's deal (spec §5.2 "Open in builder"): every move with its source from the pool, teams in first appearance. */
export function dealFromProposal(proposal: TradeProposal, pool: TradePool): BuilderDeal {
  const owner = new Map<string, number>()
  for (const team of [pool.me, ...pool.teams]) {
    for (const p of team.players) owner.set(p.playerId, team.rosterId)
  }
  const picks = proposal.moves.flatMap((m) => {
    const from = owner.get(m.playerId)
    return from === undefined ? [] : [{ playerId: m.playerId, from, to: m.to }]
  })
  return { teams: dealTeams(picks).filter((t) => t !== pool.me.rosterId), picks }
}
```

`src/renderer/src/screens/TradeScreen.tsx`: delete its local `FocusKind` type and import it from `@/lib/tradeView`.

- [ ] **Step 4: Verify and commit**

Run: `npm run typecheck && npm run lint && npm test` — green.

```bash
npx prettier --write src/renderer/src/lib/tradeView.ts src/renderer/src/lib/tradeBuilder.ts src/renderer/src/screens/TradeScreen.tsx tests/fixtures/trade.ts tests/renderer/lib/tradeView.test.ts tests/renderer/lib/tradeBuilder.test.ts
git add src/renderer tests/fixtures/trade.ts tests/renderer/lib
git commit -m "feat(ui): add multi-team suggestion view helpers"
```

---

### Task 11: The live Suggestions card

The Suggestions card moves to its own component on a hook that mirrors main's run (spec §5.2): new controls, Find / Stop, the status line, live rows (2-team and k-team), the other ways, re-attach after a tab switch. The one-shot `trade:suggest` goes.

**Files:**

- Create: `src/renderer/src/lib/useSuggestRun.ts`
- Create: `src/renderer/src/components/TradeSuggestions.tsx`
- Modify: `src/renderer/src/screens/TradeScreen.tsx` (replace the whole file)
- Modify: `src/shared/ipc.ts`, `src/preload/index.ts`, `src/main/ipc/handlers.ts`, `src/main/engine/jobs.ts`, `src/main/trade/fromDb.ts` (remove `trade:suggest`)
- Test: `tests/renderer/components/TradeScreen.test.tsx`, `tests/main/engine/jobs.test.ts`

**Interfaces:**

- Consumes: Task 8's IPC (`api.trade.suggestStart / suggestStop / suggestSnapshot / onSuggestEvent`), `applyUpdate`, `EMPTY_PROGRESS`; Task 10's helpers; Task 9's `SELECT_CLASS`, `TONE_CLASS`.
- Produces: `useSuggestRun(season: number | null): SuggestRun` with `SuggestRun { controls; setControls; run: SuggestSnapshot | null; running: boolean; startError: string | null; find(override?: Partial<SuggestControls>): void; stop(): void; prune(pool: TradePool): void }` (`prune` is stable across renders); `TradeSuggestions({ pool, season, suggest, onOpen, onOpenProposal })`.

- [ ] **Step 1: Rewrite the screen's suggestion tests (failing)**

In `tests/renderer/components/TradeScreen.test.tsx`:

1. The api mock's `trade` becomes `{ pool: vi.fn(), evaluate: vi.fn(), openSpot: vi.fn(), suggestStart: vi.fn(), suggestStop: vi.fn(), suggestSnapshot: vi.fn(), onSuggestEvent: vi.fn() }`; drop `suggestMock` and its `beforeEach` lines. Add `threeTeamSuggestion` to the fixture import and `SuggestEvent` to the type import.
2. Add below the existing mocks:

```ts
const startMock = vi.mocked(api.trade.suggestStart)
const stopMock = vi.mocked(api.trade.suggestStop)
const snapshotMock = vi.mocked(api.trade.suggestSnapshot)
const onEventMock = vi.mocked(api.trade.onSuggestEvent)
let emit: (event: SuggestEvent) => void = () => undefined
const unsubscribe = vi.fn()

const PROGRESS = { checked: 412, total: 18900, found: 0, size: 3, elapsedMs: 37_000 }
/** Main sends an event; React re-renders inside act. */
const send = (event: SuggestEvent): void => {
  act(() => emit(event))
}
/** Lets pending promise callbacks (the start's run id, the snapshot) land. */
const flush = async (): Promise<void> => {
  await act(async () => undefined)
}
```

and in `beforeEach`:

```ts
startMock.mockReset()
startMock.mockResolvedValue(7)
stopMock.mockReset()
stopMock.mockResolvedValue(undefined)
snapshotMock.mockReset()
snapshotMock.mockResolvedValue(null)
unsubscribe.mockReset()
onEventMock.mockReset()
onEventMock.mockImplementation((listener) => {
  emit = listener
  return unsubscribe
})
```

3. Replace the two old cases "finds offers and opens one in the builder with the carried numbers" and "carries the focus and stance, scans every team on request, hints on an empty result" with:

```ts
  it('streams cards in live and opens one in the builder with its numbers', async () => {
    const scrollIntoView = vi.fn()
    window.HTMLElement.prototype.scrollIntoView = scrollIntoView
    render(<TradeScreen dataVersion={0} />)
    await screen.findByLabelText('Add to I send')
    expect(screen.getByText('I gain and get ≥ 85 % of the market value I give')).toBeTruthy()

    fireEvent.click(screen.getByText('Find'))
    // a two-team league caps "Up to" at 2
    expect(startMock).toHaveBeenCalledWith({
      season: 2026,
      focus: null,
      stance: 'fair',
      maxTeams: 2,
      mustInclude: null
    })
    expect(screen.getByText('Searching 2-team deals · 0 of 0 ideas checked · 0 found · 0:00')).toBeTruthy()
    expect(screen.getByText('Stop')).toBeTruthy()
    await flush()
    send({ runId: 7, type: 'progress', progress: PROGRESS })
    expect(
      screen.getByText('Searching 3-team deals · 412 of 18 900 ideas checked · 0 found · 0:37')
    ).toBeTruthy()
    send({ runId: 7, type: 'cards', cards: [tradeSuggestion()] })
    expect(screen.getByText('with Rival')).toBeTruthy()
    expect(screen.getByText('Me +4.00 (+0.27/wk)')).toBeTruthy()
    expect(screen.getByText('2-team')).toBeTruthy()
    expect(screen.getByText('Them -4.00')).toBeTruthy()
    expect(screen.getByText('market')).toBeTruthy()
    expect(screen.getByText("give RB Saquon Barkley · get WR Ja'Marr Chase")).toBeTruthy()
    send({ runId: 7, type: 'done', reason: 'full', progress: { ...PROGRESS, found: 1 } })
    expect(screen.getByText('Done: best 1 found — nothing left could rank higher')).toBeTruthy()
    expect(screen.getByText('Find')).toBeTruthy()

    fireEvent.click(screen.getByText('Open in builder'))
    expect(screen.getByLabelText('Remove team Rival')).toBeTruthy()
    expect(screen.getByText('Saquon Barkley')).toBeTruthy()
    expect(screen.getByText("Ja'Marr Chase")).toBeTruthy()
    // the verdict is the suggestion's evaluation — no second trade:evaluate call
    expect(screen.getByText('+4.00 (+0.27/wk)')).toBeTruthy()
    expect(screen.getByText('gives 9 340 → gets 8 000 (86 %)')).toBeTruthy()
    expect(evaluateMock).not.toHaveBeenCalled()
    expect(scrollIntoView).toHaveBeenCalled()
    fireEvent.click(screen.getByLabelText('Remove Saquon Barkley'))
    expect(screen.queryByText('+4.00 (+0.27/wk)')).toBeNull()
  })

  it('shows a 3-team card with its path, every other team and the other ways', async () => {
    poolMock.mockResolvedValue(threeTeamPool())
    evaluateMock.mockResolvedValue(threeTeamEvaluation())
    openSpotMock.mockResolvedValue({ sides: [null, null, null] })
    render(<TradeScreen dataVersion={0} />)
    await screen.findByLabelText('Add to I send')
    fireEvent.click(screen.getByText('Find'))
    expect(startMock).toHaveBeenCalledWith({
      season: 2026,
      focus: null,
      stance: 'fair',
      maxTeams: 3,
      mustInclude: null
    })
    await flush()
    send({ runId: 7, type: 'cards', cards: [threeTeamSuggestion()] })
    expect(screen.getByText('3-team')).toBeTruthy()
    expect(
      screen.getByText(
        "I send WR Justin Jefferson → Rival · Rival sends WR Ja'Marr Chase → Tank Mode · Tank Mode sends WR Tee Higgins → me"
      )
    ).toBeTruthy()
    expect(screen.getByText('Rival +0.20/wk')).toBeTruthy()
    expect(screen.getByText('Tank Mode -0.10/wk')).toBeTruthy()
    expect(screen.queryByText('with Rival')).toBeNull()

    fireEvent.click(screen.getByText('+1 other way ▸'))
    expect(screen.getByText('via Rival: Bijan Robinson · worst side -0.30/wk')).toBeTruthy()
    fireEvent.click(screen.getAllByText('Open in builder')[1])
    // an alternative carries no evaluation: it is evaluated on opening
    await waitFor(() =>
      expect(evaluateMock).toHaveBeenCalledWith(2026, threeTeamSuggestion().alternatives[0].proposal)
    )
    expect(screen.getByLabelText('Remove team Tank Mode')).toBeTruthy()
    expect(screen.getByText('Bijan Robinson')).toBeTruthy()
  })

  it('stops a run, ignores old runs and reports how each run ended', async () => {
    render(<TradeScreen dataVersion={0} />)
    await screen.findByLabelText('Add to I send')
    fireEvent.click(screen.getByText('Find'))
    await flush()
    fireEvent.click(screen.getByText('Stop'))
    expect(stopMock).toHaveBeenCalled()
    send({ runId: 7, type: 'done', reason: 'stopped', progress: PROGRESS })
    expect(screen.getByText('Stopped: 0 found so far')).toBeTruthy()

    startMock.mockResolvedValue(8)
    fireEvent.click(screen.getByText('Find'))
    await flush()
    send({ runId: 7, type: 'cards', cards: [tradeSuggestion()] }) // the old run: ignored
    expect(screen.queryByText('with Rival')).toBeNull()
    send({ runId: 8, type: 'done', reason: 'stale', progress: PROGRESS })
    expect(screen.getByText('League data changed — run again')).toBeTruthy()

    startMock.mockResolvedValue(9)
    fireEvent.click(screen.getByText('Find'))
    await flush()
    send({ runId: 9, type: 'error', message: 'Background calculation stopped unexpectedly (exit 1)' })
    expect(
      screen.getByText('Search failed: Background calculation stopped unexpectedly (exit 1)')
    ).toBeTruthy()

    startMock.mockResolvedValue(10)
    fireEvent.click(screen.getByText('Find'))
    await flush()
    send({ runId: 10, type: 'done', reason: 'complete', progress: PROGRESS })
    expect(screen.getByText('No offers at this stance — try overpay')).toBeTruthy()
  })

  it('re-attaches to the running search and leaves it running on unmount', async () => {
    snapshotMock.mockResolvedValue({
      runId: 3,
      query: { season: 2026, focus: { give: '4866' }, stance: 'overpay', maxTeams: 2, mustInclude: 2 },
      cards: [tradeSuggestion()],
      progress: PROGRESS,
      status: 'running',
      message: null
    })
    const { unmount } = render(<TradeScreen dataVersion={0} />)
    expect(await screen.findByText('with Rival')).toBeTruthy()
    expect((screen.getByLabelText('Focus') as HTMLSelectElement).value).toBe('give')
    expect((screen.getByLabelText('Focus player') as HTMLSelectElement).value).toBe('4866')
    expect((screen.getByLabelText('Stance') as HTMLSelectElement).value).toBe('overpay')
    expect((screen.getByLabelText('Must include') as HTMLSelectElement).value).toBe('2')
    expect(screen.getByText('Stop')).toBeTruthy()
    send({ runId: 3, type: 'done', reason: 'complete', progress: { ...PROGRESS, found: 1 } })
    expect(screen.getByText('Done: 1 found, every idea checked')).toBeTruthy()
    unmount()
    expect(unsubscribe).toHaveBeenCalled()
    expect(stopMock).not.toHaveBeenCalled()
  })

  it('notes changed controls and starts nothing until Find', async () => {
    render(<TradeScreen dataVersion={0} />)
    await screen.findByLabelText('Add to I send')
    fireEvent.click(screen.getByText('Find'))
    await flush()
    fireEvent.change(screen.getByLabelText('Stance'), { target: { value: 'premium' } })
    expect(
      screen.getByText(
        'Searching 2-team deals · 0 of 0 ideas checked · 0 found · 0:00 · Controls changed — Find to rerun'
      )
    ).toBeTruthy()
    expect(startMock).toHaveBeenCalledTimes(1)
  })

  it('suggests with the builder’s team by making it the must-include team', async () => {
    render(<TradeScreen dataVersion={0} />)
    await screen.findByLabelText('Add to I send')
    fireEvent.change(screen.getByLabelText('Focus'), { target: { value: 'give' } })
    fireEvent.change(screen.getByLabelText('Focus player'), { target: { value: '4866' } })
    expect(screen.getByText('MKT 9 340 · 30d -310')).toBeTruthy()
    fireEvent.click(screen.getByText('Suggest with this team'))
    expect(startMock).toHaveBeenCalledWith({
      season: 2026,
      focus: { give: '4866' },
      stance: 'fair',
      maxTeams: 2,
      mustInclude: 2
    })
    expect((screen.getByLabelText('Must include') as HTMLSelectElement).value).toBe('2')
  })

  it('shows a failed start under the controls', async () => {
    startMock.mockRejectedValue(new Error('No league imported'))
    render(<TradeScreen dataVersion={0} />)
    await screen.findByLabelText('Add to I send')
    fireEvent.click(screen.getByText('Find'))
    expect(await screen.findByText('No league imported')).toBeTruthy()
    expect(screen.getByText('Find')).toBeTruthy()
  })
```

Run: `npx vitest run tests/renderer/components/TradeScreen.test.tsx`
Expected: FAIL — the screen still calls `api.trade.suggest`.

- [ ] **Step 2: Write `src/renderer/src/lib/useSuggestRun.ts`**

```ts
import { useCallback, useEffect, useRef, useState } from 'react'
import { api } from '@/lib/api'
import { errorMessage } from '@/lib/format'
import { DEFAULT_CONTROLS, controlsOf, queryOf, type SuggestControls } from '@/lib/tradeView'
import { applyUpdate, EMPTY_PROGRESS } from '@shared/suggestRun'
import type { SuggestSnapshot, TradePool } from '@shared/types'

/** The run id shown while a start waits for main's answer. */
const PENDING = -1

export interface SuggestRun {
  controls: SuggestControls
  setControls: (controls: SuggestControls) => void
  /** The run shown: the active or last one, or a start waiting for its id. */
  run: SuggestSnapshot | null
  running: boolean
  startError: string | null
  /** Starts a run on the controls, `override` applied to them first. */
  find: (override?: Partial<SuggestControls>) => void
  stop: () => void
  /** After a pool reload: forget a focus player or team that is gone; cap "Up to" at the league size. */
  prune: (pool: TradePool) => void
}

/**
 * Multi-team spec §4.2 / §5.2: the screen's view of main's one suggestion run. On mount it
 * re-attaches (snapshot, then events); unmounting unsubscribes and leaves the run going.
 */
export function useSuggestRun(season: number | null): SuggestRun {
  const [controls, setControls] = useState<SuggestControls>(DEFAULT_CONTROLS)
  const [run, setRun] = useState<SuggestSnapshot | null>(null)
  const [startError, setStartError] = useState<string | null>(null)
  /** The run whose events apply: null until the snapshot answers, PENDING while a start is in flight. */
  const following = useRef<number | null>(null)
  /** Counts starts, so only the latest start's answer is taken. */
  const starts = useRef(0)

  useEffect(() => {
    let live = true
    // Subscribe first: main answers the snapshot before it sends any later event, on one channel.
    const unsubscribe = api.trade.onSuggestEvent((event) => {
      if (event.runId !== following.current) return
      setRun((r) => (r !== null && r.runId === event.runId ? applyUpdate(r, event) : r))
    })
    void api.trade
      .suggestSnapshot()
      .then((snap) => {
        if (!live || snap === null || starts.current > 0) return
        following.current = snap.runId
        setRun(snap)
        setControls(controlsOf(snap.query))
      })
      .catch(() => undefined)
    return () => {
      live = false
      unsubscribe()
    }
  }, [])

  const find = (override: Partial<SuggestControls> = {}): void => {
    if (season === null) return
    const next = { ...controls, ...override }
    const query = queryOf(next, season)
    const token = ++starts.current
    following.current = PENDING
    setControls(next)
    setStartError(null)
    setRun({
      runId: PENDING,
      query,
      cards: [],
      progress: EMPTY_PROGRESS,
      status: 'running',
      message: null
    })
    void api.trade
      .suggestStart(query)
      .then((runId) => {
        if (token !== starts.current) return
        following.current = runId
        setRun((r) => (r !== null && r.runId === PENDING ? { ...r, runId } : r))
      })
      .catch((err) => {
        if (token !== starts.current) return
        following.current = null
        setRun(null)
        setStartError(errorMessage(err))
      })
  }

  const stop = (): void => {
    // The run's `done: stopped` event updates the list.
    void api.trade.suggestStop().catch(() => undefined)
  }

  const prune = useCallback((pool: TradePool): void => {
    setControls((c) => ({
      ...c,
      focusGive: pool.me.players.some((p) => p.playerId === c.focusGive) ? c.focusGive : '',
      mustInclude:
        c.mustInclude !== null && pool.teams.some((t) => t.rosterId === c.mustInclude)
          ? c.mustInclude
          : null,
      maxTeams: Math.max(2, Math.min(c.maxTeams, pool.teams.length + 1))
    }))
  }, [])

  return {
    controls,
    setControls,
    run,
    running: run?.status === 'running',
    startError,
    find,
    stop,
    prune
  }
}
```

- [ ] **Step 3: Write `src/renderer/src/components/TradeSuggestions.tsx`**

```tsx
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import {
  CONTROLS_CHANGED,
  SELECT_CLASS,
  STANCE_OPTIONS,
  TONE_CLASS,
  acceptanceTags,
  alternativeLine,
  deltaTone,
  focusMarketLine,
  groupByPosition,
  meLine,
  offerLine,
  otherSideLine,
  otherWaysLabel,
  pathLine,
  playerOption,
  queryOf,
  sameQuery,
  stanceHint,
  suggestStatusLine,
  teamCountOptions,
  teamsChip,
  themLine,
  type FocusKind,
  type SuggestControls
} from '@/lib/tradeView'
import type { SuggestRun } from '@/lib/useSuggestRun'
import { cn } from '@/lib/utils'
import { LINEUP_POSITIONS } from '@shared/rules'
import type { TradePool, TradeProposal, TradeStance, TradeSuggestion } from '@shared/types'

function Tag({ children }: { children: string }): React.JSX.Element {
  return (
    <span className="rounded bg-muted px-1.5 text-xs font-semibold text-muted-foreground">
      {children}
    </span>
  )
}

/** Spec §5.2: one card — my Δ, the team count, 6b's give / get or the path, every other team, the other ways. */
function SuggestionRow({
  suggestion,
  onOpen,
  onOpenProposal
}: {
  suggestion: TradeSuggestion
  onOpen: () => void
  onOpenProposal: (proposal: TradeProposal) => void
}): React.JSX.Element {
  const [expanded, setExpanded] = useState(false)
  const sides = suggestion.evaluation.sides
  const multi = suggestion.teams > 2
  return (
    <li className="rounded-md border px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        {!multi && <span className="font-medium">with {sides[1].name}</span>}
        <span className={cn('font-semibold', TONE_CLASS[deltaTone(sides[0].delta)])}>
          {meLine(suggestion)}
        </span>
        <Tag>{teamsChip(suggestion)}</Tag>
        {!multi && (
          <>
            <span className={TONE_CLASS[deltaTone(sides[1].delta)]}>{themLine(suggestion)}</span>
            {acceptanceTags(suggestion).map((tag) => (
              <Tag key={tag}>{tag}</Tag>
            ))}
          </>
        )}
        <Button type="button" variant="outline" size="sm" className="ml-auto" onClick={onOpen}>
          Open in builder
        </Button>
      </div>
      <div className="mt-1 text-muted-foreground">
        {multi ? pathLine(suggestion) : offerLine(suggestion)}
      </div>
      {multi && (
        <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1">
          {sides.slice(1).map((side, i) => (
            <li key={side.rosterId} className="flex items-center gap-1.5">
              <span className={TONE_CLASS[deltaTone(side.delta)]}>{otherSideLine(side)}</span>
              {acceptanceTags(suggestion, i + 1).map((tag) => (
                <Tag key={tag}>{tag}</Tag>
              ))}
            </li>
          ))}
        </ul>
      )}
      {suggestion.alternatives.length > 0 && (
        <div className="mt-1">
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground"
            aria-expanded={expanded}
            onClick={() => setExpanded((e) => !e)}
          >
            {`${otherWaysLabel(suggestion.alternatives.length)} ${expanded ? '▾' : '▸'}`}
          </button>
          {expanded && (
            <ul className="mt-1 space-y-1">
              {suggestion.alternatives.map((a) => (
                <li
                  key={a.label}
                  className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
                >
                  <span>{alternativeLine(a)}</span>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => onOpenProposal(a.proposal)}
                  >
                    Open in builder
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </li>
  )
}

function suggestionKey(s: TradeSuggestion): string {
  return s.evaluation.sides
    .map((side) => `${side.rosterId}:${side.give.map((p) => p.playerId).join('+')}`)
    .join('>')
}

interface TradeSuggestionsProps {
  pool: TradePool
  season: number
  suggest: SuggestRun
  onOpen: (suggestion: TradeSuggestion) => void
  onOpenProposal: (proposal: TradeProposal) => void
}

/** Multi-team spec §5.2: the controls, Find / Stop, the live status line and the streamed list. */
export function TradeSuggestions({
  pool,
  season,
  suggest,
  onOpen,
  onOpenProposal
}: TradeSuggestionsProps): React.JSX.Element {
  const { controls, setControls, run, running, startError } = suggest
  const set = (over: Partial<SuggestControls>): void => setControls({ ...controls, ...over })
  const focusPlayer = pool.me.players.find((p) => p.playerId === controls.focusGive) ?? null
  const changed = run !== null && !sameQuery(run.query, queryOf(controls, season))
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Suggestions</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted-foreground">Focus</span>
          <select
            aria-label="Focus"
            className={SELECT_CLASS}
            value={controls.focusKind}
            onChange={(e) => set({ focusKind: e.target.value as FocusKind })}
          >
            <option value="none">none</option>
            <option value="give">I give</option>
            <option value="want">I want</option>
          </select>
          {controls.focusKind === 'give' && (
            <select
              aria-label="Focus player"
              className={SELECT_CLASS}
              value={controls.focusGive}
              onChange={(e) => set({ focusGive: e.target.value })}
            >
              <option value="">pick a player</option>
              {groupByPosition(pool.me.players).map(([pos, players]) => (
                <optgroup key={pos} label={pos}>
                  {players.map((p) => (
                    <option key={p.playerId} value={p.playerId}>
                      {playerOption(p)}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          )}
          {controls.focusKind === 'give' && focusPlayer && (
            <span className="text-xs text-muted-foreground">{focusMarketLine(focusPlayer)}</span>
          )}
          {controls.focusKind === 'want' && (
            <select
              aria-label="Focus position"
              className={SELECT_CLASS}
              value={controls.focusWant}
              onChange={(e) => set({ focusWant: e.target.value })}
            >
              {LINEUP_POSITIONS.map((pos) => (
                <option key={pos} value={pos}>
                  {pos}
                </option>
              ))}
            </select>
          )}
          <span className="ml-2 text-muted-foreground">Stance</span>
          <select
            aria-label="Stance"
            className={SELECT_CLASS}
            value={controls.stance}
            onChange={(e) => set({ stance: e.target.value as TradeStance })}
          >
            {STANCE_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <span className="ml-2 text-muted-foreground">Up to</span>
          <select
            aria-label="Up to teams"
            className={SELECT_CLASS}
            value={controls.maxTeams}
            onChange={(e) => set({ maxTeams: Number(e.target.value) })}
          >
            {teamCountOptions(pool.teams.length + 1).map((n) => (
              <option key={n} value={n}>
                {n} teams
              </option>
            ))}
          </select>
          <span className="ml-2 text-muted-foreground">Must include</span>
          <select
            aria-label="Must include"
            className={SELECT_CLASS}
            value={controls.mustInclude ?? ''}
            onChange={(e) =>
              set({ mustInclude: e.target.value === '' ? null : Number(e.target.value) })
            }
          >
            <option value="">any team</option>
            {pool.teams.map((t) => (
              <option key={t.rosterId} value={t.rosterId}>
                {t.name}
              </option>
            ))}
          </select>
          {running ? (
            <Button type="button" variant="outline" onClick={() => suggest.stop()}>
              Stop
            </Button>
          ) : (
            <Button type="button" onClick={() => suggest.find()}>
              Find
            </Button>
          )}
        </div>
        <p className="text-xs text-muted-foreground">{stanceHint(controls.stance)}</p>
        {startError && <p className="text-destructive text-sm">{startError}</p>}
        {run && (
          <p className="text-sm text-muted-foreground" role="status">
            {`${suggestStatusLine(run)}${changed ? ` · ${CONTROLS_CHANGED}` : ''}`}
          </p>
        )}
        {run && run.cards.length > 0 && (
          <ul className="space-y-2">
            {run.cards.map((s) => (
              <SuggestionRow
                key={suggestionKey(s)}
                suggestion={s}
                onOpen={() => onOpen(s)}
                onOpenProposal={onOpenProposal}
              />
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 4: Replace `src/renderer/src/screens/TradeScreen.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react'
import { PlayerDetailPanel } from '@/components/PlayerDetailPanel'
import { TradeBuilder } from '@/components/TradeBuilder'
import { TradeSuggestions } from '@/components/TradeSuggestions'
import { api } from '@/lib/api'
import { errorMessage } from '@/lib/format'
import {
  EMPTY_DEAL,
  addTeam,
  dealFromProposal,
  dealOf,
  proposalFrom,
  pruneDeal,
  type BuilderDeal
} from '@/lib/tradeBuilder'
import { DEADLINE_NOTE, windowLabel } from '@/lib/tradeView'
import { useSuggestRun } from '@/lib/useSuggestRun'
import { proposalOf } from '@shared/deal'
import type {
  DetailTarget,
  TradeEvaluation,
  TradeOpenSpots,
  TradePool,
  TradeProposal,
  TradeSuggestion
} from '@shared/types'

interface TradeScreenProps {
  dataVersion: number
}

export function TradeScreen({ dataVersion }: TradeScreenProps): React.JSX.Element {
  const [season, setSeason] = useState<number | null>(null)
  const [loaded, setLoaded] = useState<{ key: string; pool: TradePool } | null>(null)
  const [failed, setFailed] = useState<{ key: string; message: string } | null>(null)
  const [deal, setDeal] = useState<BuilderDeal>(EMPTY_DEAL)
  const [verdict, setVerdict] = useState<TradeEvaluation | null>(null)
  const [openSpots, setOpenSpots] = useState<{
    ev: TradeEvaluation
    spots: TradeOpenSpots
  } | null>(null)
  const [evaluating, setEvaluating] = useState(false)
  const [evalError, setEvalError] = useState<string | null>(null)
  const [selected, setSelected] = useState<DetailTarget | null>(null)
  const suggest = useSuggestRun(season)
  const { prune } = suggest
  const builderRef = useRef<HTMLDivElement>(null)
  /** Bumped on every deal change: an evaluate answer for an older deal is dropped. */
  const dealSeq = useRef(0)

  useEffect(() => {
    void api.players
      .options()
      .then((o) => setSeason((s) => s ?? o.seasons[0] ?? null))
      .catch((err) => setFailed({ key: 'options', message: errorMessage(err) }))
  }, [dataVersion])

  const key = season !== null ? `${season}|${dataVersion}` : null
  useEffect(() => {
    if (season === null || key === null) return
    let cancelled = false
    void api.trade
      .pool(season)
      .then((pool) => {
        if (cancelled) return
        setLoaded({ key, pool })
        // Multi-team spec §5.1: keep the teams and players that still exist after a sync; a deal
        // with no other team starts with the first one, as 6b's partner did.
        dealSeq.current++
        setDeal((d) => {
          const kept = pruneDeal(d, pool)
          const first = pool.teams[0]
          return kept.teams.length > 0 || !first ? kept : addTeam(kept, first.rosterId)
        })
        setVerdict(null)
        prune(pool)
      })
      .catch((err) => {
        if (!cancelled) setFailed({ key, message: errorMessage(err) })
      })
    return () => {
      cancelled = true
    }
  }, [season, key, prune])

  // Slice 6c spec §7: the open-spot line follows the verdict; the verdict never waits for it.
  useEffect(() => {
    if (!verdict) return
    let cancelled = false
    void api.trade
      .openSpot(verdict.season, proposalOf(verdict))
      .then((spots) => {
        if (!cancelled) setOpenSpots({ ev: verdict, spots })
      })
      // An info line: when it fails the verdict simply shows none.
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [verdict])
  const spots = openSpots !== null && openSpots.ev === verdict ? openSpots.spots : null

  const pool = loaded?.key === key ? loaded.pool : null
  const notice = failed && (failed.key === key || failed.key === 'options') ? failed.message : null

  const changeDeal = (d: BuilderDeal): void => {
    dealSeq.current++
    setDeal(d)
    setVerdict(null)
    setEvalError(null)
    setEvaluating(false)
  }

  async function evaluate(d: BuilderDeal = deal): Promise<void> {
    if (season === null || !pool) return
    const seq = dealSeq.current
    setEvaluating(true)
    setEvalError(null)
    try {
      const ev = await api.trade.evaluate(season, proposalFrom(d, pool.me.rosterId))
      if (seq === dealSeq.current) setVerdict(ev)
    } catch (err) {
      if (seq === dealSeq.current) setEvalError(errorMessage(err))
    } finally {
      if (seq === dealSeq.current) setEvaluating(false)
    }
  }

  const scrollToBuilder = (): void =>
    builderRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })

  /** Spec 6b §5.2: the builder shows the suggestion's own evaluation — no second trade:evaluate call. */
  const openSuggestion = (s: TradeSuggestion): void => {
    changeDeal(dealOf(s.evaluation))
    setVerdict(s.evaluation)
    scrollToBuilder()
  }

  /** Multi-team spec §5.2: an alternative carries only its proposal, so it is evaluated on opening. */
  const openProposal = (proposal: TradeProposal): void => {
    if (!pool) return
    const d = dealFromProposal(proposal, pool)
    changeDeal(d)
    void evaluate(d)
    scrollToBuilder()
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Trade</h1>
          <p className="text-sm text-muted-foreground">
            Every team&apos;s rest-of-season strength before and after, on Sleeper projections under
            your scoring.
          </p>
        </div>
        {pool && <span className="text-sm text-muted-foreground">{windowLabel(pool)}</span>}
      </div>

      {notice && <p className="text-sm text-muted-foreground">{notice}</p>}
      {!pool && !notice && <p className="text-sm text-muted-foreground">Loading…</p>}

      {pool && season !== null && (
        <>
          {pool.tradeDeadlinePassed && (
            <p className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm text-amber-400">
              {DEADLINE_NOTE}
            </p>
          )}
          <div ref={builderRef}>
            <TradeBuilder
              pool={pool}
              deal={deal}
              onDealChange={changeDeal}
              verdict={verdict}
              spots={spots}
              evaluating={evaluating}
              evalError={evalError}
              onEvaluate={() => void evaluate()}
              onOpenPlayer={setSelected}
              finding={suggest.running}
              onSuggestWith={(rosterId) => suggest.find({ mustInclude: rosterId })}
            />
          </div>
          <TradeSuggestions
            pool={pool}
            season={season}
            suggest={suggest}
            onOpen={openSuggestion}
            onOpenProposal={openProposal}
          />
        </>
      )}

      <PlayerDetailPanel season={season ?? 0} player={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
```

- [ ] **Step 5: Remove the one-shot `trade:suggest`**

- `src/shared/ipc.ts`: delete `suggest(query)` from `Api.trade` and `tradeSuggest` from `IPC`; drop `TradeSuggestion` from the imports if unused.
- `src/preload/index.ts`: delete the `suggest:` line.
- `src/main/ipc/handlers.ts`: delete the `IPC.tradeSuggest` handler and the imports it alone used.
- `src/main/engine/jobs.ts`: delete the `tradeSuggest` member of `EngineJob`, its `EngineResults` entry and its `runJob` case; drop `suggestFromDb` / `TradeSuggestion` imports if unused.
- `src/main/trade/fromDb.ts`: delete `suggestFromDb` (and its now-unused imports); `openSpotFromDb` stays.
- `tests/main/engine/jobs.test.ts`: delete "still answers trade suggestions" (the `runStreamJob` tests cover the job now).

Then confirm nothing refers to it any more:

Run: `grep -rn "tradeSuggest\b\|trade:suggest'\|suggestFromDb\|api.trade.suggest(" src tests`
Expected: no output (the `tradeSuggestStart` / `trade:suggestStart` family and the `kind: 'tradeSuggest'` stream job remain and are fine — check any hit is one of those).

- [ ] **Step 6: Verify and commit**

Run: `npm run typecheck && npm run lint && npm test` — green.

```bash
npx prettier --write src/renderer/src/lib/useSuggestRun.ts src/renderer/src/components/TradeSuggestions.tsx src/renderer/src/screens/TradeScreen.tsx src/shared/ipc.ts src/preload/index.ts src/main/ipc/handlers.ts src/main/engine/jobs.ts src/main/trade/fromDb.ts tests/renderer/components/TradeScreen.test.tsx tests/main/engine/jobs.test.ts
git add src tests
git commit -m "feat(ui): stream multi-team suggestions live"
```

---

### Task 12: Data reference, real-data check, release `v0.19.0`

**Files:**

- Modify: `docs/reference/value-and-signals.md`
- Modify: this plan (status block)

- [ ] **Step 1: Data reference**

In `docs/reference/value-and-signals.md`, section `## Trade (added in v0.13.0; N-team deals v0.18.0)`:

- Rename it `## Trade (added in v0.13.0; N-team deals v0.18.0; N-team search v0.19.0)`; the module line becomes `src/main/trade/{enter,player,side,evaluate,pool,thresholds,searchContext,heap,mySides,bridge,suggest,suggestRun,openSpot}.ts`.
- `### Suggestions`: the query is `{ season, focus, stance, maxTeams, mustInclude }` (`partnerRosterId` is gone); a k-team deal is a cycle me → T₁ → … → C → me, 1–2 players per hop, at most one 2-player hop; a **my side** is (what I give, what I get, from whom); my sides come best-first on the bound U(z) (my total with z added, nothing given, no drop rule); per my side the smallest size with a working deal wins and every working deal at that size is kept — the representative maximizes the least-happy other team's Δ/week (ties: fewer players, names in cycle order, ids), the rest are `alternatives` with a `via …` label; dominance of a pair by its contained single now requires the single to work with no more teams; the list is the top `SUGGEST_MAX` in rank order (`full`) or everything (`complete`). `TradeSuggestion` gains `teams` and `alternatives`.
- `#### Cost and the prunes`: replace with the exact prunes now in force — the market precheck; the U(z) bound (whole z groups discarded, the rest lazily solved); Plan M's pair bound on my side; per team, "nothing it gets can start and the market is short" and "a pair given after the contained single was refused with no drops"; the side memo per run; and the negative-value slack that keeps all of them exact when someone has scored below zero. State the guarantee: a property test against a brute-force oracle (`tests/main/trade/suggestOracle.ts`) over every team count 2–4, stance, focus and must-include on random 4-team leagues, with and without negative values. Add the budget and real-league times from this plan's status block.
- Add a **Streaming** paragraph: the engine worker runs the search and posts batched updates (≤ 1 per 250 ms, the first card at once); main owns one run (`trade:suggestStart` / `suggestStop` / `suggestSnapshot`, event `trade:suggestEvent`), a sync or rules save marks it `stale`; the screen re-attaches after a tab switch.
- `### Where it is shown`: the Suggestions card — Focus, Stance, **Up to** (2 … league size, default 3), **Must include** (any team), Find / Stop, the status line per state, 2-team rows as before plus a `2-team` chip, k-team rows with the path line and each other team's Δ/week and reason, `+n other ways ▸`; _Suggest with this team_ sets Must include.
- `## Constants (single sources)`: the stance / acceptance constants now live in `src/main/trade/thresholds.ts`. `## Module map`: add the new modules.

- [ ] **Step 2: Commit the docs**

```bash
npx prettier --write docs/reference/value-and-signals.md
git add docs/reference/value-and-signals.md
git commit -m "docs: document the N-team trade search"
```

- [ ] **Step 3: Final verification and the real-data check**

Run: `npm run typecheck && npm run lint && npm test && npm run test:budget` — all green; note the budget lines.

Run the app once (`npm run dev` via the Bash tool's `run_in_background`), open the Trade screen, Find with **Up to 3 teams**: cards should appear while the status line counts up; switch to another tab and back — the run and its cards must still be there; Stop must end it. If WSLg can't show the window, say so in the status block rather than claiming it was checked. Also note that the packaged-asar worker remains untested (fallback unchanged: add `out/main/engineWorker.js` to `asarUnpack`).

- [ ] **Step 4: Merge and release**

```bash
git checkout main && git merge --no-ff feat/multi-team-search -m "merge: feat/multi-team-search (plan R)"
npm version minor -m "build: bump version to %s"
```

Expected: `package.json` at `0.19.0`, tag `v0.19.0`. Pushing (`git push --follow-tags`) triggers the Windows release workflow into a draft release — **ask the user first**, as in earlier plans. Then fill in this plan's status block (gate numbers, real-data observations, what was not verified) and commit it as `docs(plan): mark plan R complete`.

---

## Self-review against the spec

| Spec                                                                                                                                                                                                                | Where                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| §3.1 query `maxTeams` (clamped) / `mustInclude`; k-team cycles; hop shapes; my side and bridge; constants unchanged                                                                                                 | Task 1 (types, thresholds), Task 3 (`dealsAt` shapes, pair rule), Task 5 (clamp)             |
| §3.2 candidates (focus give, z enters my lineup, want, not both pairs, kMax 2 + mustInclude ⇒ C), market precheck = progress total                                                                                  | Task 4 (`mySideQueue`)                                                                       |
| §3.2 stance on my side's exact result; rank key                                                                                                                                                                     | Task 4 (`score`, `rankOrder`)                                                                |
| §3.2 lazy best-first: U(z) discard, bound vs exact ordering, Plan M pair bound                                                                                                                                      | Task 4 (`before`, `boundedOut`)                                                              |
| §3.3 sizes 2…min(maxTeams, teams); k = 2 direct; bridge DFS; one 2-player hop; mustInclude in the bridge; checks as early as possible; both exact prunes; every working deal at the smallest size                   | Task 3 (`dealsAt`, `accepts`), Task 5 (`search`)                                             |
| §3.4 representative order, alternatives, dominance resolved on pop, early stop `full` / `complete`                                                                                                                  | Task 5 (`dealOrder`, `cardOf`, `dominated`, main loop)                                       |
| §3.5 `TradeAlternative`, `TradeSuggestion { evaluation, teams, acceptance, alternatives }`, `suggestDeals` generator                                                                                                | Tasks 1, 5                                                                                   |
| §4.1 streaming runner, ~250 ms batches, `SuggestProgress`, `SuggestEvent`, `stop()` terminates                                                                                                                      | Task 7                                                                                       |
| §4.2 run manager: one run, start supersedes, stop, snapshot, events by run id, `stale` on `invalidateCaches`, quit, renderer ignores other run ids                                                                  | Task 8 (manager, channels), Task 11 (renderer follows one run)                               |
| §4.2 `trade:suggest` removed                                                                                                                                                                                        | Task 11 Step 5                                                                               |
| §5.2 controls (Up to 2…league size default 3, Must include any), Find / Stop, status line per reason, rows (chip, path, other teams, other ways, Open in builder), re-attach, Find is explicit + "Controls changed" | Tasks 10, 11                                                                                 |
| §6 errors: nothing found / focus gone → `complete` 0; maxTeams clamped; mustInclude me / unknown → `INVALID_TRADE`; worker error / exit → `error`, cards stay; sync → `stale`; asar fallback                        | Task 5 (search), Task 7 (worker errors), Task 8 (`stale`, error status), Task 12 (asar note) |
| §7 oracle + property test (2/3/4 × stances × focus × mustInclude), streaming invariants, 6b parity, run manager tests, renderer tests, budget (first card), real-league check                                       | Tasks 2, 3, 5, 6, 8, 9, 11                                                                   |
| §8 structure (plus `thresholds.ts`, `searchContext.ts`, `heap.ts`, `src/shared/suggestRun.ts`, `useSuggestRun.ts` — see Global Constraints)                                                                         | All tasks                                                                                    |
| §9 order: oracle → memo in search → my sides → bridge → grouping / dominance / early stop → measurement gate → worker → run manager → card; docs                                                                    | Tasks 2–6 → 7–11, 12                                                                         |
| Plan Q carry-overs                                                                                                                                                                                                  | Task 9                                                                                       |
