# Plan Q — N-team deals and the builder (multi-team trades, phase 1)

**Status:** not started.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Trades between any number of teams: a proposal becomes a list of moves (`{ playerId, to }`), `evaluateTrade` scores every side of the deal, the open-spot line follows every side, and the Trade screen's builder takes any number of teams with a destination per player; the 2-team suggestion search keeps its results on the new types. Ship `v0.18.0`.

**Architecture:** The deal rules both processes enforce live in `src/shared/deal.ts` (`dealTeams`, `dealProblem`, plus `twoTeam` / `proposalOf` helpers). In main, 6b's `sideResult` moves to `src/main/trade/side.ts` as `sideFor`, unchanged except that received players count their starts on their own source roster; `evaluate.ts` gains `resolveDeal` (moves → per-team gives / gets, validated) and maps `sideFor` over every team; a per-run memo keyed by `rosterId|gives|gets` is the seam Plan R's search needs. The renderer gets a pure builder model (`src/renderer/src/lib/tradeBuilder.ts`) and a `TradeBuilder` component extracted from `TradeScreen.tsx`.

**Tech Stack:** unchanged — Electron 39, React 19, TypeScript strict, Tailwind 4 + shadcn, Vitest (jsdom + Testing Library for component tests), `node:sqlite`, lucide-react.

**Spec:** `docs/superpowers/specs/2026-09-30-multi-team-trades-design.md` — §2 (deal model, evaluation, side memo, open spots), §5.1 (builder), §6 (errors), §7 (evaluator / renderer tests), §9 (Plan Q = `v0.18.0`). Plan R ships §3–§4 and §5.2.

## Global Constraints

