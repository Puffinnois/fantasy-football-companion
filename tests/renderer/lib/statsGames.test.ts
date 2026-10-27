import { describe, expect, it } from 'vitest'
import {
  beforeGame,
  BOX_METRICS,
  boxQueries,
  boxView,
  byeTeams,
  defaultWeek,
  faceView,
  forecastView,
  headerView,
  homeLine,
  keyPool,
  keySide,
  lastGames,
  matchupQueries,
  mergeResults,
  myPlayersQuery,
  myTeams,
  participants,
  participantsQuery,
  PHASES,
  projectionMap,
  railGames,
  rushersQuery,
  seasonPlayersQuery,
  weekOptions
} from '@/lib/stats/games'
import type { GameForecast, StatsOwnership, StatsResult } from '@shared/stats/types'
import type { PlayerWeekRow } from '@shared/types'
import { catalogueMap, result, row, value } from '../../fixtures/statsScreens'

const byId = catalogueMap()
const TZ = 'America/New_York'

function game(over: Partial<GameForecast>): GameForecast {
  return {
    gameId: 'g',
    season: 2026,
    seasonType: 'REG',
    week: 1,
    gameday: '2026-09-13',
    kickoff: '2026-09-13T17:00:00.000Z',
    home: 'KC',
    away: 'BUF',
    neutral: false,
    homeScore: null,
    awayScore: null,
    homeElo: 1600,
    awayElo: 1550,
    homeWinProb: 0.62,
    eloSpread: 3.1,
    vegasHomeWinProb: 0.6,
    spread: 2.5,
    total: 48.5,
    roof: 'outdoors',
    temp: null,
    wind: null,
    ...over
  }
}

const final = (over: Partial<GameForecast>, home: number, away: number): GameForecast =>
  game({ ...over, homeScore: home, awayScore: away })

/** BUF's season: W, L, W in weeks 1–3, a bye in week 4, at KC in week 5 (not played yet). */
const SEASON: GameForecast[] = [
  final({ gameId: 'w1', week: 1, home: 'BUF', away: 'MIA' }, 27, 20),
  final({ gameId: 'w1b', week: 1, home: 'KC', away: 'NE' }, 30, 10),
  final({ gameId: 'w2', week: 2, home: 'NYJ', away: 'BUF' }, 24, 17),
  final({ gameId: 'w2b', week: 2, home: 'NE', away: 'KC' }, 20, 23),
  final({ gameId: 'w3', week: 3, home: 'BUF', away: 'NE' }, 31, 31),
  final({ gameId: 'w3b', week: 3, home: 'KC', away: 'MIA' }, 21, 14),
  final({ gameId: 'w4', week: 4, home: 'KC', away: 'NYJ', gameday: '2026-10-04' }, 35, 3),
  game({
    gameId: 'w5',
    week: 5,
    home: 'KC',
    away: 'BUF',
    gameday: '2026-10-11',
    kickoff: '2026-10-12T00:20:00.000Z'
  }),
  game({
    gameId: 'w5b',
    week: 5,
    home: 'MIA',
    away: 'NE',
    gameday: '2026-10-11',
    kickoff: '2026-10-11T17:00:00.000Z',
    spread: -3,
    roof: 'dome'
  }),
  game({ gameId: 'w6', week: 6, home: 'NYJ', away: 'KC', gameday: '2026-10-18' })
]

