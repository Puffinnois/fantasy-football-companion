# Plan P — Streaming and the trade builder's open spot (slice 6c, phase 2)

**Status:** not started.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A _Streaming_ mode on the Waivers screen — for a picked week (the current one up to 3 ahead) the free agents whose one-week pickup beats my lineup net of what the release would have scored the rest of the way, each with every release option — and an _Open spot_ info line under each side of the trade builder's verdict when the trade leaves that side a free roster spot; ship `v0.17.0`.

**Architecture:** Both features reuse Plan O's exact add search in `src/main/waiver/search.ts`. It gains two seams: `releaseSolves` (spec §2.3 steps 2–3 without the scoring, so streaming can score the same solves by `net`) and `searchContext` (the context for _any_ roster, so the trade builder can search a side's after-roster). Streaming is `src/main/waiver/stream.ts` (a one-week slice of my context, rest costs from the context's per-release "without him" lineups); the open spot is `src/main/trade/openSpot.ts` (the after-roster rebuilt from `evaluateTrade`'s own result, release fixed to `open`). Both run in the engine worker behind two new channels, `waiver:stream` and `trade:openSpot`. The renderer adds a `StreamCard` and a mode switch to `WaiverScreen.tsx` and one line to the Trade screen's `SideVerdict`.

**Tech Stack:** unchanged — Electron 39, React 19, TypeScript strict, Tailwind 4 + shadcn, Vitest (jsdom + Testing Library for component tests), `node:sqlite`, lucide-react.

**Spec:** `docs/superpowers/specs/2026-09-23-slice6c-waivers-design.md` — §4 (streaming), §6 (types, IPC, worker kinds `waiverStream` / `openSpot`), §7 (open spot), §8 (the _Streaming_ half of the screen), §9 (empty states), §10 (tests), §12 (Plan P = `v0.17.0`). Plan O (`docs/superpowers/plans/2026-09-23-plan-o-waiver-adds.md`) shipped everything else of the spec.

## Global Constraints