- Same as Plans C–P: Node ≥ 22.13 (`source ~/.nvm/nvm.sh && nvm use` if `node --version` is not 22.x), no Electron imports outside `src/main/index.ts`, `src/main/ipc/`, `src/preload/`. Path aliases: `@main/*`, `@shared/*`, `@/*` (renderer). Tests import fixtures relatively (`../../fixtures/...`).
- **Payload conventions** (`docs/reference/value-and-signals.md`): points rounded with `round2`, shown with 2 decimals (`fmtPoints`), signed with `fmtSigned`.
- **Deal validity** (spec §2.1): every player on some roster and listed once; `to` a league team other than his current one; I am one of the teams; at least two teams; every team in the deal sends ≥ 1 and gets ≥ 1.
- **Sides order** (spec §2.2): me first, then the other teams in order of first appearance in `moves` (each move's source before its destination).
- **Flags** (spec §2.2): `everyoneGains` = every side's `delta > 0`; `marketFair` = every side's market ratio ≥ `MARKET_FAIR = 0.90`.
- **Unchanged from 6b:** auto-drops, the week skip, market sums, `ACCEPT_LOSS_PER_WEEK`, `DOMINANCE_PTS`, `SUGGEST_MAX`, the stance table — and the 2-team suggestion results.
- Verification before every commit: `npm run typecheck && npm run lint && npm test`; run `npm run format` when Prettier complains. Conventional Commits, summary ≤ 50 chars, imperative, **no trailers** (no `Co-Authored-By`, no "Generated with").
- ESLint: explicit return types on every named function and component, `react-hooks/set-state-in-effect` is an error (state is set only in promise callbacks / event handlers), no unused vars / imports, `react-refresh/only-export-components` (a `.tsx` file exports components only — types are fine).
- Decisions locked in here (not in the spec):
  - **File names.** The side computation and its memo live in `src/main/trade/side.ts` (spec §8 says `sideMemo.ts`; the file holds `sideFor` itself, and a separate file avoids an `evaluate.ts` ↔ memo import cycle). `resolveDeal` lives in `evaluate.ts` next to `TradeError` (spec §8's `src/main/trade/deal.ts` is not created; the shared rules are `src/shared/deal.ts`). `evaluate.ts` re-exports `isStarter` and `marketSum` so their importers don't change.
  - **Messages** carry no `Invalid trade:` prefix and read the same in the builder and in main: `Pick at least one other team`, `Your team must be part of the trade`, `A player can only move once`, `<player> is already on <team>`, `<team> sends nobody`, `<team> gets nobody`; main alone adds `<player> is not on a roster in this league` (the proposal carries no source roster, so spec §6's "no longer on Gridiron Gang" cannot name the old team) and `Team <id> is not in this league`.
  - **`TradeSuggestion` in Plan Q** is `{ evaluation, acceptance: (TradeAcceptance | null)[] }`. Spec §3.5's `teams` and `alternatives` arrive with Plan R, the first code that fills them.
  - **Builder picks** store `to: null` for the default destination (mine → the first other team, everyone else's → me), so adding or removing a team re-targets them; removing the last other team keeps my picks waiting for a destination. A deal with no other team gets the pool's first team on load (6b's default partner). _Suggest with this team_ stays, shown for a 2-team deal only.
  - **Labels.** Team cards: `I send` / `<team> sends`; destination options `→ Me` / `→ <team>`; a `gets:` line under every card, with the source in brackets only with 3+ teams; verdict columns headed `Me · <name>` / `<name>`, with a `gets X from Y` line only with 3+ teams. `NO_VERDICT_HINT` becomes `Add players to every team in the deal and evaluate.` and shows while no player is picked; afterwards the hint is the broken rule.
  - **The memo is a seam:** `evaluateTrade` takes `opts.memo`; no production caller passes one in Plan Q (every evaluation is one call); Plan R's search does.
  - **Open spots are matched by `rosterId`** (added during execution, from the Task 2 review): `proposalOf(ev)` lists moves side by side, so re-evaluating it can order a 3+-team deal's sides differently from the verdict (players picked in another order). The builder looks each side's spot up with `spotFor(spots, rosterId)` instead of by index; `TradeOpenSpots.sides` stays aligned with its own evaluation.

---

### Task 0: Branch

**Files:** none.

- [ ] **Step 1: Create the branch from an up-to-date main**

```bash
git checkout main && git status --short && git checkout -b feat/multi-team-deals
```

Expected: clean tree, on `feat/multi-team-deals`.

---

### Task 1: Shared deal rules

**Files:**

- Create: `src/shared/deal.ts`
- Test: `tests/shared/deal.test.ts`

**Interfaces:**

- Produces: `DealMove { playerId: string; from: number; to: number }`; `dealTeams(moves: DealMove[]): number[]`; `dealProblem(teams: number[], moves: DealMove[], me: number, teamName: (rosterId: number) => string, playerName: (playerId: string) => string): string | null` — Task 2 (main) and Task 4 (builder) both call it.

- [ ] **Step 1: Write the failing test**

`tests/shared/deal.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { dealProblem, dealTeams, type DealMove } from '@shared/deal'

const TEAMS: Record<number, string> = { 1: 'Cook Book', 2: 'Rival', 3: 'Tank Mode' }
const PLAYERS: Record<string, string> = {
  j: 'Justin Jefferson',
  c: "Ja'Marr Chase",
  h: 'Tee Higgins'
}
const team = (id: number): string => TEAMS[id] ?? `Team ${id}`
const player = (id: string): string => PLAYERS[id] ?? id
const m = (playerId: string, from: number, to: number): DealMove => ({ playerId, from, to })
const problem = (teams: number[], moves: DealMove[]): string | null =>
  dealProblem(teams, moves, 1, team, player)

describe('deal rules (multi-team spec §2.1)', () => {
  it('lists the teams in order of first appearance, source before destination', () => {
    expect(dealTeams([m('j', 1, 2), m('c', 2, 3), m('h', 3, 1)])).toEqual([1, 2, 3])
    expect(dealTeams([m('h', 3, 1), m('j', 1, 2)])).toEqual([3, 1, 2])
    expect(dealTeams([])).toEqual([])
  })

  it('accepts 2-team deals, cycles and other shapes', () => {
    expect(problem([1, 2], [m('j', 1, 2), m('c', 2, 1)])).toBeNull()
    expect(problem([1, 2, 3], [m('j', 1, 2), m('c', 2, 3), m('h', 3, 1)])).toBeNull()
    // not a cycle: I send one player to each team and get one back from each
    expect(problem([1, 2, 3], [m('j', 1, 2), m('x', 1, 3), m('c', 2, 1), m('h', 3, 1)])).toBeNull()
  })

  it('names the first broken rule', () => {
    expect(problem([1], [])).toBe('Pick at least one other team')
    expect(problem([2, 3], [m('c', 2, 3), m('h', 3, 2)])).toBe(
      'Your team must be part of the trade'
    )
    expect(problem([1, 2], [m('j', 1, 2), m('j', 1, 2), m('c', 2, 1)])).toBe(
      'A player can only move once'
    )
    expect(problem([1, 2], [m('j', 1, 1), m('c', 2, 1)])).toBe(
      'Justin Jefferson is already on Cook Book'
    )
    expect(problem([1, 2], [m('j', 1, 2)])).toBe('Cook Book gets nobody')
    expect(problem([1, 2], [m('c', 2, 1)])).toBe('Cook Book sends nobody')
    expect(problem([1, 2, 3], [m('j', 1, 2), m('c', 2, 1)])).toBe('Tank Mode sends nobody')
    expect(problem([1, 2, 3], [m('j', 1, 2), m('c', 2, 1), m('h', 3, 1)])).toBe(
      'Tank Mode gets nobody'
    )
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/shared/deal.test.ts`
Expected: FAIL — `Failed to resolve import "@shared/deal"`.

- [ ] **Step 3: Implement**

`src/shared/deal.ts`:

```ts
/** A move with its source roster — what both the builder and the main process know about a player. */
export interface DealMove {
  playerId: string
  from: number
  to: number
}

/** Multi-team spec §2.1: the teams of a deal in order of first appearance, each move's source first. */
export function dealTeams(moves: DealMove[]): number[] {
  const teams: number[] = []
  for (const m of moves) {
    if (!teams.includes(m.from)) teams.push(m.from)
    if (!teams.includes(m.to)) teams.push(m.to)
  }
  return teams
}

/**
 * Spec §2.1: the first rule a deal breaks, worded for the builder's hint and `INVALID_TRADE`; null
 * when the deal is valid. `teams` is the deal's team list — the builder's, or `dealTeams` in main.
 */
export function dealProblem(
  teams: number[],
  moves: DealMove[],
  me: number,
  teamName: (rosterId: number) => string,
  playerName: (playerId: string) => string
): string | null {
  if (teams.length < 2) return 'Pick at least one other team'
  if (!teams.includes(me)) return 'Your team must be part of the trade'
  const seen = new Set<string>()
  for (const m of moves) {
    if (seen.has(m.playerId)) return 'A player can only move once'
    seen.add(m.playerId)
    if (m.from === m.to) return `${playerName(m.playerId)} is already on ${teamName(m.to)}`
  }
  for (const t of teams) {
    if (!moves.some((m) => m.from === t)) return `${teamName(t)} sends nobody`
    if (!moves.some((m) => m.to === t)) return `${teamName(t)} gets nobody`
  }
  return null
}
```

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest run tests/shared/deal.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Verify and commit**

```bash
npm run typecheck && npm run lint && npm test
git add src/shared/deal.ts tests/shared/deal.test.ts
git commit -m "feat(trade): add shared multi-team deal rules"
```

---

### Task 2: Evaluate deals between N teams

The type switch: `TradeProposal` becomes moves, `TradeEvaluation` gets `sides`, and every consumer moves with it in one commit (the compiler forces it). The 2-team UI keeps working unchanged; Task 5 builds the N-team one.

**Files:**

- Modify: `src/shared/types.ts` (trade types), `src/shared/deal.ts` (+ `twoTeam`, `proposalOf`)
- Create: `src/main/trade/side.ts`
- Modify: `src/main/trade/evaluate.ts` (rewrite), `src/main/trade/player.ts` (+ `startsByRoster`), `src/main/trade/openSpot.ts`, `src/main/trade/suggest.ts`
- Modify: `src/renderer/src/lib/tradeView.ts`, `src/renderer/src/screens/TradeScreen.tsx`
- Modify: `tests/fixtures/trade.ts`, `tests/fixtures/synthetic.ts` (+ `CYCLE_LEAGUE`)
- Test: `tests/shared/deal.test.ts`, `tests/main/trade/evaluate.test.ts`, `tests/main/trade/openSpot.test.ts`, `tests/main/trade/openSpotBudget.test.ts`, `tests/main/trade/suggest.test.ts`, `tests/main/engine/jobs.test.ts`, `tests/renderer/lib/tradeView.test.ts`, `tests/renderer/components/TradeScreen.test.tsx`

**Interfaces:**

- Consumes: Task 1's `DealMove`, `dealTeams`, `dealProblem`.
- Produces (types, `@shared/types`): `TradeMove { playerId: string; to: number }`; `TradeProposal { moves: TradeMove[] }`; `TradeOutgoing extends TradePlayer { to: number }`; `TradeIncoming extends TradePlayer { from: number }`; `TradeSideResult.give: TradeOutgoing[]`, `.get: TradeIncoming[]`; `TradeEvaluation.sides: TradeSideResult[]`, `.everyoneGains: boolean` (replaces `me`, `them`, `winWin`); `TradeOpenSpots { sides: (OpenSpot | null)[] }`; `TradeAcceptance = 'lineup' | 'market' | 'both'`; `TradeSuggestion.acceptance: (TradeAcceptance | null)[]`.
- Produces (`@shared/deal`): `twoTeam(me: number, partner: number, give: string[], get: string[]): TradeProposal`; `proposalOf(ev: TradeEvaluation): TradeProposal`.
- Produces (main): `side.ts` — `SideOptions { skip?: boolean }`, `DealSide { team: Team; give: PlayerSeries[]; get: PlayerSeries[] }`, `SideCore = Omit<TradeSideResult, 'give'> & { give: TradePlayer[] }`, `StartsOf = (rosterId: number) => Map<string, number>`, `sideFor(build, side, weeks, size, startsOf, opts): SideCore`, `isStarter`, `marketSum`; `evaluate.ts` — `EvaluateOptions = SideOptions`, `ResolvedDeal { sides: DealSide[]; to: Map<string, number> }`, `resolveDeal(build, proposal): ResolvedDeal`; `player.ts` — `startsByRoster(build, weeks): StartsOf`.
- Produces (tests): `tests/fixtures/trade.ts` — `outgoing(p, to)`, `incoming(p, from)`, `rivalSide(over)`; `tests/fixtures/synthetic.ts` — `CYCLE_LEAGUE`.

- [ ] **Step 1: Write the failing tests — `twoTeam` / `proposalOf`**

Append to `tests/shared/deal.test.ts` (and extend its imports to `import { dealProblem, dealTeams, proposalOf, twoTeam, type DealMove } from '@shared/deal'` plus `import { tradeEvaluation } from '../fixtures/trade'`):

```ts
describe('proposal helpers', () => {
  it('builds a 2-team proposal from my side and reads one back from an evaluation', () => {
    expect(twoTeam(1, 2, ['j'], ['c', 'b'])).toEqual({
      moves: [
        { playerId: 'j', to: 2 },
        { playerId: 'c', to: 1 },
        { playerId: 'b', to: 1 }
      ]
    })
    // Jefferson (mine) to Rival, Chase to me — my gives first, then Rival's
    expect(proposalOf(tradeEvaluation())).toEqual({
      moves: [
        { playerId: '6794', to: 2 },
        { playerId: '7564', to: 1 }
      ]
    })
  })
})
```

- [ ] **Step 2: Write the failing tests — three-team evaluation**

Add `CYCLE_LEAGUE` to `tests/fixtures/synthetic.ts`, after `SMALL_LEAGUE`:

```ts
/**
 * Multi-team spec §2.2: a three-way cycle where everyone gains. Slots RB · WR · TE (+1 bench),
 * roster size 4, window weeks 16–17; every player is worth 1000 on the market.
 *
 * | Me (1)     | Two (2)    | Three (3)  |
 * | ---------- | ---------- | ---------- |
 * | a1 RB 20   | b1 WR 20   | c1 TE 20   |
 * | a2 RB 15   | b2 WR 15   | c2 TE 14   |
 * | a3 WR 5    | b3 TE 4    | c3 RB 5    |
 * | a4 TE 10   | b4 RB 10   | c4 WR 10   |
 *
 * Optimal per week: Me 35, Two 34, Three 35. a2 → Three, c2 → Two, b2 → Me gives Me 45 (a1 · b2 ·
 * a4), Three 45 (a2 · c4 · c1), Two 44 (b4 · b1 · c2): +10 a week for everyone.
 */
export const CYCLE_LEAGUE: SyntheticLeague = {
  currentWeek: 16,
  weeks: [16, 17],
  rosterPositions: ['RB', 'WR', 'TE', 'BN'],
  rules: rules({
    rosterSlots: [
      { slot: 'RB', count: 1 },
      { slot: 'WR', count: 1 },
      { slot: 'TE', count: 1 },
      { slot: 'BN', count: 1 }
    ],
    settings: {
      numTeams: 3,
      waiverType: 'faab',
      tradeDeadlineWeek: 17,
      playoffStartWeek: 15,
      playoffTeams: 6
    }
  }),
  teams: [
    {
      rosterId: 1,
      name: 'Me',
      isMe: true,
      players: [
        { id: 'a1', position: 'RB', weekly: 20, market: 1000 },
        { id: 'a2', position: 'RB', weekly: 15, market: 1000 },
        { id: 'a3', position: 'WR', weekly: 5, market: 1000 },
        { id: 'a4', position: 'TE', weekly: 10, market: 1000 }
      ]
    },
    {
      rosterId: 2,
      name: 'Two',
      players: [
        { id: 'b1', position: 'WR', weekly: 20, market: 1000 },
        { id: 'b2', position: 'WR', weekly: 15, market: 1000 },
        { id: 'b3', position: 'TE', weekly: 4, market: 1000 },
        { id: 'b4', position: 'RB', weekly: 10, market: 1000 }
      ]
    },
    {
      rosterId: 3,
      name: 'Three',
      players: [
        { id: 'c1', position: 'TE', weekly: 20, market: 1000 },
        { id: 'c2', position: 'TE', weekly: 14, market: 1000 },
        { id: 'c3', position: 'RB', weekly: 5, market: 1000 },
        { id: 'c4', position: 'WR', weekly: 10, market: 1000 }
      ]
    }
  ]
}
```

Append to `tests/main/trade/evaluate.test.ts` (imports: add `import { twoTeam } from '@shared/deal'`, `import type { TradeMove, TradeProposal } from '@shared/types'`, `import { CYCLE_LEAGUE, SMALL_LEAGUE, syntheticBuild } from '../../fixtures/synthetic'`):

```ts
/**
 * SMALL_LEAGUE (fixtures/synthetic.ts), window 16–17, constant weeks. Me → Rival → Other → me:
 * B to Rival, G to Other, I to me. Per week: Me A20 · I25 · FLEX C18 = 63 (was 46), Rival H3 · F19 ·
 * FLEX E17 = 39 (43), Other G7 · K6 · FLEX L9 = 22 (38). Every roster stays at 4: no drops.
 */
describe('evaluateTrade across three teams (multi-team spec §2.2)', () => {
  const { build } = syntheticBuild(SMALL_LEAGUE)
  const cycle: TradeProposal = {
    moves: [
      { playerId: 'B', to: 2 },
      { playerId: 'G', to: 3 },
      { playerId: 'I', to: 1 }
    ]
  }

  it('scores every side on its own gives and gets', () => {
    const ev = evaluateTrade(build, cycle)
    expect(ev.sides.map((s) => s.rosterId)).toEqual([1, 2, 3])
    const [me, rival, other] = ev.sides
    expect(me).toMatchObject({
      delta: 34,
      deltaPerWeek: 17,
      thisWeekDelta: 17,
      weeksChanged: 2,
      drops: []
    })
    expect(rival).toMatchObject({ delta: -8, deltaPerWeek: -4, thisWeekDelta: -4, drops: [] })
    expect(other).toMatchObject({ delta: -32, deltaPerWeek: -16, thisWeekDelta: -16, drops: [] })
    expect(me.give).toMatchObject([{ playerId: 'B', to: 2, starterWeeks: 2 }])
    // I's starts are counted on Other, the roster he leaves
    expect(me.get).toMatchObject([{ playerId: 'I', from: 3, starterWeeks: 2 }])
    expect(rival.give).toMatchObject([{ playerId: 'G', to: 3 }])
    expect(rival.get).toMatchObject([{ playerId: 'B', from: 1, starterWeeks: 2 }])
    expect(other.give).toMatchObject([{ playerId: 'I', to: 1 }])
    expect(other.get).toMatchObject([{ playerId: 'G', from: 2, starterWeeks: 2 }])
    expect(ev.sides.map((s) => [s.marketGive, s.marketGet])).toEqual([
      [1500, 7000],
      [1000, 1500],
      [7000, 1000]
    ])
    expect(ev).toMatchObject({ weeks: 2, everyoneGains: false, marketFair: false })
  })

  it('orders the other sides by first appearance and matches a full solve', () => {
    const reordered: TradeProposal = {
      moves: [
        { playerId: 'I', to: 1 },
        { playerId: 'B', to: 2 },
        { playerId: 'G', to: 3 }
      ]
    }
    expect(evaluateTrade(build, reordered).sides.map((s) => s.rosterId)).toEqual([1, 3, 2])
    expect(evaluateTrade(build, cycle, { skip: false })).toEqual(evaluateTrade(build, cycle))
  })

  it('flags a deal where everyone gains', () => {
    const { build: cycleBuild } = syntheticBuild(CYCLE_LEAGUE)
    const ev = evaluateTrade(cycleBuild, {
      moves: [
        { playerId: 'a2', to: 3 },
        { playerId: 'c2', to: 2 },
        { playerId: 'b2', to: 1 }
      ]
    })
    expect(ev.sides.map((s) => [s.rosterId, s.deltaPerWeek])).toEqual([
      [1, 10],
      [3, 10],
      [2, 10]
    ])
    expect(ev.everyoneGains).toBe(true)
    expect(ev.marketFair).toBe(true)
  })

  it('names the rule a deal breaks', () => {
    const moves: TradeMove[] = [
      { playerId: 'B', to: 2 },
      { playerId: 'G', to: 1 },
      { playerId: 'I', to: 2 }
    ]
    expect(() => evaluateTrade(build, { moves })).toThrow('Other gets nobody')
    expect(evaluateTrade(build, twoTeam(1, 3, ['B'], ['I'])).sides.map((s) => s.rosterId)).toEqual([
      1, 3
    ])
  })
})
```

- [ ] **Step 3: Run them to see them fail**

Run: `npx vitest run tests/shared/deal.test.ts tests/main/trade/evaluate.test.ts`
Expected: FAIL — `twoTeam` / `proposalOf` are not exported, and `evaluateTrade` rejects `{ moves }` (no `sides` on the result).

- [ ] **Step 4: The shared types**

In `src/shared/types.ts`, replace the `TradeProposal` interface:

```ts
/** Multi-team spec §2.1: one player changing teams; his source is his current roster. */
export interface TradeMove {
  playerId: string
  to: number
}

/** Spec §2.1: a deal between two or more teams, me included — a 2-team trade is the special case. */
export interface TradeProposal {
  moves: TradeMove[]
}
```

After `TradePlayer`, add:

```ts
/** A player a side sends, with the roster he goes to. */
export interface TradeOutgoing extends TradePlayer {
  to: number
}

/** A player a side receives, with the roster he leaves; `starterWeeks` are counted there. */
export interface TradeIncoming extends TradePlayer {
  from: number
}
```

In `TradeSideResult`, change `give: TradePlayer[]` to `give: TradeOutgoing[]` and `get: TradePlayer[]` to `get: TradeIncoming[]`.

In `TradeEvaluation`, replace `me`, `them`, `winWin` and their comments with:

```ts
  /** Spec §2.2: me first, then the other teams in order of first appearance in the proposal's moves. */
  sides: TradeSideResult[]
  /** Every side's delta > 0. */
  everyoneGains: boolean
```

and reword `marketFair`'s comment to `/** Every side receives ≥ 90 % of the market value it gives. */`.

Replace `TradeSuggestion`:

```ts
/** Why another manager would take an offer: his lineup improves, the market is fair for him, or both. */
export type TradeAcceptance = 'lineup' | 'market' | 'both'

export interface TradeSuggestion {
  /** Exactly what `trade:evaluate` returns for this proposal — the card and the builder agree. */
  evaluation: TradeEvaluation
  /** Aligned with `evaluation.sides`: null for me, why each other manager would take it. */
  acceptance: (TradeAcceptance | null)[]
}
```

Replace `TradeOpenSpots`:

```ts
/** Spec §2.4: per side of a deal, aligned with `evaluation.sides`; null when that side's after-roster is full (or its size unknown). */
export interface TradeOpenSpots {
  sides: (OpenSpot | null)[]
}
```

- [ ] **Step 5: `twoTeam` and `proposalOf`**

Append to `src/shared/deal.ts` (and add `import type { TradeEvaluation, TradeProposal } from './types'` at the top):

```ts
/** A 2-team proposal from my side: I give `give` to `partner` and get `get` from him. */
export function twoTeam(me: number, partner: number, give: string[], get: string[]): TradeProposal {
  return {
    moves: [
      ...give.map((playerId) => ({ playerId, to: partner })),
      ...get.map((playerId) => ({ playerId, to: me }))
    ]
  }
}

/** The proposal an evaluation answered: every side's given players with their destinations. */
export function proposalOf(ev: TradeEvaluation): TradeProposal {
  return {
    moves: ev.sides.flatMap((s) => s.give.map((p) => ({ playerId: p.playerId, to: p.to })))
  }
}
```

- [ ] **Step 6: `startsByRoster`**

Append to `src/main/trade/player.ts`:

```ts
/** `starterWeeks` per roster, computed on first use — for every side of one evaluation. */
export function startsByRoster(
  build: LineupBuild,
  weeks: number[]
): (rosterId: number) => Map<string, number> {
  const cache = new Map<number, Map<string, number>>()
  return (rosterId) => {
    let hit = cache.get(rosterId)
    if (!hit) {
      hit = starterWeeks(build, rosterId, weeks)
      cache.set(rosterId, hit)
    }
    return hit
  }
}
```

- [ ] **Step 7: `side.ts` — 6b's side computation, for any side of any deal**

Create `src/main/trade/side.ts`. Everything below except `DealSide`, `SideCore`, `StartsOf`, `ownerOf` and the `own` / `incoming` lines of `sideFor` is moved verbatim from `evaluate.ts`:

```ts
import { round2 } from '@main/db/repos/points'
import {
  candidateFor,
  rosterWeek,
  teamName,
  teamWeek,
  type LineupBuild,
  type TeamWeek
} from '@main/lineup/build'
import { swapsBetween } from '@main/lineup/optimal'
import { UNSTARTABLE_SLOTS } from '@main/value/roster'
import type { PlayerSeries } from '@main/value/series'
import type { Swap, Team, TradeIncoming, TradePlayer, TradeSideResult } from '@shared/types'
import { canEnter } from './enter'
import { tradePlayer } from './player'

/** Weekly totals that move by less than this are rounding, not a lineup change. */
const CHANGED_PTS = 0.01

export interface SideOptions {
  /** Tests only: `false` solves every week instead of skipping the provably unchanged ones. */
  skip?: boolean
}

/** Multi-team spec §2.2: one team's part of a deal. */
export interface DealSide {
  team: Team
  give: PlayerSeries[]
  get: PlayerSeries[]
}

/** A side's verdict before its given players carry their destinations — it depends on this side alone. */
export type SideCore = Omit<TradeSideResult, 'give'> & { give: TradePlayer[] }

/** Window starts per roster before the trade (`startsByRoster`). */
export type StartsOf = (rosterId: number) => Map<string, number>

function onReserve(s: PlayerSeries): boolean {
  return s.rosterSlot !== null && UNSTARTABLE_SLOTS.has(s.rosterSlot)
}

export function isStarter(week: TeamWeek, id: string): boolean {
  return week.optimal.some((p) => p.player?.id === id)
}

function startCounts(weeks: TeamWeek[]): Map<string, number> {
  const counts = new Map<string, number>()
  for (const week of weeks) {
    for (const placed of week.optimal) {
      if (placed.player) counts.set(placed.player.id, (counts.get(placed.player.id) ?? 0) + 1)
    }
  }
  return counts
}

function sum(values: number[]): number {
  return values.reduce((acc, v) => acc + v, 0)
}

/** Σ FantasyCalc value of a list; players outside FantasyCalc's list count 0 and are counted. */
export function marketSum(
  build: LineupBuild,
  list: PlayerSeries[]
): { total: number; unvalued: number } {
  let total = 0
  let unvalued = 0
  for (const s of list) {
    const market = build.rowById.get(s.base.playerId)?.market ?? null
    if (market) total += market.value
    else unvalued++
  }
  return { total, unvalued }
}

/** Spec 6b §2.3 week skip: false only when the week's optimal total provably stays the same. */
function mayChange(
  build: LineupBuild,
  before: TeamWeek,
  removed: string[],
  added: PlayerSeries[],
  week: number
): boolean {
  if (removed.some((id) => isStarter(before, id))) return true
  return added.some((s) => {
    const candidate = candidateFor(build, s, week)
    return candidate !== null && canEnter(candidate, build.slots, before.optimal)
  })
}

function toSwaps(after: TeamWeek, before: TeamWeek): Swap[] {
  return swapsBetween(after.optimal, before.optimal).flatMap((pair) => {
    const incoming = after.players.get(pair.in.id)?.player
    if (!incoming) return []
    const outgoing = pair.out ? (before.players.get(pair.out.id)?.player ?? null) : null
    return [{ slot: pair.slot, in: incoming, out: outgoing, delta: pair.delta }]
  })
}

/** The roster a traded player leaves; `resolveDeal` only admits rostered players. */
function ownerOf(s: PlayerSeries): number {
  if (s.base.ownerRosterId === null) throw new Error(`${s.base.playerId} is on no roster`)
  return s.base.ownerRosterId
}

/**
 * Spec 6b §2.3 for one side of any deal: window strength before and after (auto-drops included),
 * market sums, weeks changed, this week's swaps. Received players count their starts on the
 * roster they leave.
 */
export function sideFor(
  build: LineupBuild,
  side: DealSide,
  weeks: number[],
  size: number | null,
  startsOf: StartsOf,
  opts: SideOptions
): SideCore {
  const { team, give, get } = side
  const before = weeks.map((w) => teamWeek(build, team.rosterId, w))
  const giveIds = new Set(give.map((s) => s.base.playerId))
  const kept = (build.rosters.get(team.rosterId) ?? []).filter((s) => !giveIds.has(s.base.playerId))
  let after = [...kept, ...get]

  // Spec §2.3: an oversized after-roster drops the players who start least on it, then is solved again.
  let drops: PlayerSeries[] = []
  /** The oversized roster's weeks, kept so a week whose drops never started can reuse the solve. */
  let oversized: TeamWeek[] = []
  const active = after.filter((s) => !onReserve(s))
  const excess = size === null ? 0 : Math.max(0, active.length - size)
  if (excess > 0) {
    // The same week skip as below: where the lineup provably does not move, the before-optimal is
    // an optimum of the oversized roster too, so its starters are the ones to count.
    const givenIds = give.map((s) => s.base.playerId)
    oversized = weeks.map((w, i) =>
      opts.skip !== false && !mayChange(build, before[i], givenIds, get, w)
        ? before[i]
        : rosterWeek(build, after, w)
    )
    const starts = startCounts(oversized)
    const rosPoints = (s: PlayerSeries): number =>
      build.rowById.get(s.base.playerId)?.rosPoints ?? 0
    drops = [...active]
      .sort(
        (a, b) =>
          (starts.get(a.base.playerId) ?? 0) - (starts.get(b.base.playerId) ?? 0) ||
          rosPoints(a) - rosPoints(b) ||
          a.base.fullName.localeCompare(b.base.fullName)
      )
      .slice(0, excess)
    const dropIds = new Set(drops.map((s) => s.base.playerId))
    after = after.filter((s) => !dropIds.has(s.base.playerId))
  }

  const removed = [...give, ...drops].map((s) => s.base.playerId)
  const dropIds = drops.map((s) => s.base.playerId)
  const afterWeeks = weeks.map((w, i) => {
    if (opts.skip !== false && !mayChange(build, before[i], removed, get, w)) return before[i]
    // Dropping a player the oversized lineup never started cannot change that week's optimum.
    const solved = oversized[i]
    if (solved && !dropIds.some((id) => isStarter(solved, id))) return solved
    return rosterWeek(build, after, w)
  })
  const beforeTotal = sum(before.map((x) => x.optimalTotal))
  const afterTotal = sum(afterWeeks.map((x) => x.optimalTotal))
  const delta = round2(afterTotal - beforeTotal) ?? 0
  const own = startsOf(team.rosterId)
  const mine = (s: PlayerSeries): TradePlayer =>
    tradePlayer(build, s, own.get(s.base.playerId) ?? 0)
  const incoming = (s: PlayerSeries): TradeIncoming => {
    const from = ownerOf(s)
    return { ...tradePlayer(build, s, startsOf(from).get(s.base.playerId) ?? 0), from }
  }
  const giveMarket = marketSum(build, give)
  const getMarket = marketSum(build, get)
  return {
    rosterId: team.rosterId,
    name: teamName(team),
    isMe: team.isMe,
    give: give.map(mine),
    get: get.map(incoming),
    drops: drops.map(mine),
    before: round2(beforeTotal) ?? 0,
    after: round2(afterTotal) ?? 0,
    delta,
    deltaPerWeek: round2(delta / weeks.length) ?? 0,
    thisWeekDelta: round2(afterWeeks[0].optimalTotal - before[0].optimalTotal) ?? 0,
    marketGive: giveMarket.total,
    marketGet: getMarket.total,
    unvaluedGive: giveMarket.unvalued,
    unvaluedGet: getMarket.unvalued,
    weeksChanged: afterWeeks.filter(
      (x, i) => Math.abs(x.optimalTotal - before[i].optimalTotal) >= CHANGED_PTS
    ).length,
    thisWeekSwaps: toSwaps(afterWeeks[0], before[0])
  }
}
```

(`own` equals 6b's `startCounts(before)`: both count the starters of `teamWeek(build, rosterId, w)` over the window.)

- [ ] **Step 8: `evaluate.ts` — resolve the deal, score every side**

Replace `src/main/trade/evaluate.ts` with:

```ts
import { teamName, windowWeeks, type LineupBuild } from '@main/lineup/build'
import type { PlayerSeries } from '@main/value/series'
import { dealProblem, dealTeams, type DealMove } from '@shared/deal'
import type { Team, TradeEvaluation, TradeProposal, TradeSideResult } from '@shared/types'
import { startsByRoster } from './player'
import { sideFor, type DealSide, type SideOptions } from './side'

export { isStarter, marketSum } from './side'

/** Spec 6b §2.4: a side is market-fair when it receives at least this share of what it gives. */
export const MARKET_FAIR = 0.9

export type TradeErrorCode = 'NO_PROJECTIONS' | 'NO_ME' | 'INVALID_TRADE'

/** Spec 6b §4.2 / §6: the message is what the renderer shows; the code is for tests and callers in main. */
export class TradeError extends Error {
  constructor(
    readonly code: TradeErrorCode,
    message: string
  ) {
    super(message)
    this.name = 'TradeError'
  }
}

export type EvaluateOptions = SideOptions

export function myTeam(build: LineupBuild): Team {
  const me = build.inputs.teams.find((t) => t.isMe)
  if (!me) throw new TradeError('NO_ME', "Your team isn't identified — re-import from Setup")
  return me
}

export function requireWindow(build: LineupBuild): number[] {
  const weeks = windowWeeks(build)
  if (weeks.length === 0) {
    throw new TradeError(
      'NO_PROJECTIONS',
      'No projections stored for this season — trades and waivers are valued on the remaining weeks'
    )
  }
  return weeks
}

/** Spec §2.3: roster spots that count against the league's size — everything but IR and taxi; null when Sleeper's list is unknown. */
export function rosterSize(build: LineupBuild): number | null {
  const positions = build.inputs.rosterPositions
  return positions ? positions.filter((p) => p !== 'IR' && p !== 'TAXI').length : null
}

export function marketRatio(side: { marketGive: number; marketGet: number }): number {
  return side.marketGive === 0 ? Number.POSITIVE_INFINITY : side.marketGet / side.marketGive
}

/** Multi-team spec §2.1: a proposal checked against the rosters — its sides, me first, and each player's destination. */
export interface ResolvedDeal {
  sides: DealSide[]
  to: Map<string, number>
}

export function resolveDeal(build: LineupBuild, proposal: TradeProposal): ResolvedDeal {
  const me = myTeam(build)
  const teams = new Map(build.inputs.teams.map((t) => [t.rosterId, t]))
  const owned = new Map<string, { rosterId: number; series: PlayerSeries }>()
  for (const [rosterId, roster] of build.rosters) {
    for (const series of roster) owned.set(series.base.playerId, { rosterId, series })
  }
  const moves: DealMove[] = proposal.moves.map((m) => {
    const hit = owned.get(m.playerId)
    if (!hit) {
      const name = build.inputs.value.series.get(m.playerId)?.base.fullName ?? m.playerId
      throw new TradeError('INVALID_TRADE', `${name} is not on a roster in this league`)
    }
    if (!teams.has(m.to)) {
      throw new TradeError('INVALID_TRADE', `Team ${m.to} is not in this league`)
    }
    return { playerId: m.playerId, from: hit.rosterId, to: m.to }
  })
  const order = dealTeams(moves)
  const problem = dealProblem(
    order,
    moves,
    me.rosterId,
    (rosterId) => {
      const t = teams.get(rosterId)
      return t ? teamName(t) : `Team ${rosterId}`
    },
    (playerId) => owned.get(playerId)?.series.base.fullName ?? playerId
  )
  if (problem !== null) throw new TradeError('INVALID_TRADE', problem)
  const series = (m: DealMove): PlayerSeries[] => {
    const hit = owned.get(m.playerId)
    return hit ? [hit.series] : []
  }
  const sides = [me.rosterId, ...order.filter((id) => id !== me.rosterId)].flatMap(
    (rosterId): DealSide[] => {
      const team = teams.get(rosterId)
      if (!team) return []
      return [
        {
          team,
          give: moves.filter((m) => m.from === rosterId).flatMap(series),
          get: moves.filter((m) => m.to === rosterId).flatMap(series)
        }
      ]
    }
  )
  return { sides, to: new Map(moves.map((m) => [m.playerId, m.to])) }
}

/** Multi-team spec §2.2: every side's window strength before and after, drops, market sums, verdict flags. */
export function evaluateTrade(
  build: LineupBuild,
  proposal: TradeProposal,
  opts: EvaluateOptions = {}
): TradeEvaluation {
  const weeks = requireWindow(build)
  const deal = resolveDeal(build, proposal)
  const size = rosterSize(build)
  const startsOf = startsByRoster(build, weeks)
  const destination = (playerId: string): number => {
    const to = deal.to.get(playerId)
    if (to === undefined) throw new Error(`No destination for ${playerId}`)
    return to
  }
  const sides = deal.sides.map((side): TradeSideResult => {
    const core = sideFor(build, side, weeks, size, startsOf, opts)
    return { ...core, give: core.give.map((p) => ({ ...p, to: destination(p.playerId) })) }
  })
  const { season, currentWeek, lastWeek } = build.inputs.value.context
  const deadline = build.inputs.tradeDeadlineWeek
  return {
    season,
    currentWeek,
    lastWeek,
    weeks: weeks.length,
    tradeDeadlinePassed: deadline !== null && currentWeek > deadline,
    sides,
    everyoneGains: sides.every((s) => s.delta > 0),
    marketFair: sides.every((s) => marketRatio(s) >= MARKET_FAIR)
  }
}
```

(`starterWeeks` / `tradePlayer` are no longer imported here; `pool.ts`, `waiver/*` and `suggest.ts` keep importing `myTeam`, `requireWindow`, `rosterSize`, `isStarter`, `marketSum`, `MARKET_FAIR`, `marketRatio`, `TradeError` from `./evaluate` unchanged.)

- [ ] **Step 9: Open spots per side**

In `src/main/trade/openSpot.ts`, replace the body of `tradeOpenSpots` and its comment:

```ts
/** Spec §2.4: each side's open-spot add, aligned with the evaluation's sides; the verdict itself is unchanged. */
export function tradeOpenSpots(build: LineupBuild, proposal: TradeProposal): TradeOpenSpots {
  const ev = evaluateTrade(build, proposal)
  const weeks = requireWindow(build)
  return {
    sides: ev.sides.map((side) =>
      openSpotFor(build, weeks, side.rosterId, afterRoster(build, side))
    )
  }
}
```

(the local `spot` helper goes; the `TradeSideResult` import stays for `afterRoster`).

- [ ] **Step 10: The 2-team search on the new types**

In `src/main/trade/suggest.ts`:

- Imports: add `import { twoTeam } from '@shared/deal'`; add `TradeAcceptance` to the `@shared/types` type import.
- `acceptanceOf`'s return type: `TradeAcceptance | null`.
- `consider` takes `me: Team` right after `build`, and its evaluation part becomes:

```ts
const evaluation = evaluateTrade(
  build,
  twoTeam(me.rosterId, partner.rosterId, ids(give), ids(get)),
  { skip: opts.skip }
)
const [mine, theirs] = evaluation.sides
if (!passesStance(stance, mine.deltaPerWeek, marketRatio(mine))) {
  return { evaluation, theirMarket }
}
const acceptance = acceptanceOf(theirs.delta, marketRatio(theirs), theirs.deltaPerWeek)
return {
  evaluation,
  theirMarket,
  suggestion: acceptance === null ? undefined : { evaluation, acceptance: [null, acceptance] }
}
```

- Its three call sites in `suggestTrades` pass `me` (already in scope): `consider(build, me, partner, give, get, query.stance, entersTheirs, opts, true)` and the two without `true`.
- `record`:

```ts
const record = (give: string, get: string, ev: TradeEvaluation, passed: boolean): void => {
  const [mine, theirs] = ev.sides
  singles.set(key(give, get), {
    mine: mine.delta,
    minePerWeek: mine.deltaPerWeek,
    theirs: theirs.delta,
    myDrops: mine.drops.length,
    theirDrops: theirs.drops.length,
    passed
  })
}
```

- Both `dominated(r.suggestion.evaluation.me.delta, keys)` become `dominated(r.suggestion.evaluation.sides[0].delta, keys)`.
- The sort:

```ts
found.sort(
  (a, b) =>
    desc(a.evaluation.sides[0].delta, b.evaluation.sides[0].delta) ||
    desc(marketRatio(a.evaluation.sides[0]), marketRatio(b.evaluation.sides[0])) ||
    a.evaluation.sides[1].name.localeCompare(b.evaluation.sides[1].name)
)
```

- [ ] **Step 11: The renderer, still 2-team**

`src/renderer/src/lib/tradeView.ts`:

```ts
export function verdictBadges(ev: TradeEvaluation): { label: string; on: boolean }[] {
  return [
    { label: 'Everyone gains', on: ev.everyoneGains },
    { label: 'Market-fair', on: ev.marketFair }
  ]
}
```

```ts
/** "Me +4.00 (+0.27/wk)" */
export function meLine(s: TradeSuggestion): string {
  return `Me ${deltaLine(s.evaluation.sides[0])}`
}

/** "Them -4.00" */
export function themLine(s: TradeSuggestion): string {
  return `Them ${fmtSigned(s.evaluation.sides[1].delta)}`
}

export function acceptanceTags(s: TradeSuggestion): string[] {
  const a = s.acceptance[1]
  return a === null ? [] : a === 'both' ? ['lineup', 'market'] : [a]
}
```

and in `offerLine`, `const me = s.evaluation.sides[0]`.

`src/renderer/src/screens/TradeScreen.tsx`:

- Import `import { proposalOf, twoTeam } from '@shared/deal'`.
- `VerdictCard`: the two `SideVerdict`s become

```tsx
{
  ev.sides.map((side, i) => (
    <SideVerdict key={side.rosterId} side={side} spot={spots?.sides[i] ?? null} />
  ))
}
```

and both `ev.me.thisWeekSwaps` become `ev.sides[0].thisWeekSwaps`.

- `SuggestionRow`: `const [me, them] = suggestion.evaluation.sides`.
- `suggestionKey`:

```tsx
function suggestionKey(s: TradeSuggestion): string {
  const ids = (list: TradePlayer[]): string => list.map((p) => p.playerId).join('+')
  const [me, them] = s.evaluation.sides
  return `${them.rosterId}:${ids(me.give)}:${ids(me.get)}`
}
```

- The open-spot effect calls `api.trade.openSpot(verdict.season, proposalOf(verdict))`.
- `evaluate()`: guard `if (season === null || partner === null || !pool) return` and call `api.trade.evaluate(season, twoTeam(pool.me.rosterId, partner, give, get))`.
- `openInBuilder`:

```tsx
const openInBuilder = (s: TradeSuggestion): void => {
  const [me, them] = s.evaluation.sides
  setPartner(them.rosterId)
  setGive(me.give.map((p) => p.playerId))
  setGet(me.get.map((p) => p.playerId))
  setVerdict(s.evaluation)
  setEvalError(null)
  builderRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
}
```

- [ ] **Step 12: Fixtures**

`tests/fixtures/trade.ts`: the type import gains `TradeIncoming, TradeOutgoing`. After the player constants (`bijan`), add:

```ts
export const outgoing = (p: TradePlayer, to: number): TradeOutgoing => ({ ...p, to })
export const incoming = (p: TradePlayer, from: number): TradeIncoming => ({ ...p, from })
```

In `tradeSide`, the defaults become `give: [outgoing(jefferson, 2)]` and `get: [incoming(chase, 2)]`. After `tradeSide`, add:

```ts
/** Rival's side of Jefferson for Chase. */
export function rivalSide(over: Partial<TradeSideResult> = {}): TradeSideResult {
  return tradeSide({
    rosterId: 2,
    name: 'Rival',
    isMe: false,
    give: [outgoing(chase, 1)],
    get: [incoming(jefferson, 1)],
    before: 9,
    after: 28,
    delta: 19,
    deltaPerWeek: 1.27,
    thisWeekDelta: 4,
    marketGive: 8000,
    marketGet: 10512,
    ...over
  })
}
```

In `tradeEvaluation`, replace `me: …, them: …, winWin: false,` with `sides: [tradeSide(), rivalSide()], everyoneGains: false,`. Replace `tradeSuggestion` with:

```ts
/** Barkley for Chase: +4 over the window for me, −4 for Rival, who takes it on the market (1.17). */
export function tradeSuggestion(over: Partial<TradeSuggestion> = {}): TradeSuggestion {
  return {
    evaluation: tradeEvaluation({
      sides: [
        tradeSide({
          give: [outgoing(barkley, 2)],
          get: [incoming(chase, 2)],
          before: 66,
          after: 70,
          delta: 4,
          deltaPerWeek: 0.27,
          thisWeekDelta: 1,
          marketGive: 9340,
          marketGet: 8000,
          weeksChanged: 3
        }),
        rivalSide({
          give: [outgoing(chase, 1)],
          get: [incoming(barkley, 1)],
          before: 30,
          after: 26,
          delta: -4,
          deltaPerWeek: -0.27,
          thisWeekDelta: -1,
          marketGive: 8000,
          marketGet: 9340,
          weeksChanged: 3
        })
      ],
      everyoneGains: false,
      marketFair: false // 8 000 / 9 340 = 0.86 on my side
    }),
    acceptance: [null, 'market'],
    ...over
  }
}
```

- [ ] **Step 13: Move the existing tests to the new shapes**

`tests/main/trade/evaluate.test.ts` (first `describe`, on the seeded fixture league; add `import type { TradeMove } from '@shared/types'` if Step 2 did not):

- `scores Jefferson for Chase…`: `const ev = evaluateTrade(build, twoTeam(1, 2, ['6794'], ['7564']))`; `winWin: false` → `everyoneGains: false`; add `const [me, them] = ev.sides` and replace every `ev.me` with `me`, every `ev.them` with `them`; add `expect(me.give[0].to).toBe(2)` and `expect(me.get[0].from).toBe(2)` after the id checks.
- `matches a full solve…` becomes:

```ts
it('matches a full solve of every week (the week skip is exact)', () => {
  const trades: [string[], string[]][] = [
    [['6794'], ['7564']],
    [['LAR'], ['9509']], // 0-value defense for a taxi player
    [
      ['4866', 'LAR'],
      ['7564', '9509']
    ],
    [['8259'], ['9509']] // IR for taxi: nothing changes
  ]
  for (const [give, get] of trades) {
    const p = twoTeam(1, 2, give, get)
    const skipped = evaluateTrade(build, p)
    const full = evaluateTrade(build, p, { skip: false })
    const [mine, theirs] = skipped.sides
    expect([mine.delta, theirs.delta, mine.weeksChanged]).toEqual([
      full.sides[0].delta,
      full.sides[1].delta,
      full.sides[0].weeksChanged
    ])
    // and the after total is what rosterWeek says on the swapped roster
    const kept = (build.rosters.get(1) ?? []).filter((s) => !give.includes(s.base.playerId))
    const got = get.map((id) => build.inputs.value.series.get(id)).flatMap((s) => (s ? [s] : []))
    let after = 0
    for (let w = 3; w <= 17; w++) after += rosterWeek(build, [...kept, ...got], w).optimalTotal
    expect(mine.after).toBeCloseTo(after, 2)
  }
  const ir = evaluateTrade(build, twoTeam(1, 2, ['8259'], ['9509']))
  expect(ir.sides[0].delta).toBe(0)
  expect(ir.sides[0].weeksChanged).toBe(0)
  expect(ir.sides[0].get[0].reserve).toBe('taxi')
})
```

- `auto-drops…`: `evaluateTrade(small, twoTeam(1, 2, ['6794'], ['7564']))`; `ev.me` → `ev.sides[0]`, `ev.them` → `ev.sides[1]`.
- `sums market values…`: `evaluateTrade(priced, twoTeam(1, 2, ['6794', 'LAR'], ['7564']))`, `evaluateTrade(build, twoTeam(1, 2, ['6794'], ['7564']))`; `ev.me` / `blind.me` → `.sides[0]`, `ev.them` → `ev.sides[1]`.
- `rejects malformed proposals…` becomes:

```ts
it('rejects malformed proposals with INVALID_TRADE (multi-team spec §2.1)', () => {
  const invalid = (moves: TradeMove[]): string => codeOf(() => evaluateTrade(build, { moves }))
  const chaseToMe: TradeMove = { playerId: '7564', to: 1 }
  expect(invalid([])).toBe('INVALID_TRADE')
  expect(invalid([{ playerId: '6794', to: 9 }, chaseToMe])).toBe('INVALID_TRADE')
  expect(invalid([{ playerId: '6794', to: 1 }, chaseToMe])).toBe('INVALID_TRADE')
  expect(invalid([{ playerId: '6794', to: 2 }])).toBe('INVALID_TRADE')
  expect(invalid([chaseToMe])).toBe('INVALID_TRADE')
  expect(invalid([{ playerId: '6794', to: 2 }, { playerId: '6794', to: 2 }, chaseToMe])).toBe(
    'INVALID_TRADE'
  )
  expect(invalid([{ playerId: 'nobody', to: 2 }, chaseToMe])).toBe('INVALID_TRADE')
  expect(() => evaluateTrade(build, { moves: [{ playerId: 'nobody', to: 2 }, chaseToMe] })).toThrow(
    'nobody is not on a roster in this league'
  )
  expect(() => evaluateTrade(build, { moves: [{ playerId: '6794', to: 2 }] })).toThrow(
    'Cook Book gets nobody'
  )
  expect(() => evaluateTrade(build, { moves: [{ playerId: '6794', to: 9 }, chaseToMe] })).toThrow(
    'Team 9 is not in this league'
  )
})
```

- `throws NO_PROJECTIONS…`: `const proposal = twoTeam(1, 2, ['6794'], ['7564'])`.
- `flags a passed trade deadline`: `evaluateTrade(late, twoTeam(1, 2, ['6794'], ['7564'])).tradeDeadlinePassed`.
- The `trade player rows` describe is unchanged.

`tests/main/trade/openSpot.test.ts` — the first two tests become:

```ts
it('finds the best free agent for each side a trade leaves short', () => {
  const { build } = syntheticBuild(WAIVER_LEAGUE)
  const [me, them] = tradeOpenSpots(build, twoTeam(1, 2, ['C', 'D'], ['R2'])).sides
  expect(me).toMatchObject({ rosterId: 1, deltaPerWeek: 2.5 })
  expect(me?.add).toMatchObject({ playerId: 'Y', starterWeeks: 0 })
  expect(them).toMatchObject({ rosterId: 2, deltaPerWeek: 10 })
  expect(them?.add?.playerId).toBe('Y')
})

it('reads the after-roster from the evaluation, auto-drops included', () => {
  const { build } = syntheticBuild(WAIVER_LEAGUE)
  const proposal = twoTeam(1, 2, ['D'], ['R1', 'R2'])
  const [mine, theirs] = evaluateTrade(build, proposal).sides
  expect(mine.drops).toHaveLength(1)
  const dropped = mine.drops[0].playerId
  expect(ids(afterRoster(build, mine))).toEqual(
    ['A', 'B', 'C', 'R1', 'R2'].filter((id) => id !== dropped)
  )
  expect(ids(afterRoster(build, theirs))).toEqual(['D'])
  const spots = tradeOpenSpots(build, proposal).sides
  expect(spots[0]).toBeNull()
  expect(spots[1]).toMatchObject({ rosterId: 2, deltaPerWeek: 14 })
  expect(spots[1]?.add?.playerId).toBe('Y')
})
```

(with `import { twoTeam } from '@shared/deal'`).

`tests/main/trade/openSpotBudget.test.ts`: `const proposal = twoTeam(mine.rosterId, theirs.rosterId, [mine.players[2].id, mine.players[3].id], [theirs.players[2].id])`, `const [me, them] = spots.sides` after the timing, the log line uses `me?.add?.fullName` and `them ? 'open' : 'full'`, and `expect(me).not.toBeNull()` (import `twoTeam`).

`tests/main/engine/jobs.test.ts`: `const proposal = twoTeam(1, 2, ['C', 'D'], ['R2'])` (import `twoTeam`).

`tests/main/trade/suggest.test.ts` (import `proposalOf, twoTeam` from `@shared/deal`):

- `shape`:

```ts
const shape = (s: TradeSuggestion): string => {
  const ids = (list: { playerId: string }[]): string =>
    list
      .map((p) => p.playerId)
      .sort()
      .join('+')
  const [me, them] = s.evaluation.sides
  return `${ids(me.give)}→${ids(me.get)}@${them.rosterId}`
}
```

- In `finds the offers…`, everything after `const [abi, cf] = out`:

```ts
expect(abi.acceptance).toEqual([null, 'market'])
expect(abi.evaluation.sides[0]).toMatchObject({ delta: 4, deltaPerWeek: 2, drops: [] })
expect(abi.evaluation.sides[1].delta).toBe(-2)
expect(abi.evaluation.sides[1].drops.map((p) => p.playerId)).toEqual(['J'])
expect(cf.acceptance).toEqual([null, 'market'])
expect(cf.evaluation.sides[0]).toMatchObject({ delta: 2, deltaPerWeek: 1 })
expect(cf.evaluation.sides[1].delta).toBe(-2)
// a suggestion carries exactly what the builder would compute for it
for (const s of out) expect(evaluateTrade(build, proposalOf(s.evaluation))).toEqual(s.evaluation)
```

- In `applies the stance on my side only`:

```ts
expect(overpay.slice(2).map((s) => s.acceptance)).toEqual([
  [null, 'both'],
  [null, 'both']
])
expect(overpay.slice(2).map((s) => s.evaluation.sides[0].delta)).toEqual([-2, -2])
```

- In `picks the same drops on an overflowing roster…`:

```ts
const proposal = twoTeam(
  1,
  2,
  [me[0].base.playerId],
  [them[0].base.playerId, them[1].base.playerId]
)
const fast = evaluateTrade(build, proposal)
expect(fast.sides[0].drops).toHaveLength(1)
```

`tests/renderer/lib/tradeView.test.ts` (import `incoming, outgoing, rivalSide` from the fixtures):

```ts
it('lists the verdict badges', () => {
  expect(verdictBadges(tradeEvaluation())).toEqual([
    { label: 'Everyone gains', on: false },
    { label: 'Market-fair', on: false }
  ])
  expect(verdictBadges(tradeEvaluation({ everyoneGains: true, marketFair: true }))).toEqual([
    { label: 'Everyone gains', on: true },
    { label: 'Market-fair', on: true }
  ])
})
```

and in `describes a suggestion row`: `acceptanceTags(tradeSuggestion({ acceptance: [null, 'both'] }))`, and

```ts
const withDrop = tradeSuggestion({
  evaluation: tradeEvaluation({
    sides: [
      tradeSide({
        give: [outgoing(barkley, 2), outgoing(jefferson, 2)],
        get: [incoming(chase, 2)],
        drops: [lar]
      }),
      rivalSide()
    ]
  })
})
```

`tests/renderer/components/TradeScreen.test.tsx` (import `rivalSide`):

- `beforeEach`: `openSpotMock.mockResolvedValue({ sides: [null, null] })`.
- The first test's evaluation: `tradeEvaluation({ sides: [tradeSide({ drops: [lar], thisWeekSwaps: [ … unchanged … ] }), rivalSide()] })`.
- Both `toHaveBeenCalledWith(2026, { rosterId: 2, give: ['6794'], get: ['7564'] })` become `toHaveBeenCalledWith(2026, { moves: [{ playerId: '6794', to: 2 }, { playerId: '7564', to: 1 }] })`.
- `screen.getByText('Win-win')` → `screen.getByText('Everyone gains')`.
- The open-spot answer: `{ sides: [{ rosterId: 1, add: bijan, deltaPerWeek: 0.8 }, { rosterId: 2, add: null, deltaPerWeek: 0 }] }`.

Then run `npm run typecheck` — it must name nothing: any `.me` / `.them` / `winWin` / `{ rosterId, give, get }` proposal the lists above missed shows up here.

- [ ] **Step 14: Run everything**

Run: `npm run typecheck && npm run lint && npm test`
Expected: PASS — the new three-team tests and every migrated test with unchanged numbers.

- [ ] **Step 15: Commit**

```bash
git add src/shared src/main/trade src/renderer/src/lib/tradeView.ts src/renderer/src/screens/TradeScreen.tsx tests
git commit -m "feat(trade): evaluate deals between N teams"
```

---

### Task 3: Side memo

**Files:**

- Modify: `src/main/trade/side.ts`, `src/main/trade/evaluate.ts`
- Test: `tests/main/trade/evaluate.test.ts`

**Interfaces:**

- Consumes: Task 2's `sideFor`, `DealSide`, `SideCore`.
- Produces: `SideMemo = Map<string, SideCore>`; `sideKey(rosterId: number, give: PlayerSeries[], get: PlayerSeries[]): string` (`"1|B|I"`: ids sorted, `+`-joined); `sideFor(build, side, weeks, size, startsOf, opts, memo: SideMemo | null = null)`; `EvaluateOptions { skip?: boolean; memo?: SideMemo }` — Plan R's search passes one memo per run.

- [ ] **Step 1: Write the failing test**

Add to the three-team describe in `tests/main/trade/evaluate.test.ts` (import `type SideMemo` from `@main/trade/side`):

```ts
it('shares side verdicts through a memo, destinations aside (spec §2.3)', () => {
  const memo: SideMemo = new Map()
  const first = evaluateTrade(build, cycle, { memo })
  expect([...memo.keys()]).toEqual(['1|B|I', '2|G|B', '3|I|G'])
  expect(evaluateTrade(build, cycle, { memo })).toEqual(first)
  expect(evaluateTrade(build, cycle)).toEqual(first)
  // B for I straight with Other: my side comes from the memo, Other's is new, B now goes to Other
  const direct = evaluateTrade(build, twoTeam(1, 3, ['B'], ['I']), { memo })
  expect(memo.size).toBe(4)
  expect(direct.sides[0]).toEqual({
    ...first.sides[0],
    give: [{ ...first.sides[0].give[0], to: 3 }]
  })
})
```

- [ ] **Step 2: Run it to see it fail**

Run: `npx vitest run tests/main/trade/evaluate.test.ts -t memo`
Expected: FAIL — `expected [] to deeply equal [ '1|B|I', '2|G|B', '3|I|G' ]` (Vitest strips the type import and `evaluateTrade` ignores the option; `npm run typecheck` also flags the missing `SideMemo` export).

- [ ] **Step 3: Implement**

In `src/main/trade/side.ts`: rename `export function sideFor(` to `function computeSide(` (body unchanged) and add after it:

```ts
/** Multi-team spec §2.3: side verdicts by `sideKey`, shared for one evaluation or one search run. */
export type SideMemo = Map<string, SideCore>

/** `rosterId|gives|gets`, ids sorted — a side's verdict depends on nothing else. */
export function sideKey(rosterId: number, give: PlayerSeries[], get: PlayerSeries[]): string {
  const ids = (list: PlayerSeries[]): string =>
    list
      .map((s) => s.base.playerId)
      .sort()
      .join('+')
  return `${rosterId}|${ids(give)}|${ids(get)}`
}

/** `computeSide` through the memo when one is given. */
export function sideFor(
  build: LineupBuild,
  side: DealSide,
  weeks: number[],
  size: number | null,
  startsOf: StartsOf,
  opts: SideOptions,
  memo: SideMemo | null = null
): SideCore {
  if (memo === null) return computeSide(build, side, weeks, size, startsOf, opts)
  const key = sideKey(side.team.rosterId, side.give, side.get)
  const hit = memo.get(key)
  if (hit) return hit
  const core = computeSide(build, side, weeks, size, startsOf, opts)
  memo.set(key, core)
  return core
}
```

In `src/main/trade/evaluate.ts`: import `type SideMemo` from `./side`, replace `export type EvaluateOptions = SideOptions` with

```ts
export interface EvaluateOptions extends SideOptions {
  /** Multi-team spec §2.3: reuse side verdicts across calls (one search run); none by default. */
  memo?: SideMemo
}
```

and call `sideFor(build, side, weeks, size, startsOf, opts, opts.memo ?? null)`.

- [ ] **Step 4: Run it to see it pass**

Run: `npx vitest run tests/main/trade/evaluate.test.ts`
Expected: PASS.

- [ ] **Step 5: Verify and commit**

```bash
npm run typecheck && npm run lint && npm test
git add src/main/trade/side.ts src/main/trade/evaluate.ts tests/main/trade/evaluate.test.ts
git commit -m "feat(trade): memoize side verdicts"
```

---

### Task 4: Builder model

**Files:**

- Create: `src/renderer/src/lib/tradeBuilder.ts`
- Modify: `src/renderer/src/lib/tradeView.ts` (`NO_VERDICT_HINT`, `verdictGetsLine`)
- Modify: `tests/fixtures/trade.ts` (`higgins`, `threeTeamPool`, `threeTeamEvaluation`)
- Test: `tests/renderer/lib/tradeBuilder.test.ts`, `tests/renderer/lib/tradeView.test.ts`, `tests/renderer/components/TradeScreen.test.tsx` (the hint string only)

**Interfaces:**

- Consumes: Task 1's `dealProblem`, `DealMove`; Task 2's types.
- Produces (`@/lib/tradeBuilder`): `BuilderPick { playerId: string; from: number; to: number | null }`; `BuilderDeal { teams: number[]; picks: BuilderPick[] }`; `EMPTY_DEAL`; `teamLabel(pool, rosterId): string` (`'Me'` for me); `destinationOf(deal, pick, me): number | null`; `dealMoves(deal, me): DealMove[]`; `proposalFrom(deal, me): TradeProposal`; `addTeam(deal, rosterId)`, `removeTeam(deal, rosterId)`, `addPick(deal, playerId, from)`, `removePick(deal, playerId)`, `setDestination(deal, playerId, to)` → `BuilderDeal`; `dealOf(ev: TradeEvaluation): BuilderDeal`; `pruneDeal(deal, pool): BuilderDeal`; `builderProblem(deal, pool): string | null`; `getsLine(deal, rosterId, pool): string`.
- Produces (`@/lib/tradeView`): `verdictGetsLine(side: TradeSideResult, ev: TradeEvaluation): string`; `NO_VERDICT_HINT = 'Add players to every team in the deal and evaluate.'`.
- Produces (fixtures): `higgins` (`5859`, Tee Higgins, WR, CIN); `threeTeamPool()` (me 1 _Cook Book_: Barkley, Cook, Jefferson, LAR · 2 _Rival_: Bijan, Chase · 3 _Tank Mode_: Higgins); `threeTeamEvaluation()` (Jefferson → Rival, Chase → Tank Mode, Higgins → me; Δ +6.00 / +3.00 / −1.50, Δ/week +0.40 / +0.20 / −0.10).

- [ ] **Step 1: Fixtures**

Append to `tests/fixtures/trade.ts`:

```ts
export const higgins = tradePlayer({
  playerId: '5859',
  fullName: 'Tee Higgins',
  position: 'WR',
  team: 'CIN',
  rosPoints: 90,
  starterWeeks: 12
})

/** The default pool plus a third team, Tank Mode, holding Higgins. */
export function threeTeamPool(): TradePool {
  return tradePool({
    teams: [
      { rosterId: 2, name: 'Rival', players: [bijan, chase] },
      { rosterId: 3, name: 'Tank Mode', players: [higgins] }
    ]
  })
}

/** Me → Rival → Tank Mode → me: Jefferson to Rival, Chase to Tank Mode, Higgins to me. */
export function threeTeamEvaluation(): TradeEvaluation {
  return tradeEvaluation({
    sides: [
      tradeSide({
        give: [outgoing(jefferson, 2)],
        get: [incoming(higgins, 3)],
        delta: 6,
        deltaPerWeek: 0.4
      }),
      rivalSide({
        give: [outgoing(chase, 3)],
        get: [incoming(jefferson, 1)],
        delta: 3,
        deltaPerWeek: 0.2
      }),
      tradeSide({
        rosterId: 3,
        name: 'Tank Mode',
        isMe: false,
        give: [outgoing(higgins, 1)],
        get: [incoming(chase, 2)],
        delta: -1.5,
        deltaPerWeek: -0.1
      })
    ]
  })
}
```

- [ ] **Step 2: Write the failing tests**

`tests/renderer/lib/tradeBuilder.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  EMPTY_DEAL,
  addPick,
  addTeam,
  builderProblem,
  dealMoves,
  dealOf,
  destinationOf,
  getsLine,
  proposalFrom,
  pruneDeal,
  removePick,
  removeTeam,
  setDestination,
  teamLabel,
  type BuilderDeal
} from '@/lib/tradeBuilder'
import { bijan, higgins, threeTeamEvaluation, threeTeamPool, tradePool } from '../../fixtures/trade'

const pool = threeTeamPool()
/** Jefferson → Rival (default), Chase → Tank Mode (picked), Higgins → me (default). */
const cycle: BuilderDeal = {
  teams: [2, 3],
  picks: [
    { playerId: '6794', from: 1, to: null },
    { playerId: '7564', from: 2, to: 3 },
    { playerId: '5859', from: 3, to: null }
  ]
}

describe('trade builder deal (multi-team spec §5.1)', () => {
  it('sends my players to the first other team and everyone else’s to me by default', () => {
    expect(cycle.picks.map((p) => destinationOf(cycle, p, 1))).toEqual([2, 3, 1])
    expect(proposalFrom(cycle, 1)).toEqual({
      moves: [
        { playerId: '6794', to: 2 },
        { playerId: '7564', to: 3 },
        { playerId: '5859', to: 1 }
      ]
    })
    // with no other team my players have nowhere to go yet: left out of the moves
    const alone: BuilderDeal = { teams: [], picks: [{ playerId: '6794', from: 1, to: null }] }
    expect(destinationOf(alone, alone.picks[0], 1)).toBeNull()
    expect(dealMoves(alone, 1)).toEqual([])
  })

  it('adds and removes teams and players', () => {
    let deal = addTeam(EMPTY_DEAL, 2)
    expect(addTeam(deal, 2)).toBe(deal)
    deal = addPick(deal, '6794', 1)
    expect(addPick(deal, '6794', 1)).toBe(deal)
    deal = setDestination(addPick(addTeam(deal, 3), '5859', 3), '5859', 2)
    expect(deal).toEqual({
      teams: [2, 3],
      picks: [
        { playerId: '6794', from: 1, to: null },
        { playerId: '5859', from: 3, to: 2 }
      ]
    })
    expect(removePick(deal, '6794').picks.map((p) => p.playerId)).toEqual(['5859'])
  })

  it('drops what a removed team sends and re-targets what was headed to it', () => {
    expect(removeTeam(cycle, 3)).toEqual({
      teams: [2],
      picks: [
        { playerId: '6794', from: 1, to: null },
        { playerId: '7564', from: 2, to: null }
      ]
    })
    // removing the last other team keeps my picks, waiting for a destination
    expect(removeTeam(removeTeam(cycle, 3), 2)).toEqual({
      teams: [],
      picks: [{ playerId: '6794', from: 1, to: null }]
    })
  })

  it('opens an evaluation as a deal', () => {
    expect(dealOf(threeTeamEvaluation())).toEqual({
      teams: [2, 3],
      picks: [
        { playerId: '6794', from: 1, to: 2 },
        { playerId: '7564', from: 2, to: 3 },
        { playerId: '5859', from: 3, to: 1 }
      ]
    })
  })

  it('keeps what still exists after a sync', () => {
    // Tank Mode gone: its pick leaves, Chase heads back to me
    expect(pruneDeal(cycle, tradePool())).toEqual({
      teams: [2],
      picks: [
        { playerId: '6794', from: 1, to: null },
        { playerId: '7564', from: 2, to: null }
      ]
    })
    // Chase no longer on Rival
    const moved = tradePool({
      teams: [
        { rosterId: 2, name: 'Rival', players: [bijan] },
        { rosterId: 3, name: 'Tank Mode', players: [higgins] }
      ]
    })
    expect(pruneDeal(cycle, moved).picks.map((p) => p.playerId)).toEqual(['6794', '5859'])
  })

  it('checks the deal with the main process’s rule', () => {
    expect(builderProblem(cycle, pool)).toBeNull()
    expect(builderProblem(EMPTY_DEAL, pool)).toBe('Pick at least one other team')
    expect(
      builderProblem({ teams: [2], picks: [{ playerId: '6794', from: 1, to: null }] }, pool)
    ).toBe('Cook Book gets nobody')
    expect(
      builderProblem(
        {
          teams: [2, 3],
          picks: [
            { playerId: '6794', from: 1, to: null },
            { playerId: '7564', from: 2, to: null }
          ]
        },
        pool
      )
    ).toBe('Tank Mode sends nobody')
  })

  it('writes the gets line, naming sources only with three teams or more', () => {
    expect(getsLine(cycle, 1, pool)).toBe('gets: Tee Higgins (Tank Mode)')
    expect(getsLine(cycle, 2, pool)).toBe('gets: Justin Jefferson (Me)')
    const two: BuilderDeal = { teams: [2], picks: [{ playerId: '6794', from: 1, to: null }] }
    expect(getsLine(two, 2, pool)).toBe('gets: Justin Jefferson')
    expect(getsLine(two, 1, pool)).toBe('gets: nobody')
    expect(teamLabel(pool, 1)).toBe('Me')
    expect(teamLabel(pool, 3)).toBe('Tank Mode')
  })
})
```

In `tests/renderer/lib/tradeView.test.ts` (import `verdictGetsLine` and `threeTeamEvaluation`), add:

```ts
it('names where each received player comes from', () => {
  const ev = threeTeamEvaluation()
  expect(ev.sides.map((s) => verdictGetsLine(s, ev))).toEqual([
    'gets Tee Higgins from Tank Mode',
    'gets Justin Jefferson from me',
    "gets Ja'Marr Chase from Rival"
  ])
})
```

- [ ] **Step 3: Run them to see them fail**

Run: `npx vitest run tests/renderer/lib/tradeBuilder.test.ts tests/renderer/lib/tradeView.test.ts`
Expected: FAIL — `@/lib/tradeBuilder` does not resolve; `verdictGetsLine` is not exported.

- [ ] **Step 4: Implement**

`src/renderer/src/lib/tradeBuilder.ts`:

```ts
import { dealProblem, type DealMove } from '@shared/deal'
import type { TradeEvaluation, TradePool, TradeProposal } from '@shared/types'

/** One chosen player: the team he leaves and, once picked, where he goes (null = the default). */
export interface BuilderPick {
  playerId: string
  from: number
  to: number | null
}

/** Multi-team spec §5.1: the builder's deal — the other teams in order, and the chosen players. */
export interface BuilderDeal {
  teams: number[]
  picks: BuilderPick[]
}

export const EMPTY_DEAL: BuilderDeal = { teams: [], picks: [] }

/** "Me" for my team, otherwise the team's name. */
export function teamLabel(pool: TradePool, rosterId: number): string {
  if (rosterId === pool.me.rosterId) return 'Me'
  return pool.teams.find((t) => t.rosterId === rosterId)?.name ?? `Team ${rosterId}`
}

function playerName(pool: TradePool, playerId: string): string {
  for (const team of [pool.me, ...pool.teams]) {
    const p = team.players.find((x) => x.playerId === playerId)
    if (p) return p.fullName
  }
  return playerId
}

/** Spec §5.1 defaults: my players go to the first other team, everyone else's to me. */
export function destinationOf(deal: BuilderDeal, pick: BuilderPick, me: number): number | null {
  if (pick.to !== null) return pick.to
  return pick.from === me ? (deal.teams[0] ?? null) : me
}

/** The picks with their destinations resolved; a pick with nowhere to go yet is left out. */
export function dealMoves(deal: BuilderDeal, me: number): DealMove[] {
  return deal.picks.flatMap((p) => {
    const to = destinationOf(deal, p, me)
    return to === null ? [] : [{ playerId: p.playerId, from: p.from, to }]
  })
}

export function proposalFrom(deal: BuilderDeal, me: number): TradeProposal {
  return { moves: dealMoves(deal, me).map(({ playerId, to }) => ({ playerId, to })) }
}

export function addTeam(deal: BuilderDeal, rosterId: number): BuilderDeal {
  return deal.teams.includes(rosterId) ? deal : { ...deal, teams: [...deal.teams, rosterId] }
}

/** Spec §5.1: a removed team's players leave the deal; players headed to it go back to their default. */
export function removeTeam(deal: BuilderDeal, rosterId: number): BuilderDeal {
  return {
    teams: deal.teams.filter((t) => t !== rosterId),
    picks: deal.picks
      .filter((p) => p.from !== rosterId)
      .map((p) => (p.to === rosterId ? { ...p, to: null } : p))
  }
}

export function addPick(deal: BuilderDeal, playerId: string, from: number): BuilderDeal {
  if (deal.picks.some((p) => p.playerId === playerId)) return deal
  return { ...deal, picks: [...deal.picks, { playerId, from, to: null }] }
}

export function removePick(deal: BuilderDeal, playerId: string): BuilderDeal {
  return { ...deal, picks: deal.picks.filter((p) => p.playerId !== playerId) }
}

export function setDestination(deal: BuilderDeal, playerId: string, to: number): BuilderDeal {
  return {
    ...deal,
    picks: deal.picks.map((p) => (p.playerId === playerId ? { ...p, to } : p))
  }
}

/** A suggestion's or verdict's deal: its teams in order and every move with its destination. */
export function dealOf(ev: TradeEvaluation): BuilderDeal {
  return {
    teams: ev.sides.filter((s) => !s.isMe).map((s) => s.rosterId),
    picks: ev.sides.flatMap((s) =>
      s.give.map((p) => ({ playerId: p.playerId, from: s.rosterId, to: p.to }))
    )
  }
}

/** After a sync: teams that still exist, players still on the team they leave, stale destinations reset. */
export function pruneDeal(deal: BuilderDeal, pool: TradePool): BuilderDeal {
  const me = pool.me.rosterId
  const rosters = new Map([pool.me, ...pool.teams].map((t) => [t.rosterId, t.players]))
  const teams = deal.teams.filter((t) => t !== me && rosters.has(t))
  const inDeal = (t: number): boolean => t === me || teams.includes(t)
  const picks = deal.picks
    .filter(
      (p) => inDeal(p.from) && (rosters.get(p.from) ?? []).some((x) => x.playerId === p.playerId)
    )
    .map((p) => (p.to !== null && !inDeal(p.to) ? { ...p, to: null } : p))
  return { teams, picks }
}

/** Spec §5.1 inline validation — the rule main enforces; null when Evaluate may run. */
export function builderProblem(deal: BuilderDeal, pool: TradePool): string | null {
  const me = pool.me.rosterId
  const name = (rosterId: number): string =>
    rosterId === me ? pool.me.name : teamLabel(pool, rosterId)
  return dealProblem([me, ...deal.teams], dealMoves(deal, me), me, name, (playerId) =>
    playerName(pool, playerId)
  )
}

/** "gets: Ja'Marr Chase" — with 3+ teams each source follows in brackets; "gets: nobody" when empty. */
export function getsLine(deal: BuilderDeal, rosterId: number, pool: TradePool): string {
  const incoming = dealMoves(deal, pool.me.rosterId).filter((m) => m.to === rosterId)
  if (incoming.length === 0) return 'gets: nobody'
  const multi = deal.teams.length >= 2
  const names = incoming.map((m) => {
    const name = playerName(pool, m.playerId)
    return multi ? `${name} (${teamLabel(pool, m.from)})` : name
  })
  return `gets: ${names.join(', ')}`
}
```

In `src/renderer/src/lib/tradeView.ts`: set `export const NO_VERDICT_HINT = 'Add players to every team in the deal and evaluate.'` and add after `dropLine`:

```ts
/** Multi-team spec §5.1: "gets Tee Higgins from Tank Mode · …" under a side of a 3+-team verdict. */
export function verdictGetsLine(side: TradeSideResult, ev: TradeEvaluation): string {
  const source = (rosterId: number): string => {
    const s = ev.sides.find((x) => x.rosterId === rosterId)
    return !s ? `team ${rosterId}` : s.isMe ? 'me' : s.name
  }
  return `gets ${side.get.map((p) => `${p.fullName} from ${source(p.from)}`).join(' · ')}`
}
```

- [ ] **Step 5: Run them to see them pass**

Run: `npx vitest run tests/renderer/lib/tradeBuilder.test.ts tests/renderer/lib/tradeView.test.ts`
Expected: PASS.

- [ ] **Step 6: Verify and commit**

The new hint text breaks one assertion in the current `TradeScreen.test.tsx` (first test): change its `'Pick a partner, add players to both sides and evaluate.'` to `'Add players to every team in the deal and evaluate.'` (Task 5 rewrites the file anyway).

```bash
npm run typecheck && npm run lint && npm test
git add src/renderer/src/lib/tradeBuilder.ts src/renderer/src/lib/tradeView.ts tests/fixtures/trade.ts tests/renderer
git commit -m "feat(ui): add the multi-team builder model"
```

---

### Task 5: The N-team builder

**Files:**

- Create: `src/renderer/src/components/TradeBuilder.tsx`
- Modify: `src/renderer/src/screens/TradeScreen.tsx` (rewrite), `src/renderer/src/lib/tradeView.ts` (+ `spotFor`)
- Test: `tests/renderer/components/TradeScreen.test.tsx` (rewrite), `tests/renderer/lib/tradeView.test.ts`

**Interfaces:**

- Consumes: Task 4's builder model and `verdictGetsLine`; Task 2's `proposalOf`.
- Produces: `TradeBuilder(props: TradeBuilderProps)` with `TradeBuilderProps { pool; deal; onDealChange; verdict; spots; evaluating; evalError; onEvaluate; onOpenPlayer; finding; onSuggestWith }`. Aria labels the tests rely on: `Add team`, `Remove team <name>`, `Add to I send`, `Add to <team> sends`, `Destination of <player>`, `Remove <player>`.

- [ ] **Step 1: Write the failing tests**

Replace `tests/renderer/components/TradeScreen.test.tsx` with:

```tsx
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { TradeScreen } from '@/screens/TradeScreen'
import { api } from '@/lib/api'
import type { PlayersOptions } from '@shared/types'
import { lineupPlayer } from '../../fixtures/lineup'
import {
  bijan,
  lar,
  rivalSide,
  threeTeamEvaluation,
  threeTeamPool,
  tradeEvaluation,
  tradePool,
  tradeSide,
  tradeSuggestion
} from '../../fixtures/trade'

vi.mock('@/lib/api', () => ({
  api: {
    players: { options: vi.fn(), detail: vi.fn() },
    trade: { pool: vi.fn(), evaluate: vi.fn(), suggest: vi.fn(), openSpot: vi.fn() }
  }
}))
const optionsMock = vi.mocked(api.players.options)
const poolMock = vi.mocked(api.trade.pool)
const evaluateMock = vi.mocked(api.trade.evaluate)
const suggestMock = vi.mocked(api.trade.suggest)
const openSpotMock = vi.mocked(api.trade.openSpot)

const options: PlayersOptions = {
  seasons: [2026],
  currentWeek: 3,
  lastScoredWeek: 2,
  tabs: [],
  projectionWeeks: []
}

const JEFFERSON_FOR_CHASE = {
  moves: [
    { playerId: '6794', to: 2 },
    { playerId: '7564', to: 1 }
  ]
}

beforeEach(() => {
  optionsMock.mockReset()
  poolMock.mockReset()
  evaluateMock.mockReset()
  suggestMock.mockReset()
  suggestMock.mockResolvedValue([])
  openSpotMock.mockReset()
  openSpotMock.mockResolvedValue({ sides: [null, null] })
  optionsMock.mockResolvedValue(options)
  poolMock.mockResolvedValue(tradePool())
})
afterEach(cleanup)

describe('TradeScreen', () => {
  it('loads the pool, defaults the partner and builds a trade into a verdict', async () => {
    evaluateMock.mockResolvedValue(
      tradeEvaluation({
        sides: [
          tradeSide({
            drops: [lar],
            thisWeekSwaps: [
              {
                slot: 'WR',
                in: lineupPlayer({ playerId: '7564', fullName: "Ja'Marr Chase", position: 'WR' }),
                out: lineupPlayer({
                  playerId: '6794',
                  fullName: 'Justin Jefferson',
                  position: 'WR'
                }),
                delta: -4
              }
            ]
          }),
          rivalSide()
        ]
      })
    )
    render(<TradeScreen dataVersion={0} />)
    expect(await screen.findByText('weeks 3–17 · 15 weeks')).toBeTruthy()
    expect(poolMock).toHaveBeenCalledWith(2026)
    // the first team is the default partner; nobody else is left to add
    expect(screen.getByLabelText('Remove team Rival')).toBeTruthy()
    expect(screen.queryByLabelText('Add team')).toBeNull()
    expect(screen.getByText('Add players to every team in the deal and evaluate.')).toBeTruthy()
    expect((screen.getByText('Evaluate') as HTMLButtonElement).disabled).toBe(true)

    fireEvent.change(screen.getByLabelText('Add to I send'), { target: { value: '6794' } })
    expect(screen.getByText('Cook Book gets nobody')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Add to Rival sends'), { target: { value: '7564' } })
    expect(screen.getByText('Justin Jefferson')).toBeTruthy()
    expect(screen.getByText("Ja'Marr Chase")).toBeTruthy()
    expect(screen.getByText('ROS 128.0 · ECR — · MKT 10 512 · starts 15/15')).toBeTruthy()
    // two teams: no destination picker, the gets line names no source
    expect(screen.queryByLabelText('Destination of Justin Jefferson')).toBeNull()
    expect(screen.getByText("gets: Ja'Marr Chase")).toBeTruthy()
    // a chosen player leaves its picker
    expect(
      [...(screen.getByLabelText('Add to I send') as HTMLSelectElement).options].map((o) => o.value)
    ).not.toContain('6794')

    fireEvent.click(screen.getByText('Evaluate'))
    expect(await screen.findByText('-19.00 (-1.27/wk)')).toBeTruthy()
    expect(evaluateMock).toHaveBeenCalledWith(2026, JEFFERSON_FOR_CHASE)
    expect(screen.getByText('+19.00 (+1.27/wk)')).toBeTruthy()
    expect(screen.getByText('gives 10 512 → gets 8 000 (76 %)')).toBeTruthy()
    expect(screen.getByText('drop: Los Angeles Rams')).toBeTruthy()
    expect(screen.getByText('Everyone gains')).toBeTruthy()
    expect(screen.getByText('Market-fair')).toBeTruthy()
    expect(screen.getByText("Start Ja'Marr Chase over Justin Jefferson (WR, -4.00)")).toBeTruthy()

    // removing a player clears the verdict and disables Evaluate again
    fireEvent.click(screen.getByLabelText('Remove Justin Jefferson'))
    expect(screen.queryByText('-19.00 (-1.27/wk)')).toBeNull()
    expect((screen.getByText('Evaluate') as HTMLButtonElement).disabled).toBe(true)
  })

  it('builds a three-team deal with destinations and inline validation', async () => {
    poolMock.mockResolvedValue(threeTeamPool())
    evaluateMock.mockResolvedValue(threeTeamEvaluation())
    openSpotMock.mockResolvedValue({ sides: [null, null, null] })
    render(<TradeScreen dataVersion={0} />)
    fireEvent.change(await screen.findByLabelText('Add to I send'), { target: { value: '6794' } })
    fireEvent.change(screen.getByLabelText('Add team'), { target: { value: '3' } })
    expect(screen.getByLabelText('Remove team Tank Mode')).toBeTruthy()
    expect(
      (screen.getByLabelText('Destination of Justin Jefferson') as HTMLSelectElement).value
    ).toBe('2')

    fireEvent.change(screen.getByLabelText('Add to Rival sends'), { target: { value: '7564' } })
    expect((screen.getByLabelText("Destination of Ja'Marr Chase") as HTMLSelectElement).value).toBe(
      '1'
    )
    expect(screen.getByText('Tank Mode sends nobody')).toBeTruthy()
    expect((screen.getByText('Evaluate') as HTMLButtonElement).disabled).toBe(true)
    fireEvent.change(screen.getByLabelText('Add to Tank Mode sends'), { target: { value: '5859' } })
    expect(screen.getByText('Tank Mode gets nobody')).toBeTruthy()
    fireEvent.change(screen.getByLabelText("Destination of Ja'Marr Chase"), {
      target: { value: '3' }
    })
    expect(screen.getByText('gets: Tee Higgins (Tank Mode)')).toBeTruthy()
    expect(screen.getByText('gets: Justin Jefferson (Me)')).toBeTruthy()
    expect(screen.getByText("gets: Ja'Marr Chase (Rival)")).toBeTruthy()

    fireEvent.click(screen.getByText('Evaluate'))
    expect(await screen.findByText('+6.00 (+0.40/wk)')).toBeTruthy()
    expect(evaluateMock).toHaveBeenCalledWith(2026, {
      moves: [
        { playerId: '6794', to: 2 },
        { playerId: '7564', to: 3 },
        { playerId: '5859', to: 1 }
      ]
    })
    expect(screen.getByText('+3.00 (+0.20/wk)')).toBeTruthy()
    expect(screen.getByText('-1.50 (-0.10/wk)')).toBeTruthy()
    expect(screen.getByText('gets Tee Higgins from Tank Mode')).toBeTruthy()
    expect(screen.getByText('gets Justin Jefferson from me')).toBeTruthy()

    // removing Tank Mode drops Higgins; Chase heads back to me — a valid 2-team deal again
    fireEvent.click(screen.getByLabelText('Remove team Tank Mode'))
    expect(screen.queryByText('Tee Higgins')).toBeNull()
    expect(screen.queryByLabelText("Destination of Ja'Marr Chase")).toBeNull()
    expect(screen.queryByText('+6.00 (+0.40/wk)')).toBeNull()
    expect((screen.getByText('Evaluate') as HTMLButtonElement).disabled).toBe(false)
  })

  it('adds the open-spot line under a side once the worker answers', async () => {
    evaluateMock.mockResolvedValue(tradeEvaluation())
    openSpotMock.mockResolvedValue({
      sides: [
        { rosterId: 1, add: bijan, deltaPerWeek: 0.8 },
        { rosterId: 2, add: null, deltaPerWeek: 0 }
      ]
    })
    render(<TradeScreen dataVersion={0} />)
    fireEvent.change(await screen.findByLabelText('Add to I send'), { target: { value: '6794' } })
    fireEvent.change(screen.getByLabelText('Add to Rival sends'), { target: { value: '7564' } })
    fireEvent.click(screen.getByText('Evaluate'))

    expect(await screen.findByText(`Open spot: best add ${bijan.fullName}, +0.80/wk`)).toBeTruthy()
    expect(openSpotMock).toHaveBeenCalledWith(2026, JEFFERSON_FOR_CHASE)
    expect(screen.getByText('Open spot: no free agent improves this lineup')).toBeTruthy()

    // A new trade drops the old line with the old verdict.
    fireEvent.click(screen.getByLabelText('Remove Justin Jefferson'))
    expect(screen.queryByText(`Open spot: best add ${bijan.fullName}, +0.80/wk`)).toBeNull()
  })

  it('shows the pool failure as the notice and an evaluate failure under the builder', async () => {
    poolMock.mockRejectedValue(new Error('No projections stored for this season'))
    render(<TradeScreen dataVersion={0} />)
    expect(await screen.findByText('No projections stored for this season')).toBeTruthy()
    expect(screen.queryByLabelText('Add to I send')).toBeNull()
    cleanup()

    poolMock.mockResolvedValue(tradePool())
    evaluateMock.mockRejectedValue(new Error('Justin Jefferson is not on a roster in this league'))
    render(<TradeScreen dataVersion={0} />)
    fireEvent.change(await screen.findByLabelText('Add to I send'), { target: { value: '6794' } })
    fireEvent.change(screen.getByLabelText('Add to Rival sends'), { target: { value: '7564' } })
    fireEvent.click(screen.getByText('Evaluate'))
    expect(
      await screen.findByText('Justin Jefferson is not on a roster in this league')
    ).toBeTruthy()
    // the deal survives the error
    expect(screen.getByText('Justin Jefferson')).toBeTruthy()
  })

  it('shows the deadline banner and keeps the builder usable', async () => {
    poolMock.mockResolvedValue(tradePool({ tradeDeadlinePassed: true }))
    render(<TradeScreen dataVersion={0} />)
    expect(await screen.findByText(/trade deadline has passed/)).toBeTruthy()
    await waitFor(() => expect(screen.getByLabelText('Add to I send')).toBeTruthy())
  })

  it('finds offers and opens one in the builder with the carried numbers', async () => {
    suggestMock.mockResolvedValue([tradeSuggestion()])
    const scrollIntoView = vi.fn()
    window.HTMLElement.prototype.scrollIntoView = scrollIntoView
    render(<TradeScreen dataVersion={0} />)
    await screen.findByLabelText('Add to I send')
    expect(screen.getByText('I gain and get ≥ 85 % of the market value I give')).toBeTruthy()

    fireEvent.click(screen.getByText('Find'))
    expect(await screen.findByText('with Rival')).toBeTruthy()
    // the default scan is the builder's partner — the league-wide one is an explicit choice
    expect(suggestMock).toHaveBeenCalledWith({
      season: 2026,
      focus: null,
      stance: 'fair',
      partnerRosterId: 2
    })
    expect(screen.getByText('Me +4.00 (+0.27/wk)')).toBeTruthy()
    expect(screen.getByText('Them -4.00')).toBeTruthy()
    expect(screen.getByText('market')).toBeTruthy()
    expect(screen.getByText("give RB Saquon Barkley · get WR Ja'Marr Chase")).toBeTruthy()

    fireEvent.click(screen.getByText('Open in builder'))
    expect(screen.getByLabelText('Remove team Rival')).toBeTruthy()
    expect(screen.getByText('Saquon Barkley')).toBeTruthy()
    expect(screen.getByText("Ja'Marr Chase")).toBeTruthy()
    // the verdict is the suggestion's evaluation — no second trade:evaluate call
    expect(screen.getByText('+4.00 (+0.27/wk)')).toBeTruthy()
    expect(screen.getByText('gives 9 340 → gets 8 000 (86 %)')).toBeTruthy()
    expect(evaluateMock).not.toHaveBeenCalled()
    expect(scrollIntoView).toHaveBeenCalled()
    // the rows are editable as usual: removing one clears the verdict
    fireEvent.click(screen.getByLabelText('Remove Saquon Barkley'))
    expect(screen.queryByText('+4.00 (+0.27/wk)')).toBeNull()
  })

  it('carries the focus and stance, scans every team on request, hints on an empty result', async () => {
    render(<TradeScreen dataVersion={0} />)
    await screen.findByLabelText('Add to I send')
    fireEvent.change(screen.getByLabelText('Focus'), { target: { value: 'give' } })
    fireEvent.change(screen.getByLabelText('Focus player'), { target: { value: '4866' } })
    expect(screen.getByText('MKT 9 340 · 30d -310')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Stance'), { target: { value: 'overpay' } })

    fireEvent.click(screen.getByText('Suggest with this team'))
    expect(await screen.findByText('No offers — widen the focus or pick another team')).toBeTruthy()
    expect(suggestMock).toHaveBeenCalledWith({
      season: 2026,
      focus: { give: '4866' },
      stance: 'overpay',
      partnerRosterId: 2
    })
    expect((screen.getByLabelText('Suggest with') as HTMLSelectElement).value).toBe('2')

    // a position focus, scanning every team
    fireEvent.change(screen.getByLabelText('Focus'), { target: { value: 'want' } })
    fireEvent.change(screen.getByLabelText('Focus position'), { target: { value: 'WR' } })
    fireEvent.change(screen.getByLabelText('Suggest with'), { target: { value: '' } })
    fireEvent.click(screen.getByText('Find'))
    await waitFor(() =>
      expect(suggestMock).toHaveBeenLastCalledWith({
        season: 2026,
        focus: { want: 'WR' },
        stance: 'overpay',
        partnerRosterId: null
      })
    )

    // a failed search shows under the controls
    suggestMock.mockRejectedValue(new Error('No projections stored for this season'))
    fireEvent.click(screen.getByText('Find'))
    expect(await screen.findByText('No projections stored for this season')).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run them to see them fail**

Run: `npx vitest run tests/renderer/components/TradeScreen.test.tsx`
Expected: FAIL — no `Remove team Rival` / `Add to I send` labels yet.

- [ ] **Step 2b: `spotFor` — open spots by roster (test first)**

Add to `tests/renderer/lib/tradeView.test.ts` (import `spotFor`; `bijan` is already imported):

```ts
it('finds a side’s open spot by roster, whatever the order', () => {
  const spots = {
    sides: [
      null,
      { rosterId: 3, add: bijan, deltaPerWeek: 0.5 },
      { rosterId: 1, add: null, deltaPerWeek: 0 }
    ]
  }
  expect(spotFor(spots, 1)).toEqual({ rosterId: 1, add: null, deltaPerWeek: 0 })
  expect(spotFor(spots, 3)?.add).toBe(bijan)
  expect(spotFor(spots, 2)).toBeNull()
  expect(spotFor(null, 1)).toBeNull()
})
```

Run `npx vitest run tests/renderer/lib/tradeView.test.ts` — FAIL (`spotFor` is not a function). Then add to `src/renderer/src/lib/tradeView.ts` (add `TradeOpenSpots` to its `@shared/types` import if missing), after `openSpotLine`:

```ts
/** A side's open spot, looked up by roster: a re-evaluated proposal may order 3+-team sides differently. */
export function spotFor(spots: TradeOpenSpots | null, rosterId: number): OpenSpot | null {
  return spots?.sides.find((s) => s?.rosterId === rosterId) ?? null
}
```

Run it again — PASS.

- [ ] **Step 3: The `TradeBuilder` component**

`src/renderer/src/components/TradeBuilder.tsx`:

```tsx
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PositionBadge } from '@/components/PositionBadge'
import { swapLine } from '@/lib/lineupView'
import {
  addPick,
  addTeam,
  builderProblem,
  destinationOf,
  getsLine,
  removePick,
  removeTeam,
  setDestination,
  teamLabel,
  type BuilderDeal,
  type BuilderPick
} from '@/lib/tradeBuilder'
import {
  NO_VERDICT_HINT,
  deltaLine,
  deltaTone,
  dropLine,
  groupByPosition,
  marketLine,
  openSpotLine,
  playerOption,
  playerStats,
  rangeLine,
  spotFor,
  verdictBadges,
  verdictGetsLine
} from '@/lib/tradeView'
import { cn } from '@/lib/utils'
import type {
  DetailTarget,
  OpenSpot,
  TradeEvaluation,
  TradeOpenSpots,
  TradePlayer,
  TradePool,
  TradeSideResult
} from '@shared/types'

const selectClass =
  'h-8 rounded-md border border-input bg-transparent px-2 text-sm text-foreground dark:bg-input/30'

const TONE: Record<ReturnType<typeof deltaTone>, string> = {
  green: 'text-emerald-400',
  red: 'text-red-400',
  muted: 'text-muted-foreground'
}

function PlayerRow({
  player,
  weeks,
  destination,
  onOpen,
  onRemove
}: {
  player: TradePlayer
  weeks: number
  /** The "→ team" select, only with 3+ teams. */
  destination: React.ReactNode
  onOpen: (p: DetailTarget) => void
  onRemove: () => void
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-2 text-sm">
      <PositionBadge position={player.position} />
      <button type="button" className="font-medium hover:underline" onClick={() => onOpen(player)}>
        {player.fullName}
      </button>
      <span className="text-muted-foreground">{player.team ?? ''}</span>
      {player.reserve && (
        <span className="rounded bg-muted px-1 text-xs font-semibold uppercase text-muted-foreground">
          {player.reserve}
        </span>
      )}
      <span className="ml-auto text-xs text-muted-foreground">{playerStats(player, weeks)}</span>
      {destination}
      <Button
        type="button"
        variant="ghost"
        size="icon-xs"
        aria-label={`Remove ${player.fullName}`}
        onClick={onRemove}
      >
        <X />
      </Button>
    </div>
  )
}

/** Multi-team spec §5.1: one team's card — what it sends and where to, a picker, what it gets. */
function TeamCard({
  pool,
  deal,
  rosterId,
  onChange,
  onOpen
}: {
  pool: TradePool
  deal: BuilderDeal
  rosterId: number
  onChange: (deal: BuilderDeal) => void
  onOpen: (p: DetailTarget) => void
}): React.JSX.Element {
  const me = pool.me.rosterId
  const team = rosterId === me ? pool.me : pool.teams.find((t) => t.rosterId === rosterId)
  const roster = team?.players ?? []
  const title = rosterId === me ? 'I send' : `${teamLabel(pool, rosterId)} sends`
  const picks = deal.picks.filter((p) => p.from === rosterId)
  const rows = picks.flatMap((pick) => {
    const player = roster.find((p) => p.playerId === pick.playerId)
    return player ? [{ pick, player }] : []
  })
  const available = roster.filter((p) => !picks.some((x) => x.playerId === p.playerId))
  const others = [me, ...deal.teams].filter((t) => t !== rosterId)
  const destination = (pick: BuilderPick, player: TradePlayer): React.ReactNode =>
    deal.teams.length < 2 ? null : (
      <select
        aria-label={`Destination of ${player.fullName}`}
        className={selectClass}
        value={destinationOf(deal, pick, me) ?? ''}
        onChange={(e) => onChange(setDestination(deal, pick.playerId, Number(e.target.value)))}
      >
        {others.map((t) => (
          <option key={t} value={t}>
            → {teamLabel(pool, t)}
          </option>
        ))}
      </select>
    )
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map(({ pick, player }) => (
          <PlayerRow
            key={player.playerId}
            player={player}
            weeks={pool.weeks}
            destination={destination(pick, player)}
            onOpen={onOpen}
            onRemove={() => onChange(removePick(deal, player.playerId))}
          />
        ))}
        <select
          aria-label={`Add to ${title}`}
          className={selectClass}
          value=""
          onChange={(e) => {
            if (e.target.value) onChange(addPick(deal, e.target.value, rosterId))
          }}
        >
          <option value="">+ add player</option>
          {groupByPosition(available).map(([pos, players]) => (
            <optgroup key={pos} label={pos}>
              {players.map((p) => (
                <option key={p.playerId} value={p.playerId}>
                  {playerOption(p)}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
        <p className="text-xs text-muted-foreground">{getsLine(deal, rosterId, pool)}</p>
      </CardContent>
    </Card>
  )
}

function SideVerdict({
  side,
  spot,
  gets
}: {
  side: TradeSideResult
  spot: OpenSpot | null
  /** "gets X from Y", only with 3+ teams. */
  gets: string | null
}): React.JSX.Element {
  const drop = dropLine(side)
  return (
    <div className="space-y-1 text-sm">
      <div className="font-semibold">{side.isMe ? `Me · ${side.name}` : side.name}</div>
      <div className={cn('text-2xl font-semibold', TONE[deltaTone(side.delta)])}>
        {deltaLine(side)}
      </div>
      <div className="text-muted-foreground">{rangeLine(side)}</div>
      {gets && <div className="text-muted-foreground">{gets}</div>}
      {drop && <div className="text-amber-400">{drop}</div>}
      {spot && <div className="text-sky-400">{openSpotLine(spot)}</div>}
      <div className="text-muted-foreground">{marketLine(side)}</div>
    </div>
  )
}

/** Multi-team spec §5.1: one column per team, the badges, this week's swaps on my side. */
function VerdictCard({
  ev,
  spots
}: {
  ev: TradeEvaluation
  spots: TradeOpenSpots | null
}): React.JSX.Element {
  const multi = ev.sides.length > 2
  const swaps = ev.sides[0].thisWeekSwaps
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Verdict</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {ev.sides.map((side) => (
            <SideVerdict
              key={side.rosterId}
              side={side}
              spot={spotFor(spots, side.rosterId)}
              gets={multi ? verdictGetsLine(side, ev) : null}
            />
          ))}
        </div>
        <div className="flex gap-2">
          {verdictBadges(ev).map((b) => (
            <span
              key={b.label}
              className={cn(
                'rounded px-2 py-0.5 text-xs font-bold',
                b.on ? 'bg-emerald-500/15 text-emerald-400' : 'bg-muted text-muted-foreground'
              )}
            >
              {b.label}
            </span>
          ))}
        </div>
        <div>
          <div className="mb-1 text-sm font-medium">This week</div>
          {swaps.length === 0 ? (
            <p className="text-sm text-muted-foreground">Your lineup this week does not change.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {swaps.map((s) => (
                <li key={`${s.slot}:${s.in.playerId}`}>{swapLine(s)}</li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

export interface TradeBuilderProps {
  pool: TradePool
  deal: BuilderDeal
  onDealChange: (deal: BuilderDeal) => void
  verdict: TradeEvaluation | null
  spots: TradeOpenSpots | null
  evaluating: boolean
  evalError: string | null
  onEvaluate: () => void
  onOpenPlayer: (p: DetailTarget) => void
  /** A search is running: the shortcut below waits. */
  finding: boolean
  /** 6b's shortcut into the suggestions, offered for a 2-team deal. */
  onSuggestWith: (rosterId: number) => void
}

/** Multi-team spec §5.1: the teams row, one card per team, Evaluate behind the inline rule, the verdict. */
export function TradeBuilder({
  pool,
  deal,
  onDealChange,
  verdict,
  spots,
  evaluating,
  evalError,
  onEvaluate,
  onOpenPlayer,
  finding,
  onSuggestWith
}: TradeBuilderProps): React.JSX.Element {
  const me = pool.me.rosterId
  const addable = pool.teams.filter((t) => !deal.teams.includes(t.rosterId))
  const problem = builderProblem(deal, pool)
  const hint = deal.picks.length === 0 ? NO_VERDICT_HINT : problem
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-muted-foreground">Teams in deal</span>
        <span className="rounded-md border px-2 py-1">Me · {pool.me.name}</span>
        {deal.teams.map((t) => (
          <span key={t} className="flex items-center gap-1 rounded-md border py-0.5 pl-2 pr-0.5">
            {teamLabel(pool, t)}
            <Button
              type="button"
              variant="ghost"
              size="icon-xs"
              aria-label={`Remove team ${teamLabel(pool, t)}`}
              onClick={() => onDealChange(removeTeam(deal, t))}
            >
              <X />
            </Button>
          </span>
        ))}
        {addable.length > 0 && (
          <select
            aria-label="Add team"
            className={selectClass}
            value=""
            onChange={(e) => {
              if (e.target.value) onDealChange(addTeam(deal, Number(e.target.value)))
            }}
          >
            <option value="">+ add team</option>
            {addable.map((t) => (
              <option key={t.rosterId} value={t.rosterId}>
                {t.name}
              </option>
            ))}
          </select>
        )}
        {deal.teams.length === 1 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="ml-auto"
            disabled={finding}
            onClick={() => onSuggestWith(deal.teams[0])}
          >
            Suggest with this team
          </Button>
        )}
      </div>

      <div className="grid gap-6 lg:grid-cols-2 xl:grid-cols-3">
        {[me, ...deal.teams].map((rosterId) => (
          <TeamCard
            key={rosterId}
            pool={pool}
            deal={deal}
            rosterId={rosterId}
            onChange={onDealChange}
            onOpen={onOpenPlayer}
          />
        ))}
      </div>

      <div className="flex items-center gap-4">
        <Button type="button" disabled={problem !== null || evaluating} onClick={onEvaluate}>
          Evaluate
        </Button>
        {evaluating && <span className="text-sm text-muted-foreground">Evaluating…</span>}
        {evalError && <span className="text-destructive text-sm">{evalError}</span>}
        {!verdict && !evaluating && !evalError && hint && (
          <span className="text-sm text-muted-foreground">{hint}</span>
        )}
      </div>

      {verdict && <VerdictCard ev={verdict} spots={spots} />}
    </div>
  )
}
```

- [ ] **Step 4: `TradeScreen` on the builder model**

Replace `src/renderer/src/screens/TradeScreen.tsx` with (the suggestions card is Task 2's, unchanged):

```tsx
import { useEffect, useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PlayerDetailPanel } from '@/components/PlayerDetailPanel'
import { TradeBuilder } from '@/components/TradeBuilder'
import { api } from '@/lib/api'
import { errorMessage } from '@/lib/format'
import {
  EMPTY_DEAL,
  addTeam,
  dealOf,
  proposalFrom,
  pruneDeal,
  type BuilderDeal
} from '@/lib/tradeBuilder'
import {
  DEADLINE_NOTE,
  STANCE_OPTIONS,
  acceptanceTags,
  deltaTone,
  focusMarketLine,
  groupByPosition,
  meLine,
  noOffersHint,
  offerLine,
  playerOption,
  stanceHint,
  themLine,
  windowLabel
} from '@/lib/tradeView'
import { cn } from '@/lib/utils'
import { proposalOf } from '@shared/deal'
import { LINEUP_POSITIONS } from '@shared/rules'
import type {
  DetailTarget,
  TradeEvaluation,
  TradeFocus,
  TradeOpenSpots,
  TradePlayer,
  TradePool,
  TradeStance,
  TradeSuggestion
} from '@shared/types'

const selectClass =
  'h-8 rounded-md border border-input bg-transparent px-2 text-sm text-foreground dark:bg-input/30'

const TONE: Record<ReturnType<typeof deltaTone>, string> = {
  green: 'text-emerald-400',
  red: 'text-red-400',
  muted: 'text-muted-foreground'
}

type FocusKind = 'none' | 'give' | 'want'

/** Spec 6b §5.2: one offer — who with, both deltas, why they'd take it, the players, the way into the builder. */
function SuggestionRow({
  suggestion,
  onOpen
}: {
  suggestion: TradeSuggestion
  onOpen: () => void
}): React.JSX.Element {
  const [me, them] = suggestion.evaluation.sides
  return (
    <li className="rounded-md border px-3 py-2 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <span className="font-medium">with {them.name}</span>
        <span className={cn('font-semibold', TONE[deltaTone(me.delta)])}>{meLine(suggestion)}</span>
        <span className={TONE[deltaTone(them.delta)]}>{themLine(suggestion)}</span>
        {acceptanceTags(suggestion).map((tag) => (
          <span
            key={tag}
            className="rounded bg-muted px-1.5 text-xs font-semibold text-muted-foreground"
          >
            {tag}
          </span>
        ))}
        <Button type="button" variant="outline" size="sm" className="ml-auto" onClick={onOpen}>
          Open in builder
        </Button>
      </div>
      <div className="mt-1 text-muted-foreground">{offerLine(suggestion)}</div>
    </li>
  )
}

function suggestionKey(s: TradeSuggestion): string {
  const ids = (list: TradePlayer[]): string => list.map((p) => p.playerId).join('+')
  const [me, them] = s.evaluation.sides
  return `${them.rosterId}:${ids(me.give)}:${ids(me.get)}`
}

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
  // Spec 6b §5.2: the suggestions section
  const [focusKind, setFocusKind] = useState<FocusKind>('none')
  const [focusGive, setFocusGive] = useState('')
  const [focusWant, setFocusWant] = useState('RB')
  const [stance, setStance] = useState<TradeStance>('fair')
  const [suggestWith, setSuggestWith] = useState<number | null>(null)
  const [suggestions, setSuggestions] = useState<TradeSuggestion[] | null>(null)
  const [finding, setFinding] = useState(false)
  const [findError, setFindError] = useState<string | null>(null)
  const builderRef = useRef<HTMLDivElement>(null)

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
        setDeal((d) => {
          const kept = pruneDeal(d, pool)
          const first = pool.teams[0]
          return kept.teams.length > 0 || !first ? kept : addTeam(kept, first.rosterId)
        })
        setVerdict(null)
        setFocusGive((id) => (pool.me.players.some((p) => p.playerId === id) ? id : ''))
        // Default to one partner: a league-wide scan costs seconds (spec 6b §6).
        setSuggestWith((t) =>
          pool.teams.some((x) => x.rosterId === t) ? t : (pool.teams[0]?.rosterId ?? null)
        )
        setSuggestions(null)
      })
      .catch((err) => {
        if (!cancelled) setFailed({ key, message: errorMessage(err) })
      })
    return () => {
      cancelled = true
    }
  }, [season, key])

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
  const focusPlayer = pool?.me.players.find((p) => p.playerId === focusGive) ?? null

  const changeDeal = (d: BuilderDeal): void => {
    setDeal(d)
    setVerdict(null)
    setEvalError(null)
  }

  async function evaluate(): Promise<void> {
    if (season === null || !pool) return
    setEvaluating(true)
    setEvalError(null)
    try {
      setVerdict(await api.trade.evaluate(season, proposalFrom(deal, pool.me.rosterId)))
    } catch (err) {
      setEvalError(errorMessage(err))
    } finally {
      setEvaluating(false)
    }
  }

  const focus: TradeFocus =
    focusKind === 'give' && focusGive !== ''
      ? { give: focusGive }
      : focusKind === 'want'
        ? { want: focusWant }
        : null

  async function find(partnerRosterId: number | null): Promise<void> {
    if (season === null) return
    setFinding(true)
    setFindError(null)
    try {
      setSuggestions(await api.trade.suggest({ season, focus, stance, partnerRosterId }))
    } catch (err) {
      setFindError(errorMessage(err))
    } finally {
      setFinding(false)
    }
  }

  /** Spec 6b §5.2: the builder shows the suggestion's own evaluation — no second trade:evaluate call. */
  const openInBuilder = (s: TradeSuggestion): void => {
    setDeal(dealOf(s.evaluation))
    setVerdict(s.evaluation)
    setEvalError(null)
    builderRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
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

      {pool && (
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
              finding={finding}
              onSuggestWith={(rosterId) => {
                setSuggestWith(rosterId)
                void find(rosterId)
              }}
            />
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Suggestions</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="text-muted-foreground">Focus</span>
                <select
                  aria-label="Focus"
                  className={selectClass}
                  value={focusKind}
                  onChange={(e) => setFocusKind(e.target.value as FocusKind)}
                >
                  <option value="none">none</option>
                  <option value="give">I give</option>
                  <option value="want">I want</option>
                </select>
                {focusKind === 'give' && (
                  <select
                    aria-label="Focus player"
                    className={selectClass}
                    value={focusGive}
                    onChange={(e) => setFocusGive(e.target.value)}
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
                {focusKind === 'give' && focusPlayer && (
                  <span className="text-xs text-muted-foreground">
                    {focusMarketLine(focusPlayer)}
                  </span>
                )}
                {focusKind === 'want' && (
                  <select
                    aria-label="Focus position"
                    className={selectClass}
                    value={focusWant}
                    onChange={(e) => setFocusWant(e.target.value)}
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
                  className={selectClass}
                  value={stance}
                  onChange={(e) => setStance(e.target.value as TradeStance)}
                >
                  {STANCE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
                <span className="ml-2 text-muted-foreground">with</span>
                <select
                  aria-label="Suggest with"
                  className={selectClass}
                  value={suggestWith ?? ''}
                  onChange={(e) =>
                    setSuggestWith(e.target.value === '' ? null : Number(e.target.value))
                  }
                >
                  {pool.teams.map((t) => (
                    <option key={t.rosterId} value={t.rosterId}>
                      {t.name}
                    </option>
                  ))}
                  <option value="">every team (slower)</option>
                </select>
                <Button type="button" disabled={finding} onClick={() => void find(suggestWith)}>
                  Find
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">{stanceHint(stance)}</p>
              {finding && <p className="text-sm text-muted-foreground">Searching offers…</p>}
              {findError && <p className="text-destructive text-sm">{findError}</p>}
              {suggestions &&
                !finding &&
                (suggestions.length === 0 ? (
                  <p className="text-sm text-muted-foreground">{noOffersHint(stance)}</p>
                ) : (
                  <ul className="space-y-2">
                    {suggestions.map((s) => (
                      <SuggestionRow
                        key={suggestionKey(s)}
                        suggestion={s}
                        onOpen={() => openInBuilder(s)}
                      />
                    ))}
                  </ul>
                ))}
            </CardContent>
          </Card>
        </>
      )}

      <PlayerDetailPanel season={season ?? 0} player={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
```

- [ ] **Step 5: Run the tests to see them pass**

Run: `npx vitest run tests/renderer/components/TradeScreen.test.tsx`
Expected: PASS (7 tests).

- [ ] **Step 6: Verify and commit**

```bash
npm run typecheck && npm run lint && npm test
git add src/renderer/src/components/TradeBuilder.tsx src/renderer/src/screens/TradeScreen.tsx src/renderer/src/lib/tradeView.ts tests/renderer/components/TradeScreen.test.tsx tests/renderer/lib/tradeView.test.ts
git commit -m "feat(ui): build trades between N teams"
```

---

### Task 6: Data reference, real-data check, release `v0.18.0`

**Files:**

- Modify: `docs/reference/value-and-signals.md`
- Modify: this plan (status block)

- [ ] **Step 1: Data reference**

In `docs/reference/value-and-signals.md`, section `## Trade (added in v0.13.0)`:

- Rename it `## Trade (added in v0.13.0; N-team deals v0.18.0)` and change the module line to `src/main/trade/{enter,player,side,evaluate,pool,suggest,openSpot}.ts`.
- Add a **Proposal** paragraph before `### TradeEvaluation`: `TradeProposal = { moves: { playerId, to }[] }`, each player's source is his current roster; validity rules (spec §2.1) and the six builder / `INVALID_TRADE` messages plus main's two roster checks; a 2-team trade is two teams' moves.
- `### TradeEvaluation`: replace the `me`, `them` row with `sides` (me first, then first appearance in `moves`), and the `winWin` row with `everyoneGains` (every side's Δ > 0); `marketFair` now reads "every side".
- `### TradeSideResult`: `give` rows carry `to`, `get` rows carry `from`; `starterWeeks` of a received player are counted on the roster he leaves.
- Add a **Side memo** line: `sideFor` results keyed by `rosterId|gives|gets` (ids sorted), shared within one call or one search run; destinations are attached after.
- **Open spot** paragraph: `TradeOpenSpots.sides`, aligned with `evaluation.sides`.
- **Suggestions**: `TradeSuggestion.acceptance` is aligned with `evaluation.sides` (null for me); the search is still 2-team until v0.19.0.
- **Where it is shown**: the builder's teams row (_Me_, one chip per team, _+ add team_), one card per team (_I send_ / _X sends_, `→` destination with 3+ teams, the `gets:` line), the inline rule under Evaluate, one verdict column per team with `gets X from Y` at 3+ teams, badges _Everyone gains_ / _Market-fair_.

- [ ] **Step 2: Commit the docs**

```bash
git add docs/reference/value-and-signals.md
git commit -m "docs: document N-team trade deals"
```

- [ ] **Step 3: Final verification and the real-data check**

Run: `npm run typecheck && npm run lint && npm test && npm run test:budget` — all green; note the budget times (the suggestion and open-spot budgets must not move: the 2-team search is unchanged).

Then on a copy of the dev DB (`cp ~/.config/FantasyCompanion/companion.db <scratchpad>/real.db`) a throwaway `tests/zz-multiteam.test.ts` that runs `migrate()` on the copy, builds `lineupBuildFromDb(db, leagueId, 2026)`, and:

1. evaluates a 3-team cycle the user might plausibly try — one of my bench players to team B, one of B's bench players to team C, one of C's starters to me — and prints each side's name, Δ/week, before → after, drops and `gets` with sources, plus the time;
2. evaluates the same deal as a 2-team trade with C (my player straight for C's starter) and checks that my side's numbers are identical (my side depends only on what I give and get);
3. times `suggestTrades` for one partner and compares with Plan M's 1.6 s.

Check: every side's before equals its `teamStrengths` total; drops appear only on a side that ends up over the roster size; the evaluation takes milliseconds. Delete the file (never commit it).

Also run the app once (`npm run dev` via the Bash tool's `run_in_background`) and open the Trade screen. If WSLg can't show the window, say so in the status block rather than claiming it was checked.

- [ ] **Step 4: Merge and release**

```bash
git checkout main && git merge --no-ff feat/multi-team-deals -m "merge: feat/multi-team-deals (plan Q)"
npm version minor -m "build: bump version to %s"
```

Expected: `package.json` at `0.18.0`, tag `v0.18.0`. Pushing (`git push --follow-tags`) triggers the Windows release workflow into a draft release — **ask the user first**, as in earlier plans. Then fill in this plan's status block (real-data observations, times, what was not verified) and commit it as `docs(plan): mark plan Q complete`.

---

## Self-review against the spec

| Spec                                                                                                                                                                                                                                                                                 | Where                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------ |
| §2.1 `TradeMove`, `TradeProposal { moves }`, source = current roster                                                                                                                                                                                                                 | Task 2 (types, `resolveDeal`)                                                                                            |
| §2.1 validation: on a roster, once, `to` ≠ own team, me in the deal, ≥ 2 teams, every team sends and gets                                                                                                                                                                            | Task 1 (`dealProblem`), Task 2 (`resolveDeal` + main-only roster / team checks)                                          |
| §2.2 `sideResult` per team, unchanged rules; `sides` me first, first appearance; `to` / `from`; `starterWeeks` from the source; `everyoneGains`, `marketFair` over every side                                                                                                        | Task 2 (`side.ts`, `evaluateTrade`)                                                                                      |
| §2.3 side memo keyed `rosterId                                                                                                                                                                                                                                                       | sorted gives                                                                                                             | sorted gets`, shared by evaluate and search | Task 3 (`SideMemo`, `sideKey`, `EvaluateOptions.memo`) |
| §2.4 open spots per side                                                                                                                                                                                                                                                             | Task 2 (`tradeOpenSpots`)                                                                                                |
| §5.1 teams row, no cap, remove / add team, cards "what it sends", destinations with 3+ teams, defaults, `gets:` line, inline validation, N-column verdict with "from X" at 3+, badges _Everyone gains_ / _Market-fair_, "This week" on my side, Open in builder loads the whole deal | Tasks 4–5                                                                                                                |
| §6 evaluate errors (`INVALID_TRADE` messages; post-sync case)                                                                                                                                                                                                                        | Tasks 1–2; the post-sync message deviates as recorded under Global Constraints                                           |
| §7 evaluator tests moved with identical numbers, hand-computed 3-team fixture, validation cases, flags, open spots per side; renderer builder cases                                                                                                                                  | Tasks 1–5                                                                                                                |
| §7 6b parity at 2 teams                                                                                                                                                                                                                                                              | Task 2 (every `suggest.test.ts` expectation unchanged; `evaluateTrade(proposalOf(s.evaluation))` equals each suggestion) |
| §8 `TradeScreen.tsx` split                                                                                                                                                                                                                                                           | Task 5 (`TradeBuilder.tsx`; the suggestions card moves out in Plan R)                                                    |
| §9 Plan Q → `v0.18.0`; 2-team search adapted to the new types, same results                                                                                                                                                                                                          | Tasks 2, 6                                                                                                               |
