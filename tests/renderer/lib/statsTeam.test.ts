import { describe, expect, it } from 'vitest'
import {
  defaultTeam,
  gamesInScope,
  nextGame,
  nextGameView,
  personnelRows,
  resultCards,
  rosterView,
  scheduleRows,
  sectionQueries,
  sectionViews,
  splitQueries,
  splitRows,
  standing,
  statLine,
  TAB_SECTIONS,
  TEAM_DASH_TABS,
  teamGames,
  teamRecord,
  topScorerQuery,
  usageGrid,
  weekSeries,
  chartWeeks,
  roundOf,
  type SplitKey
} from '@/lib/stats/team'
import type { GameForecast, StatsOwnership, StatsResult } from '@shared/stats/types'
import { catalogueMap, result, row, STATUS, value } from '../../fixtures/statsScreens'

const byId = catalogueMap()
const scope = { season: 2026, seasonType: 'REG' as const, weeks: null, scoring: 'ppr' as const }
const team = (id: string, values: Parameters<typeof row>[2]): ReturnType<typeof row> =>
  row(id, id, values, { team: id, position: null })

function game(over: Partial<GameForecast>): GameForecast {
  return {
    gameId: 'g',
    season: 2026,
    seasonType: 'REG',
    week: 1,
    gameday: '2026-09-13',
    home: 'DET',
    away: 'GB',
    neutral: false,
    homeScore: null,
    awayScore: null,
    homeElo: 1550,
    awayElo: 1500,
    homeWinProb: 0.6,
    eloSpread: 2,
    vegasHomeWinProb: 0.55,
    spread: 1.5,
    total: 47.5,
    roof: 'outdoors',
    temp: 61,
    wind: 8,
    ...over
  }
}

/** DET: won week 1 at home, lost week 2 away, bye in week 3, at MIN in week 7 (not played). */
const GAMES = teamGames(
  [
    game({ gameId: '1', week: 1, homeScore: 31, awayScore: 24 }),
    game({
      gameId: '2',
      week: 2,
      home: 'CHI',
      away: 'DET',
      homeScore: 20,
      awayScore: 17,
      homeElo: 1480,
      awayElo: 1560,
      homeWinProb: 0.4,
      eloSpread: -3.2,
      vegasHomeWinProb: 0.3,
      spread: -6
    }),
    game({ gameId: '7', week: 7, home: 'MIN', away: 'DET', roof: 'dome', homeWinProb: 0.45 }),
    // Another pair's game: not DET's.
    game({ gameId: 'x', week: 1, home: 'NYJ', away: 'BUF' })
  ],
  'DET'
)