describe('the week and its games (stats-analysis spec §9.5, Plan AE)', () => {
  it('lists the weeks, the postseason by round', () => {
    expect(weekOptions(SEASON).map((w) => w.label)).toEqual([
      'Week 1',
      'Week 2',
      'Week 3',
      'Week 4',
      'Week 5',
      'Week 6'
    ])
    const post = [
      game({ season: 2025, seasonType: 'POST', week: 19 }),
      game({ season: 2025, seasonType: 'POST', week: 22 })
    ]
    expect(weekOptions(post)).toEqual([
      { value: 19, label: 'Wild card' },
      { value: 22, label: 'Super Bowl' }
    ])
  })

  it('opens on the next game’s week, past a postponed one; else the last played', () => {
    expect(defaultWeek(SEASON, new Date('2026-10-06T12:00:00'))).toBe(5)
    // Week 5 is past its day with no score (postponed): the next game is week 6's.
    expect(defaultWeek(SEASON, new Date('2026-10-13T12:00:00'))).toBe(6)
    expect(defaultWeek(SEASON.slice(0, 7), new Date('2027-02-01T12:00:00'))).toBe(4)
    expect(defaultWeek([], new Date())).toBeNull()
  })

  it('puts my games first, then by kickoff; the home team’s line', () => {
    const rail = railGames(SEASON, 5, new Set<string>(), TZ)
    expect(rail.map((r) => r.id)).toEqual(['w5b', 'w5'])
    expect(rail[0]).toMatchObject({ away: 'NE', home: 'MIA', when: 'Sun 1:00 PM', line: '+3.0' })
    expect(rail[1]).toMatchObject({ when: 'Sun 8:20 PM', line: '−2.5', played: false })
    expect(railGames(SEASON, 5, new Set(['BUF']), TZ).map((r) => [r.id, r.mine])).toEqual([
      ['w5', true],
      ['w5b', false]
    ])
    expect(railGames(SEASON, 2, new Set(), TZ)[0]).toMatchObject({
      played: true,
      awayScore: '17',
      homeScore: '24',
      awayWon: false,
      homeWon: true
    })
    expect([homeLine(null), homeLine(0), homeLine(-7)]).toEqual([null, 'PK', '+7.0'])
    // Rams: nflverse LA, shown LAR.
    expect(railGames([game({ home: 'LA' })], 1, new Set(), TZ)[0].home).toBe('LAR')
  })

  it('names the teams on a bye', () => {
    expect(byeTeams(SEASON, 4)).toEqual(['BUF', 'MIA', 'NE'])
    expect(byeTeams(SEASON, 9)).toEqual([])
  })

  it('marks my games by my players’ teams and my team defenses', () => {
    const own: StatsOwnership = {
      players: { p1: { name: 'Me', mine: true }, p2: { name: 'Them', mine: false } },
      teams: { NYJ: { name: 'Me', mine: true } }
    }
    const q = myPlayersQuery(own, 2026)!
    expect(q.scope.players).toEqual(['p1'])
    const players = result(['games'], [row('p1', 'Me', { games: value(5) }, { team: 'BUF' })])
    expect([...myTeams(own, players)].sort()).toEqual(['BUF', 'NYJ'])
    expect(myPlayersQuery({ players: {}, teams: {} }, 2026)).toBeNull()
  })
})

describe('the header and the forecast', () => {
  it('records the teams before the game: their record, Elo and last four', () => {
    const h = headerView(SEASON, SEASON[7], TZ)
    expect(h.away).toMatchObject({
      abbr: 'BUF',
      name: 'Buffalo Bills',
      meta: '1–1–1 · Elo 1,550 · away',
      big: '38%',
      dim: true
    })
    expect(h.away.form.map((f) => f.result)).toEqual(['W', 'L', 'T'])
    expect(h.away.form[1].title).toBe('Week 2: L 17–24 at NYJ')
    expect(h.home).toMatchObject({ meta: '4–0 · Elo 1,600 · home', big: '62%', dim: false })
    expect(h.status).toBe('Sun, Oct 11 · 8:20 PM')
    expect(h.sub).toBe('Week 5 · Outdoors')
    // A final game: the scores, the loser quieter.
    const f = headerView(SEASON, SEASON[2], TZ)
    expect([f.away.big, f.away.dim, f.home.big, f.home.dim]).toEqual(['17', true, '24', false])
    expect(f.status).toBe('Final · Week 2')
    expect(f.away.form.map((x) => x.result)).toEqual(['W'])
    // No kickoff time yet: the day; the week moves under it.
    const neutral = headerView(SEASON, game({ neutral: true, roof: 'dome', kickoff: null }), TZ)
    expect([neutral.status, neutral.sub]).toEqual([
      'Sun, Sep 13',
      'Week 1 · Neutral site · Indoors'
    ])
    expect(headerView(SEASON, game({ kickoff: null, gameday: null }), TZ).status).toBe(
      'Date to be set'
    )
  })

  it('says whether Elo and the market agree, and how the game went', () => {
    const f = forecastView(game({}))
    expect(f.probs).toEqual([
      { label: 'Elo', away: '38%', home: '62%', awayShare: expect.closeTo(0.38, 9) },
      { label: 'Market', away: '40%', home: '60%', awayShare: expect.closeTo(0.4, 9) }
    ])
    expect(f.agree).toBe('Elo and the market agree: KC by 2.5.')
    expect(f.tiles).toEqual([
      { key: 'Spread', value: 'KC −2.5', sub: 'Elo: KC −3.1' },
      { key: 'Total', value: '48.5', sub: 'over / under' },
      { key: 'Implied', value: '23.0–25.5', sub: 'BUF – KC points' }
    ])
    expect(forecastView(game({ homeWinProb: 0.7 })).agree).toBe(
      'Elo likes KC more than the market does (70% against 60%).'
    )
    expect(forecastView(game({ homeWinProb: 0.5 })).agree).toBe(
      'Elo likes BUF more than the market does (50% against 40%).'
    )
    const none = forecastView(game({ vegasHomeWinProb: null, spread: null, total: null }))
    expect(none.probs).toHaveLength(1)
    expect(none.agree).toBe('No betting line for this game: Elo only.')
    expect(none.tiles.map((t) => t.value)).toEqual(['—', '—'])
    expect(forecastView(final({}, 20, 24)).result).toEqual({
      text: 'BUF won 24–20 · an upset',
      upset: true
    })
    expect(forecastView(final({}, 31, 7)).result).toEqual({
      text: 'KC won 31–7 · the favorite won',
      upset: false
    })
  })

  it('gives the conditions the schedule has', () => {
    expect(forecastView(game({ roof: 'dome' })).conditions.big).toBe('Indoors')
    expect(forecastView(game({ temp: 34.4, wind: 18 })).conditions).toEqual({
      big: '34°F',
      line: 'Outdoors · wind 18 mph · enough to slow the passing game',
      note: 'From the schedule.'
    })
    expect(forecastView(game({})).conditions).toEqual({
      big: 'Outdoors',
      line: 'No weather in the schedule yet.',
      note: null
    })
    expect(forecastView(game({ roof: '' })).conditions.big).toBe('—')
  })
})

