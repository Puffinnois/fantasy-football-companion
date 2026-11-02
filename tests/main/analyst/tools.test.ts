import { describe, expect, it } from 'vitest'
import type { StatsCard, ToolError, ToolResult } from '@shared/ask'
import type { Rules } from '@shared/rules'
import type { GameForecast, StatsQuery, StatsRow } from '@shared/stats/types'
import type { LeagueReader } from '@main/analyst/league'
import { splitStat, spreadOf } from '@main/analyst/splits'
import { type AnalystStats, createAnalyst } from '@main/analyst/tools'
import { catalogueInfo } from '@main/stats/engine/registry'
import { PEOPLE, statsResult, statsRow } from '../../fixtures/analyst'

const CHASE = '00-0036900'
const BIJAN = '00-0038542'

/** A fake engine: records each query and answers from `answer`. */
function fake(answer: (q: StatsQuery) => StatsRow[] = () => []): {
  stats: AnalystStats
  queries: StatsQuery[]
} {
  const queries: StatsQuery[] = []
  const stability = new Map([
    [
      'yprr',
      { yearToYear: 0.6, pairs: 9, splitHalf: 0.7, prior: 300, reliability: 'high' as const }
    ]
  ])
  const game = (week: number, home: string, away: string): GameForecast => ({
    gameId: `2026_${week}_${away}_${home}`,
    season: 2026,
    seasonType: 'REG',
    week,
    gameday: null,
    kickoff: null,
    home,
    away,
    neutral: false,
    homeScore: null,
    awayScore: null,
    homeElo: 1550,
    awayElo: 1500,
    homeWinProb: 0.62,
    eloSpread: -3,
    vegasHomeWinProb: null,
    spread: 3.5,
    total: 47.5,
    roof: null,
    temp: null,
    wind: null
  })
  const stats: AnalystStats = {
    status: async () => ({
      available: true,
      through: { season: 2026, seasonType: 'REG', week: 7 },
      updatedAt: '2026-10-27T00:00:00Z',
      busy: false
    }),
    catalogue: async () => catalogueInfo(stability),
    people: async () => PEOPLE,
    query: async (q) => {
      queries.push(q)
      return statsResult(answer(q))
    },
    games: async (q) => [game(q.weeks?.[0] ?? 1, 'GB', 'CAR')],
    outlook: async () => {
      throw new Error('not in this test')
    },
    player: async () => {
      throw new Error('not in this test')
    }
  }
  return { stats, queries }
}

const run = async (
  name: string,
  args: unknown,
  stats = fake(),
  league: LeagueReader | null = null
): Promise<{ out: ToolResult | ToolError; queries: StatsQuery[] }> => {
  const analyst = createAnalyst({ stats: stats.stats, league: () => league })
  const turn = await analyst.turn()
  return { out: await analyst.run(name, args, turn), queries: stats.queries }
}
const ok = (o: ToolResult | ToolError): ToolResult => {
  if (!o.ok) throw new Error(o.error)
  return o
}
const err = (o: ToolResult | ToolError): string => {
  if (o.ok) throw new Error('expected an error')
  return o.error
}

describe('errors teach (Ask spec §3.3)', () => {
  it('says what is wrong and what was probably meant', async () => {
    expect(err((await run('leaderboard', { metric: 'yards per route' })).out)).toMatch(
      /did you mean yprr \(Yards per route run\)/
    )
    expect(err((await run('player_stats', { player: 'Bijan' })).out)).toBe(
      'arguments.player is not valid ("Bijan"). "Bijan" matched 00-0038542 Bijan Robinson (RB, ATL).'
    )
    expect(err((await run('leaderboard', { metric: 'yprr', position: 'QB' })).out)).toBe(
      'yprr applies to RB, WR, TE, not QB; use one of those positions'
    )
    expect(err((await run('leaderboard', { metric: 'yprr', player: CHASE })).out)).toMatch(
      /arguments.player is not an argument; the arguments are metric, also, position/
    )
    expect(err((await run('chart', {})).out)).toMatch(
      /^there is no tool "chart"; the tools are find,/
    )
    expect(err((await run('team_stats', { team: 'Ravens' })).out)).toMatch(
      /"Ravens" is the team BAL/
    )
  })
})

