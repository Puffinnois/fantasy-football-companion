import { describe, expect, it } from 'vitest'
import {
  columnGroups,
  csvFileName,
  defaultBoard,
  engineSort,
  familiesOf,
  familyColumns,
  leaderboardCsv,
  leaderboardQuery,
  leaderRows,
  normalizeBoard,
  ownerOf,
  pickable,
  rankWithinTab,
  PLAYER_TABS,
  tabOf,
  TEAM_TABS
} from '@/lib/stats/leaderboard'
import type { LeaderboardBoard, StatsOwnership } from '@shared/stats/types'
import { catalogue, catalogueMap, result, row, STATUS, value } from '../../fixtures/statsScreens'

const CAT = catalogueMap()
const scope = {
  season: 2026,
  seasonType: 'REG' as const,
  weeks: [1, 4] as [number, number],
  scoring: 'ppr' as const
}
const wr = (over: Partial<LeaderboardBoard> = {}): LeaderboardBoard => ({
  ...defaultBoard('player', 'WR', CAT),
  ...over
})

describe('the leaderboards (spec §9.2)', () => {
  it('builds every tab from catalogue metrics that apply to it', () => {
    for (const tab of [...PLAYER_TABS, ...TEAM_TABS]) {
      const ids = tab.groups.flatMap(([, g]) => g)
      expect(
        ids.filter((id) => !CAT.has(id)),
        tab.id
      ).toEqual([])
      const offered = new Set(pickable(catalogue(), tab).map((m) => m.id))
      expect(
        ids.filter((id) => !offered.has(id)),
        tab.id
      ).toEqual([])
      if (tab.qualifier) expect(CAT.get(tab.qualifier)?.minSample, tab.id).toBeGreaterThan(0)
    }
    expect(PLAYER_TABS.map((t) => t.id)).toEqual([
      'ALL',
      'QB',
      'RB',
      'WR',
      'TE',
      'K',
      'P',
      'DL',
      'LB',
      'DB'
    ])
    expect(TEAM_TABS.map((t) => t.id)).toEqual(['offense', 'defense', 'forecast'])
  })

  it('opens a tab on its default columns, best first, qualified only', () => {
    expect(wr()).toEqual({
      entity: 'player',
      tab: 'WR',
      columns: [
        'snap_share',
        'route_participation',
        'target_share',
        'air_yards_share',
        'wopr',
        'targets',
        'receptions',
        'rec_yds',
        'rec_td',
        'yprr',
        'tprr',
        'rec_adot',
        'separation',
        'fantasy_ppg',
        'fpoe'
      ],
      sort: { by: 'rec_yds', dir: 'desc' },
      perGame: false,
      qualifiedOnly: true,
      team: null,
      owner: 'all'
    })
    // Lower is better for a defense's EPA allowed.
    expect(defaultBoard('team', 'defense', CAT).sort).toEqual({ by: 'def_epa_play', dir: 'asc' })
    expect(tabOf('player', 'nope').id).toBe('ALL')
  })

  it('queries every row with the tab qualifier, and sorts in the engine', () => {
    expect(
      leaderboardQuery(
        wr({
          columns: ['rec_yds', 'yprr'],
          sort: { by: 'yprr', dir: 'asc' },
          team: 'SEA',
          perGame: true
        }),
        scope,
        STATUS,
        CAT
      )
    ).toEqual({
      entity: 'player',
      metrics: ['rec_yds', 'yprr', 'target_share'],
      scope: {
        seasons: [2026],
        seasonType: 'REG',
        weeks: [1, 4],
        positions: ['WR'],
        teams: ['SEA']
      },
      transform: 'perGame',
      sort: { metric: 'yprr', dir: 'asc' },
      scoring: 'ppr',
      limit: 1000
    })
    // A metric the catalogue no longer has (an old saved view) is left out.
    expect(leaderboardQuery(wr({ columns: ['gone', 'yprr'] }), scope, STATUS, CAT).metrics).toEqual(
      ['yprr', 'target_share']
    )
    const team = leaderboardQuery(defaultBoard('team', 'forecast', CAT), scope, STATUS, CAT)
    expect(team.metrics).not.toContain(undefined)
    expect(team.scope.positions).toBeUndefined()
    // A name sort (or a removed column) sorts the engine by the tab's metric, else the first.
    expect(engineSort(wr({ sort: { by: 'name', dir: 'asc' } }), CAT)).toEqual({
      metric: 'rec_yds',
      dir: 'desc'
    })
    expect(
      engineSort(wr({ columns: ['yprr', 'targets'], sort: { by: 'wopr', dir: 'asc' } }), CAT)
    ).toEqual({
      metric: 'yprr',
      dir: 'desc'
    })
  })

  it('filters by qualification, search and owner, and sorts by name', () => {
    const rows = [
      row('a', 'A.J. Brown', { target_share: value(0.25), yprr: value(2.1) }),
      row('b', 'Amon-Ra St. Brown', { target_share: value(0.29), yprr: value(2.4) }),
      row('c', 'Rookie Depth', {
        target_share: value(0.04, { qualified: false }),
        yprr: value(1.1)
      }),
      row('d', 'Zay Flowers', { target_share: value(0.31), yprr: value(2.2) })
    ]
    const res = result(['yprr', 'target_share'], rows)
    const ownership: StatsOwnership = {
      players: { b: { name: 'Cook Book', mine: true }, d: { name: 'Rival', mine: false } },
      teams: {}
    }
    const names = (
      b: LeaderboardBoard,
      search = '',
      own: StatsOwnership | null = ownership
    ): string[] => leaderRows(res, b, own, search).map((r) => r.name)
    expect(names(wr())).toEqual(['A.J. Brown', 'Amon-Ra St. Brown', 'Zay Flowers'])
    expect(names(wr({ qualifiedOnly: false }))).toHaveLength(4)
    expect(names(wr(), ' brown')).toEqual(['A.J. Brown', 'Amon-Ra St. Brown'])
    expect(names(wr({ owner: 'mine' }))).toEqual(['Amon-Ra St. Brown'])
    expect(names(wr({ owner: 'free' }))).toEqual(['A.J. Brown'])
    expect(names(wr({ owner: 'mine' }), '', null)).toHaveLength(3)
    expect(names(wr({ sort: { by: 'name', dir: 'desc' } }))).toEqual([
      'Zay Flowers',
      'Amon-Ra St. Brown',
      'A.J. Brown'
    ])
  })

  it('groups the header by the tab groups, and added columns by family', () => {
    expect(
      columnGroups(
        ['snap_share', 'target_share', 'targets', 'drops', 'cushion'],
        tabOf('player', 'WR'),
        CAT
      )
    ).toEqual([
      { label: 'Usage', span: 2 },
      { label: 'Receiving', span: 1 },
      { label: 'Charting', span: 1 },
      { label: 'Next Gen', span: 1 }
    ])
  })

  it('offers a family filter with the families a tab has (spec §9.2)', () => {
    const cat = catalogue()
    expect(familiesOf(cat, tabOf('player', 'WR'))).toEqual([
      'traditional',
      'advanced',
      'ngs',
      'charting',
      'predictive'
    ])
    expect(familiesOf(cat, tabOf('player', 'DL'))).not.toContain('ngs')
    const ngs = familyColumns(cat, tabOf('player', 'WR'), 'ngs')
    expect(ngs).toContain('separation')
    expect(ngs.every((id) => CAT.get(id)?.family === 'ngs')).toBe(true)
    const def = familyColumns(cat, tabOf('team', 'defense'), 'advanced')
    expect(def.length).toBeGreaterThan(5)
    expect(def.every((id) => CAT.get(id)?.side === 'defense')).toBe(true)
    // The games are their own column, never a metric one.
    expect(pickable(cat, tabOf('player', 'WR')).some((m) => m.id === 'games')).toBe(false)
  })

  it('exports the rows as CSV, percentages in percent, names quoted when needed', () => {
    const rows = [
      row('00-1', 'Smith, Jr.', {
        target_share: value(0.2519),
        rec_yds: value(95.5)
      }),
      row(
        '00-2',
        'Puka "P" Nacua',
        { target_share: value(null), rec_yds: value(102) },
        { team: 'LA', games: 5 }
      )
    ]
    const board = wr({ columns: ['target_share', 'rec_yds'], perGame: true })
    expect(leaderboardCsv(rows, board, CAT)).toBe(
      'Rank,Player,Team,Position,gsis_id,Games,Target share (%),Receiving yards per game\r\n' +
        '1,"Smith, Jr.",SEA,WR,00-1,6,25.19,95.5\r\n' +
        '2,"Puka ""P"" Nacua",LA,WR,00-2,5,,102\r\n'
    )
    expect(csvFileName(board, { ...scope, season: 2026 }, 'Weeks 1–4')).toBe(
      'stats-2026-wr-weeks-1-4.csv'
    )
    expect(csvFileName(defaultBoard('team', 'forecast', CAT), scope, 'Postseason')).toBe(
      'stats-2026-teams-ratings-odds-postseason.csv'
    )
  })

  it('ranks every column among the rows the tab qualifies, per position (review fix)', () => {
    const tab = tabOf('player', 'WR')
    // The engine ranked receiving yards among every WR; the tab shows the qualified ones only.
    const rows = [
      row('a', 'A', { rec_yds: value(900, { percentile: 100 }), target_share: value(0.3) }),
      row('b', 'B', { rec_yds: value(500, { percentile: 80 }), target_share: value(0.2) }),
      row('c', 'C', { rec_yds: value(500, { percentile: 80 }), target_share: value(0.2) }),
      row('d', 'D', { rec_yds: value(100, { percentile: 60 }), target_share: value(0.1) }),
      row('e', 'E', {
        rec_yds: value(50, { percentile: 0 }),
        target_share: value(0.05, { qualified: false })
      }),
      row(
        't',
        'T',
        { rec_yds: value(400, { percentile: 50 }), target_share: value(0.2) },
        { position: 'TE' }
      )
    ]
    const ranked = rankWithinTab(result(['rec_yds', 'target_share'], rows), tab)
    const pct = (id: string): [number | null, number | null] => {
      const v = ranked.rows.find((r) => r.id === id)!.values.rec_yds
      return [v.percentile, v.rank]
    }
    expect(['a', 'b', 'c', 'd', 'e', 't'].map(pct)).toEqual([
      [100, 1],
      [100 / 3, 2],
      [100 / 3, 2],
      [0, 4],
      [null, null],
      // The only qualified TE.
      [0, 1]
    ])
    // Lower is better: the smallest value ranks first.
    const ints = rankWithinTab(
      result(
        ['pass_int', 'qb_epa_db'],
        [
          row('q1', 'Q1', { pass_int: value(3), qb_epa_db: value(0.1) }, { position: 'QB' }),
          row('q2', 'Q2', { pass_int: value(9), qb_epa_db: value(0.2) }, { position: 'QB' })
        ]
      ),
      tabOf('player', 'QB')
    )
    expect(ints.rows.map((r) => r.values.pass_int.percentile)).toEqual([100, 0])
    // Teams keep the engine's ranks: every team qualifies.
    const teams = result(
      ['elo'],
      [row('SF', 'SF', { elo: value(1600, { percentile: 40, rank: 3 }) }, { position: null })]
    )
    expect(rankWithinTab(teams, tabOf('team', 'forecast'))).toBe(teams)
  })

  it('repairs a saved view whose metrics left the catalogue (review fix)', () => {
    const gone = wr({ columns: ['gone', 'yprr'], sort: { by: 'gone', dir: 'asc' } })
    expect(normalizeBoard(gone, CAT)).toEqual(
      wr({ columns: ['yprr'], sort: { by: 'yprr', dir: 'desc' } })
    )
    const q = leaderboardQuery(gone, scope, STATUS, CAT)
    expect(q.metrics).toEqual(['yprr', 'target_share'])
    expect(q.sort).toEqual({ metric: 'yprr', dir: 'desc' })
    // Sorted by name, the engine still sorts by a column the query has.
    expect(
      leaderboardQuery({ ...gone, sort: { by: 'name', dir: 'asc' } }, scope, STATUS, CAT).sort
    ).toEqual({
      metric: 'yprr',
      dir: 'desc'
    })
    // Every column gone: the tab's default columns.
    const empty = normalizeBoard(
      {
        ...defaultBoard('team', 'forecast', CAT),
        columns: ['gone'],
        sort: { by: 'gone', dir: 'desc' }
      },
      CAT
    )
    expect(empty).toEqual(defaultBoard('team', 'forecast', CAT))
    // A board that is fine is returned as is.
    const ok = wr()
    expect(normalizeBoard(ok, CAT)).toBe(ok)
  })

  it('marks a rostered defense on the Defense tab only (review fix)', () => {
    const own: StatsOwnership = { players: {}, teams: { LA: { name: 'Cook Book', mine: true } } }
    const la = { id: 'LA' }
    expect(ownerOf(la, defaultBoard('team', 'defense', CAT), own)).toEqual({
      name: 'Cook Book',
      mine: true
    })
    expect(ownerOf(la, defaultBoard('team', 'offense', CAT), own)).toBeNull()
    expect(ownerOf(la, defaultBoard('team', 'forecast', CAT), own)).toBeNull()
    expect(
      ownerOf({ id: 'p1' }, wr(), { players: { p1: { name: 'X', mine: false } }, teams: {} })
    ).toEqual({
      name: 'X',
      mine: false
    })
  })
})
