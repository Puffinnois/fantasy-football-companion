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