describe('leaderboard', () => {
  it('builds one query with the app’s defaults, and reads its rows best first', async () => {
    const stats = fake(() => [
      statsRow(CHASE, "Ja'Marr Chase", {
        yprr: { raw: 2.45, sample: 210, percentile: 97, rank: 1 }
      }),
      statsRow(
        '00-0036358',
        'CeeDee Lamb',
        { yprr: { raw: 2.1, sample: 180, percentile: 90, rank: 2 } },
        { team: 'DAL' }
      )
    ])
    const { out, queries } = await run(
      'leaderboard',
      { metric: 'yprr', position: 'WR', weeks: [5, 7], third_down: true, red_zone: true },
      stats
    )
    expect(queries).toEqual([
      {
        entity: 'player',
        metrics: ['yprr'],
        scope: { seasons: [2026], weeks: [5, 7], positions: ['WR'], qualifiedOnly: true },
        situation: { down: [3], fieldZone: 'redzone' },
        limit: 10
      }
    ])
    const r = ok(out)
    expect(r.text.split('\n')).toEqual([
      'Yards per route run (yprr), WR, 2026 weeks 5–7, down 3, red zone: best first, qualified only.',
      "1. Ja'Marr Chase (00-0036900, WR, CIN) — YPRR 2.45 on 210 routes, 97th pct",
      '2. CeeDee Lamb (00-0036358, WR, DAL) — YPRR 2.10 on 180 routes, 90th pct'
    ])
    expect((r.cards[0] as StatsCard).chart).toBe('bar')
    expect(r.queries).toEqual(queries)
  })

  it('reads the last games as the latest weeks when a situation needs the plays', async () => {
    const { out, queries } = await run('leaderboard', {
      metric: 'targets',
      red_zone: true,
      last_games: 3
    })
    expect(queries[0].scope).toEqual({ seasons: [2026], weeks: [5, 7], qualifiedOnly: true })
    expect(ok(out).notes).toContain(
      'Situation filters and play splits cannot use each player’s own last 3 games: weeks 5–7 of 2026 instead.'
    )
    const split = await run('player_stats', {
      player: BIJAN,
      by: 'down',
      last_games: 2,
      metrics: ['carries']
    })
    expect(
      split.queries.every(
        (q) => q.scope.lastNGames === undefined && q.scope.weeks?.join() === '6,7'
      )
    ).toBe(true)
  })

  it('writes values as the transform shapes them: per game, percentile, z-score', async () => {
    const one =
      (values: Record<string, { raw: number }>): AnalystStats['query'] =>
      async () =>
        statsResult([statsRow(CHASE, "Ja'Marr Chase", values)])
    const perGame = fake()
    perGame.stats.query = one({ receptions: { raw: 6.43 } })
    expect(
      ok((await run('leaderboard', { metric: 'receptions', per_game: true }, perGame)).out).text
    ).toContain('Rec 6.4')
    const pct = fake()
    pct.stats.query = one({ catch_rate: { raw: 85.3 } })
    const q = { entity: 'player', metrics: ['catch_rate'], scope: { seasons: [2025] } }
    expect(
      ok((await run('query', { query: { ...q, transform: 'percentile' } }, pct)).out).text
    ).toMatch(/Ctch% 85$/m)
    const z = fake()
    z.stats.query = one({ catch_rate: { raw: -1.2 } })
    expect(
      ok((await run('query', { query: { ...q, transform: 'zScore' } }, z)).out).text
    ).toContain('Ctch% -1.20')
  })

  it('ranks a team metric among all 32 and points out the team asked about', async () => {
    const teams = ['KC', 'DET', 'BAL', 'BUF', 'SF'].map((t, i) =>
      statsRow(t, t, {
        off_epa_play: { raw: 0.2 - i * 0.02, rank: i + 1, percentile: 100 - i * 20 }
      })
    )
    const { out, queries } = await run(
      'leaderboard',
      { metric: 'off_epa_play', team: 'BUF', limit: 2 },
      fake(() => teams)
    )
    expect(queries[0].scope.teams).toBeUndefined()
    const lines = ok(out).text.split('\n')
    expect(lines.slice(1, 4)).toEqual([
      '1. Kansas City Chiefs (KC) — EPA/play +0.200, 100th pct',
      '2. Detroit Lions (DET) — EPA/play +0.180, 80th pct',
      '4. Buffalo Bills (BUF) — EPA/play +0.140, 40th pct'
    ])
    expect(ok(out).notes).toContain('Buffalo Bills (BUF) ranks 4th of 5.')
  })

  it('reads the postseason when asked', async () => {
    const { out, queries } = await run('leaderboard', {
      metric: 'rush_yds',
      season_type: 'POST',
      seasons: [2025]
    })
    expect(queries[0].scope).toEqual({ seasons: [2025], seasonType: 'POST', qualifiedOnly: true })
    expect(ok(out).title).toBe(
      'Rushing yards (rush_yds), 2025 postseason: best first, qualified only.'
    )
  })

  it('sorts the other way for the worst, and refuses a position on a team metric', async () => {
    const { queries } = await run('leaderboard', { metric: 'def_rush_epa', order: 'worst' })
    expect(queries[0]).toMatchObject({
      entity: 'team',
      sort: { metric: 'def_rush_epa', dir: 'desc' }
    })
    expect(err((await run('leaderboard', { metric: 'def_rush_epa', position: 'DL' })).out)).toBe(
      'def_rush_epa is a team metric; leave out position'
    )
  })

  it('says when every qualified row is rostered', async () => {
    const league: LeagueReader = {
      teams: () => [],
      roster: () => [],
      ownership: () => ({ players: { [CHASE]: { name: 'Mine', mine: true } }, teams: {} }),
      rules: () => null
    }
    const rows = [statsRow(CHASE, "Ja'Marr Chase", { yprr: { raw: 2.4, rank: 1 } })]
    const r = ok(
      (
        await run(
          'leaderboard',
          { metric: 'yprr', rostered: 'free' },
          fake(() => rows),
          league
        )
      ).out
    )
    expect(r.notes.at(-1)).toBe(
      'Every qualified row is rostered in the league: no free agent qualifies.'
    )
  })

  it('explains an empty ranking from the rows below the minimum', async () => {
    const stats = fake((q) =>
      q.scope.qualifiedOnly
        ? []
        : [statsRow(CHASE, "Ja'Marr Chase", { yprr: { raw: 3, sample: 12, qualified: false } })]
    )
    const r = ok((await run('leaderboard', { metric: 'yprr', weeks: [7, 7] }, stats)).out)
    expect(r.notes.at(-1)).toMatch(
      /^No qualified rows: 1 below the minimum sample \(150 routes over 17 games, scaled to the weeks in scope\)\. The best unqualified: Ja'Marr Chase on 12 routes\./
    )
  })

  it('keeps only free agents, or my players, with a league; refuses either without one', async () => {
    const league: LeagueReader = {
      teams: () => [],
      roster: () => [],
      ownership: () => ({
        players: {
          [CHASE]: { name: 'Mine', mine: true },
          '00-0036358': { name: 'Other', mine: false }
        },
        teams: {}
      }),
      rules: () => null
    }
    const rows = [
      statsRow(CHASE, "Ja'Marr Chase", { yprr: { raw: 2.4, rank: 1 } }),
      statsRow('00-0036358', 'CeeDee Lamb', { yprr: { raw: 2.2, rank: 2 } }),
      statsRow('00-0039075', 'Puka Nacua', { yprr: { raw: 2.0, rank: 3 } })
    ]
    const free = await run(
      'leaderboard',
      { metric: 'yprr', rostered: 'free' },
      fake(() => rows),
      league
    )
    expect(free.queries[0].limit).toBe(300)
    expect((ok(free.out).cards[0] as StatsCard).result.rows.map((r) => r.id)).toEqual([
      '00-0039075'
    ])
    const mine = await run(
      'leaderboard',
      { metric: 'yprr', rostered: 'mine' },
      fake(() => rows),
      league
    )
    expect(mine.queries[0].scope.players).toEqual([CHASE])
    expect(err((await run('leaderboard', { metric: 'yprr', rostered: 'free' })).out)).toBe(
      'no league is imported, so rostered cannot be used'
    )
  })
})

