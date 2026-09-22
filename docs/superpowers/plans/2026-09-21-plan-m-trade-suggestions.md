# Plan M — Trade suggestions (slice 6b, phase 2)

**Status:** complete — executed inline on 2026-09-22. Three decisions were taken during execution, each after a measurement the plan had asked for, and each recorded in `docs/reference/value-and-signals.md`:

1. **Task 4 blew the budget** (46.5 s against 3 s: with full rosters every 2-for-1 overflows their side and every 1-for-2 mine, and the drop picker solved all 15 window weeks before the week skip applied). Fixed with four exact prunes — see **Task 3b** below — for 46.5 s → 8.4 s; one partner 4.6 s → 0.7 s, one focus player 2.7 s → 1.0 s. The unfocused league-wide scan stays at 8–12 s (16–23 s on a real league), so:
2. **`trade:suggest` runs in a worker thread** (`src/main/trade/{fromDb,worker,runSuggest}.ts`, bundled to `out/main/tradeWorker.js`) instead of synchronously in the handler as spec §4.2 says, and the screen's `with` control **defaults to the builder's partner**, with _every team (slower)_ an explicit choice. The budget test moved to `npm run test:budget` (wall-clock assertions flap under `npm test`'s parallel workers) and asserts the focused defaults under 3 s with a 20 s regression ceiling on the league-wide scan.
3. **Acceptance gained a lineup floor** (`ACCEPT_LOSS_PER_WEEK = 1`), amending spec §3.3. The real-league check found the rule as approved filled the entire top 30 with fair-value consolidations costing the partner ~12 pts/week at a 0.999 market ratio — correct by the spec, useless as advice.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Scan the league for 1-for-1, 2-for-1 and 1-for-2 offers that help me and that the other manager would plausibly accept — steered by a focus (a player I'd give or a position I want) and a stance (premium / fair / overpay) — list them under the builder, and open any of them in the builder with identical numbers; ship `v0.14.0`.

**Architecture:** A pure `src/main/trade/suggest.ts` on top of Plan L's `evaluateTrade`: enumerate candidates (my whole roster × the partner players who `canEnter` my lineup in some window week), reject on the market ratio before any lineup solve, evaluate the rest, filter my side by stance and their side by acceptance, drop padded 2-for-1s / 1-for-2s whose contained 1-for-1 already passes, sort and cap. One new IPC channel `trade:suggest` reads the cached `LineupBuild`. The renderer adds a Suggestions card to `TradeScreen.tsx` (focus / stance / team controls, one row per offer, **Open in builder**) and a **Suggest with this team** button beside the Partner select; pure strings live in `lib/tradeView.ts`. A new synthetic-league fixture (`tests/fixtures/synthetic.ts`) drives the engine tests and the 16 × 16 budget test.

**Tech Stack:** unchanged — Electron 39, React 19, TypeScript strict, Tailwind 4 + shadcn, Vitest 5 (jsdom + Testing Library for component tests), lucide-react, better-sqlite3 fixtures.

**Spec:** `docs/superpowers/specs/2026-09-21-slice6b-trade-evaluator-design.md` — §3 (suggestion search), §4.1 (`TradeStance`, `TradeFocus`, `TradeSuggestion`, `TradeSuggestQuery`), §4.2 (`trade:suggest`), §5.2 (suggestions UI, "Open in builder", "Suggest with this team"), §6 (budget ≤ 3 s), §7 (tests), §9 (Plan M = `v0.14.0`).

## Global Constraints

- Same as Plans C–L: Node ≥ 22.13 (`source ~/.nvm/nvm.sh && nvm use` if `node --version` is not 22.x), no Electron imports outside `src/main/index.ts`, `src/main/ipc/`, `src/preload/`. Path aliases: `@main/*`, `@shared/*`, `@/*` (renderer). Tests import fixtures relatively (`../../fixtures/...`).
- **Payload conventions** (`docs/reference/value-and-signals.md`): `null` = not computable; points display with 2 decimals (`fmtPoints`), signed with `fmtSigned`, `—` for null. Market values through `fmtMarket` (thin-space thousands).
- **Engine reuse** (spec §3.2): every candidate is scored by `evaluateTrade(build, proposal)` from Plan L — a suggestion carries that `TradeEvaluation` unchanged, so the card and the builder show identical numbers. Market ratio of a side = `marketRatio(side)` = `marketGet / marketGive` (`+∞` when `marketGive = 0`); `MARKET_FAIR = 0.90` (both from `@main/trade/evaluate`).
- **Stance table** (spec §3.3), my side, on `deltaPerWeek` and my market ratio — `premium`: ≥ +1.0 and ≥ 1.00 · `fair`: > 0 and ≥ 0.85 · `overpay`: ≥ −1.0 and ≥ 0.70. **Acceptance**, their side: `delta > 0` (`lineup`) or their ratio ≥ `MARKET_FAIR` (`market`), both → `both`, neither → rejected.
- **Shapes** (spec §3.2): 1-for-1, 2-for-1 (I give two), 1-for-2 (I get two). My give pool = my whole roster (IR / taxi included). Their pool per team = players with `canEnter` true on **my** current optimal lineup for at least one window week (`candidateFor` is null for IR / taxi / out players, so they never qualify). `focus.give` → every offer includes that player; `focus.want` → at least one received player has that position; in a 1-for-2 both received players must be in the pool.
- **Dominance / ranking** (spec §3.4): `DOMINANCE_PTS = 0.5`, `SUGGEST_MAX = 30`; sort by my `delta` desc, ties by my market ratio desc, then partner name.
- **Errors** (spec §4.2 / §6): `trade:suggest` throws `TradeError` `NO_PROJECTIONS` / `NO_ME` like the other channels (the renderer shows the message in the section's error line); `[]` is a normal answer. Budget: ≤ 3 s per query on a 16-team, 16-player league, 15-week window.
- Verification before every commit: `npm run typecheck && npm run lint && npm test`; run `npm run format` when Prettier complains. Conventional Commits, summary ≤ 50 chars, imperative, **no trailers** (no `Co-Authored-By`, no "Generated with").
- ESLint is strict: explicit return types on every named function and component, `react-hooks/set-state-in-effect` is an error (state may only be set inside promise callbacks / event handlers, never synchronously in an effect body), no unused vars / imports.
- Decisions locked in here (not in the spec):
  - **Dominance direction**: a 2-for-1 / 1-for-2 is dropped when `bigger.me.delta − contained1for1.me.delta ≤ DOMINANCE_PTS` — the extra player must buy me more than 0.5 points over the window, otherwise it was padding (a bigger offer that is _worse_ than its 1-for-1 is dropped too). "Passes the same filters" includes the focus: with `focus.give = D`, `C→F` is never enumerated, so `C+D→F` is kept even though `C→F` alone would pass — moving D is what the user asked for.
  - **Market pre-check**: my market ratio needs no lineup solve, so a candidate below the stance's ratio is rejected before `evaluateTrade` runs. Results are identical to filtering afterwards (same `marketSum`); it only saves time.
  - **`focus.give` not on my roster** (traded on Sleeper since the last sync) → `[]`, not an error; the pool refetch on the next `dataVersion` resets the control.
  - **Open in builder** sets the partner and both sides and shows the suggestion's carried `evaluation` as the verdict — no second `trade:evaluate` call (the numbers cannot diverge), then scrolls the builder into view.
  - **Suggestions "with" control**: the section has its own team select (`all teams` + every partner). **Suggest with this team** copies the builder's partner into it and runs Find. Changing the focus / stance / team does not clear the last result; Find replaces it.
  - **Empty-result hint** depends on the stance: premium → "No offers at this stance — try fair or overpay", fair → "No offers at this stance — try overpay", overpay → "No offers — widen the focus or pick another team".
  - **Result cap** is a test-only option `suggestTrades(build, query, { max })` (like `EvaluateOptions.skip`), default `SUGGEST_MAX`.

---

### Task 0: Branch

**Files:** none.

- [x] **Step 1:** `git checkout -b feat/trade-suggestions` from `main` (clean, at `5184d1c` or later).

---

### Task 1: Shared types, stance and acceptance filters

**Files:**

- Modify: `src/shared/types.ts` (after `TradePool`, ~line 390)
- Create: `src/main/trade/suggest.ts` (constants + pure filters; `suggestTrades` comes in Task 3)
- Test: `tests/main/trade/suggest.test.ts`

**Interfaces:**

- Consumes: `MARKET_FAIR` (`@main/trade/evaluate`); `TradeEvaluation` (`@shared/types`).
- Produces: types `TradeStance`, `TradeFocus`, `TradeSuggestQuery`, `TradeSuggestion`; `STANCES: Record<TradeStance, { deltaPerWeek: number; strict: boolean; ratio: number }>`; `DOMINANCE_PTS = 0.5`; `SUGGEST_MAX = 30`; `passesStance(stance: TradeStance, deltaPerWeek: number, ratio: number): boolean`; `acceptanceOf(theirDelta: number, theirRatio: number): TradeSuggestion['acceptance'] | null`.

- [x] **Step 1: Write the failing tests**

Create `tests/main/trade/suggest.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  acceptanceOf,
  DOMINANCE_PTS,
  passesStance,
  STANCES,
  SUGGEST_MAX
} from '@main/trade/suggest'

describe('stance filters (spec 6b §3.3)', () => {
  it.each([
    ['premium', 1, 1, true],
    ['premium', 0.99, 1, false],
    ['premium', 1, 0.999, false],
    ['fair', 0, 0.85, false], // Δ/week exactly 0 fails: fair is "> 0"
    ['fair', 0.01, 0.85, true],
    ['fair', 0.01, 0.849, false],
    ['overpay', -1, 0.7, true],
    ['overpay', -1.01, 0.7, false],
    ['overpay', -1, 0.69, false]
  ] as const)('%s: Δ/week %s, ratio %s → %s', (stance, deltaPerWeek, ratio, ok) => {
    expect(passesStance(stance, deltaPerWeek, ratio)).toBe(ok)
  })

  it('treats an unpriced give as +∞ and an unpriced get as 0', () => {
    expect(passesStance('premium', 5, Number.POSITIVE_INFINITY)).toBe(true)
    expect(passesStance('overpay', 5, 0)).toBe(false)
  })

  it('labels why they would accept', () => {
    expect(acceptanceOf(0.01, 0.5)).toBe('lineup')
    expect(acceptanceOf(0, 0.9)).toBe('market')
    expect(acceptanceOf(-3, Number.POSITIVE_INFINITY)).toBe('market')
    expect(acceptanceOf(0.01, 0.9)).toBe('both')
    expect(acceptanceOf(0, 0.899)).toBeNull()
  })

  it('pins the constants', () => {
    expect(STANCES).toEqual({
      premium: { deltaPerWeek: 1, strict: false, ratio: 1 },
      fair: { deltaPerWeek: 0, strict: true, ratio: 0.85 },
      overpay: { deltaPerWeek: -1, strict: false, ratio: 0.7 }
    })
    expect(DOMINANCE_PTS).toBe(0.5)
    expect(SUGGEST_MAX).toBe(30)
  })
})
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/main/trade/suggest.test.ts`
Expected: FAIL — `Failed to resolve import "@main/trade/suggest"`.

- [x] **Step 3: Add the types**

In `src/shared/types.ts`, directly after the `TradePool` interface (the one ending with `teams: TradePoolTeam[]`), add:

```ts
/** Slice 6b spec §3.1: how eager I am — moves the thresholds on my side only. */
export type TradeStance = 'premium' | 'fair' | 'overpay'

/** A player I'd give (`give`: player id), a position I want (`want`), or no focus. */
export type TradeFocus = { give: string } | { want: string } | null

export interface TradeSuggestQuery {
  season: number
  focus: TradeFocus
  stance: TradeStance
  /** Restrict the scan to one team; null = every other team. */
  partnerRosterId: number | null
}

export interface TradeSuggestion {
  /** Exactly what `trade:evaluate` returns for this proposal — the card and the builder agree. */
  evaluation: TradeEvaluation
  /** Why they'd take it: their lineup improves, the market is fair for them, or both. */
  acceptance: 'lineup' | 'market' | 'both'
}
```

- [x] **Step 4: Create `src/main/trade/suggest.ts` with the filters**

```ts
import type { TradeStance, TradeSuggestion } from '@shared/types'
import { MARKET_FAIR } from './evaluate'

/** Spec 6b §3.3: what my side must clear per stance; `strict` makes the Δ/week bound exclusive. */
export const STANCES: Record<
  TradeStance,
  { deltaPerWeek: number; strict: boolean; ratio: number }
> = {
  premium: { deltaPerWeek: 1, strict: false, ratio: 1 },
  fair: { deltaPerWeek: 0, strict: true, ratio: 0.85 },
  overpay: { deltaPerWeek: -1, strict: false, ratio: 0.7 }
}
/** Spec §3.4: a 2-for-1 / 1-for-2 that beats its 1-for-1 by no more than this was padding. */
export const DOMINANCE_PTS = 0.5
export const SUGGEST_MAX = 30

export function passesStance(stance: TradeStance, deltaPerWeek: number, ratio: number): boolean {
  const s = STANCES[stance]
  const deltaOk = s.strict ? deltaPerWeek > s.deltaPerWeek : deltaPerWeek >= s.deltaPerWeek
  return deltaOk && ratio >= s.ratio
}

/** Spec §3.3: why the other manager would take it; null when they would not. */
export function acceptanceOf(
  theirDelta: number,
  theirRatio: number
): TradeSuggestion['acceptance'] | null {
  const lineup = theirDelta > 0
  const market = theirRatio >= MARKET_FAIR
  if (lineup && market) return 'both'
  if (lineup) return 'lineup'
  return market ? 'market' : null
}
```

- [x] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/main/trade/suggest.test.ts`
Expected: PASS (12 tests). Then `npm run typecheck && npm run lint`.

- [x] **Step 6: Commit**

```bash
git add src/shared/types.ts src/main/trade/suggest.ts tests/main/trade/suggest.test.ts
git commit -m "feat(trade): stance and acceptance filters"
```

---

### Task 2: Synthetic league fixture

The Sleeper fixture league has two teams and six players — too small for shapes, dominance and the budget. This fixture seeds an in-memory DB from a declarative league (teams, players, per-week projected points, FantasyCalc values) and returns the `LineupBuild`, exactly as `cachedLineup` builds it. Projections use `stats: { rec: n }` under the PPR `rules()` fixture, so a player "worth 20" scores exactly 20.00.

**Files:**

- Create: `tests/fixtures/synthetic.ts`
- Modify: `tests/main/trade/suggest.test.ts` (append a fixture-sanity describe)

**Interfaces:**

- Consumes: DB repos (`upsertLeague`, `replaceTeams`, `replaceRosterPlayers`, `upsertPlayers`, `replaceProjections`, `replaceMarketValues`, `saveRules`, `setNflState`, `setSetting`), `buildValueSeason`, `buildLineups`, `mapLeague`, the `rules()` and Sleeper fixtures.
- Produces: `SyntheticPlayer`, `SyntheticTeam`, `SyntheticLeague`; `SMALL_LEAGUE: SyntheticLeague`; `syntheticBuild(league: SyntheticLeague): { db: Db; build: LineupBuild }`; `rng(seed: number): () => number`; `generateLeague(seed: number, teamCount = 16): SyntheticLeague` (used by Task 4).

- [x] **Step 1: Write the failing sanity test**

Append to `tests/main/trade/suggest.test.ts` (add the imports at the top of the file):

```ts
import { teamWeek, windowWeeks } from '@main/lineup/build'
import { rosterSize } from '@main/trade/evaluate'
import { generateLeague, SMALL_LEAGUE, syntheticBuild } from '../../fixtures/synthetic'
```

```ts
describe('synthetic league fixture', () => {
  it('builds the small league as its table says', () => {
    const { build } = syntheticBuild(SMALL_LEAGUE)
    expect(windowWeeks(build)).toEqual([16, 17])
    expect(rosterSize(build)).toBe(4)
    expect(build.inputs.teams.map((t) => [t.rosterId, t.isMe])).toEqual([
      [1, true],
      [2, false],
      [3, false]
    ])
    // Me: RB A20 · WR B8 · FLEX C18; Rival: RB G7 · WR F19 · FLEX E17; Other: RB J4 · WR I25 · FLEX L9
    expect(teamWeek(build, 1, 16).optimalTotal).toBe(46)
    expect(teamWeek(build, 2, 16).optimalTotal).toBe(43)
    expect(teamWeek(build, 3, 17).optimalTotal).toBe(38)
    expect(build.rowById.get('I')?.market?.value).toBe(7000)
    expect(build.rowById.get('D')?.rosPoints).toBe(10) // 5 + 5 over the two window weeks
    expect(
      build.rosters
        .get(3)
        ?.map((s) => s.base.playerId)
        .sort()
    ).toEqual(['I', 'J', 'K', 'L'])
  })

  it('generates a full league deterministically', () => {
    const league = generateLeague(7)
    expect(league.teams).toHaveLength(16)
    expect(league.teams.every((t) => t.players.length === 16)).toBe(true)
    expect(league.weeks).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17])
    expect(generateLeague(7)).toEqual(league)
    const { build } = syntheticBuild(league)
    expect(windowWeeks(build)).toHaveLength(15)
    expect(rosterSize(build)).toBe(16)
    expect(teamWeek(build, 1, 3).optimalTotal).toBeGreaterThan(0)
  })
})
```

- [x] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/main/trade/suggest.test.ts`
Expected: FAIL — `Failed to resolve import "../../fixtures/synthetic"`.

- [x] **Step 3: Create `tests/fixtures/synthetic.ts`**

```ts
import { openDatabase, type Db } from '@main/db/connection'
import { migrate } from '@main/db/migrate'
import { upsertLeague } from '@main/db/repos/leagues'
import { replaceMarketValues } from '@main/db/repos/marketValues'
import { listMatchups } from '@main/db/repos/matchups'
import { upsertPlayers, type PlayerRecord } from '@main/db/repos/players'
import { replaceProjections } from '@main/db/repos/projections'
import { saveRules } from '@main/db/repos/rules'
import { SETTING_ACTIVE_LEAGUE, SETTING_MY_USER, setSetting } from '@main/db/repos/settings'
import { setNflState } from '@main/db/repos/state'
import {
  listStarterIndexes,
  listTeams,
  replaceRosterPlayers,
  replaceTeams
} from '@main/db/repos/teams'
import { buildLineups, type LineupBuild } from '@main/lineup/build'
import { mapLeague } from '@main/sync/mappers'
import { buildValueSeason } from '@main/value/build'
import type { Rules } from '@shared/rules'
import type { RosterSlot, Team } from '@shared/types'
import { SEED_TS } from './db'
import { rules } from './rules'
import { SEASON } from './season'
import * as fx from './sleeper'

export interface SyntheticPlayer {
  id: string
  position: string
  /** Projected points per window week (one number = the same every week). */
  weekly: number | number[]
  slot?: RosterSlot
  /** FantasyCalc value; omitted / null = outside its list. */
  market?: number | null
}

export interface SyntheticTeam {
  rosterId: number
  name: string
  isMe?: boolean
  players: SyntheticPlayer[]
}

export interface SyntheticLeague {
  currentWeek: number
  /** Weeks that get a projection row; the window is currentWeek..lastWeek from `rules.settings`. */
  weeks: number[]
  /** Sleeper `roster_positions`; IR / TAXI do not count towards the roster size. */
  rosterPositions: string[]
  rules?: Rules
  teams: SyntheticTeam[]
}

/**
 * Three teams, slots RB · WR · FLEX (+1 bench), roster size 4, window weeks 16–17 (two weeks,
 * constant values, so `delta = 2 × weekly Δ` and `deltaPerWeek = weekly Δ`). Everyone below is
 * FantasyCalc-valued. Optimal per week: Me 46 (A, B, C), Rival 43 (G, F, E), Other 38 (J, I, L).
 *
 * | Me (1)        | Rival (2)     | Other (3)     |
 * | ------------- | ------------- | ------------- |
 * | A RB 20 5000  | F WR 19 4400  | I WR 25 7000  |
 * | C RB 18 4000  | E WR 17 3800  | J RB 4 500    |
 * | B WR 8 1500   | G RB 7 1000   | K WR 6 900    |
 * | D WR 5 300    | H RB 3 100    | L TE 9 1200   |
 *
 * Players who can enter my lineup (RB A20 · WR B8 · FLEX C18): F, E (Rival) and I (Other).
 * Expected offers, computed by hand in the Plan M document:
 *   fair / premium → A+B→I (me +4, them −2, drop J, market) · C→F (me +2, them −2, market)
 *   overpay        → the two above, then C→E (me −2, ratio 0.95, both) · A→F (me −2, ratio 0.88, both)
 *   C+D→F, A+D→F, C+D→E pass but are dominated by C→F / A→F / C→E; every 1-for-2 fails on their side.
 */
export const SMALL_LEAGUE: SyntheticLeague = {
  currentWeek: 16,
  weeks: [16, 17],
  rosterPositions: ['RB', 'WR', 'FLEX', 'BN'],
  rules: rules({
    rosterSlots: [
      { slot: 'RB', count: 1 },
      { slot: 'WR', count: 1 },
      { slot: 'FLEX', count: 1 },
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
        { id: 'A', position: 'RB', weekly: 20, market: 5000 },
        { id: 'C', position: 'RB', weekly: 18, market: 4000 },
        { id: 'B', position: 'WR', weekly: 8, market: 1500 },
        { id: 'D', position: 'WR', weekly: 5, market: 300 }
      ]
    },
    {
      rosterId: 2,
      name: 'Rival',
      players: [
        { id: 'F', position: 'WR', weekly: 19, market: 4400 },
        { id: 'E', position: 'WR', weekly: 17, market: 3800 },
        { id: 'G', position: 'RB', weekly: 7, market: 1000 },
        { id: 'H', position: 'RB', weekly: 3, market: 100 }
      ]
    },
    {
      rosterId: 3,
      name: 'Other',
      players: [
        { id: 'I', position: 'WR', weekly: 25, market: 7000 },
        { id: 'J', position: 'RB', weekly: 4, market: 500 },
        { id: 'K', position: 'WR', weekly: 6, market: 900 },
        { id: 'L', position: 'TE', weekly: 9, market: 1200 }
      ]
    }
  ]
}

function team(t: SyntheticTeam): Team {
  return {
    leagueId: 'L1',
    rosterId: t.rosterId,
    ownerId: `u${t.rosterId}`,
    displayName: t.name,
    teamName: null,
    avatar: null,
    wins: 0,
    losses: 0,
    ties: 0,
    fpts: 0,
    fptsAgainst: 0,
    isMe: t.isMe ?? false
  }
}

function playerRecord(p: SyntheticPlayer): PlayerRecord {
  return {
    playerId: p.id,
    fullName: p.id,
    firstName: null,
    lastName: null,
    position: p.position,
    fantasyPositions: [p.position],
    team: null,
    status: 'Active',
    injuryStatus: null,
    age: null,
    yearsExp: null,
    depthChartOrder: null,
    searchRank: null,
    gsisId: null,
    sportradarId: null,
    espnId: null
  }
}

/** Seeds an in-memory DB with the league as of `currentWeek` and builds the lineups on it, as `cachedLineup` does. */
export function syntheticBuild(league: SyntheticLeague): { db: Db; build: LineupBuild } {
  const db = openDatabase(':memory:')
  migrate(db)
  const leagueRules = league.rules ?? rules()
  upsertLeague(db, mapLeague(fx.league, SEED_TS), SEED_TS)
  saveRules(db, 'L1', leagueRules)
  setSetting(db, SETTING_ACTIVE_LEAGUE, 'L1')
  setSetting(db, SETTING_MY_USER, 'u1')
  setNflState(db, {
    season: String(SEASON),
    week: league.currentWeek,
    displayWeek: league.currentWeek,
    seasonType: 'regular',
    fetchedAt: SEED_TS
  })
  replaceTeams(db, 'L1', league.teams.map(team), SEED_TS)
  replaceRosterPlayers(
    db,
    'L1',
    league.teams.flatMap((t) =>
      t.players.map((p) => ({
        rosterId: t.rosterId,
        playerId: p.id,
        slot: p.slot ?? 'bench',
        starterIndex: null
      }))
    ),
    SEED_TS
  )
  const players = league.teams.flatMap((t) => t.players)
  upsertPlayers(db, players.map(playerRecord), SEED_TS)
  league.weeks.forEach((week, i) => {
    replaceProjections(
      db,
      SEASON,
      week,
      players.map((p) => ({
        playerId: p.id,
        season: SEASON,
        week,
        company: 'rotowire',
        team: null,
        opponent: 'OPP',
        stats: { rec: Array.isArray(p.weekly) ? p.weekly[i] : p.weekly }
      })),
      SEED_TS
    )
  })
  const valued = players.filter((p) => typeof p.market === 'number')
  replaceMarketValues(
    db,
    SEASON,
    valued.map((p, i) => ({
      playerId: p.id,
      value: p.market as number,
      overallRank: i + 1,
      posRank: i + 1,
      tier: null,
      trend30d: 0
    })),
    SEED_TS
  )
  const build = buildLineups({
    value: buildValueSeason(db, 'L1', SEASON),
    teams: listTeams(db, 'L1'),
    rosterSlots: leagueRules.rosterSlots,
    rosterPositions: league.rosterPositions,
    matchups: listMatchups(db, 'L1', SEASON),
    starterIndexes: listStarterIndexes(db, 'L1'),
    tradeDeadlineWeek: leagueRules.settings.tradeDeadlineWeek ?? null
  })
  return { db, build }
}

/** Small deterministic generator so a failing case reproduces from its seed. */
export function rng(seed: number): () => number {
  let s = seed
  return (): number => {
    s = (s * 1103515245 + 12345) % 2147483648
    return s / 2147483648
  }
}

const SHAPE = [
  'QB',
  'QB',
  'RB',
  'RB',
  'RB',
  'RB',
  'RB',
  'WR',
  'WR',
  'WR',
  'WR',
  'WR',
  'TE',
  'TE',
  'K',
  'DEF'
]
const RANGES: Record<string, [number, number]> = {
  QB: [12, 24],
  RB: [3, 20],
  WR: [3, 20],
  TE: [2, 12],
  K: [6, 10],
  DEF: [4, 10]
}

/**
 * Spec 6b §6 budget league: `teamCount` teams × 16 players (2 QB, 5 RB, 5 WR, 2 TE, K, DEF), the
 * default 12-team PPR slots, a 16-spot roster, window weeks 3–17 with ±30 % weekly jitter, and a
 * FantasyCalc value for players in the upper half of their position's range.
 */
export function generateLeague(seed: number, teamCount = 16): SyntheticLeague {
  const r = rng(seed)
  const currentWeek = 3
  const weeks = Array.from({ length: 15 }, (_, i) => currentWeek + i)
  let n = 0
  const teams = Array.from({ length: teamCount }, (_, t): SyntheticTeam => ({
    rosterId: t + 1,
    name: `Team ${t + 1}`,
    isMe: t === 0,
    players: SHAPE.map((position): SyntheticPlayer => {
      const [lo, hi] = RANGES[position]
      const mean = lo + (hi - lo) * r()
      n++
      return {
        id: `p${n}`,
        position,
        weekly: weeks.map(() => Math.round(mean * (0.7 + 0.6 * r()) * 10) / 10),
        market: mean >= (lo + hi) / 2 ? Math.round(mean * 400 * (0.8 + 0.4 * r())) : null
      }
    })
  }))
  return {
    currentWeek,
    weeks,
    rosterPositions: [
      'QB',
      'RB',
      'RB',
      'WR',
      'WR',
      'TE',
      'FLEX',
      'K',
      'DEF',
      'BN',
      'BN',
      'BN',
      'BN',
      'BN',
      'BN',
      'BN'
    ],
    teams
  }
}
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/main/trade/suggest.test.ts`
Expected: PASS. If `optimalTotal` for team 1 is not 46, print `teamWeek(build, 1, 16).optimal` — the usual cause is a projection week not in the window (`setNflState` week vs `weeks`) or a `rec` key missing from the rules fixture's scoring. Then `npm run typecheck && npm run lint` (`npm run format` if Prettier reflows the `SHAPE` / `rosterPositions` arrays).

- [x] **Step 5: Commit**

```bash
git add tests/fixtures/synthetic.ts tests/main/trade/suggest.test.ts
git commit -m "test: synthetic league fixture for trade searches"
```

---

### Task 3: `suggestTrades` — pool, shapes, filters, dominance, ranking

**Files:**

- Modify: `src/main/trade/evaluate.ts` (export `marketSum`)
- Modify: `src/main/trade/suggest.ts` (add `suggestTrades`)
- Test: `tests/main/trade/suggest.test.ts`

**Interfaces:**

- Consumes: `evaluateTrade`, `marketRatio`, `marketSum`, `myTeam`, `requireWindow` (`@main/trade/evaluate`); `canEnter` (`@main/trade/enter`); `candidateFor`, `teamWeek` (`@main/lineup/build`); Task 1's filters and constants.
- Produces: `suggestTrades(build: LineupBuild, query: TradeSuggestQuery, opts?: SuggestOptions): TradeSuggestion[]`; `SuggestOptions = { max?: number }`.

- [x] **Step 1: Write the failing tests**

Append to `tests/main/trade/suggest.test.ts` (extend the existing imports: add `suggestTrades` to the `@main/trade/suggest` import, `evaluateTrade` and `TradeError` to the `@main/trade/evaluate` import, and add the two new imports below):

```ts
import type { TradeSuggestQuery, TradeSuggestion } from '@shared/types'
import { SEASON } from '../../fixtures/season'
```

```ts
const query = (over: Partial<TradeSuggestQuery> = {}): TradeSuggestQuery => ({
  season: SEASON,
  focus: null,
  stance: 'fair',
  partnerRosterId: null,
  ...over
})
/** "A+B→I@3": my give ids, their get ids (each sorted), partner roster. */
const shape = (s: TradeSuggestion): string => {
  const ids = (list: { playerId: string }[]): string =>
    list
      .map((p) => p.playerId)
      .sort()
      .join('+')
  return `${ids(s.evaluation.me.give)}→${ids(s.evaluation.me.get)}@${s.evaluation.them.rosterId}`
}
const shapes = (list: TradeSuggestion[]): string[] => list.map(shape)

/** The TradeError code a call throws, or a marker when it does not throw / throws something else. */
function codeOf(fn: () => unknown): string {
  try {
    fn()
  } catch (err) {
    if (err instanceof TradeError) return err.code
    throw err
  }
  return 'no error'
}

describe('suggestTrades on the small league (spec 6b §3)', () => {
  const { build } = syntheticBuild(SMALL_LEAGUE)

  it('finds the offers that help me and that they would take, ranked', () => {
    const out = suggestTrades(build, query())
    expect(shapes(out)).toEqual(['A+B→I@3', 'C→F@2'])
    const [abi, cf] = out
    expect(abi.acceptance).toBe('market')
    expect(abi.evaluation.me).toMatchObject({ delta: 4, deltaPerWeek: 2, drops: [] })
    expect(abi.evaluation.them.delta).toBe(-2)
    expect(abi.evaluation.them.drops.map((p) => p.playerId)).toEqual(['J'])
    expect(cf.acceptance).toBe('market')
    expect(cf.evaluation.me).toMatchObject({ delta: 2, deltaPerWeek: 1 })
    expect(cf.evaluation.them.delta).toBe(-2)
    // a suggestion carries exactly what the builder would compute for it
    for (const s of out) {
      const { me, them } = s.evaluation
      expect(
        evaluateTrade(build, {
          rosterId: them.rosterId,
          give: me.give.map((p) => p.playerId),
          get: me.get.map((p) => p.playerId)
        })
      ).toEqual(s.evaluation)
    }
  })

  it('applies the stance on my side only', () => {
    // C→F sits exactly on premium's +1.0 / week bound and clears 100 % of market
    expect(shapes(suggestTrades(build, query({ stance: 'premium' })))).toEqual(['A+B→I@3', 'C→F@2'])
    const overpay = suggestTrades(build, query({ stance: 'overpay' }))
    expect(shapes(overpay)).toEqual(['A+B→I@3', 'C→F@2', 'C→E@2', 'A→F@2'])
    // the two I overpay in are win-win for them: ordered by my market ratio (0.95 before 0.88)
    expect(overpay.slice(2).map((s) => s.acceptance)).toEqual(['both', 'both'])
    expect(overpay.slice(2).map((s) => s.evaluation.me.delta)).toEqual([-2, -2])
  })

  it('drops a padded 2-for-1 but keeps one whose 1-for-1 they would refuse', () => {
    // C+D→F passes on its own (me +2, them market 0.98) but adds nothing over C→F: dropped.
    // A+B→I is kept: A→I and B→I both fail on their side, so the pair is what makes it work.
    const out = shapes(suggestTrades(build, query()))
    expect(out).not.toContain('C+D→F@2')
    expect(out).toContain('A+B→I@3')
    // at overpay, A+D→F and C+D→E are padding over A→F and C→E
    const wide = shapes(suggestTrades(build, query({ stance: 'overpay' })))
    expect(wide).not.toContain('A+D→F@2')
    expect(wide).not.toContain('C+D→E@2')
  })

  it('restricts the scan to one partner', () => {
    expect(shapes(suggestTrades(build, query({ partnerRosterId: 2 })))).toEqual(['C→F@2'])
    expect(shapes(suggestTrades(build, query({ partnerRosterId: 3 })))).toEqual(['A+B→I@3'])
    expect(suggestTrades(build, query({ partnerRosterId: 9 }))).toEqual([])
  })

  it('honours the focus: a player I give, a position I want', () => {
    expect(shapes(suggestTrades(build, query({ focus: { give: 'C' } })))).toEqual(['C→F@2'])
    expect(shapes(suggestTrades(build, query({ focus: { give: 'A' } })))).toEqual(['A+B→I@3'])
    // C→F is outside the focus, so C+D→F is not dominated by it
    expect(shapes(suggestTrades(build, query({ focus: { give: 'D' } })))).toEqual(['C+D→F@2'])
    expect(suggestTrades(build, query({ focus: { give: 'nobody' } }))).toEqual([])
    expect(suggestTrades(build, query({ focus: { want: 'RB' } }))).toEqual([])
    expect(shapes(suggestTrades(build, query({ focus: { want: 'WR' } })))).toEqual([
      'A+B→I@3',
      'C→F@2'
    ])
  })

  it('caps the list', () => {
    expect(shapes(suggestTrades(build, query({ stance: 'overpay' }), { max: 3 }))).toEqual([
      'A+B→I@3',
      'C→F@2',
      'C→E@2'
    ])
  })

  it('fails the ratio when what I get is unvalued', () => {
    const unvalued = syntheticBuild({
      ...SMALL_LEAGUE,
      teams: SMALL_LEAGUE.teams.map((t) => ({
        ...t,
        players: t.players.map((p) => (p.id === 'I' ? { ...p, market: null } : p))
      }))
    })
    expect(shapes(suggestTrades(unvalued.build, query({ stance: 'overpay' })))).toEqual([
      'C→F@2',
      'C→E@2',
      'A→F@2'
    ])
  })

  it('throws NO_ME and NO_PROJECTIONS like the evaluator', () => {
    const nobody = syntheticBuild({
      ...SMALL_LEAGUE,
      teams: SMALL_LEAGUE.teams.map((t) => ({ ...t, isMe: false }))
    })
    expect(codeOf(() => suggestTrades(nobody.build, query()))).toBe('NO_ME')
    const blind = syntheticBuild({ ...SMALL_LEAGUE, weeks: [] })
    expect(codeOf(() => suggestTrades(blind.build, query()))).toBe('NO_PROJECTIONS')
  })
})
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/main/trade/suggest.test.ts`
Expected: FAIL — `suggestTrades` is not exported (`TypeError: suggestTrades is not a function`).

- [x] **Step 3: Export `marketSum` from `src/main/trade/evaluate.ts`**

Change the declaration (line ~99) from `function marketSum(` to:

```ts
/** Σ FantasyCalc value of a list; players outside FantasyCalc's list count 0 and are counted. */
export function marketSum(
```

- [x] **Step 4: Add `suggestTrades` to `src/main/trade/suggest.ts`**

Replace the imports at the top of the file with:

```ts
import { candidateFor, teamWeek, type LineupBuild } from '@main/lineup/build'
import type { PlayerSeries } from '@main/value/series'
import type { Team, TradeStance, TradeSuggestQuery, TradeSuggestion } from '@shared/types'
import { canEnter } from './enter'
import {
  evaluateTrade,
  MARKET_FAIR,
  marketRatio,
  marketSum,
  myTeam,
  requireWindow
} from './evaluate'
```

and append after `acceptanceOf`:

```ts
export interface SuggestOptions {
  /** Tests only: result cap (default `SUGGEST_MAX`). */
  max?: number
}

function pairs<T>(list: T[]): [T, T][] {
  const out: [T, T][] = []
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) out.push([list[i], list[j]])
  }
  return out
}

const ids = (list: PlayerSeries[]): string[] => list.map((s) => s.base.playerId)
const key = (give: string, get: string): string => `${give}|${get}`

/** Descending comparator that is safe on ±∞ (no `b - a` NaN). */
function desc(a: number, b: number): number {
  return a === b ? 0 : a > b ? -1 : 1
}

/** Spec §3.2–3.3: evaluate one candidate; null unless my stance and their acceptance both pass. */
function consider(
  build: LineupBuild,
  partner: Team,
  give: PlayerSeries[],
  get: PlayerSeries[],
  stance: TradeStance
): TradeSuggestion | null {
  // My market ratio needs no lineup solve — the same sums evaluateTrade would compute.
  const cheap = { marketGive: marketSum(build, give).total, marketGet: marketSum(build, get).total }
  if (marketRatio(cheap) < STANCES[stance].ratio) return null
  const evaluation = evaluateTrade(build, {
    rosterId: partner.rosterId,
    give: ids(give),
    get: ids(get)
  })
  if (!passesStance(stance, evaluation.me.deltaPerWeek, marketRatio(evaluation.me))) return null
  const acceptance = acceptanceOf(evaluation.them.delta, marketRatio(evaluation.them))
  return acceptance === null ? null : { evaluation, acceptance }
}

/** Spec 6b §3: 1-for-1, 2-for-1 and 1-for-2 offers that pass my stance and their acceptance, ranked. */
export function suggestTrades(
  build: LineupBuild,
  query: TradeSuggestQuery,
  opts: SuggestOptions = {}
): TradeSuggestion[] {
  const weeks = requireWindow(build)
  const me = myTeam(build)
  const myRoster = build.rosters.get(me.rosterId) ?? []
  const focusGive = query.focus !== null && 'give' in query.focus ? query.focus.give : null
  const want = query.focus !== null && 'want' in query.focus ? query.focus.want : null
  if (focusGive !== null && !myRoster.some((s) => s.base.playerId === focusGive)) return []

  const includesFocus = (give: PlayerSeries[]): boolean =>
    focusGive === null || give.some((s) => s.base.playerId === focusGive)
  const giveSingles = myRoster.map((s) => [s]).filter(includesFocus)
  const givePairs = pairs(myRoster).filter(includesFocus)

  // Their pool: players who could raise my current optimal lineup in at least one window week.
  const myWeeks = weeks.map((w) => teamWeek(build, me.rosterId, w))
  const entersMine = (s: PlayerSeries): boolean =>
    weeks.some((w, i) => {
      const c = candidateFor(build, s, w)
      return c !== null && canEnter(c, build.slots, myWeeks[i].optimal)
    })
  const hasWant = (get: PlayerSeries[]): boolean =>
    want === null || get.some((s) => s.base.position === want)

  // 1-for-1s that passed, by give|get → my delta; the bigger shapes check against them.
  const passing = new Map<string, number>()
  const dominated = (delta: number, keys: string[]): boolean =>
    keys.some((k) => {
      const single = passing.get(k)
      return single !== undefined && delta - single <= DOMINANCE_PTS
    })

  const found: TradeSuggestion[] = []
  const partners = build.inputs.teams.filter(
    (t) =>
      t.rosterId !== me.rosterId &&
      (query.partnerRosterId === null || t.rosterId === query.partnerRosterId)
  )
  for (const partner of partners) {
    const pool = (build.rosters.get(partner.rosterId) ?? []).filter(entersMine)
    const getSingles = pool.map((s) => [s]).filter(hasWant)
    const getPairs = pairs(pool).filter(hasWant)
    for (const give of giveSingles) {
      for (const get of getSingles) {
        const r = consider(build, partner, give, get, query.stance)
        if (r) {
          passing.set(key(give[0].base.playerId, get[0].base.playerId), r.evaluation.me.delta)
          found.push(r)
        }
      }
    }
    for (const give of givePairs) {
      for (const get of getSingles) {
        const r = consider(build, partner, give, get, query.stance)
        const contained = give.map((s) => key(s.base.playerId, get[0].base.playerId))
        if (r && !dominated(r.evaluation.me.delta, contained)) found.push(r)
      }
    }
    for (const give of giveSingles) {
      for (const get of getPairs) {
        const r = consider(build, partner, give, get, query.stance)
        const contained = get.map((s) => key(give[0].base.playerId, s.base.playerId))
        if (r && !dominated(r.evaluation.me.delta, contained)) found.push(r)
      }
    }
  }
  found.sort(
    (a, b) =>
      desc(a.evaluation.me.delta, b.evaluation.me.delta) ||
      desc(marketRatio(a.evaluation.me), marketRatio(b.evaluation.me)) ||
      a.evaluation.them.name.localeCompare(b.evaluation.them.name)
  )
  return found.slice(0, opts.max ?? SUGGEST_MAX)
}
```

- [x] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/main/trade/suggest.test.ts`
Expected: PASS (all describes). If an expected shape list differs, print `out.map((s) => [shape(s), s.evaluation.me.delta, s.evaluation.them.delta, marketRatio(s.evaluation.them)])` and compare with the hand table in the fixture's doc comment before touching the engine — the fixture, not the search, is the likelier culprit. Then `npm run typecheck && npm run lint && npm test`.

- [x] **Step 6: Commit**

```bash
git add src/main/trade/evaluate.ts src/main/trade/suggest.ts tests/main/trade/suggest.test.ts
git commit -m "feat(trade): search 1-for-1, 2-for-1 and 1-for-2 offers"
```

---

### Task 3b: Make the search fast enough to ship (added during execution)

**Files:**

- Modify: `src/main/trade/evaluate.ts` (skip-aware drop counting, reuse of the oversized solve)
- Modify: `src/main/trade/suggest.ts` (acceptance prune, monotonicity bounds, `SuggestOptions.prune` / `.skip`)
- Test: `tests/main/trade/suggest.test.ts` (`describe('prunes are exact')`)

Four exact changes, in the order they were measured:

1. **Drop counting takes the week skip.** `sideResult` solved all 15 window weeks on the oversized roster before picking drops. Where the skip proves a week's lineup does not move, the before-optimal is an optimum of the oversized roster too, so its starters are the ones to count.
2. **The post-drop solve reuses the oversized one** when no dropped player started that week — removing a non-starter cannot change that week's optimum.
3. **Reject before any solve when their side cannot accept:** their market ratio is my sums swapped (free), and their delta cannot be positive when nothing they receive can enter their lineup in any window week, since they only lose players and gain ones that never start.
4. **Bound the bigger shapes on the 1-for-1s they contain.** Optimal totals are monotone in the roster, so giving a second player can only lower my after-total and receiving a second can only lower theirs. A 2-for-1 is skipped when a contained 1-for-1 already fails my `deltaPerWeek` bound; a 1-for-2 when a contained one leaves them worse off and the market cannot carry it. Both bounds need that side to have taken no drops (a drop removes a player the bigger shape may keep, which breaks the subset), so the recorded singles carry their drop counts. 1-for-1s are therefore always evaluated — they are the cheapest shape and the source of every bound.

The exactness is not argued, it is tested: `suggestTrades(build, q)` must equal `suggestTrades(build, q, { prune: false, skip: false })` on eight random 3-team leagues × three stances, and `evaluateTrade` must pick the same drops with the skip disabled.

---

### Task 4: Budget test — 16 × 16 league under 3 s

**Files:**

- Create: `tests/main/trade/suggestBudget.test.ts`

**Interfaces:**

- Consumes: `generateLeague`, `syntheticBuild` (Task 2); `suggestTrades` (Task 3).

- [x] **Step 1: Write the test**

```ts
import { describe, expect, it } from 'vitest'
import { suggestTrades } from '@main/trade/suggest'
import { SEASON } from '../../fixtures/season'
import { generateLeague, syntheticBuild } from '../../fixtures/synthetic'

const BUDGET_MS = 3000

/**
 * Spec 6b §6: a full search on a 16-team, 16-player league with a 15-week window stays under 3 s.
 * Timing-sensitive, so skipped in CI; run locally before every build (`npx vitest run suggestBudget`).
 */
describe.skipIf(!!process.env.CI)('suggestTrades budget', () => {
  it('scans a 16 × 16 league at every stance within the budget', () => {
    const { build } = syntheticBuild(generateLeague(7))
    for (const stance of ['premium', 'fair', 'overpay'] as const) {
      const t0 = performance.now()
      const out = suggestTrades(build, {
        season: SEASON,
        focus: null,
        stance,
        partnerRosterId: null
      })
      const ms = performance.now() - t0
      console.info(`suggest ${stance}: ${out.length} offers in ${ms.toFixed(0)} ms`)
      expect(out.length).toBeLessThanOrEqual(30)
      expect(ms).toBeLessThan(BUDGET_MS)
    }
  })
})
```

- [x] **Step 2: Run it and read the timings**

Run: `npx vitest run tests/main/trade/suggestBudget.test.ts`
Expected: PASS with three `suggest <stance>: n offers in <ms> ms` lines. The first (`premium`) is the cold run — later stances reuse the memoised `teamWeek` on the same build, as the app does after the first Find.

If a stance exceeds 3 000 ms: **do not optimise the engine in this plan.** Record the three timings and the candidate count in the commit body, keep the test (it will fail locally, which is the signal the spec asks for), and stop to report to the user — the spec records `worker_threads` as the fallback and that is their call. Do not raise `BUDGET_MS`.

- [x] **Step 3: Verify and commit**

Run: `npm run typecheck && npm run lint && npm test`.

```bash
git add tests/main/trade/suggestBudget.test.ts
git commit -m "test(trade): suggestion search budget on a 16x16 league"
```

---

### Task 5: IPC channel `trade:suggest`

**Files:**

- Modify: `src/shared/ipc.ts` (type imports, `Api.trade`, `IPC` map)
- Modify: `src/preload/index.ts` (`api.trade.suggest`)
- Modify: `src/main/ipc/handlers.ts` (handler)

**Interfaces:**

- Consumes: `suggestTrades` (Task 3); `cachedLineup`, `activeLeagueId` (existing in `handlers.ts`).
- Produces: IPC `trade:suggest (TradeSuggestQuery) → TradeSuggestion[]`; `api.trade.suggest(query)`.

- [x] **Step 1: `src/shared/ipc.ts`**

Add `TradeSuggestion` and `TradeSuggestQuery` to the `./types` import list (alphabetical, after `TradeProposal`). In `Api.trade`, after `evaluate`:

```ts
    /** Offers that pass my stance and their acceptance, ranked (slice 6b spec §3); `[]` is a normal answer. */
    suggest(query: TradeSuggestQuery): Promise<TradeSuggestion[]>
```

In the `IPC` map, after `tradeEvaluate`:

```ts
  tradeSuggest: 'trade:suggest',
```

- [x] **Step 2: `src/preload/index.ts`**

In `trade`, after `evaluate`:

```ts
suggest: (query) => ipcRenderer.invoke(IPC.tradeSuggest, query)
```

- [x] **Step 3: `src/main/ipc/handlers.ts`**

Add `import { suggestTrades } from '@main/trade/suggest'` after the `tradePool` import, and `TradeSuggestion`, `TradeSuggestQuery` to the `@shared/types` import list. After the `IPC.tradeEvaluate` handler:

```ts
ipcMain.handle(IPC.tradeSuggest, (_event, query: TradeSuggestQuery): TradeSuggestion[] => {
  const id = activeLeagueId()
  if (!id) throw new Error('No league imported')
  return suggestTrades(cachedLineup(ctx, id, query.season), query)
})
```

- [x] **Step 4: Verify and commit**

Run: `npm run typecheck && npm run lint && npm test` — all green (there are no handler tests; the type contract is the check).

```bash
git add src/shared/ipc.ts src/preload/index.ts src/main/ipc/handlers.ts
git commit -m "feat(trade): suggest IPC channel"
```

---

### Task 6: Renderer view helpers — suggestion strings

**Files:**

- Modify: `src/renderer/src/lib/tradeView.ts`
- Modify: `tests/fixtures/trade.ts` (add `tradeSuggestion`)
- Test: `tests/renderer/lib/tradeView.test.ts`

**Interfaces:**

- Consumes: `deltaLine`, `dropLine`, `fmtMarket` (existing in `tradeView.ts`); `fmtSigned` (`@/lib/format`); `TradeStance`, `TradeSuggestion` (Task 1 types).
- Produces: `STANCE_OPTIONS: { value: TradeStance; label: string }[]`; `stanceHint(stance): string`; `noOffersHint(stance): string`; `meLine(s: TradeSuggestion): string`; `themLine(s): string`; `acceptanceTags(s): string[]`; `sideNames(players: TradePlayer[]): string`; `offerLine(s): string`; `focusMarketLine(p: TradePlayer): string`; fixture `tradeSuggestion(over?: Partial<TradeSuggestion>): TradeSuggestion`.

- [x] **Step 1: Add the fixture**

In `tests/fixtures/trade.ts`, add `TradeSuggestion` to the `@shared/types` import and append:

```ts
/** Barkley for Chase: +4 over the window for me, −4 for Rival, who takes it on the market (1.17). */
export function tradeSuggestion(over: Partial<TradeSuggestion> = {}): TradeSuggestion {
  return {
    evaluation: tradeEvaluation({
      me: tradeSide({
        give: [barkley],
        get: [chase],
        before: 66,
        after: 70,
        delta: 4,
        deltaPerWeek: 0.27,
        thisWeekDelta: 1,
        marketGive: 9340,
        marketGet: 8000,
        weeksChanged: 3
      }),
      them: tradeSide({
        rosterId: 2,
        name: 'Rival',
        isMe: false,
        give: [chase],
        get: [barkley],
        before: 30,
        after: 26,
        delta: -4,
        deltaPerWeek: -0.27,
        thisWeekDelta: -1,
        marketGive: 8000,
        marketGet: 9340,
        weeksChanged: 3
      }),
      winWin: false,
      marketFair: false // 8 000 / 9 340 = 0.86 on my side
    }),
    acceptance: 'market',
    ...over
  }
}
```

- [x] **Step 2: Write the failing tests**

In `tests/renderer/lib/tradeView.test.ts`, add `STANCE_OPTIONS`, `acceptanceTags`, `focusMarketLine`, `meLine`, `noOffersHint`, `offerLine`, `sideNames`, `stanceHint`, `themLine` to the `@/lib/tradeView` import and `tradeSuggestion` to the fixture import. Append inside `describe('tradeView', …)`:

```ts
it('describes a suggestion row', () => {
  const s = tradeSuggestion()
  expect(meLine(s)).toBe('Me +4.00 (+0.27/wk)')
  expect(themLine(s)).toBe('Them -4.00')
  expect(acceptanceTags(s)).toEqual(['market'])
  expect(acceptanceTags(tradeSuggestion({ acceptance: 'both' }))).toEqual(['lineup', 'market'])
  expect(offerLine(s)).toBe("give RB Saquon Barkley · get WR Ja'Marr Chase")
  const withDrop = tradeSuggestion({
    evaluation: tradeEvaluation({
      me: tradeSide({ give: [barkley, jefferson], get: [chase], drops: [lar] })
    })
  })
  expect(offerLine(withDrop)).toBe(
    "give RB Saquon Barkley, WR Justin Jefferson · get WR Ja'Marr Chase · drop: Los Angeles Rams"
  )
  expect(sideNames([tradePlayerX])).toBe('— Saquon Barkley')
})

it('labels the stance controls and the empty result', () => {
  expect(STANCE_OPTIONS.map((o) => o.value)).toEqual(['premium', 'fair', 'overpay'])
  expect(STANCE_OPTIONS.map((o) => o.label)).toEqual(['Premium', 'Fair', 'Overpay'])
  expect(stanceHint('premium')).toBe(
    'I gain ≥ 1 pt/week and get ≥ 100 % of the market value I give'
  )
  expect(stanceHint('fair')).toBe('I gain and get ≥ 85 % of the market value I give')
  expect(stanceHint('overpay')).toBe('I lose ≤ 1 pt/week and get ≥ 70 % of the market value I give')
  expect(noOffersHint('premium')).toBe('No offers at this stance — try fair or overpay')
  expect(noOffersHint('fair')).toBe('No offers at this stance — try overpay')
  expect(noOffersHint('overpay')).toBe('No offers — widen the focus or pick another team')
})

it('shows the sell-high check for the focus player', () => {
  expect(focusMarketLine(barkley)).toBe('MKT 9 340 · 30d -310')
  expect(focusMarketLine(jefferson)).toBe('MKT 10 512 · 30d +120')
  expect(focusMarketLine(lar)).toBe('MKT —')
})
```

- [x] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/renderer/lib/tradeView.test.ts`
Expected: FAIL — `meLine` (and the others) are not exported.

- [x] **Step 4: Implement**

In `src/renderer/src/lib/tradeView.ts`, extend the `@shared/types` import to `TradeEvaluation, TradePlayer, TradeSideResult, TradeStance, TradeSuggestion` and append:

```ts
export const STANCE_OPTIONS: { value: TradeStance; label: string }[] = [
  { value: 'premium', label: 'Premium' },
  { value: 'fair', label: 'Fair' },
  { value: 'overpay', label: 'Overpay' }
]

/** Display of spec §3.3's stance table — the numbers live in `src/main/trade/suggest.ts`. */
const STANCE_HINTS: Record<TradeStance, string> = {
  premium: 'I gain ≥ 1 pt/week and get ≥ 100 % of the market value I give',
  fair: 'I gain and get ≥ 85 % of the market value I give',
  overpay: 'I lose ≤ 1 pt/week and get ≥ 70 % of the market value I give'
}

export function stanceHint(stance: TradeStance): string {
  return STANCE_HINTS[stance]
}

const NO_OFFERS: Record<TradeStance, string> = {
  premium: 'No offers at this stance — try fair or overpay',
  fair: 'No offers at this stance — try overpay',
  overpay: 'No offers — widen the focus or pick another team'
}

export function noOffersHint(stance: TradeStance): string {
  return NO_OFFERS[stance]
}

/** "Me +4.00 (+0.27/wk)" */
export function meLine(s: TradeSuggestion): string {
  return `Me ${deltaLine(s.evaluation.me)}`
}

/** "Them -4.00" */
export function themLine(s: TradeSuggestion): string {
  return `Them ${fmtSigned(s.evaluation.them.delta)}`
}

export function acceptanceTags(s: TradeSuggestion): string[] {
  return s.acceptance === 'both' ? ['lineup', 'market'] : [s.acceptance]
}

/** "RB Saquon Barkley, WR Justin Jefferson" */
export function sideNames(players: TradePlayer[]): string {
  return players.map((p) => `${p.position ?? '—'} ${p.fullName}`).join(', ')
}

/** "give RB Saquon Barkley · get WR Ja'Marr Chase[ · drop: …]" */
export function offerLine(s: TradeSuggestion): string {
  const me = s.evaluation.me
  const drop = dropLine(me)
  return `give ${sideNames(me.give)} · get ${sideNames(me.get)}${drop ? ` · ${drop}` : ''}`
}

/** Sell-high check beside the focus: "MKT 9 340 · 30d -310", or "MKT —" outside FantasyCalc's list. */
export function focusMarketLine(p: TradePlayer): string {
  return p.market
    ? `MKT ${fmtMarket(p.market.value)} · 30d ${fmtSigned(p.market.trend30d, 0)}`
    : 'MKT —'
}
```

- [x] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/renderer/lib/tradeView.test.ts`
Expected: PASS. Then `npm run typecheck && npm run lint`.

- [x] **Step 6: Commit**

```bash
git add src/renderer/src/lib/tradeView.ts tests/fixtures/trade.ts tests/renderer/lib/tradeView.test.ts
git commit -m "feat(ui): trade suggestion view helpers"
```

---

### Task 7: Trade screen — suggestions section, "Open in builder", "Suggest with this team"

**Files:**

- Modify: `src/renderer/src/screens/TradeScreen.tsx` (full file below)
- Test: `tests/renderer/components/TradeScreen.test.tsx`

**Interfaces:**

- Consumes: `api.trade.suggest` (Task 5); Task 6 helpers; `LINEUP_POSITIONS` (`@shared/rules`); `TradeFocus`, `TradeStance`, `TradeSuggestion` (Task 1).
- Produces: the finished Trade screen. Accessible names used by the tests: selects `Focus`, `Focus player`, `Focus position`, `Stance`, `Suggest with`; buttons `Find`, `Suggest with this team`, `Open in builder`.

- [x] **Step 1: Write the failing tests**

In `tests/renderer/components/TradeScreen.test.tsx`:

1. Extend the mock: `trade: { pool: vi.fn(), evaluate: vi.fn(), suggest: vi.fn() }`, add `const suggestMock = vi.mocked(api.trade.suggest)`, reset it in `beforeEach` (`suggestMock.mockReset()`), and add `tradeSuggestion` to the fixture import.
2. Append inside `describe('TradeScreen', …)`:

```tsx
it('finds offers and opens one in the builder with the carried numbers', async () => {
  suggestMock.mockResolvedValue([tradeSuggestion()])
  const scrollIntoView = vi.fn()
  window.HTMLElement.prototype.scrollIntoView = scrollIntoView
  render(<TradeScreen dataVersion={0} />)
  await screen.findByLabelText('Partner')
  expect(screen.getByText('I gain and get ≥ 85 % of the market value I give')).toBeTruthy()

  fireEvent.click(screen.getByText('Find'))
  expect(await screen.findByText('with Rival')).toBeTruthy()
  expect(suggestMock).toHaveBeenCalledWith({
    season: 2026,
    focus: null,
    stance: 'fair',
    partnerRosterId: null
  })
  expect(screen.getByText('Me +4.00 (+0.27/wk)')).toBeTruthy()
  expect(screen.getByText('Them -4.00')).toBeTruthy()
  expect(screen.getByText('market')).toBeTruthy()
  expect(screen.getByText("give RB Saquon Barkley · get WR Ja'Marr Chase")).toBeTruthy()

  fireEvent.click(screen.getByText('Open in builder'))
  expect((screen.getByLabelText('Partner') as HTMLSelectElement).value).toBe('2')
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

it('suggests with the builder partner, carries the focus and stance, hints on an empty result', async () => {
  suggestMock.mockResolvedValue([])
  render(<TradeScreen dataVersion={0} />)
  await screen.findByLabelText('Partner')
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

  // a position focus and "all teams" again
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
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/renderer/components/TradeScreen.test.tsx`
Expected: the two new tests FAIL (`Unable to find an element with the text: Find`); the three existing ones still pass.

- [x] **Step 3: Replace `src/renderer/src/screens/TradeScreen.tsx`**

```tsx
import { useEffect, useRef, useState } from 'react'
import { X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { PlayerDetailPanel } from '@/components/PlayerDetailPanel'
import { PositionBadge } from '@/components/PositionBadge'
import { api } from '@/lib/api'
import { errorMessage } from '@/lib/format'
import { swapLine } from '@/lib/lineupView'
import {
  DEADLINE_NOTE,
  NO_VERDICT_HINT,
  STANCE_OPTIONS,
  acceptanceTags,
  deltaLine,
  deltaTone,
  dropLine,
  focusMarketLine,
  groupByPosition,
  marketLine,
  meLine,
  noOffersHint,
  offerLine,
  playerOption,
  playerStats,
  rangeLine,
  stanceHint,
  themLine,
  verdictBadges,
  windowLabel
} from '@/lib/tradeView'
import { cn } from '@/lib/utils'
import { LINEUP_POSITIONS } from '@shared/rules'
import type {
  DetailTarget,
  TradeEvaluation,
  TradeFocus,
  TradePlayer,
  TradePool,
  TradeSideResult,
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

function PlayerRow({
  player,
  weeks,
  onOpen,
  onRemove
}: {
  player: TradePlayer
  weeks: number
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

/** Spec §5.1: one side of the builder — the chosen rows and a position-grouped picker. */
function SideEditor({
  title,
  roster,
  chosen,
  weeks,
  onChange,
  onOpen
}: {
  title: string
  roster: TradePlayer[]
  chosen: string[]
  weeks: number
  onChange: (ids: string[]) => void
  onOpen: (p: DetailTarget) => void
}): React.JSX.Element {
  const rows = chosen.flatMap((id) => {
    const p = roster.find((r) => r.playerId === id)
    return p ? [p] : []
  })
  const available = roster.filter((p) => !chosen.includes(p.playerId))
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">{title}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-2">
        {rows.map((p) => (
          <PlayerRow
            key={p.playerId}
            player={p}
            weeks={weeks}
            onOpen={onOpen}
            onRemove={() => onChange(chosen.filter((id) => id !== p.playerId))}
          />
        ))}
        <select
          aria-label={`Add to ${title}`}
          className={selectClass}
          value=""
          onChange={(e) => {
            if (e.target.value) onChange([...chosen, e.target.value])
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
      </CardContent>
    </Card>
  )
}

function SideVerdict({ side }: { side: TradeSideResult }): React.JSX.Element {
  const drop = dropLine(side)
  return (
    <div className="space-y-1 text-sm">
      <div className="font-semibold">{side.isMe ? `Me · ${side.name}` : `Them · ${side.name}`}</div>
      <div className={cn('text-2xl font-semibold', TONE[deltaTone(side.delta)])}>
        {deltaLine(side)}
      </div>
      <div className="text-muted-foreground">{rangeLine(side)}</div>
      {drop && <div className="text-amber-400">{drop}</div>}
      <div className="text-muted-foreground">{marketLine(side)}</div>
    </div>
  )
}

/** Spec §5.1: the verdict card — both sides, the badges, this week's swaps on my side. */
function VerdictCard({ ev }: { ev: TradeEvaluation }): React.JSX.Element {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Verdict</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid gap-6 md:grid-cols-2">
          <SideVerdict side={ev.me} />
          <SideVerdict side={ev.them} />
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
          {ev.me.thisWeekSwaps.length === 0 ? (
            <p className="text-sm text-muted-foreground">Your lineup this week does not change.</p>
          ) : (
            <ul className="space-y-1 text-sm">
              {ev.me.thisWeekSwaps.map((s) => (
                <li key={`${s.slot}:${s.in.playerId}`}>{swapLine(s)}</li>
              ))}
            </ul>
          )}
        </div>
      </CardContent>
    </Card>
  )
}

/** Spec §5.2: one offer — who with, both deltas, why they'd take it, the players, the way into the builder. */
function SuggestionRow({
  suggestion,
  onOpen
}: {
  suggestion: TradeSuggestion
  onOpen: () => void
}): React.JSX.Element {
  const { me, them } = suggestion.evaluation
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
  return `${s.evaluation.them.rosterId}:${ids(s.evaluation.me.give)}:${ids(s.evaluation.me.get)}`
}

interface TradeScreenProps {
  dataVersion: number
}

export function TradeScreen({ dataVersion }: TradeScreenProps): React.JSX.Element {
  const [season, setSeason] = useState<number | null>(null)
  const [loaded, setLoaded] = useState<{ key: string; pool: TradePool } | null>(null)
  const [failed, setFailed] = useState<{ key: string; message: string } | null>(null)
  const [partner, setPartner] = useState<number | null>(null)
  const [give, setGive] = useState<string[]>([])
  const [get, setGet] = useState<string[]>([])
  const [verdict, setVerdict] = useState<TradeEvaluation | null>(null)
  const [evaluating, setEvaluating] = useState(false)
  const [evalError, setEvalError] = useState<string | null>(null)
  const [selected, setSelected] = useState<DetailTarget | null>(null)
  // Spec §5.2: the suggestions section
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
        // Keep a partner / players that still exist after a sync; default the partner to the first team.
        setPartner((p) =>
          pool.teams.some((t) => t.rosterId === p) ? p : (pool.teams[0]?.rosterId ?? null)
        )
        setGive((ids) => ids.filter((id) => pool.me.players.some((p) => p.playerId === id)))
        setGet((ids) =>
          ids.filter((id) => pool.teams.some((t) => t.players.some((p) => p.playerId === id)))
        )
        setVerdict(null)
        setFocusGive((id) => (pool.me.players.some((p) => p.playerId === id) ? id : ''))
        setSuggestWith((t) => (pool.teams.some((x) => x.rosterId === t) ? t : null))
        setSuggestions(null)
      })
      .catch((err) => {
        if (!cancelled) setFailed({ key, message: errorMessage(err) })
      })
    return () => {
      cancelled = true
    }
  }, [season, key])

  const pool = loaded?.key === key ? loaded.pool : null
  const notice = failed && (failed.key === key || failed.key === 'options') ? failed.message : null
  const partnerTeam = pool?.teams.find((t) => t.rosterId === partner) ?? null
  const focusPlayer = pool?.me.players.find((p) => p.playerId === focusGive) ?? null

  const choosePartner = (rosterId: number): void => {
    setPartner(rosterId)
    setGet([])
    setVerdict(null)
    setEvalError(null)
  }
  const changeGive = (ids: string[]): void => {
    setGive(ids)
    setVerdict(null)
    setEvalError(null)
  }
  const changeGet = (ids: string[]): void => {
    setGet(ids)
    setVerdict(null)
    setEvalError(null)
  }

  async function evaluate(): Promise<void> {
    if (season === null || partner === null) return
    setEvaluating(true)
    setEvalError(null)
    try {
      setVerdict(await api.trade.evaluate(season, { rosterId: partner, give, get }))
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

  /** Spec §5.2: the builder shows the suggestion's own evaluation — no second trade:evaluate call. */
  const openInBuilder = (s: TradeSuggestion): void => {
    setPartner(s.evaluation.them.rosterId)
    setGive(s.evaluation.me.give.map((p) => p.playerId))
    setGet(s.evaluation.me.get.map((p) => p.playerId))
    setVerdict(s.evaluation)
    setEvalError(null)
    builderRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }

  const canEvaluate = partner !== null && give.length > 0 && get.length > 0 && !evaluating

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Trade</h1>
          <p className="text-sm text-muted-foreground">
            Both teams&apos; rest-of-season strength before and after, on Sleeper projections under
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
          <div ref={builderRef} className="space-y-6">
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span className="text-muted-foreground">Partner</span>
              <select
                aria-label="Partner"
                className={selectClass}
                value={partner ?? ''}
                onChange={(e) => choosePartner(Number(e.target.value))}
              >
                {pool.teams.map((t) => (
                  <option key={t.rosterId} value={t.rosterId}>
                    {t.name}
                  </option>
                ))}
              </select>
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="ml-auto"
                disabled={partner === null || finding}
                onClick={() => {
                  setSuggestWith(partner)
                  void find(partner)
                }}
              >
                Suggest with this team
              </Button>
            </div>

            <div className="grid gap-6 lg:grid-cols-2">
              <SideEditor
                title="I give"
                roster={pool.me.players}
                chosen={give}
                weeks={pool.weeks}
                onChange={changeGive}
                onOpen={setSelected}
              />
              <SideEditor
                title="I get"
                roster={partnerTeam?.players ?? []}
                chosen={get}
                weeks={pool.weeks}
                onChange={changeGet}
                onOpen={setSelected}
              />
            </div>

            <div className="flex items-center gap-4">
              <Button type="button" disabled={!canEvaluate} onClick={() => void evaluate()}>
                Evaluate
              </Button>
              {evaluating && <span className="text-sm text-muted-foreground">Evaluating…</span>}
              {evalError && <span className="text-destructive text-sm">{evalError}</span>}
              {!verdict && !evaluating && !evalError && (
                <span className="text-sm text-muted-foreground">{NO_VERDICT_HINT}</span>
              )}
            </div>

            {verdict && <VerdictCard ev={verdict} />}
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
                  <option value="">all teams</option>
                  {pool.teams.map((t) => (
                    <option key={t.rosterId} value={t.rosterId}>
                      {t.name}
                    </option>
                  ))}
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

- [x] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/renderer/components/TradeScreen.test.tsx tests/renderer/lib/tradeView.test.ts`
Expected: PASS (5 screen tests). If `getByText('market')` finds two elements, the acceptance tag is colliding with another lowercase "market" text — keep the tag text as is and query with `getAllByText` only if a second, legitimate match exists (there is none in this layout). Then `npm run typecheck && npm run lint && npm test` (`npm run format` for JSX reflow).

- [x] **Step 5: See it once**

Run: `npm run dev` on the dev DB: Trade screen → **Find** at `fair` lists offers with tags; **Open in builder** fills both sides, shows the verdict without a request and scrolls up; **Suggest with this team** restricts the list and sets the "with" select. Kill the dev server.

- [x] **Step 6: Commit**

```bash
git add src/renderer/src/screens/TradeScreen.tsx tests/renderer/components/TradeScreen.test.tsx
git commit -m "feat(ui): trade suggestions with open-in-builder"
```

---

### Task 8: Data reference, real-data check, release `v0.14.0`

**Files:**

- Modify: `docs/reference/value-and-signals.md` (Trade section intro, new `### Suggestions`, "Where it is shown" item 5, constants row, module map)
- Modify: `package.json`, `package-lock.json` (via `npm version`)

- [x] **Step 1: Document**

In `docs/reference/value-and-signals.md`:

1. Trade section intro (line ~238): change to ``pure modules `src/main/trade/{enter,player,evaluate,pool,suggest}.ts` on the cached `LineupBuild`; channels `trade:pool`, `trade:evaluate` and `trade:suggest`.``
2. After `### TradePool` (before `### Where it is shown`), insert:

```markdown
### Suggestions (added in v0.14.0)

`trade:suggest (TradeSuggestQuery) → TradeSuggestion[]` — `src/main/trade/suggest.ts`, spec §3.

- **Query**: `focus` = `{ give: playerId }` (every offer includes him), `{ want: position }` (at least one received player has it) or `null`; `stance` = `premium | fair | overpay`; `partnerRosterId` restricts the scan to one team (`null` = every other team).
- **Enumeration**: shapes 1-for-1, 2-for-1 (I give two), 1-for-2 (I get two). My give pool is my whole roster (IR / taxi included). Their pool per team = players who `canEnter` my current optimal lineup in at least one window week (an IR / taxi / out player never does); in a 1-for-2 both received players must be in the pool. Every candidate goes through `evaluateTrade`, so `TradeSuggestion.evaluation` is exactly what the builder computes for it.
- **My filters**, on `deltaPerWeek` and my market ratio (`marketGet / marketGive`, `+∞` with no valued give): `premium` ≥ +1.0 and ≥ 1.00 · `fair` > 0 and ≥ 0.85 · `overpay` ≥ −1.0 and ≥ 0.70. A candidate below the ratio is rejected before any lineup solve.
- **Acceptance** (`TradeSuggestion.acceptance`, their side): `delta > 0` → `lineup`; their market ratio ≥ `MARKET_FAIR` → `market`; both → `both`; neither → rejected.
- **Dominance**: a 2-for-1 / 1-for-2 is dropped when a 1-for-1 it contains passed the same filters (focus included) and the bigger offer's my-`delta` exceeds that 1-for-1's by at most `DOMINANCE_PTS = 0.5`.
- **Order**: my `delta` desc, then my market ratio desc, then partner name; at most `SUGGEST_MAX = 30`. `[]` is a normal answer; `NO_PROJECTIONS` / `NO_ME` as for the other channels.
```

3. In `### Where it is shown (v0.13.0) — Trade screen`, append:

```markdown
5. **Suggestions** (v0.14.0) — Focus (`none` / `I give` + player picker showing `MKT {value} · 30d {trend30d}` / `I want` + position), Stance select with a one-line hint, `with` (all teams / one team), **Find**. One row per offer, in engine order: `with {them.name}`, `Me {fmtSigned(delta)} ({fmtSigned(deltaPerWeek)}/wk)`, `Them {fmtSigned(delta)}`, acceptance tags (`lineup` / `market`), `give {POS name, …} · get {POS name, …}[ · drop: …]`, **Open in builder** (sets the partner and both sides, shows the carried evaluation as the verdict without a new `trade:evaluate` call, scrolls to the builder). **Suggest with this team** beside the Partner select runs Find restricted to that partner. Empty result: "No offers at this stance — try fair or overpay" (premium) / "… try overpay" (fair) / "No offers — widen the focus or pick another team" (overpay). Search errors show under the controls.
```

4. `## Constants (single sources)` — add a row: `` `src/main/trade/suggest.ts` `` | `` `STANCES` (premium ≥ 1.0 / 1.00, fair > 0 / 0.85, overpay ≥ −1.0 / 0.70), `DOMINANCE_PTS = 0.5`, `SUGGEST_MAX = 30` ``.
5. `## Module map` — add `` `src/main/trade/suggest.ts` `` | Suggestion search: their pool via `canEnter`, the three shapes, stance and acceptance filters, dominance, ranking and cap. Change the `tradeView.ts` / `TradeScreen.tsx` row to "… and the Trade screen (builder + verdict card + suggestions)".

- [x] **Step 2: Verify and commit the docs**

Run: `npx prettier --check docs/reference/value-and-signals.md` (run `npm run format` if it complains).

```bash
git add docs/reference/value-and-signals.md
git commit -m "docs: document the trade suggestion search"
```

- [x] **Step 3: Final verification, real-data check**

Run: `npm run typecheck && npm run lint && npm test` — all green, and `npx vitest run tests/main/trade/suggestBudget.test.ts` once more for the timings. Then on the dev DB (`~/.config/FantasyCompanion/companion.db`, copy it first) a throwaway `tests/zz-suggest.test.ts` that opens the copy, builds the lineup inputs for the real league (as `cachedLineup` does), calls `suggestTrades` at the three stances with `focus: null, partnerRosterId: null`, and prints per stance the count, the elapsed ms and the top five as `give → get @ partner · me Δ · them Δ · acceptance`; sanity-check that the top offers make football sense (positional surpluses moving, no 0-point players as the centrepiece) and that a top suggestion opened in the builder in `npm run dev` shows the same numbers. Delete the file (never commit it).

- [x] **Step 4: Merge and release**

```bash
git checkout main && git merge --no-ff feat/trade-suggestions -m "merge: feat/trade-suggestions (plan M)"
npm version minor -m "build: bump version to %s"
```

Expected: `package.json` at `0.14.0`, tag `v0.14.0`. Pushing (`git push --follow-tags`) triggers the Windows release workflow into a **draft** release — that is the user's call, as in earlier plans; then mark the plan complete (`**Status:** complete — …` line under the title) in a `docs(plan): mark plan M complete` commit.

---

## Self-review against the spec

- §3.1 query → Task 1 types, Task 3 (`focus`, `stance`, `partnerRosterId`), Task 7 controls.
- §3.2 enumeration (three shapes, whole-roster give pool, `canEnter` pool, focus rules, both of a 1-for-2 in the pool, `evaluateTrade` per candidate) → Task 3 `suggestTrades` + tests `honours the focus`, `finds the offers…`.
- §3.3 filters (stance table, `+∞` / 0 ratios, acceptance labels) → Task 1 `passesStance` / `acceptanceOf` + boundary tests; Task 3 `fails the ratio when what I get is unvalued`.
- §3.4 dominance, ordering, cap, full evaluation carried → Task 3 (`dominated`, sort, `max`), tests `drops a padded 2-for-1…`, `caps the list`, the `toEqual(evaluateTrade(...))` loop.
- §4.1 types → Task 1. §4.2 `trade:suggest` → Task 5 (synchronous handler on `cachedLineup`).
- §5.2 UI (focus / stance / Find, rows with tags, sell-high MKT + trend, Open in builder, spinner, empty hint) and §5.1 "Suggest with this team" → Tasks 6–7.
- §5.3 data reference → Task 8. §6 errors (`[]` normal, budget ≤ 3 s, `worker_threads` not built) → Tasks 3–4, 7 (error line). §7 tests: shapes / focus / stance boundaries / acceptance / dominance / cap / ordering / `partnerRosterId` (Tasks 1, 3), budget (Task 4, `skipIf(CI)`), `tradeView` helpers + two DOM tests (Tasks 6–7), real-data check (Task 8). §9 → `v0.14.0`.
