# Plan L — Trade evaluator (slice 6b, phase 1)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Evaluate a proposed trade between my team and one other team by the change in both teams' rest-of-season strength (6a's optimal-lineup engine on the swapped rosters), with this-week delta, auto-drops, and the market balance — on a new Trade screen with a builder and a verdict card — and ship `v0.13.0`. Suggestions are Plan M.

**Architecture:** The league's last fantasy week (`lastFantasyWeek` from the playoff settings) enters `ValueContext` as `lastWeek`; team strength and trade deltas sum `currentWeek..lastWeek` (this also fixes the power ranking). `src/main/lineup/build.ts` gains `rosterWeek` (the un-memoised sibling of `teamWeek` for a hypothetical roster) and `candidateFor`. A pure `src/main/trade/` package holds `enter.ts` (the exact "can this player enter the lineup" test through the flex-eligibility closure), `player.ts` (`TradePlayer` rows), `evaluate.ts` (`evaluateTrade` with drops, market sums and the week skip) and `pool.ts` (the builder's pickers). Two IPC channels (`trade:pool`, `trade:evaluate`) read the cached `LineupBuild`. The renderer adds `lib/tradeView.ts` (pure strings) and `screens/TradeScreen.tsx`.

**Tech Stack:** unchanged — Electron 39, React 19, TypeScript strict, Tailwind 4 + shadcn, Vitest 5 (jsdom + Testing Library for component tests), lucide-react icons, better-sqlite3 fixtures.

**Spec:** `docs/superpowers/specs/2026-09-21-slice6b-trade-evaluator-design.md` — §2 (window + engine), §4 (types, `trade:pool`, `trade:evaluate`), §5 header + §5.1 builder + §5.3 data reference, §6 errors, §7 tests, §9 phasing (Plan L = `v0.13.0`).

## Global Constraints