describe('player_stats and team_stats', () => {
  it('reads a line from the league query, so its percentiles are among his position', async () => {
    const stats = fake(() => [
      statsRow('00-0036358', 'CeeDee Lamb', { targets: { raw: 50, percentile: 90 } }),
      statsRow(CHASE, "Ja'Marr Chase", { targets: { raw: 61, percentile: 99 } })
    ])
    const { out, queries } = await run(
      'player_stats',
      { player: CHASE, metrics: ['targets'], seasons: [2025] },
      stats
    )
    expect(queries).toEqual([
      {
        entity: 'player',
        metrics: ['targets'],
        scope: { seasons: [2025], positions: ['WR'], qualifiedOnly: false },
        limit: 5000
      }
    ])
    expect(ok(out).text.split('\n')[1]).toBe(
      'Tgt 61, 99th pct (percentiles among WRs, qualified rows only)'
    )
  })

  it('ranks a player among the position he played in that scope, not his latest', async () => {
    // Chase Brown is an RB now; say he played WR in 2025.
    const brown = '00-0037200'
    const stats = fake((q) => {
      if (q.scope.players)
        return [statsRow(brown, 'Chase Brown', { targets: { raw: 40 } }, { position: 'WR' })]
      if (q.scope.positions?.includes('WR')) {
        return [
          statsRow(
            brown,
            'Chase Brown',
            { targets: { raw: 40, percentile: 60 } },
            { position: 'WR' }
          )
        ]
      }
      return []
    })
    const { out, queries } = await run(
      'player_stats',
      { player: brown, metrics: ['targets'], seasons: [2025] },
      stats
    )
    expect(queries.map((q) => q.scope.positions ?? q.scope.players)).toEqual([
      ['RB'],
      [brown],
      ['WR']
    ])
    expect(ok(out).text).toContain('Tgt 40, 60th pct (percentiles among WRs')
    const compared = await run(
      'compare',
      { ids: [brown, CHASE], metrics: ['targets'], seasons: [2025] },
      stats
    )
    expect((ok(compared.out).cards[0] as StatsCard).result.rows.map((r) => r.id)).toContain(brown)
  })

  it('splits against the base: a difference, and whether it is beyond noise', async () => {
    const qualified = Array.from({ length: 10 }, (_, i) =>
      statsRow(`00-00400${10 + i}`, `WR ${i}`, { yprr: { raw: 1.5 + i * 0.1, sample: 400 } })
    )
    const stats = fake((q) =>
      q.groupBy
        ? [
            statsRow(
              CHASE,
              "Ja'Marr Chase",
              { yprr: { raw: 1.8, sample: 210 } },
              { group: { coverage: 'man' } }
            ),
            statsRow(
              CHASE,
              "Ja'Marr Chase",
              { yprr: { raw: 2.4, sample: 416 } },
              { group: { coverage: 'zone' } }
            ),
            statsRow(
              CHASE,
              "Ja'Marr Chase",
              { yprr: { raw: null, sample: 0 } },
              { group: { coverage: null } }
            )
          ]
        : [...qualified, statsRow(CHASE, "Ja'Marr Chase", { yprr: { raw: 2.26, sample: 626 } })]
    )
    const { out, queries } = await run(
      'player_stats',
      { player: CHASE, metrics: ['yprr'], by: 'coverage', seasons: [2025] },
      stats
    )
    expect(queries.map((q) => q.groupBy ?? null)).toEqual([null, ['coverage']])
    const r = ok(out)
    expect(r.text.split('\n').slice(1)).toEqual([
      'All: YPRR 2.26 on 626 routes',
      'vs man: YPRR 1.80 on 210 routes (-0.46 vs all, beyond noise)',
      'vs zone: YPRR 2.40 on 416 routes (+0.14 vs all, within noise)'
    ])
    const card = r.cards[0] as StatsCard
    expect(card.base?.values.yprr.raw).toBe(2.26)
    expect(card.splits?.man.yprr.withinNoise).toBe(false)
    expect(card.result.rows).toHaveLength(2)
  })

  it('counts the splits of a turn and says so from the third', async () => {
    const stats = fake((q) =>
      q.groupBy
        ? [statsRow('BAL', 'BAL', { off_epa_play: { raw: 0.1 } }, { group: { week: 1 } })]
        : []
    )
    const analyst = createAnalyst({ stats: stats.stats, league: () => null })
    const turn = await analyst.turn()
    let last: ToolResult | null = null
    for (let i = 0; i < 3; i++) {
      last = ok(
        await analyst.run(
          'team_stats',
          { team: 'BAL', metrics: ['off_epa_play'], by: 'week', weeks: [1, i + 1] },
          turn
        )
      )
    }
    expect(last!.notes.at(-1)).toBe(
      'This is split 3 looked at in this answer; with many splits, one will look unusual by chance.'
    )
  })

  it('defaults to his position’s metrics that can be split by situation', async () => {
    const { queries } = await run('player_stats', { player: BIJAN, red_zone: true })
    expect(queries[0].metrics).toEqual(['carries', 'rush_yds', 'rush_ypc', 'targets', 'rec_yds'])
    expect(err((await run('player_stats', { player: BIJAN, metrics: ['def_rush_epa'] })).out)).toBe(
      'def_rush_epa is a team metric; use team_stats'
    )
  })
})

