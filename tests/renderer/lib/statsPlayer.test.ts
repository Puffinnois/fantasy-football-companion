import { describe, expect, it } from 'vitest'
import {
  ageOn,
  bornOf,
  careerQuery,
  careerRows,
  combineView,
  defaultPlayer,
  fantasyRank,
  fantasyRankQuery,
  gameLog,
  gameLogQuery,
  kindOf,
  nextMatchup,
  opponentRows,
  outlookView,
  overviewSections,
  playerHeader,
  playerSectionQueries,
  playerSectionViews,
  playerTabs,
  poolOf,
  positionGroup,
  projectionView,
  railQuery,
  railRows,
  sectionsFor,
  shrunkRows,
  SPLIT_METRICS,
  splitTable,
  splitTableQueries,
  statusChip,
  tabFor,
  teammateOptions,
  tileViews,
  type PlayerSplitKey
} from '@/lib/stats/player'
import type { GameForecast, PlayerBio, PlayerOutlook, StatsResult } from '@shared/stats/types'
import type { PlayerDetail } from '@shared/types'
import { catalogueMap, result, row, STATUS, value } from '../../fixtures/statsScreens'

const byId = catalogueMap()
const scope = { season: 2026, seasonType: 'REG' as const, weeks: null, scoring: 'ppr' as const }

const BIO: PlayerBio = {
  id: 'p1',
  name: 'Ja’Marr Chase',
  firstName: 'Ja’Marr',
  lastName: 'Chase',
  position: 'WR',
  team: 'CIN',
  jersey: 1,
  birthDate: '2000-03-01',
  height: 72,
  weight: 205,
  college: 'LSU',
  draft: { year: 2021, round: 1, pick: 5, team: 'CIN' },
  rookieSeason: 2021,
  seasons: [2021, 2022, 2025, 2026],
  sleeperId: '7564',
  status: null
}

/** Four WRs; p3 is below the WR tab's qualifier (target share sample), p9 a TE. */
function receivers(metrics: string[], over: Record<string, number | null> = {}): StatsResult {
  const vals = (base: number, qualified = true): Parameters<typeof row>[2] =>
    Object.fromEntries(metrics.map((m) => [m, value(over[m] ?? base, { qualified, sample: 40 })]))
  return result(metrics, [
    row('p0', 'Top', vals(30)),
    row('p1', 'Mine', vals(20)),
    row('p3', 'Small', vals(50, false)),
    row('p2', 'Low', vals(10)),
    row('p9', 'Tight', vals(99), { position: 'TE' })
  ])
}