/** Two teams' phases: KC's offense strong, BUF's defense middling, pressure not published. */
function teams(): StatsResult {
  const ids = PHASES.flatMap((p) => p.rows.flatMap(([, o, d]) => [o, d]))
  const rows = ['KC', 'BUF', 'NE'].map((t, i) =>
    row(
      t,
      t,
      Object.fromEntries(
        ids.map((id) => [id, value(id.includes('pressure') ? null : (3 - i) / 10)])
      ),
      { team: t, position: null }
    )
  )
  const r = result(ids, rows)
  return {
    ...r,
    columns: r.columns.map((c) => (c.id.includes('pressure') ? { ...c, seasons: [] } : c))
  }
}

describe('phase by phase', () => {
  it('reads the weeks before the game; week 1 the season before; the postseason its season', () => {
    expect(beforeGame(game({ week: 5 }))).toEqual({
      scope: { seasons: [2026], seasonType: 'REG', weeks: [1, 4] },
      season: 2026,
      label: 'weeks 1–4'
    })
    expect(beforeGame(game({ week: 2 }))!.label).toBe('week 1')
    expect(beforeGame(game({ week: 1 }))).toEqual({
      scope: { seasons: [2025], seasonType: 'REG' },
      season: 2025,
      label: 'the 2025 season'
    })
    expect(beforeGame(game({ season: 2019, week: 1 }))).toBeNull()
    expect(beforeGame(game({ seasonType: 'POST', week: 20 }))!.label).toBe(
      'the 2026 regular season'
    )
  })

  it('asks every team for the phases in three queries, all in the catalogue', () => {
    const qs = matchupQueries(beforeGame(game({ week: 5 }))!, 'half')
    expect([...qs.keys()]).toEqual(['off', 'def', 'fpa'])
    for (const q of qs.values()) {
      expect(q).toMatchObject({ entity: 'team', scoring: 'half', limit: 40 })
      for (const id of q.metrics) expect(byId.get(id)?.entity, id).toBe('team')
    }
    expect(qs.get('fpa')!.metrics).toEqual(['fpa_qb', 'fpa_rb', 'fpa_wr', 'fpa_te'])
    // Each pair is an offense's metric and the defense's.
    for (const [, o, d] of PHASES.flatMap((p) => p.rows)) {
      expect(byId.get(o)!.side, o).toBe('offense')
      expect(byId.get(d)!.side, d).toBe('defense')
    }
  })

  it('merges narrow answers into one row per team', () => {
    const a = result(['wins'], [row('KC', 'KC', { wins: value(1) })])
    const b = result(
      ['losses'],
      [row('KC', 'KC', { losses: value(2) }), row('NE', 'NE', { losses: value(3) })]
    )
    const m = mergeResults([a, b])!
    expect(m.rows.map((r) => [r.id, Object.keys(r.values)])).toEqual([
      ['KC', ['wins', 'losses']],
      ['NE', ['losses']]
    ])
    expect(m.columns.map((c) => c.id)).toEqual(['wins', 'losses'])
    expect(mergeResults([])).toBeNull()
  })

  it('leans each row to the side with the edge, each side on its own better side', () => {
    const f = faceView(teams(), 'KC', 'BUF', byId, 2026)
    expect([f.off, f.def]).toEqual(['KC', 'BUF'])
    const epa = f.groups[0].rows[0]
    // KC's offense is 1st of 3; BUF's defense allows the middle value: 2nd of 3.
    expect(epa.off).toMatchObject({ value: '+0.300', rank: '1st', percentile: 100 })
    expect(epa.def).toMatchObject({ rank: '2nd', percentile: 50 })
    expect(epa.edge).toBe(50)
    // Sack rate: lower is better for an offense, higher for a defense.
    const sack = f.groups.find((g) => g.label === 'Protection vs pass rush')!.rows[0]
    expect(sack.off!.rank).toBe('3rd')
    expect(sack.def!.rank).toBe('2nd')
    expect(sack.edge).toBe(-50)
    const pressure = f.groups.find((g) => g.label === 'Protection vs pass rush')!.rows[1]
    expect(pressure).toMatchObject({ off: null, def: null, missing: 'Not published for 2026 yet.' })
    expect(f.summary).toMatch(
      /^Biggest edge: (KC offense|BUF defense), on .+ \(50 percentile points\)\.$/
    )
  })
})