- Same as Plans C–O: Node ≥ 22.13 (`source ~/.nvm/nvm.sh && nvm use` if `node --version` is not 22.x), no Electron imports outside `src/main/index.ts`, `src/main/ipc/`, `src/preload/`. Path aliases: `@main/*`, `@shared/*`, `@/*` (renderer). Tests import fixtures relatively (`../../fixtures/...`).
- **Payload conventions** (`docs/reference/value-and-signals.md`): `null` = not computable; points rounded with `round2`, shown with 2 decimals (`fmtPoints`), signed with `fmtSigned`, `—` for null.
- **Window** (spec §2.1): `currentWeek..lastWeek` from `windowWeeks(build)`; `requireWindow` throws `TradeError('NO_PROJECTIONS')`, `myTeam` throws `TradeError('NO_ME')` — both from `@main/trade/evaluate`.
- **Streaming** (spec §4): target week `t ∈ currentWeek..min(currentWeek + 3, lastWeek)`; candidates = free agents who can enter my week-`t` lineup and whose week-`t` game is not played yet; per release `weekGain = total(mine + a − r, t) − total(mine, t)`, `restCost = Σ_{w ∈ window, w ≠ t} (total(mine, w) − total(mine − r, w))` (0 for `open`), `net = weekGain − restCost`; options by `net` desc then Plan O's release tie order (`compareReleases`); rows with best `net ≥ STREAM_MIN_NET = 0.5`, sorted by `net` desc, `weekGain` desc, name; **all** passing rows are returned (the UI shows `STREAM_SHOWN = 30` of the current chip).
- **Open spot** (spec §7): per side, only when its after-roster (after 6b's auto-drops) has fewer active players (roster slot not `ir` / `taxi`) than a _known_ `rosterSize`; search = Plan O's §2.3 with the release fixed to `open`, baseline the after-roster's window total; the best add must reach `LINEUP_MIN_DELTA = 0.5` over the window. The verdict's headline Δ, flags and the suggestion search are unchanged.
- **Budget** (spec §10, `npm run test:budget`): one streaming week ≤ 1 s, open spot ≤ 1 s, on 16 teams × 16 players + 550 free agents.
- Verification before every commit: `npm run typecheck && npm run lint && npm test`; run `npm run format` when Prettier complains. Conventional Commits, summary ≤ 50 chars, imperative, **no trailers** (no `Co-Authored-By`, no "Generated with").
- ESLint is strict: explicit return types on every named function and component, `react-hooks/set-state-in-effect` is an error (state is set only in promise callbacks / event handlers), no unused vars / imports.
- Decisions locked in here (not in the spec):
  - **`waiver:stream` returns `StreamRow[]`** as the spec says. The picker's weeks come from `streamWeeks(currentWeek, lastWeek)` (new, `@shared/rules`) on the rest-of-season payload, so the Streaming card appears once `waiver:adds` has answered — the same `NO_PROJECTIONS` / `NO_ME` errors would stop both anyway. A week outside the picker throws `Streaming covers weeks X–Y`.
  - **Opponent:** `vs X` at home / `@ X` away from the week's regular-season games (`weekOpponents`, Sleeper codes); the series' bare opponent code when the schedule lacks the game (projection fallback).
  - **Rest cost is shown negative** (`fmtSigned(-restCost)`) so _week gain + rest cost = net_ reads left to right.
  - **`OpenSpot.add` is nullable:** a side with an open spot but no free agent reaching `LINEUP_MIN_DELTA` shows _Open spot: no free agent improves this lineup_ — the freed spot is still worth knowing about. `null` for the whole side means no open spot.
  - **The after-roster is rebuilt from `evaluateTrade`'s own result** (`give` / `get` / `drops` of that side), so the line always describes the roster the verdict above it scored.
  - **Open spot needs a known roster size** (unlike `releaseCandidates`, which treats an unknown size as open): without Sleeper's `roster_positions` there is no line.
  - **Streaming fetch rule:** nothing is fetched until the first switch to _Streaming_; from then on, changing the week or a sync (`dataVersion`) refetches, switching modes does not. The previous result stays visible under _Refreshing…_.
  - **The open-spot call** fires for every verdict (Evaluate or _Open in builder_), keyed to that verdict object so an answer for an older verdict never shows; a failure shows no line (it is an info line).

---

### Task 0: Branch

**Files:** none.

- [ ] **Step 1: Create the branch from an up-to-date main**

```bash
git checkout main && git status --short && git checkout -b feat/waiver-streaming
```

Expected: clean tree, on `feat/waiver-streaming`.

---

### Task 1: Streaming engine

**Files:**

- Modify: `src/shared/types.ts` (after `StashRow`)
- Modify: `src/shared/rules.ts` (append)
- Modify: `src/main/waiver/search.ts` (split `scoreAdd`)
- Create: `src/main/waiver/stream.ts`
- Modify: `tests/fixtures/synthetic.ts` (`points` on `SyntheticPlayer`)
- Test: `tests/main/waiver/stream.test.ts`, `tests/shared/rules.test.ts`

**Interfaces:**

- Consumes: `waiverContext(build, ir)`, `WaiverContext`, `canHelp(ctx, add)`, `freeAgents(build)`, `SearchOptions` (`src/main/waiver/search.ts`); `applyRelease`, `compareReleases`, `IrSettings`, `ReleaseCandidate` (`src/main/waiver/release.ts`); `rosterWeek`, `TeamWeek`, `LineupBuild` (`@main/lineup/build`); `tradePlayer` (`@main/trade/player`); `round2` (`@main/db/repos/points`); `GameRow` (`@main/db/repos/stats`); `toSleeperTeam` (`@shared/teams`).
- Produces:
  - `@shared/types`: `StreamOption { release: WaiverRelease; releasePlayer: TradePlayer | null; weekGain: number; restCost: number; net: number }`, `StreamRow { player: TradePlayer; opponent: string | null; options: StreamOption[] }`.
  - `@shared/rules`: `STREAM_WEEKS_AHEAD = 3`, `streamWeeks(currentWeek: number, lastWeek: number): number[]`.
  - `search.ts`: `ReleaseSolve { r: ReleaseCandidate; after: TeamWeek[] }`, `releaseSolves(ctx, add, opts?): ReleaseSolve[]`, `releasePlayer(ctx, r): TradePlayer | null`.
  - `stream.ts`: `STREAM_MIN_NET = 0.5`, `StreamExtras { settings: IrSettings; opponents: Map<string, string> }`, `weekOpponents(games: GameRow[], week: number): Map<string, string>`, `streamRows(ctx: WaiverContext, week: number, opponents: Map<string, string>, opts?: SearchOptions): StreamRow[]`, `waiverStream(build: LineupBuild, week: number, extras: StreamExtras): StreamRow[]`.
  - Fixture: `SyntheticPlayer.points?: number` — points already scored in the league's current week.

The hand-computed numbers below come from `WAIVER_LEAGUE` (doc comment in `tests/fixtures/synthetic.ts`): my lineup is 42 a week (RB A20 · WR B10 · FLEX C12), D never starts; window 16–17, so the picker is weeks 16–17. Without each release my lineup scores A → 27, C → 35, B → 37, D → 42 a week, so the rest cost for the _other_ window week is A 15, C 7, B 5, D 0.

- [ ] **Step 1: Write the failing `streamWeeks` test**

In `tests/shared/rules.test.ts`, add `streamWeeks` to the `@shared/rules` import and append:

```ts
describe('streamWeeks (slice 6c spec §4)', () => {
  it('reaches three weeks past the current one, never past the window', () => {
    expect(streamWeeks(3, 17)).toEqual([3, 4, 5, 6])
    expect(streamWeeks(16, 17)).toEqual([16, 17])
    expect(streamWeeks(18, 17)).toEqual([])
  })
})
```

- [ ] **Step 2: Write the failing streaming tests**

Create `tests/main/waiver/stream.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { GameRow } from '@main/db/repos/stats'
import type { IrSettings } from '@main/waiver/release'
import { waiverContext, type WaiverContext } from '@main/waiver/search'
import { streamRows, waiverStream, weekOpponents } from '@main/waiver/stream'
import type { StreamOption, StreamRow } from '@shared/types'
import { SEASON } from '../../fixtures/season'
import {
  syntheticBuild,
  WAIVER_LEAGUE,
  waiverLeagueWith,
  type SyntheticLeague
} from '../../fixtures/synthetic'

const A = { id: 'A', position: 'RB', weekly: 20, market: 5000 }
const C = { id: 'C', position: 'RB', weekly: 12, market: 2000 }
const B = { id: 'B', position: 'WR', weekly: 10, market: 1500 }

function ctxOf(league: SyntheticLeague, ir: IrSettings = {}): WaiverContext {
  return waiverContext(syntheticBuild(league).build, ir)
}
const summary = (options: StreamOption[]): [string, number, number, number][] =>
  options.map((o) => [
    o.release.kind === 'open' ? 'open' : `${o.release.kind} ${o.release.playerId}`,
    o.weekGain,
    o.restCost,
    o.net
  ])
const ids = (rows: StreamRow[]): string[] => rows.map((r) => r.player.playerId)
function game(week: number, homeTeam: string, awayTeam: string): GameRow {
  return {
    gameId: `${SEASON}_${week}_${awayTeam}_${homeTeam}`,
    season: SEASON,
    week,
    gameType: 'REG',
    gameday: null,
    gametime: null,
    homeTeam,
    awayTeam,
    homeScore: null,
    awayScore: null
  }
}

describe('streaming (slice 6c spec §4)', () => {
  it('nets the week gain against what each release costs in the other window weeks', () => {
    const rows = streamRows(ctxOf(WAIVER_LEAGUE), 16, new Map())
    // Y (3 in week 16) can't start; Z, K, W, Q never can.
    expect(ids(rows)).toEqual(['X'])
    expect(summary(rows[0].options)).toEqual([
      ['drop D', 1, 0, 1],
      ['drop B', 1, 5, -4],
      ['drop C', -1, 7, -8],
      ['drop A', -9, 15, -24]
    ])
    expect(rows[0].options[0].releasePlayer).toMatchObject({ playerId: 'D', starterWeeks: 0 })
    expect(rows[0].options[3].releasePlayer).toMatchObject({ playerId: 'A', starterWeeks: 2 })
    expect(rows[0].player).toMatchObject({ playerId: 'X', starterWeeks: 0 })
    // No schedule in the fixture: the projection's bare opponent code.
    expect(rows[0].opponent).toBe('OPP')
  })

  it('ranks a later week by net', () => {
    const rows = streamRows(ctxOf(WAIVER_LEAGUE), 17, new Map())
    expect(ids(rows)).toEqual(['Y', 'X'])
    expect(summary(rows[0].options)).toEqual([
      ['drop D', 13, 0, 13],
      ['drop C', 13, 7, 6],
      ['drop B', 8, 5, 3],
      ['drop A', 5, 15, -10]
    ])
  })

  it('offers only the open spot, at no rest cost, when my roster has room', () => {
    const rows = streamRows(ctxOf(waiverLeagueWith([A, C, B])), 16, new Map())
    expect(ids(rows)).toEqual(['X'])
    expect(summary(rows[0].options)).toEqual([['open', 1, 0, 1]])
  })

  it('puts an IR move ahead of dropping the same injured player, from the league settings', () => {
    const league = waiverLeagueWith([
      A,
      C,
      B,
      { id: 'D', position: 'WR', weekly: 5, market: 300, injuryStatus: 'Out' }
    ])
    const rows = waiverStream(syntheticBuild(league).build, 16, {
      settings: { irSlots: 1, irStatuses: ['IR', 'Out'] },
      opponents: new Map()
    })
    expect(summary(rows[0].options)).toEqual([
      ['ir D', 1, 0, 1],
      ['drop D', 1, 0, 1],
      ['drop B', 1, 5, -4],
      ['drop C', -1, 7, -8],
      ['drop A', -9, 15, -24]
    ])
  })

  it('skips a streamer whose game that week is already played', () => {
    const league: SyntheticLeague = {
      ...WAIVER_LEAGUE,
      freeAgents: WAIVER_LEAGUE.freeAgents?.map((p) => (p.id === 'X' ? { ...p, points: 11 } : p))
    }
    const ctx = ctxOf(league)
    expect(ids(streamRows(ctx, 16, new Map()))).toEqual([])
    expect(ids(streamRows(ctx, 17, new Map()))).toEqual(['Y', 'X'])
  })

  it('lists nobody below the net threshold', () => {
    const league = { ...WAIVER_LEAGUE, freeAgents: [{ id: 'X', position: 'WR', weekly: 10.3 }] }
    expect(streamRows(ctxOf(league), 16, new Map())).toEqual([])
  })

  it('labels home and away opponents from the week’s games', () => {
    const labels = weekOpponents([game(16, 'KC', 'LA'), game(17, 'CAR', 'KC')], 16)
    expect([...labels]).toEqual([
      ['KC', 'vs LAR'],
      ['LAR', '@ KC']
    ])
    expect(streamRows(ctxOf(WAIVER_LEAGUE), 16, labels)[0].opponent).toBe('vs LAR')
  })

  it('rejects a week outside the picker', () => {
    const ctx = ctxOf(WAIVER_LEAGUE)
    expect(() => streamRows(ctx, 18, new Map())).toThrow('Streaming covers weeks 16–17')
    expect(() => streamRows(ctx, 15, new Map())).toThrow('Streaming covers weeks 16–17')
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npx vitest run tests/main/waiver/stream.test.ts tests/shared/rules.test.ts`
Expected: FAIL — `Cannot find module '@main/waiver/stream'` / `streamWeeks is not a function`.

- [ ] **Step 4: Add the shared types and `streamWeeks`**

In `src/shared/types.ts`, directly after the `StashRow` interface:

```ts
/** Spec §4: one way to make room for a one-week streamer. */
export interface StreamOption {
  release: WaiverRelease
  /** The player moved to IR or dropped; null for an open spot. */
  releasePlayer: TradePlayer | null
  /** My week-t total with the streamer and without the release − my week-t total now. */
  weekGain: number
  /** What the release would have added in the window's other weeks; 0 for an open spot. */
  restCost: number
  /** weekGain − restCost: the headline. */
  net: number
}

/** Spec §4: a streamer for the chosen week; options best first, never empty. */
export interface StreamRow {
  player: TradePlayer
  /** "vs CAR" at home, "@ CAR" away; the bare code when the schedule lacks the game; null on a bye. */
  opponent: string | null
  options: StreamOption[]
}
```

Append to `src/shared/rules.ts`:

```ts
/** Slice 6c spec §4: how many weeks past the current one the streaming picker reaches. */
export const STREAM_WEEKS_AHEAD = 3

/** Spec §4: the weeks a streamer can be picked for — the current week up to 3 ahead, never past the window. */
export function streamWeeks(currentWeek: number, lastWeek: number): number[] {
  const weeks: number[] = []
  const last = Math.min(currentWeek + STREAM_WEEKS_AHEAD, lastWeek)
  for (let w = currentWeek; w <= last; w++) weeks.push(w)
  return weeks
}
```

- [ ] **Step 5: Let the synthetic league score a played game**

In `tests/fixtures/synthetic.ts`:

1. Add the import (keep the imports sorted as they are, by module path): `import { replacePoints } from '@main/db/repos/points'`.
2. In `SyntheticPlayer`, after `rank?`:

```ts
  /** Points already scored in the league's current week — his game that week is played. */
  points?: number
```

3. In `syntheticBuild`, directly after the `league.weeks.forEach(...)` projections block:

```ts
const scored = players.filter((p) => typeof p.points === 'number')
replacePoints(
  db,
  'L1',
  scored.map((p) => ({
    playerId: p.id,
    season: SEASON,
    week: league.currentWeek,
    points: p.points as number
  })),
  SEED_TS
)
```

- [ ] **Step 6: Split `scoreAdd` into `releaseSolves` + scoring**

In `src/main/waiver/search.ts`:

1. Change the types import to `import type { AddOption, AddRow, TradePlayer } from '@shared/types'`.
2. Replace the whole `scoreAdd` function with:

```ts
/** One release's lineup per context week after adding the free agent. */
export interface ReleaseSolve {
  r: ReleaseCandidate
  after: TeamWeek[]
}

/** The row a release's player shows: his window starts on my roster before the move. */
export function releasePlayer(ctx: WaiverContext, r: ReleaseCandidate): TradePlayer | null {
  return r.series
    ? tradePlayer(ctx.build, r.series, ctx.starts.get(r.series.base.playerId) ?? 0)
    : null
}

/** Spec §2.3 steps 2–3: my lineup in each context week after adding `add` with each release, in `ctx.releases` order. */
export function releaseSolves(
  ctx: WaiverContext,
  add: PlayerSeries,
  opts: SearchOptions = {}
): ReleaseSolve[] {
  const { build, weeks, roster, base } = ctx
  const skip = opts.skip !== false
  const withAdd = [...roster, add]
  // Step 2: the oversized roster; where he can't enter, my lineup is already its optimum.
  const oversized = weeks.map((w, i) =>
    skip && !enters(ctx, add, base[i], w) ? base[i] : rosterWeek(build, withAdd, w)
  )
  // Step 3: an IR move and a drop of the same player leave the same lineup — solve him once.
  const solved = new Map<string, TeamWeek[]>()
  const afterWeeks = (r: ReleaseCandidate): TeamWeek[] => {
    const leaving = r.series
    if (leaving === null) return oversized
    const pid = leaving.base.playerId
    const hit = solved.get(pid)
    if (hit) return hit
    const rest = applyRelease(withAdd, r)
    const without = ctx.without.get(pid) ?? []
    const result = weeks.map((w, i) => {
      if (!skip) return rosterWeek(build, rest, w)
      // A player the oversized optimum doesn't start can leave without changing it.
      if (!isStarter(oversized[i], pid)) return oversized[i]
      // If the add can't enter my lineup without him either, that lineup is the optimum.
      if (!enters(ctx, add, without[i], w)) return without[i]
      return rosterWeek(build, rest, w)
    })
    solved.set(pid, result)
    return result
  }
  return ctx.releases.map((r) => ({ r, after: afterWeeks(r) }))
}

/** Spec §2.3 steps 2–4: every release option for adding `add`, scored, best first. */
export function scoreAdd(
  ctx: WaiverContext,
  add: PlayerSeries,
  opts: SearchOptions = {}
): AddOption[] {
  const { build, weeks, base } = ctx
  const id = add.base.playerId
  const scored = releaseSolves(ctx, add, opts).map(({ r, after }) => {
    const delta = round2(sum(after.map((x) => x.optimalTotal)) - ctx.before) ?? 0
    const option: AddOption = {
      release: r.release,
      releasePlayer: releasePlayer(ctx, r),
      delta,
      deltaPerWeek: round2(delta / weeks.length) ?? 0,
      thisWeekDelta: round2(after[0].optimalTotal - base[0].optimalTotal) ?? 0,
      startWeeks: weeks.filter((_, i) => isStarter(after[i], id))
    }
    return { r, option }
  })
  scored.sort((a, b) => b.option.delta - a.option.delta || compareReleases(build, a.r, b.r))
  return scored.map((x) => x.option)
}
```

Run: `npx vitest run tests/main/waiver`
Expected: the existing search / property / stash tests still PASS (pure refactor); `stream.test.ts` still fails on the missing module.

- [ ] **Step 7: Write `stream.ts`**

Create `src/main/waiver/stream.ts`:

```ts
import { round2 } from '@main/db/repos/points'
import type { GameRow } from '@main/db/repos/stats'
import { rosterWeek, type LineupBuild, type TeamWeek } from '@main/lineup/build'
import { tradePlayer } from '@main/trade/player'
import type { PlayerSeries } from '@main/value/series'
import { streamWeeks } from '@shared/rules'
import { toSleeperTeam } from '@shared/teams'
import type { StreamOption, StreamRow } from '@shared/types'
import { applyRelease, compareReleases, type IrSettings, type ReleaseCandidate } from './release'
import {
  canHelp,
  freeAgents,
  releasePlayer,
  releaseSolves,
  waiverContext,
  type SearchOptions,
  type WaiverContext
} from './search'

/** Slice 6c spec §4: a streamer must net at least this much in his week to be listed. */
export const STREAM_MIN_NET = 0.5

export interface StreamExtras {
  settings: IrSettings
  /** Sleeper team → "vs CAR" / "@ CAR" in the target week (`weekOpponents`). */
  opponents: Map<string, string>
}

/** Spec §4: each team's opponent in `week` — "vs X" at home, "@ X" away — in Sleeper codes. */
export function weekOpponents(games: GameRow[], week: number): Map<string, string> {
  const out = new Map<string, string>()
  for (const g of games) {
    if (g.week !== week) continue
    const home = toSleeperTeam(g.homeTeam)
    const away = toSleeperTeam(g.awayTeam)
    out.set(home, `vs ${away}`)
    out.set(away, `@ ${home}`)
  }
  return out
}

/** The context narrowed to window week index `i`: the add solves then cover that week alone. */
function weekContext(ctx: WaiverContext, i: number): WaiverContext {
  const without = new Map<string, TeamWeek[]>()
  for (const [id, weeks] of ctx.without) without.set(id, [weeks[i]])
  return {
    ...ctx,
    weeks: [ctx.weeks[i]],
    base: [ctx.base[i]],
    before: ctx.base[i].optimalTotal,
    without
  }
}

/** Spec §4: what each release costs me over the window's other weeks — the same for every streamer. */
function restCosts(
  ctx: WaiverContext,
  week: number,
  opts: SearchOptions
): Map<ReleaseCandidate, number> {
  const costs = new Map<ReleaseCandidate, number>()
  for (const r of ctx.releases) {
    if (r.series === null) {
      costs.set(r, 0)
      continue
    }
    // The context already holds my lineup without him (unsolved where he doesn't start);
    // the tests' brute force solves every week instead.
    const rest = opts.skip === false ? applyRelease(ctx.roster, r) : null
    const without = ctx.without.get(r.series.base.playerId) ?? []
    let cost = 0
    ctx.weeks.forEach((w, j) => {
      if (w === week) return
      const after = rest ? rosterWeek(ctx.build, rest, w) : without[j]
      cost += ctx.base[j].optimalTotal - after.optimalTotal
    })
    costs.set(r, round2(cost) ?? 0)
  }
  return costs
}

function played(s: PlayerSeries, week: number): boolean {
  return s.weeks.find((w) => w.week === week)?.played ?? false
}

function opponentOf(s: PlayerSeries, week: number, opponents: Map<string, string>): string | null {
  const labelled = s.base.team !== null ? opponents.get(s.base.team) : undefined
  return labelled ?? s.weeks.find((w) => w.week === week)?.opponent ?? null
}

/** Spec §4: one-week pickups for `week`, each release netted against its cost over the rest of the window. */
export function streamRows(
  ctx: WaiverContext,
  week: number,
  opponents: Map<string, string>,
  opts: SearchOptions = {}
): StreamRow[] {
  const { currentWeek, lastWeek } = ctx.build.inputs.value.context
  const allowed = streamWeeks(currentWeek, lastWeek)
  const i = ctx.weeks.indexOf(week)
  if (i < 0 || !allowed.includes(week)) {
    throw new Error(`Streaming covers weeks ${allowed[0]}–${allowed[allowed.length - 1]}`)
  }
  const one = weekContext(ctx, i)
  const costs = restCosts(ctx, week, opts)
  const rows: StreamRow[] = []
  for (const add of freeAgents(ctx.build)) {
    if (played(add, week)) continue
    // Can't enter my week-t lineup: no release raises the week, and every release costs ≥ 0.
    if (opts.skip !== false && !canHelp(one, add)) continue
    const options = releaseSolves(one, add, opts)
      .map(({ r, after }) => {
        const weekGain = round2(after[0].optimalTotal - one.before) ?? 0
        const restCost = costs.get(r) ?? 0
        const option: StreamOption = {
          release: r.release,
          releasePlayer: releasePlayer(ctx, r),
          weekGain,
          restCost,
          net: round2(weekGain - restCost) ?? 0
        }
        return { r, option }
      })
      .sort((a, b) => b.option.net - a.option.net || compareReleases(ctx.build, a.r, b.r))
      .map((x) => x.option)
    if (options[0].net < STREAM_MIN_NET) continue
    rows.push({
      player: tradePlayer(ctx.build, add, 0),
      opponent: opponentOf(add, week, opponents),
      options
    })
  }
  return rows.sort(
    (a, b) =>
      b.options[0].net - a.options[0].net ||
      b.options[0].weekGain - a.options[0].weekGain ||
      a.player.fullName.localeCompare(b.player.fullName)
  )
}

/** Spec §4 / §6: the Waivers screen's streaming list for `week`. */
export function waiverStream(build: LineupBuild, week: number, extras: StreamExtras): StreamRow[] {
  return streamRows(waiverContext(build, extras.settings), week, extras.opponents)
}
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npx vitest run tests/main/waiver tests/shared/rules.test.ts`
Expected: PASS (all waiver files, including the unchanged Plan O tests).

- [ ] **Step 9: Verify and commit**

```bash
npm run typecheck && npm run lint && npm test
git add src/shared/types.ts src/shared/rules.ts src/main/waiver/search.ts src/main/waiver/stream.ts tests/fixtures/synthetic.ts tests/main/waiver/stream.test.ts tests/shared/rules.test.ts
git commit -m "feat(waiver): add streaming search"
```

---

### Task 2: Streaming exactness and budget

**Files:**

- Create: `tests/main/waiver/streamProperty.test.ts`
- Modify: `tests/main/waiver/waiverBudget.test.ts`

**Interfaces:**

- Consumes: `streamRows(ctx, week, opponents, { skip: false })` (Task 1) — the brute force: every free agent (played games still excluded), every release, every week solved; `waiverStream(build, week, extras)`; `streamWeeks` (`@shared/rules`); `generateLeague(seed, teamCount, freeAgents)`, `syntheticBuild` (`tests/fixtures/synthetic.ts`).
- Produces: nothing new.

- [ ] **Step 1: Write the property test**

Create `tests/main/waiver/streamProperty.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { waiverContext } from '@main/waiver/search'
import { streamRows } from '@main/waiver/stream'
import { streamWeeks } from '@shared/rules'
import type { StreamRow } from '@shared/types'
import { generateLeague, syntheticBuild } from '../../fixtures/synthetic'

/** Releases and numbers only: tied optima may start a different player, which changes no number. */
const numbers = (rows: StreamRow[]): object[] =>
  rows.map((r) => ({
    id: r.player.playerId,
    options: r.options.map((o) => ({
      release: o.release,
      weekGain: o.weekGain,
      restCost: o.restCost,
      net: o.net
    }))
  }))

describe('streaming shortcuts are exact (slice 6c spec §10)', () => {
  it.each([1, 2, 3])('seed %i: every pickable week equals brute force', (seed) => {
    const league = generateLeague(seed, 2, 40)
    // One injured player so IR moves are part of the comparison.
    league.teams[0].players[3] = { ...league.teams[0].players[3], injuryStatus: 'Out' }
    const ctx = waiverContext(syntheticBuild(league).build, {
      irSlots: 1,
      irStatuses: ['IR', 'Out']
    })
    const { currentWeek, lastWeek } = ctx.build.inputs.value.context
    let listed = 0
    for (const week of streamWeeks(currentWeek, lastWeek)) {
      const fast = streamRows(ctx, week, new Map())
      expect(numbers(fast)).toEqual(numbers(streamRows(ctx, week, new Map(), { skip: false })))
      listed += fast.length
    }
    // Not vacuous: some streamer beats the lineup in some week.
    expect(listed).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run it**

Run: `npx vitest run tests/main/waiver/streamProperty.test.ts`
Expected: PASS for the three seeds. If `listed` is 0 for a seed, the generated free agents are too weak for that seed — pick the next seed that lists someone rather than weakening the assertion. Any mismatch in the numbers is a real bug in a shortcut (`canHelp` skip, the non-starter reuse, the "can't enter without him" reuse, or the rest costs from `ctx.without`): fix the engine, never the test.

- [ ] **Step 3: Add the streaming budget**

In `tests/main/waiver/waiverBudget.test.ts`: add `import { waiverStream } from '@main/waiver/stream'`, a constant under `ADDS_MS`:

```ts
/** Spec §10: one streaming week. */
const STREAM_MS = 1000
```

and a second case inside the `describe.skipIf(...)` block:

```ts
it('lists one streaming week inside 1 s', () => {
  const { build } = syntheticBuild(generateLeague(7, 16, 550))
  const t0 = performance.now()
  const rows = waiverStream(build, 3, { settings: {}, opponents: new Map() })
  const ms = performance.now() - t0
  console.info(`waiver stream ${ms.toFixed(0)} ms · ${rows.length} rows`)
  expect(ms).toBeLessThan(STREAM_MS)
})
```

- [ ] **Step 4: Run the budget**

Run: `npm run test:budget`
Expected: PASS, the log line shows the streaming time (expected a few hundred ms: the context is the same as the rest-of-season one, and each free agent solves one week). If it is over 1 s, profile before optimising; do not raise the limit without asking the user.

- [ ] **Step 5: Verify and commit**

```bash
npm run typecheck && npm run lint && npm test
git add tests/main/waiver/streamProperty.test.ts tests/main/waiver/waiverBudget.test.ts
git commit -m "test(waiver): check streaming against brute force"
```

---

### Task 3: Open-spot engine

**Files:**

- Modify: `src/main/waiver/release.ts` (`activePlayers`, `OPEN_RELEASE`)
- Modify: `src/main/waiver/search.ts` (`searchContext`)
- Modify: `src/shared/types.ts` (`OpenSpot`, `TradeOpenSpots`)
- Create: `src/main/trade/openSpot.ts`
- Test: `tests/main/trade/openSpot.test.ts`, `tests/main/trade/openSpotBudget.test.ts`

**Interfaces:**

- Consumes: `evaluateTrade(build, proposal)`, `requireWindow`, `rosterSize` (`@main/trade/evaluate`); `TradeSideResult` (`give`, `get`, `drops`: `TradePlayer[]`, `rosterId`); `scoreFreeAgents(ctx)`, `lineupRows(ctx, scored, max)`, `WaiverContext` (`@main/waiver/search`); `rosterWeek` (`@main/lineup/build`).
- Produces:
  - `release.ts`: `activePlayers(roster: PlayerSeries[]): PlayerSeries[]`, `OPEN_RELEASE: ReleaseCandidate`.
  - `search.ts`: `searchContext(build, weeks, roster, base, releases, starts): WaiverContext` — `waiverContext` becomes a wrapper over it.
  - `@shared/types`: `OpenSpot { rosterId: number; add: TradePlayer | null; deltaPerWeek: number }`, `TradeOpenSpots { me: OpenSpot | null; them: OpenSpot | null }`.
  - `openSpot.ts`: `afterRoster(build, side: TradeSideResult): PlayerSeries[]`, `openSpotFor(build, weeks: number[], rosterId: number, roster: PlayerSeries[]): OpenSpot | null`, `tradeOpenSpots(build, proposal: TradeProposal): TradeOpenSpots`.

Hand numbers on `WAIVER_LEAGUE` (roster size 4; Rival holds only R1 WR30 and R2 RB30):

- _I give C + D, get R2._ Mine after: A, B, R2 (3 < 4) → 60 a week (RB R2 · WR B · FLEX A). Y adds 5 in week 17 only (FLEX Y25 over A20) → +2.5/wk; X adds 1 a week (WR X11 over B10) → +1/wk. Best: **Y +2.5/wk**. Theirs after: R1, C, D (3 < 4) → 47 a week (RB C · WR R1 · FLEX D5). Y adds 20 in week 17 (RB Y25, FLEX C12) → +10/wk; X +6/wk; K +4/wk. Best: **Y +10/wk**.
- _I give D, get R1 + R2._ Mine after: A, C, B, R1, R2 (5 > 4) → 6b drops one (a non-starter) → full → **no open spot**. Theirs after: D alone → 5 a week; Y adds 3 + 25 → **+14/wk** (X +11/wk).

- [ ] **Step 1: Write the failing tests**

Create `tests/main/trade/openSpot.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { evaluateTrade } from '@main/trade/evaluate'
import { afterRoster, openSpotFor, tradeOpenSpots } from '@main/trade/openSpot'
import type { PlayerSeries } from '@main/value/series'
import { syntheticBuild, WAIVER_LEAGUE, waiverLeagueWith } from '../../fixtures/synthetic'

const A = { id: 'A', position: 'RB', weekly: 20, market: 5000 }
const C = { id: 'C', position: 'RB', weekly: 12, market: 2000 }
const B = { id: 'B', position: 'WR', weekly: 10, market: 1500 }
const ids = (roster: PlayerSeries[]): string[] => roster.map((s) => s.base.playerId).sort()

describe('trade open spot (slice 6c spec §7)', () => {
  it('finds the best free agent for each side a trade leaves short', () => {
    const { build } = syntheticBuild(WAIVER_LEAGUE)
    const spots = tradeOpenSpots(build, { rosterId: 2, give: ['C', 'D'], get: ['R2'] })
    expect(spots.me).toMatchObject({ rosterId: 1, deltaPerWeek: 2.5 })
    expect(spots.me?.add).toMatchObject({ playerId: 'Y', starterWeeks: 0 })
    expect(spots.them).toMatchObject({ rosterId: 2, deltaPerWeek: 10 })
    expect(spots.them?.add?.playerId).toBe('Y')
  })

  it('reads the after-roster from the evaluation, auto-drops included', () => {
    const { build } = syntheticBuild(WAIVER_LEAGUE)
    const proposal = { rosterId: 2, give: ['D'], get: ['R1', 'R2'] }
    const ev = evaluateTrade(build, proposal)
    expect(ev.me.drops).toHaveLength(1)
    const dropped = ev.me.drops[0].playerId
    expect(ids(afterRoster(build, ev.me))).toEqual(
      ['A', 'B', 'C', 'R1', 'R2'].filter((id) => id !== dropped)
    )
    expect(ids(afterRoster(build, ev.them))).toEqual(['D'])
    const spots = tradeOpenSpots(build, proposal)
    expect(spots.me).toBeNull()
    expect(spots.them).toMatchObject({ rosterId: 2, deltaPerWeek: 14 })
    expect(spots.them?.add?.playerId).toBe('Y')
  })

  it('names no add when no free agent helps the open spot', () => {
    const league = {
      ...waiverLeagueWith([A, C, B]),
      freeAgents: WAIVER_LEAGUE.freeAgents?.filter((p) => ['Z', 'W', 'Q'].includes(p.id))
    }
    const { build } = syntheticBuild(league)
    expect(openSpotFor(build, [16, 17], 1, build.rosters.get(1) ?? [])).toEqual({
      rosterId: 1,
      add: null,
      deltaPerWeek: 0
    })
  })

  it('is null for a full roster or an unknown roster size', () => {
    const { build } = syntheticBuild(WAIVER_LEAGUE)
    const mine = build.rosters.get(1) ?? []
    expect(openSpotFor(build, [16, 17], 1, mine)).toBeNull()
    const blind = { ...build, inputs: { ...build.inputs, rosterPositions: null } }
    expect(openSpotFor(blind, [16, 17], 1, mine.slice(0, 3))).toBeNull()
  })
})
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/main/trade/openSpot.test.ts`
Expected: FAIL — `Cannot find module '@main/trade/openSpot'`.

- [ ] **Step 3: `activePlayers` and `OPEN_RELEASE` in `release.ts`**

In `src/main/waiver/release.ts`, after `onReserve`:

```ts
/** Players who count against the roster size: everyone but IR / taxi. */
export function activePlayers(roster: PlayerSeries[]): PlayerSeries[] {
  return roster.filter((s) => !onReserve(s))
}

/** Spec §2.2 / §7: nothing leaves — a spot is already open. */
export const OPEN_RELEASE: ReleaseCandidate = { release: { kind: 'open' }, series: null }
```

and in `releaseCandidates` use them:

```ts
const size = rosterSize(build)
const active = activePlayers(roster)
if (size === null || active.length < size || active.length === 0) {
  return [OPEN_RELEASE]
}
```

- [ ] **Step 4: `searchContext` in `search.ts`**

Replace `waiverContext` in `src/main/waiver/search.ts` with:

```ts
/**
 * Spec §2.1: the search context for any roster — mine (§2–4) or a trade's after-roster (§7).
 * `base` is the roster's optimal lineup per week of `weeks`; `starts` its players' window starts.
 */
export function searchContext(
  build: LineupBuild,
  weeks: number[],
  roster: PlayerSeries[],
  base: TeamWeek[],
  releases: ReleaseCandidate[],
  starts: Map<string, number>
): WaiverContext {
  const without = new Map<string, TeamWeek[]>()
  for (const r of releases) {
    const leaving = r.series
    if (leaving === null || without.has(leaving.base.playerId)) continue
    const rest = roster.filter((s) => s !== leaving)
    without.set(
      leaving.base.playerId,
      weeks.map((w, i) =>
        isStarter(base[i], leaving.base.playerId) ? rosterWeek(build, rest, w) : base[i]
      )
    )
  }
  return {
    build,
    weeks,
    roster,
    base,
    before: sum(base.map((x) => x.optimalTotal)),
    releases,
    without,
    starts
  }
}

export function waiverContext(build: LineupBuild, ir: IrSettings): WaiverContext {
  const weeks = requireWindow(build)
  const me = myTeam(build)
  const roster = build.rosters.get(me.rosterId) ?? []
  return searchContext(
    build,
    weeks,
    roster,
    weeks.map((w) => teamWeek(build, me.rosterId, w)),
    releaseCandidates(build, roster, ir),
    starterWeeks(build, me.rosterId, weeks)
  )
}
```

Run: `npx vitest run tests/main/waiver`
Expected: PASS (refactor only).

- [ ] **Step 5: The shared types**

In `src/shared/types.ts`, after `StreamRow`:

```ts
/** Spec §7: the best free agent for a roster spot a trade leaves open. */
export interface OpenSpot {
  rosterId: number
  /** null when no free agent adds `LINEUP_MIN_DELTA` over the window. */
  add: TradePlayer | null
  /** 0 when `add` is null. */
  deltaPerWeek: number
}

/** Spec §7: per side of a proposal; null when that side's after-roster is full (or its size unknown). */
export interface TradeOpenSpots {
  me: OpenSpot | null
  them: OpenSpot | null
}
```

- [ ] **Step 6: Write `openSpot.ts`**

Create `src/main/trade/openSpot.ts`:

```ts
import { rosterWeek, type LineupBuild } from '@main/lineup/build'
import type { PlayerSeries } from '@main/value/series'
import { activePlayers, OPEN_RELEASE } from '@main/waiver/release'
import { lineupRows, scoreFreeAgents, searchContext } from '@main/waiver/search'
import type { OpenSpot, TradeOpenSpots, TradeProposal, TradeSideResult } from '@shared/types'
import { evaluateTrade, requireWindow, rosterSize } from './evaluate'

/** A side's roster after the trade and 6b's auto-drops, exactly as `evaluateTrade` settled it. */
export function afterRoster(build: LineupBuild, side: TradeSideResult): PlayerSeries[] {
  const gone = new Set([...side.give, ...side.drops].map((p) => p.playerId))
  const incoming = side.get.flatMap((p) => {
    const s = build.inputs.value.series.get(p.playerId)
    return s ? [s] : []
  })
  return [...(build.rosters.get(side.rosterId) ?? []), ...incoming].filter(
    (s) => !gone.has(s.base.playerId)
  )
}

/**
 * Slice 6c spec §7: the best free agent for an open spot on `roster` over `weeks` — §2.3 with the
 * release fixed to `open`. Null when the roster is full or its size unknown.
 */
export function openSpotFor(
  build: LineupBuild,
  weeks: number[],
  rosterId: number,
  roster: PlayerSeries[]
): OpenSpot | null {
  const size = rosterSize(build)
  if (size === null || activePlayers(roster).length >= size) return null
  const base = weeks.map((w) => rosterWeek(build, roster, w))
  const ctx = searchContext(build, weeks, roster, base, [OPEN_RELEASE], new Map())
  const best = lineupRows(ctx, scoreFreeAgents(ctx), 1)[0] ?? null
  return {
    rosterId,
    add: best?.player ?? null,
    deltaPerWeek: best?.options[0].deltaPerWeek ?? 0
  }
}

/** Spec §7: each side's open-spot add; the verdict itself is unchanged. */
export function tradeOpenSpots(build: LineupBuild, proposal: TradeProposal): TradeOpenSpots {
  const ev = evaluateTrade(build, proposal)
  const weeks = requireWindow(build)
  const spot = (side: TradeSideResult): OpenSpot | null =>
    openSpotFor(build, weeks, side.rosterId, afterRoster(build, side))
  return { me: spot(ev.me), them: spot(ev.them) }
}
```

- [ ] **Step 7: Run the tests to verify they pass**

Run: `npx vitest run tests/main/trade tests/main/waiver`
Expected: PASS.

- [ ] **Step 8: Add the open-spot budget**

Create `tests/main/trade/openSpotBudget.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { tradeOpenSpots } from '@main/trade/openSpot'
import { generateLeague, syntheticBuild } from '../../fixtures/synthetic'

/** Slice 6c spec §10: both sides' open-spot adds for one proposal. */
const OPEN_SPOT_MS = 1000

/** Wall-clock: runs only under `npm run test:budget` (parallel `npm test` workers make it flap). */
describe.skipIf(!process.env.FFC_BUDGET)('open spot budget', () => {
  it('finds a 2-for-1’s open-spot add inside 1 s', () => {
    const league = generateLeague(7, 16, 550)
    const { build } = syntheticBuild(league)
    const [mine, theirs] = league.teams
    // Two of my RBs for one of theirs: my side opens a spot, theirs drops one and stays full.
    const proposal = {
      rosterId: theirs.rosterId,
      give: [mine.players[2].id, mine.players[3].id],
      get: [theirs.players[2].id]
    }
    const t0 = performance.now()
    const spots = tradeOpenSpots(build, proposal)
    const ms = performance.now() - t0
    console.info(
      `open spot ${ms.toFixed(0)} ms · me ${spots.me?.add?.fullName ?? '—'} · them ${spots.them ? 'open' : 'full'}`
    )
    expect(spots.me).not.toBeNull()
    expect(ms).toBeLessThan(OPEN_SPOT_MS)
  })
})
```

Run: `npm run test:budget`
Expected: all three budget files PASS (suggestions, waiver adds + stream, open spot).

- [ ] **Step 9: Verify and commit**

```bash
npm run typecheck && npm run lint && npm test
git add src/main/waiver/release.ts src/main/waiver/search.ts src/shared/types.ts src/main/trade/openSpot.ts tests/main/trade/openSpot.test.ts tests/main/trade/openSpotBudget.test.ts
git commit -m "feat(trade): find the best add for an open spot"
```

---

### Task 4: Engine worker kinds and the two channels

**Files:**

- Modify: `src/main/engine/jobs.ts`
- Modify: `src/main/waiver/fromDb.ts`, `src/main/trade/fromDb.ts`
- Modify: `src/shared/ipc.ts`, `src/preload/index.ts`, `src/main/ipc/handlers.ts`
- Test: `tests/main/engine/jobs.test.ts`

**Interfaces:**

- Consumes: `waiverStream`, `weekOpponents` (Task 1); `tradeOpenSpots` (Task 3); `listRegularSeasonGames(db, season)` (`@main/db/repos/stats`); `getRules`, `lineupBuildFromDb`, `openDatabase`; `runEngine(dbPath, leagueId, job)` (`@main/engine/runEngine`).
- Produces:
  - `EngineJob` gains `{ kind: 'waiverStream'; season: number; week: number }` and `{ kind: 'openSpot'; season: number; proposal: TradeProposal }`; `EngineResults.waiverStream: StreamRow[]`, `EngineResults.openSpot: TradeOpenSpots`.
  - `waiverStreamFromDb(dbPath, leagueId, season, week): StreamRow[]`, `openSpotFromDb(dbPath, leagueId, season, proposal): TradeOpenSpots`.
  - Renderer API: `api.waiver.stream(season: number, week: number): Promise<StreamRow[]>`, `api.trade.openSpot(season: number, proposal: TradeProposal): Promise<TradeOpenSpots>`; channels `IPC.waiverStream = 'waiver:stream'`, `IPC.tradeOpenSpot = 'trade:openSpot'`.

- [ ] **Step 1: Write the failing worker test**

In `tests/main/engine/jobs.test.ts` add the imports `import { tradeOpenSpots } from '@main/trade/openSpot'` and `import { waiverStream } from '@main/waiver/stream'`, and a case:

```ts
it('answers a streaming week and a trade open spot with the in-process results', () => {
  const path = join(dir, 'stream.db')
  const { db, build } = syntheticBuild(WAIVER_LEAGUE, path)
  db.close()
  // No games in the fixture: the worker's opponent labels are empty too.
  expect(
    runJob({
      dbPath: path,
      leagueId: 'L1',
      job: { kind: 'waiverStream', season: SEASON, week: 17 }
    })
  ).toEqual(
    waiverStream(build, 17, {
      settings: WAIVER_LEAGUE.rules?.settings ?? {},
      opponents: new Map()
    })
  )
  const proposal = { rosterId: 2, give: ['C', 'D'], get: ['R2'] }
  expect(
    runJob({ dbPath: path, leagueId: 'L1', job: { kind: 'openSpot', season: SEASON, proposal } })
  ).toEqual(tradeOpenSpots(build, proposal))
})
```

Run: `npx vitest run tests/main/engine/jobs.test.ts`
Expected: FAIL — typecheck-level error in vitest (`'waiverStream'` not assignable to the job kind) or `runJob` returning `undefined`.

- [ ] **Step 2: The DB entries**

Append to `src/main/waiver/fromDb.ts` (add the imports `import { listRegularSeasonGames } from '@main/db/repos/stats'`, `import type { StreamRow, WaiverAdds } from '@shared/types'` replacing the old type import, and `import { waiverStream, weekOpponents } from './stream'`):

```ts
/** Spec §4 / §6: one streaming week on its own connection, for the engine worker. */
export function waiverStreamFromDb(
  dbPath: string,
  leagueId: string,
  season: number,
  week: number
): StreamRow[] {
  const db = openDatabase(dbPath)
  try {
    return waiverStream(lineupBuildFromDb(db, leagueId, season), week, {
      settings: getRules(db, leagueId)?.settings ?? {},
      opponents: weekOpponents(listRegularSeasonGames(db, season), week)
    })
  } finally {
    db.close()
  }
}
```

Append to `src/main/trade/fromDb.ts` (imports: `import type { TradeOpenSpots, TradeProposal, TradeSuggestion, TradeSuggestQuery } from '@shared/types'`, `import { tradeOpenSpots } from './openSpot'`):

```ts
/** Slice 6c spec §7: a proposal's open-spot adds on their own connection, for the engine worker. */
export function openSpotFromDb(
  dbPath: string,
  leagueId: string,
  season: number,
  proposal: TradeProposal
): TradeOpenSpots {
  const db = openDatabase(dbPath)
  try {
    return tradeOpenSpots(lineupBuildFromDb(db, leagueId, season), proposal)
  } finally {
    db.close()
  }
}
```

- [ ] **Step 3: The job kinds**

In `src/main/engine/jobs.ts`:

```ts
import { openSpotFromDb, suggestFromDb } from '@main/trade/fromDb'
import { waiverAddsFromDb, waiverStreamFromDb } from '@main/waiver/fromDb'
import type {
  StreamRow,
  TradeOpenSpots,
  TradeProposal,
  TradeSuggestion,
  TradeSuggestQuery,
  WaiverAdds
} from '@shared/types'

/** The searches that run off the main thread (6b spec §6, 6c spec §6). */
export type EngineJob =
  | { kind: 'tradeSuggest'; query: TradeSuggestQuery }
  | { kind: 'waiverAdds'; season: number }
  | { kind: 'waiverStream'; season: number; week: number }
  | { kind: 'openSpot'; season: number; proposal: TradeProposal }

export interface EngineResults {
  tradeSuggest: TradeSuggestion[]
  waiverAdds: WaiverAdds
  waiverStream: StreamRow[]
  openSpot: TradeOpenSpots
}
```

and in `runJob`'s switch:

```ts
    case 'waiverStream':
      return waiverStreamFromDb(dbPath, leagueId, job.season, job.week)
    case 'openSpot':
      return openSpotFromDb(dbPath, leagueId, job.season, job.proposal)
```

Run: `npx vitest run tests/main/engine/jobs.test.ts`
Expected: PASS.

- [ ] **Step 4: The channels**

`src/shared/ipc.ts` — add `StreamRow` and `TradeOpenSpots` to the types import; in `Api.trade` after `suggest`:

```ts
    /** Slice 6c spec §7: the best add for a spot the trade leaves open, per side; runs in the engine worker. */
    openSpot(season: number, proposal: TradeProposal): Promise<TradeOpenSpots>
```

in `Api.waiver` after `adds`:

```ts
    /** One-week streamers for `week` with their releases (slice 6c spec §4); runs in the engine worker. */
    stream(season: number, week: number): Promise<StreamRow[]>
```

and in `IPC` after `tradeSuggest` / `waiverAdds`:

```ts
  tradeOpenSpot: 'trade:openSpot',
```

```ts
  waiverStream: 'waiver:stream',
```

`src/preload/index.ts`:

```ts
  trade: {
    pool: (season) => ipcRenderer.invoke(IPC.tradePool, season),
    evaluate: (season, proposal) => ipcRenderer.invoke(IPC.tradeEvaluate, season, proposal),
    suggest: (query) => ipcRenderer.invoke(IPC.tradeSuggest, query),
    openSpot: (season, proposal) => ipcRenderer.invoke(IPC.tradeOpenSpot, season, proposal)
  },
  waiver: {
    adds: (season) => ipcRenderer.invoke(IPC.waiverAdds, season),
    stream: (season, week) => ipcRenderer.invoke(IPC.waiverStream, season, week)
  },
```

`src/main/ipc/handlers.ts` — add `StreamRow` and `TradeOpenSpots` to the `@shared/types` import; after the `IPC.tradeSuggest` handler:

```ts
ipcMain.handle(
  IPC.tradeOpenSpot,
  (_event, season: number, proposal: TradeProposal): Promise<TradeOpenSpots> => {
    const id = activeLeagueId()
    if (!id) throw new Error('No league imported')
    // Slice 6c spec §7: an info line under the verdict, computed off the main thread after it.
    return runEngine(ctx.dbPath, id, { kind: 'openSpot', season, proposal })
  }
)
```

after the `IPC.waiverAdds` handler:

```ts
ipcMain.handle(IPC.waiverStream, (_event, season: number, week: number): Promise<StreamRow[]> => {
  const id = activeLeagueId()
  if (!id) throw new Error('No league imported')
  // Slice 6c spec §6: changing the week re-runs only this, in the engine worker.
  return runEngine(ctx.dbPath, id, { kind: 'waiverStream', season, week })
})
```

- [ ] **Step 5: Verify and commit**

```bash
npm run typecheck && npm run lint && npm test
git add src/main/engine/jobs.ts src/main/waiver/fromDb.ts src/main/trade/fromDb.ts src/shared/ipc.ts src/preload/index.ts src/main/ipc/handlers.ts tests/main/engine/jobs.test.ts
git commit -m "feat(ipc): add waiver:stream and trade:openSpot"
```

Note: `npm test`'s TradeScreen / WaiverScreen component tests still pass here — they mock `@/lib/api` and do not call the new methods until Tasks 6–7.

---

### Task 5: View helpers

**Files:**

- Modify: `src/renderer/src/lib/waiverView.ts`, `src/renderer/src/lib/tradeView.ts`
- Modify: `tests/fixtures/waiver.ts`
- Test: `tests/renderer/lib/waiverView.test.ts`, `tests/renderer/lib/tradeView.test.ts`

**Interfaces:**

- Consumes: `StreamOption`, `StreamRow`, `OpenSpot` (`@shared/types`); `LINEUP_POSITIONS` (`@shared/rules`); `fmtSigned` (`@/lib/format`).
- Produces:
  - `waiverView.ts`: `WaiverMode = 'ros' | 'stream'`, `WAIVER_MODES`, `ALL_POSITIONS = 'All'`, `STREAM_CHIPS: readonly string[]` (`All QB RB WR TE K DEF`), `STREAM_SHOWN = 30`, `ReleaseChoice = Pick<AddOption, 'release' | 'releasePlayer'>`, `releaseLabel(o: ReleaseChoice)` (widened), `streamOptionLabel(o: StreamOption): string`, `weekOptionLabel(week: number, currentWeek: number): string`, `filterStream(rows: StreamRow[], chip: string): StreamRow[]`, `noStreamers(week: number, chip: string): string`.
  - `tradeView.ts`: `openSpotLine(spot: OpenSpot): string`.
  - Fixtures: `streamOption(over?)`, `streamRow(over?)` in `tests/fixtures/waiver.ts`.

- [ ] **Step 1: The fixtures**

In `tests/fixtures/waiver.ts`, extend the types import to `import type { AddOption, AddRow, StashRow, StreamOption, StreamRow, WaiverAdds } from '@shared/types'` and append:

```ts
export function streamOption(over: Partial<StreamOption> = {}): StreamOption {
  return {
    release: { kind: 'drop', playerId: miller.playerId },
    releasePlayer: miller,
    weekGain: 6.5,
    restCost: 0,
    net: 6.5,
    ...over
  }
}

/** Tre Harris (WR) at Carolina, dropping Kendre Miller for +6.50. */
export function streamRow(over: Partial<StreamRow> = {}): StreamRow {
  return { player: harris, opponent: '@ CAR', options: [streamOption()], ...over }
}
```

- [ ] **Step 2: Write the failing view tests**

In `tests/renderer/lib/waiverView.test.ts`, add to the `@/lib/waiverView` import: `ALL_POSITIONS`, `STREAM_CHIPS`, `STREAM_SHOWN`, `filterStream`, `noStreamers`, `releaseLabel` (if not imported yet), `streamOptionLabel`, `weekOptionLabel`; add `streamOption`, `streamRow` to the fixtures import; and inside `describe('waiverView', …)`:

```ts
it('labels streaming options, weeks and empty chips', () => {
  expect(streamOptionLabel(streamOption({ net: -1.25 }))).toBe('Drop Kendre Miller · -1.25')
  expect(releaseLabel(streamOption({ release: { kind: 'open' }, releasePlayer: null }))).toBe(
    'Open spot'
  )
  expect(weekOptionLabel(3, 3)).toBe('Week 3 (this week)')
  expect(weekOptionLabel(5, 3)).toBe('Week 5')
  expect(noStreamers(5, ALL_POSITIONS)).toBe('No streamer beats your lineup in week 5.')
  expect(noStreamers(5, 'TE')).toBe('No TE streamer beats your lineup in week 5.')
  expect(STREAM_CHIPS).toEqual(['All', 'QB', 'RB', 'WR', 'TE', 'K', 'DEF'])
})

it('filters streamers by chip and caps the list', () => {
  const rows = [streamRow(), streamRow({ player: wright })]
  expect(filterStream(rows, ALL_POSITIONS).map((r) => r.player.playerId)).toEqual([
    harris.playerId,
    wright.playerId
  ])
  expect(filterStream(rows, 'RB').map((r) => r.player.playerId)).toEqual([wright.playerId])
  expect(filterStream(rows, 'TE')).toEqual([])
  expect(
    filterStream(
      Array.from({ length: 40 }, () => streamRow()),
      ALL_POSITIONS
    )
  ).toHaveLength(STREAM_SHOWN)
})
```

In `tests/renderer/lib/tradeView.test.ts`, add `openSpotLine` to the `@/lib/tradeView` import (and `bijan` to the `../fixtures/trade` import if it is not there) and:

```ts
it('describes an open spot', () => {
  expect(openSpotLine({ rosterId: 1, add: bijan, deltaPerWeek: 0.8 })).toBe(
    `Open spot: best add ${bijan.fullName}, +0.80/wk`
  )
  expect(openSpotLine({ rosterId: 2, add: null, deltaPerWeek: 0 })).toBe(
    'Open spot: no free agent improves this lineup'
  )
})
```

Run: `npx vitest run tests/renderer/lib`
Expected: FAIL — the new exports are missing.

- [ ] **Step 3: Implement**

In `src/renderer/src/lib/waiverView.ts`:

1. Imports become:

```ts
import { fmtSigned, relativeTime } from '@/lib/format'
import { fmtMarket } from '@/lib/tradeView'
import { LINEUP_POSITIONS } from '@shared/rules'
import type {
  AddOption,
  StashRow,
  StreamOption,
  StreamRow,
  TradePlayer,
  WaiverAdds
} from '@shared/types'
```

2. After `STASH_SORTS` add:

```ts
export type WaiverMode = 'ros' | 'stream'
export const WAIVER_MODES: { key: WaiverMode; label: string }[] = [
  { key: 'ros', label: 'Rest of season' },
  { key: 'stream', label: 'Streaming' }
]

/** Slice 6c spec §8: the streaming position chips; the UI shows this many rows of the current chip. */
export const ALL_POSITIONS = 'All'
export const STREAM_CHIPS: readonly string[] = [ALL_POSITIONS, ...LINEUP_POSITIONS]
export const STREAM_SHOWN = 30

/** What every release option carries — `AddOption` and `StreamOption` alike. */
export type ReleaseChoice = Pick<AddOption, 'release' | 'releasePlayer'>
```

3. Change `releaseLabel`'s parameter type from `AddOption` to `ReleaseChoice` (body unchanged).
4. After `optionLabel` add:

```ts
/** A streaming dropdown entry: the release and the whole move's net. */
export function streamOptionLabel(o: StreamOption): string {
  return `${releaseLabel(o)} · ${fmtSigned(o.net)}`
}

export function weekOptionLabel(week: number, currentWeek: number): string {
  return week === currentWeek ? `Week ${week} (this week)` : `Week ${week}`
}

/** Spec §4 / §8: the chip's streamers in engine order, `STREAM_SHOWN` at most. */
export function filterStream(rows: StreamRow[], chip: string): StreamRow[] {
  return rows
    .filter((r) => chip === ALL_POSITIONS || r.player.position === chip)
    .slice(0, STREAM_SHOWN)
}

/** Spec §9: the empty streaming list, per chip. */
export function noStreamers(week: number, chip: string): string {
  const who = chip === ALL_POSITIONS ? 'streamer' : `${chip} streamer`
  return `No ${who} beats your lineup in week ${week}.`
}
```

In `src/renderer/src/lib/tradeView.ts`, add `OpenSpot` to the `@shared/types` import and:

```ts
/** Slice 6c spec §7: the info line under a side's verdict when the trade leaves it a free spot. */
export function openSpotLine(spot: OpenSpot): string {
  return spot.add
    ? `Open spot: best add ${spot.add.fullName}, ${fmtSigned(spot.deltaPerWeek)}/wk`
    : 'Open spot: no free agent improves this lineup'
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/renderer/lib`
Expected: PASS.

- [ ] **Step 5: Verify and commit**

```bash
npm run typecheck && npm run lint && npm test
git add src/renderer/src/lib/waiverView.ts src/renderer/src/lib/tradeView.ts tests/fixtures/waiver.ts tests/renderer/lib/waiverView.test.ts tests/renderer/lib/tradeView.test.ts
git commit -m "feat(ui): add streaming and open-spot view text"
```

---

### Task 6: Streaming mode on the Waivers screen

**Files:**

- Modify: `src/renderer/src/screens/WaiverScreen.tsx`
- Test: `tests/renderer/components/WaiverScreen.test.tsx`

**Interfaces:**

- Consumes: `api.waiver.stream(season, week)` (Task 4); `streamWeeks` (`@shared/rules`); from `@/lib/waiverView`: `WAIVER_MODES`, `WaiverMode`, `ALL_POSITIONS`, `STREAM_CHIPS`, `ReleaseChoice`, `filterStream`, `noStreamers`, `streamOptionLabel`, `weekOptionLabel`, `optionLabel`, `releaseLabel` (Task 5); `streamOption`, `streamRow` fixtures.
- Produces: the screen's _Rest of season | Streaming_ switch, the _Streaming_ card (week picker `aria-label="Streaming week"`, chips, table rows `data-testid="stream-row"`, release dropdown `aria-label="Release for {name}"`).

- [ ] **Step 1: Write the failing component tests**

In `tests/renderer/components/WaiverScreen.test.tsx`:

1. Add `waitFor` to the Testing Library import and `streamOption, streamRow, wright, allgeier` to the fixtures import (keep `addOption, addRow, waiverAdds`).
2. The mock becomes `waiver: { adds: vi.fn(), stream: vi.fn() }`; add `const streamMock = vi.mocked(api.waiver.stream)`.
3. In `beforeEach`: `streamMock.mockReset()` and

```ts
streamMock.mockResolvedValue([
  streamRow(),
  streamRow({
    player: wright,
    opponent: 'vs NO',
    options: [
      streamOption({ weekGain: 5, restCost: 3, net: 2 }),
      streamOption({
        release: { kind: 'drop', playerId: allgeier.playerId },
        releasePlayer: allgeier,
        weekGain: 4,
        restCost: 3.5,
        net: 0.5
      })
    ]
  })
])
```

4. New cases:

```ts
  it('streams the current week on the first switch and refetches only on a week change', async () => {
    render(<WaiverScreen dataVersion={0} />)
    await screen.findByText('Tyler Allgeier')
    expect(streamMock).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'Streaming' }))
    expect(await screen.findByText('@ CAR')).toBeTruthy()
    expect(streamMock).toHaveBeenCalledWith(2026, 3)
    expect(screen.queryByText('Tyler Allgeier')).toBeNull()
    const week = screen.getByLabelText('Streaming week') as HTMLSelectElement
    expect([...week.options].map((o) => o.textContent)).toEqual([
      'Week 3 (this week)',
      'Week 4',
      'Week 5',
      'Week 6'
    ])

    fireEvent.change(week, { target: { value: '5' } })
    await waitFor(() => expect(streamMock).toHaveBeenCalledWith(2026, 5))

    fireEvent.click(screen.getByRole('button', { name: 'Rest of season' }))
    expect(screen.getByText('Tyler Allgeier')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Streaming' }))
    expect(streamMock).toHaveBeenCalledTimes(2)
  })

  it('filters streamers by position and switches a release', async () => {
    render(<WaiverScreen dataVersion={0} />)
    await screen.findByText('Tyler Allgeier')
    fireEvent.click(screen.getByRole('button', { name: 'Streaming' }))
    await screen.findByText('@ CAR')
    const names = (): string[] =>
      screen
        .getAllByTestId('stream-row')
        .map((row) => within(row).getAllByRole('button')[0].textContent ?? '')
    expect(names()).toEqual(['Tre Harris', 'Jaylen Wright'])

    fireEvent.click(screen.getByRole('button', { name: 'RB' }))
    expect(names()).toEqual(['Jaylen Wright'])
    expect(screen.getByText('+2.00')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Release for Jaylen Wright'), {
      target: { value: '1' }
    })
    expect(screen.getByText('-3.50')).toBeTruthy()
    expect(screen.getByText('+0.50')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'TE' }))
    expect(screen.getByText('No TE streamer beats your lineup in week 3.')).toBeTruthy()
  })

  it('explains an empty streaming week and shows a streaming error', async () => {
    streamMock
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('Streaming covers weeks 3–6'))
    render(<WaiverScreen dataVersion={0} />)
    await screen.findByText('Tyler Allgeier')
    fireEvent.click(screen.getByRole('button', { name: 'Streaming' }))
    expect(await screen.findByText('No streamer beats your lineup in week 3.')).toBeTruthy()
    fireEvent.change(screen.getByLabelText('Streaming week'), { target: { value: '4' } })
    expect(await screen.findByText('Streaming covers weeks 3–6')).toBeTruthy()
  })