describe('the player dashboard model (stats-analysis spec §9.4)', () => {
  it('gives each position group its tabs, and keeps a tab its position has', () => {
    expect(playerTabs('QB').map((t) => t.label)).toEqual([
      'Overview',
      'Passing',
      'Under pressure',
      'Rushing',
      'Game log',
      'Splits',
      'Forecast',
      'Profile'
    ])
    expect(playerTabs('TE').map((t) => t.id)).toEqual(playerTabs('WR').map((t) => t.id))
    expect(playerTabs('WR').map((t) => t.label)).toContain('vs Coverage')
    expect(playerTabs('K').map((t) => t.label)).toEqual([
      'Overview',
      'Kicking',
      'Game log',
      'Profile'
    ])
    expect(playerTabs('P').map((t) => t.label)).toContain('Punting')
    expect(playerTabs('LB').map((t) => t.label)).toEqual([
      'Overview',
      'Pass rush',
      'Coverage',
      'Run defense & tackling',
      'Game log',
      'Splits',
      'Profile'
    ])
    expect(tabFor('splits', 'WR')).toBe('splits')
    expect(tabFor('splits', 'K')).toBe('overview')
    expect(tabFor('passing', 'RB')).toBe('overview')
    expect([positionGroup('CB'), positionGroup('ILB'), positionGroup('FB')]).toEqual([
      'DB',
      'LB',
      'RB'
    ])
    expect(kindOf('TE')).toBe('REC')
  })

  it('shows only the lines about the position, and no empty section', () => {
    // Coverage metrics are for LBs and DBs: a lineman's Coverage tab keeps what is on the ball.
    expect(sectionsFor('coverage', 'DL', byId).map((s) => s.title)).toEqual(['On the ball'])
    expect(sectionsFor('coverage', 'DB', byId)[0].lines.map((l) => l.metric)).toContain(
      'coverage_rating'
    )
    // Separation is NGS's for WR and TE only.
    const rb = sectionsFor('receiving', 'RB', byId).flatMap((s) => s.lines.map((l) => l.metric))
    expect(rb).not.toContain('separation')
    expect(overviewSections('QB', byId)[0].lines.map((l) => l.metric)).toContain('qb_epa_db')
  })

  it('asks the position once per split, each metric once, the qualifier in every tab', () => {
    const qs = playerSectionQueries(sectionsFor('pressure', 'QB', byId), 'QB', scope, STATUS)
    expect([...qs.keys()]).toEqual(['all', 'pressured', 'clean', 'noBlitz', 'blitz'])
    const all = qs.get('all')!
    expect(all.scope).toMatchObject({ seasons: [2026], positions: ['QB'] })
    expect(all.scope.players).toBeUndefined()
    expect(all.metrics).toContain('qb_epa_db')
    expect(new Set(all.metrics).size).toBe(all.metrics.length)
    expect(qs.get('pressured')!.situation).toEqual({ pressure: true })
    expect(qs.get('blitz')!.metrics).toEqual(['qb_success', 'cpoe'])
    // The splits table: game splits through the scope, grouped play splits in one query each.
    const t = splitTableQueries('WR', scope, STATUS)
    expect(t.get('home')!.scope.home).toBe(true)
    expect(t.get('last4')!.scope.lastNGames).toBe(4)
    expect(t.get('quarter')!.groupBy).toEqual(['quarter'])
    expect(t.get('coverage')!.groupBy).toEqual(['coverage'])
    expect(t.get('all')!.metrics).toContain('target_share')
    expect(splitTableQueries('RB', scope, STATUS).has('coverage')).toBe(false)
    // A grouped split has a row per player and quarter (or down): a season of DBs has about
    // 1,500, and a row cut off would leave his cells blank and move the ranks.
    const db = splitTableQueries('DB', scope, STATUS)
    expect(db.get('quarter')!.limit).toBeGreaterThanOrEqual(3000)
    expect(db.get('down')!.limit).toBeGreaterThanOrEqual(3000)
    expect(splitTableQueries('K', scope, STATUS).size).toBe(0)
  })

  it('ranks a player among the position’s qualified players only', () => {
    const r = receivers(['target_share', 'rec_yds'])
    expect([...poolOf(r, 'WR')].sort()).toEqual(['p0', 'p1', 'p2'])
    const results = new Map<PlayerSplitKey, StatsResult>([['all', r]])
    const sections = [{ title: 'S', lines: [{ metric: 'rec_yds' }] }]
    const [line] = playerSectionViews(sections, results, 'p1', 'WR', byId, 2026)[0].lines
    // p3 (50, not qualified) and p9 (a TE) are not counted: 2nd of 3.
    expect(line).toMatchObject({ value: '20', rank: '2nd of 3', percentile: 50 })
    const [small] = playerSectionViews(sections, results, 'p3', 'WR', byId, 2026)[0].lines
    expect(small).toMatchObject({ value: '50', rank: null, percentile: null })
    const split = playerSectionViews(
      [{ title: 'S', lines: [{ metric: 'qb_success', split: 'blitz', label: 'vs blitz' }] }],
      new Map([
        ['all', r],
        ['blitz', result(['qb_success'], [row('p0', 'Top', { qb_success: value(0.5) })])]
      ]),
      'p1',
      'WR',
      byId,
      2026
    )[0].lines[0]
    expect(split).toMatchObject({ key: 'blitz:qb_success', missing: 'No plays in this split.' })
    // Nobody in a split whose source has nothing for the season says why.
    const why = (split: PlayerSplitKey, season: number): string | null =>
      playerSectionViews(
        [{ title: 'S', lines: [{ metric: 'qb_success', split, label: 'x' }] }],
        new Map([
          ['all', r],
          [split, result(['qb_success'], [])]
        ]),
        'p1',
        'WR',
        byId,
        season
      )[0].lines[0].missing
    expect(why('pressured', 2026)).toBe('Not published for 2026 yet.')
    expect(why('blitz', 2021)).toBe('Charted from 2022.')
    // He has a row, others have the metric, he has none: the source left him out.
    const ngs = playerSectionViews(
      [{ title: 'S', lines: [{ metric: 'separation' }] }],
      new Map([
        [
          'all',
          result(
            ['separation', 'target_share'],
            [
              row('p0', 'Top', { separation: value(3.1), target_share: value(0.3) }),
              row('p1', 'Mine', { separation: value(null), target_share: value(0.2) })
            ]
          )
        ]
      ]),
      'p1',
      'WR',
      byId,
      2026
    )[0].lines[0]
    expect(ngs.missing).toBe('No NFL Next Gen Stats value for him.')
  })

  it('writes the tiles with a percentile chip among the qualified', () => {
    const r = receivers(['rec_yds', 'target_share', 'rec_ypt', 'fantasy_ppg'], { rec_ypt: 7.6 })
    const tiles = tileViews(r, 'p0', 'WR', byId, 2026)
    expect(tiles.map((t) => t.label)).toEqual([
      'Receiving yards',
      'Target share',
      'Yards per target',
      'Fantasy points per game'
    ])
    expect(tiles[0]).toMatchObject({ value: '30', chip: '100th pct', heat: 'good' })
    // Every receiver ties on yards per target: the middle.
    expect(tiles[2]).toMatchObject({ chip: '50th pct', heat: 'mid' })
  })

  it('places a player by fantasy points at his position, ties sharing', () => {
    const q = fantasyRankQuery('WR', scope, STATUS)!
    expect(q).toMatchObject({ metrics: ['fantasy_points'], scope: { positions: ['WR'] } })
    expect(fantasyRankQuery('DL', scope, STATUS)).toBeNull()
    const r = result(
      ['fantasy_points'],
      [
        row('a', 'A', { fantasy_points: value(100) }),
        row('b', 'B', { fantasy_points: value(90) }),
        row('c', 'C', { fantasy_points: value(90) })
      ]
    )
    expect(fantasyRank(r, 'c', 'WR', scope)).toBe('WR2 in PPR')
    expect(fantasyRank(r, 'z', 'WR', scope)).toBeNull()
  })

  it('writes the header: number, age, season, draft, college, size, games in range', () => {
    const h = playerHeader(
      BIO,
      row('p1', 'x', {}, { games: 6 }),
      scope,
      STATUS,
      new Date(2026, 1, 28)
    )
    expect(h).toMatchObject({
      first: 'Ja’Marr',
      last: 'Chase',
      games: '6 G · Weeks 1–6',
      status: null
    })
    expect(h.facts).toEqual([
      '#1',
      'Age 25',
      '6th season',
      '2021 Round 1, pick 5 (CIN)',
      'LSU',
      '6′0″, 205 lb'
    ])
    expect(ageOn('2000-03-01', new Date(2026, 2, 1))).toBe(26)
    expect(bornOf('2000-03-01', new Date(2026, 2, 1))).toBe('Mar 1, 2000 · age 26')
    // The name he goes by, not nflverse's legal first name.
    const stafford = playerHeader(
      { ...BIO, name: 'Matthew Stafford', firstName: 'John', lastName: 'Stafford' },
      null,
      scope,
      STATUS
    )
    expect([stafford.first, stafford.last]).toEqual(['Matthew', 'Stafford'])
    // His age that season.
    expect(
      playerHeader(BIO, null, { ...scope, season: 2023 }, STATUS, new Date(2026, 9, 21)).facts[1]
    ).toBe('Age 23')
    const jr = playerHeader({ ...BIO, name: 'Will Anderson Jr.' }, null, scope, STATUS)
    expect([jr.first, jr.last]).toEqual(['Will', 'Anderson Jr.'])
    const rookie = playerHeader(
      { ...BIO, draft: null, rookieSeason: 2026, jersey: null, college: null },
      null,
      scope,
      STATUS
    )
    expect(rookie.facts.slice(1, 3)).toEqual(['Rookie', 'Undrafted'])
    expect(rookie.games).toBe('0 G · Weeks 1–6')
    // Until his row is known, the range alone (no "0 G" flash).
    expect(playerHeader(BIO, undefined, scope, STATUS).games).toBe('Weeks 1–6')
  })

  it('tags the status: reserve lists and Out are bad, Questionable and practice warn', () => {
    const st = (over: Partial<NonNullable<PlayerBio['status']>>): PlayerBio['status'] => ({
      season: 2026,
      week: 7,
      reserve: null,
      report: null,
      practice: null,
      injury: 'Ankle',
      ...over
    })
    expect(statusChip(st({ reserve: 'IR' }))).toEqual({
      tag: 'IR',
      tone: 'bad',
      title: 'Injured reserve (week 7 roster)'
    })
    expect(statusChip(st({ report: 'Questionable', practice: 'Limited' }))).toEqual({
      tag: 'Q',
      tone: 'warn',
      title: 'Questionable · Ankle (week 7 report)'
    })
    expect(statusChip(st({ report: 'Out' }))?.tone).toBe('bad')
    expect(statusChip(st({ practice: 'DNP' }))).toMatchObject({ tag: 'DNP', tone: 'warn' })
    expect(statusChip(st({ reserve: 'Suspended' }))?.tag).toBe('SUS')
    expect(statusChip(null)).toBeNull()
    // Today's status is not 2024's.
    const past = playerHeader(
      { ...BIO, status: st({ reserve: 'IR' }) },
      null,
      { ...scope, season: 2024 },
      STATUS
    )
    expect(past.status).toBeNull()
  })

  it('lists the rail: qualified players, best first, the shown one kept, ranks before the search', () => {
    const q = railQuery('WR', 'rec_yds', scope, STATUS, byId)
    expect(q.metrics).toEqual(['rec_yds', 'target_share'])
    expect(railQuery('QB', 'qb_epa_db', scope, STATUS, byId).metrics).toEqual(['qb_epa_db'])
    const r = receivers(['rec_yds', 'target_share'])
    const own = { players: { p2: { name: 'Me', mine: true } }, teams: {} }
    const rows = railRows(r, 'WR', 'rec_yds', byId, own, '', null)
    expect(rows.map((x) => [x.id, x.rank, x.value])).toEqual([
      ['p0', 1, '30'],
      ['p1', 2, '20'],
      ['p2', 3, '10']
    ])
    expect(rows[2].owner).toEqual({ name: 'Me', mine: true })
    expect(rows[0].heat).toBe('h3')
    // The shown player stays, unranked, below the qualifier; the search keeps true ranks.
    expect(railRows(r, 'WR', 'rec_yds', byId, null, '', 'p3').map((x) => x.id)).toContain('p3')
    expect(
      railRows(r, 'WR', 'rec_yds', byId, null, 'low', null).map((x) => [x.id, x.rank])
    ).toEqual([['p2', 3]])
  })

  it('opens on my top scorer, else the first leader', () => {
    const mine = result(['fantasy_points'], [row('m', 'Mine', {}, { position: 'RB' })])
    const lead = result(['rec_yds'], [row('l', 'Lead', {}, { position: 'WR' })])
    expect(defaultPlayer(mine, lead)).toEqual({ id: 'm', position: 'RB' })
    expect(defaultPlayer(null, lead)).toEqual({ id: 'l', position: 'WR' })
    expect(defaultPlayer(null, null)).toBeNull()
  })
})

