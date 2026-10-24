import { describe, expect, it } from 'vitest'
import {
  careerSpan,
  gamesBySeason,
  glanceViews,
  playerTeamsQuery,
  seasonAge,
  teamMarks,
  teamRuns,
  teamsBySeason,
  trendBand,
  trendCore,
  trendDelta,
  trendLine,
  trendMetrics,
  trendNotes,
  trendQuery,
  trendRows,
  trendSeasons
} from '@/lib/stats/trends'
import type { StatsResult } from '@shared/stats/types'
import { catalogue, catalogueMap, result, row, STATUS, value } from '../../fixtures/statsScreens'

const byId = catalogueMap()
const scope = { season: 2026, seasonType: 'REG' as const, weeks: null, scoring: 'ppr' as const }

/**
 * WRs by season: p1 (ours) every season but 2023; p2 and p3 the pool; p4 below the WR qualifier
 * (target share) in 2025; a TE never counts.
 */
function bySeason(): StatsResult {
  const wr = (
    id: string,
    season: number,
    yprr: number,
    qualified = true,
    over = {}
  ): ReturnType<typeof row> =>
    row(
      id,
      id,
      {
        yprr: value(yprr, { qualified, sample: 300 }),
        target_share: value(0.2, { qualified, sample: 60 })
      },
      { group: { season }, ...over }
    )
  return result(
    ['yprr', 'target_share'],
    [
      wr('p1', 2022, 1.4),
      wr('p2', 2022, 2.0),
      wr('p3', 2022, 1.0),
      wr('p1', 2024, 2.5),
      wr('p2', 2024, 1.5),
      wr('p3', 2024, 1.0),
      wr('p1', 2025, 2.2, false),
      wr('p2', 2025, 1.8),
      wr('p3', 2025, 1.2),
      wr('p4', 2025, 3.0, false),
      wr('t1', 2025, 4.0, true, { position: 'TE' })
    ]
  )
}

const SEASONS = [2021, 2022, 2023, 2024, 2025]

