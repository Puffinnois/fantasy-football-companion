import { describe, expect, it } from 'vitest'
import {
  chartMetric,
  compareGroups,
  compareQuery,
  comparePool,
  compareSeries,
  compareView,
  defaultSlots,
  playerCard,
  slotOptions,
  teamCard,
  TEAM_GROUPS,
  weeklyCompareQuery,
  type Slots
} from '@/lib/stats/compare'
import type { StatsOwnership, StatsResult } from '@shared/stats/types'
import { catalogueMap, result, row, STATUS, value } from '../../fixtures/statsScreens'

const byId = catalogueMap()
const scope = { season: 2026, seasonType: 'REG' as const, weeks: null, scoring: 'ppr' as const }

/** Five WRs ranked by receiving yards; p3 below the WR qualifier (target share), p9 a TE. */
function receivers(): StatsResult {
  const v = (n: number, qualified = true): ReturnType<typeof value> =>
    value(n, { qualified, sample: 40 })
  const wr = (
    id: string,
    name: string,
    yds: number,
    drops: number,
    over = {}
  ): ReturnType<typeof row> =>
    row(
      id,
      name,
      {
        rec_yds: v(yds),
        target_share: v(yds / 1000, id !== 'p3'),
        drop_rate: v(drops),
        rec_adot: v(10)
      },
      over
    )
  return result(
    ['rec_yds', 'target_share', 'drop_rate', 'rec_adot'],
    [
      wr('p0', 'Ja’Marr Chase', 700, 0.02),
      wr('p1', 'Puka Nacua', 650, 0.05),
      wr('p2', 'CeeDee Lamb', 500, 0.03),
      wr('p4', 'Zay Flowers', 400, 0.08),
      wr('p3', 'Few Snaps', 900, 0.01),
      wr('p9', 'Tight End', 990, 0.01, { position: 'TE' })
    ]
  )
}

const groups = [{ label: 'Receiving', metrics: ['rec_yds', 'drop_rate', 'rec_adot'] }]