```

Run: `npx vitest run tests/renderer/components/WaiverScreen.test.tsx`
Expected: the three new cases FAIL (no _Streaming_ button); the five existing ones PASS.

- [ ] **Step 2: Make `ReleaseCell` generic**

In `src/renderer/src/screens/WaiverScreen.tsx`, replace `ReleaseCell` with:

```tsx
/** Spec §8: the release, as a dropdown of every option when there is a choice. */
function ReleaseCell<T extends ReleaseChoice>({
  player,
  options,
  label,
  index,
  onChange
}: {
  player: TradePlayer
  options: T[]
  label: (o: T) => string
  index: number
  onChange: (index: number) => void
}): React.JSX.Element {
  if (options.length === 1) return <span className="text-sm">{releaseLabel(options[0])}</span>
  return (
    <select
      aria-label={`Release for ${player.fullName}`}
      className={selectClass}
      value={index}
      onChange={(e) => onChange(Number(e.target.value))}
    >
      {options.map((o, i) => (
        <option key={i} value={i}>
          {label(o)}
        </option>
      ))}
    </select>
  )
}
```

and pass `label={optionLabel}` to both existing `<ReleaseCell … />` uses (in `LineupCard` and `StashCard`).

- [ ] **Step 3: Add `StreamCard`**

Before `interface WaiverScreenProps`:

```tsx
function StreamCard({
  weeks,
  week,
  currentWeek,
  onWeek,
  chip,
  onChip,
  result,
  note,
  error,
  choice,
  onChoose,
  onOpen
}: {
  weeks: number[]
  week: number
  currentWeek: number
  onWeek: (week: number) => void
  chip: string
  onChip: (chip: string) => void
  /** The latest answer — an earlier week's while a new one computes. */
  result: { week: number; rows: StreamRow[] } | null
  /** "Calculating…" / "Refreshing…"; null when the result is current. */
  note: string | null
  error: string | null
  choice: Record<string, number>
  onChoose: Choose
  onOpen: (p: DetailTarget) => void
}): React.JSX.Element {
  const rows = result ? filterStream(result.rows, chip) : []
  return (
    <Card>
      <CardHeader className="space-y-3">
        <CardTitle className="text-base">Streaming</CardTitle>
        <div className="flex flex-wrap items-center gap-3">
          <select
            aria-label="Streaming week"
            className={selectClass}
            value={week}
            onChange={(e) => onWeek(Number(e.target.value))}
          >
            {weeks.map((w) => (
              <option key={w} value={w}>
                {weekOptionLabel(w, currentWeek)}
              </option>
            ))}
          </select>
          <div className="flex flex-wrap gap-1 rounded-full border p-1">
            {STREAM_CHIPS.map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={chip === c}
                onClick={() => onChip(c)}
                className={cn(
                  'h-7 rounded-full px-3 text-sm font-medium transition-colors',
                  chip === c
                    ? 'bg-primary/20 text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {c}
              </button>
            ))}
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2">
        {error && <p className="text-sm text-muted-foreground">{error}</p>}
        {note && <p className="text-xs text-muted-foreground">{note}</p>}
        {result &&
          (rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">{noStreamers(result.week, chip)}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Player</TableHead>
                  <TableHead>Opponent</TableHead>
                  <TableHead className="text-right">Week gain</TableHead>
                  <TableHead className="text-right">Rest cost</TableHead>
                  <TableHead className="text-right">Net</TableHead>
                  <TableHead>Make room</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row) => {
                  const key = `stream|${row.player.playerId}`
                  const index = choice[key] ?? 0
                  const o = row.options[index] ?? row.options[0]
                  return (
                    <TableRow key={key} data-testid="stream-row">
                      <TableCell>
                        <PlayerCell player={row.player} onOpen={onOpen} />
                      </TableCell>
                      <TableCell className="text-muted-foreground">{row.opponent ?? '—'}</TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtSigned(o.weekGain)}
                      </TableCell>
                      <TableCell className="text-right tabular-nums">
                        {fmtSigned(-o.restCost)}
                      </TableCell>
                      <TableCell
                        className={cn(
                          'text-right font-semibold tabular-nums',
                          TONE[deltaTone(o.net)]
                        )}
                      >
                        {fmtSigned(o.net)}
                      </TableCell>
                      <TableCell>
                        <ReleaseCell
                          player={row.player}
                          options={row.options}
                          label={streamOptionLabel}
                          index={index}
                          onChange={(i) => onChoose(key, i)}
                        />
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          ))}
      </CardContent>
    </Card>
  )
}
```

- [ ] **Step 4: The mode switch and the streaming fetch**

Imports: add `streamWeeks` from `@shared/rules`; add `StreamRow` to the `@shared/types` import; the `@/lib/waiverView` import becomes:

```ts
import {
  ALL_POSITIONS,
  NO_LINEUP_ADDS,
  NO_STASH,
  STASH_SORTS,
  STREAM_CHIPS,
  WAIVER_MODES,
  filterStream,
  isFree,
  noStreamers,
  optionLabel,
  priorityLine,
  releaseLabel,
  rosRankLabel,
  sortStash,
  startsText,
  streamOptionLabel,
  trendingNote,
  trendingText,
  weekOptionLabel,
  type ReleaseChoice,
  type StashSort,
  type WaiverMode
} from '@/lib/waiverView'
```

Replace the `WaiverScreen` function with:

```tsx
/** Slice 6c spec §8: the Waivers screen — rest of season (lineup adds, stash) and streaming. */
export function WaiverScreen({ dataVersion }: WaiverScreenProps): React.JSX.Element {
  const [season, setSeason] = useState<number | null>(null)
  const [loaded, setLoaded] = useState<{ key: string; adds: WaiverAdds } | null>(null)
  const [failed, setFailed] = useState<{ key: string; message: string } | null>(null)
  const [choice, setChoice] = useState<Record<string, number>>({})
  const [sort, setSort] = useState<StashSort>('market')
  const [selected, setSelected] = useState<DetailTarget | null>(null)
  const [mode, setMode] = useState<WaiverMode>('ros')
  // Spec §8: streaming loads on the first switch, then on each week change (and after a sync).
  const [streamOn, setStreamOn] = useState(false)
  const [pickedWeek, setPickedWeek] = useState<number | null>(null)
  const [chip, setChip] = useState(ALL_POSITIONS)
  const [streamed, setStreamed] = useState<{
    key: string
    week: number
    rows: StreamRow[]
  } | null>(null)
  const [streamFailed, setStreamFailed] = useState<{ key: string; message: string } | null>(null)
  const [streamChoice, setStreamChoice] = useState<Record<string, number>>({})

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
    void api.waiver
      .adds(season)
      .then((adds) => {
        if (cancelled) return
        setLoaded({ key, adds })
        setChoice({})
      })
      .catch((err) => {
        if (!cancelled) setFailed({ key, message: errorMessage(err) })
      })
    return () => {
      cancelled = true
    }
  }, [season, key])

  // Spec §8: keep the previous lists on screen while a refresh computes.
  const adds = loaded?.adds ?? null
  const notice = failed && (failed.key === key || failed.key === 'options') ? failed.message : null
  const refreshing = loaded !== null && loaded.key !== key && notice === null
  const priority = adds ? priorityLine(adds) : null
  const choose: Choose = (k, i) => setChoice((c) => ({ ...c, [k]: i }))

  // Spec §4: the picker's weeks; a week a sync moved past falls back to the current one.
  const weeks = adds ? streamWeeks(adds.currentWeek, adds.lastWeek) : []
  const week = pickedWeek !== null && weeks.includes(pickedWeek) ? pickedWeek : (weeks[0] ?? null)
  const streamKey =
    streamOn && season !== null && week !== null ? `${season}|${dataVersion}|${week}` : null
  useEffect(() => {
    if (season === null || week === null || streamKey === null) return
    let cancelled = false
    void api.waiver
      .stream(season, week)
      .then((rows) => {
        if (cancelled) return
        setStreamed({ key: streamKey, week, rows })
        setStreamChoice({})
      })
      .catch((err) => {
        if (!cancelled) setStreamFailed({ key: streamKey, message: errorMessage(err) })
      })
    return () => {
      cancelled = true
    }
  }, [season, week, streamKey])

  const streamError =
    streamFailed !== null && streamFailed.key === streamKey ? streamFailed.message : null
  const streamNote =
    streamError !== null
      ? null
      : streamed === null
        ? 'Calculating…'
        : streamed.key !== streamKey
          ? 'Refreshing…'
          : null
  const chooseStream: Choose = (k, i) => setStreamChoice((c) => ({ ...c, [k]: i }))
  const switchMode = (m: WaiverMode): void => {
    setMode(m)
    if (m === 'stream') setStreamOn(true)
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Waivers</h1>
          <p className="text-sm text-muted-foreground">
            Free agents worth a roster spot — for the rest of the season or for one week — and what
            to release for them.
          </p>
        </div>
        <div className="flex flex-col items-end gap-1 text-sm text-muted-foreground">
          <div className="flex rounded-md border p-0.5">
            {WAIVER_MODES.map((m) => (
              <button
                key={m.key}
                type="button"
                aria-pressed={mode === m.key}
                onClick={() => switchMode(m.key)}
                className={cn(
                  'h-7 rounded px-3 text-sm',
                  mode === m.key
                    ? 'bg-primary/20 text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
          {priority && <span>{priority}</span>}
          {adds && <span>{windowLabel(adds)}</span>}
        </div>
      </div>

      {notice && <p className="text-sm text-muted-foreground">{notice}</p>}
      {!adds && !notice && <p className="text-sm text-muted-foreground">Calculating…</p>}

      {mode === 'ros' && refreshing && <p className="text-xs text-muted-foreground">Refreshing…</p>}
      {mode === 'ros' && adds && (
        <>
          <LineupCard adds={adds} choice={choice} onChoose={choose} onOpen={setSelected} />
          <StashCard
            adds={adds}
            sort={sort}
            onSort={setSort}
            choice={choice}
            onChoose={choose}
            onOpen={setSelected}
          />
        </>
      )}

      {mode === 'stream' && adds && week !== null && (
        <StreamCard
          weeks={weeks}
          week={week}
          currentWeek={adds.currentWeek}
          onWeek={setPickedWeek}
          chip={chip}
          onChip={setChip}
          result={streamed}
          note={streamNote}
          error={streamError}
          choice={streamChoice}
          onChoose={chooseStream}
          onOpen={setSelected}
        />
      )}

      <PlayerDetailPanel season={season ?? 0} player={selected} onClose={() => setSelected(null)} />
    </div>
  )
}
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/renderer/components/WaiverScreen.test.tsx`
Expected: all eight cases PASS.

- [ ] **Step 6: Verify and commit**

```bash
npm run typecheck && npm run lint && npm test
git add src/renderer/src/screens/WaiverScreen.tsx tests/renderer/components/WaiverScreen.test.tsx
git commit -m "feat(ui): add streaming mode to Waivers screen"
```

---

### Task 7: The open-spot line in the trade builder

**Files:**

- Modify: `src/renderer/src/screens/TradeScreen.tsx`
- Test: `tests/renderer/components/TradeScreen.test.tsx`

**Interfaces:**

- Consumes: `api.trade.openSpot(season, proposal)` (Task 4); `openSpotLine` (Task 5); `OpenSpot`, `TradeOpenSpots` (`@shared/types`).
- Produces: under each side of the verdict card, the line _Open spot: best add {name}, +x.xx/wk_ (or _… no free agent improves this lineup_) once the worker answers.

- [ ] **Step 1: Write the failing component test**

In `tests/renderer/components/TradeScreen.test.tsx`:

1. The mock's `trade` becomes `{ pool: vi.fn(), evaluate: vi.fn(), suggest: vi.fn(), openSpot: vi.fn() }`; add `const openSpotMock = vi.mocked(api.trade.openSpot)`; in `beforeEach` add `openSpotMock.mockReset()` and `openSpotMock.mockResolvedValue({ me: null, them: null })`.
2. Add `bijan` to the `../../fixtures/trade` import.
3. New case:

```ts
  it('adds the open-spot line under a side once the worker answers', async () => {
    evaluateMock.mockResolvedValue(tradeEvaluation())
    openSpotMock.mockResolvedValue({
      me: { rosterId: 1, add: bijan, deltaPerWeek: 0.8 },
      them: { rosterId: 2, add: null, deltaPerWeek: 0 }
    })
    render(<TradeScreen dataVersion={0} />)
    await screen.findByText('weeks 3–17 · 15 weeks')
    fireEvent.change(screen.getByLabelText('Add to I give'), { target: { value: '6794' } })
    fireEvent.change(screen.getByLabelText('Add to I get'), { target: { value: '7564' } })
    fireEvent.click(screen.getByText('Evaluate'))

    expect(
      await screen.findByText(`Open spot: best add ${bijan.fullName}, +0.80/wk`)
    ).toBeTruthy()
    expect(openSpotMock).toHaveBeenCalledWith(2026, { rosterId: 2, give: ['6794'], get: ['7564'] })
    expect(screen.getByText('Open spot: no free agent improves this lineup')).toBeTruthy()

    // A new trade drops the old line with the old verdict.
    fireEvent.click(screen.getByLabelText('Remove Justin Jefferson'))
    expect(screen.queryByText(`Open spot: best add ${bijan.fullName}, +0.80/wk`)).toBeNull()
  })
```

Run: `npx vitest run tests/renderer/components/TradeScreen.test.tsx`
Expected: the new case FAILS (no line); the existing ones PASS.

- [ ] **Step 2: Render the line**

In `src/renderer/src/screens/TradeScreen.tsx`:

1. Add `openSpotLine` to the `@/lib/tradeView` import and `OpenSpot`, `TradeOpenSpots` to the `@shared/types` import.
2. `SideVerdict` takes the side's spot:

```tsx
function SideVerdict({
  side,
  spot
}: {
  side: TradeSideResult
  spot: OpenSpot | null
}): React.JSX.Element {
  const drop = dropLine(side)
  return (
    <div className="space-y-1 text-sm">
      <div className="font-semibold">{side.isMe ? `Me · ${side.name}` : `Them · ${side.name}`}</div>
      <div className={cn('text-2xl font-semibold', TONE[deltaTone(side.delta)])}>
        {deltaLine(side)}
      </div>
      <div className="text-muted-foreground">{rangeLine(side)}</div>
      {drop && <div className="text-amber-400">{drop}</div>}
      {spot && <div className="text-sky-400">{openSpotLine(spot)}</div>}
      <div className="text-muted-foreground">{marketLine(side)}</div>
    </div>
  )
}
```

3. `VerdictCard` takes the spots:

```tsx
function VerdictCard({
  ev,
  spots
}: {
  ev: TradeEvaluation
  spots: TradeOpenSpots | null
}): React.JSX.Element {
```

and renders `<SideVerdict side={ev.me} spot={spots?.me ?? null} />` / `<SideVerdict side={ev.them} spot={spots?.them ?? null} />`.

4. In `TradeScreen`, after the `verdict` state:

```tsx
const [openSpots, setOpenSpots] = useState<{
  ev: TradeEvaluation
  spots: TradeOpenSpots
} | null>(null)
```

and after the pool `useEffect`:

```tsx
// Slice 6c spec §7: the open-spot line follows the verdict; the verdict never waits for it.
useEffect(() => {
  if (!verdict) return
  let cancelled = false
  void api.trade
    .openSpot(verdict.season, {
      rosterId: verdict.them.rosterId,
      give: verdict.me.give.map((p) => p.playerId),
      get: verdict.me.get.map((p) => p.playerId)
    })
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
```

5. `{verdict && <VerdictCard ev={verdict} />}` becomes `{verdict && <VerdictCard ev={verdict} spots={spots} />}`.

- [ ] **Step 3: Run the tests to verify they pass**

Run: `npx vitest run tests/renderer/components/TradeScreen.test.tsx`
Expected: PASS (all cases).

- [ ] **Step 4: Verify and commit**

```bash
npm run typecheck && npm run lint && npm test
git add src/renderer/src/screens/TradeScreen.tsx tests/renderer/components/TradeScreen.test.tsx
git commit -m "feat(ui): show the open-spot line in the builder"
```

---

### Task 8: Data reference, real-data check, release `v0.17.0`

**Files:**

- Modify: `docs/reference/value-and-signals.md`
- Modify: this plan (status block)

- [ ] **Step 1: Data reference**

In `docs/reference/value-and-signals.md`:

- Rename the section to `## Waivers (added in v0.16.0; streaming v0.17.0)` and, after the **Lists** table, add a **Streaming** paragraph in the doc's style: week picker = current week up to 3 ahead within the window; candidates = free agents who can enter my lineup that week, game not yet played; per release `weekGain`, `restCost` (the release's lost points in the window's other weeks; 0 for an open spot; an IR move costs the same as a drop), `net`; options by net with the release tie order; rows with best net ≥ `STREAM_MIN_NET` (0.5), sorted by net, week gain, name; all rows returned, 30 shown per chip; opponent `vs X` / `@ X` from the schedule (bare code as fallback). Payload `StreamRow` / `StreamOption` fields one line each.
- Add an **Open spot** paragraph: when a side's after-roster (after the auto-drops) has fewer active players than the known roster size, the builder shows _Open spot: best add X, +y/wk_ (best free agent by window Δ with the release fixed to `open`, ≥ `LINEUP_MIN_DELTA`) or _no free agent improves this lineup_; the after-roster comes from the evaluation itself; the headline Δ, the flags and the suggestion search ignore it. Payload `TradeOpenSpots` / `OpenSpot`.
- Under **Where it is shown**: the Waivers header switch _Rest of season | Streaming_; the Streaming card (week picker, chips, Opponent, Week gain, Rest cost shown negative, **Net**, release dropdown `Drop X · ±net`); the Trade screen's line under each side of the verdict.
- _Constants (single sources)_: add `STREAM_MIN_NET` (`src/main/waiver/stream.ts`), `STREAM_WEEKS_AHEAD` (`src/shared/rules.ts`), `STREAM_SHOWN`, `STREAM_CHIPS` (`waiverView.ts`).
- _Module map_: `src/main/waiver/{release,search,stash,stream,adds,fromDb}.ts` (add streaming to its description), `src/main/trade/openSpot.ts` (after-roster and the open-spot search), and the engine row's job list (trade suggestions, waiver adds, streaming, open spot).

- [ ] **Step 2: Commit the docs**

```bash
git add docs/reference/value-and-signals.md
git commit -m "docs: document streaming and the open-spot line"
```

- [ ] **Step 3: Final verification and the real-data check**

Run: `npm run typecheck && npm run lint && npm test && npm run test:budget` — all green; note the three budget times.

Then on a copy of the dev DB (`cp ~/.config/FantasyCompanion/companion.db <scratchpad>/real.db`) a throwaway `tests/zz-streaming.test.ts` that: runs `migrate()` on the copy; builds `lineupBuildFromDb(db, leagueId, 2026)`; for each week of `streamWeeks(currentWeek, lastWeek)` times `waiverStream(...)` with the league settings and `weekOpponents(listRegularSeasonGames(db, 2026), week)` and prints the top 10 rows (player, opponent, week gain, rest cost, net, chosen release and the next two options); then evaluates one 2-for-1 the user might plausibly offer (two of my bench players for one of a partner's starters) and prints `tradeOpenSpots(...)` with its time. Check with the user's roster in mind: the best release is a bench player who barely starts (rest cost ≈ 0) unless an IR move is available; no streamer's game in the current week is already played; K / DEF streamers appear on the right chips; opponents read `vs` / `@` correctly for a known game; the open spot appears on my side only; each time is under its budget. Delete the file (never commit it).

Build and run the bundled worker once in plain Node against the copy for the two new kinds (`npm run build`, then a scratch script that starts `new Worker('out/main/engineWorker.js', { workerData: { dbPath, leagueId, job } })` for `{ kind: 'waiverStream', season: 2026, week }` and `{ kind: 'openSpot', season: 2026, proposal }` and prints the row count / the spots). Also run the app once (`npm run dev` via the Bash tool's `run_in_background`) and open Waivers → Streaming and the Trade screen. If WSLg can't show the window, say so in the status block rather than claiming it was checked.

- [ ] **Step 4: Merge and release**

```bash
git checkout main && git merge --no-ff feat/waiver-streaming -m "merge: feat/waiver-streaming (plan P)"
npm version minor -m "build: bump version to %s"
```

Expected: `package.json` at `0.17.0`, tag `v0.17.0`. Pushing (`git push --follow-tags`) triggers the Windows release workflow into a draft release — **ask the user first**, as in earlier plans. Then fill in this plan's status block (measured times, real-data observations, what was not verified) and commit it as `docs(plan): mark plan P complete`.

---

## Self-review against the spec

| Spec                                                                                                                                                                                                                       | Where                                                                                                                  |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| §4 target week `currentWeek..min(currentWeek + 3, lastWeek)`, default current                                                                                                                                              | Task 1 (`streamWeeks`, `streamRows` guard), Task 6 (picker, `weeks[0]` default)                                        |
| §4 candidates: `canEnter` at `t`, played games excluded                                                                                                                                                                    | Task 1 (`canHelp` on the one-week context, `played`)                                                                   |
| §4 `weekGain`, `restCost` (once per release, 0 for open, non-starters free), `net`                                                                                                                                         | Task 1 (`releaseSolves` on `weekContext`, `restCosts` from `ctx.without`)                                              |
| §4 option order by net + §2.3 tie order; rows `net ≥ 0.5`, sort, all returned                                                                                                                                              | Task 1 (`compareReleases`, `STREAM_MIN_NET`, final sort)                                                               |
| §4 opponent `vs` / `@` from `games`                                                                                                                                                                                        | Task 1 (`weekOpponents`), Task 4 (`listRegularSeasonGames` in `waiverStreamFromDb`)                                    |
| §6 `StreamOption`, `StreamRow`; `waiver:stream`; `trade:openSpot`; worker kinds `waiverStream` / `openSpot`                                                                                                                | Tasks 1, 3, 4                                                                                                          |
| §7 after-roster after auto-drops, fewer active than `rosterSize`, release fixed to `open`, baseline the after-roster, free agents not in the trade (every trade player is rostered, so `freeAgents` already excludes them) | Task 3                                                                                                                 |
| §7 runs in the worker after the verdict; verdict / flags / suggestions unchanged                                                                                                                                           | Task 4 (channel), Task 7 (effect keyed to the verdict)                                                                 |
| §8 `Rest of season                                                                                                                                                                                                         | Streaming` control, week picker, chips, row columns, release cell, spinner-and-keep-previous, row click → detail panel | Task 6 |
| §9 _No streamer beats your lineup in week 5_                                                                                                                                                                               | Task 5 (`noStreamers`), Task 6                                                                                         |
| §10 unit tests, property test vs brute force, budgets (stream ≤ 1 s, open spot ≤ 1 s), worker test, component tests, real-data check                                                                                       | Tasks 1–8                                                                                                              |
| §12 Plan P → `v0.17.0`                                                                                                                                                                                                     | Task 8                                                                                                                 |