describe('the team dashboard (spec §9.3)', () => {
  it('has the spec’s nine tabs', () => {
    expect(TEAM_DASH_TABS.map((t) => t.label)).toEqual([
      'Overview',
      'Offense',
      'Defense',
      'Special teams',
      'Situational',
      'Tendencies',
      'Players',
      'Schedule',
      'Forecast'
    ])
  })

  it('names catalogue metrics only', () => {
    const ids = Object.values(TAB_SECTIONS).flatMap((s) => s.flatMap((x) => x.lines))
    expect(ids.filter((l) => !byId.has(l.metric)).map((l) => l.metric)).toEqual([])
  })

  it('asks for every team once per split, each metric once', () => {
    const qs = sectionQueries(TAB_SECTIONS.offense, scope, STATUS)
    expect([...qs.keys()]).toEqual(['all', 'redzone'])
    const all = qs.get('all')!
    expect(all).toMatchObject({
      entity: 'team',
      scope: { seasons: [2026], seasonType: 'REG' },
      transform: 'raw',
      scoring: 'ppr',
      limit: 40
    })
    expect(all.scope.teams).toBeUndefined()
    expect(new Set(all.metrics).size).toBe(all.metrics.length)
    expect(qs.get('redzone')).toMatchObject({
      metrics: ['off_epa_play', 'off_success_rate'],
      situation: { fieldZone: 'redzone' }
    })
    // Standings ride along with the Overview.
    expect(
      sectionQueries(TAB_SECTIONS.overview, { ...scope, weeks: [2, 5] }, STATUS, ['wins'])
        .get('all')!
        .metrics.slice(0, 2)
    ).toEqual(['wins', 'elo'])
  })

  it('writes a line: value, rank among the teams, the league’s mean, shading', () => {
    const r = result(
      ['off_epa_play'],
      [
        team('BUF', { off_epa_play: value(0.2, { rank: 1, percentile: 100 }) }),
        team('DET', { off_epa_play: value(0.1, { rank: 2, percentile: 50 }) }),
        team('NYJ', { off_epa_play: value(-0.3, { rank: 3, percentile: 0 }) })
      ]
    )
    const l = statLine(r, 'BUF', { metric: 'off_epa_play' }, byId, 2026)
    expect(l).toMatchObject({
      label: 'EPA per play',
      value: '+0.200',
      rank: '1st of 3',
      heat: 'h3',
      league: '0.000',
      missing: null
    })
    expect(l.title).toContain('Rank 1')
    expect(statLine(r, 'NYJ', { metric: 'off_epa_play' }, byId, 2026).heat).toBe('l3')
    // A metric with no better side reads "highest" and is not shaded.
    const n = result(['proe'], [team('DET', { proe: value(4) }), team('BUF', { proe: value(6) })])
    expect(statLine(n, 'DET', { metric: 'proe' }, byId, 2026)).toMatchObject({
      rank: '2nd highest',
      percentile: 0,
      heat: 'n'
    })
  })

  it('ranks among the qualified teams itself, ties at their middle', () => {
    const r = result(
      ['team_st_tds'],
      [
        team('KC', { team_st_tds: value(2) }),
        team('BUF', { team_st_tds: value(0) }),
        team('DET', { team_st_tds: value(0) }),
        team('NYJ', { team_st_tds: value(0) }),
        // Below the metric's sample: shown, not ranked.
        team('SF', { team_st_tds: value(5, { qualified: false }) })
      ]
    )
    expect(statLine(r, 'BUF', { metric: 'team_st_tds' }, byId, 2026)).toMatchObject({
      rank: 'T-2nd of 4',
      percentile: 100 / 3,
      heat: 'l1'
    })
    expect(statLine(r, 'SF', { metric: 'team_st_tds' }, byId, 2026)).toMatchObject({
      value: '5',
      rank: null,
      percentile: null,
      heat: 'n'
    })
  })

  it('says why a line is empty for the season', () => {
    const r = result(['off_pressure_rate', 'def_blitz_rate'], [team('DET', {})])
    r.columns = r.columns.map((c) => ({ ...c, seasons: [] }))
    expect(statLine(r, 'DET', { metric: 'off_pressure_rate' }, byId, 2026)).toMatchObject({
      value: '—',
      rank: null,
      missing: 'Not published for 2026 yet.'
    })
    expect(statLine(r, 'DET', { metric: 'def_blitz_rate' }, byId, 2021).missing).toBe(
      'Charted from 2022.'
    )
  })

  it('reads every section from its split', () => {
    const results = new Map<SplitKey, StatsResult>([
      ['all', result(['td_drive_rate'], [team('DET', { td_drive_rate: value(0.3) })])],
      ['redzone', result(['off_epa_play'], [team('DET', { off_epa_play: value(0.5) })])]
    ])
    const red = sectionViews(TAB_SECTIONS.offense, results, 'DET', byId, 2026)[3]
    expect(red.title).toBe('Red zone and third down')
    expect(red.lines.slice(0, 3).map((l) => [l.label, l.value])).toEqual([
      ['Red-zone EPA per play', '+0.500'],
      ['Red-zone success rate', '—'],
      ['Touchdown drive rate', '30.0%']
    ])
  })

  it('takes the team’s side of each game', () => {
    expect(GAMES.map((g) => [g.week, g.opponent, g.home, g.result])).toEqual([
      [1, 'GB', true, 'W'],
      [2, 'CHI', false, 'L'],
      [7, 'MIN', false, null]
    ])
    expect(GAMES[1]).toMatchObject({
      pointsFor: 17,
      pointsAgainst: 20,
      eloWinProb: 0.6,
      eloSpread: 3.2,
      vegasWinProb: 0.7,
      vegasSpread: 6,
      opponentElo: 1480,
      teamElo: 1560
    })
  })

  it('names postseason rounds from the season’s length', () => {
    expect([18, 19, 20, 21].map((w) => roundOf(2020, w))).toEqual(['WC', 'DIV', 'CONF', 'SB'])
    expect([19, 22].map((w) => roundOf(2024, w))).toEqual(['WC', 'SB'])
    const post = teamGames([game({ season: 2024, seasonType: 'POST', week: 22 })], 'DET')
    expect(post[0].round).toBe('SB')
    expect(GAMES[0].round).toBeNull()
  })

  it('sums the record and the results strip over the scope, byes included', () => {
    expect(teamRecord(GAMES)).toEqual({
      record: '1–1',
      pointsPerGame: '24.0',
      allowedPerGame: '22.0',
      margin: '+2.0',
      tone: 'good',
      played: 2
    })
    expect(teamRecord([])).toMatchObject({ record: '0–0', margin: '—', tone: 'even' })
    const cards = resultCards(GAMES, { ...scope, weeks: [1, 3] }, STATUS)
    expect(cards.map((c) => [c.week, c.opponent, c.score])).toEqual([
      ['W1', 'GB', 'W 31–24'],
      ['W2', '@CHI', 'L 17–20'],
      ['W3', 'BYE', null]
    ])
    expect(gamesInScope(GAMES, { ...scope, weeks: [2, 6] }, STATUS)).toHaveLength(1)
    expect(gamesInScope(GAMES, { ...scope, seasonType: 'POST' }, STATUS)).toEqual([])
  })

  it('previews the next game: Elo against the market, weather', () => {
    const g = nextGame(GAMES)!
    expect(g.week).toBe(7)
    expect(nextGameView(g, 'DET')).toMatchObject({
      opponent: 'MIN',
      where: 'Away',
      elo: { winProb: '55%', spread: 'DET +2.0' },
      vegas: { winProb: '45%', spread: 'DET +1.5', total: '47.5' },
      gap: 'Elo is 10 points higher than the market',
      weather: 'Indoors'
    })
    expect(nextGameView(GAMES[0], 'DET').weather).toBe('61°F, wind 8 mph')
    expect(nextGame(GAMES.slice(0, 2))).toBeNull()
  })

  it('places the team in its division', () => {
    const r = result(
      ['wins', 'losses', 'points_for', 'points_against'],
      [
        ['DET', 3, 2, 150, 140],
        ['GB', 3, 2, 160, 120],
        ['CHI', 4, 1, 100, 90],
        ['MIN', 1, 4, 80, 140]
      ].map(([id, w, l, pf, pa]) =>
        team(String(id), {
          wins: value(Number(w)),
          losses: value(Number(l)),
          points_for: value(Number(pf)),
          points_against: value(Number(pa))
        })
      )
    )
    expect(standing(r, 'DET')).toBe('3rd in the NFC North')
    expect(standing(r, 'CHI')).toBe('1st in the NFC North')
    expect(standing(r, 'XYZ')).toBeNull()
  })

  it('opens on my top scorer’s team, else the first', () => {
    const own: StatsOwnership = {
      players: { a: { name: 'Me', mine: true }, b: { name: 'Rival', mine: false } },
      teams: {}
    }
    expect(topScorerQuery(own, scope, STATUS)).toMatchObject({
      entity: 'player',
      metrics: ['fantasy_points'],
      scope: { players: ['a'] },
      limit: 1
    })
    expect(topScorerQuery(null, scope, STATUS)).toBeNull()
    const top = result(['fantasy_points'], [row('a', 'A', {}, { team: 'SEA' })])
    expect(defaultTeam(top)).toBe('SEA')
    expect(defaultTeam(null)).toBe('ARI')
  })

  it('lists who gets the targets and carries, shares against the leader', () => {
    const p = (id: string, pos: string, v: Record<string, number>): ReturnType<typeof row> =>
      row(id, id, Object.fromEntries(Object.entries(v).map(([k, x]) => [k, value(x)])), {
        position: pos,
        team: 'DET'
      })
    const v = rosterView(
      result(
        [],
        [
          p('wr', 'WR', { targets: 50, receptions: 35, rec_yds: 400 }),
          p('rb', 'RB', { targets: 25, carries: 80 }),
          p('qb', 'QB', { pass_att: 190, pass_cmp: 128, pass_yds: 1485, pass_ypa: 7.8 })
        ]
      ),
      { players: { rb: { name: 'Me', mine: true } }, teams: {} }
    )
    expect(v.teamTargets).toBe(75)
    expect(v.targets.map((r) => [r.id, r.share, r.bar, r.mine])).toEqual([
      ['wr', 50 / 75, 1, false],
      ['rb', 25 / 75, 0.5, true]
    ])
    expect(v.targets[0].cells).toEqual(['50', '35', '400', '0', '—'])
    expect(v.carries.map((r) => r.id)).toEqual(['rb'])
    expect(v.passers[0].cells).toEqual(['128/190', '1,485', '0', '0', '7.8'])
  })

  it('charts a series per metric over the weeks, gaps for byes', () => {
    const wk = result(
      ['off_epa_play'],
      [1, 2, 4]
        .map((w) => team('DET', { off_epa_play: value(w / 10) }))
        .map((r, i) => ({ ...r, group: { week: [1, 2, 4][i] } }))
    )
    const weeks = chartWeeks(wk, { ...scope, weeks: [1, 4] }, STATUS)
    expect(weeks).toEqual([1, 2, 3, 4])
    expect(weekSeries(wk, ['off_epa_play'], weeks, byId)[0].points.map((p) => p.value)).toEqual([
      0.1,
      0.2,
      null,
      0.4
    ])
    expect(chartWeeks(wk, { ...scope, seasonType: 'POST' }, STATUS)).toEqual([1, 2, 4])
  })

  it('grids usage: players with a share, highest first, a cell per week', () => {
    const season = result(
      ['snap_share'],
      [
        row('a', 'A', { snap_share: value(0.5) }),
        row('b', 'B', { snap_share: value(0.9, { estimated: true }) }),
        row('c', 'C', { snap_share: value(0) })
      ]
    )
    const weekly = result(
      ['snap_share'],
      [
        { ...row('b', 'B', { snap_share: value(0.8) }), group: { week: 1 } },
        { ...row('b', 'B', { snap_share: value(1) }), group: { week: 2 } },
        { ...row('a', 'A', { snap_share: value(0.5) }), group: { week: 2 } }
      ]
    )
    const grid = usageGrid(season, weekly, 'snap_share', [1, 2], null)
    expect(grid.map((r) => [r.id, r.season, r.estimated, r.cells])).toEqual([
      ['b', 0.9, true, [0.8, 1]],
      ['a', 0.5, false, [null, 0.5]]
    ])
  })

  it('splits by situation: plays and ranks, one query each', () => {
    const qs = splitQueries(scope, STATUS)
    expect(qs.get('twoMinute')?.situation).toEqual({ twoMinute: true })
    expect(qs.get('trailing')?.situation).toEqual({ scoreMargin: [-99, -9] })
    expect(qs.get('all')?.situation).toBeUndefined()
    const r = result(
      ['off_epa_play'],
      [team('DET', { off_epa_play: value(0.2, { sample: 74, rank: 2, percentile: 97 }) })]
    )
    const rows = splitRows(new Map([['redzone', r]]), 'DET', byId, 2026)
    expect(rows.map((x) => x.label)).toEqual([
      'All plays',
      'Red zone',
      'Two-minute',
      'Leading by 9+',
      'Within 8',
      'Trailing by 9+',
      '1st quarter',
      '2nd quarter',
      '3rd quarter',
      '4th quarter'
    ])
    expect(rows[1]).toMatchObject({ offPlays: '74', defPlays: '—' })
    expect(rows[1].cells[0]).toMatchObject({ value: '+0.200', rank: '1st', heat: 'n' })
  })

  it('mixes personnel by plays', () => {
    const r = result(
      ['off_epa_play', 'off_success_rate'],
      [
        {
          ...team('DET', { off_epa_play: value(0.1, { sample: 30 }) }),
          group: { personnel: '12' }
        },
        {
          ...team('DET', { off_epa_play: value(0.2, { sample: 70 }) }),
          group: { personnel: '11' }
        },
        { ...team('DET', { off_epa_play: value(null) }), group: { personnel: null } }
      ]
    )
    expect(personnelRows(r).map((x) => [x.personnel, x.plays, x.share, x.epa])).toEqual([
      ['11', 70, 0.7, '+0.20'],
      ['12', 30, 0.3, '+0.10']
    ])
  })

  it('lists the schedule from the team’s side', () => {
    const rows = scheduleRows(GAMES, 'DET')
    expect(rows.map((r) => [r.week, r.opponent, r.score, r.elo, r.vegas, r.line])).toEqual([
      ['1', 'GB', 'W 31–24', '60%', '55%', 'DET −1.5'],
      ['2', '@ CHI', 'L 17–20', '60%', '70%', 'DET −6.0'],
      ['7', '@ MIN', '', '55%', '45%', 'DET +1.5']
    ])
    expect(rows[1].strength).toBe('even')
  })
})