- Same as Plans C–K: Node ≥ 22.13 (`source ~/.nvm/nvm.sh && nvm use` if `node --version` is not 22.x), no Electron imports outside `src/main/index.ts`, `src/main/ipc/`, `src/preload/`. Path aliases: `@main/*`, `@shared/*`, `@/*` (renderer). Tests import fixtures relatively (`../../fixtures/...`).
- **Payload conventions** (`docs/reference/value-and-signals.md`): `null` = not computable; points display with 2 decimals (`fmtPoints`), signed with `fmtSigned`, `—` for null.
- **Window** (spec §2.1): `lastFantasyWeek(settings)` = 18 without `playoffStartWeek`; else `min(18, playoffStartWeek + weeks − 1)` with `rounds = ceil(log2(playoffTeams))` (1 when `playoffTeams` is missing or < 2), `weeks = rounds` / `rounds + 1` (`playoffRoundType === 1`) / `rounds × 2` (`playoffRoundType === 2`). Window = `currentWeek..lastWeek`, empty without stored projections.
- **Engine** (spec §2.3): `before` = Σ `teamWeek(...).optimalTotal` over the window; `after` on `roster − given + received − drops`; roster size = `roster_positions` entries that are not `IR` / `TAXI`; drops = active (non-IR/taxi) players starting in the fewest window weeks on the oversized after-roster, ties by lowest `rosPoints` then name; a week is skipped (Δ exactly 0) when no removed player (given **or dropped**) starts that week and no received player passes `canEnter`. Market: a player without a FantasyCalc value counts 0 and is counted as unvalued; ratio = `marketGet / marketGive` (`+∞` when `marketGive = 0`); `MARKET_FAIR = 0.90`. Traded players keep their IR / taxi slot.
- **Errors** (spec §4.2 / §6): `TradeError` with `code` `NO_PROJECTIONS` | `NO_ME` | `INVALID_TRADE`; the message is what the renderer shows (IPC only carries `message`). Pool failures render as the screen's notice; evaluate failures as the error line under the builder.
- Verification before every commit: `npm run typecheck && npm run lint && npm test`; run `npm run format` when Prettier complains. Conventional Commits, summary ≤ 50 chars, imperative, **no trailers** (no `Co-Authored-By`, no "Generated with").
- ESLint is strict: explicit return types on every named function and component, `react-hooks/set-state-in-effect` is an error (state may only be set inside promise callbacks / event handlers, never synchronously in an effect body), no unused vars / imports.
- Decisions locked in here (not in the spec):
  - **`weeksChanged`** counts window weeks whose optimal *total* moves by ≥ 0.01 — a same-total reshuffle is not a change the user cares about.
  - **`starterWeeks`** counts a player as starting when he is placed in the optimal lineup, even at value 0 (the engine prefers a 0-point player to an empty slot); with real projections this never matters.
  - **`tradeDeadlineWeek`** reaches the engine through a new `LineupInputs.tradeDeadlineWeek: number | null` (Sleeper's `trade_deadline` is the last week trades are allowed, so `passed = currentWeek > deadline`).
  - **Pool ordering**: partner teams alphabetically; players by lineup position (`QB RB WR TE K DEF`, then others), then `rosPoints` desc, then name.
  - **Builder pickers** are a single `<select>` per side with one `<optgroup>` per position — position filtering without extra state. Changing the partner clears the "I get" side and the verdict; changing either side clears the verdict.

---

### Task 0: Branch

**Files:** none.

- [ ] **Step 1:** `git checkout -b feat/trade-evaluator` from `main` (clean, at `588fc3e` or later).

---

### Task 1: League window — `lastFantasyWeek`, `playoffRoundType`, `ValueContext.lastWeek`, power ranking over the window

**Files:**
- Modify: `src/shared/rules.ts` (`LeagueSettings`, new `LAST_NFL_WEEK`, `lastFantasyWeek`)
- Modify: `src/main/sync/mappers.ts:144-145` (map `playoff_round_type`)
- Modify: `src/main/scoring/normalize.ts:10-15` (`OPTIONAL_SETTINGS`)
- Modify: `src/main/value/series.ts` (`SeriesBundle.lastWeek`, `loadSeries`)
- Modify: `src/shared/types.ts:336-349` (`ValueContext.lastWeek`)
- Modify: `src/main/value/build.ts:199-203` (context)
- Modify: `src/main/lineup/build.ts` (`windowWeeks`, `teamStrengths`, drop the `LAST_WEEK` import)
- Modify: `src/renderer/src/screens/RulesScreen.tsx:428-435` (new field)
- Test: `tests/shared/rules.test.ts`, `tests/main/sync/mappers.test.ts`, `tests/main/value/build.test.ts:23-30`, `tests/main/lineup/build.test.ts:249-262`, `tests/renderer/lib/playersTableView.test.ts` (three `ValueContext` literals)

**Interfaces:**
- Produces: `lastFantasyWeek(settings: LeagueSettings | null | undefined): number`; `LAST_NFL_WEEK = 18`; `LeagueSettings.playoffRoundType?: number`; `ValueContext.lastWeek: number`; `windowWeeks(build: LineupBuild): number[]` (exported from `@main/lineup/build`).

- [ ] **Step 1: Write the failing tests**

Append to `tests/shared/rules.test.ts` (add `lastFantasyWeek` to the existing `@shared/rules` import):

```ts
describe('lastFantasyWeek (slice 6b spec §2.1)', () => {
  const base = { numTeams: 12, waiverType: 'faab' as const }
  it.each([
    ['no playoff settings', {}, 18],
    ['6 teams from week 15, one week per round', { playoffStartWeek: 15, playoffTeams: 6 }, 17],
    ['4 teams from week 15', { playoffStartWeek: 15, playoffTeams: 4 }, 16],
    ['two-week final', { playoffStartWeek: 15, playoffTeams: 4, playoffRoundType: 1 }, 17],
    ['two weeks per round', { playoffStartWeek: 14, playoffTeams: 4, playoffRoundType: 2 }, 17],
    ['capped at 18', { playoffStartWeek: 16, playoffTeams: 6, playoffRoundType: 1 }, 18],
    ['missing playoffTeams means one round', { playoffStartWeek: 16 }, 16],
    ['playoffStartWeek 0 means no playoffs', { playoffStartWeek: 0, playoffTeams: 6 }, 18]
  ])('%s', (_name, settings, expected) => {
    expect(lastFantasyWeek({ ...base, ...settings })).toBe(expected)
  })

  it('is 18 without settings at all', () => {
    expect(lastFantasyWeek(null)).toBe(18)
    expect(lastFantasyWeek(undefined)).toBe(18)
  })
})
```

Add to the `mapRules` describe block in `tests/main/sync/mappers.test.ts` (next to the settings test around line 128):

```ts
    it('maps the playoff round type when Sleeper sends it', () => {
      const rules = mapRules(
        { ...fx.league, settings: { ...fx.league.settings, playoff_round_type: 1 } },
        'T'
      )
      expect(rules.settings.playoffRoundType).toBe(1)
    })
```

In `tests/main/value/build.test.ts:23-30`, add `lastWeek: 17,` after `currentWeek: 3,` inside the `toMatchObject` (the fixture league has `playoff_week_start: 15`, `playoff_teams: 6`).

In `tests/main/lineup/build.test.ts:249-262` change the strength test to the window:

```ts
  it('ranks the teams by rest-of-season optimal totals over the league window', () => {
    const rows = teamStrengths(build)
    expect(rows.map((r) => [r.rosterId, r.rank])).toEqual([
      [1, 1],
      [2, 2]
    ])
    const me = rows[0]
    expect(me.thisWeek).toBeCloseTo(teamWeek(build, 1, 3).optimalTotal, 2)
    // playoff_week_start 15 + 3 rounds (6 teams) − 1 = week 17: 15 weeks, not 16.
    let expected = 0
    for (let w = 3; w <= 17; w++) expected += teamWeek(build, 1, w).optimalTotal
    expect(me.rosTotal).toBeCloseTo(expected, 1)
    expect(me.rosPerWeek).toBeCloseTo(expected / 15, 1)
    expect(me.name).toBe('Cook Book')
    expect(windowWeeks(build)).toEqual([3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17])
  })
```

and add `windowWeeks` to the `@main/lineup/build` import.

In `tests/renderer/lib/playersTableView.test.ts`, add `lastWeek: 18,` after each `currentWeek: 3,` in the three `ValueContext` literals (around lines 472, 495, 524).

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/shared/rules.test.ts tests/main/sync/mappers.test.ts tests/main/value/build.test.ts tests/main/lineup/build.test.ts`
Expected: FAIL — `lastFantasyWeek is not a function` / `windowWeeks is not a function`, `playoffRoundType` undefined, `lastWeek` missing, `rosTotal` off by week 18.

- [ ] **Step 3: Implement**

`src/shared/rules.ts` — extend the interface and add, after `LeagueSettings`:

```ts
export interface LeagueSettings {
  numTeams: number
  waiverType: WaiverType
  faabBudget?: number
  tradeDeadlineWeek?: number
  playoffStartWeek?: number
  playoffTeams?: number
  /** Sleeper `playoff_round_type`: 0 one week per round, 1 two-week final, 2 two weeks per round. */
  playoffRoundType?: number
}

/** Last week the app models (NFL regular season + fantasy playoffs). */
export const LAST_NFL_WEEK = 18

/**
 * Slice 6b spec §2.1: the league's last fantasy week from its playoff settings — the end of the
 * window team strength and trade deltas are summed over. 18 without playoff settings.
 */
export function lastFantasyWeek(settings: LeagueSettings | null | undefined): number {
  if (!settings || settings.playoffStartWeek === undefined || settings.playoffStartWeek < 1) {
    return LAST_NFL_WEEK
  }
  const teams = settings.playoffTeams ?? 0
  const rounds = teams > 1 ? Math.ceil(Math.log2(teams)) : 1
  const type = settings.playoffRoundType ?? 0
  const weeks = type === 1 ? rounds + 1 : type === 2 ? rounds * 2 : rounds
  return Math.min(LAST_NFL_WEEK, settings.playoffStartWeek + weeks - 1)
}
```

`src/main/sync/mappers.ts` — after line 145 (`playoffTeams`):

```ts
  if (s.playoff_round_type !== undefined) settings.playoffRoundType = s.playoff_round_type
```

`src/main/scoring/normalize.ts` — `OPTIONAL_SETTINGS`:

```ts
const OPTIONAL_SETTINGS = [
  'faabBudget',
  'tradeDeadlineWeek',
  'playoffStartWeek',
  'playoffTeams',
  'playoffRoundType'
] as const
```

`src/main/value/series.ts` — `SeriesBundle` gains, after `currentWeek`:

```ts
  /** Slice 6b spec §2.1: the league's last fantasy week; the strength window is currentWeek..lastWeek. */
  lastWeek: number
```

and `loadSeries` returns `lastWeek: lastFantasyWeek(rules?.settings),` after `currentWeek,` (import `lastFantasyWeek` from `@shared/rules`).

`src/shared/types.ts` — `ValueContext`, after `currentWeek`:

```ts
  /** Last fantasy week of the league (slice 6b spec §2.1); team strength and trade deltas sum currentWeek..lastWeek. */
  lastWeek: number
```

`src/main/value/build.ts:199-203` — add `lastWeek: bundle.lastWeek,` after `currentWeek: bundle.currentWeek,`.

`src/main/lineup/build.ts` — replace the `teamStrengths` week loop and drop `LAST_WEEK` from the `@main/value/series` import (keep `type PlayerSeries`):

```ts
/** Spec 6b §2.1: the weeks team strength and trade deltas are summed over; empty without projections. */
export function windowWeeks(build: LineupBuild): number[] {
  const { currentWeek, lastWeek, projectionsStored } = build.inputs.value.context
  const weeks: number[] = []
  if (projectionsStored) for (let w = currentWeek; w <= lastWeek; w++) weeks.push(w)
  return weeks
}

export function teamStrengths(build: LineupBuild): TeamStrength[] {
  const weeks = windowWeeks(build)
  const rows = build.inputs.teams.map((t): TeamStrength => {
```

(the rest of `teamStrengths` is unchanged — it already reads `weeks`).

`src/renderer/src/screens/RulesScreen.tsx` — after the `Playoff teams` field (line 435):

```tsx
            <Field label="Playoff round type (0 · 1 two-week final · 2 two-week rounds)">
              <NumberField
                value={draft.settings.playoffRoundType}
                integer
                placeholder="0"
                onChange={(v) => setSetting('playoffRoundType', v)}
                className="w-full text-left"
              />
            </Field>
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run typecheck && npm run lint && npm test`
Expected: PASS (the `tests/main/scoring/normalize.test.ts` and `rulesView` suites still pass — the new key is optional).

- [ ] **Step 5: Commit**

```bash
git add src/shared/rules.ts src/shared/types.ts src/main/sync/mappers.ts src/main/scoring/normalize.ts src/main/value/series.ts src/main/value/build.ts src/main/lineup/build.ts src/renderer/src/screens/RulesScreen.tsx tests/shared/rules.test.ts tests/main/sync/mappers.test.ts tests/main/value/build.test.ts tests/main/lineup/build.test.ts tests/renderer/lib/playersTableView.test.ts
git commit -m "feat(lineup): sum team strength to the league's last week"
```

---

### Task 2: `rosterWeek` and `candidateFor` — hypothetical rosters in the lineup build

**Files:**
- Modify: `src/main/lineup/build.ts:180-227` (`teamWeek` → `solveWeek` + `teamWeek` + `rosterWeek`, new `candidateFor`, export `teamName`)
- Test: `tests/main/lineup/build.test.ts`

**Interfaces:**
- Consumes: `teamWeek`, `weekPlayer`, `pool`, `UNSTARTABLE_SLOTS`, `isUnavailable` (all existing in the file).
- Produces: `rosterWeek(build: LineupBuild, roster: PlayerSeries[], week: number): TeamWeek` (not memoised); `candidateFor(build: LineupBuild, series: PlayerSeries, week: number): Candidate | null` (null when the player can't start that week: IR / taxi from the current week on, or an unavailable flag); `teamName(t: Team): string` exported.

- [ ] **Step 1: Write the failing tests**

Add to `tests/main/lineup/build.test.ts` inside the main describe (imports: add `candidateFor`, `rosterWeek` to the `@main/lineup/build` import):

```ts
  it('solves a hypothetical roster like the team it copies', () => {
    const mine = build.rosters.get(1) ?? []
    for (const week of [3, 4, 5]) {
      const hypothetical = rosterWeek(build, mine, week)
      const real = teamWeek(build, 1, week)
      expect(hypothetical.optimalTotal).toBeCloseTo(real.optimalTotal, 2)
      expect(hypothetical.optimal.map((p) => p.player?.id ?? null)).toEqual(
        real.optimal.map((p) => p.player?.id ?? null)
      )
    }
    expect(build.weeks.has('1|5')).toBe(true) // teamWeek memoises …
    const memoised = build.weeks.size
    rosterWeek(build, mine, 6)
    expect(build.weeks.size).toBe(memoised) // … rosterWeek never does
  })

  it('keeps a traded taxi player reserved on the receiving roster (spec 6b §2.2)', () => {
    const bijan = build.inputs.value.series.get('9509') // taxi on roster 2, projected 7 in week 4
    if (!bijan) throw new Error('fixture: Bijan missing')
    const mine = build.rosters.get(1) ?? []
    const week = rosterWeek(build, [...mine, bijan], 4)
    expect(week.optimal.some((p) => p.player?.id === '9509')).toBe(false)
    expect(week.unavailable.map((x) => x.player.playerId)).toContain('9509')
    expect(week.optimalTotal).toBeCloseTo(teamWeek(build, 1, 4).optimalTotal, 2)
    expect(candidateFor(build, bijan, 4)).toBeNull()
  })

  it('gives the engine candidate of an active player, with the week value', () => {
    const chase = build.inputs.value.series.get('7564')
    if (!chase) throw new Error('fixture: Chase missing')
    expect(candidateFor(build, chase, 3)).toEqual({
      id: '7564',
      name: "Ja'Marr Chase",
      position: 'WR',
      value: 9 // 4 rec + 50 yd under the fixture scoring
    })
    expect(candidateFor(build, chase, 5)).toEqual(
      expect.objectContaining({ id: '7564', value: 0 }) // no projection stored
    )
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/main/lineup/build.test.ts`
Expected: FAIL — `rosterWeek is not a function`.

- [ ] **Step 3: Implement**

In `src/main/lineup/build.ts`, export `teamName` (change `function teamName` to `export function teamName`) and replace `teamWeek` (lines 180-227) with:

```ts
/** Spec 6a §2.3 / 6b §2.2: IR / taxi players sit out from the current week on; the slot follows the player through a trade. */
function reservedNow(series: PlayerSeries, week: number, currentWeek: number): boolean {
  return (
    week >= currentWeek &&
    series.rosterSlot !== null &&
    UNSTARTABLE_SLOTS.has(series.rosterSlot)
  )
}

function solveWeek(
  build: LineupBuild,
  roster: PlayerSeries[],
  week: number,
  reserved: (s: PlayerSeries) => boolean
): TeamWeek {
  const all = roster.map((series) => ({ series, wp: weekPlayer(build, series, week) }))
  const startable = all.filter(
    ({ series, wp }) => !reserved(series) && !isUnavailable(wp.player.flag)
  )
  const startableIds = new Set(startable.map((x) => x.wp.player.playerId))
  const players = new Map(all.map((x) => [x.wp.player.playerId, x.wp]))
  const optimal = optimalLineup(
    build.slots,
    startable.map((x) => x.wp.candidate)
  )
  const lookup = (ids: string[]): WeekPlayer[] =>
    ids.flatMap((id) => {
      const wp = players.get(id)
      return wp ? [wp] : []
    })
  return {
    optimal: optimal.starters,
    optimalTotal: optimal.total,
    bench: lookup(optimal.bench.map((c) => c.id)),
    unavailable: all
      .filter((x) => !startableIds.has(x.wp.player.playerId))
      .map((x) => x.wp)
      .sort(
        (a, b) =>
          b.player.value - a.player.value || a.player.fullName.localeCompare(b.player.fullName)
      ),
    players,
    games: all.filter((x) => x.wp.player.opponent !== null).length,
    played: all.filter((x) => x.wp.player.played).length
  }
}

export function teamWeek(build: LineupBuild, rosterId: number, week: number): TeamWeek {
  const key = `${rosterId}|${week}`
  const hit = build.weeks.get(key)
  if (hit) return hit
  const { currentWeek } = build.inputs.value.context
  // A past-week pool (matchups row) may list players now owned elsewhere: only this team's IR / taxi apply.
  const result = solveWeek(
    build,
    pool(build, rosterId, week),
    week,
    (s) => s.base.ownerRosterId === rosterId && reservedNow(s, week, currentWeek)
  )
  build.weeks.set(key, result)
  return result
}

/** Spec 6b §2.3: a hypothetical roster (after a trade) for a window week; never memoised. IR / taxi follow the player. */
export function rosterWeek(build: LineupBuild, roster: PlayerSeries[], week: number): TeamWeek {
  const { currentWeek } = build.inputs.value.context
  return solveWeek(build, roster, week, (s) => reservedNow(s, week, currentWeek))
}

/** Spec 6b §2.3: the engine's candidate for a player joining a roster that week; null when he can't start. */
export function candidateFor(
  build: LineupBuild,
  series: PlayerSeries,
  week: number
): Candidate | null {
  const { currentWeek } = build.inputs.value.context
  if (reservedNow(series, week, currentWeek)) return null
  const wp = weekPlayer(build, series, week)
  return isUnavailable(wp.player.flag) ? null : wp.candidate
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run typecheck && npm run lint && npx vitest run tests/main/lineup`
Expected: PASS, including every pre-existing lineup test (the refactor must not change `teamWeek`).

- [ ] **Step 5: Commit**

```bash
git add src/main/lineup/build.ts tests/main/lineup/build.test.ts
git commit -m "feat(lineup): solve hypothetical rosters for a week"
```

---

### Task 3: `canEnter` — the exact "can this player raise the lineup" test

**Files:**
- Create: `src/main/trade/enter.ts`
- Test: `tests/main/trade/enter.test.ts`

**Interfaces:**
- Consumes: `Candidate`, `LineupSlot`, `Placed`, `optimalLineup`, `lineupSlots` from `@main/lineup/optimal`.
- Produces: `reachableSlots(position: string | null, slots: LineupSlot[], starters: Placed[]): number[]` (slot indexes, ascending); `canEnter(candidate: Candidate, slots: LineupSlot[], starters: Placed[]): boolean`.

- [ ] **Step 1: Write the failing tests**

Create `tests/main/trade/enter.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { lineupSlots, optimalLineup, type Candidate, type LineupSlot, type Placed } from '@main/lineup/optimal'
import { canEnter, reachableSlots } from '@main/trade/enter'

const c = (id: string, position: string | null, value: number): Candidate => ({
  id,
  name: id,
  position,
  value
})

/** Small deterministic generator so a failing case reproduces from its seed. */
function rng(seed: number): () => number {
  let s = seed
  return (): number => {
    s = (s * 1103515245 + 12345) % 2147483648
    return s / 2147483648
  }
}

const POOL_SLOTS = ['QB', 'RB', 'WR', 'TE', 'FLEX', 'SUPER_FLEX', 'REC_FLEX', 'WRRB_FLEX', 'K']
const POSITIONS = ['QB', 'RB', 'WR', 'TE', 'K', null]

// RB · WR · FLEX with the tie broken the "wrong" way for a naive eligible-only test.
const slots: LineupSlot[] = [
  { slot: 'RB', eligible: ['RB'] },
  { slot: 'WR', eligible: ['WR'] },
  { slot: 'FLEX', eligible: ['RB', 'WR', 'TE'] }
]
const A = c('A', 'RB', 10)
const B = c('B', 'WR', 9)
const W = c('W', 'WR', 4)
const starters: Placed[] = [
  { slot: 'RB', player: A },
  { slot: 'WR', player: W },
  { slot: 'FLEX', player: B }
]

describe('reachableSlots', () => {
  it('follows the flex chain through the starters', () => {
    // RB → RB slot (A is RB) and FLEX (B is WR) → WR slot via B's position.
    expect(reachableSlots('RB', slots, starters)).toEqual([0, 1, 2])
    expect(reachableSlots('WR', slots, starters)).toEqual([1, 2])
    expect(reachableSlots('QB', slots, starters)).toEqual([])
    expect(reachableSlots(null, slots, starters)).toEqual([])
  })
})

describe('canEnter (spec 6b §2.3)', () => {
  it('sees the chain case: an RB worse than both RB and FLEX starters still enters through the WR slot', () => {
    const p = c('p', 'RB', 8) // < A (10) and < B (9), but > W (4) reachable via B
    expect(canEnter(p, slots, starters)).toBe(true)
    const after = optimalLineup(slots, [A, B, W, p])
    expect(after.total).toBe(27) // A + B + p
  })

  it('is false when every reachable starter is at least as good', () => {
    expect(canEnter(c('p', 'WR', 3), slots, starters)).toBe(false)
    expect(canEnter(c('p', 'WR', 4), slots, starters)).toBe(false) // ties do not raise the total
    expect(canEnter(c('p', 'QB', 40), slots, starters)).toBe(false) // no slot to reach
  })

  it('is true for an empty reachable slot', () => {
    const empty: Placed[] = [
      { slot: 'RB', player: A },
      { slot: 'WR', player: null },
      { slot: 'FLEX', player: B }
    ]
    expect(canEnter(c('p', 'RB', 1), slots, empty)).toBe(true) // FLEX → B (WR) → empty WR slot
  })

  it('never says false when adding the player raises the optimal total (random rosters)', () => {
    for (let seed = 1; seed <= 300; seed++) {
      const r = rng(seed)
      const nSlots = 2 + Math.floor(r() * 4)
      const rSlots = lineupSlots(
        Array.from({ length: nSlots }, () => ({
          slot: POOL_SLOTS[Math.floor(r() * POOL_SLOTS.length)],
          count: 1
        }))
      )
      const nPlayers = 1 + Math.floor(r() * 7)
      const players = Array.from({ length: nPlayers }, (_, i) =>
        c(`p${i}`, POSITIONS[Math.floor(r() * POSITIONS.length)], Math.round(r() * 60) / 2)
      )
      const extra = c('x', POSITIONS[Math.floor(r() * POSITIONS.length)], Math.round(r() * 60) / 2)
      const before = optimalLineup(rSlots, players)
      const after = optimalLineup(rSlots, [...players, extra])
      if (after.total > before.total + 1e-9) {
        expect({ seed, canEnter: canEnter(extra, rSlots, before.starters) }).toEqual({
          seed,
          canEnter: true
        })
      }
    }
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/main/trade/enter.test.ts`
Expected: FAIL — cannot resolve `@main/trade/enter`.

- [ ] **Step 3: Implement `src/main/trade/enter.ts`**

```ts
import type { Candidate, LineupSlot, Placed } from '@main/lineup/optimal'

/**
 * Spec 6b §2.3: the slots a player of `position` could end up affecting — the slots he is
 * eligible for, then the slots their starters are eligible for, and so on. A WR entering FLEX can
 * push the FLEX WR into the WR slot and bench a weaker WR, so eligibility alone is not enough.
 */
export function reachableSlots(
  position: string | null,
  slots: LineupSlot[],
  starters: Placed[]
): number[] {
  if (position === null) return []
  const reached = new Set<number>()
  const visited = new Set<string>()
  const queue = [position]
  while (queue.length > 0) {
    const pos = queue.pop() as string
    if (visited.has(pos)) continue
    visited.add(pos)
    slots.forEach((slot, i) => {
      if (reached.has(i) || !slot.eligible.includes(pos)) return
      reached.add(i)
      const starter = starters[i]?.player
      if (starter?.position && !visited.has(starter.position)) queue.push(starter.position)
    })
  }
  return [...reached].sort((a, b) => a - b)
}

/**
 * Spec 6b §2.3: exact test of whether adding `candidate` to a roster whose optimal lineup is
 * `starters` can raise the total. Every improving augmentation is a chain that ends by filling
 * an empty reachable slot or benching a reachable starter worth less — so this is never false
 * when the total would rise (it may be true when it would not; callers then solve for real).
 */
export function canEnter(candidate: Candidate, slots: LineupSlot[], starters: Placed[]): boolean {
  for (const i of reachableSlots(candidate.position, slots, starters)) {
    const starter = starters[i]?.player ?? null
    if (starter === null || starter.value < candidate.value) return true
  }
  return false
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npm run typecheck && npm run lint && npx vitest run tests/main/trade/enter.test.ts`
Expected: PASS (300 random seeds included).

- [ ] **Step 5: Commit**

```bash
git add src/main/trade/enter.ts tests/main/trade/enter.test.ts
git commit -m "feat(trade): exact lineup-entry test for a candidate"
```

---

### Task 4: `evaluateTrade` — types, `TradePlayer` rows, drops, market, week skip

**Files:**
- Modify: `src/shared/types.ts` (append the trade types after `TeamStrength`)
- Modify: `src/main/lineup/build.ts:34-43` (`LineupInputs.tradeDeadlineWeek`)
- Modify: `src/main/ipc/handlers.ts:112-131` (`cachedLineup` passes the deadline)
- Modify: `tests/main/lineup/build.test.ts:25-35` (`inputs()` helper)
- Create: `src/main/trade/player.ts`, `src/main/trade/evaluate.ts`
- Test: `tests/main/trade/evaluate.test.ts`

**Interfaces:**
- Consumes: `rosterWeek`, `teamWeek`, `candidateFor`, `windowWeeks`, `teamName`, `TeamWeek`, `LineupBuild` (Task 2 / `@main/lineup/build`); `canEnter` (Task 3); `swapsBetween`, `Placed` (`@main/lineup/optimal`); `UNSTARTABLE_SLOTS` (`@main/value/roster`); `round2` (`@main/db/repos/points`).
- Produces (shared types): `TradeProposal`, `TradePlayer`, `TradeSideResult`, `TradeEvaluation`, `TradePool` (exact shapes below). Engine: `class TradeError extends Error { code: TradeErrorCode }`; `MARKET_FAIR = 0.9`; `myTeam(build): Team`; `requireWindow(build): number[]`; `rosterSize(build): number | null`; `marketRatio(side: { marketGive: number; marketGet: number }): number`; `evaluateTrade(build, proposal, opts?: { skip?: boolean }): TradeEvaluation`. Player rows: `starterWeeks(build, rosterId, weeks): Map<string, number>`; `tradePlayer(build, series, starterWeeks): TradePlayer`.

- [ ] **Step 1: Add the shared types**

Append to `src/shared/types.ts` after `TeamStrength`:

```ts
/** Slice 6b spec §4.1: from my side — I give `give`, I get `get` from roster `rosterId`. */
export interface TradeProposal {
  rosterId: number
  give: string[]
  get: string[]
}

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
  rosterId: number
  name: string
  isMe: boolean
  give: TradePlayer[]
  get: TradePlayer[]
  /** Auto-picked to respect the roster size; empty when none needed. */
  drops: TradePlayer[]
  /** Σ optimal totals over the window, before and after the trade. */
  before: number
  after: number
  delta: number
  deltaPerWeek: number
  thisWeekDelta: number
  /** Σ FantasyCalc value of each list; a player without one counts 0. */
  marketGive: number
  marketGet: number
  unvaluedGive: number
  unvaluedGet: number
  /** Window weeks whose optimal total moves. */
  weeksChanged: number
  thisWeekSwaps: Swap[]
}

export interface TradeEvaluation {
  season: number
  currentWeek: number
  lastWeek: number
  /** Window length, currentWeek..lastWeek. */
  weeks: number
  tradeDeadlinePassed: boolean
  me: TradeSideResult
  them: TradeSideResult
  /** Both deltas > 0. */
  winWin: boolean
  /** Each side receives ≥ 90 % of the market value it gives. */
  marketFair: boolean
}

export interface TradePoolTeam {
  rosterId: number
  name: string
  players: TradePlayer[]
}

/** Slice 6b spec §4.1: everything the builder's pickers need in one call. */
export interface TradePool {
  season: number
  currentWeek: number
  lastWeek: number
  weeks: number
  tradeDeadlinePassed: boolean
  me: TradePoolTeam
  /** Every other team, alphabetical. */
  teams: TradePoolTeam[]
}
```

- [ ] **Step 2: Thread the trade deadline into the build**

`src/main/lineup/build.ts` — `LineupInputs` gains, after `starterIndexes`:

```ts
  /** `LeagueSettings.tradeDeadlineWeek` (the last week trades are allowed); null without one. */
  tradeDeadlineWeek: number | null
```

`src/main/ipc/handlers.ts` `cachedLineup` — read the rules once and pass the deadline:

```ts
  const rules = getRules(ctx.db, leagueId)
  const built = buildLineups({
    value: cachedValue(ctx, leagueId, season),
    teams: listTeams(ctx.db, leagueId),
    rosterSlots: rules?.rosterSlots ?? [],
    rosterPositions: leagueRosterPositions(ctx.db, leagueId),
    matchups: listMatchups(ctx.db, leagueId, season),
    starterIndexes: listStarterIndexes(ctx.db, leagueId),
    tradeDeadlineWeek: rules?.settings.tradeDeadlineWeek ?? null
  })
```

`tests/main/lineup/build.test.ts` `inputs()` — add `tradeDeadlineWeek: getRules(db, 'L1')?.settings.tradeDeadlineWeek ?? null,` before `...over`.

- [ ] **Step 3: Write the failing tests**

Create `tests/main/trade/evaluate.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '@main/db/connection'
import { leagueRosterPositions } from '@main/db/repos/leagues'
import { replaceMarketValues } from '@main/db/repos/marketValues'
import { listMatchups, replaceMatchupsWeek } from '@main/db/repos/matchups'
import { getRules } from '@main/db/repos/rules'
import { listStarterIndexes, listTeams } from '@main/db/repos/teams'
import {
  buildLineups,
  rosterWeek,
  teamStrengths,
  teamWeek,
  type LineupBuild,
  type LineupInputs
} from '@main/lineup/build'
import { mapMatchups } from '@main/sync/matchupsSync'
import { evaluateTrade, rosterSize, TradeError } from '@main/trade/evaluate'
import { starterWeeks, tradePlayer } from '@main/trade/player'
import { buildValueSeason } from '@main/value/build'
import { seedLeague, SEED_TS } from '../../fixtures/db'
import { seedSeason, SEASON } from '../../fixtures/season'
import * as fx from '../../fixtures/sleeper'

function inputs(db: Db, over: Partial<LineupInputs> = {}): LineupInputs {
  return {
    value: buildValueSeason(db, 'L1', SEASON),
    teams: listTeams(db, 'L1'),
    rosterSlots: getRules(db, 'L1')?.rosterSlots ?? [],
    rosterPositions: leagueRosterPositions(db, 'L1'),
    matchups: listMatchups(db, 'L1', SEASON),
    starterIndexes: listStarterIndexes(db, 'L1'),
    tradeDeadlineWeek: getRules(db, 'L1')?.settings.tradeDeadlineWeek ?? null,
    ...over
  }
}

const ids = (list: { playerId: string }[]): string[] => list.map((p) => p.playerId)

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

/**
 * Fixture as of week 3 (Thursday played), window 3..17. Me (roster 1): Barkley RB (30 played wk3,
 * 8 proj wk4), Jefferson WR (13 wk3, 15 wk4), LAR DEF (0), Cook RB on IR. Rival (roster 2):
 * Chase WR (9 wk3), Bijan RB on taxi (7 wk4, reserved). Everything else is 0.
 */
describe('evaluateTrade on the fixture league', () => {
  let db: Db
  let build: LineupBuild
  beforeEach(() => {
    db = seedLeague()
    seedSeason(db)
    for (let week = 1; week <= 4; week++) {
      replaceMatchupsWeek(db, 'L1', SEASON, week, mapMatchups(fx.matchups(week)), SEED_TS)
    }
    build = buildLineups(inputs(db))
  })

  it('scores Jefferson for Chase by both teams’ window strength', () => {
    const ev = evaluateTrade(build, { rosterId: 2, give: ['6794'], get: ['7564'] })
    expect(ev).toMatchObject({
      season: SEASON,
      currentWeek: 3,
      lastWeek: 17,
      weeks: 15,
      tradeDeadlinePassed: false,
      winWin: false
    })
    expect(ev.me).toMatchObject({ rosterId: 1, name: 'Cook Book', isMe: true })
    expect(ids(ev.me.give)).toEqual(['6794'])
    expect(ids(ev.me.get)).toEqual(['7564'])
    expect(ids(ev.them.give)).toEqual(['7564'])
    expect(ids(ev.them.get)).toEqual(['6794'])
    // before equals the power ranking; wk3 13 → 9 (−4), wk4 15 → 0 (−15)
    const mine = teamStrengths(build).find((r) => r.rosterId === 1)
    expect(ev.me.before).toBeCloseTo(mine?.rosTotal ?? -1, 2)
    expect(ev.me.delta).toBeCloseTo(-19, 2)
    expect(ev.me.deltaPerWeek).toBeCloseTo(-19 / 15, 2)
    expect(ev.me.thisWeekDelta).toBeCloseTo(-4, 2)
    expect(ev.me.weeksChanged).toBe(2)
    expect(ev.them.delta).toBeCloseTo(19, 2)
    expect(ev.them.thisWeekDelta).toBeCloseTo(4, 2)
    expect(ev.me.drops).toEqual([])
    // this week's swap on my side: Chase in for Jefferson at WR
    expect(ev.me.thisWeekSwaps).toHaveLength(1)
    expect(ev.me.thisWeekSwaps[0]).toMatchObject({ slot: 'WR', delta: -4 })
    expect(ev.me.thisWeekSwaps[0].in.playerId).toBe('7564')
    expect(ev.me.thisWeekSwaps[0].out?.playerId).toBe('6794')
  })

  it('matches a full solve of every week (the week skip is exact)', () => {
    const proposals = [
      { rosterId: 2, give: ['6794'], get: ['7564'] },
      { rosterId: 2, give: ['LAR'], get: ['9509'] }, // 0-value defense for a taxi player
      { rosterId: 2, give: ['4866', 'LAR'], get: ['7564', '9509'] },
      { rosterId: 2, give: ['8259'], get: ['9509'] } // IR for taxi: nothing changes
    ]
    for (const p of proposals) {
      const skipped = evaluateTrade(build, p)
      const full = evaluateTrade(build, p, { skip: false })
      expect([skipped.me.delta, skipped.them.delta, skipped.me.weeksChanged]).toEqual([
        full.me.delta,
        full.them.delta,
        full.me.weeksChanged
      ])
      // and the after total is what rosterWeek says on the swapped roster
      const mine = (build.rosters.get(1) ?? []).filter((s) => !p.give.includes(s.base.playerId))
      const got = p.get.map((id) => build.inputs.value.series.get(id)).flatMap((s) => (s ? [s] : []))
      let after = 0
      for (let w = 3; w <= 17; w++) after += rosterWeek(build, [...mine, ...got], w).optimalTotal
      expect(skipped.me.after).toBeCloseTo(after, 2)
    }
    const ir = evaluateTrade(build, { rosterId: 2, give: ['8259'], get: ['9509'] })
    expect(ir.me.delta).toBe(0)
    expect(ir.me.weeksChanged).toBe(0)
    expect(ir.me.get[0].reserve).toBe('taxi')
  })

  it('auto-drops the player who starts least when the roster would overflow (spec §2.3)', () => {
    // Sleeper roster size 2 (IR does not count): after Jefferson → Chase I hold Barkley, LAR, Chase.
    const small = buildLineups(inputs(db, { rosterPositions: ['RB', 'WR', 'IR'] }))
    expect(rosterSize(small)).toBe(2)
    const ev = evaluateTrade(small, { rosterId: 2, give: ['6794'], get: ['7564'] })
    // Everyone "starts" every week (0-value starters still fill slots); LAR has the lowest rosPoints.
    expect(ids(ev.me.drops)).toEqual(['LAR'])
    expect(ev.me.delta).toBeCloseTo(-19, 2)
    expect(ev.them.drops).toEqual([]) // Rival: Jefferson + Bijan (taxi) = 1 active
    expect(rosterSize(buildLineups(inputs(db, { rosterPositions: null })))).toBeNull()
  })

  it('sums market values and counts unvalued players (spec §2.3)', () => {
    replaceMarketValues(
      db,
      SEASON,
      [
        { playerId: '6794', value: 10512, overallRank: 1, posRank: 1, tier: 1, trend30d: 120 },
        { playerId: '7564', value: 8000, overallRank: 3, posRank: 2, tier: 1, trend30d: 40 }
      ],
      SEED_TS
    )
    const priced = buildLineups(inputs(db))
    const ev = evaluateTrade(priced, { rosterId: 2, give: ['6794', 'LAR'], get: ['7564'] })
    expect(ev.me).toMatchObject({
      marketGive: 10512,
      marketGet: 8000,
      unvaluedGive: 1,
      unvaluedGet: 0
    })
    expect(ev.them).toMatchObject({ marketGive: 8000, marketGet: 10512, unvaluedGet: 1 })
    expect(ev.marketFair).toBe(false) // 8000 / 10512 = 0.76 on my side
    expect(ev.me.give[0].market?.value).toBe(10512)
    // Unpriced league: every ratio is +∞, so the trade is "fair" — the unvalued counts say why.
    const blind = evaluateTrade(build, { rosterId: 2, give: ['6794'], get: ['7564'] })
    expect(blind.marketFair).toBe(true)
    expect(blind.me.unvaluedGive + blind.me.unvaluedGet).toBe(2)
  })

  it('rejects malformed proposals with INVALID_TRADE', () => {
    const invalid = (p: Parameters<typeof evaluateTrade>[1]): string => codeOf(() => evaluateTrade(build, p))
    expect(invalid({ rosterId: 9, give: ['6794'], get: ['7564'] })).toBe('INVALID_TRADE')
    expect(invalid({ rosterId: 1, give: ['6794'], get: ['7564'] })).toBe('INVALID_TRADE')
    expect(invalid({ rosterId: 2, give: [], get: ['7564'] })).toBe('INVALID_TRADE')
    expect(invalid({ rosterId: 2, give: ['6794'], get: [] })).toBe('INVALID_TRADE')
    expect(invalid({ rosterId: 2, give: ['7564'], get: ['6794'] })).toBe('INVALID_TRADE')
    expect(invalid({ rosterId: 2, give: ['6794', '6794'], get: ['7564'] })).toBe('INVALID_TRADE')
    expect(invalid({ rosterId: 2, give: ['nobody'], get: ['7564'] })).toBe('INVALID_TRADE')
    expect(() => evaluateTrade(build, { rosterId: 2, give: ['nobody'], get: ['7564'] })).toThrow(
      "nobody is not on Cook Book's roster"
    )
  })

  it('throws NO_PROJECTIONS without a window and NO_ME without my team', () => {
    const proposal = { rosterId: 2, give: ['6794'], get: ['7564'] }
    const nobody = buildLineups(
      inputs(db, { teams: listTeams(db, 'L1').map((t) => ({ ...t, isMe: false })) })
    )
    expect(codeOf(() => evaluateTrade(nobody, proposal))).toBe('NO_ME')
    db.prepare('DELETE FROM player_week_projections').run()
    expect(codeOf(() => evaluateTrade(buildLineups(inputs(db)), proposal))).toBe('NO_PROJECTIONS')
    expect(() => evaluateTrade(buildLineups(inputs(db)), proposal)).toThrow('No projections stored')
  })

  it('flags a passed trade deadline', () => {
    const late = buildLineups(inputs(db, { tradeDeadlineWeek: 2 }))
    expect(
      evaluateTrade(late, { rosterId: 2, give: ['6794'], get: ['7564'] }).tradeDeadlinePassed
    ).toBe(true)
  })
})

describe('trade player rows', () => {
  let build: LineupBuild
  beforeEach(() => {
    const db = seedLeague()
    seedSeason(db)
    build = buildLineups(inputs(db))
  })

  it('counts window starts per player and builds the row', () => {
    const weeks = [3, 4, 5]
    const starts = starterWeeks(build, 1, weeks)
    expect(starts.get('4866')).toBe(3) // Barkley fills RB even at 0 in week 5
    expect(starts.get('8259')).toBeUndefined() // IR
    const cook = build.inputs.value.series.get('8259')
    if (!cook) throw new Error('fixture: Cook missing')
    expect(tradePlayer(build, cook, 0)).toEqual({
      playerId: '8259',
      fullName: 'James Cook',
      position: 'RB',
      team: cook.base.team,
      statsAvailable: false,
      injuryStatus: cook.base.injuryStatus,
      reserve: 'ir',
      rosPoints: null,
      rosValue: null,
      expert: null,
      market: null,
      starterWeeks: 0
    })
    const barkley = build.inputs.value.series.get('4866')
    if (!barkley) throw new Error('fixture: Barkley missing')
    const row = tradePlayer(build, barkley, 3)
    expect(row.reserve).toBeNull()
    expect(row.rosPoints).toBe(build.rowById.get('4866')?.rosPoints ?? null)
    expect(teamWeek(build, 1, 3).optimal.some((p) => p.player?.id === '4866')).toBe(true)
  })
})
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npx vitest run tests/main/trade/evaluate.test.ts`
Expected: FAIL — cannot resolve `@main/trade/evaluate` / `@main/trade/player`.

- [ ] **Step 5: Implement `src/main/trade/player.ts`**

```ts
import { teamWeek, type LineupBuild } from '@main/lineup/build'
import type { PlayerSeries } from '@main/value/series'
import type { TradePlayer } from '@shared/types'

/** Spec 6b §4.1: window weeks in which each player of a roster starts, before any trade. */
export function starterWeeks(
  build: LineupBuild,
  rosterId: number,
  weeks: number[]
): Map<string, number> {
  const counts = new Map<string, number>()
  for (const week of weeks) {
    for (const placed of teamWeek(build, rosterId, week).optimal) {
      if (placed.player) counts.set(placed.player.id, (counts.get(placed.player.id) ?? 0) + 1)
    }
  }
  return counts
}

/** A player as the trade tables show him: identity, reserve slot, ROS / expert / market numbers. */
export function tradePlayer(build: LineupBuild, s: PlayerSeries, starterWeeks: number): TradePlayer {
  const row = build.rowById.get(s.base.playerId)
  return {
    playerId: s.base.playerId,
    fullName: s.base.fullName,
    position: s.base.position,
    team: s.base.team,
    statsAvailable: s.statsAvailable,
    injuryStatus: s.base.injuryStatus,
    reserve: s.rosterSlot === 'ir' || s.rosterSlot === 'taxi' ? s.rosterSlot : null,
    rosPoints: row?.rosPoints ?? null,
    rosValue: row?.rosValue ?? null,
    expert: row?.expert ?? null,
    market: row?.market ?? null,
    starterWeeks
  }
}
```

- [ ] **Step 6: Implement `src/main/trade/evaluate.ts`**

```ts
import { round2 } from '@main/db/repos/points'
import {
  candidateFor,
  rosterWeek,
  teamName,
  teamWeek,
  windowWeeks,
  type LineupBuild,
  type TeamWeek
} from '@main/lineup/build'
import { swapsBetween } from '@main/lineup/optimal'
import { UNSTARTABLE_SLOTS } from '@main/value/roster'
import type { PlayerSeries } from '@main/value/series'
import type {
  Swap,
  Team,
  TradeEvaluation,
  TradePlayer,
  TradeProposal,
  TradeSideResult
} from '@shared/types'
import { canEnter } from './enter'
import { starterWeeks, tradePlayer } from './player'

/** Spec 6b §2.4: a side is market-fair when it receives at least this share of what it gives. */
export const MARKET_FAIR = 0.9
/** Weekly totals that move by less than this are rounding, not a lineup change. */
const CHANGED_PTS = 0.01

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

export interface EvaluateOptions {
  /** Tests only: `false` solves every week instead of skipping the provably unchanged ones. */
  skip?: boolean
}

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
      'No projections stored for this season — trades are valued on the remaining weeks'
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

function onReserve(s: PlayerSeries): boolean {
  return s.rosterSlot !== null && UNSTARTABLE_SLOTS.has(s.rosterSlot)
}

function resolve(roster: PlayerSeries[], ids: string[], owner: string): PlayerSeries[] {
  const seen = new Set<string>()
  return ids.map((id) => {
    if (seen.has(id)) throw new TradeError('INVALID_TRADE', `Invalid trade: ${id} is listed twice`)
    seen.add(id)
    const s = roster.find((p) => p.base.playerId === id)
    if (!s) throw new TradeError('INVALID_TRADE', `Invalid trade: ${id} is not on ${owner}'s roster`)
    return s
  })
}

function isStarter(week: TeamWeek, id: string): boolean {
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

function marketSum(build: LineupBuild, list: PlayerSeries[]): { total: number; unvalued: number } {
  let total = 0
  let unvalued = 0
  for (const s of list) {
    const market = build.rowById.get(s.base.playerId)?.market ?? null
    if (market) total += market.value
    else unvalued++
  }
  return { total, unvalued }
}

/** Spec §2.3 week skip: false only when the week's optimal total provably stays the same. */
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

interface Side {
  team: Team
  give: PlayerSeries[]
  get: PlayerSeries[]
  /** Window starts of the other team's players (the ones I receive), before the trade. */
  theirStarts: Map<string, number>
}

function sideResult(
  build: LineupBuild,
  side: Side,
  weeks: number[],
  size: number | null,
  opts: EvaluateOptions
): TradeSideResult {
  const { team, give, get } = side
  const before = weeks.map((w) => teamWeek(build, team.rosterId, w))
  const giveIds = new Set(give.map((s) => s.base.playerId))
  const kept = (build.rosters.get(team.rosterId) ?? []).filter((s) => !giveIds.has(s.base.playerId))
  let after = [...kept, ...get]

  // Spec §2.3: an oversized after-roster drops the players who start least on it, then is solved again.
  let drops: PlayerSeries[] = []
  const active = after.filter((s) => !onReserve(s))
  const excess = size === null ? 0 : Math.max(0, active.length - size)
  if (excess > 0) {
    const starts = startCounts(weeks.map((w) => rosterWeek(build, after, w)))
    const rosPoints = (s: PlayerSeries): number => build.rowById.get(s.base.playerId)?.rosPoints ?? 0
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
  const afterWeeks = weeks.map((w, i) =>
    opts.skip !== false && !mayChange(build, before[i], removed, get, w)
      ? before[i]
      : rosterWeek(build, after, w)
  )
  const beforeTotal = sum(before.map((x) => x.optimalTotal))
  const afterTotal = sum(afterWeeks.map((x) => x.optimalTotal))
  const delta = round2(afterTotal - beforeTotal) ?? 0
  const myStarts = startCounts(before)
  const mine = (s: PlayerSeries): TradePlayer =>
    tradePlayer(build, s, myStarts.get(s.base.playerId) ?? 0)
  const giveMarket = marketSum(build, give)
  const getMarket = marketSum(build, get)
  return {
    rosterId: team.rosterId,
    name: teamName(team),
    isMe: team.isMe,
    give: give.map(mine),
    get: get.map((s) => tradePlayer(build, s, side.theirStarts.get(s.base.playerId) ?? 0)),
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

/** Spec 6b §2.3–2.4: both sides' window strength before and after, drops, market sums, verdict flags. */
export function evaluateTrade(
  build: LineupBuild,
  proposal: TradeProposal,
  opts: EvaluateOptions = {}
): TradeEvaluation {
  const weeks = requireWindow(build)
  const me = myTeam(build)
  const them = build.inputs.teams.find((t) => t.rosterId === proposal.rosterId)
  if (!them || them.rosterId === me.rosterId) {
    throw new TradeError('INVALID_TRADE', 'Invalid trade: pick another team to trade with')
  }
  if (proposal.give.length === 0 || proposal.get.length === 0) {
    throw new TradeError('INVALID_TRADE', 'Invalid trade: both sides must include a player')
  }
  const give = resolve(build.rosters.get(me.rosterId) ?? [], proposal.give, teamName(me))
  const get = resolve(build.rosters.get(them.rosterId) ?? [], proposal.get, teamName(them))
  const size = rosterSize(build)
  const myStarts = starterWeeks(build, me.rosterId, weeks)
  const theirStarts = starterWeeks(build, them.rosterId, weeks)
  const mine = sideResult(build, { team: me, give, get, theirStarts }, weeks, size, opts)
  const theirs = sideResult(
    build,
    { team: them, give: get, get: give, theirStarts: myStarts },
    weeks,
    size,
    opts
  )
  const { season, currentWeek, lastWeek } = build.inputs.value.context
  const deadline = build.inputs.tradeDeadlineWeek
  return {
    season,
    currentWeek,
    lastWeek,
    weeks: weeks.length,
    tradeDeadlinePassed: deadline !== null && currentWeek > deadline,
    me: mine,
    them: theirs,
    winWin: mine.delta > 0 && theirs.delta > 0,
    marketFair: marketRatio(mine) >= MARKET_FAIR && marketRatio(theirs) >= MARKET_FAIR
  }
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npm run typecheck && npm run lint && npx vitest run tests/main/trade tests/main/lineup`
Expected: PASS. If the Jefferson-for-Chase numbers differ, check the fixture scoring first (`rec: 1`, `rec_yd: 0.1`, `rush_yd: 0.1`): Jefferson 5 + 8 = 13 / 6 + 9 = 15, Chase 4 + 5 = 9.

- [ ] **Step 8: Commit**

```bash
git add src/shared/types.ts src/main/lineup/build.ts src/main/ipc/handlers.ts src/main/trade/player.ts src/main/trade/evaluate.ts tests/main/lineup/build.test.ts tests/main/trade/evaluate.test.ts
git commit -m "feat(trade): evaluate a trade by both teams' strength"
```

---

### Task 5: `tradePool` and the IPC channels

**Files:**
- Create: `src/main/trade/pool.ts`
- Modify: `src/shared/ipc.ts` (`IPC` map, `Api.trade`, type imports)
- Modify: `src/preload/index.ts` (`api.trade`)
- Modify: `src/main/ipc/handlers.ts` (two handlers)
- Test: `tests/main/trade/pool.test.ts`

**Interfaces:**
- Consumes: `myTeam`, `requireWindow` (Task 4 `@main/trade/evaluate`); `starterWeeks`, `tradePlayer` (Task 4 `@main/trade/player`); `teamName` (`@main/lineup/build`); `LINEUP_POSITIONS` (`@shared/rules`).
- Produces: `tradePool(build: LineupBuild): TradePool`; IPC `trade:pool (season) → TradePool`, `trade:evaluate (season, TradeProposal) → TradeEvaluation`; `api.trade.pool(season)`, `api.trade.evaluate(season, proposal)`.

- [ ] **Step 1: Write the failing test**

Create `tests/main/trade/pool.test.ts`:

```ts
import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '@main/db/connection'
import { leagueRosterPositions } from '@main/db/repos/leagues'
import { listMatchups } from '@main/db/repos/matchups'
import { getRules } from '@main/db/repos/rules'
import { listStarterIndexes, listTeams } from '@main/db/repos/teams'
import { buildLineups, type LineupInputs } from '@main/lineup/build'
import { TradeError } from '@main/trade/evaluate'
import { tradePool } from '@main/trade/pool'
import { buildValueSeason } from '@main/value/build'
import { seedLeague } from '../../fixtures/db'
import { seedSeason, SEASON } from '../../fixtures/season'

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

function inputs(db: Db, over: Partial<LineupInputs> = {}): LineupInputs {
  return {
    value: buildValueSeason(db, 'L1', SEASON),
    teams: listTeams(db, 'L1'),
    rosterSlots: getRules(db, 'L1')?.rosterSlots ?? [],
    rosterPositions: leagueRosterPositions(db, 'L1'),
    matchups: listMatchups(db, 'L1', SEASON),
    starterIndexes: listStarterIndexes(db, 'L1'),
    tradeDeadlineWeek: getRules(db, 'L1')?.settings.tradeDeadlineWeek ?? null,
    ...over
  }
}

describe('tradePool', () => {
  let db: Db
  beforeEach(() => {
    db = seedLeague()
    seedSeason(db)
  })

  it('lists my roster and every other team, ordered by position then ROS points', () => {
    const pool = tradePool(buildLineups(inputs(db)))
    expect(pool).toMatchObject({
      season: SEASON,
      currentWeek: 3,
      lastWeek: 17,
      weeks: 15,
      tradeDeadlinePassed: false
    })
    expect(pool.me.name).toBe('Cook Book')
    // RB Barkley (ROS 8), RB Cook (IR, null), WR Jefferson, DEF LAR
    expect(pool.me.players.map((p) => [p.playerId, p.position, p.reserve])).toEqual([
      ['4866', 'RB', null],
      ['8259', 'RB', 'ir'],
      ['6794', 'WR', null],
      ['LAR', 'DEF', null]
    ])
    expect(pool.me.players[0].starterWeeks).toBe(15)
    expect(pool.me.players[1].starterWeeks).toBe(0)
    expect(pool.teams.map((t) => t.name)).toEqual(['Rival'])
    expect(pool.teams[0].players.map((p) => [p.playerId, p.reserve])).toEqual([
      ['9509', 'taxi'],
      ['7564', null]
    ])
  })

  it('fails like the evaluator without projections or my team', () => {
    const nobody = buildLineups(
      inputs(db, { teams: listTeams(db, 'L1').map((t) => ({ ...t, isMe: false })) })
    )
    expect(codeOf(() => tradePool(nobody))).toBe('NO_ME')
    db.prepare('DELETE FROM player_week_projections').run()
    expect(codeOf(() => tradePool(buildLineups(inputs(db))))).toBe('NO_PROJECTIONS')
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/main/trade/pool.test.ts`
Expected: FAIL — cannot resolve `@main/trade/pool`.

- [ ] **Step 3: Implement `src/main/trade/pool.ts`**

```ts
import { teamName, type LineupBuild } from '@main/lineup/build'
import { LINEUP_POSITIONS } from '@shared/rules'
import type { Team, TradePlayer, TradePool, TradePoolTeam } from '@shared/types'
import { myTeam, requireWindow } from './evaluate'
import { starterWeeks, tradePlayer } from './player'

function positionOrder(position: string | null): number {
  const i = position === null ? -1 : LINEUP_POSITIONS.indexOf(position)
  return i === -1 ? LINEUP_POSITIONS.length : i
}

function byPositionThenRos(a: TradePlayer, b: TradePlayer): number {
  return (
    positionOrder(a.position) - positionOrder(b.position) ||
    (b.rosPoints ?? Number.NEGATIVE_INFINITY) - (a.rosPoints ?? Number.NEGATIVE_INFINITY) ||
    a.fullName.localeCompare(b.fullName)
  )
}

/** Spec 6b §4.1: my roster and every other team's, as the builder's pickers show them. */
export function tradePool(build: LineupBuild): TradePool {
  const weeks = requireWindow(build)
  const me = myTeam(build)
  const rows = (t: Team): TradePoolTeam => {
    const starts = starterWeeks(build, t.rosterId, weeks)
    const players = (build.rosters.get(t.rosterId) ?? []).map((s) =>
      tradePlayer(build, s, starts.get(s.base.playerId) ?? 0)
    )
    players.sort(byPositionThenRos)
    return { rosterId: t.rosterId, name: teamName(t), players }
  }
  const { season, currentWeek, lastWeek } = build.inputs.value.context
  const deadline = build.inputs.tradeDeadlineWeek
  return {
    season,
    currentWeek,
    lastWeek,
    weeks: weeks.length,
    tradeDeadlinePassed: deadline !== null && currentWeek > deadline,
    me: rows(me),
    teams: build.inputs.teams
      .filter((t) => t.rosterId !== me.rosterId)
      .sort((a, b) => teamName(a).localeCompare(teamName(b)))
      .map(rows)
  }
}
```

- [ ] **Step 4: Wire the IPC**

`src/shared/ipc.ts` — add `TradeEvaluation`, `TradePool`, `TradeProposal` to the `./types` import; in the `IPC` map after `lineupStrength`:

```ts
  tradePool: 'trade:pool',
  tradeEvaluate: 'trade:evaluate',
```

and in `Api` after `lineup`:

```ts
  trade: {
    /** My roster and every other team's for the builder's pickers (slice 6b spec §4.2). */
    pool(season: number): Promise<TradePool>
    /** Both teams' window strength before / after the proposal, drops, market balance. */
    evaluate(season: number, proposal: TradeProposal): Promise<TradeEvaluation>
  }
```

`src/preload/index.ts` — after `lineup`:

```ts
  trade: {
    pool: (season) => ipcRenderer.invoke(IPC.tradePool, season),
    evaluate: (season, proposal) => ipcRenderer.invoke(IPC.tradeEvaluate, season, proposal)
  },
```

`src/main/ipc/handlers.ts` — import `evaluateTrade` from `@main/trade/evaluate`, `tradePool` from `@main/trade/pool`, and the `TradeEvaluation`, `TradePool`, `TradeProposal` types from `@shared/types`; after the `lineupStrength` handler:

```ts
  ipcMain.handle(IPC.tradePool, (_event, season: number): TradePool => {
    const id = activeLeagueId()
    if (!id) throw new Error('No league imported')
    return tradePool(cachedLineup(ctx, id, season))
  })

  ipcMain.handle(
    IPC.tradeEvaluate,
    (_event, season: number, proposal: TradeProposal): TradeEvaluation => {
      const id = activeLeagueId()
      if (!id) throw new Error('No league imported')
      return evaluateTrade(cachedLineup(ctx, id, season), proposal)
    }
  )
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run typecheck && npm run lint && npm test`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/main/trade/pool.ts src/shared/ipc.ts src/preload/index.ts src/main/ipc/handlers.ts tests/main/trade/pool.test.ts
git commit -m "feat(trade): pool and evaluate IPC channels"
```

---

### Task 6: Renderer view helpers — `lib/tradeView.ts`

**Files:**
- Create: `src/renderer/src/lib/tradeView.ts`
- Create: `tests/fixtures/trade.ts`
- Test: `tests/renderer/lib/tradeView.test.ts`

**Interfaces:**
- Consumes: `fmtPoints`, `fmtSigned` (`@/lib/format`); `LINEUP_POSITIONS` (`@shared/rules`); the Task 4 types.
- Produces: `windowLabel(p)`, `DEADLINE_NOTE`, `fmtMarket(v)`, `marketLine(side)`, `deltaLine(side)`, `deltaTone(delta)`, `rangeLine(side)`, `dropLine(side)`, `startsLabel(p, weeks)`, `playerStats(p, weeks)`, `playerOption(p)`, `groupByPosition(players)`, `verdictBadges(ev)`, `NO_VERDICT_HINT`.

- [ ] **Step 1: Add the fixture**

Create `tests/fixtures/trade.ts`:

```ts
import type { TradeEvaluation, TradePlayer, TradePool, TradeSideResult } from '@shared/types'

export function tradePlayer(over: Partial<TradePlayer> & { playerId: string }): TradePlayer {
  return {
    fullName: `Player ${over.playerId}`,
    position: 'RB',
    team: 'PHI',
    statsAvailable: true,
    injuryStatus: null,
    reserve: null,
    rosPoints: 100,
    rosValue: 20,
    expert: null,
    market: null,
    starterWeeks: 10,
    ...over
  }
}

export const barkley = tradePlayer({
  playerId: '4866',
  fullName: 'Saquon Barkley',
  rosPoints: 118.4,
  starterWeeks: 15,
  expert: { ecrRank: 2, ecrPosRank: 1, spread: 1.1, experts: 40, ecrDelta: 0 },
  market: { value: 9340, posRank: 1, tier: 1, trend30d: -310 }
})
export const jefferson = tradePlayer({
  playerId: '6794',
  fullName: 'Justin Jefferson',
  position: 'WR',
  team: 'MIN',
  rosPoints: 128,
  starterWeeks: 15,
  market: { value: 10512, posRank: 1, tier: 1, trend30d: 120 }
})
export const lar = tradePlayer({
  playerId: 'LAR',
  fullName: 'Los Angeles Rams',
  position: 'DEF',
  team: 'LAR',
  rosPoints: 0,
  rosValue: null,
  starterWeeks: 15
})
export const cook = tradePlayer({
  playerId: '8259',
  fullName: 'James Cook',
  team: 'BUF',
  reserve: 'ir',
  rosPoints: null,
  rosValue: null,
  starterWeeks: 0
})
export const chase = tradePlayer({
  playerId: '7564',
  fullName: "Ja'Marr Chase",
  position: 'WR',
  team: 'CIN',
  rosPoints: 9,
  starterWeeks: 1,
  market: { value: 8000, posRank: 2, tier: 1, trend30d: 40 }
})
export const bijan = tradePlayer({
  playerId: '9509',
  fullName: 'Bijan Robinson',
  team: 'ATL',
  reserve: 'taxi',
  rosPoints: 7,
  starterWeeks: 0
})

export function tradeSide(over: Partial<TradeSideResult> = {}): TradeSideResult {
  return {
    rosterId: 1,
    name: 'Cook Book',
    isMe: true,
    give: [jefferson],
    get: [chase],
    drops: [],
    before: 66,
    after: 47,
    delta: -19,
    deltaPerWeek: -1.27,
    thisWeekDelta: -4,
    marketGive: 10512,
    marketGet: 8000,
    unvaluedGive: 0,
    unvaluedGet: 0,
    weeksChanged: 2,
    thisWeekSwaps: [],
    ...over
  }
}

export function tradeEvaluation(over: Partial<TradeEvaluation> = {}): TradeEvaluation {
  return {
    season: 2026,
    currentWeek: 3,
    lastWeek: 17,
    weeks: 15,
    tradeDeadlinePassed: false,
    me: tradeSide(),
    them: tradeSide({
      rosterId: 2,
      name: 'Rival',
      isMe: false,
      give: [chase],
      get: [jefferson],
      before: 9,
      after: 28,
      delta: 19,
      deltaPerWeek: 1.27,
      thisWeekDelta: 4,
      marketGive: 8000,
      marketGet: 10512
    }),
    winWin: false,
    marketFair: false,
    ...over
  }
}

export function tradePool(over: Partial<TradePool> = {}): TradePool {
  return {
    season: 2026,
    currentWeek: 3,
    lastWeek: 17,
    weeks: 15,
    tradeDeadlinePassed: false,
    me: { rosterId: 1, name: 'Cook Book', players: [barkley, cook, jefferson, lar] },
    teams: [{ rosterId: 2, name: 'Rival', players: [bijan, chase] }],
    ...over
  }
}
```

- [ ] **Step 2: Write the failing tests**

Create `tests/renderer/lib/tradeView.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  DEADLINE_NOTE,
  deltaLine,
  deltaTone,
  dropLine,
  fmtMarket,
  groupByPosition,
  marketLine,
  playerOption,
  playerStats,
  rangeLine,
  startsLabel,
  verdictBadges,
  windowLabel
} from '@/lib/tradeView'
import { barkley, chase, cook, jefferson, lar, tradeEvaluation, tradeSide } from '../../fixtures/trade'

describe('tradeView', () => {
  it('labels the window', () => {
    expect(windowLabel({ currentWeek: 3, lastWeek: 17, weeks: 15 })).toBe('weeks 3–17 · 15 weeks')
    expect(windowLabel({ currentWeek: 17, lastWeek: 17, weeks: 1 })).toBe('week 17 · 1 week')
    expect(DEADLINE_NOTE).toContain('deadline')
  })

  it('formats market values with thin thousands and the ratio', () => {
    expect(fmtMarket(10512)).toBe('10 512')
    expect(fmtMarket(0)).toBe('0')
    expect(marketLine(tradeSide())).toBe('gives 10 512 → gets 8 000 (76 %)')
    expect(marketLine(tradeSide({ marketGive: 10512, marketGet: 8000, unvaluedGive: 1 }))).toBe(
      'gives 10 512 → gets 8 000 (76 %) · 1 unvalued'
    )
    expect(marketLine(tradeSide({ marketGive: 0, marketGet: 8000 }))).toBe(
      'gives 0 → gets 8 000 (∞)'
    )
    expect(marketLine(tradeSide({ marketGive: 0, marketGet: 0, unvaluedGive: 1, unvaluedGet: 1 }))).toBe(
      'gives 0 → gets 0 (—) · 2 unvalued'
    )
  })

  it('formats the strength lines', () => {
    expect(deltaLine(tradeSide())).toBe('-19.00 (-1.27/wk)')
    expect(deltaLine(tradeSide({ delta: 19, deltaPerWeek: 1.27 }))).toBe('+19.00 (+1.27/wk)')
    expect(rangeLine(tradeSide())).toBe('66.00 → 47.00 · this week -4.00 · 2 weeks change')
    expect(rangeLine(tradeSide({ weeksChanged: 1, thisWeekDelta: 0 }))).toBe(
      '66.00 → 47.00 · this week 0.00 · 1 week changes'
    )
    expect(deltaTone(19)).toBe('green')
    expect(deltaTone(-0.5)).toBe('red')
    expect(deltaTone(0)).toBe('muted')
    expect(dropLine(tradeSide())).toBeNull()
    expect(dropLine(tradeSide({ drops: [lar, cook] }))).toBe('drop: Los Angeles Rams, James Cook')
  })

  it('describes a player row and a picker option', () => {
    expect(startsLabel(barkley, 15)).toBe('starts 15/15')
    expect(playerStats(barkley, 15)).toBe('ROS 118.4 · ECR 1 · MKT 9 340 · starts 15/15')
    expect(playerStats(cook, 15)).toBe('ROS — · ECR — · MKT — · starts 0/15')
    expect(playerOption(jefferson)).toBe('Justin Jefferson · MIN · ROS 128.0')
    expect(playerOption(cook)).toBe('James Cook · BUF · IR · ROS —')
  })

  it('groups pickers by lineup position, others last', () => {
    const groups = groupByPosition([lar, chase, barkley, tradePlayerX])
    expect(groups.map(([pos, players]) => [pos, players.map((p) => p.playerId)])).toEqual([
      ['RB', ['4866']],
      ['WR', ['7564']],
      ['DEF', ['LAR']],
      ['—', ['x']]
    ])
  })

  it('lists the verdict badges', () => {
    expect(verdictBadges(tradeEvaluation())).toEqual([
      { label: 'Win-win', on: false },
      { label: 'Market-fair', on: false }
    ])
    expect(verdictBadges(tradeEvaluation({ winWin: true, marketFair: true }))).toEqual([
      { label: 'Win-win', on: true },
      { label: 'Market-fair', on: true }
    ])
  })
})

const tradePlayerX = { ...barkley, playerId: 'x', position: null }
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/renderer/lib/tradeView.test.ts`
Expected: FAIL — cannot resolve `@/lib/tradeView`.

- [ ] **Step 4: Implement `src/renderer/src/lib/tradeView.ts`**

```ts
import { fmtPoints, fmtSigned } from '@/lib/format'
import { LINEUP_POSITIONS } from '@shared/rules'
import type { TradeEvaluation, TradePlayer, TradeSideResult } from '@shared/types'

export const DEADLINE_NOTE =
  'The trade deadline has passed — Sleeper no longer accepts trades; evaluation still works.'
export const NO_VERDICT_HINT = 'Pick a partner, add players to both sides and evaluate.'

/** "weeks 3–17 · 15 weeks" */
export function windowLabel(p: { currentWeek: number; lastWeek: number; weeks: number }): string {
  return p.weeks === 1
    ? `week ${p.currentWeek} · 1 week`
    : `weeks ${p.currentWeek}–${p.lastWeek} · ${p.weeks} weeks`
}

/** FantasyCalc values with a thin space per thousand: "10 512". */
export function fmtMarket(value: number): string {
  return Math.round(value)
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ' ')
}

/** Spec §5.1: "gives 4 200 → gets 3 900 (93 %) · 1 unvalued" */
export function marketLine(s: TradeSideResult): string {
  const ratio =
    s.marketGive === 0
      ? s.marketGet === 0
        ? '—'
        : '∞'
      : `${Math.round((s.marketGet / s.marketGive) * 100)} %`
  const unvalued = s.unvaluedGive + s.unvaluedGet
  const base = `gives ${fmtMarket(s.marketGive)} → gets ${fmtMarket(s.marketGet)} (${ratio})`
  return unvalued > 0 ? `${base} · ${unvalued} unvalued` : base
}

/** "+18.40 (+1.31/wk)" */
export function deltaLine(s: TradeSideResult): string {
  return `${fmtSigned(s.delta)} (${fmtSigned(s.deltaPerWeek)}/wk)`
}

export function deltaTone(delta: number): 'green' | 'red' | 'muted' {
  return delta > 0 ? 'green' : delta < 0 ? 'red' : 'muted'
}

/** "66.00 → 47.00 · this week -4.00 · 2 weeks change" */
export function rangeLine(s: TradeSideResult): string {
  const weeks = s.weeksChanged === 1 ? '1 week changes' : `${s.weeksChanged} weeks change`
  return `${fmtPoints(s.before)} → ${fmtPoints(s.after)} · this week ${fmtSigned(s.thisWeekDelta)} · ${weeks}`
}

export function dropLine(s: TradeSideResult): string | null {
  return s.drops.length === 0 ? null : `drop: ${s.drops.map((p) => p.fullName).join(', ')}`
}

export function startsLabel(p: TradePlayer, weeks: number): string {
  return `starts ${p.starterWeeks}/${weeks}`
}

const ros = (p: TradePlayer): string => (p.rosPoints === null ? '—' : p.rosPoints.toFixed(1))

/** "ROS 118.4 · ECR 1 · MKT 9 340 · starts 15/15" */
export function playerStats(p: TradePlayer, weeks: number): string {
  const ecr = p.expert ? String(p.expert.ecrPosRank) : '—'
  const mkt = p.market ? fmtMarket(p.market.value) : '—'
  return `ROS ${ros(p)} · ECR ${ecr} · MKT ${mkt} · ${startsLabel(p, weeks)}`
}

/** Picker option text: "Justin Jefferson · MIN · ROS 128.0" (IR / TAXI tag when reserved). */
export function playerOption(p: TradePlayer): string {
  const parts = [p.fullName, p.team ?? '—']
  if (p.reserve) parts.push(p.reserve.toUpperCase())
  parts.push(`ROS ${ros(p)}`)
  return parts.join(' · ')
}

/** Lineup positions in order, then anything else under "—"; players keep their pool order. */
export function groupByPosition(players: TradePlayer[]): [string, TradePlayer[]][] {
  const groups = new Map<string, TradePlayer[]>()
  for (const p of players) {
    const key = p.position !== null && LINEUP_POSITIONS.includes(p.position) ? p.position : '—'
    groups.set(key, [...(groups.get(key) ?? []), p])
  }
  const order = [...LINEUP_POSITIONS, '—']
  return order.flatMap((pos) => {
    const list = groups.get(pos)
    return list ? [[pos, list] as [string, TradePlayer[]]] : []
  })
}

export function verdictBadges(ev: TradeEvaluation): { label: string; on: boolean }[] {
  return [
    { label: 'Win-win', on: ev.winWin },
    { label: 'Market-fair', on: ev.marketFair }
  ]
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run typecheck && npm run lint && npx vitest run tests/renderer/lib/tradeView.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/renderer/src/lib/tradeView.ts tests/fixtures/trade.ts tests/renderer/lib/tradeView.test.ts
git commit -m "feat(ui): trade view helpers"
```

---

### Task 7: Trade screen — builder and verdict card

**Files:**
- Create: `src/renderer/src/screens/TradeScreen.tsx`
- Modify: `src/renderer/src/components/Sidebar.tsx:1-28` (`Screen` union, nav item)
- Modify: `src/renderer/src/App.tsx` (import + render)
- Test: `tests/renderer/components/TradeScreen.test.tsx`

**Interfaces:**
- Consumes: `api.players.options`, `api.trade.pool`, `api.trade.evaluate` (Task 5); every Task 6 helper; `swapLine` (`@/lib/lineupView`); `PlayerDetailPanel`, `PositionBadge`, `Card*`, `Button`.
- Produces: `TradeScreen({ dataVersion }: { dataVersion: number })`; `Screen` gains `'trade'`.

- [ ] **Step 1: Write the failing tests**

Create `tests/renderer/components/TradeScreen.test.tsx`:

```tsx
// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { TradeScreen } from '@/screens/TradeScreen'
import { api } from '@/lib/api'
import type { PlayersOptions } from '@shared/types'
import { lineupPlayer } from '../../fixtures/lineup'
import { tradeEvaluation, tradePool, tradeSide, lar } from '../../fixtures/trade'

vi.mock('@/lib/api', () => ({
  api: {
    players: { options: vi.fn(), detail: vi.fn() },
    trade: { pool: vi.fn(), evaluate: vi.fn() }
  }
}))
const optionsMock = vi.mocked(api.players.options)
const poolMock = vi.mocked(api.trade.pool)
const evaluateMock = vi.mocked(api.trade.evaluate)

const options: PlayersOptions = {
  seasons: [2026],
  currentWeek: 3,
  lastScoredWeek: 2,
  tabs: [],
  projectionWeeks: []
}

beforeEach(() => {
  optionsMock.mockReset()
  poolMock.mockReset()
  evaluateMock.mockReset()
  optionsMock.mockResolvedValue(options)
  poolMock.mockResolvedValue(tradePool())
})
afterEach(cleanup)

describe('TradeScreen', () => {
  it('loads the pool, defaults the partner and builds a trade into a verdict', async () => {
    evaluateMock.mockResolvedValue(
      tradeEvaluation({
        me: tradeSide({
          drops: [lar],
          thisWeekSwaps: [
            {
              slot: 'WR',
              in: lineupPlayer({ playerId: '7564', fullName: "Ja'Marr Chase", position: 'WR' }),
              out: lineupPlayer({ playerId: '6794', fullName: 'Justin Jefferson', position: 'WR' }),
              delta: -4
            }
          ]
        })
      })
    )
    render(<TradeScreen dataVersion={0} />)
    expect(await screen.findByText('weeks 3–17 · 15 weeks')).toBeTruthy()
    expect(poolMock).toHaveBeenCalledWith(2026)
    expect((screen.getByLabelText('Partner') as HTMLSelectElement).value).toBe('2')
    expect(screen.getByText('Pick a partner, add players to both sides and evaluate.')).toBeTruthy()
    expect((screen.getByText('Evaluate') as HTMLButtonElement).disabled).toBe(true)

    fireEvent.change(screen.getByLabelText('Add to I give'), { target: { value: '6794' } })
    fireEvent.change(screen.getByLabelText('Add to I get'), { target: { value: '7564' } })
    expect(screen.getByText('Justin Jefferson')).toBeTruthy()
    expect(screen.getByText("Ja'Marr Chase")).toBeTruthy()
    expect(screen.getByText('ROS 128.0 · ECR — · MKT 10 512 · starts 15/15')).toBeTruthy()
    // a chosen player leaves its picker
    expect(
      [...(screen.getByLabelText('Add to I give') as HTMLSelectElement).options].map((o) => o.value)
    ).not.toContain('6794')

    fireEvent.click(screen.getByText('Evaluate'))
    expect(await screen.findByText('-19.00 (-1.27/wk)')).toBeTruthy()
    expect(evaluateMock).toHaveBeenCalledWith(2026, { rosterId: 2, give: ['6794'], get: ['7564'] })
    expect(screen.getByText('+19.00 (+1.27/wk)')).toBeTruthy()
    expect(screen.getByText('gives 10 512 → gets 8 000 (76 %)')).toBeTruthy()
    expect(screen.getByText('drop: Los Angeles Rams')).toBeTruthy()
    expect(screen.getByText('Win-win')).toBeTruthy()
    expect(screen.getByText('Market-fair')).toBeTruthy()
    expect(screen.getByText("Start Ja'Marr Chase over Justin Jefferson (WR, -4.00)")).toBeTruthy()

    // removing a player clears the verdict and disables Evaluate again
    fireEvent.click(screen.getByLabelText('Remove Justin Jefferson'))
    expect(screen.queryByText('-19.00 (-1.27/wk)')).toBeNull()
    expect((screen.getByText('Evaluate') as HTMLButtonElement).disabled).toBe(true)
  })

  it('shows the pool failure as the notice and an evaluate failure under the builder', async () => {
    poolMock.mockRejectedValue(new Error('No projections stored for this season'))
    render(<TradeScreen dataVersion={0} />)
    expect(await screen.findByText('No projections stored for this season')).toBeTruthy()
    expect(screen.queryByLabelText('Partner')).toBeNull()
    cleanup()

    poolMock.mockResolvedValue(tradePool())
    evaluateMock.mockRejectedValue(new Error("Invalid trade: 6794 is not on Cook Book's roster"))
    render(<TradeScreen dataVersion={0} />)
    await screen.findByLabelText('Partner')
    fireEvent.change(screen.getByLabelText('Add to I give'), { target: { value: '6794' } })
    fireEvent.change(screen.getByLabelText('Add to I get'), { target: { value: '7564' } })
    fireEvent.click(screen.getByText('Evaluate'))
    expect(await screen.findByText("Invalid trade: 6794 is not on Cook Book's roster")).toBeTruthy()
    // the sides survive the error
    expect(screen.getByText('Justin Jefferson')).toBeTruthy()
  })

  it('shows the deadline banner and keeps the builder usable', async () => {
    poolMock.mockResolvedValue(tradePool({ tradeDeadlinePassed: true }))
    render(<TradeScreen dataVersion={0} />)
    expect(await screen.findByText(/trade deadline has passed/)).toBeTruthy()
    expect(screen.getByLabelText('Partner')).toBeTruthy()
    await waitFor(() => expect(screen.getByLabelText('Add to I give')).toBeTruthy())
  })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/renderer/components/TradeScreen.test.tsx`
Expected: FAIL — cannot resolve `@/screens/TradeScreen`.

- [ ] **Step 3: Implement `src/renderer/src/screens/TradeScreen.tsx`**

```tsx
import { useEffect, useState } from 'react'
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
  deltaLine,
  deltaTone,
  dropLine,
  groupByPosition,
  marketLine,
  playerOption,
  playerStats,
  rangeLine,
  verdictBadges,
  windowLabel
} from '@/lib/tradeView'
import { cn } from '@/lib/utils'
import type {
  DetailTarget,
  TradeEvaluation,
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
        setPartner((p) => (pool.teams.some((t) => t.rosterId === p) ? p : (pool.teams[0]?.rosterId ?? null)))
        setGive((ids) => ids.filter((id) => pool.me.players.some((p) => p.playerId === id)))
        setGet((ids) =>
          ids.filter((id) => pool.teams.some((t) => t.players.some((p) => p.playerId === id)))
        )
        setVerdict(null)
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
          <div className="flex items-center gap-2 text-sm">
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
        </>
      )}

      <PlayerDetailPanel season={season ?? 0} player={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
```

- [ ] **Step 4: Register the screen**

`src/renderer/src/components/Sidebar.tsx` — import `ArrowLeftRight` from `lucide-react`, extend the union and the items:

```ts
export type Screen = 'setup' | 'league' | 'rules' | 'players' | 'lineup' | 'trade'
```

```ts
  { id: 'lineup', label: 'Lineup', icon: ClipboardList, enabled: (hasLeague) => hasLeague },
  { id: 'trade', label: 'Trade', icon: ArrowLeftRight, enabled: (hasLeague) => hasLeague },
  { id: 'setup', label: 'Setup', icon: Settings, enabled: () => true }
```

`src/renderer/src/App.tsx` — import `TradeScreen` from `@/screens/TradeScreen` and render it next to the Lineup line (line 84):

```tsx
          {screen === 'trade' && <TradeScreen dataVersion={dataVersion} />}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run typecheck && npm run lint && npm test`
Expected: PASS. If `react-hooks/set-state-in-effect` complains about the pool effect, every `set*` there is inside the `.then` callback — check nothing leaked into the effect body.

- [ ] **Step 6: Run the app and check by eye**

Run: `npm run dev` (WSLg; if no window shows, see the memory note on the WSLg fix), open **Trade**: the window label reads like `weeks N–17 · M weeks`, the partner defaults to the first team alphabetically, the pickers are grouped by position, a 1-for-1 shows a verdict with both deltas, the badges and this week's swaps; a 2-for-1 against a full roster shows `drop: …`. Stop the dev app by PID afterwards.

- [ ] **Step 7: Commit**

```bash
git add src/renderer/src/screens/TradeScreen.tsx src/renderer/src/components/Sidebar.tsx src/renderer/src/App.tsx tests/renderer/components/TradeScreen.test.tsx
git commit -m "feat(ui): Trade screen with builder and verdict"
```

---

### Task 8: Data reference, release `v0.13.0`

**Files:**
- Modify: `docs/reference/value-and-signals.md` (`ValueContext` table, `TeamStrength`, new Trade section, constants, module map)
- Modify: `package.json`, `package-lock.json` (via `npm version`)

- [ ] **Step 1: Document**

In `docs/reference/value-and-signals.md`:

1. `## ValueContext` table — add a row after `currentWeek`: `` `lastWeek` `` | the league's last fantasy week from the playoff settings (`lastFantasyWeek`, slice 6b spec §2.1): `playoffStartWeek + rounds − 1`, `rounds = ceil(log2(playoffTeams))`, `+1` for a two-week final, `×2` for two-week rounds, capped at 18; 18 without playoffs | never null.
2. `### TeamStrength` — change `Σ over currentWeek..18` to `Σ over currentWeek..lastWeek (the league window)`.
3. New section before `## Constants (single sources)`:

```markdown
## Trade (added in v0.13.0)

Slice 6b spec §2–§4; pure modules `src/main/trade/{enter,player,evaluate,pool}.ts` on the cached `LineupBuild`; channels `trade:pool` and `trade:evaluate`.

### Conventions

- **Window** = `currentWeek..lastWeek`; `weeks` = its length. Everything below is summed over it. Empty (error `NO_PROJECTIONS`) without stored projections; error `NO_ME` without a team flagged `is_me`.
- Traded players keep their IR / taxi slot (`TradePlayer.reserve`) — a received IR player contributes 0 until a sync changes it.

### `TradeEvaluation`

| Field | Meaning |
| --- | --- |
| `season`, `currentWeek`, `lastWeek`, `weeks` | The window. |
| `tradeDeadlinePassed` | `currentWeek > tradeDeadlineWeek` (Sleeper's `trade_deadline`, the last week trades are allowed). |
| `me`, `them` | `TradeSideResult` for each team. |
| `winWin` | Both `delta > 0`. |
| `marketFair` | Each side's `marketGet / marketGive ≥ 0.90` (`+∞` when it gives no valued player). |

### `TradeSideResult`

| Field | Meaning |
| --- | --- |
| `give`, `get` | `TradePlayer` rows; `starterWeeks` = window weeks the player starts for his current owner. |
| `drops` | Auto-picked when the after-roster exceeds the roster size (Sleeper `roster_positions` minus IR / TAXI): active players starting in the fewest weeks on the oversized roster, ties by lowest `rosPoints`, then name. |
| `before`, `after`, `delta`, `deltaPerWeek` | Σ optimal totals over the window on the current roster / on `roster − give + get − drops`; `delta / weeks`. |
| `thisWeekDelta`, `thisWeekSwaps` | The current week alone; swaps as on the Lineup screen. |
| `marketGive`, `marketGet`, `unvaluedGive`, `unvaluedGet` | Σ FantasyCalc `market.value` per list; a player outside FantasyCalc's list counts 0 and is counted as unvalued. |
| `weeksChanged` | Window weeks whose optimal total moves by ≥ 0.01. |

Week skip (spec §2.3, exact): a week is not re-solved when no removed player (given or dropped) starts that week and no received player passes `canEnter` — a slot reachable from his position through the flex chain is empty or holds a starter worth less.

### `TradePool`

`me` and `teams` (every other team, alphabetical) with `TradePlayer` rows ordered by lineup position (`QB RB WR TE K DEF`, others last), then `rosPoints` desc, then name.

### Where it is shown (v0.13.0) — Trade screen

1. **Header** — `weeks {currentWeek}–{lastWeek} · {weeks} weeks`; amber banner when `tradeDeadlinePassed` (nothing disabled).
2. **Builder** — Partner select (defaults to the first team); *I give* / *I get* cards with the chosen rows (`ROS {rosPoints} · ECR {ecrPosRank} · MKT {market.value} · starts {starterWeeks}/{weeks}`, `IR` / `TAXI` tag, name opens `PlayerDetailPanel`) and a picker grouped by position (`{name} · {team} · [IR|TAXI ·] ROS {rosPoints}`). Changing the partner clears *I get* and the verdict; changing a side clears the verdict.
3. **Verdict** — per side `{fmtSigned(delta)} ({fmtSigned(deltaPerWeek)}/wk)` (green / red / muted), `{before} → {after} · this week {thisWeekDelta} · {weeksChanged} weeks change`, `drop: …` (amber) when present, `gives {marketGive} → gets {marketGet} ({ratio %|∞|—})[ · n unvalued]`; badges **Win-win** / **Market-fair** (muted when false); **This week** = my `thisWeekSwaps` as `Start A over B (SLOT, ±Δ)` or "Your lineup this week does not change."
4. Pool errors (`NO_PROJECTIONS`, `NO_ME`) replace the screen with their message; evaluate errors (`INVALID_TRADE`) show under the Evaluate button and keep the sides.
```

4. `## Constants (single sources)` — add `src/main/trade/evaluate.ts` | `MARKET_FAIR = 0.90`, `CHANGED_PTS = 0.01` and `src/shared/rules.ts` | `LAST_NFL_WEEK = 18` (`lastFantasyWeek`).
5. `## Module map` — add `src/main/trade/enter.ts` (reachable-slot closure, `canEnter`), `src/main/trade/player.ts` (`TradePlayer` rows, `starterWeeks`), `src/main/trade/evaluate.ts` (`evaluateTrade`, `TradeError`, drops, market sums, week skip), `src/main/trade/pool.ts` (`tradePool`), `src/renderer/src/lib/tradeView.ts` (verdict / picker strings), `src/renderer/src/screens/TradeScreen.tsx`.

- [ ] **Step 2: Verify and commit the docs**

Run: `npx prettier --check docs/reference/value-and-signals.md` (run `npm run format` if it complains).

```bash
git add docs/reference/value-and-signals.md
git commit -m "docs: document the trade evaluator payload and screen"
```

- [ ] **Step 3: Final verification, real-data check**

Run: `npm run typecheck && npm run lint && npm test` — all green. Then on the dev DB (`~/.config/FantasyCompanion/companion.db`, copy it first) a throwaway `tests/zz-trade.test.ts` that opens the copy, builds the lineup inputs for the real league (as `cachedLineup` does), calls `tradePool` and `evaluateTrade` for a real 1-for-1 and a 2-for-1, and prints `me.delta`, `them.delta`, `drops`, `weeksChanged`; sanity-check the magnitudes against the League screen's ROS totals, then delete the file (never commit it).

- [ ] **Step 4: Merge and release**

```bash
git checkout main && git merge --no-ff feat/trade-evaluator -m "merge: feat/trade-evaluator (plan L)"
npm version minor -m "build: bump version to %s"
```

Expected: `package.json` at `0.13.0`, tag `v0.13.0`. Pushing (`git push --follow-tags`) triggers the Windows release workflow into a **draft** release — that is the user's call, as in earlier plans; then mark the plan complete in a `docs(plan): mark plan L complete` commit.
