# Plan AD2 — Stats analysis: the chart explorer

**Status:** complete 2026-10-25. Merged to main as `13df7aa` and tagged `v0.35.0` on `57fe245` (not pushed yet). Tasks 0–3 were executed from this text: each task's tests were seen failing as the plan says, then passing, and every file and diff applied as written. Counts, with the 3 of the untracked `tests/shared/playerImage.test.ts`: 1,147 → 1,158 → 1,163, and 1,164 after the review fix.

Task 4: `ALL GATES PASSED`, every number as in the Planning findings (WR volume against efficiency 95 dots, r +0.59, means 5.74 / 1.803; every preset 14–49 ms in the worker, size and colour 32 ms; the axes without 2026 data QB 5, RB 1, WR 5, TE 5, K 0, P 0, DL 2, LB 3, DB 2, teams 7; week 1 TE 44, K 16, QB 32; teams' pressure against sack rate missing for 2026, r 0.66 in 2025). Every screenshot of the walk-through matched its checklist, light and dark (19 and 20 are the same hover on Flowers: the mouse stayed there from 03 and the driver's `:last-of-type` then picks the hovered dot, painted last; a driver artefact). In the app, three runs on the walked profile: 31–120 ms for every timed step. Windows Package check green (`"query":true`).

Fixes, test-first in their own commit:

- (Final review, Important) `374cbb8`: a pick whose row left the chart (another season, Totals, Qualified only) still showed in the header as a raw id, shifted the slot colours, blocked new picks and reached Compare. `chartView` lists the picks still plotted with their names (`view.picks`); the header, the three-pick limit and Compare read those. The re-walk caught a first version that dropped a pick made between renders (two shift-clicks in one event loop turn); the test batches them now. The walk-through was run again after it: no timeout, the picks into Compare as shown.