describe('Trends (stats-analysis spec §9.5)', () => {
  it('spans 2019 to the season the data runs through', () => {
    expect(trendSeasons(STATUS)).toEqual([2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026])
  })

  it('offers the entity’s season-grain metrics by family, and six core ones at a glance', () => {
    const wr = trendMetrics('player', 'WR', catalogue())
    expect(wr.map((g) => g.family)).toEqual([
      'traditional',
      'advanced',
      'ngs',
      'charting',
      'predictive'
    ])
    const ids = wr.flatMap((g) => g.metrics.map((m) => m.id))
    expect(ids).toEqual(expect.arrayContaining(['yprr', 'separation', 'target_share']))
    expect(ids).not.toContain('qb_epa_db')
    // A team metric (positions 'all') is never a player's.
    expect(ids.filter((id) => byId.get(id)!.entity !== 'player')).toEqual([])
    expect(ids.every((id) => byId.get(id)!.tier !== 'stored')).toBe(true)
    const team = trendMetrics('team', 'WR', catalogue()).flatMap((g) => g.metrics)
    expect(team.every((m) => m.entity === 'team')).toBe(true)
    expect(trendCore('player', 'WR', byId)).toEqual([
      'target_share',
      'air_yards_share',
      'yprr',
      'separation',
      'route_participation',
      'fantasy_ppg'
    ])
    expect(trendCore('team', 'WR', byId)).toContain('off_rz_td_pct')
  })

  it('asks for every row at the position by season, with the qualifier', () => {
    expect(trendQuery('player', 'WR', ['yprr'], scope, STATUS, true)).toMatchObject({
      entity: 'player',
      metrics: ['yprr', 'target_share'],
      scope: { seasons: trendSeasons(STATUS), seasonType: 'REG', positions: ['WR'] },
      groupBy: ['season'],
      transform: 'perGame',
      limit: 5000
    })
    const t = trendQuery('team', 'WR', ['off_epa_play'], scope, STATUS, false)
    expect(t.metrics).toEqual(['off_epa_play'])
    expect(t.scope.positions).toBeUndefined()
    expect(playerTeamsQuery('p1', scope, STATUS)).toMatchObject({
      scope: { players: ['p1'] },
      groupBy: ['season', 'week']
    })
  })

  it('ranks each season among that season’s qualified players at the position', () => {
    const line = trendLine(bySeason(), 'p1', 'yprr', SEASONS, 'player', 'WR', 'higher')
    expect(line.map((p) => [p.season, p.value, p.qualified, p.rank, p.of])).toEqual([
      [2021, null, false, null, 0],
      [2022, 1.4, true, 2, 3],
      [2023, null, false, null, 0],
      [2024, 2.5, true, 1, 3],
      // Not qualified in 2025: a value, no rank (p4 and the TE never count either).
      [2025, 2.2, false, null, 0]
    ])
    expect(line[3].percentile).toBe(100)
  })

  it('bands the qualified pool’s 25th to 75th percentile each season', () => {
    const band = trendBand(bySeason(), 'yprr', [2024, 2025, 2026], 'player', 'WR')
    expect(band[0]).toEqual({ season: 2024, p25: 1.25, median: 1.5, p75: 2 })
    // 2025: p2 and p3 only (p1, p4 below the qualifier; the TE another position).
    expect(band[1]).toEqual({ season: 2025, p25: 1.35, median: 1.5, p75: 1.65 })
    expect(band[2]).toEqual({ season: 2026, p25: null, median: null, p75: null })
  })

  it('spans a career from the first season to the last, a missed season kept', () => {
    expect(careerSpan(bySeason(), 'p1', SEASONS)).toEqual([2022, 2023, 2024, 2025])
    expect(careerSpan(bySeason(), 'nobody', SEASONS)).toEqual([])
  })

  it('marks his first team and every change, a trade in the order he played for them', () => {
    const week = (season: number, w: number, team: string): ReturnType<typeof row> =>
      row('p1', 'p1', { games: value(1) }, { group: { season, week: w }, team, games: 1 })
    const weekly = result(
      ['games'],
      // The engine sorts by games: a traded season's weeks come in any order.
      [
        week(2024, 9, 'NYJ'),
        week(2021, 1, 'LV'),
        week(2022, 1, 'LV'),
        week(2023, 1, 'LV'),
        week(2023, 2, 'LV'),
        week(2023, 8, 'LA'),
        week(2024, 1, 'LA'),
        week(2023, 7, 'LA')
      ]
    )
    const teams = teamsBySeason(weekly)
    const span = [2021, 2022, 2023, 2024]
    expect([...teamMarks(span, teams)]).toEqual([
      [2021, 'LV'],
      [2023, 'LV → LAR'],
      [2024, 'LAR → NYJ']
    ])
    expect(teamRuns(span, teams)).toBe('LV 2021–23, LAR 2023–24, NYJ since 2024')
    expect(teamRuns([2021], new Map([[2021, ['LV']]]))).toBe('')
    expect([...gamesBySeason(weekly)]).toEqual([
      [2024, 2],
      [2021, 1],
      [2022, 1],
      [2023, 4]
    ])
  })

  it('writes the change from the season before, toned by the better side', () => {
    expect(trendDelta(byId.get('target_share'), 0.25, 0.229, false)).toEqual({
      text: '+2.1 pts',
      tone: 'good'
    })
    expect(trendDelta(byId.get('yprr'), 1.96, 2.2, false)).toEqual({ text: '−0.24', tone: 'bad' })
    // Lower is better: fewer drops read good.
    expect(trendDelta(byId.get('drop_rate'), 0.04, 0.06, false).tone).toBe('good')
    expect(trendDelta(byId.get('rec_adot'), 12, 10, false).tone).toBe('none')
    expect(trendDelta(byId.get('yprr'), null, 2, false)).toEqual({ text: '—', tone: 'none' })
  })

  it('tables the seasons newest first, a season below the qualifier marked', () => {
    const info = byId.get('yprr')
    const line = trendLine(bySeason(), 'p1', 'yprr', [2024, 2025], 'player', 'WR', 'higher')
    const rows = trendRows(
      line,
      info,
      [
        { season: 2024, team: 'NYJ', games: 17, age: 25 },
        { season: 2025, team: 'NYJ', games: 6, age: 26 }
      ],
      false
    )
    expect(rows.map((r) => [r.season, r.value, r.delta, r.deltaTone, r.rank, r.sample])).toEqual([
      [2025, '2.20', '−0.30', 'bad', '—', 'Not qualified · 300 routes'],
      [2024, '2.50', '—', 'none', '1st of 3', '300 routes']
    ])
    // His age that season, this season's today (as the dashboard's header).
    const today = new Date(2026, 9, 24)
    expect(seasonAge('1999-09-25', 2025, today)).toBe(25)
    expect(seasonAge('1999-09-25', 2026, today)).toBe(27)
  })

  it('says what the metric’s coverage leaves out of the span', () => {
    expect(trendNotes(byId.get('contested_catch_rate'), [2020, 2021, 2022], 2026, false)).toEqual([
      'Charted from 2022.'
    ])
    expect(trendNotes(byId.get('yprr_man'), [2024, 2025, 2026], 2026, false)).toEqual([
      'Not published for 2026 yet.'
    ])
    expect(trendNotes(byId.get('route_participation'), [2025, 2026], 2026, true)).toEqual([
      'Estimated for 2026.'
    ])
  })

  it('glances at each core metric: its last value, percentile and a sparkline', () => {
    const [yprr] = glanceViews(
      bySeason(),
      'p1',
      ['yprr'],
      [2022, 2023, 2024, 2025, 2026],
      'player',
      'WR',
      byId,
      2026,
      false
    )
    // No 2026 row: the last value is 2025's, said so.
    expect(yprr).toMatchObject({
      label: 'Yards per route run',
      value: '2.20 (2025)',
      percentile: null
    })
    expect(yprr.spark).toEqual([50, null, 100, null, null])
  })
})