describe('the split statistics (report D5)', () => {
  it('give an interval from the prior, the qualified spread and the two samples', () => {
    const rows = Array.from({ length: 6 }, (_, i) =>
      statsRow(`p${i}`, `p${i}`, { m: { raw: i, sample: 100 } })
    )
    const spread = spreadOf(rows, 'm')!
    expect(spread).toEqual({ variance: 3.5, meanSample: 100 })
    const value = (raw: number, sample: number): StatsRow['values'][string] =>
      statsRow('x', 'x', { m: { raw, sample } }).values.m
    // σ²_t = 3.5 / (1 + 100/100) = 1.75; σ²_u = 175; SE = sqrt(175 · (1/50 − 1/200)) ≈ 1.62.
    const s = splitStat(
      {
        kind: 'rate',
        stability: { yearToYear: 0.5, pairs: 5, splitHalf: 0.5, prior: 100, reliability: 'medium' }
      },
      value(5, 50),
      value(2, 200),
      spread
    )
    expect(s.diff).toBe(3)
    expect(s.interval![0]).toBeCloseTo(3 - 1.96 * Math.sqrt(175 * (1 / 50 - 1 / 200)), 6)
    expect(s.withinNoise).toBe(true)
    expect(
      splitStat({ kind: 'count', stability: null }, value(5, 50), value(2, 200), spread)
    ).toEqual({
      diff: 3,
      interval: null,
      withinNoise: null
    })
  })
})