Final review (fresh reviewer, Opus): no Critical, 1 Important (above), Minor findings left open for the user: sorting by a size or colour column that is then set to None leaves the table unsorted; a team filter with no qualified player shows an empty plot with "n 0"; the dots are not keyboard-reachable (the table's buttons are); the hover card can run below the plot for a dot near the bottom; Compare is not given the chart's Totals / Per game; the "few" note counts the qualified with Qualified only off; the means' label says "qualified" when it falls back to every row; the postseason "few" state offers no widening action.

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the chart explorer, Explore's last tool (spec §9.5).

- **Chart** is Explore's first tab (it was disabled): any metric against any other, for the players at one position or the 32 teams, over the shared scope.
- **Controls:** presets per position, the Y and X axes by family (a lower-is-better axis marked "↓") and a swap, size and colour by a third metric's percentile, a team filter, qualified only, my players, a search.
- **Scatter:** up and right always better (a lower-is-better axis runs reversed), the qualified means dashed with the corners in words, rings for mine, the searched, the hovered and the picked, labels on the outliers without collisions, a hover card. A click opens the dashboard; shift-click picks up to three and "Compare these" opens Compare with them.
- **Under it:** r as plotted, the count, the means, a table sorted by percentile.
- **States:** too few qualifiers, an axis the season lacks.
- Ship `v0.35.0`.

**Architecture:**

- **Renderer model** (pure, unit-tested) `src/renderer/src/lib/stats/chart.ts`: `ChartState` and its reset, the presets, the axes, one query over the position or the 32, the dots (qualified on both axes, ranked among the position's qualified, mine, found, picked), the domains, means and r, the corners and title, the scales, the labels and their placement, the table's order, the Compare state from the picks.
- **Components:** `Scatter` (new, SVG as the other charts); `PctChip` moves from Trends to the shared parts; `heatColor` from the stat lines to `format.ts`, so the scatter colours by it.
- **Screens:** `StatsChart` (new); `StatsExplore` enables Chart; `StatsApp` keeps the chart's state, opens Explore on Chart the first time and routes the picks to Compare.
- No main-process change: no engine, catalogue or derived-table change, no `DERIVED_VERSION` bump.

**Tech Stack:** Electron 39, React 19, Tailwind 4, `lucide-react`, TypeScript strict, Vitest (jsdom for components), DuckDB (`@duckdb/node-api`) in the stats worker. No chart library.

**Spec:** `docs/superpowers/specs/2026-10-15-stats-analysis-design.md`: §9.5 (Explore), §9.6, §11, the Plan AD2 row of §12, and §22 (Plan AD1's amendments: Explore, Compare's pool). Amended by this plan: Task 3 writes the amendments into the spec as §23.

**Design:** the "Stats Explore" Claude Design canvas and its handoff, `docs/design/2026-10-23-stats-explore-handoff/` (README section "15. Chart explorer", the navigation rows, the view-model spec `stats-explore.js`).

The screens reference: `docs/reference/stats-screens.md`.

## Decisions (user, 2026-10-23 to 2026-10-25)

- **Explore** has one nav item with Chart · Compare · Trends (Plan AD1); **AD2 is the chart explorer**, `v0.35.0`; AE (matchups) `v0.36.0`.
- **The teams' second preset** is "Pass vs rush EPA", not the handoff's "Pressure vs sack rate": pressure rate is published through the prior season only, so that preset would open on an empty chart in the season in progress. Pressure rate stays on the axis lists.
- **Picks:** shift-click only, no lasso.

## Planning findings (live data, 2026-10-25)

Measured on a full `stats.duckdb` (2019 – 2026 week 7, Plan AD1's database at `DERIVED_VERSION` 3) with the code in this plan, and in the built app on a scratch profile with the dev league, unless it says otherwise.

- **Every preset charts.** In 2026 weeks 1–7, qualified dots: QB 34 and 33, RB 39 and 30, WR 95 and 98, TE 41 and 41, K 30, P 31, DL 167, LB 111, DB 157, teams 32. WR volume against efficiency: r +0.59 as plotted, means 5.7 targets per game and 1.80 yards per route run.
- **Qualified means both axes.** 221 WR rows, 186 with both values, 98 meet the WR qualifier (target share) and 95 YPRR's own route sample too. Percentiles are among the position's qualified players who meet each metric's sample (Compare's pool): a WR below YPRR's sample still ranks in targets.
- **A preset that measures volume twice says little.** The DL preset was snaps against pressures (r +0.69, both counts per game); it is pressures against run stuffs now (r +0.19), pass rush against run defense.
- **Axes the season lacks.** Of each position's axis list, these have no data for 2026 (participation through the prior season): QB 5 (pressured and clean EPA, pressured %, pressure-to-sack, on-field EPA), WR and TE 5 (YPRR and TPRR against man and zone, on-field EPA), RB 1, DL 2, LB 3, DB 2, teams 7 (pressure rates, personnel, man rate and EPA). Picking one says so and offers the season before: teams' pressure against sack rate in 2025 charts (r +0.66).
- **Too few qualifiers is rare.** A single regular-season week still charts (week 1: TE 44 dots, K 16, QB 32); the 2025 postseason does not (TE 6 of 31).
- **Labels.** The six "most extreme" dots by distance from the plot's centre all fell in the dense low corner of the WR chart (Ayomanor, Williams, Brown, Nailor, Coleman, Lance). Measured in standard deviations from the crowd, they are the outliers: Flowers, Evans, Smith-Njigba, Lamb, Nacua, St. Brown.
- **Titles.** Lowering the X label's first letter wrote "EPA per play allowed vs epa per play"; an acronym keeps its capitals now.
- **Counts per game fall on a grid.** A DL's run stuffs per game take a few values (0, 0.2, 0.25, …), so dots stack. They are not jittered: a dot is where the value is; the table lists every one.
- **Speed.** Every preset's query 15–47 ms in the worker, with size and colour 32 ms. In the app, three runs: Explore to the chart on screen 60–106 ms, a position 41–105 ms, Teams 28–70 ms, Players again 124–126 ms, Compare from the picks 85–92 ms.

## Spec amendments (taken in this plan)

Task 3 Step 1 records these in the spec as §23. **Confirm them with the user before starting Task 1** if they have not been approved yet.

- **A. The chart explorer (§9.5)** is Explore's first tab. Players at one of the rail's nine positions, or the 32 teams; any metric with a season grain (core or extended) on either axis, one with no better side too. One query over the position (or the 32); counts per game or totals for players, never per game for teams.
- **B. Presets** per position, a volume against an efficiency; the teams' offense against defense EPA and pass against rush EPA ("Pressure vs sack rate" dropped). An axis chosen by hand leaves the preset.
- **C. Qualified and ranked.** A dot qualifies on the position's leaderboard qualifier and each axis's own sample; percentiles among the position's qualified players who meet the metric's sample (§22 B). The quadrant lines are the qualified mean (not the league average); r is computed with both axes oriented.
- **D. Orientation.** A lower-is-better axis runs reversed and is marked "↓"; the corners say what each quadrant means.
- **E. Filters.** A team (its dots only; the axes and means stay the position's), qualified only, my players, a search. No owner filter.
- **F. Picks.** Shift-click (a dot or a table row) picks up to three for Compare; no lasso.
- **G. States.** Under 10 dots: "Too few qualifiers to chart", with the full range of weeks and "Show all" where they help. An axis the season lacks: "… is not published for 2026 yet." with the season before, or "… starts in 2022.".
- **H. Measured** (2026 week 7): the numbers above.

## Global Constraints

- **Branch** `feat/chart-explorer-ad2` off `main`.
- **Commits.** One Conventional Commit per "Commit" step, first line ≤ 50 characters, imperative. **No `Co-Authored-By` or "Generated with" trailers.**
- **Never stage these.** The working tree has unrelated changes that are not part of this plan:
  - `.gitignore`, `.design-sync/`, `docs/design/FantasyCompanion UI/`;
  - `docs/research/nfl_predictive_metrics.md:Zone.Identifier`;
  - `src/shared/playerImage.ts`, `tests/shared/playerImage.test.ts`;
  - `tsconfig.node.tsbuildinfo`, `tsconfig.web.tsbuildinfo`.

  Stage files by name; never run `git add -A` or `git add .`.

- **Formatting and lint.**
  - Format only the files you touched: `npx prettier --write <files>`. **Never run `npm run format`** (it rewrites the Sleeper fixtures).
  - Lint with `npx eslint src tests electron.vite.config.ts`. Full-repo `npm run lint` fails on the untracked `.design-sync/` only.
  - Typecheck with `npm run typecheck`.
- **Copy the code exactly.** Every new file is given whole. Every change to an existing file is a diff that `git apply` takes as written: save it to a file and run `git apply <file>`, or make the same edit by hand. The tasks were replayed in order on a clean copy of `main`, with typecheck, lint and the full suite green after each, and the final tree is byte-identical to the prototype.
- **Test counts** are those of a clean checkout (`main`: 1144 passed, 5 skipped). In this working tree the untracked `tests/shared/playerImage.test.ts` adds 3.
- **Scope.**
  - The renderer only: no engine, catalogue, derived-table or IPC change.
  - Compare and Trends change only by Explore opening on Chart (their tests click their tab) and by Compare taking the picks as its slots; Trends' percentile chip and the stat lines' heat colour move to shared files unchanged.
  - No age curve (later), no matchups (AE): Games stays disabled.
- **Network.** No test touches the network. Task 4's live check opens a copy of the live database offline; its app runs refresh their scratch profiles.
- **Gates.**
  - **Task 4:** the live check ends with `ALL GATES PASSED`, and every screenshot of the walk-through shows what its checklist says.
  - **Task 5 Step 2:** the Windows suite and self-test on the Package check workflow.
  - If a gate fails, stop and report the numbers or the screenshot to the user.
- **Release** `v0.35.0`. The tree is dirty, so bump with `npm version minor --no-git-tag-version`, then commit and tag by hand. **Ask the user before every push**: `check/plan-ad2` in Task 5, then `main` and the tag.

## Review Focus

These are the ways this plan is most likely to hurt a user that the spec's test list does not cover. Each one has a test or a gate in the task that owns the code.

1. **A dot ranked against the wrong population.** Examples: a percentile among every player with a game, a team filter re-ranking among one team, an unqualified dot carrying a percentile.
   - Task 1: `chartView` (percentiles among the qualified, the unqualified with none, a team filter keeping the domains and means).
2. **Up is not better.** Examples: a lower-is-better axis not reversed, r's sign from the raw values, the corners' words on the wrong side.
   - Task 1: `scales`, `chartView`'s r with drop rate, `corners`. Task 2: the teams' corners on screen.
3. **The picks reach Compare wrong.** Examples: picks of another position, a pick that left the chart, Compare's defaults replacing them.
   - Task 1: picks filtered to the dots shown, `compareFromPicks`. Task 2: shift-click two, Compare with exactly those.
4. **A state that strands the user.** Examples: an empty chart with no way out, a preset that opens on no data.
   - Task 1: every preset's metrics exist for its position and none is prior-season only; the few and missing states. Task 2: "Show all", "Use 2025". Task 4: every preset on live data.
5. **Labels that lie or pile up.** Examples: a label on the wrong dot, overlapping labels, all labels in one corner.
   - Task 1: `labelItems`' order, `placeLabels`' collisions. Task 4: the walk-through.
6. **Compare and Trends regress.** Explore now opens on Chart; the chip and the heat colour moved.
   - Task 2 keeps their tests green (they open their tab).
7. **Too slow.** One query per choice of axes, size and colour over the whole position. Task 4: in budget in the worker and in the app.

---

### Task 0: Branch

- [x] **Step 1: Branch off main**

```bash
git checkout main && git status --short && git checkout -b feat/chart-explorer-ad2
```

Expected: `git status --short` lists only the unrelated changes named in Global Constraints. Now on `feat/chart-explorer-ad2`.

---

### Task 1: The chart explorer's model (spec §9.5; amendments A–G)

One pure module the screen reads: `ChartState` and its reset, the presets per position and the teams', the axes, one query over the position (with its qualifier) or the 32, the dots (both axes qualified, percentiles among the position's qualified as Compare's, mine, found, picked), the domains, the qualified means and r with both axes oriented, the corners and the title, the scales (a lower-is-better axis reversed), the labels (the outliers in standard deviations from the crowd) and their placement without collisions, the table's order, and Compare's slots from the picks.

**Files:**

- Create: `src/renderer/src/lib/stats/chart.ts`, `tests/renderer/lib/statsChart.test.ts`

- [x] **Step 1: Write the failing tests**

Create `tests/renderer/lib/statsChart.test.ts`:

```ts
import { describe, expect, it } from 'vitest'
import {
  chartAxes,
  chartExtras,
  chartQuery,
  chartRows,
  chartTitle,
  chartView,
  compareFromPicks,
  corners,
  DEFAULT_CHART,
  fewNote,
  labelItems,
  pearson,
  placeLabels,
  PLOT,
  PRESETS,
  resetChart,
  scales,
  type ChartDot,
  type ChartState
} from '@/lib/stats/chart'
import { RAIL_POSITIONS } from '@/lib/stats/player'
import type { StatsOwnership, StatsResult } from '@shared/stats/types'
import { catalogueMap, result, row, STATUS, value } from '../../fixtures/statsScreens'

const byId = catalogueMap()
const scope = { season: 2026, seasonType: 'REG' as const, weeks: null, scoring: 'ppr' as const }
const OWN: StatsOwnership = { players: { w3: { name: 'Me', mine: true } }, teams: {} }

/**
 * Twelve WRs, targets per game 3–14 and YPRR rising with them; w11 below the WR qualifier (target
 * share), w10 below YPRR's own route sample; a TE the position filter drops.
 */
function receivers(over: Partial<StatsResult> = {}): StatsResult {
  const wr = (i: number): ReturnType<typeof row> =>
    row(
      `w${i}`,
      `Receiver ${String.fromCharCode(65 + i)}`,
      {
        targets: value(3 + i, { sample: 3 + i }),
        yprr: value(1 + i / 10, { qualified: i !== 10, sample: 100 + i }),
        target_share: value(0.1 + i / 100, { qualified: i !== 11 }),
        drop_rate: value(0.1 - i / 200)
      },
      { team: i < 3 ? 'BUF' : 'SEA' }
    )
  return result(
    ['targets', 'yprr', 'target_share', 'drop_rate'],
    [
      ...Array.from({ length: 12 }, (_, i) => wr(i)),
      row(
        't0',
        'Tight End',
        { targets: value(20), yprr: value(3), target_share: value(0.3) },
        {
          position: 'TE'
        }
      )
    ],
    over
  )
}

const state = (over: Partial<ChartState> = {}): ChartState => ({ ...DEFAULT_CHART, ...over })
const ready = (v: ReturnType<typeof chartView>): Extract<typeof v, { kind: 'ready' }> => {
  if (v.kind !== 'ready') throw new Error(`not ready: ${v.kind}`)
  return v
}

describe('the chart explorer (stats-analysis spec §9.5)', () => {
  it('has presets for every rail position and the teams, all in the catalogue', () => {
    for (const p of [...RAIL_POSITIONS, 'team' as const]) {
      expect(PRESETS[p].length).toBeGreaterThan(0)
      for (const { x, y } of PRESETS[p]) {
        for (const id of [x, y]) {
          const info = byId.get(id)
          expect(info, id).toBeDefined()
          expect(info!.entity).toBe(p === 'team' ? 'team' : 'player')
          if (p !== 'team' && info!.positions !== 'all') expect(info!.positions).toContain(p)
          // A preset always lands on data: nothing published through the prior season only.
          expect(info!.lastSeason, id).toBeUndefined()
        }
      }
    }
    // Volume vs efficiency for a WR; the teams open on offense vs defense EPA.
    expect(chartAxes(state())).toEqual({ x: 'targets', y: 'yprr' })
    expect(chartAxes(state({ entity: 'team' }))).toEqual({ x: 'off_epa_play', y: 'def_epa_play' })
    expect(chartAxes(state({ x: 'separation' }))).toEqual({ x: 'separation', y: 'yprr' })
  })

  it('queries the whole position with its qualifier, counts per game; teams raw', () => {
    const q = chartQuery('player', 'WR', ['targets', 'yprr', 'drop_rate'], scope, STATUS, true)
    expect(q.metrics).toEqual(['targets', 'yprr', 'drop_rate', 'target_share'])
    expect(q).toMatchObject({
      entity: 'player',
      transform: 'perGame',
      limit: 5000,
      scope: { seasons: [2026], positions: ['WR'] }
    })
    const t = chartQuery('team', 'WR', ['off_epa_play', 'def_epa_play'], scope, STATUS, true)
    expect(t.transform).toBe('raw')
    expect(t.scope.positions).toBeUndefined()
    expect(t.metrics).toEqual(['off_epa_play', 'def_epa_play'])
  })

  it('plots the qualified on both axes, percentiles among them', () => {
    const v = ready(chartView(receivers(), state(), byId, OWN, 2026))
    // w10 (YPRR's sample), w11 (the qualifier) and the TE are out.
    expect(v.dots.map((d) => d.id).sort()).toEqual(
      ['w0', 'w1', 'w2', 'w3', 'w4', 'w5', 'w6', 'w7', 'w8', 'w9'].sort()
    )
    expect(v.qualified).toBe(10)
    // Targets rank among the position's qualified with a target (Compare's pool): w10 too, above w9.
    const p = (id: string): number | null => v.dots.find((d) => d.id === id)!.percentiles.targets
    expect(p('w9')).toBe(90)
    expect(p('w0')).toBe(0)
    // My player paints last (special), a perfect positive correlation as plotted.
    expect(v.dots.at(-1)!.id).toBe('w3')
    expect(v.dots.at(-1)!.mine).toBe(true)
    expect(v.r).toBeCloseTo(1)
    expect(v.mean.x).toBeCloseTo(7.5)
    // Everyone with both values when asked; the unqualified carry no percentile.
    const all = ready(chartView(receivers(), state({ qualifiedOnly: false }), byId, OWN, 2026))
    expect(all.dots).toHaveLength(12)
    expect(all.dots.find((d) => d.id === 'w11')!.percentiles.targets).toBeNull()
    expect(all.dots.find((d) => d.id === 'w11')!.qualified).toBe(false)
  })

  it('orients r and the corners so up and right is better on both', () => {
    // Drop rate falls as targets rise: better on both, r positive as plotted.
    const v = ready(chartView(receivers(), state({ y: 'drop_rate' }), byId, null, 2026))
    expect(v.r).toBeCloseTo(1)
    const c = corners(byId.get('targets'), 'targets', byId.get('drop_rate'), 'drop_rate')
    expect(c.tr).toBe('High volume, sure hands')
    expect(c.bl).toBe('Low volume, drops')
    const t = corners(
      byId.get('off_epa_play'),
      'off_epa_play',
      byId.get('def_epa_play'),
      'def_epa_play'
    )
    expect(t.tr).toBe('Good offense, good defense')
    // A metric without its own words: "high …" / "low …", the better side first.
    const p = corners(
      byId.get('off_pressure_rate'),
      'off_pressure_rate',
      byId.get('off_sack_rate'),
      'off_sack_rate'
    )
    expect(p.tr).toBe('Low pressure rate, low sack rate')
    expect(p.bl).toBe('High pressure rate, high sack rate')
    // The title keeps an acronym's capitals.
    expect(chartTitle(byId.get('targets'), 'targets', byId.get('yprr'), 'yprr')).toBe(
      'Yards per route run vs targets'
    )
    expect(
      chartTitle(byId.get('off_epa_play'), 'off_epa_play', byId.get('def_epa_play'), 'def_epa_play')
    ).toBe('EPA per play allowed vs EPA per play')
    expect(fewNote(6, 'TEs', 'Postseason')).toBe(
      '6 TEs qualify on both axes in the postseason. A scatter needs at least 10.'
    )
    expect(fewNote(6, 'TEs', 'Week 1')).toMatch(/^6 TEs qualify on both axes in week 1\./)
    expect(pearson([1, 2], [1, 2])).toBeNull()
    expect(pearson([1, 1, 1], [1, 2, 3])).toBeNull()
  })

  it('keeps the axes and means of the position under a team filter', () => {
    const all = ready(chartView(receivers(), state(), byId, null, 2026))
    const buf = ready(chartView(receivers(), state({ team: 'BUF' }), byId, null, 2026))
    expect(buf.dots.map((d) => d.id)).toEqual(['w0', 'w1', 'w2'])
    expect(buf.domain).toEqual(all.domain)
    expect(buf.mean).toEqual(all.mean)
  })

  it('finds a name, marks the picks in order', () => {
    const v = ready(
      chartView(
        receivers(),
        state({ search: 'receiver c', picks: ['w5', 'w1', 'gone'] }),
        byId,
        null,
        2026
      )
    )
    expect(v.dots.filter((d) => d.matched).map((d) => d.id)).toEqual(['w2'])
    expect(v.dots.find((d) => d.id === 'w5')!.pick).toBe(0)
    expect(v.dots.find((d) => d.id === 'w1')!.pick).toBe(1)
    // One letter finds nothing.
    const one = ready(chartView(receivers(), state({ search: 'r' }), byId, null, 2026))
    expect(one.dots.some((d) => d.matched)).toBe(false)
  })

  it('says when too few qualify, and when an axis is not published', () => {
    const few = receivers()
    few.rows = few.rows.slice(0, 6)
    expect(chartView(few, state(), byId, null, 2026)).toEqual({ kind: 'few', qualified: 6, all: 6 })
    const prior = result(['off_pressure_rate', 'off_sack_rate'], [], {})
    prior.columns[0].seasons = []
    expect(
      chartView(
        prior,
        state({ entity: 'team', x: 'off_pressure_rate', y: 'off_sack_rate' }),
        byId,
        null,
        2026
      )
    ).toEqual({ kind: 'missing', text: 'Pressure rate is not published for 2026 yet.' })
    const late = result(['targets', 'contested_catch_rate'], [])
    late.columns[1].seasons = []
    expect(chartView(late, state({ y: 'contested_catch_rate' }), byId, null, 2019)).toMatchObject({
      kind: 'missing'
    })
  })

  it('reverses a lower-is-better axis', () => {
    const s = scales({ x: [0, 10], y: [0, 1] }, { x: false, y: true })
    expect(s.x(10)).toBeGreaterThan(s.x(0))
    // y reversed: the lower value sits higher (a smaller pixel y).
    expect(s.y(0)).toBeLessThan(s.y(1))
    expect(s.xTicks.length).toBeGreaterThan(3)
  })

  it('labels the important dots first and skips a colliding label', () => {
    const dot = (id: string, over: Partial<ChartDot> = {}): ChartDot => ({
      id,
      name: `Player ${id}`,
      team: 'SEA',
      x: 0,
      y: 0,
      qualified: true,
      values: {},
      percentiles: {},
      mine: false,
      matched: false,
      pick: -1,
      estimated: [],
      games: 6,
      sample: 100,
      ...over
    })
    const at = (d: ChartDot): { cx: number; cy: number; r: number } =>
      d.id === 'far' ? { cx: PLOT.left + 10, cy: PLOT.top + 10, r: 5 } : { cx: 400, cy: 200, r: 5 }
    const items = labelItems(
      'player',
      [dot('a'), dot('b', { mine: true }), dot('c', { pick: 0 }), dot('far')],
      at
    )
    expect(items.map((i) => [i.id, i.kind])).toEqual([
      ['c', 'strong'],
      ['b', 'mine'],
      ['far', 'muted'],
      ['a', 'muted']
    ])
    expect(items[0].text).toBe('P. c')
    // Four dots on one spot: four places, then nothing is left for a fifth.
    const placed = placeLabels(
      ['a', 'b', 'c', 'd', 'e'].map((id) => ({
        id,
        text: 'X. Name',
        cx: 400,
        cy: 200,
        r: 5,
        kind: 'muted' as const
      })),
      6.3
    )
    expect(placed.map((p) => p.id)).toEqual(['a', 'b', 'c', 'd'])
    expect(labelItems('team', [dot('KC')], at)[0].text).toBe('KC')
  })

  it('sorts the table by a percentile best first, the unranked last, or by name', () => {
    const v = ready(chartView(receivers(), state({ qualifiedOnly: false }), byId, null, 2026))
    const byY = chartRows(v.dots, { by: 'y', dir: 1 }, chartAxes(state()))
    expect(byY[0].id).toBe('w9')
    expect(byY.at(-1)!.percentiles.yprr).toBeNull()
    const worst = chartRows(v.dots, { by: 'x', dir: -1 }, chartAxes(state()))
    expect(worst[0].id).toBe('w0')
    expect(chartRows(v.dots, { by: 'name', dir: 1 }, chartAxes(state()))[0].name).toBe('Receiver A')
  })

  it('resets the axes and picks for another position; extras skip the axes', () => {
    const s = resetChart(state({ x: 'separation', picks: ['w1'], search: 'x', team: 'BUF' }), {
      position: 'RB'
    })
    expect(s).toMatchObject({ position: 'RB', x: null, picks: [], search: '', team: null })
    expect(chartExtras(state({ size: 'yprr', colour: 'drop_rate' }), chartAxes(state()))).toEqual([
      'drop_rate'
    ])
    expect(compareFromPicks('player', 'WR', ['w1', 'w2'])).toEqual({
      entity: 'player',
      position: 'WR',
      slots: ['w1', 'w2', null],
      seed: null
    })
  })
})
```

- [x] **Step 2: Run them and see them fail**

```bash
npx vitest run tests/renderer/lib/statsChart.test.ts
```

Expected: the file fails to import `@/lib/stats/chart` (no tests run).

- [x] **Step 3: The model**

Create `src/renderer/src/lib/stats/chart.ts`:

```ts
import type { CompareState } from '@/lib/stats/compare'
import { fmtStat } from '@/lib/stats/format'
import { qualifies, rankWithinTab, searchKey } from '@/lib/stats/leaderboard'
import { positionTab } from '@/lib/stats/player'
import { queryScope, type StatsScope } from '@/lib/stats/scope'
import { missingFor } from '@/lib/stats/team'
import { teamAbbr } from '@shared/stats/nflTeams'
import type {
  MetricInfo,
  PositionGroup,
  StatsOwnership,
  StatsQuery,
  StatsResult,
  StatsRow,
  StatsStatus
} from '@shared/stats/types'

/** The chart explorer (spec §9.5): any metric against any other, players at one position or teams. */
export type ChartEntity = 'player' | 'team'

/** What the chart explorer shows, kept by StatsApp across tabs. */
export interface ChartState {
  entity: ChartEntity
  position: PositionGroup
  perGame: boolean
  /** Null: the position's (or the teams') first preset. */
  x: string | null
  y: string | null
  size: string | null
  colour: string | null
  /** Only this team's dots (the axes and the means stay the position's). */
  team: string | null
  qualifiedOnly: boolean
  /** My players ringed (players with a league). */
  mine: boolean
  search: string
  /** Shift-clicked, up to three: Compare's slots. */
  picks: string[]
  /** The table's order: a metric's percentile best first (1) or worst first (-1), or names A–Z. */
  sort: { by: string; dir: 1 | -1 }
}

export const DEFAULT_CHART: ChartState = {
  entity: 'player',
  position: 'WR',
  perGame: true,
  x: null,
  y: null,
  size: null,
  colour: null,
  team: null,
  qualifiedOnly: true,
  mine: true,
  search: '',
  picks: [],
  sort: { by: 'y', dir: 1 }
}

/** The same chart for another position or entity: its own axes, no picks or filters. */
export function resetChart(state: ChartState, next: Partial<ChartState>): ChartState {
  return {
    ...state,
    ...next,
    x: null,
    y: null,
    size: null,
    colour: null,
    team: null,
    search: '',
    picks: [],
    sort: DEFAULT_CHART.sort
  }
}

/** Shift-click picks this many for Compare. */
export const MAX_PICKS = 3

/** Below this many dots a scatter says nothing: "Too few qualifiers to chart". */
export const MIN_DOTS = 10

export interface ChartPreset {
  label: string
  x: string
  y: string
}

/** A volume against an efficiency per position (handoff §15: WR's two), and the teams'. */
export const PRESETS: Record<PositionGroup | 'team', ChartPreset[]> = {
  QB: [
    { label: 'Volume vs efficiency', x: 'pass_att', y: 'qb_epa_db' },
    { label: 'Accuracy vs efficiency', x: 'cpoe', y: 'qb_epa_db' }
  ],
  RB: [
    { label: 'Volume vs efficiency', x: 'carries', y: 'ryoe_att' },
    { label: 'Rushing vs receiving', x: 'carry_share', y: 'target_share' }
  ],
  WR: [
    { label: 'Volume vs efficiency', x: 'targets', y: 'yprr' },
    { label: 'Targets vs air yards', x: 'targets', y: 'air_yards_share' }
  ],
  TE: [
    { label: 'Volume vs efficiency', x: 'targets', y: 'yprr' },
    { label: 'Targets vs air yards', x: 'targets', y: 'air_yards_share' }
  ],
  K: [{ label: 'Volume vs accuracy', x: 'fg_att', y: 'fgoe_pct' }],
  P: [{ label: 'Volume vs distance', x: 'punts', y: 'punt_net_avg' }],
  DL: [{ label: 'Pass rush vs run stops', x: 'pressures', y: 'def_stuffs' }],
  LB: [{ label: 'Tackles vs misses', x: 'tackles', y: 'missed_tackle_pct' }],
  DB: [{ label: 'Completions vs yards allowed', x: 'coverage_cmp_pct', y: 'coverage_ypt' }],
  OL: [{ label: 'Snaps vs on-field EPA', x: 'snap_share', y: 'on_field_epa' }],
  team: [
    { label: 'Offense vs defense EPA', x: 'off_epa_play', y: 'def_epa_play' },
    { label: 'Pass vs rush EPA', x: 'off_rush_epa', y: 'off_pass_epa' }
  ]
}

export function presetsFor(entity: ChartEntity, position: PositionGroup): ChartPreset[] {
  return PRESETS[entity === 'team' ? 'team' : position]
}

/** The axes shown: the state's, else the first preset's. */
export function chartAxes(state: ChartState): { x: string; y: string } {
  const first = presetsFor(state.entity, state.position)[0]
  return { x: state.x ?? first.x, y: state.y ?? first.y }
}

/** The metrics sized or coloured by, and in the table, besides the axes. */
export function chartExtras(state: ChartState, axes: { x: string; y: string }): string[] {
  return [...new Set([state.size, state.colour])].filter(
    (m): m is string => m !== null && m !== axes.x && m !== axes.y
  )
}

/** Size and colour read a percentile: metrics with a better side only. */
export function scaled(metrics: readonly MetricInfo[]): MetricInfo[] {
  return metrics.filter((m) => m.direction !== 'neutral')
}

/** Every row at the position (a percentile is among the position), or the 32 teams. */
const ROWS: Record<ChartEntity, number> = { player: 5000, team: 40 }

/** One query: the axes, size and colour, and the position's qualifier. Counts per game when asked. */
export function chartQuery(
  entity: ChartEntity,
  position: PositionGroup,
  metrics: readonly string[],
  scope: StatsScope,
  status: StatsStatus | null,
  perGame: boolean
): StatsQuery {
  const qualifier = entity === 'player' ? positionTab(position).qualifier : undefined
  const all = [...new Set([...metrics, ...(qualifier ? [qualifier] : [])])]
  return {
    entity,
    metrics: all,
    scope: {
      ...queryScope(scope, status),
      ...(entity === 'player' ? { positions: [position] } : {})
    },
    transform: entity === 'player' && perGame ? 'perGame' : 'raw',
    sort: { metric: metrics[1] ?? metrics[0], dir: 'desc' },
    scoring: scope.scoring,
    limit: ROWS[entity]
  }
}

/** "Pressure rate (defense) is not published for 2026 yet.", "Separation starts in 2016." */
export function missingAxis(
  result: StatsResult,
  axes: readonly string[],
  byId: ReadonlyMap<string, MetricInfo>,
  season: number
): string | null {
  for (const id of axes) {
    const info = byId.get(id)
    const column = result.columns.find((c) => c.id === id)
    if (!missingFor(column, info, season)) continue
    const label = info?.label ?? id
    return info && info.firstSeason > season
      ? `${label} starts in ${info.firstSeason}.`
      : `${label} is not published for ${season} yet.`
  }
  return null
}

export interface ChartDot {
  id: string
  name: string
  team: string | null
  x: number
  y: number
  /** The position's qualifier and both axes' own samples. */
  qualified: boolean
  /** By metric (axes, size, colour). */
  values: Record<string, number | null>
  /** 0–100 among the qualified, by metric; null when not qualified. */
  percentiles: Record<string, number | null>
  mine: boolean
  /** The search finds it. */
  matched: boolean
  /** 0–2: its slot in Compare; -1 not picked. */
  pick: number
  /** The metrics whose value is estimated (routes in the current season). */
  estimated: string[]
  games: number
  /** The y axis's sample ("512 routes"). */
  sample: number | null
}

export type ChartView =
  | { kind: 'missing'; text: string }
  | {
      kind: 'few'
      /** Rows that qualify on both axes. */
      qualified: number
      /** Rows with both values. */
      all: number
    }
  | {
      kind: 'ready'
      /** The dots shown, every special one (mine, searched, picked) last. */
      dots: ChartDot[]
      /** The axes' domains: every dot the filters would show but the team's. */
      domain: { x: [number, number]; y: [number, number] }
      /** The qualified mean of each axis: the quadrant lines. */
      mean: { x: number; y: number }
      /** Pearson r with both axes oriented, so positive is better on both; null under 3 dots. */
      r: number | null
      /** Qualified rows on both axes. */
      qualified: number
    }

/** A row's value of a metric. */
const valueOf = (r: StatsRow, id: string): number | null => r.values[id]?.value ?? null

/**
 * The dots: rows with both values (the position's, or the 32), qualified ones only when asked,
 * a team's only when asked; percentiles among the position's qualified players (Compare's pool).
 */
export function chartView(
  result: StatsResult,
  state: ChartState,
  byId: ReadonlyMap<string, MetricInfo>,
  ownership: StatsOwnership | null,
  season: number
): ChartView {
  const axes = chartAxes(state)
  const missing = missingAxis(result, [axes.x, axes.y], byId, season)
  if (missing) return { kind: 'missing', text: missing }
  const isPlayer = state.entity === 'player'
  const tab = positionTab(state.position)
  const ranked = isPlayer ? rankWithinTab(result, tab) : result
  const metrics = [axes.x, axes.y, ...chartExtras(state, axes)]
  const rows = ranked.rows.filter(
    (r) =>
      (!isPlayer || r.position === state.position) &&
      valueOf(r, axes.x) !== null &&
      valueOf(r, axes.y) !== null
  )
  const ok = (r: StatsRow): boolean =>
    (!isPlayer || qualifies(r, tab)) &&
    r.values[axes.x].qualified === true &&
    r.values[axes.y].qualified === true
  const pool = rows.filter(ok)
  const plotted = state.qualifiedOnly ? pool : rows
  if (plotted.length < MIN_DOTS) return { kind: 'few', qualified: pool.length, all: rows.length }

  const needle = searchKey(state.search.trim())
  const finds = (r: StatsRow): boolean =>
    needle.length > 1 &&
    (searchKey(r.name).includes(needle) || (!isPlayer && searchKey(teamAbbr(r.id)) === needle))
  const picks = state.picks.filter((id) => plotted.some((r) => r.id === id))
  const dot = (r: StatsRow): ChartDot => ({
    id: r.id,
    name: r.name,
    team: r.team,
    x: valueOf(r, axes.x)!,
    y: valueOf(r, axes.y)!,
    qualified: ok(r),
    values: Object.fromEntries(metrics.map((m) => [m, valueOf(r, m)])),
    percentiles: Object.fromEntries(metrics.map((m) => [m, r.values[m]?.percentile ?? null])),
    mine: isPlayer && state.mine && ownership?.players[r.id]?.mine === true,
    matched: finds(r),
    pick: picks.indexOf(r.id),
    estimated: metrics.filter((m) => r.values[m]?.estimated),
    games: r.games,
    sample: r.values[axes.y].sample
  })
  const special = (d: ChartDot): boolean => d.mine || d.matched || d.pick >= 0
  const shown = plotted.filter((r) => !state.team || r.team === state.team).map(dot)
  const span = (vs: number[]): [number, number] => [Math.min(...vs), Math.max(...vs)]
  const mean = (vs: number[]): number => vs.reduce((t, v) => t + v, 0) / vs.length
  const sign = (id: string): number => (byId.get(id)?.direction === 'lower' ? -1 : 1)
  return {
    kind: 'ready',
    dots: [...shown.filter((d) => !special(d)), ...shown.filter(special)],
    domain: {
      x: span(plotted.map((r) => valueOf(r, axes.x)!)),
      y: span(plotted.map((r) => valueOf(r, axes.y)!))
    },
    mean: {
      x: mean((pool.length ? pool : plotted).map((r) => valueOf(r, axes.x)!)),
      y: mean((pool.length ? pool : plotted).map((r) => valueOf(r, axes.y)!))
    },
    r: pearson(
      shown.map((d) => d.x * sign(axes.x)),
      shown.map((d) => d.y * sign(axes.y))
    ),
    qualified: pool.length
  }
}

/** Pearson's r; null under three points or with no spread. */
export function pearson(xs: readonly number[], ys: readonly number[]): number | null {
  const n = xs.length
  if (n < 3) return null
  const mx = xs.reduce((t, v) => t + v, 0) / n
  const my = ys.reduce((t, v) => t + v, 0) / n
  let sxy = 0
  let sxx = 0
  let syy = 0
  for (let i = 0; i < n; i++) {
    sxy += (xs[i] - mx) * (ys[i] - my)
    sxx += (xs[i] - mx) ** 2
    syy += (ys[i] - my) ** 2
  }
  return sxx > 0 && syy > 0 ? sxy / Math.sqrt(sxx * syy) : null
}

/** Corner words, [better, worse], for the quadrant labels; others "high …" / "low …". */
const WORDS: Record<string, [string, string]> = {
  targets: ['high volume', 'low volume'],
  carries: ['high volume', 'low volume'],
  pass_att: ['high volume', 'low volume'],
  fg_att: ['high volume', 'low volume'],
  punts: ['high volume', 'low volume'],
  yprr: ['efficient', 'inefficient'],
  qb_epa_db: ['efficient', 'inefficient'],
  ryoe_att: ['efficient', 'inefficient'],
  air_yards_share: ['deep usage', 'short usage'],
  separation: ['gets open', 'covered'],
  drop_rate: ['sure hands', 'drops'],
  pressures: ['pass rusher', 'little pressure'],
  def_stuffs: ['run stopper', 'few stops'],
  off_epa_play: ['good offense', 'poor offense'],
  def_epa_play: ['good defense', 'poor defense'],
  off_pass_epa: ['good passing', 'poor passing'],
  off_rush_epa: ['good rushing', 'poor rushing']
}

function words(info: MetricInfo | undefined, id: string): [string, string] {
  if (WORDS[id]) return WORDS[id]
  const s = lowerFirst(info?.label ?? id)
  return info?.direction === 'lower' ? [`low ${s}`, `high ${s}`] : [`high ${s}`, `low ${s}`]
}

const cap = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1)

/** The four corners' labels: up and right is better on both (a lower-is-better axis runs reversed). */
export function corners(
  x: MetricInfo | undefined,
  xId: string,
  y: MetricInfo | undefined,
  yId: string
): { tl: string; tr: string; bl: string; br: string } {
  const [xg, xb] = words(x, xId)
  const [yg, yb] = words(y, yId)
  return {
    tr: cap(`${xg}, ${yg}`),
    tl: cap(`${xb}, ${yg}`),
    br: cap(`${xg}, ${yb}`),
    bl: cap(`${xb}, ${yb}`)
  }
}

/** A label's first letter lowered ("targets"), unless it starts an acronym ("EPA per play"). */
function lowerFirst(s: string): string {
  return /^[A-Z][A-Z]/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1)
}

/** "Yards per route run vs targets", "EPA per play allowed vs EPA per play". */
export function chartTitle(
  x: MetricInfo | undefined,
  xId: string,
  y: MetricInfo | undefined,
  yId: string
): string {
  return `${y?.label ?? yId} vs ${lowerFirst(x?.label ?? xId)}`
}

/** "6 TEs qualify on both axes in the postseason. A scatter needs at least 10." */
export function fewNote(qualified: number, who: string, range: string): string {
  const when = /season$/.test(range) ? `the ${range.toLowerCase()}` : range.toLowerCase()
  return `${qualified} ${who} qualify on both axes in ${when}. A scatter needs at least ${MIN_DOTS}.`
}

/** An axis's label: "Sack rate ↓" when lower is better (it runs reversed). */
export function axisLabel(info: MetricInfo | undefined, id: string): string {
  return `${info?.label ?? id}${info?.direction === 'lower' ? ' ↓' : ''}`
}

/** Round tick steps: 1, 2, 2.5, 5 × a power of ten. */
export function ticks(lo: number, hi: number, n: number): number[] {
  const raw = (hi - lo || Math.abs(hi) || 1) / n
  const mag = Math.pow(10, Math.floor(Math.log10(raw)))
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? mag * 10
  const out: number[] = []
  for (let v = Math.ceil(lo / step) * step; v <= hi + step * 1e-6; v += step)
    out.push(Number(v.toFixed(6)))
  return out
}

/** The scatter's box: the plot sits inside the margins. */
export const PLOT = { width: 952, height: 430, left: 56, right: 18, top: 28, bottom: 44 }

export interface Scales {
  x: (v: number) => number
  y: (v: number) => number
  xTicks: number[]
  yTicks: number[]
}

/** The axes' scales, padded 7 %; a lower-is-better axis reversed so up and right is better. */
export function scales(
  domain: { x: [number, number]; y: [number, number] },
  flip: { x: boolean; y: boolean }
): Scales {
  const pad = ([lo, hi]: [number, number]): [number, number] => {
    const p = (hi - lo) * 0.07 || Math.abs(hi) * 0.1 || 1
    return [lo - p, hi + p]
  }
  const [x0, x1] = pad(domain.x)
  const [y0, y1] = pad(domain.y)
  const w = PLOT.width - PLOT.left - PLOT.right
  const h = PLOT.height - PLOT.top - PLOT.bottom
  const along = (v: number, lo: number, hi: number, reversed: boolean): number => {
    const t = (v - lo) / (hi - lo)
    return reversed ? 1 - t : t
  }
  return {
    x: (v) => PLOT.left + along(v, x0, x1, flip.x) * w,
    y: (v) => PLOT.top + (1 - along(v, y0, y1, flip.y)) * h,
    xTicks: ticks(x0, x1, 7).filter((v) => v >= x0 && v <= x1),
    yTicks: ticks(y0, y1, 6).filter((v) => v >= y0 && v <= y1)
  }
}

export interface LabelItem {
  id: string
  text: string
  cx: number
  cy: number
  r: number
  kind: 'strong' | 'mine' | 'muted' | 'team'
}

export interface PlacedLabel extends LabelItem {
  /** The label's left and top. */
  left: number
  top: number
}

/** Labels in order of importance, each right, left, above or below its dot; skipped on a collision. */
export function placeLabels(items: readonly LabelItem[], charWidth: number): PlacedLabel[] {
  const [L, R] = [PLOT.left + 2, PLOT.width - PLOT.right - 2]
  const [T, B] = [PLOT.top + 2, PLOT.height - PLOT.bottom - 2]
  const boxes: { l: number; t: number; w: number; h: number }[] = []
  const out: PlacedLabel[] = []
  for (const it of items) {
    const w = it.text.length * charWidth + 2
    const h = 13
    const o = it.r + 4
    const spots: [number, number][] = [
      [it.cx + o, it.cy - 7],
      [it.cx - o - w, it.cy - 7],
      [it.cx - w / 2, it.cy - it.r - 16],
      [it.cx - w / 2, it.cy + it.r + 3]
    ]
    const hit = spots.find(
      ([l, t]) =>
        l >= L &&
        l + w <= R &&
        t >= T &&
        t + h <= B &&
        !boxes.some((b) => l < b.l + b.w && l + w > b.l && t < b.t + b.h && t + h > b.t)
    )
    if (!hit) continue
    boxes.push({ l: hit[0], t: hit[1], w, h })
    out.push({ ...it, left: hit[0], top: hit[1] })
  }
  return out
}

/** How many of the dots farthest from the centre a player chart labels. */
export const EXTREME_LABELS = 6

/** "J. Jefferson"; a team by its abbreviation. */
export function shortName(entity: ChartEntity, dot: Pick<ChartDot, 'id' | 'name'>): string {
  return entity === 'team' ? teamAbbr(dot.id) : dot.name.replace(/^(\S)\S*\s/, '$1. ')
}

/**
 * What gets a label: searched and picked dots, mine, then (players) the six farthest from the
 * crowd (in standard deviations on both axes, so a corner of dense dots does not take them all),
 * or (teams) every team.
 */
export function labelItems(
  entity: ChartEntity,
  dots: readonly ChartDot[],
  at: (d: ChartDot) => { cx: number; cy: number; r: number }
): LabelItem[] {
  const item = (d: ChartDot, kind: LabelItem['kind']): LabelItem => ({
    id: d.id,
    text: shortName(entity, d),
    ...at(d),
    kind
  })
  const strong = dots.filter((d) => d.matched || d.pick >= 0)
  const mine = dots.filter((d) => d.mine && !d.matched && d.pick < 0)
  const rest = dots.filter((d) => !d.mine && !d.matched && d.pick < 0)
  const spots = dots.map(at)
  const spread = (vs: number[]): [number, number] => {
    const m = vs.reduce((t, v) => t + v, 0) / vs.length
    const sd = Math.sqrt(vs.reduce((t, v) => t + (v - m) ** 2, 0) / vs.length) || 1
    return [m, sd]
  }
  const [mx, sx] = spread(spots.map((p) => p.cx))
  const [my, sy] = spread(spots.map((p) => p.cy))
  const far = (d: ChartDot): number => {
    const { cx, cy } = at(d)
    return ((cx - mx) / sx) ** 2 + ((cy - my) / sy) ** 2
  }
  const others =
    entity === 'team' ? rest : [...rest].sort((a, b) => far(b) - far(a)).slice(0, EXTREME_LABELS)
  return [
    ...strong.map((d) => item(d, 'strong')),
    ...mine.map((d) => item(d, 'mine')),
    ...others.map((d) => item(d, entity === 'team' ? 'team' : 'muted'))
  ]
}

/** A dot's radius: by the size metric's percentile (3.5 + 6.5 × p), else 5 (players) or 6.5. */
export function dotRadius(entity: ChartEntity, dot: ChartDot, size: string | null): number {
  if (size === null) return entity === 'team' ? 6.5 : 5
  return 3.5 + 6.5 * ((dot.percentiles[size] ?? 50) / 100)
}

/** The table's rows: by a metric's percentile (best first, unranked last), or by name. */
export function chartRows(
  dots: readonly ChartDot[],
  sort: ChartState['sort'],
  axes: { x: string; y: string }
): ChartDot[] {
  const metric = sort.by === 'x' ? axes.x : sort.by === 'y' ? axes.y : sort.by
  return [...dots].sort((a, b) => {
    if (sort.by === 'name') return sort.dir * a.name.localeCompare(b.name)
    const pa = a.percentiles[metric] ?? null
    const pb = b.percentiles[metric] ?? null
    if (pa === null || pb === null) return pa === pb ? 0 : pa === null ? 1 : -1
    return sort.dir * (pb - pa)
  })
}

/** "24.1%", "+0.12", "8.4" (a count per game with one decimal). */
export function chartValue(
  info: MetricInfo | undefined,
  v: number | null,
  perGame: boolean
): string {
  return fmtStat(
    v,
    { unit: info?.unit ?? 'number', decimals: info?.decimals ?? 1, kind: info?.kind },
    perGame
  )
}

/** "WRs · 2026 · weeks 1–7 · per game". */
export function chartSubtitle(
  entity: ChartEntity,
  position: PositionGroup,
  season: number,
  range: string,
  perGame: boolean
): string {
  const who = entity === 'team' ? 'Teams' : `${position}s`
  return [
    who,
    String(season),
    range.toLowerCase(),
    ...(entity === 'player' ? [perGame ? 'per game' : 'totals'] : [])
  ].join(' · ')
}

/** Compare's state from the picks: the same entity and position, the picks in the slots. */
export function compareFromPicks(
  entity: ChartEntity,
  position: PositionGroup,
  picks: readonly string[]
): Pick<CompareState, 'entity' | 'position' | 'slots' | 'seed'> {
  return {
    entity,
    position,
    slots: [picks[0] ?? null, picks[1] ?? null, picks[2] ?? null],
    seed: null
  }
}
```

- [x] **Step 4: Run them and see them pass**

```bash
npx vitest run tests/renderer/lib/statsChart.test.ts
```

Expected: 1 passed: 11 passed.

- [x] **Step 5: Format, typecheck, lint, the whole suite**

```bash
npx prettier --check src/renderer/src/lib/stats/chart.ts tests/renderer/lib/statsChart.test.ts
npm run typecheck
npx eslint src tests electron.vite.config.ts
npx vitest run
```

Expected: prettier and typecheck clean, no lint problems, 1155 passed, 5 skipped.

- [x] **Step 6: Commit**

```bash
git add src/renderer/src/lib/stats/chart.ts tests/renderer/lib/statsChart.test.ts
git commit -F - <<'EOF'
feat(stats): add the chart explorer's model

Axes from presets per position (a volume against an efficiency; the
teams' offense against defense EPA), one query over the position or
the 32, the dots qualified on both axes and ranked among the
position's qualified, a team filter that keeps the axes, r and the
corners oriented so up and right is better, the scales, the labels
and the table's order.
EOF
```

---

### Task 2: The chart explorer on screen (spec §9.5, §9.6; amendments A–G)

Explore enables Chart and opens on it the first time. `StatsChart` has the bar, the controls column, the title and the picks, the states and the table; `Scatter` draws the dots, rings, labels and hover card. `StatsApp` keeps the chart's state and routes the picks to Compare. Trends' percentile chip moves to the shared parts and the stat lines' heat colour to `format.ts`, unchanged. Compare's tests click their tab, since Explore opens on Chart.

**Files:**

- Create: `src/renderer/src/components/stats/Scatter.tsx`, `src/renderer/src/screens/stats/StatsChart.tsx`
- Modify: `src/renderer/src/components/stats/StatLines.tsx`, `src/renderer/src/components/stats/parts.tsx`, `src/renderer/src/lib/stats/format.ts`, `src/renderer/src/screens/stats/StatsApp.tsx`, `src/renderer/src/screens/stats/StatsExplore.tsx`, `src/renderer/src/screens/stats/StatsTrends.tsx`, `tests/renderer/components/StatsExplore.test.tsx`

- [x] **Step 1: Write the failing tests**

Modify `tests/renderer/components/StatsExplore.test.tsx`:

```diff
diff --git a/tests/renderer/components/StatsExplore.test.tsx b/tests/renderer/components/StatsExplore.test.tsx
index ae2ec9f..234ced5 100644
--- a/tests/renderer/components/StatsExplore.test.tsx
+++ b/tests/renderer/components/StatsExplore.test.tsx
@@ -154,8 +154,14 @@ beforeEach(() => {
 })
 afterEach(cleanup)

+/** Explore › Compare. */
+async function openCompare(): Promise<void> {
+  await open('Explore')
+  fireEvent.click(await screen.findByRole('tab', { name: 'Compare' }))
+}
+
 describe('Explore: Compare and Trends (stats-analysis spec §9.5)', () => {
-  it('sits between Teams and Games: Compare first, the chart explorer later', async () => {
+  it('sits between Teams and Games: Chart first, then Compare and Trends', async () => {
     await open('Explore')
     const nav = screen.getByRole('navigation')
     expect(
@@ -165,16 +171,17 @@ describe('Explore: Compare and Trends (stats-analysis spec §9.5)', () => {
     ).toEqual(expect.arrayContaining(['Teams', 'Explore', 'Games']))
     const tabs = within(screen.getByRole('tablist', { name: 'Explore' })).getAllByRole('tab')
     expect(tabs.map((t) => [t.textContent, (t as HTMLButtonElement).disabled])).toEqual([
-      ['Chart', true],
+      ['Chart', false],
       ['Compare', false],
       ['Trends', false]
     ])
-    expect(screen.getByRole('tab', { name: 'Compare', selected: true })).toBeTruthy()
+    expect(screen.getByRole('tab', { name: 'Chart', selected: true })).toBeTruthy()
+    fireEvent.click(screen.getByRole('tab', { name: 'Compare' }))
     expect(await screen.findByRole('heading', { name: 'Head to head' })).toBeTruthy()
   })

   it('compares the position’s top three, leads rows, removes and adds a player', async () => {
-    await open('Explore')
+    await openCompare()
     fireEvent.click(await screen.findByRole('radio', { name: 'WR' }))
     expect(await swaps()).toEqual(['p0', 'p1', 'p2'])
     // p0 has the best value in every row with a better side.
@@ -198,7 +205,7 @@ describe('Explore: Compare and Trends (stats-analysis spec §9.5)', () => {
   })

   it('compares teams: the top three by Elo, their record, division place and Elo', async () => {
-    await open('Explore')
+    await openCompare()
     fireEvent.click(await screen.findByRole('radio', { name: 'Teams' }))
     expect(await swaps('team')).toEqual(['KC', 'BUF', 'MIA'])
     expect(screen.getByText('1,650')).toBeTruthy()
@@ -275,3 +282,138 @@ describe('Explore: Compare and Trends (stats-analysis spec §9.5)', () => {
     expect(await screen.findByText('Find a WR to see his seasons.')).toBeTruthy()
   })
 })
+
+/** A WR chart query (the whole position), or the 32 teams'; no grouping. Other TEs: `answer`. */
+const isChart = (q: StatsQuery): boolean =>
+  !q.groupBy &&
+  ((q.entity === 'player' && q.limit === 5000 && q.scope.positions?.[0] === 'WR') ||
+    (q.entity === 'team' && q.limit === 40))
+
+/** Twelve WRs (w0 … w11), targets and YPRR rising together; p1 is mine. Twelve teams. */
+function chartAnswer(q: StatsQuery): ReturnType<typeof result> {
+  if (q.entity === 'team') {
+    const teams = [
+      'ARI',
+      'ATL',
+      'BAL',
+      'BUF',
+      'CAR',
+      'CHI',
+      'CIN',
+      'CLE',
+      'DAL',
+      'DEN',
+      'DET',
+      'GB'
+    ]
+    return result(
+      q.metrics,
+      teams.map((t, i) =>
+        row(t, t, Object.fromEntries(q.metrics.map((m) => [m, value(i / 100)])), {
+          team: t,
+          position: null
+        })
+      )
+    )
+  }
+  const ids = ['p1', ...Array.from({ length: 11 }, (_, i) => `w${i}`)]
+  return result(
+    q.metrics,
+    ids.map((id, i) =>
+      row(
+        id,
+        id === 'p1' ? 'Player One' : `Receiver ${String.fromCharCode(65 + i)}`,
+        Object.fromEntries(q.metrics.map((m) => [m, value(i + 1, { sample: 50 })])),
+        { position: 'WR', team: 'BUF' }
+      )
+    )
+  )
+}
+
+describe('Explore: the chart explorer (stats-analysis spec §9.5)', () => {
+  beforeEach(() => {
+    stats.query.mockImplementation(async (q) => (isChart(q) ? chartAnswer(q) : answer(q)))
+  })
+
+  it('opens on a WR’s volume against his efficiency, my player ringed and labelled', async () => {
+    await open('Explore')
+    expect(
+      await screen.findByRole('heading', { name: 'Yards per route run vs targets' })
+    ).toBeTruthy()
+    await waitFor(() => expect(document.querySelectorAll('[data-dot]')).toHaveLength(12))
+    const query = stats.query.mock.calls.map((c) => c[0]).find(isChart)!
+    expect(query).toMatchObject({ transform: 'perGame', scope: { positions: ['WR'] } })
+    expect(screen.getByRole('button', { name: 'Volume vs efficiency', pressed: true })).toBeTruthy()
+    // Mine paints last, its label among the first.
+    expect(document.querySelectorAll('[data-dot]')[11].getAttribute('data-dot')).toBe('p1')
+    expect(screen.getByText('P. One', { selector: 'text' })).toBeTruthy()
+    expect(screen.getByText('+1.00')).toBeTruthy()
+    // An axis by hand leaves the preset.
+    fireEvent.change(screen.getByRole('combobox', { name: 'Y axis' }), {
+      target: { value: 'air_yards_share' }
+    })
+    expect(await screen.findByRole('heading', { name: 'Air-yards share vs targets' })).toBeTruthy()
+    expect(screen.getByRole('button', { name: 'Targets vs air yards', pressed: true })).toBeTruthy()
+  })
+
+  it('opens a dot’s dashboard; shift-clicks two and compares them', async () => {
+    await open('Explore')
+    await waitFor(() => expect(document.querySelectorAll('[data-dot]')).toHaveLength(12))
+    const dot = (id: string): Element => document.querySelector(`[data-dot="${id}"]`)!
+    fireEvent.click(dot('w4'), { shiftKey: true })
+    fireEvent.click(dot('w2'), { shiftKey: true })
+    fireEvent.click(await screen.findByRole('button', { name: 'Compare these →' }))
+    expect(await screen.findByRole('tab', { name: 'Compare', selected: true })).toBeTruthy()
+    expect(await swaps()).toEqual(['w4', 'w2'])
+    expect(screen.getByText('Add a third player…')).toBeTruthy()
+    // Back on Chart, the picks are kept; a plain click opens the dashboard.
+    fireEvent.click(screen.getByRole('tab', { name: 'Chart' }))
+    await waitFor(() => expect(document.querySelectorAll('[data-dot]')).toHaveLength(12))
+    fireEvent.click(dot('w4'))
+    expect(await screen.findByRole('tablist', { name: 'Player dashboard' })).toBeTruthy()
+  })
+
+  it('charts the teams, every one labelled', async () => {
+    await open('Explore')
+    fireEvent.click(await screen.findByRole('radio', { name: 'Teams' }))
+    expect(
+      await screen.findByRole('heading', { name: 'EPA per play allowed vs EPA per play' })
+    ).toBeTruthy()
+    await waitFor(() => expect(document.querySelectorAll('[data-dot]')).toHaveLength(12))
+    expect(screen.getByText('Good offense, good defense')).toBeTruthy()
+    expect(screen.queryByRole('radio', { name: 'Per game' })).toBeNull()
+  })
+
+  it('says when too few qualify, and offers everyone', async () => {
+    await open('Explore')
+    fireEvent.click(await screen.findByRole('radio', { name: 'TE' }))
+    // A TE's chart query reaches the fixture's four players, three of them qualified.
+    expect(await screen.findByText('Too few qualifiers to chart')).toBeTruthy()
+    expect(screen.getByText(/^3 TEs qualify on both axes/)).toBeTruthy()
+    fireEvent.click(screen.getByRole('button', { name: 'Show all 4 TEs' }))
+    expect(await screen.findByText('Too few qualifiers to chart')).toBeTruthy()
+  })
+
+  it('says when an axis is not published for the season, and offers the one before', async () => {
+    stats.query.mockImplementation(async (q) => {
+      const r = isChart(q) ? chartAnswer(q) : answer(q)
+      return {
+        ...r,
+        columns: r.columns.map((c) => (c.id === 'off_pressure_rate' ? { ...c, seasons: [] } : c))
+      }
+    })
+    await open('Explore')
+    fireEvent.click(await screen.findByRole('radio', { name: 'Teams' }))
+    await screen.findByRole('heading', { name: 'EPA per play allowed vs EPA per play' })
+    fireEvent.change(screen.getByRole('combobox', { name: 'X axis' }), {
+      target: { value: 'off_pressure_rate' }
+    })
+    expect(await screen.findByText('Pressure rate is not published for 2026 yet.')).toBeTruthy()
+    fireEvent.click(screen.getByRole('button', { name: 'Use 2025' }))
+    await waitFor(() =>
+      expect(
+        stats.query.mock.calls.some((c) => isChart(c[0]) && c[0].scope.seasons[0] === 2025)
+      ).toBe(true)
+    )
+  })
+})
```

- [x] **Step 2: Run them and see them fail**

```bash
npx vitest run tests/renderer/components/StatsExplore.test.tsx
```

Expected: 1 test file fails: 6 failed | 7 passed. The Chart tab is disabled and Explore opens on Compare.

- [x] **Step 3: The scatter, the screen, the routes**

Create `src/renderer/src/components/stats/Scatter.tsx`:

```tsx
import { useState } from 'react'
import {
  dotRadius,
  labelItems,
  placeLabels,
  PLOT,
  type ChartDot,
  type ChartEntity,
  type Scales
} from '@/lib/stats/chart'
import { heatColor } from '@/lib/stats/format'

const SERIES = ['var(--s1)', 'var(--s2)', 'var(--s3)']

/** What the hover card says about a dot. */
export interface DotCard {
  title: string
  sub: string
  lines: { label: string; text: string; chip: React.ReactNode }[]
  sample: string
}

/**
 * The chart explorer's scatter (handoff §15): gridlines, the qualified means dashed with the
 * corners' words, a dot per row (sized and coloured by a percentile when asked), rings for mine,
 * the searched, the hovered and the picked, labels placed without collisions, and a hover card.
 * A click opens the dashboard; a shift-click picks the dot for Compare.
 */
export function Scatter({
  entity,
  dots,
  scales: s,
  mean,
  corners,
  xLabel,
  yLabel,
  format,
  size,
  colour,
  card,
  onOpen,
  onPick,
  label
}: {
  entity: ChartEntity
  dots: readonly ChartDot[]
  scales: Scales
  mean: { x: number; y: number }
  corners: { tl: string; tr: string; bl: string; br: string }
  xLabel: string
  yLabel: string
  format: { x: (v: number) => string; y: (v: number) => string }
  size: string | null
  colour: string | null
  card: (dot: ChartDot) => DotCard
  onOpen: (dot: ChartDot) => void
  onPick: (dot: ChartDot) => void
  label: string
}): React.JSX.Element {
  const [hover, setHover] = useState<string | null>(null)
  const { width: W, height: H, left: L, right: R, top: T, bottom: B } = PLOT
  const at = (d: ChartDot): { cx: number; cy: number; r: number } => ({
    cx: s.x(d.x),
    cy: s.y(d.y),
    r: dotRadius(entity, d, size)
  })
  const labels = placeLabels(labelItems(entity, dots, at), entity === 'team' ? 6.6 : 6.3)
  const hovered = dots.find((d) => d.id === hover) ?? null
  const ring = (d: ChartDot): string | null =>
    d.pick >= 0
      ? SERIES[d.pick]
      : d.id === hover
        ? 'var(--cobalt)'
        : d.matched
          ? 'var(--fg)'
          : d.mine
            ? 'var(--brand)'
            : null
  const fill = (d: ChartDot): string =>
    colour === null
      ? 'var(--cobalt)'
      : d.percentiles[colour] === null
        ? 'var(--fg-3)'
        : heatColor((d.percentiles[colour] ?? 50) / 100, false)
  // Hovered last, over every other dot.
  const order = hovered ? [...dots.filter((d) => d.id !== hover), hovered] : dots
  const corner = 'fill-fg-3 text-[11px]'
  const info = hovered ? card(hovered) : null
  const hx = hovered ? s.x(hovered.x) : 0
  const hy = hovered ? s.y(hovered.y) : 0
  return (
    <div className="relative">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        width="100%"
        role="img"
        aria-label={label}
        className="block overflow-visible"
        onMouseLeave={() => setHover(null)}
      >
        {s.xTicks.map((v) => (
          <g key={`x${v}`}>
            <line x1={s.x(v)} x2={s.x(v)} y1={T} y2={H - B} stroke="var(--line-2)" />
            <text
              x={s.x(v)}
              y={H - B + 16}
              textAnchor="middle"
              className="fill-fg-3 font-mono text-[10.5px]"
            >
              {format.x(v)}
            </text>
          </g>
        ))}
        {s.yTicks.map((v) => (
          <g key={`y${v}`}>
            <line x1={L} x2={W - R} y1={s.y(v)} y2={s.y(v)} stroke="var(--line-2)" />
            <text
              x={L - 8}
              y={s.y(v) + 4}
              textAnchor="end"
              className="fill-fg-3 font-mono text-[10.5px]"
            >
              {format.y(v)}
            </text>
          </g>
        ))}
        <text x={L} y={T - 12} className="fill-fg-2 text-[11.5px] font-medium">
          ↑ {yLabel}
        </text>
        <text x={W - R} y={H - 6} textAnchor="end" className="fill-fg-2 text-[11.5px] font-medium">
          {xLabel} →
        </text>
        <g stroke="var(--fg-3)" strokeOpacity={0.7} strokeDasharray="4 4" data-means="">
          <line x1={s.x(mean.x)} x2={s.x(mean.x)} y1={T} y2={H - B} />
          <line x1={L} x2={W - R} y1={s.y(mean.y)} y2={s.y(mean.y)} />
        </g>
        <text x={W - R - 6} y={T + 14} textAnchor="end" className={`${corner} font-medium`}>
          {corners.tr}
        </text>
        <text x={L + 6} y={T + 14} className={corner}>
          {corners.tl}
        </text>
        <text x={W - R - 6} y={H - B - 8} textAnchor="end" className={corner}>
          {corners.br}
        </text>
        <text x={L + 6} y={H - B - 8} className={corner}>
          {corners.bl}
        </text>
        {order.map((d) => {
          const { cx, cy, r } = at(d)
          const rim = ring(d)
          // Special dots are opaque; coloured ones nearly; the rest let the crowd show through.
          const opacity = rim !== null ? 1 : colour !== null ? 0.9 : entity === 'team' ? 0.62 : 0.5
          return (
            <g
              key={d.id}
              data-dot={d.id}
              className="cursor-pointer"
              onMouseEnter={() => setHover(d.id)}
              onClick={(e) => (e.shiftKey ? onPick(d) : onOpen(d))}
            >
              {rim && (
                <circle
                  cx={cx}
                  cy={cy}
                  r={r + (d.pick >= 0 ? 4 : 3.75)}
                  fill="none"
                  stroke={rim}
                  strokeWidth={d.pick >= 0 ? 4 : 3.5}
                />
              )}
              <circle
                cx={cx}
                cy={cy}
                r={r}
                fill={fill(d)}
                fillOpacity={opacity}
                stroke="var(--panel)"
                strokeWidth={rim !== null ? 2 : 1}
              />
            </g>
          )
        })}
        {labels.map((l) => (
          <text
            key={l.id}
            x={l.left + 1}
            y={l.top + 10}
            stroke="var(--panel)"
            strokeWidth={3}
            paintOrder="stroke"
            pointerEvents="none"
            className={
              entity === 'team'
                ? 'fill-fg font-mono text-[10.5px] font-semibold'
                : l.kind === 'strong'
                  ? 'fill-fg text-[11px] font-semibold'
                  : l.kind === 'mine'
                    ? 'fill-fg text-[11px] font-medium'
                    : 'fill-fg-3 text-[11px]'
            }
          >
            {l.text}
          </text>
        ))}
      </svg>
      {info && (
        <div
          role="tooltip"
          className="pointer-events-none absolute z-10 flex w-[236px] flex-col gap-1.5 rounded-[9px] bg-panel px-3 py-2.5 text-[11.5px] shadow-[0_0_0_1px_var(--line),0_10px_28px_var(--shadow-c)]"
          style={{
            top: `${(Math.max(T, hy - 40) / H) * 100}%`,
            ...(hx > L + (W - L - R) * 0.6
              ? { right: `${(1 - (hx - 16) / W) * 100}%` }
              : { left: `${((hx + 16) / W) * 100}%` })
          }}
        >
          <span className="text-[13px] font-semibold text-fg">{info.title}</span>
          <span className="font-mono text-[11px] text-fg-3">{info.sub}</span>
          {info.lines.map((x) => (
            <span key={x.label} className="flex items-center justify-between gap-2 text-fg-2">
              <span className="truncate">{x.label}</span>
              <span className="flex items-center gap-1.5 font-mono text-fg">
                {x.text}
                {x.chip}
              </span>
            </span>
          ))}
          <span className="text-fg-3">{info.sample}</span>
          <span className="text-cobalt">Click to open ↗</span>
        </div>
      )}
    </div>
  )
}
```

Modify `src/renderer/src/components/stats/StatLines.tsx`:

```diff
diff --git a/src/renderer/src/components/stats/StatLines.tsx b/src/renderer/src/components/stats/StatLines.tsx
index c5f9300..1fe3850 100644
--- a/src/renderer/src/components/stats/StatLines.tsx
+++ b/src/renderer/src/components/stats/StatLines.tsx
@@ -1,20 +1,9 @@
 import { TrendingUp } from 'lucide-react'
 import { MetricHover, ReliabilityMarker } from '@/components/stats/MetricCard'
+import { heatColor } from '@/lib/stats/format'
 import type { SectionView, StatLine } from '@/lib/stats/team'
 import { cn } from '@/lib/utils'

-/**
- * The handoff's heat scale (Stats Profile): green above the median, red below, stronger toward the
- * ends; a metric with no better side stays grey.
- */
-function heatColor(p: number, neutral: boolean): string {
-  if (neutral) return 'var(--fg-3)'
-  const t = Math.min(1, Math.abs(p - 0.5) / 0.5)
-  return p >= 0.5
-    ? `oklch(${(0.66 - 0.06 * t).toFixed(3)} ${(0.02 + 0.13 * t).toFixed(3)} 150)`
-    : `oklch(${(0.66 - 0.04 * t).toFixed(3)} ${(0.02 + 0.17 * t).toFixed(3)} 25)`
-}
-
 /** Handoff "Percentile rankings": a track, a fill to the percentile, the number in a pill. */
 export function PercentileBar({
   percentile,
```

Trends' percentile chip moves to the shared parts, unchanged:

Modify `src/renderer/src/components/stats/parts.tsx`:

```diff
diff --git a/src/renderer/src/components/stats/parts.tsx b/src/renderer/src/components/stats/parts.tsx
index 17e5854..624323f 100644
--- a/src/renderer/src/components/stats/parts.tsx
+++ b/src/renderer/src/components/stats/parts.tsx
@@ -212,3 +212,31 @@ export function Headshot({
     />
   )
 }
+
+/** A percentile as a soft chip: green from the 75th, red to the 25th; "NQ" or "—" outlined. */
+export function PctChip({
+  percentile,
+  qualified
+}: {
+  percentile: number | null
+  qualified: boolean
+}): React.JSX.Element {
+  if (percentile === null) {
+    return (
+      <span className="flex h-[18px] min-w-[30px] items-center justify-center rounded-[4px] px-1 font-mono text-[10.5px] font-semibold text-fg-3 shadow-[inset_0_0_0_1px_var(--line)]">
+        {qualified ? '—' : 'NQ'}
+      </span>
+    )
+  }
+  const n = Math.round(percentile)
+  return (
+    <span
+      className={cn(
+        'flex h-[18px] min-w-[30px] items-center justify-center rounded-[4px] px-1 font-mono text-[10.5px] font-semibold',
+        n >= 75 ? 'bg-good-s text-good' : n <= 25 ? 'bg-bad-s text-bad' : 'text-fg-3'
+      )}
+    >
+      {n}
+    </span>
+  )
+}
```

The heat colour moves here from the stat lines, unchanged, so the scatter colours by it:

Modify `src/renderer/src/lib/stats/format.ts`:

```diff
diff --git a/src/renderer/src/lib/stats/format.ts b/src/renderer/src/lib/stats/format.ts
index b03d575..2aba7a3 100644
--- a/src/renderer/src/lib/stats/format.ts
+++ b/src/renderer/src/lib/stats/format.ts
@@ -42,6 +42,18 @@ export function heatOf(percentile: number | null, direction: MetricInfo['directi
   return 'n'
 }

+/**
+ * The handoff's heat scale (Stats Profile): green above the median, red below, stronger toward the
+ * ends; a metric with no better side stays grey.
+ */
+export function heatColor(p: number, neutral: boolean): string {
+  if (neutral) return 'var(--fg-3)'
+  const t = Math.min(1, Math.abs(p - 0.5) / 0.5)
+  return p >= 0.5
+    ? `oklch(${(0.66 - 0.06 * t).toFixed(3)} ${(0.02 + 0.13 * t).toFixed(3)} 150)`
+    : `oklch(${(0.66 - 0.04 * t).toFixed(3)} ${(0.02 + 0.17 * t).toFixed(3)} 25)`
+}
+
 /** "1st", "22nd", "73rd", "11th". */
 export function ordinal(n: number): string {
   const r = Math.round(n)
```

Modify `src/renderer/src/screens/stats/StatsApp.tsx`:

```diff
diff --git a/src/renderer/src/screens/stats/StatsApp.tsx b/src/renderer/src/screens/stats/StatsApp.tsx
index 4eab857..3cc3249 100644
--- a/src/renderer/src/screens/stats/StatsApp.tsx
+++ b/src/renderer/src/screens/stats/StatsApp.tsx
@@ -5,6 +5,7 @@ import { useNoteContext, useNoteScreen } from '@/lib/dev/noteContext'
 import { errorMessage } from '@/lib/format'
 import type { NavLocation } from '@/lib/navHistory'
 import type { BoardDef } from '@/lib/stats/boards'
+import { compareFromPicks, DEFAULT_CHART, type ChartState } from '@/lib/stats/chart'
 import { DEFAULT_COMPARE, type CompareState } from '@/lib/stats/compare'
 import { bestFirst, defaultBoard, normalizeBoard } from '@/lib/stats/leaderboard'
 import { defaultPlayer, positionTab, railQuery, type PlayerTab } from '@/lib/stats/player'
@@ -85,7 +86,8 @@ export function StatsApp({
   const [player, setPlayer] = useState<PlayerRef | null>(null)
   const [playerTab, setPlayerTab] = useState<PlayerTab>('overview')
   // Explore (spec §9.5): its tab and each tab's state, kept for the session.
-  const [exploreTab, setExploreTab] = useState<ExploreTab>('compare')
+  const [exploreTab, setExploreTab] = useState<ExploreTab>('chart')
+  const [chart, setChart] = useState<ChartState>(DEFAULT_CHART)
   const [compare, setCompare] = useState<CompareState>(DEFAULT_COMPARE)
   const [trends, setTrends] = useState<TrendsState>(DEFAULT_TRENDS)
   // A focus from Fantasy opens its dashboard once.
@@ -164,6 +166,11 @@ export function StatsApp({
     setExploreTab('compare')
     setScreen('explore')
   }
+  // The chart's picks: Compare with them in its slots.
+  const compareChart = (c: ChartState): void => {
+    setCompare((s) => ({ ...s, ...compareFromPicks(c.entity, c.position, c.picks) }))
+    setExploreTab('compare')
+  }
   // A stat line's trend icon: that metric over his (its) seasons.
   const openTrends = (
     entity: TrendsState['entity'],
@@ -355,6 +362,9 @@ export function StatsApp({
                 hasLeague={hasLeague}
                 tab={exploreTab}
                 onTab={setExploreTab}
+                chart={chart}
+                onChart={setChart}
+                onCompareChart={compareChart}
                 compare={compare}
                 onCompare={setCompare}
                 trends={trends}
```

Create `src/renderer/src/screens/stats/StatsChart.tsx`:

```tsx
import { useMemo } from 'react'
import { ArrowUpDown, Search } from 'lucide-react'
import { CheckToggle, MineDot, Segmented, StatsSelect } from '@/components/stats/controls'
import { Loading, PctChip } from '@/components/stats/parts'
import { Scatter, type DotCard } from '@/components/stats/Scatter'
import { Swatch } from '@/components/stats/WeekChart'
import {
  axisLabel,
  chartAxes,
  chartExtras,
  chartQuery,
  chartRows,
  chartSubtitle,
  chartTitle,
  chartValue,
  chartView,
  corners,
  fewNote,
  MAX_PICKS,
  presetsFor,
  resetChart,
  scaled,
  scales,
  shortName,
  type ChartDot,
  type ChartState
} from '@/lib/stats/chart'
import { familyLabel, heatColor } from '@/lib/stats/format'
import { positionTab, RAIL_POSITIONS } from '@/lib/stats/player'
import { lastWeek, rangeLabel, weeksOf, type StatsScope } from '@/lib/stats/scope'
import { trendMetrics } from '@/lib/stats/trends'
import { useStatsQuery, type StatsData } from '@/lib/stats/useStats'
import { cn } from '@/lib/utils'
import { STATS_TEAMS, TEAM_NAMES, teamAbbr } from '@shared/stats/nflTeams'
import type { MetricInfo, PositionGroup } from '@shared/stats/types'

const FRESH = { keepLast: false }
const LABEL = 'font-mono text-[11px] tracking-[0.04em] text-fg-3 uppercase'

/**
 * The chart explorer (spec §9.5, handoff "15. Chart explorer"): any metric against any other for
 * the players at a position or the 32 teams, with presets, size and colour by a third metric,
 * filters, a scatter and its table. A dot opens its dashboard; shift-click picks up to three for
 * Compare.
 */
export function StatsChart({
  data,
  scope,
  onScope,
  state,
  onState,
  onOpenPlayer,
  onOpenTeam,
  onCompare
}: {
  data: StatsData
  scope: StatsScope
  onScope: (scope: StatsScope) => void
  state: ChartState
  /** Updates from the state as it is then. */
  onState: (update: (state: ChartState) => ChartState) => void
  onOpenPlayer: (id: string, position: PositionGroup | null) => void
  onOpenTeam: (team: string) => void
  /** Opens Compare on the picks. */
  onCompare: (state: ChartState) => void
}): React.JSX.Element {
  const { entity, position } = state
  const isPlayer = entity === 'player'
  // Team rows are rates and season totals: never per game.
  const perGame = isPlayer && state.perGame
  const axes = chartAxes(state)
  const extras = chartExtras(state, axes)
  const info = (id: string): MetricInfo | undefined => data.byId.get(id)
  const X = info(axes.x)
  const Y = info(axes.y)
  const q = useMemo(
    () => chartQuery(entity, position, [axes.x, axes.y, ...extras], scope, data.status, perGame),
    // The metrics' text keys the query: a new array each render runs nothing again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [entity, position, axes.x, axes.y, extras.join(), scope, data.status, perGame]
  )
  const { result, error } = useStatsQuery(q, data.version, FRESH)
  const view = useMemo(
    () => (result ? chartView(result, state, data.byId, data.ownership, scope.season) : null),
    [result, state, data.byId, data.ownership, scope.season]
  )
  const groups = useMemo(
    () => trendMetrics(entity, position, data.catalogue),
    [entity, position, data.catalogue]
  )

  const set = (next: Partial<ChartState>): void => onState((s) => ({ ...s, ...next }))
  const reset = (next: Partial<ChartState>): void => onState((s) => resetChart(s, next))
  const presets = presetsFor(entity, position)
  const who = isPlayer ? `${position}s` : 'teams'
  const range = rangeLabel(scope, data.status)
  const fmt = (id: string) => (v: number | null) => chartValue(info(id), v, perGame)
  const open = (d: ChartDot): void => (isPlayer ? onOpenPlayer(d.id, position) : onOpenTeam(d.id))
  const pick = (d: ChartDot): void =>
    onState((s) => {
      const at = s.picks.indexOf(d.id)
      if (at >= 0) return { ...s, picks: s.picks.filter((id) => id !== d.id) }
      return s.picks.length < MAX_PICKS ? { ...s, picks: [...s.picks, d.id] } : s
    })

  const tab = positionTab(position)
  const qualifier = tab.qualifier ? info(tab.qualifier)?.sampleLabel : null
  const footnote = !isPlayer
    ? 'Every team qualifies.'
    : `Qualified: enough ${qualifier ?? 'snaps'} for the weeks in range, and each axis’s own sample.`

  const metricOptions = (only?: (m: MetricInfo) => boolean): React.JSX.Element[] =>
    groups.map((g) => (
      <optgroup key={g.family} label={familyLabel(g.family)}>
        {g.metrics
          .filter((m) => !only || only(m))
          .map((m) => (
            <option key={m.id} value={m.id}>
              {axisLabel(m, m.id)}
            </option>
          ))}
      </optgroup>
    ))
  const select = (
    label: string,
    value: string,
    onChange: (v: string) => void,
    children: React.ReactNode
  ): React.JSX.Element => (
    <select
      aria-label={label}
      title={label}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-7 w-full min-w-0 cursor-pointer rounded-[6px] border border-line bg-panel px-1.5 text-[12.5px] text-fg"
    >
      {children}
    </select>
  )

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3.5">
        <Segmented
          label="Players or teams"
          value={entity}
          options={[
            { value: 'player', label: 'Players' },
            { value: 'team', label: 'Teams' }
          ]}
          onChange={(e) => reset({ entity: e })}
        />
        {isPlayer && (
          <Segmented
            label="Position"
            value={position}
            options={RAIL_POSITIONS.map((p) => ({ value: p, label: p }))}
            onChange={(p) => reset({ position: p })}
          />
        )}
        {isPlayer && (
          <Segmented
            label="Totals or per game"
            value={perGame ? 'per' : 'total'}
            options={[
              { value: 'total', label: 'Totals' },
              { value: 'per', label: 'Per game' }
            ]}
            onChange={(v) => set({ perGame: v === 'per' })}
          />
        )}
      </div>
      <div className="flex min-w-0 gap-6">
        <aside className="flex w-[280px] shrink-0 flex-col gap-5 border-r border-line pr-5">
          <section className="flex flex-col gap-2">
            <span className={LABEL}>Presets</span>
            <div className="flex flex-wrap gap-1.5">
              {presets.map((p) => {
                const on = p.x === axes.x && p.y === axes.y
                return (
                  <button
                    key={p.label}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set({ x: p.x, y: p.y, picks: [] })}
                    className={cn(
                      'h-[26px] cursor-pointer rounded-[13px] px-3 text-[12px] font-medium',
                      on
                        ? 'bg-cobalt-soft text-cobalt shadow-[inset_0_0_0_1px_var(--cobalt)]'
                        : 'text-fg-2 shadow-[inset_0_0_0_1px_var(--line)] hover:text-fg'
                    )}
                  >
                    {p.label}
                  </button>
                )
              })}
            </div>
          </section>
          <section className="flex flex-col gap-2">
            <span className={LABEL}>Axes</span>
            <div className="flex items-center gap-2">
              <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                <label className="flex items-center gap-2 text-[12px] text-fg-2">
                  <span className="w-3 font-mono text-fg-3">Y</span>
                  {select('Y axis', axes.y, (y) => set({ x: axes.x, y }), metricOptions())}
                </label>
                <label className="flex items-center gap-2 text-[12px] text-fg-2">
                  <span className="w-3 font-mono text-fg-3">X</span>
                  {select('X axis', axes.x, (x) => set({ x, y: axes.y }), metricOptions())}
                </label>
              </div>
              <button
                type="button"
                title="Swap the axes"
                aria-label="Swap the axes"
                onClick={() => set({ x: axes.y, y: axes.x })}
                className="flex h-[68px] w-[30px] cursor-pointer items-center justify-center rounded-[6px] border border-line bg-panel text-fg-2 hover:bg-hover hover:text-fg"
              >
                <ArrowUpDown className="size-3.5" />
              </button>
            </div>
          </section>
          <section className="grid grid-cols-2 gap-2">
            <label className="flex min-w-0 flex-col gap-1.5">
              <span className={LABEL}>Size by</span>
              {select(
                'Size by',
                state.size ?? '',
                (v) => set({ size: v || null }),
                <>
                  <option value="">None</option>
                  {metricOptions((m) => scaled([m]).length > 0)}
                </>
              )}
            </label>
            <label className="flex min-w-0 flex-col gap-1.5">
              <span className={LABEL}>Colour by</span>
              {select(
                'Colour by',
                state.colour ?? '',
                (v) => set({ colour: v || null }),
                <>
                  <option value="">None</option>
                  {metricOptions((m) => scaled([m]).length > 0)}
                </>
              )}
            </label>
            {state.colour && (
              <div className="col-span-2 flex flex-col gap-1">
                <span
                  className="h-1.5 rounded-[3px]"
                  style={{
                    background: `linear-gradient(90deg, ${heatColor(0, false)}, ${heatColor(0.5, false)}, ${heatColor(1, false)})`
                  }}
                />
                <span className="flex justify-between font-mono text-[10.5px] text-fg-3">
                  <span>0</span>
                  <span>50th</span>
                  <span>100</span>
                </span>
              </div>
            )}
          </section>
          <section className="flex flex-col gap-2">
            <span className={LABEL}>Filter</span>
            <StatsSelect
              title="Team"
              value={state.team ?? ''}
              options={[
                { value: '', label: 'All teams' },
                ...STATS_TEAMS.map((t) => ({
                  value: t,
                  label: `${teamAbbr(t)} · ${TEAM_NAMES[t] ?? t}`
                }))
              ]}
              onChange={(t) => set({ team: t || null })}
              className="w-full"
            />
            <div className="flex flex-wrap gap-1.5">
              {isPlayer && (
                <CheckToggle
                  on={state.qualifiedOnly}
                  onChange={(qualifiedOnly) => set({ qualifiedOnly })}
                >
                  Qualified only
                </CheckToggle>
              )}
              {isPlayer && data.ownership && (
                <CheckToggle on={state.mine} onChange={(mine) => set({ mine })}>
                  <MineDot />
                  My players
                </CheckToggle>
              )}
            </div>
            <label className="flex h-7 items-center gap-1.5 rounded-[6px] border border-line bg-panel px-2 text-fg-3">
              <Search className="size-3.5 shrink-0" />
              <input
                type="search"
                aria-label={isPlayer ? 'Find a player' : 'Find a team'}
                placeholder={isPlayer ? 'Find a player' : 'Find a team'}
                value={state.search}
                onChange={(e) => set({ search: e.target.value })}
                className="min-w-0 flex-1 bg-transparent text-[12.5px] text-fg outline-none placeholder:text-fg-3"
              />
            </label>
          </section>
          <p className="m-0 text-[11.5px] leading-[1.45] text-pretty text-fg-3">
            {footnote}
            {view?.kind === 'ready' &&
              isPlayer &&
              ` ${view.qualified} ${who} qualify on both axes.`}
          </p>
        </aside>
        <section className="flex min-w-0 flex-1 flex-col gap-3">
          <div className="flex flex-wrap items-end justify-between gap-3">
            <div className="flex min-w-0 flex-col gap-1">
              <h1 className="m-0 text-[22px] leading-tight font-bold tracking-[-0.02em]">
                {chartTitle(X, axes.x, Y, axes.y)}
              </h1>
              <span className="text-[12.5px] text-fg-2">
                {chartSubtitle(entity, position, scope.season, range, perGame)}
              </span>
            </div>
            <Picks
              entity={entity}
              picks={state.picks}
              names={
                new Map(
                  view?.kind === 'ready' ? view.dots.map((d) => [d.id, shortName(entity, d)]) : []
                )
              }
              onClear={() => set({ picks: [] })}
              onCompare={() => onCompare(state)}
            />
          </div>
          {error ? (
            <Loading error={error} />
          ) : !view ? (
            <Loading />
          ) : view.kind === 'missing' ? (
            <Empty title={view.text}>
              {view.text.includes('not published') && (
                <EmptyButton
                  primary
                  onClick={() => onScope({ ...scope, season: scope.season - 1, weeks: null })}
                >
                  Use {scope.season - 1}
                </EmptyButton>
              )}
            </Empty>
          ) : view.kind === 'few' ? (
            <Empty title="Too few qualifiers to chart">
              <p className="m-0 text-[12.5px] text-fg-2">{fewNote(view.qualified, who, range)}</p>
              <div className="flex gap-2">
                {isWide(scope, data) || (
                  <EmptyButton primary onClick={() => onScope({ ...scope, weeks: null })}>
                    Use weeks 1–{lastWeek(scope.season, data.status)}
                  </EmptyButton>
                )}
                {state.qualifiedOnly && view.all > view.qualified && (
                  <EmptyButton onClick={() => set({ qualifiedOnly: false })}>
                    Show all {view.all} {who}
                  </EmptyButton>
                )}
              </div>
            </Empty>
          ) : (
            <Ready
              entity={entity}
              position={position}
              state={state}
              view={view}
              axes={axes}
              extras={extras}
              info={info}
              fmt={fmt}
              who={who}
              notes={result?.notes ?? []}
              onSort={(by) =>
                set({
                  sort: { by, dir: state.sort.by === by ? (state.sort.dir === 1 ? -1 : 1) : 1 }
                })
              }
              onOpen={open}
              onPick={pick}
            />
          )}
        </section>
      </div>
    </div>
  )
}

/** The range already covers every week played. */
function isWide(scope: StatsScope, data: StatsData): boolean {
  if (scope.seasonType !== 'REG') return true
  const [a, b] = weeksOf(scope, data.status)
  return a === 1 && b === lastWeek(scope.season, data.status)
}

function Picks({
  entity,
  picks,
  names,
  onClear,
  onCompare
}: {
  entity: ChartState['entity']
  picks: string[]
  names: ReadonlyMap<string, string>
  onClear: () => void
  onCompare: () => void
}): React.JSX.Element {
  if (!picks.length) {
    return (
      <span className="text-[12px] text-fg-3">
        Click a dot to open the dashboard · Shift-click up to {MAX_PICKS} to compare
      </span>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-3">
      {picks.map((id, k) => (
        <span key={id} className="flex items-center gap-1.5 text-[12.5px] font-medium text-fg">
          <Swatch slot={k} />
          {names.get(id) ?? (entity === 'team' ? teamAbbr(id) : id)}
        </span>
      ))}
      <button
        type="button"
        onClick={onClear}
        className="h-7 cursor-pointer rounded-[6px] px-2 text-[12.5px] text-fg-2 hover:bg-hover hover:text-fg"
      >
        Clear
      </button>
      <button
        type="button"
        onClick={onCompare}
        className="h-7 cursor-pointer rounded-[6px] bg-cobalt px-3 text-[12.5px] font-semibold text-on-cobalt hover:opacity-90"
      >
        Compare these →
      </button>
    </div>
  )
}

function Empty({
  title,
  children
}: {
  title: string
  children?: React.ReactNode
}): React.JSX.Element {
  return (
    <div className="flex min-h-[300px] flex-col items-center justify-center gap-3 rounded-[10px] border-[1.5px] border-dashed border-line px-6 text-center">
      <span className="text-[15px] font-semibold text-fg">{title}</span>
      {children}
    </div>
  )
}

function EmptyButton({
  primary = false,
  onClick,
  children
}: {
  primary?: boolean
  onClick: () => void
  children: React.ReactNode
}): React.JSX.Element {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'h-7 cursor-pointer rounded-[6px] px-3 text-[12.5px] font-semibold',
        primary
          ? 'bg-cobalt text-on-cobalt hover:opacity-90'
          : 'border border-line bg-panel text-fg hover:bg-hover'
      )}
    >
      {children}
    </button>
  )
}

function Ready({
  entity,
  position,
  state,
  view,
  axes,
  extras,
  info,
  fmt,
  who,
  notes,
  onSort,
  onOpen,
  onPick
}: {
  entity: ChartState['entity']
  position: PositionGroup
  state: ChartState
  view: Extract<ReturnType<typeof chartView>, { kind: 'ready' }>
  axes: { x: string; y: string }
  extras: string[]
  info: (id: string) => MetricInfo | undefined
  fmt: (id: string) => (v: number | null) => string
  who: string
  notes: string[]
  onSort: (by: string) => void
  onOpen: (d: ChartDot) => void
  onPick: (d: ChartDot) => void
}): React.JSX.Element {
  const isPlayer = entity === 'player'
  const X = info(axes.x)
  const Y = info(axes.y)
  const s = scales(view.domain, { x: X?.direction === 'lower', y: Y?.direction === 'lower' })
  const metrics = [axes.x, axes.y, ...extras]
  const card = (d: ChartDot): DotCard => ({
    title: d.name,
    sub: isPlayer
      ? `${d.team ? teamAbbr(d.team) : 'FA'} · ${position}`
      : `${teamAbbr(d.id)} · ${d.games} G`,
    lines: metrics.map((m) => ({
      label: info(m)?.label ?? m,
      text: fmt(m)(d.values[m] ?? null),
      chip: <PctChip percentile={d.percentiles[m] ?? null} qualified={d.qualified} />
    })),
    sample: `${d.games} G${d.sample !== null ? ` · ${Math.round(d.sample).toLocaleString('en-US')} ${Y?.sampleLabel ?? ''}` : ''}`
  })
  const rows = chartRows(view.dots, state.sort, axes)
  const cols: { by: string; label: string }[] = [
    { by: 'x', label: X?.label ?? axes.x },
    { by: 'y', label: Y?.label ?? axes.y },
    ...extras.map((m) => ({ by: m, label: info(m)?.label ?? m }))
  ]
  const arrow = (by: string): string =>
    state.sort.by === by ? (state.sort.dir === 1 ? ' ↓' : ' ↑') : ''
  const r = view.r === null ? '—' : `${view.r >= 0 ? '+' : '−'}${Math.abs(view.r).toFixed(2)}`
  const grid = cn(
    'grid items-center gap-3',
    isPlayer
      ? 'grid-cols-[32px_minmax(160px,1.6fr)_48px_repeat(var(--n),minmax(0,1fr))]'
      : 'grid-cols-[32px_minmax(160px,1.6fr)_repeat(var(--n),minmax(0,1fr))]'
  )
  const style = { '--n': cols.length } as React.CSSProperties
  return (
    <>
      <div className="rounded-[10px] bg-panel px-2 pt-3 pb-1 shadow-[0_0_0_1px_var(--line)]">
        <Scatter
          entity={entity}
          dots={view.dots}
          scales={s}
          mean={view.mean}
          corners={corners(X, axes.x, Y, axes.y)}
          xLabel={axisLabel(X, axes.x)}
          yLabel={axisLabel(Y, axes.y)}
          format={{ x: (v) => fmt(axes.x)(v), y: (v) => fmt(axes.y)(v) }}
          size={state.size}
          colour={state.colour}
          card={card}
          onOpen={onOpen}
          onPick={onPick}
          label={`${Y?.label ?? axes.y} against ${X?.label ?? axes.x}`}
        />
      </div>
      <div className="flex flex-wrap justify-between gap-3 font-mono text-[11.5px] text-fg-3">
        <span>
          r <span className="font-semibold text-fg">{r}</span> as plotted · n{' '}
          <span className="font-semibold text-fg">{view.dots.length}</span>{' '}
          {isPlayer && state.qualifiedOnly ? `qualified ${who}` : who} shown
        </span>
        <span>
          Dashed lines: qualified mean, {fmt(axes.x)(view.mean.x)} and {fmt(axes.y)(view.mean.y)}
        </span>
      </div>
      <div className="flex flex-col" style={style} role="table" aria-label="Chart table">
        <div
          role="row"
          className={cn(grid, 'h-[34px] border-b border-fg-3 text-[11.5px] font-medium text-fg-3')}
        >
          <span role="columnheader">#</span>
          <button
            type="button"
            role="columnheader"
            onClick={() => onSort('name')}
            className="cursor-pointer text-left hover:text-fg"
          >
            {isPlayer ? 'Player' : 'Team'}
            {arrow('name')}
          </button>
          {isPlayer && <span role="columnheader">Team</span>}
          {cols.map((c) => (
            <button
              key={c.by}
              type="button"
              role="columnheader"
              onClick={() => onSort(c.by)}
              className={cn(
                'cursor-pointer truncate text-right hover:text-fg',
                state.sort.by === c.by && 'text-fg'
              )}
            >
              {c.label}
              {arrow(c.by)}
            </button>
          ))}
        </div>
        {rows.map((d, i) => (
          <div
            key={d.id}
            role="row"
            className={cn(
              grid,
              'h-[34px] border-b border-line-2 text-[12.5px]',
              d.matched && 'bg-cobalt-soft',
              !d.qualified && 'opacity-55'
            )}
          >
            <span className="font-mono text-[11.5px] text-fg-3">{i + 1}</span>
            <button
              type="button"
              onClick={(e) => (e.shiftKey ? onPick(d) : onOpen(d))}
              className="flex min-w-0 cursor-pointer items-center gap-1.5 text-left font-medium text-fg hover:text-cobalt"
            >
              {d.pick >= 0 && <Swatch slot={d.pick} />}
              <span className="truncate">
                {isPlayer ? d.name : `${teamAbbr(d.id)} · ${TEAM_NAMES[d.id] ?? d.id}`}
              </span>
              {d.mine && <MineDot />}
            </button>
            {isPlayer && (
              <span className="font-mono text-[11.5px] font-semibold text-fg-2">
                {d.team ? teamAbbr(d.team) : 'FA'}
              </span>
            )}
            {cols.map((c) => {
              const m = c.by === 'x' ? axes.x : c.by === 'y' ? axes.y : c.by
              return (
                <span
                  key={c.by}
                  className="flex items-center justify-end gap-2 font-mono tabular-nums"
                >
                  {fmt(m)(d.values[m] ?? null)}
                  {d.estimated.includes(m) && <span className="text-[10.5px] text-fg-3">est.</span>}
                  <PctChip percentile={d.percentiles[m] ?? null} qualified={d.qualified} />
                </span>
              )
            })}
          </div>
        ))}
      </div>
      {notes.length > 0 && (
        <div className="flex flex-col gap-1 text-[11.5px] text-fg-3">
          {notes.map((n) => (
            <span key={n}>{n}</span>
          ))}
        </div>
      )}
    </>
  )
}
```

Modify `src/renderer/src/screens/stats/StatsExplore.tsx`:

```diff
diff --git a/src/renderer/src/screens/stats/StatsExplore.tsx b/src/renderer/src/screens/stats/StatsExplore.tsx
index d85fe29..9a4ac43 100644
--- a/src/renderer/src/screens/stats/StatsExplore.tsx
+++ b/src/renderer/src/screens/stats/StatsExplore.tsx
@@ -1,18 +1,20 @@
 import { ScopeBar } from '@/components/stats/ScopeBar'
+import type { ChartState } from '@/lib/stats/chart'
 import type { CompareState } from '@/lib/stats/compare'
 import type { StatsScope } from '@/lib/stats/scope'
 import type { TrendsState } from '@/lib/stats/trends'
 import type { StatsData } from '@/lib/stats/useStats'
 import { cn } from '@/lib/utils'
+import { StatsChart } from '@/screens/stats/StatsChart'
 import { StatsCompare } from '@/screens/stats/StatsCompare'
 import { StatsTrends } from '@/screens/stats/StatsTrends'
 import type { PositionGroup } from '@shared/stats/types'

-/** Explore's sub-tabs (spec §9.5): the chart explorer comes with Plan AD2. */
+/** Explore's sub-tabs (spec §9.5). */
 export type ExploreTab = 'chart' | 'compare' | 'trends'

-const TABS: { id: ExploreTab; label: string; soon?: string }[] = [
-  { id: 'chart', label: 'Chart', soon: 'The chart explorer comes in a later update' },
+const TABS: { id: ExploreTab; label: string }[] = [
+  { id: 'chart', label: 'Chart' },
   { id: 'compare', label: 'Compare' },
   { id: 'trends', label: 'Trends' }
 ]
@@ -25,6 +27,9 @@ export function StatsExplore({
   hasLeague,
   tab,
   onTab,
+  chart,
+  onChart,
+  onCompareChart,
   compare,
   onCompare,
   trends,
@@ -39,6 +44,10 @@ export function StatsExplore({
   hasLeague: boolean
   tab: ExploreTab
   onTab: (tab: ExploreTab) => void
+  chart: ChartState
+  onChart: (update: (state: ChartState) => ChartState) => void
+  /** The chart's picks, opened in Compare. */
+  onCompareChart: (state: ChartState) => void
   compare: CompareState
   onCompare: (update: (state: CompareState) => CompareState) => void
   trends: TrendsState
@@ -62,14 +71,12 @@ export function StatsExplore({
               type="button"
               role="tab"
               aria-selected={t.id === tab}
-              disabled={!!t.soon}
-              title={t.soon}
               onClick={() => onTab(t.id)}
               className={cn(
-                'h-[26px] cursor-pointer rounded-[5px] px-3.5 text-[12.5px] disabled:cursor-default disabled:opacity-40',
+                'h-[26px] cursor-pointer rounded-[5px] px-3.5 text-[12.5px]',
                 t.id === tab
                   ? 'bg-panel font-semibold text-fg shadow-[0_0_0_1px_var(--line)]'
-                  : 'font-medium text-fg-2 hover:text-fg disabled:hover:text-fg-2'
+                  : 'font-medium text-fg-2 hover:text-fg'
               )}
             >
               {t.label}
@@ -78,6 +85,18 @@ export function StatsExplore({
         </div>
         <ScopeBar scope={scope} status={data.status} hasLeague={hasLeague} onChange={onScope} />
       </div>
+      {tab === 'chart' && (
+        <StatsChart
+          data={data}
+          scope={scope}
+          onScope={onScope}
+          state={chart}
+          onState={onChart}
+          onOpenPlayer={onOpenPlayer}
+          onOpenTeam={onOpenTeam}
+          onCompare={onCompareChart}
+        />
+      )}
       {tab === 'compare' && (
         <StatsCompare
           data={data}
```

Modify `src/renderer/src/screens/stats/StatsTrends.tsx`:

```diff
diff --git a/src/renderer/src/screens/stats/StatsTrends.tsx b/src/renderer/src/screens/stats/StatsTrends.tsx
index 47fad5f..f77320c 100644
--- a/src/renderer/src/screens/stats/StatsTrends.tsx
+++ b/src/renderer/src/screens/stats/StatsTrends.tsx
@@ -1,7 +1,7 @@
 import { useId, useMemo, useState } from 'react'
 import { X } from 'lucide-react'
 import { Segmented } from '@/components/stats/controls'
-import { Loading } from '@/components/stats/parts'
+import { Loading, PctChip } from '@/components/stats/parts'
 import { SeasonChart, type SeasonSeries } from '@/components/stats/SeasonChart'
 import { Swatch } from '@/components/stats/WeekChart'
 import { familyLabel, fmtStat, ordinal } from '@/lib/stats/format'
@@ -516,33 +516,6 @@ function SeasonTable({
 }

 /** The handoff's soft percentile chip: ≥75 good, ≤25 bad; "NQ" outlined below the qualifier. */
-function PctChip({
-  percentile,
-  qualified
-}: {
-  percentile: number | null
-  qualified: boolean
-}): React.JSX.Element {
-  if (percentile === null) {
-    return (
-      <span className="flex h-[18px] min-w-[30px] items-center justify-center rounded-[4px] px-1 font-mono text-[10.5px] font-semibold text-fg-3 shadow-[inset_0_0_0_1px_var(--line)]">
-        {qualified ? '—' : 'NQ'}
-      </span>
-    )
-  }
-  const n = Math.round(percentile)
-  return (
-    <span
-      className={cn(
-        'flex h-[18px] min-w-[30px] items-center justify-center rounded-[4px] px-1 font-mono text-[10.5px] font-semibold',
-        n >= 75 ? 'bg-good-s text-good' : n <= 25 ? 'bg-bad-s text-bad' : 'text-fg-3'
-      )}
-    >
-      {n}
-    </span>
-  )
-}
-
 function GlanceCard({
   view,
   on,
```

- [x] **Step 4: Run them and see them pass**

```bash
npx vitest run tests/renderer/components/StatsExplore.test.tsx
```

Expected: 1 passed: 13 passed.

- [x] **Step 5: Format, typecheck, lint, the whole suite**

```bash
npx prettier --check src/renderer/src/components/stats/Scatter.tsx src/renderer/src/components/stats/StatLines.tsx src/renderer/src/components/stats/parts.tsx src/renderer/src/lib/stats/format.ts src/renderer/src/screens/stats/StatsApp.tsx src/renderer/src/screens/stats/StatsChart.tsx src/renderer/src/screens/stats/StatsExplore.tsx src/renderer/src/screens/stats/StatsTrends.tsx tests/renderer/components/StatsExplore.test.tsx
npm run typecheck
npx eslint src tests electron.vite.config.ts
npx vitest run
```

Expected: prettier and typecheck clean, no lint problems, 1160 passed, 5 skipped.

- [x] **Step 6: Commit**

```bash
git add src/renderer/src/components/stats/Scatter.tsx src/renderer/src/components/stats/StatLines.tsx src/renderer/src/components/stats/parts.tsx src/renderer/src/lib/stats/format.ts src/renderer/src/screens/stats/StatsApp.tsx src/renderer/src/screens/stats/StatsChart.tsx src/renderer/src/screens/stats/StatsExplore.tsx src/renderer/src/screens/stats/StatsTrends.tsx tests/renderer/components/StatsExplore.test.tsx
git commit -F - <<'EOF'
feat(stats): add the chart explorer to Explore

Explore opens on Chart: any metric against any other for the players
at a position or the 32 teams. Presets, X and Y grouped by family
(a lower-is-better axis reversed and marked), size and colour by a
third metric's percentile, a team filter, qualified only, my players
and a search. The scatter draws the qualified means with the
corners' words, rings mine, the searched, the hovered and the picked,
and labels the outliers without collisions; its table sorts by
percentile.

A dot opens its dashboard; shift-click picks up to three and
"Compare these" opens Compare with them. Too few qualifiers and an
axis not published for the season say so, with a way out.
EOF
```

---

### Task 3: Docs

The spec gets §23 (the amendments); the screens reference gets Explore › Chart and its speeds.

**Files:**

- Modify: `docs/reference/stats-screens.md`, `docs/superpowers/specs/2026-10-15-stats-analysis-design.md`

- [x] **Step 1: `docs/reference/stats-screens.md`**

Modify `docs/reference/stats-screens.md`:

```diff
diff --git a/docs/reference/stats-screens.md b/docs/reference/stats-screens.md
index ee23992..b557bb7 100644
--- a/docs/reference/stats-screens.md
+++ b/docs/reference/stats-screens.md
@@ -84,7 +84,18 @@ Players in the nav opens it on the player viewed last; the first time, on my top

 ## Explore

-Explore in the nav opens the tab used last (Compare the first time). Its sub-tabs sit at the left of the bar, the scope bar at its right: Chart (the chart explorer, Plan AD2; disabled), Compare, Trends. Each tab keeps its players, teams and choices for the session; Back returns to the page before Explore.
+Explore in the nav opens the tab used last (Chart the first time). Its sub-tabs sit at the left of the bar, the scope bar at its right: Chart, Compare, Trends. Each tab keeps its players, teams and choices for the session; Back returns to the page before Explore.
+
+### Chart
+
+Any metric against any other (handoff "15. Chart explorer"): players at one position (the nine of the rail) or the 32 teams.
+
+- **Bar:** Players / Teams, the position, Totals / Per game (players).
+- **Controls (left column):** presets (a volume against an efficiency per position, WR "Volume vs efficiency" first; teams "Offense vs defense EPA" and "Pass vs rush EPA"); the Y and X axes, every metric with a season grain by family, "↓" on a lower-is-better one, and a button to swap them; size by and colour by a third metric's percentile (metrics with a better side), with the colour key; a team, qualified only, my players and a search; the qualifying rule and how many qualify on both axes.
+- **Scatter:** a dot per row (the qualified only, by default), up and right always better (a lower-is-better axis runs reversed), the qualified means dashed with the four corners in words. Rings: my players amber, a search's finds ink, the hovered cobalt, the picks in the series colours. Labels: the picks and finds, mine, then the six players farthest from the crowd, or every team; none overlaps. Hover: the name, team and position, each metric's value and percentile chip, games and the sample, "Click to open". A click opens the dashboard; shift-click picks up to three, and "Compare these" opens Compare with them.
+- **Under it:** r as plotted (positive is better on both), how many are shown, the means; a table (#, name, team, each metric with its percentile chip and "est.") sorted by a column's percentile, best first (again for worst first), or by name; the engine's notes.
+- **States:** "Too few qualifiers to chart" under 10 dots (the postseason at TE: 6), with "Use weeks 1–7" and "Show all 31 TEs" where they help; "Pressure rate is not published for 2026 yet." with "Use 2025".
+- Percentiles are among the position's qualified players who meet each metric's own sample (Compare's pool).

 ### Compare

@@ -117,4 +128,4 @@ Every core and extended metric, players or teams, by family or search, with the

 ## Speed

-Measured on the live database (2026 week 6): the home's eight boards on screen in about 90 ms, a leaderboard tab 100–210 ms from click to table, a sort 120 ms, a 40-column query 265 ms. The team dashboard: Teams 140 ms from click to the Overview, a tab 65–150 ms, Situational (eleven queries) 275 ms. The player dashboard: Players 230–290 ms from click to the Overview, a tab 70–135 ms, Splits 265–480 ms, a rail position 135–275 ms. Explore (2026 week 7): Compare on screen 160–205 ms from click, a position or Players / Teams 135–185 ms; the Trends tab 245–255 ms, a new metric 220–290 ms.
+Measured on the live database (2026 week 6): the home's eight boards on screen in about 90 ms, a leaderboard tab 100–210 ms from click to table, a sort 120 ms, a 40-column query 265 ms. The team dashboard: Teams 140 ms from click to the Overview, a tab 65–150 ms, Situational (eleven queries) 275 ms. The player dashboard: Players 230–290 ms from click to the Overview, a tab 70–135 ms, Splits 265–480 ms, a rail position 135–275 ms. Explore (2026 week 7): the chart on screen 60–106 ms from click, a position 41–105 ms, Teams 28–70 ms; Compare on screen 160–205 ms from click, a position or Players / Teams 135–185 ms; the Trends tab 245–255 ms, a new metric 220–290 ms.
```

- [x] **Step 2: `docs/superpowers/specs/2026-10-15-stats-analysis-design.md`**

Modify `docs/superpowers/specs/2026-10-15-stats-analysis-design.md`:

```diff
diff --git a/docs/superpowers/specs/2026-10-15-stats-analysis-design.md b/docs/superpowers/specs/2026-10-15-stats-analysis-design.md
index 96ef252..17fc442 100644
--- a/docs/superpowers/specs/2026-10-15-stats-analysis-design.md
+++ b/docs/superpowers/specs/2026-10-15-stats-analysis-design.md
@@ -602,3 +602,16 @@ Decided with the user (2026-10-23 and 2026-10-24) and measured on the live datab
 - **F. Entry points.** The player and team dashboards' Compare buttons; a stat line's trend icon (on hover or focus; not on split lines) opens Trends on its metric.
 - **G. Charts.** Every series has its own marker shape (circle, square, diamond) as well as its colour; --s3 joins the series colours. --s1 and --s2 stay (the user chose shapes over a new --s2 for colour-blind separation).
 - **H. Measured** (2026 week 7): in the worker, Compare's query 21–89 ms (nine positions and the teams), its weekly chart 12–37 ms, Trends' query over a position's eight seasons 44–188 ms, the derived rebuild 25.5 s; in the app, Explore to Compare on screen 160–205 ms, a position or Players / Teams 135–185 ms, the Trends tab 245–255 ms, a new metric 220–290 ms (budget 300 ms, §11).
+
+## 23. Amendment 2026-10-25: the chart explorer (Plan AD2)
+
+Decided with the user (2026-10-23 to 2026-10-25) and measured on the live database while Plan AD2 was written (its Planning findings), and taken into the build. The design is the "Stats Explore" canvas and its handoff, section "15. Chart explorer"; `docs/reference/stats-screens.md` documents the result.
+
+- **A. The chart explorer (§9.5)** is Explore's first tab: Explore opens on it the first time. Players at one of the rail's nine positions, or the 32 teams; any metric with a season grain (core or extended) on either axis, a metric with no better side too. One query over the position (or the 32) per choice of axes, size and colour; counts per game or totals for players, never per game for teams (§22).
+- **B. Presets** per position, a volume against an efficiency (WR and TE: targets per game against yards per route run, targets against air-yards share; QB: attempts against EPA per dropback, CPOE against EPA per dropback; RB: carries against RYOE per carry, carry share against target share; K, P, DL, LB, DB one each), and the teams' offense against defense EPA per play and pass against rush EPA. "Pressure vs sack rate" from the handoff is not a preset: pressure rate is published through the prior season only, so it would open on an empty chart in the season in progress (user, 2026-10-25). Choosing an axis by hand leaves the preset.
+- **C. Qualified and ranked.** A dot qualifies when the row meets the position's leaderboard qualifier and each axis's own sample; "Qualified only" (on by default) hides the rest. Percentiles (chips, size, colour) are among the position's qualified players who meet the metric's own sample, as Compare's (§22 B). The quadrant lines are the qualified mean of each axis (not the league average §9.5 said), and r is computed with both axes oriented, so positive is better on both.
+- **D. Orientation.** A lower-is-better axis runs reversed and is marked "↓": up and right is always better, and the corners say so in words ("High volume, efficient"; teams "Good offense, good defense").
+- **E. Filters.** A team (only its dots; the axes and means stay the position's), qualified only, my players (ringed, with a league), and a search that rings and labels the dots it finds. The leaderboard's owner filter is not repeated.
+- **F. Picks.** Shift-click (a dot or a table row) picks up to three; "Compare these" opens Compare with them in its slots. No lasso (user, 2026-10-25). A click opens the player's or team's dashboard.
+- **G. States.** Fewer than 10 dots: "Too few qualifiers to chart", with the full range of weeks and "Show all" when they would help. An axis the season lacks: "Pressure rate is not published for 2026 yet." with the season before, or "… starts in 2022.".
+- **H. Measured** (2026 week 7): every preset's query 15–47 ms in the worker (with size and colour 32 ms), 30–167 qualified dots; in the app (three runs), Explore to the chart on screen 60–106 ms, a position 41–105 ms, Teams 28–70 ms, Compare from the picks 85–92 ms (budget 300 ms, §11).
```

- [x] **Step 3: Format and commit**

```bash
npx prettier --check docs/reference/stats-screens.md docs/superpowers/specs/2026-10-15-stats-analysis-design.md
git add docs/reference/stats-screens.md docs/superpowers/specs/2026-10-15-stats-analysis-design.md
git commit -m "docs(stats): the chart explorer (spec §23)"
```

---

### Task 4: Live checks

**Files:**

- Throwaway (never committed): `tests/zz-ad2-live.test.ts`
- Outside the repo: `~/project/ffc-proto-ad2-live/` (the database copy, scratch profiles, the driver, the steps and the screenshots)

The live check reads a copy of a full live database, `~/project/ffc-proto-ad2-live/base.duckdb` (2026 week 7 at `DERIVED_VERSION` 3: Plan AD1's checked database), offline. If it is gone, build one: run the built app once on an empty scratch profile (`--user-data-dir`); it backfills in about 5 minutes; copy its `stats.duckdb`. Then check every season has plays:

```bash
cd ~/project/ffc-proto-ad2-live && node q.mjs base.duckdb "SELECT source, status, message FROM sync_log WHERE status <> 'ok'"
```

Only `stats:participation:2026 skipped` is expected. A failed step (`stats:pbp:2021 error fetch failed`) is not retried within a day: delete its `sync_log` row in the profile's file, run the app on that profile again until the file stops growing, and copy it again. (`q.mjs` opens a file read-only with `@duckdb/node-api` and prints each statement's rows; link the repo's `node_modules` into the folder to run it.)

The walk-through also copies the dev profile's `companion.db` (`~/.config/FantasyCompanion/companion.db`), so the scratch app has the dev league. The dev profile itself is only read.

- [x] **Step 1: The chart's queries on live data**

Create `tests/zz-ad2-live.test.ts` (it copies `base.duckdb` to `work.duckdb` itself):

```ts
import { appendFileSync, copyFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { openStatsService } from '@main/stats/service'
import {
  chartQuery,
  chartView,
  DEFAULT_CHART,
  missingAxis,
  PRESETS,
  type ChartState
} from '@/lib/stats/chart'
import { RAIL_POSITIONS } from '@/lib/stats/player'
import { defaultScope } from '@/lib/stats/scope'
import { trendMetrics } from '@/lib/stats/trends'
import type { MetricInfo, StatsQuery, StatsResult } from '@shared/stats/types'

// Plan AD2 planning check on the live database. Throwaway, never committed.
const LIVE = join(homedir(), 'project', 'ffc-proto-ad2-live')
const OUT = join(LIVE, 'findings.txt')
const log = (...a: unknown[]): void => appendFileSync(OUT, a.map(String).join(' ') + '\n')

it('plan AD2 live findings', { timeout: 1_800_000 }, async () => {
  writeFileSync(OUT, '')
  copyFileSync(join(LIVE, 'base.duckdb'), join(LIVE, 'work.duckdb'))
  const service = await openStatsService(
    { path: join(LIVE, 'work.duckdb'), tempDir: join(LIVE, 'tmp') },
    () => {},
    async () => {
      throw new Error('offline')
    }
  )
  const timed = async (q: StatsQuery): Promise<[StatsResult, number]> => {
    const s = Date.now()
    const r = await service.query(q)
    return [r, Date.now() - s]
  }
  const failures: string[] = []
  const gate = (ok: boolean, what: string): void => {
    log(ok ? 'ok  ' : 'FAIL', what)
    if (!ok) failures.push(what)
  }
  try {
    const status = await service.status()
    const catalogue = await service.catalogue()
    const byId = new Map<string, MetricInfo>(catalogue.map((m) => [m.id, m]))
    log('through', JSON.stringify(status.through))
    const scope = defaultScope(status, false)
    const season = scope.season

    // Every preset: one query over the position, the dots, r, the time.
    for (const p of [...RAIL_POSITIONS, 'team' as const]) {
      for (const preset of PRESETS[p]) {
        const entity = p === 'team' ? 'team' : 'player'
        const position = p === 'team' ? 'WR' : p
        const state: ChartState = { ...DEFAULT_CHART, entity, position, x: preset.x, y: preset.y }
        const q = chartQuery(entity, position, [preset.x, preset.y], scope, status, true)
        const [r, ms] = await timed(q)
        const v = chartView(r, state, byId, null, season)
        const all = chartView(r, { ...state, qualifiedOnly: false }, byId, null, season)
        const what = `${p} ${preset.label} (${preset.x} × ${preset.y})`
        if (v.kind === 'ready' && all.kind === 'ready') {
          log(
            what,
            `${ms} ms rows ${r.rows.length} qualified ${v.qualified} shown ${v.dots.length} all ${all.dots.length} r ${v.r?.toFixed(2)}`,
            `mean ${v.mean.x.toFixed(2)} / ${v.mean.y.toFixed(3)}`,
            r.notes.join(' | ')
          )
          gate(v.dots.length >= 10, `${what}: at least 10 qualified dots`)
        } else {
          log(what, `${ms} ms`, JSON.stringify(v))
          gate(false, `${what}: charts`)
        }
        gate(ms < 300, `${what}: query under 300 ms (${ms})`)
      }
    }

    // Size and colour by a third metric: one query with four metrics.
    {
      const q = chartQuery(
        'player',
        'WR',
        ['targets', 'yprr', 'separation', 'drop_rate'],
        scope,
        status,
        true
      )
      const [r, ms] = await timed(q)
      const v = chartView(
        r,
        { ...DEFAULT_CHART, size: 'separation', colour: 'drop_rate' },
        byId,
        null,
        season
      )
      log('WR with size and colour', ms, 'ms', v.kind === 'ready' ? v.dots.length : v.kind)
      gate(ms < 300, `size and colour: under 300 ms (${ms})`)
    }

    // Which axes a position can pick have no data this season (participation through the prior one).
    for (const p of [...RAIL_POSITIONS, 'team' as const]) {
      const entity = p === 'team' ? 'team' : 'player'
      const position = p === 'team' ? 'WR' : p
      const ids = trendMetrics(entity, position, catalogue).flatMap((g) =>
        g.metrics.map((m) => m.id)
      )
      const missing: string[] = []
      for (let i = 0; i < ids.length; i += 30) {
        const q = chartQuery(entity, position, ids.slice(i, i + 30), scope, status, true)
        const [r] = await timed(q)
        for (const id of ids.slice(i, i + 30))
          if (missingAxis(r, [id], byId, season)) missing.push(id)
      }
      log(
        p,
        `axes ${ids.length}, not published for ${season}: ${missing.length}`,
        missing.join(' ')
      )
    }

    // Too few: week 1 only.
    for (const p of ['TE', 'K', 'QB'] as const) {
      const w1 = { ...scope, weeks: [1, 1] as [number, number] }
      const preset = PRESETS[p][0]
      const q = chartQuery('player', p, [preset.x, preset.y], w1, status, true)
      const [r] = await timed(q)
      const v = chartView(r, { ...DEFAULT_CHART, position: p }, byId, null, season)
      log(`${p} week 1`, JSON.stringify(v.kind === 'ready' ? { ready: v.dots.length } : v))
    }

    // The prior season's pressure rate by hand: published for 2025, not 2026.
    for (const s of [season, season - 1]) {
      const q = chartQuery(
        'team',
        'WR',
        ['off_pressure_rate', 'off_sack_rate'],
        { ...scope, season: s, weeks: null },
        status,
        false
      )
      const [r] = await timed(q)
      const v = chartView(
        r,
        { ...DEFAULT_CHART, entity: 'team', x: 'off_pressure_rate', y: 'off_sack_rate' },
        byId,
        null,
        s
      )
      log(
        `teams pressure × sack ${s}`,
        v.kind === 'ready' ? `ready r ${v.r?.toFixed(2)}` : JSON.stringify(v)
      )
    }
  } finally {
    await service.close()
  }
  log(failures.length ? `GATES FAILED: ${failures.length}` : 'ALL GATES PASSED')
  expect(failures).toEqual([])
})
```

Run it:

```bash
mkdir -p ~/project/ffc-proto-ad2-live/tmp
npx vitest run tests/zz-ad2-live.test.ts && cat ~/project/ffc-proto-ad2-live/findings.txt
```

Expected: 1 passed, and `findings.txt` ends with `ALL GATES PASSED`. Check it against the planning findings:

- every preset charts at least 10 qualified dots (WR volume against efficiency: 95, r +0.59, means 5.74 and 1.803), each query under 300 ms (measured 15–47 ms);
- the axes without data for 2026 per position (QB 5, RB 1, WR 5, TE 5, K 0, P 0, DL 2, LB 3, DB 2, teams 7);
- week 1 alone still charts (TE 44, K 16, QB 32 dots);
- the teams' pressure against sack rate: 2026 `missing` ("Pressure rate is not published for 2026 yet."), 2025 ready (r 0.66).

- [x] **Step 2: The app, walked through**

The driver is Plan AA's: copy `drive.mjs` from Plan AC's Task 7 Step 3 into `~/project/ffc-proto-ad2-live/` (Plan AD1's folder has it too). Build the app, make the scratch profile, and save these steps as `~/project/ffc-proto-ad2-live/steps-ad2.json` (a tab, a radio and a nav button are clicked by their text through `eval`, since the nav has a Teams button and Explore a Teams radio; a dot is shift-clicked from the table's rows):

```json
[
  {
    "size": [1440, 900],
    "wait": 20000
  },
  {
    "click": "Stats \u2197"
  },
  {
    "wait": 60000
  },
  {
    "eval": "(async () => { const t = performance.now(); (() => [...document.querySelectorAll('nav button')].find((e) => e.textContent.trim() === 'Explore').click())(); for (let i = 0; i < 400; i++) { await new Promise((r) => setTimeout(r, 10)); if (document.querySelectorAll('[data-dot]').length > 9 && !document.body.textContent.includes('Loading')) return 'explore-chart ' + Math.round(performance.now() - t) + ' ms' } return 'explore-chart timeout' })()"
  },
  {
    "wait": 1200
  },
  {
    "shot": "01-chart-wr"
  },
  {
    "hover": "[data-dot]:last-of-type circle:last-child"
  },
  {
    "wait": 500
  },
  {
    "shot": "02-hover-mine"
  },
  {
    "hover": "[data-dot] circle:last-child"
  },
  {
    "wait": 500
  },
  {
    "shot": "03-hover-first"
  },
  {
    "eval": "(() => { const m = [...document.querySelectorAll('main')].pop(); m.scrollTo(0, 700); return m.scrollTop })()"
  },
  {
    "wait": 600
  },
  {
    "shot": "04-table"
  },
  {
    "eval": "(() => { const m = [...document.querySelectorAll('main')].pop(); m.scrollTo(0, 0); return m.scrollTop })()"
  },
  {
    "select": ["Size by", "separation"]
  },
  {
    "wait": 800
  },
  {
    "select": ["Colour by", "drop_rate"]
  },
  {
    "wait": 1500
  },
  {
    "shot": "05-size-colour"
  },
  {
    "select": ["Size by", ""]
  },
  {
    "select": ["Colour by", ""]
  },
  {
    "wait": 800
  },
  {
    "eval": "(() => { const el = document.querySelector('input[type=search]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, \"nacua\"); el.dispatchEvent(new Event('input', { bubbles: true })); return 'typed' })()"
  },
  {
    "wait": 500
  },
  {
    "shot": "06-search"
  },
  {
    "eval": "(() => { const el = document.querySelector('input[type=search]'); Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, \"\"); el.dispatchEvent(new Event('input', { bubbles: true })); return 'typed' })()"
  },
  {
    "select": ["Team", "BUF"]
  },
  {
    "wait": 500
  },
  {
    "shot": "07-team-buf"
  },
  {
    "select": ["Team", ""]
  },
  {
    "eval": "(async () => { const t = performance.now(); (() => [...document.querySelectorAll('[role=radio]')].find((e) => e.textContent.trim() === \"RB\").click())(); for (let i = 0; i < 400; i++) { await new Promise((r) => setTimeout(r, 10)); if (document.querySelectorAll('[data-dot]').length > 9 && !document.body.textContent.includes('Loading')) return 'chart-rb ' + Math.round(performance.now() - t) + ' ms' } return 'chart-rb timeout' })()"
  },
  {
    "wait": 800
  },
  {
    "shot": "08-rb"
  },
  {
    "eval": "(async () => { const t = performance.now(); (() => [...document.querySelectorAll('[role=radio]')].find((e) => e.textContent.trim() === \"QB\").click())(); for (let i = 0; i < 400; i++) { await new Promise((r) => setTimeout(r, 10)); if (document.querySelectorAll('[data-dot]').length > 9 && !document.body.textContent.includes('Loading')) return 'chart-qb ' + Math.round(performance.now() - t) + ' ms' } return 'chart-qb timeout' })()"
  },
  {
    "wait": 800
  },
  {
    "shot": "09-qb"
  },
  {
    "eval": "(async () => { const t = performance.now(); (() => [...document.querySelectorAll('[role=radio]')].find((e) => e.textContent.trim() === \"DL\").click())(); for (let i = 0; i < 400; i++) { await new Promise((r) => setTimeout(r, 10)); if (document.querySelectorAll('[data-dot]').length > 9 && !document.body.textContent.includes('Loading')) return 'chart-dl ' + Math.round(performance.now() - t) + ' ms' } return 'chart-dl timeout' })()"
  },
  {
    "wait": 800
  },
  {
    "shot": "10-dl"
  },
  {
    "eval": "(async () => { const t = performance.now(); (() => [...document.querySelectorAll('[role=radio]')].find((e) => e.textContent.trim() === \"Teams\").click())(); for (let i = 0; i < 400; i++) { await new Promise((r) => setTimeout(r, 10)); if (document.querySelectorAll('[data-dot]').length > 9 && !document.body.textContent.includes('Loading')) return 'chart-teams ' + Math.round(performance.now() - t) + ' ms' } return 'chart-teams timeout' })()"
  },
  {
    "wait": 800
  },
  {
    "shot": "11-teams"
  },
  {
    "click": "Pass vs rush EPA"
  },
  {
    "wait": 1200
  },
  {
    "shot": "12-teams-pass-rush"
  },
  {
    "select": ["X axis", "off_pressure_rate"]
  },
  {
    "wait": 1500
  },
  {
    "shot": "13-missing"
  },
  {
    "click": "Use 2025"
  },
  {
    "wait": 2500
  },
  {
    "shot": "14-teams-2025"
  },
  {
    "select": ["Season", "2026"]
  },
  {
    "wait": 1500
  },
  {
    "eval": "(async () => { const t = performance.now(); (() => [...document.querySelectorAll('[role=radio]')].find((e) => e.textContent.trim() === \"Players\").click())(); for (let i = 0; i < 400; i++) { await new Promise((r) => setTimeout(r, 10)); if (document.querySelectorAll('[data-dot]').length > 9 && !document.body.textContent.includes('Loading')) return 'chart-players ' + Math.round(performance.now() - t) + ' ms' } return 'chart-players timeout' })()"
  },
  {
    "wait": 800
  },
  {
    "eval": "(() => { const m = [...document.querySelectorAll('main')].pop(); m.scrollTo(0, 700); return m.scrollTop })()"
  },
  {
    "eval": "(() => { const b = [...document.querySelectorAll('[role=row] button:not([role])')]; for (const i of [0, 2]) b[i].dispatchEvent(new MouseEvent('click', { bubbles: true, shiftKey: true })); return b.slice(0, 3).map((x) => x.textContent) })()"
  },
  {
    "eval": "(() => { const m = [...document.querySelectorAll('main')].pop(); m.scrollTo(0, 0); return m.scrollTop })()"
  },
  {
    "wait": 600
  },
  {
    "shot": "15-picks"
  },
  {
    "eval": "(async () => { const t = performance.now(); (() => [...document.querySelectorAll('button')].find((e) => e.textContent.trim() === 'Compare these \u2192').click())(); for (let i = 0; i < 400; i++) { await new Promise((r) => setTimeout(r, 10)); if (document.querySelectorAll('select[title=\"Swap player\"]').length === 2) return 'compare-picks ' + Math.round(performance.now() - t) + ' ms' } return 'compare-picks timeout' })()"
  },
  {
    "wait": 1200
  },
  {
    "shot": "16-compare"
  },
  {
    "eval": "(() => [...document.querySelectorAll('[role=tab]')].find((e) => e.textContent.trim() === 'Chart').click())()"
  },
  {
    "wait": 1500
  },
  {
    "eval": "(() => { document.querySelector('[data-dot]').dispatchEvent(new MouseEvent('click', { bubbles: true })); return 'opened' })()"
  },
  {
    "wait": 2500
  },
  {
    "shot": "17-dashboard"
  },
  {
    "eval": "(() => [...document.querySelectorAll('nav button')].find((e) => e.textContent.trim() === 'Explore').click())()"
  },
  {
    "wait": 1500
  },
  {
    "select": ["Season type", "POST"]
  },
  {
    "select": ["Season", "2025"]
  },
  {
    "wait": 800
  },
  {
    "eval": "(async () => { const t = performance.now(); (() => [...document.querySelectorAll('[role=radio]')].find((e) => e.textContent.trim() === \"TE\").click())(); for (let i = 0; i < 400; i++) { await new Promise((r) => setTimeout(r, 10)); if (document.body.textContent.includes('Too few') || document.querySelectorAll('[data-dot]').length > 0) return 'chart-te-post ' + Math.round(performance.now() - t) + ' ms' } return 'chart-te-post timeout' })()"
  },
  {
    "wait": 800
  },
  {
    "shot": "18-te-post"
  },
  {
    "select": ["Season type", "REG"]
  },
  {
    "select": ["Season", "2026"]
  },
  {
    "eval": "(async () => { const t = performance.now(); (() => [...document.querySelectorAll('[role=radio]')].find((e) => e.textContent.trim() === \"WR\").click())(); for (let i = 0; i < 400; i++) { await new Promise((r) => setTimeout(r, 10)); if (document.querySelectorAll('[data-dot]').length > 9 && !document.body.textContent.includes('Loading')) return 'chart-wr ' + Math.round(performance.now() - t) + ' ms' } return 'chart-wr timeout' })()"
  },
  {
    "click": "[title='Switch theme']"
  },
  {
    "wait": 1500
  },
  {
    "shot": "19-dark-wr"
  },
  {
    "hover": "[data-dot]:last-of-type circle:last-child"
  },
  {
    "wait": 500
  },
  {
    "shot": "20-dark-hover"
  },
  {
    "eval": "(async () => { const t = performance.now(); (() => [...document.querySelectorAll('[role=radio]')].find((e) => e.textContent.trim() === \"Teams\").click())(); for (let i = 0; i < 400; i++) { await new Promise((r) => setTimeout(r, 10)); if (document.querySelectorAll('[data-dot]').length > 9 && !document.body.textContent.includes('Loading')) return 'chart-teams-dark ' + Math.round(performance.now() - t) + ' ms' } return 'chart-teams-dark timeout' })()"
  },
  {
    "wait": 800
  },
  {
    "shot": "21-dark-teams"
  },
  {
    "click": "[title='Switch theme']"
  },
  {
    "wait": 800
  }
]
```

```bash
npx electron-vite build
L=~/project/ffc-proto-ad2-live; rm -rf $L/walk $L/shots && mkdir -p $L/walk && cp $L/base.duckdb $L/walk/stats.duckdb && cp ~/.config/FantasyCompanion/companion.db $L/walk/companion.db
cd $L && APP=<this repo> node drive.mjs walk steps-ad2.json shots
```

Expected: no `NOT FOUND`, `NO OPTION` or `timeout` in the output; the timed steps under 300 ms. Each screenshot shows:

| Shot  | Shows                                                                                                                                                                                                                                                                                                                                                                                           |
| ----- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01    | Explore active, Chart selected (first); WR "Yards per route run vs targets", "Volume vs efficiency" active; my WRs ringed amber and labelled (Coker, McConkey, Odunze); six outliers labelled (Flowers, Evans, Smith-Njigba, Lamb, Nacua, St. Brown), no label over another; the dashed means and four corners; "r +0.59 as plotted · n 95 qualified WRs shown"; "95 WRs qualify on both axes." |
| 02–03 | The hover card: name, "CHI · WR", targets and YPRR with chips, "7 G · 236 routes", "Click to open ↗"; the hovered dot ringed cobalt                                                                                                                                                                                                                                                             |
| 04    | The table sorted by YPRR (↓), best first, chips, "est." on 2026 YPRR, amber dots on mine                                                                                                                                                                                                                                                                                                        |
| 05    | Size by separation, colour by drop rate (↓): dots sized and red to green, the colour key; the table gains both columns                                                                                                                                                                                                                                                                          |
| 06    | "nacua": P. Nacua ringed ink and labelled                                                                                                                                                                                                                                                                                                                                                       |
| 07    | BUF only: three dots, the axes and the means unchanged                                                                                                                                                                                                                                                                                                                                          |
| 08–10 | RB (carries × RYOE per carry), QB (attempts × EPA per dropback), DL ("Run stuffs vs pressures", Lawrence labelled)                                                                                                                                                                                                                                                                              |
| 11    | Teams: "EPA per play allowed vs EPA per play", the Y axis reversed (MIN at the top), every team labelled, "Good offense, good defense" top right, no Totals / Per game                                                                                                                                                                                                                          |
| 12    | "Pass vs rush EPA" active                                                                                                                                                                                                                                                                                                                                                                       |
| 13    | X = pressure rate: "Pressure rate is not published for 2026 yet." and "Use 2025"                                                                                                                                                                                                                                                                                                                |
| 14    | 2025: pressure rate (↓) reversed, "Low pressure rate, good passing" top right, r +0.55                                                                                                                                                                                                                                                                                                          |
| 15    | DL picks: two swatches in the header, "Clear", "Compare these →"; the picked dots ringed --s1 and --s2                                                                                                                                                                                                                                                                                          |
| 16    | Compare at DL with those two and "Add a third player…"                                                                                                                                                                                                                                                                                                                                          |
| 17    | A dot's click: that player's dashboard                                                                                                                                                                                                                                                                                                                                                          |
| 18    | 2025 postseason TE: "Too few qualifiers to chart", "6 TEs qualify on both axes in the postseason.", "Show all 31 TEs"                                                                                                                                                                                                                                                                           |
| 19–21 | Dark: WR chart, hover card, teams                                                                                                                                                                                                                                                                                                                                                               |

- [x] **Step 3: Speed in the app**

Time Explore on the walk-through's profile after its run (the league is scored then): run the timed `eval` steps of Step 2 again, three times (Explore to the chart, RB, QB, DL, Teams, Players, WR). Expected: under 300 ms each (measured: 28–126 ms).

- [x] **Step 4: Clean up**

```bash
rm tests/zz-ad2-live.test.ts
git status --short
```

Expected: only the unrelated changes of Global Constraints. Keep `~/project/ffc-proto-ad2-live/` until the release; ask the user before deleting it.

---

### Task 5: Verify, merge, release

- [x] **Step 1: Final verification**

```bash
npm run typecheck && npx eslint src tests electron.vite.config.ts && npx vitest run && npx electron-vite build
```

Expected: clean; 1160 passed | 5 skipped (1163 with the untracked `playerImage` tests); the build succeeds.

- [x] **Step 2: The Windows suite and self-test**

**Ask the user before pushing.** Then:

```bash
git push origin feat/chart-explorer-ad2:check/plan-ad2
gh run watch "$(gh run list --branch check/plan-ad2 --workflow 'Package check' --limit 1 --json databaseId --jq '.[0].databaseId')" --exit-status
git push origin --delete check/plan-ad2
```

Expected: green. The log shows `"query":true`.

- [x] **Step 3: Final review**

Ask a fresh reviewer (Opus) to review `git diff main...feat/chart-explorer-ad2`. It reviews against spec §9.5 and §11, the amendments, the handoff and the Review Focus list. Fix Critical and Important findings, each in its own commit, test first. Re-run Step 1 after them, and the Task 4 walk-through after a screen change.

- [x] **Step 4: Merge and bump**

```bash
git checkout main && git merge --no-ff feat/chart-explorer-ad2 -m "merge: feat/chart-explorer-ad2 (plan AD2)"
npm version minor --no-git-tag-version
git add package.json package-lock.json && git commit -m "build: bump version to 0.35.0" && git tag v0.35.0
git branch -d feat/chart-explorer-ad2
```

- [x] **Step 5: Status block**

Replace this plan's Status line with the outcome:

- the merge commit and the tag;
- the Task 4 numbers and the walk-through;
- the review fixes and anything deferred.

Then commit, staging this file only: `git commit -m "docs(plan): mark plan AD2 complete"`.

- [ ] **Step 6: Push and release**

**Ask the user before pushing.** Then:

```bash
git push && git push origin v0.35.0
```

Watch the Release workflow (`gh run watch … --exit-status`). It runs the Windows tests and the packaged self-test, and creates the draft release. When it is green, ask the user whether to publish the draft (`gh release edit v0.35.0 --draft=false`). The release notes should say:

- Explore in Companion Stats gains Chart, and opens on it: any stat against any other, for the players at a position or all 32 teams.
- Presets to start from, size and colour by a third stat, a team filter, qualified only, your players ringed, a search.
- Up and right is always better: lower-is-better stats run reversed, and the corners say what each quadrant means.
- Click a dot to open the dashboard; shift-click up to three and compare them side by side.
- No stats rebuild on first launch.

---

## Self-review against the spec

- **§9.5 Explore and matchups** (Tasks 1–2):
  - **Chart explorer:** "any metric against any other, players or teams, scatter with league-average quadrant lines, labels, size or colour by a third metric, filters as the leaderboard, click a dot to open the dashboard". Any metric with a season grain on either axis, players at a position or the 32 teams; the quadrant lines at the qualified mean (amendment C: the dots plotted are the qualified, so their mean); labels on the picks, finds, mine and the outliers; size and colour by a third metric's percentile; a team, qualified only, my players and a search (the leaderboard's owner filter is not repeated, amendment E); a click opens the dashboard. Shift-click picks for Compare (the handoff), presets, the corners in words and r as plotted (the handoff).
  - **Compare** and **Trends:** Plan AD1; they change only by Explore opening on Chart and by Compare taking the picks. **Matchup preview:** Plan AE.
- **§9.6 Design.** The handoff's "15. Chart explorer" (left controls column, scatter, rings, labels, hover card, table, states) in the Stats language: cobalt dots, the heat colour, soft percentile chips, --s1/2/3 rings and swatches for the picks, light and dark.
- **§11 Testing.**
  - Unit tests for the model (presets, query, dots, ranks, orientation, labels, sorting, states); component tests for the tab, the scatter, the picks into Compare, the dashboards from a dot, the teams and both states.
  - The budget on live data, in the worker and in the app (Task 4).
  - The packaged smoke test (Task 5 Step 2).
- **Not in this plan** (by §12 and §13): matchups and Games (AE); the age curve; natural-language queries.