function game(over: Partial<GameForecast>): GameForecast {
  return {
    gameId: 'g',
    season: 2026,
    seasonType: 'REG',
    week: 1,
    gameday: '2026-09-13',
    home: 'CIN',
    away: 'CLE',
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

describe('the game log, splits and the rest (stats-analysis spec §9.4)', () => {
  const metrics = gameLogQuery('p1', 'REC', scope, STATUS).metrics
  const week = (
    w: number,
    team: string,
    opponent: string,
    yards: number
  ): ReturnType<typeof row> => ({
    ...row(
      'p1',
      'Mine',
      Object.fromEntries(metrics.map((m) => [m, value(m === 'rec_yds' ? yards : 1)])),
      {
        team
      }
    ),
    group: { week: w, opponent }
  })

  it('asks for the player’s weeks with their opponent', () => {
    const q = gameLogQuery('p1', 'REC', scope, STATUS)
    expect(q).toMatchObject({ groupBy: ['week', 'opponent'], scope: { players: ['p1'] } })
    expect(q.metrics).toEqual(
      expect.arrayContaining(['targets', 'fantasy_points', 'expected_points'])
    )
    expect(gameLogQuery('p1', 'DEF', scope, STATUS).metrics).not.toContain('fantasy_points')
  })

  it('logs every week: results from his team’s side, byes, games he missed, a trade', () => {
    // CIN: home win in week 1, at PIT (lost) in week 2, bye in week 3, CIN week 4 (he missed it).
    // Traded to KC: KC at DEN in week 5 (lost), not played yet in week 6.
    const games = [
      game({ gameId: '1', week: 1, homeScore: 27, awayScore: 20 }),
      game({ gameId: '2', week: 2, home: 'PIT', away: 'CIN', homeScore: 30, awayScore: 10 }),
      game({ gameId: '4', week: 4, home: 'CIN', away: 'BAL', homeScore: 3, awayScore: 6 }),
      game({ gameId: '5', week: 5, home: 'DEN', away: 'KC', homeScore: 24, awayScore: 21 }),
      game({ gameId: '6', week: 6, home: 'KC', away: 'LV', gameday: '2026-10-19' }),
      game({ gameId: '9', week: 4, home: 'KC', away: 'LAC', homeScore: 1, awayScore: 0 })
    ]
    const r = result(metrics, [
      week(2, 'CIN', 'PIT', 80),
      // A week a source left without his team: the nearest game's.
      { ...week(1, 'CIN', 'CLE', 120), team: null },
      week(5, 'KC', 'DEN', 40)
    ])
    const log = gameLog(r, games, 'REC', byId, scope, STATUS)
    expect(log.map((l) => [l.week, l.opponent, l.score ?? l.note])).toEqual([
      ['W1', 'CLE', 'W 27–20'],
      ['W2', '@ PIT', 'L 10–30'],
      ['W3', '', 'Bye'],
      ['W4', 'BAL', 'Did not play'],
      ['W5', '@ DEN', 'L 21–24'],
      ['W6', 'LV', 'Not played yet']
    ])
    expect(log[0].cells[4]).toBe('120')
    expect(log[0]).toMatchObject({ points: '1.0', expected: '1.0' })
    expect(log[2].cells.every((c) => c === '')).toBe(true)
  })

  it('logs a season he has not played yet on his team now (PUP): games he missed, not byes', () => {
    const games = [
      game({ gameId: '1', week: 1, homeScore: 27, awayScore: 20 }),
      game({ gameId: '2', week: 2, home: 'PIT', away: 'CIN', homeScore: 30, awayScore: 10 })
    ]
    const log = gameLog(result(metrics, []), games, 'REC', byId, scope, STATUS, 'CIN')
    expect(log.slice(0, 3).map((l) => [l.week, l.opponent, l.note])).toEqual([
      ['W1', 'CLE', 'Did not play'],
      ['W2', '@ PIT', 'Did not play'],
      ['W3', '', 'Bye']
    ])
    // Without his team now (a past season), a week without his row stays unknown: a bye.
    expect(gameLog(result(metrics, []), games, 'REC', byId, scope, STATUS)[0].note).toBe('Bye')
  })

  it('names postseason rounds, and shows the postseason’s games only', () => {
    const r = result(metrics, [week(20, 'CIN', 'BUF', 70)])
    const games = [
      game({ week: 20, seasonType: 'POST', home: 'BUF', away: 'CIN', homeScore: 27, awayScore: 24 })
    ]
    expect(
      gameLog(r, games, 'REC', byId, { ...scope, seasonType: 'POST' }, STATUS).map((l) => [
        l.week,
        l.opponent,
        l.score
      ])
    ).toEqual([['DIV', '@ BUF', 'L 24–27']])
  })

  it('splits a grouped answer into rows, each ranked among the qualified in that split', () => {
    const kinds = splitTableQueries('WR', scope, STATUS)
    const all = receivers([...kinds.get('all')!.metrics])
    const quarters = result(
      kinds.get('quarter')!.metrics,
      [1, 2, 3, 4].flatMap((q) =>
        ['p0', 'p1', 'p3'].map((id, i) => ({
          ...row(
            id,
            id,
            Object.fromEntries(
              kinds
                .get('quarter')!
                .metrics.map((m) => [m, value(q * 10 + (id === 'p1' ? 5 : i), { sample: 7 })])
            )
          ),
          group: { quarter: q }
        }))
      )
    )
    const table = splitTable(
      new Map([
        ['all', all],
        ['quarter', quarters]
      ]),
      'p1',
      'WR',
      byId,
      2026
    )
    expect(table.map((g) => g.title)).toEqual([
      'Games',
      'Quarter',
      'Score',
      'Down and field',
      'Coverage'
    ])
    const q = table[1].rows
    expect(q.map((r) => r.label)).toEqual([
      '1st quarter',
      '2nd quarter',
      '3rd quarter',
      '4th quarter'
    ])
    // p1 has 15 receptions in the 1st quarter against p0's 10; p3 is not in the pool.
    expect(q[0]).toMatchObject({ plays: '7' })
    expect(q[0].cells[0]).toMatchObject({ value: '15', rank: '1st' })
    expect(table[0].rows[1]).toMatchObject({ label: 'Home', plays: '—' })
    // A metric with no better side ranks "highest": the cell keeps the place only.
    const adot = table[0].rows[0].cells[SPLIT_METRICS.REC.indexOf('rec_adot')]
    expect(adot.rank).toMatch(/^(T-)?\d+(st|nd|rd|th)$/)
    expect(table[4].note).toMatch(/after each season/)
  })

  it('reads the outlook, the shrunk rates, the combine, the career, opponents and teammates', () => {
    const o: PlayerOutlook = {
      player: 'p1',
      season: 2026,
      scoring: 'ppr',
      position: 'WR',
      team: 'CIN',
      games: 6,
      ceiling: { season: 30.2, last16: 28 },
      floor: { season: 8.1, last16: null },
      boomRate: 0.5,
      bustRate: 0.1,
      trend: [
        {
          metric: 'target_share',
          season: 0.3,
          last4: 0.36,
          change: 0.09,
          z: 2.2,
          roleChange: 'up'
        },
        {
          metric: 'carry_share',
          season: null,
          last4: null,
          change: null,
          z: null,
          roleChange: null
        },
        // A receiver's carries: nothing to say.
        {
          metric: 'opportunity_share',
          season: 0,
          last4: 0,
          change: null,
          z: null,
          roleChange: null
        }
      ],
      regression: [
        { metric: 'fpoe', value: 25, mean: 2, expectedChange: -18, z: 1.4, signal: 'hot' },
        { metric: 'yacoe', value: 0.1, mean: 0, expectedChange: -0.05, z: 0.1, signal: null }
      ],
      schedule: { opponents: ['BAL', 'PIT'], easierBy: -1.25 }
    }
    const v = outlookView(o, byId)
    expect(v.range[0]).toMatchObject({ season: '30.2', last16: '28.0' })
    expect(v.range[1].last16).toBe('—')
    expect(v.rates).toEqual([
      { label: 'Boom weeks', value: '50%' },
      { label: 'Bust weeks', value: '10%' }
    ])
    expect(v.trend).toEqual([
      {
        metric: 'target_share',
        label: 'Target share',
        season: '30.0%',
        last4: '36.0%',
        change: '+9.0%',
        flag: 'up'
      }
    ])
    expect(v.signals[0].text).toBe('Running hot: expect it to fall by about 18.0.')
    expect(v.signals[1].text).toBe('In line with what the position sustains.')
    expect(v.schedule).toBe(
      '2 games left. Their defenses allowed 1.3 fewer fantasy points per game to the position than average.'
    )

    const shrunk = result(
      ['target_share'],
      [row('p1', 'x', { target_share: value(0.25, { raw: 0.3 }) })]
    )
    expect(shrunkRows(shrunk, 'p1', byId)[0]).toMatchObject({ raw: '30.0%', shrunk: '25.0%' })

    const combine = combineView(
      result(
        ['forty', 'forty_score', 'height', 'height_score', 'ras', 'ras_measures', 'speed_score'],
        [
          row('p1', 'x', {
            forty: value(4.34),
            forty_score: value(9.5),
            height: value(72),
            height_score: value(null),
            ras: value(7.44),
            ras_measures: value(7),
            speed_score: value(112.6)
          })
        ]
      )
    )
    expect(combine.rows.find((r) => r.id === 'forty')).toMatchObject({
      value: '4.34 s',
      percentile: 95
    })
    expect(combine.rows.find((r) => r.id === 'height')).toMatchObject({
      value: '6′0″',
      percentile: null
    })
    expect(combine).toMatchObject({ ras: '7.4', measures: 7, speedScore: '113' })

    const cq = careerQuery(BIO, 'REC', scope, true)!
    expect(cq.scope).toEqual({
      seasons: [2021, 2022, 2025, 2026],
      seasonType: 'REG',
      players: ['p1']
    })
    const seasons = result(cq.metrics, [
      { ...row('p1', 'x', {}, { team: 'CIN' }), group: { season: 2021 } },
      { ...row('p1', 'x', {}, { team: 'KC' }), group: { season: 2026 } }
    ])
    expect(careerRows(seasons, 'REC', byId).map((r) => r.label)).toEqual(['2026 KC', '2021 CIN'])
    expect(careerQuery({ ...BIO, seasons: [] }, 'REC', scope, false)).toBeNull()

    const opp = result(
      ['receptions'],
      [
        { ...row('p1', 'x', { receptions: value(5) }), group: { opponent: 'PIT' } },
        { ...row('p1', 'x', { receptions: value(9) }), group: { opponent: 'BAL' } }
      ]
    )
    expect(opponentRows(opp, 'WR', byId).map((r) => r.label)).toEqual(['BAL', 'PIT'])

    const mates = result(
      ['off_snaps'],
      [
        row('p1', 'Me', { off_snaps: value(300) }),
        row('q', 'Quarterback', { off_snaps: value(310) }, { position: 'QB' }),
        row('z', 'Zero', { off_snaps: value(0) })
      ]
    )
    expect(teammateOptions(mates, 'p1')).toEqual([{ value: 'q', label: 'Quarterback (QB)' }])
    // Receivers and backs before the quarterback and the line.
    const more = result(
      ['off_snaps'],
      [
        row('t', 'Tackle', { off_snaps: value(400) }, { position: 'OL' }),
        row('q', 'Quarterback', { off_snaps: value(390) }, { position: 'QB' }),
        row('w', 'Wideout', { off_snaps: value(300) }, { position: 'WR' })
      ]
    )
    expect(teammateOptions(more, 'p1').map((o) => o.value)).toEqual(['w', 'q', 't'])
  })

  it('ranks the next opponent’s defense among the 32, skipping games played', () => {
    const games = [
      game({ week: 6, homeScore: 20, awayScore: 10 }),
      game({ gameId: '7', week: 7, home: 'BAL', away: 'CIN', gameday: '2026-10-25' })
    ]
    const defense = result(
      ['fpa_wr'],
      ['BAL', 'PIT', 'CLE'].map((t, i) =>
        row(t, t, { fpa_wr: value(20 + i) }, { team: t, position: null })
      )
    )
    const m = nextMatchup(games, 'CIN', defense, 'WR', byId, 2026, new Date('2026-10-21'))!
    expect(m).toMatchObject({ opponent: 'BAL', where: 'Away' })
    expect(m.when).toMatch(/^Week 7 · Sun, Oct 25/)
    // BAL allows the fewest: 1st of the 3, and bad news for a receiver (the handoff's tone).
    expect(m.lines[0]).toMatchObject({
      label: 'Fantasy points to WRs',
      value: '20.0',
      rank: '1st of 3',
      percentile: 0,
      heat: 'l3'
    })
    expect(nextMatchup(games, 'CIN', defense, 'WR', byId, 2026, new Date('2026-11-01'))).toBeNull()
  })

  it('reads the fantasy side’s projections, with a league', () => {
    const detail = {
      row: { rosPoints: 151.25, rosRank: 9, expert: { ecrPosRank: 7 } },
      weeks: [
        { week: 6, played: true, projected: 14 },
        { week: 7, played: false, projected: null, opponent: null },
        { week: 8, played: false, projected: 16.36, opponent: 'BAL' }
      ],
      schedule: []
    } as unknown as PlayerDetail
    expect(projectionView(detail, 'WR')).toEqual({
      next: { week: 8, opponent: 'BAL', points: '16.4' },
      ros: '151.3',
      rosRank: 'WR9',
      experts: 'WR7'
    })
  })
})