/** The players before the game: KC's QB and receivers, a backup who did not play. */
function players(): StatsResult {
  const p = (id: string, team: string, position: string, fp: number): ReturnType<typeof row> =>
    row(
      id,
      id.toUpperCase(),
      { fantasy_points: value(fp), fantasy_ppg: value(fp / 4) },
      { team, position }
    )
  return result(
    ['fantasy_points', 'fantasy_ppg'],
    [
      p('q1', 'KC', 'QB', 100),
      p('q2', 'BUF', 'QB', 90),
      p('q3', 'KC', 'QB', 20),
      p('r1', 'KC', 'RB', 60),
      p('w1', 'KC', 'WR', 70),
      p('w2', 'KC', 'WR', 50),
      p('w3', 'KC', 'WR', 40),
      p('w4', 'NE', 'WR', 80),
      p('t1', 'KC', 'TE', 30)
    ]
  )
}

/** Fantasy points each defense allows by position: BUF the stingiest at WR. */
function allowed(): StatsResult {
  const ids = ['fpa_qb', 'fpa_rb', 'fpa_wr', 'fpa_te', 'off_sack_rate', 'def_sack_rate']
  const teamsRows = Array.from({ length: 32 }, (_, i) =>
    row(
      i === 0 ? 'BUF' : i === 31 ? 'KC' : `T${i}`,
      'x',
      Object.fromEntries(
        ids.map((id) => [id, value(id.includes('sack') ? 0.03 + i / 1000 : 10 + i)])
      ),
      { position: null }
    )
  )
  return result(ids, teamsRows)
}

