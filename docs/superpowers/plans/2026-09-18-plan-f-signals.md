# Plan F — Signals (slice 4, phase 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Put the _why_ next to every value: usage trends, TD/yards-per-opportunity regression, consistency (floor / ceiling / start rate), projection accuracy and schedule (next opponent, rest-of-season strength, byes) — as a `Signals` column group plus `SOS` / `BYES` columns in Value mode, and as charts and text in the player detail panel.

**Architecture:** Two new pure modules in `src/main/value/` consume the `SeriesBundle` that `loadSeries` already produces (per-week points, scored projections, Sleeper-keyed lines, usage shares, opponents): `signals.ts` (usage trends, opportunities, league-wide positional rates, percentiles, vs-projection; every threshold an exported constant) and `schedule.ts` (defense-vs-position ranks from the played weeks, then each player's remaining schedule). `assembleValue` merges them into `PlayerValueRow.signals` and `PlayerDetail.schedule`; nothing new touches the DB except one extra field on the bundle (the Sleeper-coded team schedule). The renderer adds a `signal` column kind to `playersTableView.ts`, two small inline-SVG components (`BarsVsMarker`, `Sparkline`) over pure layout helpers in `lib/charts.ts`, and four new sections in `PlayerDetailPanel.tsx` driven by `lib/detailView.ts`.

**Tech Stack:** unchanged — Electron 39, React 19, TypeScript strict, Tailwind 4, shadcn primitives, `node:sqlite`, Vitest. No new dependencies (spec non-goal: no charting library).

**Spec:** `docs/superpowers/specs/2026-09-17-slice4-value-and-signals-design.md` (§3, §5.1 `Trend` / `UsageTrend` / `PlayerSignals` / `PlayerDetail.schedule`, §5.3 `signals` + `schedule` rows, §6.1 Signals group + SOS/Byes, §6.2 items 1 (opponent / byes) and 2–5, §6.3 gates, §8, §10 row F). **Builds on:** `v0.5.0` — `src/main/value/{series,replacement,build}.ts`, `valueCache` in `handlers.ts`, `playersTableView.ts` (`TableRow`, `Column.kind='value'`, `DEFAULT_SORT`, `valueHeaderTitle`), `PlayerDetailPanel.tsx` (header strip + game log), `ValueHelp.tsx`, `tests/fixtures/season.ts` (`seedSeason`: 2026 on league `L1`, current week 3 with Barkley's Thursday game played).

## Global Constraints

- Same as Plans C–E: Node ≥ 22.13 (`source ~/.nvm/nvm.sh && nvm use`), `node:sqlite` only, no Electron imports outside `src/main/index.ts`, `src/main/ipc/`, `src/preload/`; repositories never open transactions.
- Every number behind the screen is computed in the main process from the loaded bundle. The renderer formats; it never computes points, trends or ranks. The only renderer-side constants are display thresholds (SOS tint buckets).
- No new tables, no migration, no persisted computed values, no new data sources, no charting library (spec non-goals). Charts are inline SVG, ≤ 24 px bars with a 2 px surface gap and rounded data-ends, 2 px lines, ≥ 8 px end markers with a 2 px surface ring, native `<title>` hover on every bar, text in text tokens (never the series colour).
- **Thresholds live in `src/main/value/signals.ts` as exported constants** (spec §3): `RECENT_GAMES = 3`, `SHARE_TREND_THRESHOLD = 0.03`, `SNAP_TREND_THRESHOLD = 0.05`, `MIN_GAMES_USAGE = 2`, `MIN_GAMES_CONSISTENCY = 3`, `TD_FLAG_THRESHOLD = 1.5`. No other logic may hard-code them (UI copy such as "needs 3 games" is text, not a gate).
- **Do not saturate the window**: Value mode gains exactly the columns listed in Task 5 (`SOS`, `BYES` in Rest of season; `FLOOR`, `CEIL`, `START%`, `USAGE`, `TD`, `VS PROJ` in Signals). No new buttons or chips (the _My team_ chip is Plan G).
- Verification before every commit: `npm run typecheck && npm run lint && npm test`; run `npm run format` when Prettier complains. Conventional Commits, summary ≤ 50 chars, ending with `Co-Authored-By: Claude Opus 5 <noreply@anthropic.com>`. Branch `feat/signals` from `main`.
- Existing `tests/**` are typechecked: when a shared type gains a required field, update the fixture literals named in the task.
- Spec deviations locked in here:
  - `PlayerSignals.nextOpponent.rank` is `number | null` — a defense has no rank until it has played (preseason), matching `PlayerDetail.schedule[].rank`.
  - A usage trend is computed over the played games that _have_ the metric (a played week without a snap row is not a snap-% game); `MIN_GAMES_USAGE` counts those.
  - The positional mean yards-per-opportunity is opportunity-weighted: Σ yards / Σ opportunities over every candidate at the position (same denominator as the TD rate).
  - `allowed(T, pos)` is averaged over T's _played_ weeks (weeks with any points row against T); defenses that have not played are unranked, and ranks run 1..N over the ranked defenses (N ≤ 32 early in the season). `rosSos` averages the ranked remaining opponents only; `null` when none is ranked.
  - `byesRemaining` counts weeks from `currentWeek` to the last week with any game in the stored schedule (a partially loaded schedule never inflates it); a team with no stored game has 0 byes, no SOS and no next opponent.
  - `signals` is `null` when `statsAvailable = false` (spec §5.1); K and DEF have `null` usage, `tdDelta`, `ypo` but real consistency, vs-projection and schedule fields.
  - Floor and ceiling are two sortable columns (`FLOOR`, `CEIL`), not one combined cell — spec §6.1 wants every numeric column sortable.

---

## File map

| File                                                                                                                      | Responsibility                                                                                                                                               |
| ------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `src/shared/types.ts` (modify)                                                                                            | `Trend`, `UsageTrend`, `UsageMetric`, `PlayerSignals`, `ScheduleEntry`; `PlayerValueRow.signals`; `PlayerDetail.schedule`                                    |
| `src/main/value/series.ts` (modify)                                                                                       | `SeriesBundle.schedule` — Sleeper-coded team schedule                                                                                                        |
| `src/main/value/signals.ts` (create)                                                                                      | §3.1–3.3 pure: constants, `usageTrend`, `opportunities`, `production`, `positionTotals`, `percentile`, `stdev`, `statSignals`                                |
| `src/main/value/schedule.ts` (create)                                                                                     | §3.4 pure: `defenseRanks`, `lastScheduledWeek`, `playerSchedule`                                                                                             |
| `src/main/value/build.ts` (modify)                                                                                        | wire signals + schedule into rows, `ValueBuild.schedules`, `detailFor`                                                                                       |
| `src/renderer/src/lib/format.ts` (modify)                                                                                 | `fmtSignedPct`                                                                                                                                               |
| `src/renderer/src/lib/playersTableView.ts` (modify)                                                                       | `signal` column kind, `SignalField`, SOS/BYES + Signals columns, `signalValue` / `signalText` / `signalTone`, `primaryUsage`, `sosTone`, sort + header title |
| `src/renderer/src/screens/PlayersScreen.tsx` (modify)                                                                     | signal cells (text + tone)                                                                                                                                   |
| `src/renderer/src/components/ValueHelp.tsx` (modify)                                                                      | Signals definitions from the column descriptions + defense-vs-position term                                                                                  |
| `src/renderer/src/lib/charts.ts` (create)                                                                                 | `barsLayout`, `barPath`, `sparklinePoints` — pure geometry                                                                                                   |
| `src/renderer/src/components/BarsVsMarker.tsx`, `Sparkline.tsx` (create)                                                  | inline SVG over the helpers                                                                                                                                  |
| `src/renderer/src/lib/detailView.ts` (create)                                                                             | `signalLines`, `usageRows`, `barItems` — panel view model                                                                                                    |
| `src/renderer/src/components/PlayerDetailPanel.tsx` (modify)                                                              | header strip opponent/byes; sections 2–5                                                                                                                     |
| `tests/fixtures/season.ts` (modify)                                                                                       | week-5 game so a bye exists; MIN–CHI rematch so a ranked opponent exists                                                                                     |
| `tests/fixtures/signals.ts` (create)                                                                                      | `signalsFixture()` for the renderer tests                                                                                                                    |
| `tests/main/value/signals.test.ts`, `schedule.test.ts` (create); `series.test.ts`, `build.test.ts` (modify)               | main-process tests                                                                                                                                           |
| `tests/renderer/lib/charts.test.ts`, `detailView.test.ts` (create); `playersTableView.test.ts`, `format.test.ts` (modify) | renderer tests                                                                                                                                               |

---

### Task 1: Signal types, schedule on the bundle, fixture week 5

Types only + one field on the bundle; the build fills `signals: null` / `schedule: []` until Task 4 so the app keeps typechecking and behaving exactly as `v0.5.0`.

**Files:**

- Modify: `src/shared/types.ts:111-162` (after `ReplacementLevel`; `PlayerValueRow`; `PlayerDetail`)
- Modify: `src/main/value/series.ts:52-60` (`SeriesBundle`), `:213-221` (return)
- Modify: `src/main/value/build.ts:132-144` (rows), `:158-180` (`detailFor`)
- Modify: `tests/fixtures/season.ts:127-139` (games), `:157-165` (week-4 projections)
- Modify: `tests/renderer/lib/playersTableView.test.ts:40-60` (`valueRow` literal)
- Modify: `tests/main/value/series.test.ts:40`, `tests/main/value/build.test.ts:85`

**Interfaces:**

- Produces: `Trend`, `UsageTrend`, `UsageMetric`, `PlayerSignals`, `ScheduleEntry` (shared); `PlayerValueRow.signals: PlayerSignals | null`; `PlayerDetail.schedule: ScheduleEntry[]`; `SeriesBundle.schedule: Map<string, Map<number, string>>` (Sleeper team → week → Sleeper opponent).

- [x] **Step 1: Add the shared types**

In `src/shared/types.ts`, directly after the `ReplacementLevel` interface:

```ts
export type Trend = 'rising' | 'flat' | 'falling'

/** A usage metric over the games that have it: season mean, last-3 mean, and their comparison (spec §3.1). */
export interface UsageTrend {
  season: number
  recent: number
  trend: Trend
}

export type UsageMetric = 'snapPct' | 'targetShare' | 'rushShare' | 'airYardsShare' | 'wopr'

/** Spec §3; a field is null when its gate (games, projections, schedule) is not met. */
export interface PlayerSignals {
  usage: Record<UsageMetric, UsageTrend | null>
  /** Actual − expected TDs (opportunities × the position's TD rate). */
  tdDelta: number | null
  /** 'down' = scored well over expectation (regression candidate), 'up' = well under. */
  tdFlag: 'up' | 'down' | null
  /** Yards per opportunity and its distance from the position's mean. */
  ypo: number | null
  ypoDelta: number | null
  /** Points − projection over played weeks that had a projection; pct relative to the projection. */
  vsProjPoints: number | null
  vsProjPct: number | null
  /** 25th / 75th percentile and population stdev of weekly points (3+ games). */
  floor: number | null
  ceiling: number | null
  stdev: number | null
  /** Share of games at or above the position's replacement PPG (3+ games). */
  startRate: number | null
  /** Sleeper team code + defense-vs-position rank (1 = allows the fewest); rank null until that defense has played. */
  nextOpponent: { team: string; rank: number | null } | null
  /** Mean rank of the ranked remaining opponents. */
  rosSos: number | null
  byesRemaining: number
}

/** One remaining week of a player's team; opponent null on a bye. */
export interface ScheduleEntry {
  week: number
  opponent: string | null
  rank: number | null
}
```

In `PlayerValueRow`, before `statsAvailable`:

```ts
/** null for players unmatched to nflverse. */
signals: PlayerSignals | null
```

In `PlayerDetail`, after `weeks`:

```ts
  /** Remaining weeks (≥ current week, not yet played) of the player's team, byes included. */
  schedule: ScheduleEntry[]
```

- [x] **Step 2: Expose the schedule on the bundle**

In `src/main/value/series.ts`, add to `SeriesBundle` after `rules`:

```ts
/** Sleeper team → week → Sleeper opponent, regular season. */
schedule: Map<string, Map<number, string>>
```

Replace the final `return { ... }` of `loadSeries` with:

```ts
const sleeperSchedule = new Map<string, Map<number, string>>()
for (const [team, weeks] of schedule) {
  sleeperSchedule.set(
    toSleeperTeam(team),
    new Map([...weeks].map(([week, opponent]) => [week, toSleeperTeam(opponent)]))
  )
}

return {
  season,
  currentWeek,
  projectionsStored: projectionRows.length > 0,
  teamCount: league?.totalRosters ?? 0,
  rules,
  schedule: sleeperSchedule,
  players
}
```

- [x] **Step 3: Stub the new fields in the build**

In `src/main/value/build.ts`, inside the `rows` map add `signals: null,` before `statsAvailable`, and in `detailFor` add `schedule: []` after the `weeks` array (both replaced in Task 4).

- [x] **Step 4: Extend the fixture and the fixture-dependent assertions**

In `tests/fixtures/season.ts`, `upsertGames` list: change `game('g10', 4, 'MIN', 'GB')` to `game('g10', 4, 'MIN', 'CHI')` and append `game('g12', 5, 'PHI', 'LA')` after `g11`. In the week-4 projections change Jefferson's to `proj('6794', 4, { rec: 6, rec_yd: 90 }, 'CHI')`. Update the doc comment's last sentence to: `Games run to week 5 (PHI–LA), so week 5 is a bye for MIN; MIN meets CHI again in week 4.`

`tests/main/value/series.test.ts` line 40: `expect(barkley?.weeks.map((w) => w.week)).toEqual([1, 2, 3, 4, 5])`.
`tests/main/value/build.test.ts` line 85: `expect(detail?.weeks.map((w) => w.week)).toEqual([1, 2, 3, 4, 5])`.
`tests/renderer/lib/playersTableView.test.ts` `valueRow` literal: add `signals: null,` before `statsAvailable: true`.

- [x] **Step 5: Write the failing series test**

Append to the `loadSeries` describe in `tests/main/value/series.test.ts`:

```ts
it('exposes the regular-season schedule in Sleeper codes', () => {
  const bundle = loadSeries(db, 'L1', SEASON)
  expect(bundle.schedule.get('LAR')?.get(1)).toBe('HOU')
  expect(bundle.schedule.get('PHI')?.get(5)).toBe('LAR')
  expect(bundle.schedule.get('MIN')?.has(2)).toBe(false)
})
```

- [x] **Step 6: Verify**

Run: `npm run typecheck && npm run lint && npm test`
Expected: all green (203 tests: 201 + the schedule test; the fixture changes keep every Plan E number — Barkley's ROS is still 8 because week 5 has no projection).

- [x] **Step 7: Commit**

```bash
git checkout -b feat/signals
git add src/shared/types.ts src/main/value/series.ts src/main/value/build.ts tests/fixtures/season.ts tests/main/value tests/renderer/lib/playersTableView.test.ts
git commit -m "feat(value): add signal types and the season schedule"
```

---

### Task 2: `signals.ts` — trends, efficiency, consistency (pure)

**Files:**

- Create: `src/main/value/signals.ts`
- Test: `tests/main/value/signals.test.ts`

**Interfaces:**

- Consumes: `PlayerSeries`, `SeriesWeek` (`series.ts`); `PlayerSignals`, `UsageMetric`, `UsageTrend`, `Trend` (Task 1); `round2` (`@main/db/repos/points`).
- Produces: constants above; `usageTrend(values: number[], threshold: number): UsageTrend | null`; `opportunities(position: string | null, line: Record<string, number>): number | null`; `production(position, line): { tds: number; yards: number }`; `PositionTotals { opportunities; tds; yards }`; `positionTotals(players: PlayerSeries[]): Map<string, PositionTotals>`; `percentile(values: number[], p: number): number`; `stdev(values: number[]): number`; `StatSignals = Omit<PlayerSignals, 'nextOpponent' | 'rosSos' | 'byesRemaining'>`; `statSignals(series: PlayerSeries, totals: PositionTotals | undefined, replacementPpg: number | null): StatSignals`.

- [x] **Step 1: Write the failing tests**

`tests/main/value/signals.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import type { PlayerSeries, SeriesWeek } from '@main/value/series'
import {
  opportunities,
  percentile,
  positionTotals,
  production,
  SHARE_TREND_THRESHOLD,
  SNAP_TREND_THRESHOLD,
  statSignals,
  stdev,
  TD_FLAG_THRESHOLD,
  usageTrend
} from '@main/value/signals'

const week = (over: Partial<SeriesWeek> = {}): SeriesWeek => ({
  week: 1,
  opponent: null,
  played: true,
  points: 10,
  projected: null,
  line: {},
  snapPct: null,
  targetShare: null,
  rushShare: null,
  airYardsShare: null,
  wopr: null,
  ...over
})
const series = (position: string | null, weeks: SeriesWeek[]): PlayerSeries => ({
  base: {
    playerId: 'p',
    fullName: 'P',
    position,
    team: 'PHI',
    byeWeek: null,
    injuryStatus: null,
    rookie: false,
    watched: false,
    ownerRosterId: null,
    ownerName: null
  },
  statsAvailable: true,
  weeks: weeks.map((w, i) => ({ ...w, week: i + 1 }))
})

describe('usageTrend', () => {
  it('labels at the threshold (inclusive) in both directions', () => {
    expect(usageTrend([0, 0, 0, 0.5, 0.5, 0.5], 0.25)).toEqual({
      season: 0.25,
      recent: 0.5,
      trend: 'rising'
    })
    expect(usageTrend([0.5, 0.5, 0.5, 0, 0, 0], 0.25)?.trend).toBe('falling')
    expect(usageTrend([0, 0, 0, 0.5, 0.5, 0.5], 0.26)?.trend).toBe('flat')
    expect(SHARE_TREND_THRESHOLD).toBe(0.03)
    expect(SNAP_TREND_THRESHOLD).toBe(0.05)
  })

  it('needs two games; with fewer than three the recent window is the season', () => {
    expect(usageTrend([0.5], 0.03)).toBeNull()
    expect(usageTrend([0.5, 0.75], 0.03)).toEqual({ season: 0.625, recent: 0.625, trend: 'flat' })
  })
})

describe('opportunities / production', () => {
  it('counts targets + carries, pass attempts + carries for a QB, nothing for K / DEF', () => {
    expect(opportunities('RB', { rec_tgt: 4, rush_att: 18 })).toBe(22)
    expect(opportunities('WR', { rec_tgt: 9 })).toBe(9)
    expect(opportunities('QB', { pass_att: 30, rush_att: 5 })).toBe(35)
    expect(opportunities('K', { fga: 3 })).toBeNull()
    expect(opportunities('DEF', {})).toBeNull()
    expect(opportunities(null, {})).toBeNull()
  })

  it('adds passing TDs and yards for a QB only', () => {
    expect(production('QB', { pass_td: 2, rush_td: 1, pass_yd: 250, rush_yd: 20 })).toEqual({
      tds: 3,
      yards: 270
    })
    expect(production('WR', { rec_td: 1, rec_yd: 80, rush_yd: 5, pass_td: 1 })).toEqual({
      tds: 1,
      yards: 85
    })
  })

  it('sums the position over every player and played week', () => {
    const totals = positionTotals([
      series('RB', [
        week({ line: { rush_att: 10, rush_td: 1, rush_yd: 50 } }),
        week({ line: { rush_att: 10, rec_tgt: 2, rec_yd: 20 } }),
        week({ played: false, line: { rush_att: 99 } })
      ]),
      series('RB', [week({ line: { rush_att: 5, rush_yd: 30 } })]),
      series('K', [week({ line: { fga: 3 } })])
    ])
    expect(totals.get('RB')).toEqual({ opportunities: 27, tds: 1, yards: 100 })
    expect(totals.has('K')).toBe(false)
  })
})

describe('percentile / stdev', () => {
  it('interpolates linearly between ranks', () => {
    expect(percentile([4, 1, 3, 2], 0.25)).toBe(1.75)
    expect(percentile([4, 1, 3, 2], 0.75)).toBe(3.25)
    expect(percentile([5], 0.5)).toBe(5)
  })

  it('is the population standard deviation', () => {
    expect(stdev([2, 4, 4, 4, 5, 5, 7, 9])).toBe(2)
  })
})

describe('statSignals', () => {
  // position: 1 000 opportunities, 50 TDs (rate 0.05), 10 000 yards (10 per opportunity)
  const totals = { opportunities: 1000, tds: 50, yards: 10000 }
  const wr = (tdsPerGame: number[]): PlayerSeries =>
    series(
      'WR',
      tdsPerGame.map((td) => week({ line: { rec_tgt: 10, rec_td: td, rec_yd: 120 } }))
    )

  it('flags TD regression at ±TD_FLAG_THRESHOLD and measures yards per opportunity', () => {
    expect(TD_FLAG_THRESHOLD).toBe(1.5)
    // 30 opportunities → 1.5 expected TDs
    expect(statSignals(wr([1, 1, 1]), totals, null)).toMatchObject({
      tdDelta: 1.5,
      tdFlag: 'down',
      ypo: 12,
      ypoDelta: 2
    })
    expect(statSignals(wr([0, 0, 0]), totals, null)).toMatchObject({ tdDelta: -1.5, tdFlag: 'up' })
    expect(statSignals(wr([1, 1, 0]), totals, null)).toMatchObject({ tdDelta: 0.5, tdFlag: null })
    // no opportunities yet, or no positional totals → nothing to compare
    expect(statSignals(series('WR', [week()]), totals, null)).toMatchObject({
      tdDelta: null,
      tdFlag: null,
      ypo: null,
      ypoDelta: null
    })
    expect(statSignals(wr([1]), undefined, null)).toMatchObject({ tdDelta: null, ypoDelta: null })
    expect(statSignals(series('K', [week({ line: { fgm: 2 } })]), undefined, null)).toMatchObject({
      tdDelta: null,
      ypo: null
    })
  })

  it('compares points with the projection over played weeks that had one', () => {
    const s = statSignals(
      series('RB', [
        week({ points: 10, projected: 8 }),
        week({ points: 12, projected: 8 }),
        week({ points: 20, projected: null }),
        week({ played: false, points: null, projected: 15 })
      ]),
      undefined,
      null
    )
    expect(s).toMatchObject({ vsProjPoints: 6 })
    expect(s.vsProjPct).toBeCloseTo(0.375)
    expect(
      statSignals(series('RB', [week({ points: 3, projected: 0 })]), undefined, null)
    ).toMatchObject({
      vsProjPoints: 3,
      vsProjPct: null
    })
    expect(statSignals(series('RB', [week({ points: 3 })]), undefined, null)).toMatchObject({
      vsProjPoints: null,
      vsProjPct: null
    })
  })

  it('reports consistency from three games and the start rate against the replacement PPG', () => {
    const three = series('RB', [week({ points: 6 }), week({ points: 10 }), week({ points: 20 })])
    const s = statSignals(three, undefined, 10)
    expect(s).toMatchObject({ floor: 8, ceiling: 15, stdev: 5.89 })
    expect(s.startRate).toBeCloseTo(2 / 3)
    expect(statSignals(three, undefined, null).startRate).toBeNull()
    const two = series('RB', [week({ points: 6 }), week({ points: 10 })])
    expect(statSignals(two, undefined, 10)).toMatchObject({
      floor: null,
      ceiling: null,
      stdev: null,
      startRate: null
    })
  })

  it('builds usage trends per metric from the played games that have it', () => {
    const s = statSignals(
      series('RB', [
        week({ snapPct: 0.6, rushShare: 0.4 }),
        week({ snapPct: 0.6, rushShare: 0.4 }),
        week({ snapPct: 0.6, rushShare: 0.4 }),
        week({ snapPct: 0.9, rushShare: 0.4 }),
        week({ snapPct: 0.9, rushShare: 0.4 }),
        week({ snapPct: 0.9, rushShare: 0.4 }),
        week({ snapPct: null, rushShare: null }),
        week({ played: false, points: null, snapPct: 0.1 })
      ]),
      undefined,
      null
    )
    expect(s.usage.snapPct?.trend).toBe('rising')
    expect(s.usage.snapPct?.season).toBeCloseTo(0.75)
    expect(s.usage.snapPct?.recent).toBeCloseTo(0.9)
    expect(s.usage.rushShare).toMatchObject({ trend: 'flat' })
    expect(s.usage.targetShare).toBeNull()
    expect(s.usage.airYardsShare).toBeNull()
    expect(s.usage.wopr).toBeNull()
  })
})
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/main/value/signals.test.ts`
Expected: FAIL — `Cannot find module '@main/value/signals'`.

- [x] **Step 3: Implement `signals.ts`**

`src/main/value/signals.ts`:

```ts
import { round2 } from '@main/db/repos/points'
import type { PlayerSignals, Trend, UsageMetric, UsageTrend } from '@shared/types'
import type { PlayerSeries } from './series'

/** Games in the "recent" window of a usage trend (spec §3.1). */
export const RECENT_GAMES = 3
/** recent − season from which a share (target, rush, air yards, WOPR) counts as rising / falling. */
export const SHARE_TREND_THRESHOLD = 0.03
/** Same for snap %. */
export const SNAP_TREND_THRESHOLD = 0.05
/** Games with the metric needed before a trend is reported. */
export const MIN_GAMES_USAGE = 2
/** Games needed before floor / ceiling / stdev / start rate are reported (spec §3.3). */
export const MIN_GAMES_CONSISTENCY = 3
/** |actual − expected TDs| from which the regression flag is set (spec §3.2). */
export const TD_FLAG_THRESHOLD = 1.5
/** Positions with opportunities; K and DEF have none. */
export const OPPORTUNITY_POSITIONS: readonly string[] = ['QB', 'RB', 'WR', 'TE']

const USAGE_THRESHOLDS: Record<UsageMetric, number> = {
  snapPct: SNAP_TREND_THRESHOLD,
  targetShare: SHARE_TREND_THRESHOLD,
  rushShare: SHARE_TREND_THRESHOLD,
  airYardsShare: SHARE_TREND_THRESHOLD,
  wopr: SHARE_TREND_THRESHOLD
}

const mean = (values: number[]): number => values.reduce((s, v) => s + v, 0) / values.length

/** Season mean vs last-RECENT_GAMES mean over the games that have the metric, oldest first. */
export function usageTrend(values: number[], threshold: number): UsageTrend | null {
  if (values.length < MIN_GAMES_USAGE) return null
  const season = mean(values)
  const recent = mean(values.slice(-RECENT_GAMES))
  const diff = recent - season
  const trend: Trend = diff >= threshold ? 'rising' : diff <= -threshold ? 'falling' : 'flat'
  return { season, recent, trend }
}

/** Opportunities of one line in Sleeper keys: targets + carries, pass attempts + carries for a QB. */
export function opportunities(
  position: string | null,
  line: Record<string, number>
): number | null {
  if (position === 'QB') return (line.pass_att ?? 0) + (line.rush_att ?? 0)
  if (position === 'RB' || position === 'WR' || position === 'TE')
    return (line.rec_tgt ?? 0) + (line.rush_att ?? 0)
  return null
}

/** TDs and yards earned on those opportunities: rushing + receiving, plus passing for a QB. */
export function production(
  position: string | null,
  line: Record<string, number>
): { tds: number; yards: number } {
  const passing = position === 'QB'
  return {
    tds: (line.rush_td ?? 0) + (line.rec_td ?? 0) + (passing ? (line.pass_td ?? 0) : 0),
    yards: (line.rush_yd ?? 0) + (line.rec_yd ?? 0) + (passing ? (line.pass_yd ?? 0) : 0)
  }
}

export interface PositionTotals {
  opportunities: number
  tds: number
  yards: number
}

function sumProduction(position: string | null, series: PlayerSeries): PositionTotals {
  const totals: PositionTotals = { opportunities: 0, tds: 0, yards: 0 }
  for (const w of series.weeks) {
    if (!w.played) continue
    totals.opportunities += opportunities(position, w.line) ?? 0
    const { tds, yards } = production(position, w.line)
    totals.tds += tds
    totals.yards += yards
  }
  return totals
}

/** League-wide sums per position over every candidate's played games (spec §3.2 rates). */
export function positionTotals(players: PlayerSeries[]): Map<string, PositionTotals> {
  const totals = new Map<string, PositionTotals>()
  for (const p of players) {
    const pos = p.base.position
    if (pos === null || !OPPORTUNITY_POSITIONS.includes(pos)) continue
    const t = totals.get(pos) ?? { opportunities: 0, tds: 0, yards: 0 }
    const own = sumProduction(pos, p)
    t.opportunities += own.opportunities
    t.tds += own.tds
    t.yards += own.yards
    totals.set(pos, t)
  }
  return totals
}

/** p-th percentile (0..1) with linear interpolation between the two nearest ranks. */
export function percentile(values: number[], p: number): number {
  const sorted = [...values].sort((a, b) => a - b)
  const index = (sorted.length - 1) * p
  const lo = Math.floor(index)
  const hi = Math.ceil(index)
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (index - lo)
}

/** Population standard deviation. */
export function stdev(values: number[]): number {
  const m = mean(values)
  return Math.sqrt(mean(values.map((v) => (v - m) ** 2)))
}

/** Everything in PlayerSignals except the schedule fields, which schedule.ts produces. */
export type StatSignals = Omit<PlayerSignals, 'nextOpponent' | 'rosSos' | 'byesRemaining'>

/** Spec §3.1–3.3 for one player; `totals` is the position's league-wide sum, `replacementPpg` its STD replacement level. */
export function statSignals(
  series: PlayerSeries,
  totals: PositionTotals | undefined,
  replacementPpg: number | null
): StatSignals {
  const position = series.base.position
  const played = series.weeks.filter((w) => w.played)

  const trend = (metric: UsageMetric): UsageTrend | null =>
    usageTrend(
      played.flatMap((w) => {
        const v = w[metric]
        return v === null ? [] : [v]
      }),
      USAGE_THRESHOLDS[metric]
    )
  const usage: PlayerSignals['usage'] = {
    snapPct: trend('snapPct'),
    targetShare: trend('targetShare'),
    rushShare: trend('rushShare'),
    airYardsShare: trend('airYardsShare'),
    wopr: trend('wopr')
  }

  const own = sumProduction(position, series)
  const hasRate = totals !== undefined && totals.opportunities > 0
  const tdDelta =
    hasRate && own.opportunities > 0
      ? round2(own.tds - own.opportunities * (totals.tds / totals.opportunities))
      : null
  const ypo = own.opportunities > 0 ? round2(own.yards / own.opportunities) : null
  const ypoDelta =
    hasRate && own.opportunities > 0
      ? round2(own.yards / own.opportunities - totals.yards / totals.opportunities)
      : null

  const withProjection = played.filter((w) => w.projected !== null)
  const actual = withProjection.reduce((s, w) => s + (w.points ?? 0), 0)
  const projected = withProjection.reduce((s, w) => s + (w.projected ?? 0), 0)

  const points = played.map((w) => w.points ?? 0)
  const enough = points.length >= MIN_GAMES_CONSISTENCY

  return {
    usage,
    tdDelta,
    tdFlag:
      tdDelta === null
        ? null
        : tdDelta >= TD_FLAG_THRESHOLD
          ? 'down'
          : tdDelta <= -TD_FLAG_THRESHOLD
            ? 'up'
            : null,
    ypo,
    ypoDelta,
    vsProjPoints: withProjection.length > 0 ? round2(actual - projected) : null,
    vsProjPct: withProjection.length > 0 && projected > 0 ? (actual - projected) / projected : null,
    floor: enough ? round2(percentile(points, 0.25)) : null,
    ceiling: enough ? round2(percentile(points, 0.75)) : null,
    stdev: enough ? round2(stdev(points)) : null,
    startRate:
      enough && replacementPpg !== null
        ? points.filter((p) => p >= replacementPpg).length / points.length
        : null
  }
}
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/main/value/signals.test.ts`
Expected: PASS (10 tests). If `stdev: 5.89` is off by 0.01, check that `round2` is applied to the _unrounded_ stdev (√(104/3) = 5.888 → 5.89).

- [x] **Step 5: Verify and commit**

Run: `npm run typecheck && npm run lint && npm test`

```bash
git add src/main/value/signals.ts tests/main/value/signals.test.ts
git commit -m "feat(value): usage, regression and consistency signals"
```

---

### Task 3: `schedule.ts` — defense-vs-position ranks and the remaining schedule (pure)

**Files:**

- Create: `src/main/value/schedule.ts`
- Test: `tests/main/value/schedule.test.ts`

**Interfaces:**

- Consumes: `PlayerSeries` (`series.ts`); `PlayerSignals`, `ScheduleEntry` (Task 1); `round2`.
- Produces: `TeamSchedule = Map<string, Map<number, string>>`; `DefenseRanks = Map<string, Map<string, number>>` (defense → position → rank); `defenseRanks(players: PlayerSeries[]): DefenseRanks`; `lastScheduledWeek(schedule: TeamSchedule): number`; `PlayerSchedule { entries: ScheduleEntry[]; nextOpponent: PlayerSignals['nextOpponent']; rosSos: number | null; byesRemaining: number }`; `playerSchedule(series, schedule, ranks, currentWeek, lastWeek?): PlayerSchedule`.

- [x] **Step 1: Write the failing tests**

`tests/main/value/schedule.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  defenseRanks,
  lastScheduledWeek,
  playerSchedule,
  type TeamSchedule
} from '@main/value/schedule'
import type { PlayerSeries, SeriesWeek } from '@main/value/series'

const played = (week: number, opponent: string, points: number): SeriesWeek => ({
  week,
  opponent,
  played: true,
  points,
  projected: null,
  line: {},
  snapPct: null,
  targetShare: null,
  rushShare: null,
  airYardsShare: null,
  wopr: null
})
const player = (
  id: string,
  position: string | null,
  team: string | null,
  weeks: SeriesWeek[]
): PlayerSeries => ({
  base: {
    playerId: id,
    fullName: id,
    position,
    team,
    byeWeek: null,
    injuryStatus: null,
    rookie: false,
    watched: false,
    ownerRosterId: null,
    ownerName: null
  },
  statsAvailable: true,
  weeks
})

// Four teams; A's season: B, C, D, B, bye, C. Week 6 is the last scheduled week.
const schedule: TeamSchedule = new Map([
  [
    'A',
    new Map([
      [1, 'B'],
      [2, 'C'],
      [3, 'D'],
      [4, 'B'],
      [6, 'C']
    ])
  ],
  [
    'B',
    new Map([
      [1, 'A'],
      [4, 'A']
    ])
  ],
  [
    'C',
    new Map([
      [1, 'D'],
      [2, 'A'],
      [6, 'A']
    ])
  ],
  [
    'D',
    new Map([
      [1, 'C'],
      [3, 'A']
    ])
  ]
])
const players = [
  player('rb1', 'RB', 'A', [played(1, 'B', 10), played(2, 'C', 20)]),
  player('rb2', 'RB', 'D', [played(1, 'C', 30)]),
  player('wr1', 'WR', 'A', [played(1, 'B', 5)]),
  player('k1', 'K', 'A', [played(1, 'B', 7)]),
  player('def', 'DEF', 'A', [played(1, 'B', 12)]),
  player('nopos', null, 'A', [played(1, 'B', 99)])
]

describe('defenseRanks', () => {
  const ranks = defenseRanks(players)

  it('ranks each defense per position by points allowed per played game, fewest first', () => {
    // RB: B allowed 10 in 1 game; C allowed 20 + 30 over 2 games (weeks 1 and 2) → 25
    expect(ranks.get('B')?.get('RB')).toBe(1)
    expect(ranks.get('C')?.get('RB')).toBe(2)
    // C has played but faced no WR → 0 allowed → hardest; B allowed 5
    expect(ranks.get('C')?.get('WR')).toBe(1)
    expect(ranks.get('B')?.get('WR')).toBe(2)
  })

  it('is uniform for K and DEF and ignores players without a position', () => {
    expect(ranks.get('B')?.get('K')).toBe(2)
    expect(ranks.get('B')?.get('DEF')).toBe(2)
    expect(ranks.get('C')?.get('K')).toBe(1)
    expect([...(ranks.get('B')?.keys() ?? [])]).not.toContain('')
  })

  it('leaves defenses that have not played unranked', () => {
    expect(ranks.has('D')).toBe(false)
    expect(ranks.has('A')).toBe(false)
    expect(defenseRanks([]).size).toBe(0)
  })
})

describe('lastScheduledWeek', () => {
  it('is the latest week with any game, 0 without games', () => {
    expect(lastScheduledWeek(schedule)).toBe(6)
    expect(lastScheduledWeek(new Map())).toBe(0)
  })
})

describe('playerSchedule', () => {
  const ranks = defenseRanks(players)
  const rb1 = players[0]

  it('lists the remaining weeks with opponent and rank, byes as gaps', () => {
    const s = playerSchedule(rb1, schedule, ranks, 3)
    expect(s.entries).toEqual([
      { week: 3, opponent: 'D', rank: null },
      { week: 4, opponent: 'B', rank: 1 },
      { week: 5, opponent: null, rank: null },
      { week: 6, opponent: 'C', rank: 2 }
    ])
    expect(s.nextOpponent).toEqual({ team: 'D', rank: null })
    expect(s.rosSos).toBe(1.5)
    expect(s.byesRemaining).toBe(1)
  })

  it('has no next opponent on a bye week and none at season end', () => {
    const bye = playerSchedule(rb1, schedule, ranks, 5)
    expect(bye.nextOpponent).toBeNull()
    expect(bye.entries.map((e) => e.week)).toEqual([5, 6])
    expect(bye.rosSos).toBe(2)
    const over = playerSchedule(rb1, schedule, ranks, 7)
    expect(over).toEqual({ entries: [], nextOpponent: null, rosSos: null, byesRemaining: 0 })
  })

  it('skips the current week once the player has played it (Thursday game)', () => {
    const thursday = player('rb1', 'RB', 'A', [...rb1.weeks, played(3, 'D', 9)])
    const s = playerSchedule(thursday, schedule, ranks, 3)
    expect(s.entries[0]).toEqual({ week: 4, opponent: 'B', rank: 1 })
    expect(s.nextOpponent).toEqual({ team: 'B', rank: 1 })
  })

  it('is empty for a player without a team or a team without games; ranks follow the position', () => {
    expect(playerSchedule(player('fa', 'RB', null, []), schedule, ranks, 1).entries).toEqual([])
    expect(playerSchedule(player('x', 'RB', 'ZZZ', []), schedule, ranks, 1).byesRemaining).toBe(0)
    const wr = playerSchedule(player('wr', 'WR', 'A', []), schedule, ranks, 4)
    expect(wr.entries[0]).toEqual({ week: 4, opponent: 'B', rank: 2 })
    expect(
      playerSchedule(player('n', null, 'A', []), schedule, ranks, 4).entries[0].rank
    ).toBeNull()
  })
})
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/main/value/schedule.test.ts`
Expected: FAIL — `Cannot find module '@main/value/schedule'`.

- [x] **Step 3: Implement `schedule.ts`**

`src/main/value/schedule.ts`:

```ts
import { round2 } from '@main/db/repos/points'
import type { PlayerSignals, ScheduleEntry } from '@shared/types'
import type { PlayerSeries } from './series'

/** Sleeper team → week → Sleeper opponent (SeriesBundle.schedule). */
export type TeamSchedule = Map<string, Map<number, string>>
/** Defense (Sleeper code) → position → rank; 1 = allows the fewest points to that position. */
export type DefenseRanks = Map<string, Map<string, number>>

/**
 * Spec §3.4: per defense and position, the mean per played game of the league points scored
 * against it by players at that position, ranked ascending. A defense's played games are the
 * weeks with any points row against it, so a defense that has not played has no rank.
 */
export function defenseRanks(players: PlayerSeries[]): DefenseRanks {
  const allowed = new Map<string, Map<string, number>>()
  const games = new Map<string, Set<number>>()
  const positions = new Set<string>()
  for (const p of players) {
    const pos = p.base.position
    if (pos === null) continue
    positions.add(pos)
    for (const w of p.weeks) {
      if (!w.played || w.opponent === null) continue
      if (!games.has(w.opponent)) games.set(w.opponent, new Set())
      games.get(w.opponent)?.add(w.week)
      if (!allowed.has(w.opponent)) allowed.set(w.opponent, new Map())
      const byPos = allowed.get(w.opponent)
      byPos?.set(pos, (byPos.get(pos) ?? 0) + (w.points ?? 0))
    }
  }
  const ranks: DefenseRanks = new Map()
  for (const pos of positions) {
    const means: { team: string; mean: number }[] = []
    for (const [team, weeks] of games) {
      means.push({ team, mean: (allowed.get(team)?.get(pos) ?? 0) / weeks.size })
    }
    means.sort((a, b) => a.mean - b.mean || a.team.localeCompare(b.team))
    means.forEach(({ team }, i) => {
      if (!ranks.has(team)) ranks.set(team, new Map())
      ranks.get(team)?.set(pos, i + 1)
    })
  }
  return ranks
}

/** Latest week with any game; byes are only counted up to it so a partial schedule never inflates them. */
export function lastScheduledWeek(schedule: TeamSchedule): number {
  let last = 0
  for (const weeks of schedule.values())
    for (const week of weeks.keys()) last = Math.max(last, week)
  return last
}

export interface PlayerSchedule {
  entries: ScheduleEntry[]
  nextOpponent: PlayerSignals['nextOpponent']
  rosSos: number | null
  byesRemaining: number
}

/**
 * Spec §3.4 per player: the remaining weeks (from `currentWeek`, not yet played) of the player's
 * team with each opponent's rank at the player's position; a week without a game is a bye.
 */
export function playerSchedule(
  series: PlayerSeries,
  schedule: TeamSchedule,
  ranks: DefenseRanks,
  currentWeek: number,
  lastWeek = lastScheduledWeek(schedule)
): PlayerSchedule {
  const teamWeeks = series.base.team ? schedule.get(series.base.team) : undefined
  const position = series.base.position
  const entries: ScheduleEntry[] = []
  if (teamWeeks) {
    const played = new Set(series.weeks.filter((w) => w.played).map((w) => w.week))
    for (let week = currentWeek; week <= lastWeek; week++) {
      if (played.has(week)) continue
      const opponent = teamWeeks.get(week) ?? null
      const rank =
        opponent !== null && position !== null ? (ranks.get(opponent)?.get(position) ?? null) : null
      entries.push({ week, opponent, rank })
    }
  }
  const first = entries[0]
  const ranked = entries.flatMap((e) => (e.rank === null ? [] : [e.rank]))
  return {
    entries,
    nextOpponent: first?.opponent ? { team: first.opponent, rank: first.rank } : null,
    rosSos: ranked.length > 0 ? round2(ranked.reduce((s, r) => s + r, 0) / ranked.length) : null,
    byesRemaining: entries.filter((e) => e.opponent === null).length
  }
}
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/main/value/schedule.test.ts`
Expected: PASS (8 tests).

- [x] **Step 5: Verify and commit**

Run: `npm run typecheck && npm run lint && npm test`

```bash
git add src/main/value/schedule.ts tests/main/value/schedule.test.ts
git commit -m "feat(value): defense-vs-position ranks and schedule"
```

---

### Task 4: Build wiring — `signals` on every row, `schedule` in the detail

**Files:**

- Modify: `src/main/value/build.ts` (imports, `ValueBuild`, the `rows` map, return, `detailFor`)
- Test: `tests/main/value/build.test.ts`

**Interfaces:**

- Consumes: `positionTotals`, `statSignals` (Task 2); `defenseRanks`, `lastScheduledWeek`, `playerSchedule` (Task 3); `bundle.schedule` (Task 1); `stdLevels` (already in `assembleValue`).
- Produces: `ValueBuild.schedules: Map<string, ScheduleEntry[]>`; `PlayerValueRow.signals` filled; `detailFor(...).schedule` filled. `players.value` / `players.detail` in `handlers.ts` need no change — they serve `build.rows` and `detailFor` as before.

- [x] **Step 1: Write the failing tests**

Append to the `buildValueSeason` describe in `tests/main/value/build.test.ts`:

```ts
it('attaches signals: usage, efficiency, consistency and vs projection', () => {
  const s = row('4866')?.signals
  // snap % 0.83 / 0.90 (week 3 has no snap row): two games, recent = season → flat
  expect(s?.usage.snapPct?.trend).toBe('flat')
  expect(s?.usage.snapPct?.season).toBeCloseTo(0.865)
  expect(s?.usage.targetShare).toBeNull()
  // Barkley is the only RB with a stat line, so he *is* the RB rate: 48 opportunities, 1 TD, 182 yards
  expect(s?.tdDelta).toBeCloseTo(0)
  expect(s?.tdFlag).toBeNull()
  expect(s?.ypo).toBe(3.79)
  expect(s?.ypoDelta).toBeCloseTo(0)
  // week 3: 30 points against a 10-point projection
  expect(s).toMatchObject({ vsProjPoints: 20, vsProjPct: 2 })
  // points 20 / 10 / 30 against the RB replacement PPG of 12
  expect(s).toMatchObject({ floor: 15, ceiling: 25, stdev: 8.16 })
  expect(s?.startRate).toBeCloseTo(2 / 3)
  // one game: no trends, no consistency
  expect(row('6794')?.signals).toMatchObject({
    floor: null,
    startRate: null,
    usage: { snapPct: null, targetShare: null }
  })
  expect(row('8259')?.signals).toBeNull()
  expect(row('LAR')?.signals).toMatchObject({ tdDelta: null, ypo: null })
})

it('attaches the schedule: next opponent with its rank, SOS and byes', () => {
  // Barkley played week 3; PHI then hosts WAS (4) and LAR (5), neither ranked at RB yet
  expect(row('4866')?.signals).toMatchObject({
    nextOpponent: { team: 'WAS', rank: null },
    rosSos: null,
    byesRemaining: 0
  })
  // Jefferson: DET (3, unranked), CHI (4 — allowed his 25 WR points in week 1 → rank 1), no game in week 5
  expect(row('6794')?.signals).toMatchObject({
    nextOpponent: { team: 'DET', rank: null },
    rosSos: 1,
    byesRemaining: 1
  })
  expect(detailFor(build, '6794')?.schedule).toEqual([
    { week: 3, opponent: 'DET', rank: null },
    { week: 4, opponent: 'CHI', rank: 1 },
    { week: 5, opponent: null, rank: null }
  ])
  // BUF has no game in the fixture
  expect(detailFor(build, '8259')?.schedule).toEqual([])
})
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/main/value/build.test.ts`
Expected: FAIL — `signals` is `null` and `schedule` is `[]` (Task 1 stubs).

- [x] **Step 3: Wire the modules into `assembleValue` and `detailFor`**

In `src/main/value/build.ts`, imports:

```ts
import type { Db } from '@main/db/connection'
import { round2 } from '@main/db/repos/points'
import { LINEUP_POSITIONS } from '@shared/rules'
import type {
  PlayerDetail,
  PlayerSignals,
  PlayerValueRow,
  ScheduleEntry,
  ValueContext
} from '@shared/types'
import { replacementLevels } from './replacement'
import { defenseRanks, lastScheduledWeek, playerSchedule } from './schedule'
import { loadSeries, type PlayerSeries, type SeriesBundle } from './series'
import { positionTotals, statSignals } from './signals'
```

`ValueBuild`:

```ts
export interface ValueBuild {
  context: ValueContext
  rows: PlayerValueRow[]
  series: Map<string, PlayerSeries>
  /** Remaining weeks per player, for the detail panel. */
  schedules: Map<string, ScheduleEntry[]>
}
```

Replace the `const rows: PlayerValueRow[] = valued.map(...)` block with:

```ts
const totals = positionTotals(bundle.players)
const ranks = defenseRanks(bundle.players)
const lastWeek = lastScheduledWeek(bundle.schedule)
const schedules = new Map<string, ScheduleEntry[]>()

const rows: PlayerValueRow[] = valued.map((v) => {
  const series = v.a.series
  const pos = series.base.position ?? ''
  const sched = playerSchedule(series, bundle.schedule, ranks, bundle.currentWeek, lastWeek)
  schedules.set(series.base.playerId, sched.entries)
  const signals: PlayerSignals | null = series.statsAvailable
    ? {
        ...statSignals(series, totals.get(pos), stdLevels.get(pos)?.level ?? null),
        nextOpponent: sched.nextOpponent,
        rosSos: sched.rosSos,
        byesRemaining: sched.byesRemaining
      }
    : null
  return {
    ...series.base,
    gamesPlayed: v.a.gamesPlayed,
    ppg: v.a.ppg,
    stdValue: v.stdValue,
    stdRank: stdRanks.get(series.base.playerId) ?? null,
    rosPoints: v.a.rosPoints,
    rosValue: v.rosValue,
    rosRank: rosRanks.get(series.base.playerId) ?? null,
    overallRank: overallRanks.get(series.base.playerId) ?? null,
    signals,
    statsAvailable: series.statsAvailable
  }
})
```

Add `schedules` to the returned object (after `series`), and in `detailFor` replace the Task 1 stub with `schedule: build.schedules.get(playerId) ?? []`.

- [x] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/main/value/build.test.ts`
Expected: PASS (7 tests).

- [x] **Step 5: Measure the build on the dev DB**

Copy the Windows DB (with `-wal` and `-shm`) into the scratchpad and time `buildValueSeason` twice for the 2026 season (as in Plan E Task 6 step 4 — a one-off `tsx` script in the scratchpad, not committed). Expected: well inside the 500 ms budget (Plan E measured ≈ 90 ms; signals add one pass over the same weeks). Record the number in the progress notes at the end of this plan.

- [x] **Step 6: Verify and commit**

Run: `npm run typecheck && npm run lint && npm test`

```bash
git add src/main/value/build.ts tests/main/value/build.test.ts
git commit -m "feat(value): serve signals and schedule per player"
```

---

### Task 5: Table view model — SOS/BYES and the Signals group

**Files:**

- Modify: `src/renderer/src/lib/format.ts` (add `fmtSignedPct`)
- Modify: `src/renderer/src/lib/playersTableView.ts:16-31` (types), `:89-125` (columns, `columnGroups`), `:127-161` (`cellValue`, `cellText`), `:200-203` (`TableSort` doc), `:231-247` (`sortValue`), `:288-298` (`valueHeaderTitle`), plus new helpers at the end
- Create: `tests/fixtures/signals.ts`
- Test: `tests/renderer/lib/format.test.ts`, `tests/renderer/lib/playersTableView.test.ts`

**Interfaces:**

- Consumes: `PlayerSignals`, `UsageMetric`, `UsageTrend`, `Trend` (Task 1); `fmtPct`, `fmtSigned` (`format.ts`).
- Produces: `fmtSignedPct(value: number | null): string`; `ColumnKind` gains `'signal'`; `SignalField = 'rosSos' | 'byesRemaining' | 'floor' | 'ceiling' | 'startRate' | 'usage' | 'tdDelta' | 'vsProjPct'`; `CellFormat = 'int' | 'fixed' | 'signed' | 'pct' | 'signedPct'`; `Column.signal?: SignalField`; `PRIMARY_USAGE`, `primaryUsage(row: PlayerValueRow): UsageTrend | null`; `TREND_ARROW: Record<Trend, string>`; `signalValue(row: PlayerValueRow, field: SignalField): number | null`; `signalText(row: TableRow, col: Column): string`; `signalTone(row: TableRow, col: Column): 'pos' | 'neg' | null`; `SOS_HARD_MAX = 11`, `SOS_EASY_MIN = 22`, `sosTone(value: number | null): 'hard' | 'easy' | null`; `signalsFixture(over?): PlayerSignals` (test fixture).

- [x] **Step 1: Write the failing tests**

`tests/fixtures/signals.ts`:

```ts
import type { PlayerSignals, Trend, UsageTrend } from '@shared/types'

export const usageTrend = (season: number, recent: number, trend: Trend): UsageTrend => ({
  season,
  recent,
  trend
})

/** A fully populated PlayerSignals for renderer tests; override what a case needs. */
export function signalsFixture(over: Partial<PlayerSignals> = {}): PlayerSignals {
  return {
    usage: {
      snapPct: usageTrend(0.7, 0.8, 'rising'),
      targetShare: usageTrend(0.22, 0.24, 'flat'),
      rushShare: null,
      airYardsShare: null,
      wopr: usageTrend(0.5, 0.52, 'flat')
    },
    tdDelta: 1.8,
    tdFlag: 'down',
    ypo: 8.2,
    ypoDelta: -0.4,
    vsProjPoints: 12.3,
    vsProjPct: 0.09,
    floor: 6.1,
    ceiling: 17.4,
    stdev: 4.2,
    startRate: 0.63,
    nextOpponent: { team: 'DAL', rank: 12 },
    rosSos: 18.5,
    byesRemaining: 1,
    ...over
  }
}
```

In `tests/renderer/lib/format.test.ts`, add `fmtSignedPct` to the `@/lib/format` import and append a describe:

```ts
describe('fmtSignedPct', () => {
  it('signs a fraction as a whole percent', () => {
    expect(fmtSignedPct(0.09)).toBe('+9%')
    expect(fmtSignedPct(-0.126)).toBe('-13%')
    expect(fmtSignedPct(0)).toBe('0%')
    expect(fmtSignedPct(null)).toBe('—')
  })
})
```

In `tests/renderer/lib/playersTableView.test.ts`: import `signalsFixture` from `../../fixtures/signals`, import `signalText`, `signalTone`, `sosTone`, `type Column`, `type SignalField` from the lib; change the `valueRow` literal's `signals: null` to `signals: signalsFixture()`; then replace the `'has the same two groups on every tab'` test and add the others inside `describe('value mode')`:

```ts
it('has the same three groups on every tab', () => {
  for (const tab of ['ALL', 'QB', 'K', 'FLEX']) {
    const groups = columnGroups(tab, 'value')
    expect(groups.map((g) => g.label)).toEqual(['Season', 'Rest of season', 'Signals'])
    expect(groups.flatMap((g) => g.columns.map((c) => c.key))).toEqual([
      'value:gamesPlayed',
      'value:ppg',
      'value:stdValue',
      'value:stdRank',
      'value:rosPoints',
      'value:rosValue',
      'value:rosRank',
      'signal:rosSos',
      'signal:byesRemaining',
      'signal:floor',
      'signal:ceiling',
      'signal:startRate',
      'signal:usage',
      'signal:tdDelta',
      'signal:vsProjPct'
    ])
  }
})

const signalColumns = columnGroups('ALL', 'value')
  .flatMap((g) => g.columns)
  .filter((c) => c.kind === 'signal')
const signalCol = (field: SignalField): Column => {
  const col = signalColumns.find((c) => c.signal === field)
  if (!col) throw new Error(`no column for ${field}`)
  return col
}

it('reads signal cells: USAGE follows the position, TD is a badge, nulls render —', () => {
  const rb = valueRow({ position: 'RB' })
  expect(signalColumns.map((c) => signalText(rb, c))).toEqual([
    '18.5',
    '1',
    '6.1',
    '17.4',
    '63%',
    '80% ↑',
    '↓',
    '+9%'
  ])
  expect(signalText(valueRow({ position: 'WR' }), signalCol('usage'))).toBe('24% →')
  expect(signalText(valueRow({ position: 'TE' }), signalCol('usage'))).toBe('24% →')
  expect(signalText(valueRow({ position: 'QB' }), signalCol('usage'))).toBe('—')
  expect(
    signalText(valueRow({ signals: signalsFixture({ tdFlag: null }) }), signalCol('tdDelta'))
  ).toBe('')
  expect(signalText(valueRow({ signals: null }), signalCol('tdDelta'))).toBe('—')
  expect(signalText(valueRow({ signals: null }), signalCol('floor'))).toBe('—')
  expect(signalText(row(), signalCol('floor'))).toBe('—')
  expect(cellValue(rb, signalCol('usage'), 'value')).toBe(0.8)
  expect(cellValue(valueRow({ position: 'QB' }), signalCol('usage'), 'value')).toBeNull()
  expect(cellValue(rb, signalCol('byesRemaining'), 'value')).toBe(1)
  expect(cellValue(row(), signalCol('floor'), 'value')).toBeNull()
})

it('sorts by a signal with nulls last', () => {
  const rows = [
    valueRow({ playerId: 'a', fullName: 'A', signals: signalsFixture({ rosSos: 8 }) }),
    valueRow({ playerId: 'b', fullName: 'B', signals: null }),
    valueRow({ playerId: 'c', fullName: 'C', signals: signalsFixture({ rosSos: 25 }) })
  ]
  const ids = (sorted: typeof rows): string[] => sorted.map((r) => r.playerId)
  expect(ids(sortRows(rows, { key: 'signal:rosSos', dir: 'asc' }, 'value'))).toEqual([
    'a',
    'c',
    'b'
  ])
  expect(ids(sortRows(rows, { key: 'signal:rosSos', dir: 'desc' }, 'value'))).toEqual([
    'c',
    'a',
    'b'
  ])
})

it('tones SOS by difficulty, TD by regression direction, vs proj by sign', () => {
  expect(sosTone(11)).toBe('hard')
  expect(sosTone(11.5)).toBeNull()
  expect(sosTone(22)).toBe('easy')
  expect(sosTone(null)).toBeNull()
  const sos = signalCol('rosSos')
  expect(signalTone(valueRow({ signals: signalsFixture({ rosSos: 8 }) }), sos)).toBe('neg')
  expect(signalTone(valueRow({ signals: signalsFixture({ rosSos: 25 }) }), sos)).toBe('pos')
  expect(signalTone(valueRow(), sos)).toBeNull()
  expect(signalTone(valueRow(), signalCol('tdDelta'))).toBe('neg')
  expect(
    signalTone(valueRow({ signals: signalsFixture({ tdFlag: 'up' }) }), signalCol('tdDelta'))
  ).toBe('pos')
  expect(signalTone(valueRow(), signalCol('vsProjPct'))).toBe('pos')
  expect(
    signalTone(valueRow({ signals: signalsFixture({ vsProjPct: -0.2 }) }), signalCol('vsProjPct'))
  ).toBe('neg')
  expect(signalTone(valueRow(), signalCol('floor'))).toBeNull()
  expect(signalTone(row(), sos)).toBeNull()
})

it('titles signal headers with their description', () => {
  const floor = signalCol('floor')
  expect(valueHeaderTitle(floor, null, [])).toBe(floor.description)
})
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/renderer/lib`
Expected: FAIL — `fmtSignedPct`, `signalText`, `signalTone`, `sosTone` are not exported; three groups expected.

- [x] **Step 3: Add `fmtSignedPct`**

Append to `src/renderer/src/lib/format.ts`:

```ts
/** "+9%" / "-13%" / "0%" / "—" from a fraction. */
export function fmtSignedPct(value: number | null): string {
  if (value === null) return '—'
  const pct = Math.round(value * 100)
  return `${pct > 0 ? '+' : ''}${pct}%`
}
```

- [x] **Step 4: Extend the view model**

In `src/renderer/src/lib/playersTableView.ts`:

Imports — add `fmtSignedPct` to the `@/lib/format` import and `PlayerSignals`, `Trend`, `UsageMetric`, `UsageTrend` to the `@shared/types` type import.

Types (replace the `ColumnKind` line through the `Column` interface):

```ts
export type ColumnKind =
  'points' | 'delta' | 'stat' | 'snapPct' | 'targetShare' | 'value' | 'signal'
export type ValueField =
  'gamesPlayed' | 'ppg' | 'stdValue' | 'stdRank' | 'rosPoints' | 'rosValue' | 'rosRank'
/** `usage` is the position's primary metric (spec §3.1); the rest read PlayerSignals directly. */
export type SignalField =
  'rosSos' | 'byesRemaining' | 'floor' | 'ceiling' | 'startRate' | 'usage' | 'tdDelta' | 'vsProjPct'
export type CellFormat = 'int' | 'fixed' | 'signed' | 'pct' | 'signedPct'

export interface Column {
  /** Sort key (`points`, `delta`, `snapPct`, `targetShare`, `stat:<key>`, `value:<field>`, `signal:<field>`). */
  key: string
  label: string
  kind: ColumnKind
  statKey?: string
  field?: ValueField
  signal?: SignalField
  /** Value / signal columns: how the number renders. */
  format?: CellFormat
  /** Value / signal columns: one-line definition shown in the header tooltip and the help panel. */
  description?: string
}
```

Columns — after the `REST_OF_SEASON` group definition, replace it and add the Signals group:

```ts
const signal = (
  field: SignalField,
  label: string,
  format: CellFormat,
  description: string
): Column => ({
  key: `signal:${field}`,
  label,
  kind: 'signal',
  signal: field,
  format,
  description
})
const REST_OF_SEASON = group('Rest of season', [
  value(
    'rosPoints',
    'ROS',
    'fixed',
    "Projected points for the remaining weeks under this league's rules"
  ),
  value('rosValue', 'VAL', 'signed', "ROS minus the position's replacement ROS points"),
  value('rosRank', 'RK', 'int', 'Rank within position by ROS VAL'),
  signal(
    'rosSos',
    'SOS',
    'fixed',
    'Mean defense-vs-position rank of the remaining opponents: 1 = hardest, 32 = easiest'
  ),
  signal('byesRemaining', 'BYES', 'int', 'Remaining weeks without a game')
])
const SIGNALS = group('Signals', [
  signal('floor', 'FLOOR', 'fixed', '25th percentile of weekly points (3+ games)'),
  signal('ceiling', 'CEIL', 'fixed', '75th percentile of weekly points (3+ games)'),
  signal(
    'startRate',
    'START%',
    'pct',
    "Share of games scoring at least the position's replacement PPG (3+ games)"
  ),
  signal(
    'usage',
    'USAGE',
    'pct',
    'Target share (WR/TE) or snap % (RB) over the last 3 games; the arrow is the trend against the season mean'
  ),
  signal(
    'tdDelta',
    'TD',
    'signed',
    "TDs minus the TDs expected from opportunities at the position's rate: ↓ likely to regress, ↑ due for more"
  ),
  signal(
    'vsProjPct',
    'VS PROJ',
    'signedPct',
    "Points minus Sleeper's projection over played weeks, as a share of the projection"
  )
])
```

`columnGroups`: `if (mode === 'value') return [SEASON, REST_OF_SEASON, SIGNALS]`.

`cellValue` — add before `if (!isWeekRow(row)) return null`:

```ts
if (col.kind === 'signal')
  return col.signal && isValueRow(row) ? signalValue(row, col.signal) : null
```

`cellText` — replace the `if (col.kind === 'value') { ... }` block:

```ts
if (col.kind === 'value' || col.kind === 'signal') {
  if (col.format === 'int') return String(value)
  if (col.format === 'signed') return fmtSigned(value)
  if (col.format === 'pct') return fmtPct(value)
  if (col.format === 'signedPct') return fmtSignedPct(value)
  return value.toFixed(1)
}
```

`TableSort` doc comment: `/** 'points' | 'delta' | 'name' | 'snapPct' | 'targetShare' | \`stat:<key>\` | \`value:<field>\` | \`signal:<field>\` */`.

`sortValue` — after the `value:` line:

```ts
if (key.startsWith('signal:'))
  return isValueRow(row) ? signalValue(row, key.slice(7) as SignalField) : null
```

`valueHeaderTitle` first line: `if ((col.kind !== 'value' && col.kind !== 'signal') || !col.description) return undefined`.

Append the helpers at the end of the file:

```ts
/** Spec §3.1: the usage metric behind the USAGE column per position; QB, K and DEF have none. */
export const PRIMARY_USAGE: Partial<Record<string, UsageMetric>> = {
  RB: 'snapPct',
  WR: 'targetShare',
  TE: 'targetShare'
}

export function primaryUsage(row: PlayerValueRow): UsageTrend | null {
  const metric = row.position ? PRIMARY_USAGE[row.position] : undefined
  return metric && row.signals ? row.signals.usage[metric] : null
}

export const TREND_ARROW: Record<Trend, string> = { rising: '↑', flat: '→', falling: '↓' }

/** Numeric value of a signal column (sorting, colouring); USAGE is the primary metric's recent share. */
export function signalValue(row: PlayerValueRow, field: SignalField): number | null {
  const s: PlayerSignals | null = row.signals
  if (!s) return null
  if (field === 'usage') return primaryUsage(row)?.recent ?? null
  return s[field]
}

/** Text of a signal cell: USAGE = recent share + trend arrow, TD = the regression badge ('' without one), else the number; "—" for null. */
export function signalText(row: TableRow, col: Column): string {
  if (!col.signal || !isValueRow(row)) return '—'
  if (col.signal === 'usage') {
    const t = primaryUsage(row)
    return t ? `${fmtPct(t.recent)} ${TREND_ARROW[t.trend]}` : '—'
  }
  if (col.signal === 'tdDelta') {
    if (!row.signals || row.signals.tdDelta === null) return '—'
    return row.signals.tdFlag === 'down' ? '↓' : row.signals.tdFlag === 'up' ? '↑' : ''
  }
  return cellText(signalValue(row, col.signal), col, 'value')
}

/** SOS tint buckets (spec §6.1 "easy to hard"): ranks ≤ SOS_HARD_MAX read hard, ≥ SOS_EASY_MIN easy. */
export const SOS_HARD_MAX = 11
export const SOS_EASY_MIN = 22

export function sosTone(value: number | null): 'hard' | 'easy' | null {
  if (value === null) return null
  return value <= SOS_HARD_MAX ? 'hard' : value >= SOS_EASY_MIN ? 'easy' : null
}

/** Colour of a signal cell: SOS by difficulty, TD by regression direction (down = negative), vs proj by sign. */
export function signalTone(row: TableRow, col: Column): 'pos' | 'neg' | null {
  if (!isValueRow(row) || !row.signals) return null
  if (col.signal === 'rosSos') {
    const tone = sosTone(row.signals.rosSos)
    return tone === 'hard' ? 'neg' : tone === 'easy' ? 'pos' : null
  }
  if (col.signal === 'tdDelta') {
    const flag = row.signals.tdFlag
    return flag === 'down' ? 'neg' : flag === 'up' ? 'pos' : null
  }
  if (col.signal === 'vsProjPct') {
    const v = row.signals.vsProjPct
    return v === null ? null : v >= 0 ? 'pos' : 'neg'
  }
  return null
}
```

- [x] **Step 5: Run the tests to verify they pass**

Run: `npx vitest run tests/renderer/lib`
Expected: PASS. If `signalValue`'s `return s[field]` fails to type as `number | null`, the `field` narrowing lost `'usage'`; keep the `if (field === 'usage')` branch _before_ the indexed return.

- [x] **Step 6: Verify and commit**

Run: `npm run typecheck && npm run lint && npm test`

```bash
git add src/renderer/src/lib/format.ts src/renderer/src/lib/playersTableView.ts tests/fixtures/signals.ts tests/renderer/lib
git commit -m "feat(ui): signal columns in the players table view"
```

---

### Task 6: Signal cells on the Players screen and in the help panel

**Files:**

- Modify: `src/renderer/src/screens/PlayersScreen.tsx:404-423` (cell rendering) and its `@/lib/playersTableView` import
- Modify: `src/renderer/src/components/ValueHelp.tsx` (imports; after the first `</dl>`)

**Interfaces:**

- Consumes: `signalText`, `signalTone`, `isValueRow` (Task 5); `columnGroups` (existing).

- [x] **Step 1: Render signal cells**

In `PlayersScreen.tsx`, add `signalText`, `signalTone` to the `@/lib/playersTableView` import and replace the `{columns.map((col) => { ... })}` cell block with:

```tsx
{
  columns.map((col) => {
    const value =
      p.statsAvailable || effectiveMode !== 'stats' ? cellValue(p, col, effectiveMode) : null
    const signed = col.kind === 'delta' || col.format === 'signed'
    const tone =
      col.kind === 'signal'
        ? signalTone(p, col)
        : signed && value !== null
          ? value >= 0
            ? 'pos'
            : 'neg'
          : null
    return (
      <TableCell
        key={col.key}
        className={cn(
          'text-right tabular-nums',
          (col.kind === 'points' || col.field === 'rosValue') && 'font-medium',
          tone === 'pos' && 'text-pos-rb',
          tone === 'neg' && 'text-destructive'
        )}
      >
        {col.kind === 'signal' ? signalText(p, col) : cellText(value, col, effectiveMode)}
      </TableCell>
    )
  })
}
```

The column `<TableHead>` needs no change: `valueHeaderTitle` now covers signal columns, and `sortBy(col)` already sorts by `col.key`.

- [x] **Step 2: Explain the signals in the help panel**

In `ValueHelp.tsx`, import `columnGroups` from `@/lib/playersTableView`, and insert after the first `</dl>` (before `{context && (<Table ...`):

```tsx
      <h3 className="mt-5 text-sm font-semibold">Signals</h3>
      <dl className="mt-2 space-y-3 text-sm">
        {columnGroups('ALL', 'value')
          .flatMap((g) => g.columns)
          .filter((c) => c.kind === 'signal')
          .map((c) => (
            <Term key={c.key} name={c.label}>
              {c.description}
            </Term>
          ))}
        <Term name="Defense vs position">
          For every NFL defense, the league points it has allowed per game to each position this
          season, ranked from 1 (allows the fewest — hardest matchup) upwards. A defense is unranked
          until it has played. SOS averages the ranks of the remaining opponents; the detail panel
          shows every remaining week.
        </Term>
        <Term name="Gates">
          Usage trends need 2 games with the metric; floor, ceiling and start % need 3 games. Players
          not matched to nflverse have no signals.
        </Term>
      </dl>
```

- [x] **Step 3: Check in the dev app**

Run: `npx electron-vite dev -- --no-sandbox --disable-gpu --in-process-gpu` (WSL) or the plain dev command on Windows. In Value mode on the real league: the header row shows `Season · Rest of season · Signals`; `SOS` cells are red for low ranks and green for high ones; `USAGE` shows e.g. `27% ↑` for a WR and `—` for a QB; `TD` shows `↓` / `↑` / blank; clicking `FLOOR` sorts with dashes last; hovering a signal header shows its definition; the ⓘ panel lists the Signals terms.

- [x] **Step 4: Verify and commit**

Run: `npm run typecheck && npm run lint && npm test`

```bash
git add src/renderer/src/screens/PlayersScreen.tsx src/renderer/src/components/ValueHelp.tsx
git commit -m "feat(ui): show signal columns in value mode"
```

---

### Task 7: Chart geometry and the two SVG components

**Files:**

- Create: `src/renderer/src/lib/charts.ts`
- Create: `src/renderer/src/components/BarsVsMarker.tsx`, `src/renderer/src/components/Sparkline.tsx`
- Test: `tests/renderer/lib/charts.test.ts`

**Interfaces:**

- Produces: `BarItem { label: string; value: number | null; marker: number | null }`; `BarLayout { item; x; width; y; height; markerY: number | null }`; `barsLayout(items, width, height, gap = 2): { bars: BarLayout[]; max: number }`; `barPath(x, y, width, height, radius = 4): string`; `sparklinePoints(values: (number | null)[], width, height, pad = 4): { x: number; y: number }[][]`; `<BarsVsMarker items height? format? />`; `<Sparkline values width? height? />`.

- [x] **Step 1: Write the failing tests**

`tests/renderer/lib/charts.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { barPath, barsLayout, sparklinePoints } from '@/lib/charts'

describe('barsLayout', () => {
  it('lays equal bands with a 2px gap, bars from the baseline, markers on the same scale', () => {
    const { bars, max } = barsLayout(
      [
        { label: '1', value: 10, marker: 8 },
        { label: '2', value: null, marker: 20 }
      ],
      48,
      40
    )
    expect(max).toBe(20)
    expect(bars[0]).toMatchObject({ x: 1, width: 22, y: 20, height: 20, markerY: 24 })
    expect(bars[1]).toMatchObject({ x: 25, width: 22, y: 40, height: 0, markerY: 0 })
  })

  it('never divides by zero: no items, all-zero values', () => {
    expect(barsLayout([], 48, 40).bars).toEqual([])
    expect(barsLayout([{ label: '1', value: 0, marker: null }], 24, 40).bars[0]).toMatchObject({
      height: 0,
      y: 40,
      markerY: null
    })
  })
})

describe('barPath', () => {
  it('rounds the data end only, square at the baseline, and caps the radius on tiny bars', () => {
    expect(barPath(0, 10, 20, 30)).toBe('M0,40 V14 Q0,10 4,10 H16 Q20,10 20,14 V40 Z')
    expect(barPath(0, 38, 20, 2)).toBe('M0,40 V40 Q0,38 2,38 H18 Q20,38 20,40 V40 Z')
    expect(barPath(0, 40, 20, 0)).toBe('')
  })
})

describe('sparklinePoints', () => {
  it('scales min..max into the padded box and breaks the line at nulls', () => {
    expect(sparklinePoints([0, null, 10, 5], 38, 28)).toEqual([
      [{ x: 4, y: 24 }],
      [
        { x: 24, y: 4 },
        { x: 34, y: 14 }
      ]
    ])
  })

  it('is empty without values and sits mid-height for a constant series', () => {
    expect(sparklinePoints([null, null], 38, 28)).toEqual([])
    expect(sparklinePoints([3, 3], 38, 28)).toEqual([
      [
        { x: 4, y: 14 },
        { x: 34, y: 14 }
      ]
    ])
    expect(sparklinePoints([3], 38, 28)).toEqual([[{ x: 4, y: 14 }]])
  })
})
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/renderer/lib/charts.test.ts`
Expected: FAIL — `Cannot find module '@/lib/charts'`.

- [x] **Step 3: Implement the geometry**

`src/renderer/src/lib/charts.ts`:

```ts
export interface BarItem {
  label: string
  /** Bar height; null draws no bar (only the marker, if any). */
  value: number | null
  /** Tick on the same scale; null draws none. */
  marker: number | null
}

export interface BarLayout {
  item: BarItem
  x: number
  width: number
  y: number
  height: number
  markerY: number | null
}

/** Equal bands across `width`, a surface gap between bars, bars growing from the baseline at `height`. */
export function barsLayout(
  items: BarItem[],
  width: number,
  height: number,
  gap = 2
): { bars: BarLayout[]; max: number } {
  const max = Math.max(1, ...items.flatMap((i) => [i.value ?? 0, i.marker ?? 0]))
  const band = items.length > 0 ? width / items.length : 0
  const scale = (v: number): number => height - (v / max) * height
  return {
    max,
    bars: items.map((item, i) => {
      const h = item.value === null ? 0 : (item.value / max) * height
      return {
        item,
        x: i * band + gap / 2,
        width: Math.max(0, band - gap),
        y: height - h,
        height: h,
        markerY: item.marker === null ? null : scale(item.marker)
      }
    })
  }
}

/** Bar with rounded top corners and a square baseline; the radius shrinks so tiny bars stay well-formed. */
export function barPath(x: number, y: number, width: number, height: number, radius = 4): string {
  if (height <= 0) return ''
  const r = Math.min(radius, width / 2, height)
  const bottom = y + height
  return `M${x},${bottom} V${y + r} Q${x},${y} ${x + r},${y} H${x + width - r} Q${x + width},${y} ${x + width},${y + r} V${bottom} Z`
}

/** Polyline segments over `values` (a null breaks the line), min..max stretched into the padded box; a flat series sits mid-height. */
export function sparklinePoints(
  values: (number | null)[],
  width: number,
  height: number,
  pad = 4
): { x: number; y: number }[][] {
  const present = values.flatMap((v) => (v === null ? [] : [v]))
  if (present.length === 0) return []
  const min = Math.min(...present)
  const span = Math.max(...present) - min
  const step = values.length > 1 ? (width - 2 * pad) / (values.length - 1) : 0
  const inner = height - 2 * pad
  const segments: { x: number; y: number }[][] = []
  let current: { x: number; y: number }[] = []
  values.forEach((v, i) => {
    if (v === null) {
      if (current.length > 0) segments.push(current)
      current = []
      return
    }
    const ratio = span === 0 ? 0.5 : (v - min) / span
    current.push({ x: pad + i * step, y: pad + inner * (1 - ratio) })
  })
  if (current.length > 0) segments.push(current)
  return segments
}
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/renderer/lib/charts.test.ts`
Expected: PASS (6 tests).

- [x] **Step 5: Write the components**

`src/renderer/src/components/BarsVsMarker.tsx`:

```tsx
import { barPath, barsLayout, type BarItem } from '@/lib/charts'

interface BarsVsMarkerProps {
  items: BarItem[]
  height?: number
  format?: (value: number) => string
}

const BAND = 24
const LABEL_HEIGHT = 14

/** Spec §6.2 item 2: one bar per week (actual points) with the projection as a tick; a native <title> per band is the hover layer. */
export function BarsVsMarker({
  items,
  height = 72,
  format = (v) => v.toFixed(1)
}: BarsVsMarkerProps): React.JSX.Element {
  const width = Math.max(1, items.length) * BAND
  const { bars } = barsLayout(items, width, height)
  const text = (v: number | null): string => (v === null ? '—' : format(v))
  return (
    <svg
      viewBox={`0 0 ${width} ${height + LABEL_HEIGHT}`}
      width={width}
      height={height + LABEL_HEIGHT}
      className="max-w-full"
      role="img"
      aria-label="Points per week, with the projection as a tick"
    >
      <line x1={0} x2={width} y1={height} y2={height} className="stroke-border" strokeWidth={1} />
      {bars.map((b) => (
        <g key={b.item.label}>
          <title>{`Week ${b.item.label}: ${text(b.item.value)} pts · projected ${text(b.item.marker)}`}</title>
          <rect x={b.x} y={0} width={b.width} height={height} fill="transparent" />
          {b.height > 0 && (
            <path d={barPath(b.x, b.y, b.width, b.height)} className="fill-primary/70" />
          )}
          {b.markerY !== null && (
            <line
              x1={b.x}
              x2={b.x + b.width}
              y1={b.markerY}
              y2={b.markerY}
              className="stroke-foreground"
              strokeWidth={2}
            />
          )}
          <text
            x={b.x + b.width / 2}
            y={height + LABEL_HEIGHT - 3}
            textAnchor="middle"
            className="fill-muted-foreground text-[9px]"
          >
            {b.item.label}
          </text>
        </g>
      ))}
    </svg>
  )
}
```

`src/renderer/src/components/Sparkline.tsx`:

```tsx
import { sparklinePoints } from '@/lib/charts'

interface SparklineProps {
  values: (number | null)[]
  width?: number
  height?: number
}

/** 2px line over the games in order, last point marked with a surface ring; nulls leave a gap. Decorative — the numbers sit beside it. */
export function Sparkline({ values, width = 96, height = 28 }: SparklineProps): React.JSX.Element {
  const segments = sparklinePoints(values, width, height)
  const lastSegment = segments[segments.length - 1]
  const last = lastSegment ? lastSegment[lastSegment.length - 1] : undefined
  return (
    <svg viewBox={`0 0 ${width} ${height}`} width={width} height={height} aria-hidden="true">
      {segments.map((seg, i) => (
        <polyline
          key={i}
          points={seg.map((p) => `${p.x},${p.y}`).join(' ')}
          fill="none"
          className="stroke-muted-foreground"
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
      ))}
      {last && (
        <circle
          cx={last.x}
          cy={last.y}
          r={4}
          className="fill-foreground stroke-background"
          strokeWidth={2}
        />
      )}
    </svg>
  )
}
```

- [x] **Step 6: Verify and commit**

Run: `npm run typecheck && npm run lint && npm test` (the components are typechecked by `typecheck:web`; they render in Task 8).

```bash
git add src/renderer/src/lib/charts.ts src/renderer/src/components/BarsVsMarker.tsx src/renderer/src/components/Sparkline.tsx tests/renderer/lib/charts.test.ts
git commit -m "feat(ui): inline SVG bars and sparkline components"
```

---

### Task 8: Detail panel — opponent/byes in the header, sections 2–5

**Files:**

- Create: `src/renderer/src/lib/detailView.ts`
- Modify: `src/renderer/src/components/PlayerDetailPanel.tsx` (whole file below)
- Test: `tests/renderer/lib/detailView.test.ts`

**Interfaces:**

- Consumes: `BarsVsMarker`, `Sparkline`, `BarItem` (Task 7); `TREND_ARROW`, `sosTone` (Task 5); `signalsFixture` (Task 5, tests); `PlayerDetail.schedule`, `PlayerSignals`, `ScheduleEntry`, `UsageTrend`, `UsageMetric`, `DetailWeek` (Task 1).
- Produces: `DetailMetric = 'snapPct' | 'targetShare' | 'rushShare' | 'wopr'`; `UsageRow { metric: DetailMetric; label: string }`; `usageRows(position: string | null): UsageRow[]`; `barItems(weeks: DetailWeek[]): BarItem[]`; `signalLines(s: PlayerSignals, gamesPlayed: number): string[]`.

- [x] **Step 1: Write the failing tests**

`tests/renderer/lib/detailView.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import { barItems, signalLines, usageRows } from '@/lib/detailView'
import type { DetailWeek } from '@shared/types'
import { signalsFixture } from '../../fixtures/signals'

describe('signalLines', () => {
  it('phrases TD regression, efficiency, projection accuracy and consistency', () => {
    expect(signalLines(signalsFixture(), 5)).toEqual([
      'TDs +1.8 vs expected — regression candidate',
      'Yds/opp 8.2 · -0.4 vs position',
      'vs projection +12.3 pts (+9%)',
      'Floor 6.1 · Ceiling 17.4 · start-worthy 63%'
    ])
    expect(signalLines(signalsFixture({ tdFlag: 'up', tdDelta: -1.6 }), 5)[0]).toBe(
      'TDs -1.6 vs expected — due for more'
    )
    expect(signalLines(signalsFixture({ tdFlag: null, tdDelta: 0.4 }), 5)[0]).toBe(
      'TDs +0.4 vs expected'
    )
  })

  it('skips families without data and states the consistency gate', () => {
    const bare = signalsFixture({
      tdDelta: null,
      tdFlag: null,
      ypo: null,
      ypoDelta: null,
      vsProjPoints: null,
      vsProjPct: null,
      floor: null,
      ceiling: null,
      stdev: null,
      startRate: null
    })
    expect(signalLines(bare, 2)).toEqual(['Consistency: needs 3 games (2 played)'])
    expect(signalLines(signalsFixture({ vsProjPct: null }), 5)[2]).toBe('vs projection +12.3 pts')
    expect(signalLines(signalsFixture({ startRate: null }), 5)[3]).toBe('Floor 6.1 · Ceiling 17.4')
  })
})

describe('usageRows', () => {
  it('follows the position; none for K, DEF or unknown', () => {
    expect(usageRows('RB').map((r) => r.metric)).toEqual(['snapPct', 'rushShare', 'wopr'])
    expect(usageRows('WR').map((r) => r.metric)).toEqual(['snapPct', 'targetShare', 'wopr'])
    expect(usageRows('TE').map((r) => r.label)).toEqual(['Snap %', 'Target share', 'WOPR'])
    expect(usageRows('QB').map((r) => r.metric)).toEqual(['snapPct'])
    expect(usageRows('K')).toEqual([])
    expect(usageRows('DEF')).toEqual([])
    expect(usageRows(null)).toEqual([])
  })
})

describe('barItems', () => {
  const week = (over: Partial<DetailWeek>): DetailWeek => ({
    week: 1,
    opponent: null,
    played: false,
    points: null,
    projected: null,
    snapPct: null,
    targetShare: null,
    rushShare: null,
    wopr: null,
    stats: {},
    ...over
  })

  it('keeps played weeks and projected weeks, drops the rest', () => {
    expect(
      barItems([
        week({ week: 1, played: true, points: 10, projected: 8 }),
        week({ week: 2, played: true, points: 0 }),
        week({ week: 3, projected: 12 }),
        week({ week: 4 })
      ])
    ).toEqual([
      { label: '1', value: 10, marker: 8 },
      { label: '2', value: 0, marker: null },
      { label: '3', value: null, marker: 12 }
    ])
  })
})
```

- [x] **Step 2: Run the tests to verify they fail**

Run: `npx vitest run tests/renderer/lib/detailView.test.ts`
Expected: FAIL — `Cannot find module '@/lib/detailView'`.

- [x] **Step 3: Implement the panel view model**

`src/renderer/src/lib/detailView.ts`:

```ts
import type { BarItem } from '@/lib/charts'
import { fmtPct, fmtSigned, fmtSignedPct } from '@/lib/format'
import type { DetailWeek, PlayerSignals, UsageMetric } from '@shared/types'

/** Usage metrics the detail weeks carry (air-yards share exists only as a trend). */
export type DetailMetric = Extract<UsageMetric, 'snapPct' | 'targetShare' | 'rushShare' | 'wopr'>

export interface UsageRow {
  metric: DetailMetric
  label: string
}

const SNAP: UsageRow = { metric: 'snapPct', label: 'Snap %' }
const TARGET: UsageRow = { metric: 'targetShare', label: 'Target share' }
const RUSH: UsageRow = { metric: 'rushShare', label: 'Rush share' }
const WOPR: UsageRow = { metric: 'wopr', label: 'WOPR' }
const USAGE_ROWS: Partial<Record<string, UsageRow[]>> = {
  QB: [SNAP],
  RB: [SNAP, RUSH, WOPR],
  WR: [SNAP, TARGET, WOPR],
  TE: [SNAP, TARGET, WOPR]
}

/** Spec §6.2 item 3: sparkline rows per position; none for K / DEF. */
export function usageRows(position: string | null): UsageRow[] {
  return (position ? USAGE_ROWS[position] : undefined) ?? []
}

/** Spec §6.2 item 2: one band per week that was played or has a projection. */
export function barItems(weeks: DetailWeek[]): BarItem[] {
  return weeks
    .filter((w) => w.played || w.projected !== null)
    .map((w) => ({ label: String(w.week), value: w.played ? w.points : null, marker: w.projected }))
}

/** Spec §6.2 item 4: one line per signal family; families without data are skipped, the consistency gate is stated. */
export function signalLines(s: PlayerSignals, gamesPlayed: number): string[] {
  const lines: string[] = []
  if (s.tdDelta !== null) {
    const note =
      s.tdFlag === 'down' ? ' — regression candidate' : s.tdFlag === 'up' ? ' — due for more' : ''
    lines.push(`TDs ${fmtSigned(s.tdDelta)} vs expected${note}`)
  }
  if (s.ypo !== null && s.ypoDelta !== null) {
    lines.push(`Yds/opp ${s.ypo.toFixed(1)} · ${fmtSigned(s.ypoDelta)} vs position`)
  }
  if (s.vsProjPoints !== null) {
    const pct = s.vsProjPct === null ? '' : ` (${fmtSignedPct(s.vsProjPct)})`
    lines.push(`vs projection ${fmtSigned(s.vsProjPoints)} pts${pct}`)
  }
  if (s.floor !== null && s.ceiling !== null) {
    const start = s.startRate === null ? '' : ` · start-worthy ${fmtPct(s.startRate)}`
    lines.push(`Floor ${s.floor.toFixed(1)} · Ceiling ${s.ceiling.toFixed(1)}${start}`)
  } else {
    lines.push(`Consistency: needs 3 games (${gamesPlayed} played)`)
  }
  return lines
}
```

- [x] **Step 4: Run the tests to verify they pass**

Run: `npx vitest run tests/renderer/lib/detailView.test.ts`
Expected: PASS (4 tests).

- [x] **Step 5: Rewrite the panel**

Replace `src/renderer/src/components/PlayerDetailPanel.tsx` with:

```tsx
import { useEffect, useState } from 'react'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table'
import { BarsVsMarker } from '@/components/BarsVsMarker'
import { PositionBadge } from '@/components/PositionBadge'
import { SlideOver } from '@/components/SlideOver'
import { Sparkline } from '@/components/Sparkline'
import { api } from '@/lib/api'
import { barItems, signalLines, usageRows } from '@/lib/detailView'
import { errorMessage, fmtPct, fmtPoints, fmtSigned } from '@/lib/format'
import {
  cellText,
  columnGroups,
  sosTone,
  TREND_ARROW,
  type TableRow as PlayerRow
} from '@/lib/playersTableView'
import { cn } from '@/lib/utils'
import type { PlayerDetail, PlayerValueRow, ScheduleEntry, UsageTrend } from '@shared/types'

interface PlayerDetailPanelProps {
  season: number
  /** The clicked table row (week or value); null closes the panel. */
  player: PlayerRow | null
  onClose: () => void
}

function Stat({
  label,
  value,
  sub
}: {
  label: string
  value: string
  sub: string
}): React.JSX.Element {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-muted-foreground">{label}</dt>
      <dd className="text-lg font-semibold tabular-nums">{value}</dd>
      <dd className="text-xs text-muted-foreground">{sub}</dd>
    </div>
  )
}

/** Spec §6.2 item 1: PPG · STD value (pos rank) · ROS value (rank) · next opponent (rank) · byes remaining. */
function HeaderStrip({
  row,
  schedule
}: {
  row: PlayerValueRow
  schedule: ScheduleEntry[]
}): React.JSX.Element {
  const rank = (n: number | null): string => (n === null ? '—' : `${row.position ?? ''}${n}`)
  const signals = row.signals
  const next = signals?.nextOpponent ?? null
  const nextValue = !signals ? '—' : next ? next.team : schedule.length > 0 ? 'BYE' : '—'
  const nextSub = !signals
    ? ''
    : next
      ? next.rank === null
        ? 'DvP unranked'
        : `DvP rank ${next.rank}`
      : schedule.length > 0
        ? `week ${schedule[0].week}`
        : 'season over'
  return (
    <dl className="grid grid-cols-5 gap-3">
      <Stat label="PPG" value={fmtPoints(row.ppg)} sub={`${row.gamesPlayed} G`} />
      <Stat label="Season VAL" value={fmtSigned(row.stdValue)} sub={rank(row.stdRank)} />
      <Stat
        label="ROS VAL"
        value={fmtSigned(row.rosValue)}
        sub={
          row.rosPoints === null
            ? 'no projections'
            : `${rank(row.rosRank)} · ${row.rosPoints.toFixed(1)} pts`
        }
      />
      <Stat label="Next" value={nextValue} sub={nextSub} />
      <Stat label="Byes" value={signals ? String(signals.byesRemaining) : '—'} sub="remaining" />
    </dl>
  )
}

function Section({
  title,
  note,
  children
}: {
  title: string
  note?: string
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <section className="mt-5">
      <h3 className="text-[11px] uppercase tracking-wide text-muted-foreground">
        {title}
        {note && <span className="ml-2 normal-case tracking-normal">{note}</span>}
      </h3>
      <div className="mt-2">{children}</div>
    </section>
  )
}

/** Spec §6.2 item 3: a sparkline over the played games plus season / last-3 numbers and the trend. */
function UsageLine({
  label,
  values,
  trend
}: {
  label: string
  values: (number | null)[]
  trend: UsageTrend | null
}): React.JSX.Element {
  return (
    <div className="flex items-center gap-3 text-sm">
      <span className="w-24 shrink-0 text-muted-foreground">{label}</span>
      <Sparkline values={values} />
      <span className="tabular-nums">
        {trend
          ? `${fmtPct(trend.season)} season · ${fmtPct(trend.recent)} last 3 ${TREND_ARROW[trend.trend]} ${trend.trend}`
          : '— (needs 2 games)'}
      </span>
    </div>
  )
}

function ScheduleChips({ schedule }: { schedule: ScheduleEntry[] }): React.JSX.Element {
  return (
    <div className="flex flex-wrap gap-1.5">
      {schedule.map((e) => {
        const tone = sosTone(e.rank)
        return (
          <span
            key={e.week}
            className={cn(
              'rounded border px-1.5 py-0.5 text-xs tabular-nums',
              e.opponent === null && 'text-muted-foreground',
              tone === 'hard' && 'border-destructive/50 text-destructive',
              tone === 'easy' && 'border-pos-rb/50 text-pos-rb'
            )}
            title={
              e.rank === null ? 'defense not ranked yet' : `defense vs position rank ${e.rank}`
            }
          >
            Wk {e.week} {e.opponent ?? 'BYE'}
            {e.rank !== null && ` · ${e.rank}`}
          </span>
        )
      })}
    </div>
  )
}

export function PlayerDetailPanel({
  season,
  player,
  onClose
}: PlayerDetailPanelProps): React.JSX.Element {
  // Keyed by season + player so a stale result never shows for the next selection.
  const [loaded, setLoaded] = useState<{ key: string; detail: PlayerDetail } | null>(null)
  const [failed, setFailed] = useState<{ key: string; message: string } | null>(null)
  const playerId = player?.playerId ?? null
  const key = playerId === null ? null : `${season}|${playerId}`

  useEffect(() => {
    if (playerId === null || key === null) return
    let cancelled = false
    void api.players
      .detail(season, playerId)
      .then((d) => {
        if (!cancelled) setLoaded({ key, detail: d })
      })
      .catch((err) => {
        if (!cancelled) setFailed({ key, message: errorMessage(err) })
      })
    return () => {
      cancelled = true
    }
  }, [season, playerId, key])
  const detail = loaded?.key === key ? loaded.detail : null
  const error = failed?.key === key ? failed.message : null

  const played = detail?.weeks.filter((w) => w.played) ?? []
  const statColumns = columnGroups(player?.position ?? 'ALL', 'stats')
    .slice(1)
    .flatMap((g) => g.columns)
    .filter((c) => c.kind === 'stat')
  const showSnaps = player?.position !== 'DEF'
  const signals = detail?.row.signals ?? null
  const bars = detail ? barItems(detail.weeks) : []
  const usage = usageRows(player?.position ?? null)

  return (
    <SlideOver
      open={player !== null}
      onClose={onClose}
      title={
        player && (
          <span className="flex items-center gap-2">
            <PositionBadge position={player.position} />
            {player.fullName}
            <span className="font-normal text-muted-foreground">{player.team ?? 'FA'}</span>
          </span>
        )
      }
    >
      {error && <p className="text-destructive text-sm">{error}</p>}
      {detail && <HeaderStrip row={detail.row} schedule={detail.schedule} />}
      {player && !player.statsAvailable && (
        <p className="mt-4 text-sm text-muted-foreground">
          Stats unavailable — this player could not be matched to nflverse data.
        </p>
      )}
      {detail && signals && (
        <>
          <Section title="Points vs projection" note="bars = points · tick = projection">
            {bars.length > 0 ? (
              <BarsVsMarker items={bars} />
            ) : (
              <p className="text-sm text-muted-foreground">No games or projections yet.</p>
            )}
            {detail.row.rosPoints === null && (
              <p className="mt-1 text-xs text-muted-foreground">No projections stored</p>
            )}
          </Section>
          {usage.length > 0 && (
            <Section title="Usage">
              <div className="space-y-2">
                {usage.map((u) => (
                  <UsageLine
                    key={u.metric}
                    label={u.label}
                    values={played.map((w) => w[u.metric])}
                    trend={signals.usage[u.metric]}
                  />
                ))}
              </div>
            </Section>
          )}
          <Section title="Signals">
            <ul className="space-y-1 text-sm">
              {signalLines(signals, detail.row.gamesPlayed).map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          </Section>
          <Section title="Upcoming schedule">
            {detail.schedule.length > 0 ? (
              <ScheduleChips schedule={detail.schedule} />
            ) : (
              <p className="text-sm text-muted-foreground">No remaining weeks.</p>
            )}
          </Section>
        </>
      )}
      {detail && player?.statsAvailable && played.length === 0 && (
        <p className="mt-4 text-sm text-muted-foreground">No games yet this season.</p>
      )}
      {played.length > 0 && (
        <Table className="mt-4">
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">Wk</TableHead>
              <TableHead className="w-14">Opp</TableHead>
              <TableHead className="w-14 text-right">Pts</TableHead>
              {showSnaps && <TableHead className="w-14 text-right">Snap%</TableHead>}
              {statColumns.map((c) => (
                <TableHead key={c.key} className="text-right">
                  {c.label}
                </TableHead>
              ))}
            </TableRow>
          </TableHeader>
          <TableBody>
            {played.map((w) => (
              <TableRow key={w.week}>
                <TableCell className="tabular-nums">{w.week}</TableCell>
                <TableCell className="text-muted-foreground">{w.opponent ?? '—'}</TableCell>
                <TableCell className="text-right font-medium tabular-nums">
                  {fmtPoints(w.points)}
                </TableCell>
                {showSnaps && (
                  <TableCell className="text-right text-muted-foreground tabular-nums">
                    {fmtPct(w.snapPct)}
                  </TableCell>
                )}
                {statColumns.map((c) => (
                  <TableCell key={c.key} className="text-right tabular-nums">
                    {cellText(w.stats[c.statKey ?? ''] ?? null, c, 'stats')}
                  </TableCell>
                ))}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </SlideOver>
  )
}
```

- [x] **Step 6: Check in the dev app**

Open a WR with 3+ games: five header stats (`Next` shows the team with `DvP rank N`), bars with projection ticks and week labels, hover shows `Week 3: 18.4 pts · projected 12.1`, three usage lines with sparklines (`Snap %`, `Target share`, `WOPR`) and `xx% season · yy% last 3 ↑ rising`, four signal lines, schedule chips with red/green ranks and `BYE`, then the game log. Open a K: no Usage section, signals show consistency + vs projection only. Open a player with 1 game: `Consistency: needs 3 games (1 played)` and `— (needs 2 games)` on the usage lines. Open an unmatched player: header shows `—`, the unavailable message, no sections. Check a season with no projections (if one exists): bars still draw for played weeks, `No projections stored` under them.

- [x] **Step 7: Verify and commit**

Run: `npm run typecheck && npm run lint && npm test`

```bash
git add src/renderer/src/lib/detailView.ts src/renderer/src/components/PlayerDetailPanel.tsx tests/renderer/lib/detailView.test.ts
git commit -m "feat(ui): charts, usage and schedule in the detail panel"
```

---

### Task 9: Version 0.6.0, Windows build, tag

Only after the user has checked Tasks 6 and 8 in the dev app and asked for the build.

- [x] **Step 1:** `package.json` / `package-lock.json` version `0.5.0` → `0.6.0`; `npm run typecheck && npm run lint && npm test`; commit `build: bump version to 0.6.0`.
- [x] **Step 2:** `npm run build:win`; copy `dist/FantasyCompanion-Setup-0.6.0.exe` to `/mnt/c/Users/habie/OneDrive/Bureau/`.
- [ ] **Step 3:** User installs over 0.5.0 (no migration), sanity-reads the RB/WR top-10 in Value mode (SOS, USAGE, TD look plausible against what they know of the season) and opens a few detail panels; record the uncached `players.value` time from Task 4 step 5 in the progress notes.
- [x] **Step 4:** Progress notes appended to this plan, commit `docs(plan): mark plan F complete`, tag `v0.6.0`, fast-forward `main`, delete the branch.

---

## Self-review notes

- **Spec coverage:** §3.1 five usage metrics from the series (already loaded by Plan E), season / last-3 / trend with 0.03 and 0.05 thresholds, ≥ 2 games gate, primary metric WR/TE → target share, RB → snap %, none for QB/K/DEF (T2 `usageTrend`, `statSignals`; T5 `PRIMARY_USAGE`); §3.2 opportunities per position, league-wide positional TD rate, `tdDelta` / flag at ±1.5, ypo and delta vs the positional mean, vs-projection over weeks with both (T2); §3.3 25th/75th percentile with linear interpolation, population stdev, start rate vs STD replacement PPG, ≥ 3 games gate (T2, wired with `stdLevels` in T4); §3.4 defense-vs-position from played weeks, uniform for K/DEF, `nextOpponent` null on a bye / at season end, `rosSos`, `byesRemaining` (T3, T4); §5.1 `Trend`, `UsageTrend`, `PlayerSignals`, `signals` on the row, `schedule` on the detail (T1 — `rank: number | null` deviation recorded); §5.3 `signals.ts` / `schedule.ts` pure with exported constants, build via `series.ts` only, cache untouched (T2–T4); §6.1 SOS/Byes in the Rest-of-season group, Signals group identical on every tab, every column sortable with nulls last, USAGE with arrow, TD badge, SOS tint, vs Proj as pct, "—" for null, header tooltips (T5, T6); §6.2 item 1 opponent + byes, items 2–5 (`BarsVsMarker`, `Sparkline`, signal text, schedule chips), item 6 unchanged (T7, T8); §6.3 gates ("needs 3 games", "—" for usage), no projections note, unmatched players (T8); §7 unchanged path; §8 `signals.test.ts`, `schedule.test.ts`, `build.test.ts` mid-week case, `playersTableView.test.ts` (T2–T5) plus `charts.test.ts`, `detailView.test.ts`; §9 file list matches the file map (`roster.ts` is Plan G); §10 row F.
- **Placeholder scan:** none — the Task 1 `signals: null` / `schedule: []` stubs are code steps replaced in Task 4, not plan placeholders.
- **Type consistency:** `SeriesBundle.schedule` (T1) is the `TeamSchedule` `playerSchedule` takes (T3, T4); `StatSignals` + the three schedule fields spread into `PlayerSignals` (T4) match §5.1 (T1); `ValueBuild.schedules` (T4) feeds `detailFor(...).schedule` → `PlayerDetail.schedule` (T1) → `HeaderStrip` / `ScheduleChips` (T8); `Column.signal: SignalField` + `CellFormat` (T5) are what `signalText` / `signalTone` / `cellValue` read and what the screen calls (T6); `UsageMetric` (T1) indexes `PlayerSignals.usage` in `statSignals` (T2), `primaryUsage` (T5) and `usageRows` via `DetailMetric` (T8); `BarItem` (T7) is produced by `barItems` (T8) and consumed by `BarsVsMarker` (T7); `signalsFixture` (T5) is shared by `playersTableView.test.ts` and `detailView.test.ts` (T8); `fmtSignedPct` (T5) is used by `cellText` and `signalLines`.

## Progress notes (2026-09-18)

- Tasks 1–9 implemented inline on `feat/signals`; typecheck, lint and Vitest clean at every commit (201 → 237 tests). Tasks 6 and 8 checked by the user in the WSL dev app: "fine".
- **Timing** (Task 4 step 5, on a migrated copy of the Windows DB — pre-0.4.0 schema, so no projections): current season 79–85 ms for 825 rows (Plan E: 83–96 ms); a full 18-week season 409–474 ms, of which `assembleValue` (signals + schedule included) is 11–15 ms — the rest is the Plan E series load. Budget ≤ 500 ms holds; the full-season load is the place to optimise if it ever matters.
- **Deviations from the task text:**
  - Task 3: tests and module were written in one step (the red run would have been the same "cannot find module" as Task 2).
  - Task 4: `build.ts` already had a `ranks()` helper, so the defense-ranks map is the local `defense`.
  - Task 4: the fixture expectation for Jefferson's CHI rank was wrong in the plan — five defenses have been played against and the four that faced no WR rank ahead of CHI with 0 allowed, so CHI is 5th (`rosSos: 5`, schedule rank 5). The locked semantics are unchanged; only the expected number was.
  - Task 5: the existing "reads and formats value cells" test maps over the whole Rest-of-season group, so it now expects the SOS/BYES cells too.
  - Task 1 added 1 test, not 2 (202 after the task).
- **Dev-app check detour:** the Electron window can be mapped in X yet never appear on the Windows desktop when WSLg's RAIL bridge wedges (X position −32730/−32709, renderer healthy). `wsl --shutdown` fixed it; details in the user/environment memory.
- Added outside the plan at the user's request: `docs/reference/value-and-signals.md` — the data reference for the coming UI redesign (every field, definition, gates, current rendering, what is computed but not yet shown).
- Windows build: `dist/FantasyCompanion-Setup-0.6.0.exe` (94 MB), copied to `C:\Users\habie\OneDrive\Bureau`. Install over 0.5.0 (no migration) pending the user's check.