describe('compare, trend, games, describe, league, find', () => {
  it('compare reads the players from one query among their positions, in the order asked', async () => {
    const stats = fake(() => [
      statsRow('00-0039075', 'Puka Nacua', { yprr: { raw: 2.6, percentile: 98 } }, { team: 'LA' }),
      statsRow(CHASE, "Ja'Marr Chase", { yprr: { raw: 2.3, percentile: 90 } })
    ])
    const { out, queries } = await run(
      'compare',
      { ids: [CHASE, '00-0039075'], metrics: ['yprr'] },
      stats
    )
    expect(queries[0]).toEqual({
      entity: 'player',
      metrics: ['yprr'],
      scope: { seasons: [2026], positions: ['WR'], qualifiedOnly: false },
      limit: 5000
    })
    expect((ok(out).cards[0] as StatsCard).result.rows.map((r) => r.id)).toEqual([
      CHASE,
      '00-0039075'
    ])
    expect(err((await run('compare', { ids: [CHASE, 'BAL'] })).out)).toBe(
      'ids must be all player ids or all team codes'
    )
  })

  it('trend splits one id by season from his first season, as a line', async () => {
    const { out, queries } = await run('trend', { id: '00-0034857', metric: 'qb_epa_db' })
    expect(queries[0]).toEqual({
      entity: 'player',
      metrics: ['qb_epa_db'],
      scope: {
        seasons: [2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026],
        players: ['00-0034857'],
        qualifiedOnly: false
      },
      groupBy: ['season'],
      limit: 50
    })
    expect((ok(out).cards[0] as StatsCard).chart).toBe('line')
  })

  it('games default to next week', async () => {
    const r = ok((await run('games', {})).out)
    expect(r.text.split('\n')).toEqual([
      'Games, 2026 week 8.',
      'Week 8: CAR @ GB. Elo: GB 62%, spread GB −3.5, total 47.5.'
    ])
  })

  it('describe reads a metric or a dimension, and suggests ids for anything else', async () => {
    const m = ok((await run('describe', { metric: 'yprr' })).out)
    expect(m.text).toContain('Stability: year-to-year r 0.60 (high), half signal at 300 routes.')
    const d = ok((await run('describe', { metric: 'pressure' })).out)
    expect(d.text).toContain('Seasons: 2019 to the prior season.')
    expect(err((await run('describe', { metric: 'yards per route' })).out)).toMatch(
      /^"yards per route" is not a metric id; did you mean yprr/
    )
  })

  it('league reads the scoring, an owner and my roster; without a league it says so', async () => {
    const rules = {
      scoring: {
        rec: 0.5,
        pass_yd: 0.04,
        pass_td: 4,
        pass_int: -2,
        rush_yd: 0.1,
        rush_td: 6,
        rec_yd: 0.1,
        rec_td: 6,
        fum_lost: -2
      },
      positionOverrides: { TE: { rec: 1 } }
    } as unknown as Rules
    const league: LeagueReader = {
      teams: () => [{ rosterId: 1, name: 'Puffins', mine: true }],
      roster: () => [
        { name: "Ja'Marr Chase", position: 'WR', team: 'CIN', slot: 'starter', gsis: CHASE }
      ],
      ownership: () => ({ players: { [CHASE]: { name: 'Puffins', mine: true } }, teams: {} }),
      rules: () => rules
    }
    expect(
      ok((await run('league', { what: 'scoring' }, fake(), league)).out).text.split('\n')
    ).toEqual([
      'League scoring.',
      'Format: HALF (0.5 per reception)',
      'Passing: 1 per 25 yards, 4 per TD, -2 per interception',
      'Rushing: 1 per 10 yards, 6 per TD',
      'Receiving: 1 per 10 yards, 6 per TD',
      'Fumbles lost: -2',
      'TE premium: 1 per reception'
    ])
    expect(
      ok((await run('league', { what: 'owner_of', player: CHASE }, fake(), league)).out).text
    ).toContain("Ja'Marr Chase is on Puffins (your team).")
    expect(ok((await run('league', { what: 'my_roster' }, fake(), league)).out).text).toContain(
      "starter: Ja'Marr Chase (00-0036900), WR, CIN"
    )
    expect(err((await run('league', { what: 'scoring' })).out)).toBe(
      'no league is imported; league data is not available'
    )
  })

  it('find names players, teams and metrics', async () => {
    const r = ok((await run('find', { text: 'Niners CMC yards after contact' })).out)
    expect(r.text).toContain('Player: Christian McCaffrey = 00-0033280 (RB, SF)')
    expect(r.text).toContain('Team: San Francisco 49ers = SF')
    expect(r.text).toContain('Metric: yac_att = Yards after contact per carry')
  })
})