describe('key matchups', () => {
  it('finds each team’s last game and who played in it', () => {
    expect(lastGames(SEASON, SEASON[7])).toEqual({ BUF: 3, KC: 4 })
    const q = participantsQuery(SEASON[7], { BUF: 3, KC: 4 })!
    expect(q.scope).toMatchObject({ weeks: [3, 4], teams: ['BUF', 'KC'] })
    expect(q.groupBy).toEqual(['week'])
    expect(participantsQuery(SEASON[0], {})).toBeNull()
    const played = result(
      ['games'],
      [
        { ...row('a', 'A', {}, { team: 'KC' }), group: { week: 4 } },
        { ...row('b', 'B', {}, { team: 'KC' }), group: { week: 3 } },
        { ...row('c', 'C', {}, { team: 'BUF' }), group: { week: 3 } }
      ]
    )
    const by = participants(played, { BUF: 3, KC: 4 })
    expect(by.get('KC')!.map((r) => r.id)).toEqual(['a'])
    expect(by.get('BUF')!.map((r) => r.id)).toEqual(['c'])
  })

  it('picks the leading QB, RB, two WRs and TE among the players of his last game', () => {
    const season = players()
    const pool = season.rows.filter((r) => r.team === 'KC' && r.id !== 'w1')
    const side = keySide('KC', 'BUF', {
      played: pool,
      season,
      matchups: allowed(),
      rushers: null,
      ownership: { players: { w2: { name: 'Me', mine: true } }, teams: {} },
      scored: null,
      projected: new Map([['q1', 21.36]]),
      range: 'weeks 1–4'
    })
    // w1 (out last game) is left out; q3 trails q1.
    expect(side.players.map((p) => p.id)).toEqual(['q1', 'r1', 'w2', 'w3', 't1'])
    expect(side.players[0]).toMatchObject({
      meta: 'FP/G 25.0 · QB1',
      mine: false,
      matchup: { opponent: 'BUF', rank: '1st', tone: 'bad' },
      last: { value: '21.4', label: 'Sleeper' }
    })
    expect(side.players[0].matchup!.title).toBe(
      'BUF allows the fewest fantasy points per game to QBs (1st is the toughest)'
    )
    // WR ranks among every WR before the game: w4 (NE) leads.
    expect(side.players[2]).toMatchObject({ meta: 'FP/G 12.5 · WR3', mine: true, last: null })
    // KC's defense allows the most: a good matchup for BUF.
    const buf = keySide('BUF', 'KC', {
      played: null,
      season,
      matchups: allowed(),
      rushers: null,
      ownership: null,
      scored: new Map([['q2', 7]]),
      projected: null,
      range: ''
    })
    expect(buf.players.map((p) => [p.id, p.matchup!.tone, p.last])).toEqual([
      ['q2', 'good', { value: '7.0', label: 'scored' }]
    ])
  })

  it('pairs the other defense’s top rusher with the line’s sack rate', () => {
    const rushers = result(
      ['sacks', 'qb_hits'],
      [
        row(
          'd1',
          'Edge One',
          { sacks: value(4), qb_hits: value(9) },
          { team: 'BUF', position: 'DL' }
        ),
        row(
          'd2',
          'Edge Two',
          { sacks: value(4), qb_hits: value(12) },
          { team: 'BUF', position: 'LB' }
        ),
        row('d3', 'Other', { sacks: value(9), qb_hits: value(20) }, { team: 'KC', position: 'DL' })
      ]
    )
    const side = keySide('KC', 'BUF', {
      played: null,
      season: players(),
      matchups: allowed(),
      rushers,
      ownership: null,
      scored: null,
      projected: null,
      range: 'weeks 1–4'
    })
    expect(side.rush!.head).toBe('BUF’s top rusher against the KC line')
    expect(side.rush!.line).toBe(
      'Edge Two (BUF LB): 4.0 sacks and 12 QB hits in weeks 1–4. KC allows a sack on 6.1% of dropbacks (32nd of 32). BUF’s defense ranks 32nd in sack rate.'
    )
    const q = rushersQuery(beforeGame(game({ week: 5 }))!, ['BUF', 'KC'])
    expect(q.scope).toMatchObject({ teams: ['BUF', 'KC'], positions: ['DL', 'LB', 'DB'] })
  })

  it('reads the players’ points before the game, at the four positions', () => {
    const q = seasonPlayersQuery(beforeGame(game({ week: 5 }))!, 'std')
    expect(q).toMatchObject({
      entity: 'player',
      scoring: 'std',
      scope: { weeks: [1, 4], positions: ['QB', 'RB', 'WR', 'TE'] }
    })
  })

  it('maps Sleeper’s projections to gsis ids', () => {
    const rows = [
      { playerId: '100', projected: 12.5 },
      { playerId: '200', projected: null }
    ] as PlayerWeekRow[]
    const ids = new Map<string, string | null>([
      ['g1', '100'],
      ['g2', '200'],
      ['g3', null]
    ])
    expect([...projectionMap(rows, ids)]).toEqual([['g1', 12.5]])
  })
})