describe('Compare (stats-analysis spec §9.5)', () => {
  it('rows a player position by its leaderboard groups, teams by the four team groups', () => {
    expect(compareGroups('player', 'WR', byId).map((g) => g.label)).toEqual([
      'Usage',
      'Receiving',
      'Efficiency',
      'Fantasy'
    ])
    const teams = compareGroups('team', 'WR', byId)
    expect(teams.map((g) => g.label)).toEqual(TEAM_GROUPS.map(([label]) => label))
    // Every team metric is in the catalogue (the red-zone rates came with Plan AD1).
    expect(teams.flatMap((g) => g.metrics)).toEqual(TEAM_GROUPS.flatMap(([, ids]) => ids))
  })

  it('asks for the whole position with its qualifier and sort, or every team with its record', () => {
    const q = compareQuery('player', 'WR', groups, scope, STATUS, true)
    expect(q).toMatchObject({
      entity: 'player',
      transform: 'perGame',
      scope: { seasons: [2026], positions: ['WR'] },
      limit: 5000
    })
    expect(q.metrics).toEqual(['rec_yds', 'drop_rate', 'rec_adot', 'target_share'])
    const t = compareQuery('team', 'WR', compareGroups('team', 'WR', byId), scope, STATUS, true)
    // Team rows are rates: never per game. The card needs the record and Elo.
    expect(t).toMatchObject({ entity: 'team', transform: 'raw', limit: 40 })
    expect(t.scope.positions).toBeUndefined()
    expect(t.metrics).toEqual(
      expect.arrayContaining(['wins', 'losses', 'points_for', 'points_against', 'elo'])
    )
  })

  it('ranks each slot among the position’s qualified players and leads by the better side', () => {
    const res = receivers()
    const pool = comparePool('player', 'WR', res)
    expect([...pool].sort()).toEqual(['p0', 'p1', 'p2', 'p4'])
    const slots: Slots = ['p1', 'p3', 'p0']
    const view = compareView(res, slots, groups, byId, pool, false, 2026)
    const [yds, drops, adot] = view.groups[0].rows
    // p3 (900 yds) is below the qualifier: no percentile, but his value can still lead the row.
    expect(yds.cells.map((c) => [c?.text, c?.percentile ?? null, c?.lead])).toEqual([
      ['650', (100 * 2) / 3, false],
      ['900', null, true],
      ['700', 100, false]
    ])
    expect(yds.sub).toBe('total')
    // Lower is better for drops: p3's 1% leads; Chase 2% is the pool's best (100th).
    expect(drops.cells.map((c) => c?.lead)).toEqual([false, true, false])
    expect(drops.cells[2]?.percentile).toBe(100)
    expect(drops.cells[2]?.rank).toBe('#1')
    // aDOT has no better side: nobody leads it, and it is not counted.
    expect(adot.cells.some((c) => c?.lead)).toBe(false)
    expect(view.leads).toEqual([0, 2, 0])
    expect(view.counted).toBe(2)
  })

  it('leaves an open slot empty and leads nobody on a tie between every slot', () => {
    const res = receivers()
    const pool = comparePool('player', 'WR', res)
    const view = compareView(res, ['p0', null, 'p0'], groups, byId, pool, true, 2026)
    const yds = view.groups[0].rows[0]
    expect(yds.cells[1]).toBeNull()
    expect(yds.cells.some((c) => c?.lead)).toBe(false)
    expect(yds.sub).toBe('per game')
  })

  it('says why a row is empty for the season', () => {
    const res = receivers()
    const empty: StatsResult = {
      ...res,
      columns: res.columns.map((c) => (c.id === 'drop_rate' ? { ...c, seasons: [] } : c))
    }
    const pool = comparePool('player', 'WR', empty)
    const drops = compareView(empty, ['p0', 'p1', null], groups, byId, pool, false, 2026).groups[0]
      .rows[1]
    expect(drops.missing).toBe('Not published for 2026 yet.')
    expect(drops.cells[0]).toMatchObject({ text: '—', percentile: null, lead: false })
  })

  it('opens on a seed and the top two, or the top three with my best player in slot 3', () => {
    const res = receivers()
    const pool = comparePool('player', 'WR', res)
    expect(defaultSlots('player', 'WR', res, pool, 'p4')).toEqual(['p4', 'p0', 'p1'])
    expect(defaultSlots('player', 'WR', res, pool, null)).toEqual(['p0', 'p1', 'p2'])
    expect(defaultSlots('player', 'WR', res, pool, null, new Set(['p4']))).toEqual([
      'p0',
      'p1',
      'p4'
    ])
    // Mine already shown: nothing swapped.
    expect(defaultSlots('player', 'WR', res, pool, null, new Set(['p1']))).toEqual([
      'p0',
      'p1',
      'p2'
    ])
  })

  it('seeds a team with the two nearest it in Elo, else the top three', () => {
    const elo = (id: string, e: number | null): ReturnType<typeof row> =>
      row(id, id, { elo: value(e) }, { position: null })
    const res = result(
      ['elo'],
      [elo('BUF', 1650), elo('KC', 1700), elo('DET', 1610), elo('NYJ', 1400), elo('MIA', 1630)]
    )
    const pool = comparePool('team', 'WR', res)
    expect(defaultSlots('team', 'WR', res, pool, 'BUF')).toEqual(['BUF', 'MIA', 'DET'])
    expect(defaultSlots('team', 'WR', res, pool, null)).toEqual(['KC', 'BUF', 'MIA'])
  })

  it('lists my players first, then the pool, then the rest at the position; every team A–Z', () => {
    const res = receivers()
    const pool = comparePool('player', 'WR', res)
    const own: StatsOwnership = { players: { p2: { name: 'Me', mine: true } }, teams: {} }
    expect(slotOptions('player', 'WR', res, pool, own).map((o) => o.label)).toEqual([
      'CeeDee Lamb · SEA · your team',
      'Ja’Marr Chase · SEA',
      'Puka Nacua · SEA',
      'Zay Flowers · SEA',
      'Few Snaps · SEA'
    ])
    const teams = slotOptions('team', 'WR', undefined, new Set(), null)
    expect(teams).toHaveLength(32)
    expect(teams[0]).toEqual({ value: 'ARI', label: 'ARI · Arizona Cardinals' })
  })

  it('names the Rams LAR in the choices, as every screen does', () => {
    const res = result(
      ['rec_yds'],
      [row('p0', 'Puka Nacua', { rec_yds: value(900) }, { team: 'LA' })]
    )
    const pool = comparePool('player', 'WR', res)
    expect(slotOptions('player', 'WR', res, pool, null)[0].label).toBe('Puka Nacua · LAR')
    const rams = slotOptions('team', 'WR', undefined, new Set(), null).find((o) => o.value === 'LA')
    expect(rams).toEqual({ value: 'LA', label: 'LAR · Los Angeles Rams' })
  })

  it('writes the cards: a player’s name and games, a team’s record, place and Elo', () => {
    const res = receivers()
    expect(playerCard(res, 'p0', comparePool('player', 'WR', res))).toEqual({
      id: 'p0',
      first: 'Ja’Marr',
      last: 'Chase',
      team: 'SEA',
      games: '6 G',
      qualified: true
    })
    expect(playerCard(res, 'p3', comparePool('player', 'WR', res)).qualified).toBe(false)
    const team = (id: string, w: number, l: number, e: number): ReturnType<typeof row> =>
      row(
        id,
        id,
        {
          wins: value(w),
          losses: value(l),
          points_for: value(150),
          points_against: value(120),
          elo: value(e)
        },
        { position: null }
      )
    const t = result(
      ['wins', 'losses', 'points_for', 'points_against', 'elo'],
      [team('BUF', 5, 1, 1651.6), team('MIA', 2, 4, 1500), team('NE', 3, 3, 1490)]
    )
    expect(teamCard(t, 'BUF')).toEqual({
      id: 'BUF',
      name: 'Buffalo Bills',
      record: '5–1',
      place: '1st in the AFC East',
      elo: '1,652'
    })
  })

  it('charts fantasy points (a team’s EPA per play) by week, with the pool’s weekly median', () => {
    expect(chartMetric('player', 'WR', 'offense')).toBe('fantasy_points')
    expect(chartMetric('player', 'DL', 'offense')).toBe('sacks')
    expect(chartMetric('team', 'WR', 'defense')).toBe('def_epa_play')
    expect(weeklyCompareQuery('player', 'WR', 'fantasy_points', scope, STATUS)).toMatchObject({
      metrics: ['fantasy_points', 'target_share'],
      groupBy: ['week'],
      scope: { positions: ['WR'] }
    })
    const wk = (id: string, week: number, fp: number): ReturnType<typeof row> =>
      row(id, id, { fantasy_points: value(fp) }, { group: { week }, games: 1 })
    const weekly = result(
      ['fantasy_points'],
      [wk('p0', 1, 20), wk('p1', 1, 10), wk('p2', 1, 4), wk('p0', 3, 30), wk('p1', 3, 12)]
    )
    const { series, median } = compareSeries(
      weekly,
      ['p0', null, 'p1'],
      ['Chase', '', 'Nacua'],
      'fantasy_points',
      [1, 2, 3],
      new Set(['p0', 'p1', 'p2'])
    )
    expect(series.map((s) => [s.slot, s.label, s.points.map((p) => p.value)])).toEqual([
      [0, 'Chase', [20, null, 30]],
      [2, 'Nacua', [10, null, 12]]
    ])
    expect(median.points.map((p) => p.value)).toEqual([10, null, 21])
  })
})