describe('the analyst (Ask spec §5.3)', () => {
  it('answers a repeated query from its cache', async () => {
    const stats = fake(() => [statsRow(CHASE, "Ja'Marr Chase", { yprr: { raw: 2, rank: 1 } })])
    const analyst = createAnalyst({ stats: stats.stats, league: () => null })
    const turn = await analyst.turn()
    const first = ok(await analyst.run('leaderboard', { metric: 'yprr' }, turn))
    const second = ok(await analyst.run('leaderboard', { metric: 'yprr' }, turn))
    expect([first.cached, second.cached]).toEqual([false, true])
    expect(stats.queries).toHaveLength(1)
  })

  it('reads the warehouse again, and forgets its cache, when the warehouse changes', async () => {
    const stats = fake(() => [statsRow(CHASE, "Ja'Marr Chase", { yprr: { raw: 2, rank: 1 } })])
    let updatedAt = '2026-10-27T00:00:00Z'
    let people = 0
    const status = stats.stats.status
    stats.stats.status = async () => ({ ...(await status()), updatedAt })
    const read = stats.stats.people
    stats.stats.people = async () => {
      people++
      return read()
    }
    const analyst = createAnalyst({ stats: stats.stats, league: () => null })
    await analyst.run('leaderboard', { metric: 'yprr' }, await analyst.turn())
    await analyst.run('leaderboard', { metric: 'yprr' }, await analyst.turn())
    expect([people, stats.queries.length]).toEqual([1, 1])
    updatedAt = '2026-11-03T00:00:00Z'
    const after = ok(await analyst.run('leaderboard', { metric: 'yprr' }, await analyst.turn()))
    expect([people, stats.queries.length, after.cached]).toEqual([2, 2, false])
  })

  it('forgets its cache when the league’s scoring changes', async () => {
    const stats = fake(() => [
      statsRow(CHASE, "Ja'Marr Chase", { fantasy_ppg: { raw: 18, rank: 1 } })
    ])
    let rec = 1
    const league = (): LeagueReader => ({
      teams: () => [],
      roster: () => [],
      ownership: () => ({ players: {}, teams: {} }),
      rules: () => ({ scoring: { rec }, positionOverrides: {} }) as unknown as Rules
    })
    const analyst = createAnalyst({ stats: stats.stats, league })
    await analyst.run('leaderboard', { metric: 'fantasy_ppg' }, await analyst.turn())
    rec = 0.5
    const after = ok(
      await analyst.run('leaderboard', { metric: 'fantasy_ppg' }, await analyst.turn())
    )
    expect([stats.queries.length, after.cached]).toEqual([2, false])
  })

  it('needs a built warehouse', async () => {
    const stats = fake()
    stats.stats.status = async () => ({
      available: true,
      through: null,
      updatedAt: null,
      busy: true
    })
    await expect(createAnalyst({ stats: stats.stats, league: () => null }).turn()).rejects.toThrow(
      'the stats are still being built'
    )
  })
})