describe('the box score (handoff "9. Game")', () => {
  const g = final({ week: 5, home: 'KC', away: 'BUF' }, 27, 20)

  function box(): StatsResult {
    const v = (o: Record<string, number>): Record<string, ReturnType<typeof value>> =>
      Object.fromEntries(Object.entries(o).map(([k, x]) => [k, value(x)]))
    return result(BOX_METRICS, [
      row(
        'qb',
        'Kc Qb',
        v({
          fantasy_points: 24.3,
          pass_cmp: 22,
          pass_att: 31,
          pass_yds: 280,
          pass_td: 2,
          pass_int: 1,
          carries: 3,
          rush_yds: 12
        }),
        { team: 'KC', position: 'QB' }
      ),
      row(
        'rb',
        'Kc Rb',
        v({
          fantasy_points: 18,
          carries: 18,
          rush_yds: 90,
          rush_td: 1,
          targets: 3,
          receptions: 2,
          rec_yds: 15
        }),
        { team: 'KC', position: 'RB' }
      ),
      row(
        'wr',
        'Kc Wr',
        v({ fantasy_points: 20, targets: 9, receptions: 7, rec_yds: 110, rec_td: 1 }),
        { team: 'KC', position: 'WR' }
      ),
      row('k', 'Kc K', v({ fantasy_points: 9, fg_made: 2, fg_att: 3 }), {
        team: 'KC',
        position: 'K'
      }),
      row('dl', 'Kc Dl', v({ sacks: 1.5, fumble_recoveries: 1 }), { team: 'KC', position: 'DL' }),
      row('db', 'Kc Db', v({ sacks: 1, def_ints: 1, def_tds: 1 }), { team: 'KC', position: 'DB' }),
      row('bq', 'Buf Qb', v({ fantasy_points: 5, pass_cmp: 10, pass_att: 25, pass_yds: 90 }), {
        team: 'BUF',
        position: 'QB'
      }),
      row('bt', 'Buf Te', v({ fantasy_points: 1, targets: 2 }), { team: 'BUF', position: 'TE' })
    ])
  }

  it('asks for the game in three narrow queries', () => {
    const qs = boxQueries(g, 'ppr')
    expect([...qs.keys()]).toEqual(['pass', 'run', 'rest'])
    expect([...qs.values()].flatMap((q) => q.metrics)).toEqual(BOX_METRICS)
    for (const q of qs.values())
      expect(q.scope).toMatchObject({
        seasons: [2026],
        seasonType: 'REG',
        weeks: [5, 5],
        teams: ['BUF', 'KC']
      })
    for (const id of BOX_METRICS) expect(byId.get(id)?.entity, id).toBe('player')
  })

  it('writes each team’s tables, kicker and defense, and the top performances', () => {
    const v = boxView(box(), g, { players: { wr: { name: 'Me', mine: true } }, teams: {} })
    const [buf, kc] = v.sides
    expect(kc.tables.map((t) => [t.title, t.rows.map((r) => r.id)])).toEqual([
      ['Passing', ['qb']],
      ['Rushing', ['rb', 'qb']],
      ['Receiving', ['wr', 'rb']]
    ])
    expect(kc.tables[0].rows[0]).toMatchObject({ cells: ['22/31', '280', '2', '1'], fp: '24.3' })
    expect(kc.tables[1].rows[0].cells).toEqual(['18', '90', '5.0', '1'])
    expect(kc.tables[2].rows[0]).toMatchObject({ cells: ['7/9', '110', '1'], mine: true })
    expect(kc.kicker).toEqual({ id: 'k', name: 'Kc K', fg: '2/3', fp: '9.0' })
    expect(kc.defense).toEqual({ sacks: '2.5', takeaways: '2', tds: '1' })
    expect(buf.tables.map((t) => t.title)).toEqual(['Passing', 'Receiving'])
    expect(buf.kicker).toBeNull()
    expect(v.top.map((t) => t.id)).toEqual(['qb', 'wr', 'rb', 'k', 'bq'])
    // Defenders score no fantasy points here: not in "scored".
    expect([...v.scored.keys()].sort()).toEqual(['bq', 'bt', 'k', 'qb', 'rb', 'wr'])
    // The key players of a final game: those with a pass, carry or target in it.
    expect(keyPool('KC', box(), new Map())!.map((r) => r.id)).toEqual(['qb', 'rb', 'wr'])
    expect(keyPool('KC', null, new Map())).toBeNull()
  })
})
