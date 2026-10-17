import { describe, expect, it } from 'vitest'
import { compileQuery, StatsQueryError } from '@main/stats/engine/compile'
import type { StatsQuery } from '@shared/stats/types'

const CTX = { currentSeason: 2026, hasLeague: false }
const base: StatsQuery = { entity: 'player', metrics: ['targets'], scope: { seasons: [2025] } }
const compile = (q: Partial<StatsQuery>): ReturnType<typeof compileQuery> =>
  compileQuery({ ...base, ...q } as StatsQuery, CTX)
const refuses = (q: Partial<StatsQuery>, message: string | RegExp): void => {
  expect(() => compile(q)).toThrow(StatsQueryError)
  expect(() => compile(q)).toThrow(message)
}

describe('compileQuery (stats-analysis spec §7.2)', () => {
  it('refuses what the catalogue does not allow, with a readable message', () => {
    refuses({ metrics: ['nope'] }, 'unknown metric "nope"')
    refuses({ metrics: ['off_epa_play'] }, '"off_epa_play" is a team metric, not a player one')
    refuses({ metrics: [] }, 'metrics must list 1–40 catalogue ids')
    refuses({ metrics: ['targets', 'targets'] }, 'metrics must not repeat')
    refuses({ scope: { seasons: [2018] } }, 'scope.seasons must be whole numbers from 2019 to 2026')
    refuses({ scope: { seasons: [2025], weeks: [5, 2] } }, 'scope.weeks must be [min, max]')
    refuses({ scope: { seasons: [2025], positions: ['XX' as 'QB'] } }, /unknown position "XX"/)
    refuses({ scope: { seasons: [2025], teams: ["KC'; DROP"] } }, /is not valid/)
    refuses({ scoring: 'league' }, 'scoring "league" needs an imported league')
    refuses({ sort: { metric: 'carries', dir: 'desc' } }, 'sort.metric must be one of the metrics')
    refuses({ metrics: ['separation'], situation: { down: [3] } }, /cannot be split by situation/)
    refuses(
      { situation: { pressure: true }, scope: { seasons: [2025], lastNGames: 3 } },
      /lastNGames/
    )
    refuses({ limit: 5000 }, 'limit must be whole numbers from 1 to 1000')
  })

  it('reads the season tables, the weekly ones, or the plays, as the query needs', () => {
    expect(compile({}).grain).toBe('season')
    expect(compile({ groupBy: ['season'] }).grain).toBe('season')
    expect(compile({ scope: { seasons: [2025], weeks: [1, 4] } }).grain).toBe('week')
    expect(compile({ scope: { seasons: [2025], lastNGames: 4 } }).grain).toBe('week')
    expect(compile({ groupBy: ['team'] }).grain).toBe('week')
    // A traded player's season row holds both teams' games: a team filter reads the weeks.
    expect(compile({ scope: { seasons: [2025], teams: ['KC'] } }).grain).toBe('week')
    expect(compile({ situation: { down: [3] } }).grain).toBe('play')
    expect(compile({ groupBy: ['personnel'] }).grain).toBe('play')
    expect(compile({}).sql).toContain('FROM player_season w')
    expect(compile({ groupBy: ['week'] }).sql).toContain('FROM player_week w')
  })

  it('binds every value the query carries, and splices none into the SQL', () => {
    const c = compile({
      scope: { seasons: [2024, 2025], teams: ['DET'], positions: ['WR'], weeks: [3, 9] },
      situation: { coverage: ['COVER_3'], personnel: ['11'], withOnField: ['00-0012345'] }
    })
    for (const v of ['DET', 'COVER_3', '00-0012345', "'11'", 'WR']) expect(c.sql).not.toContain(v)
    expect(c.params).toEqual(
      expect.arrayContaining(['DET', 'COVER_3', '11', '00-0012345', 'WR', 2024, 2025, 3, 9])
    )
  })

  it('scales the qualification sample to the weeks a row covers', () => {
    expect(compile({}).rowWeeks(18, 1)).toBe(18)
    expect(compile({ groupBy: ['season'] }).rowWeeks(36, 2)).toBe(18)
    expect(compile({ groupBy: ['week'] }).rowWeeks(18, 1)).toBe(1)
    expect(compile({ scope: { seasons: [2025], lastNGames: 4 } }).rowWeeks(18, 1)).toBe(4)
    // A team meets an opponent about once a season.
    expect(compile({ groupBy: ['opponent'] }).rowWeeks(18, 1)).toBe(1)
    expect(
      compile({ scope: { seasons: [2024, 2025] }, groupBy: ['opponent'] }).rowWeeks(36, 2)
    ).toBe(2)
    expect(compile({ scope: { seasons: [2025], opponents: ['DET', 'GB'] } }).rowWeeks(18, 1)).toBe(
      2
    )
  })

  it('notes coverage the answer depends on', () => {
    expect(compile({ metrics: ['tprr_man'], scope: { seasons: [2025, 2026] } }).notes).toEqual([
      'TPRR vs man: published through 2025.'
    ])
    expect(compile({ metrics: ['drops'], scope: { seasons: [2021] } }).notes).toEqual([
      'Drops: starts in 2022.'
    ])
    expect(compile({ situation: { blitz: true } }).notes).toEqual([
      'Blitz and play-action filters use FTN charting, which starts in 2022.'
    ])
  })
})
