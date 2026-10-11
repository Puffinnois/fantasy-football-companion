import { beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type Db } from '@main/db/connection'
import { migrate } from '@main/db/migrate'
import {
  getWhSourceState,
  listWhGames,
  listWhPlayers,
  listWhPlayerWeeks,
  listWhTeamWeeks,
  replaceWhGames,
  replaceWhPlayers,
  replaceWhPlayerWeeks,
  replaceWhTeamWeeks,
  setWhSourceState,
  upsertWhPlayersLatest,
  type WhData,
  type WhPlayer,
  type WhPlayerWeek,
  type WhTeamWeek
} from '@main/db/repos/warehouse'

const T = '2026-10-09T12:00:00.000Z'

function pw(source: string, season: number, week: number, data: WhData = {}): WhPlayerWeek {
  return {
    source,
    season,
    seasonType: 'REG',
    week,
    playerKey: '00-0034844',
    keyType: 'gsis',
    team: 'PHI',
    opponent: 'DAL',
    data
  }
}

function tw(source: string, season: number, team: string): WhTeamWeek {
  return { source, season, seasonType: 'REG', week: 1, team, opponent: null, data: { plays: 60 } }
}

function profile(source: string, playerKey: string, data: WhData): WhPlayer {
  return { source, playerKey, keyType: 'gsis', data }
}

describe('warehouse repo', () => {
  let db: Db

  beforeEach(() => {
    db = openDatabase(':memory:')
    migrate(db)
  })

  it('replaces player weeks of one source in the given seasons only', () => {
    replaceWhPlayerWeeks(db, 'a', [2024, 2025], [pw('a', 2024, 1), pw('a', 2025, 1)], T)
    replaceWhPlayerWeeks(db, 'b', [2025], [pw('b', 2025, 1)], T)
    const nested = { name: 'x', entries: [{ formation: 'Offense', rank: 1 }] }
    expect(replaceWhPlayerWeeks(db, 'a', [2025], [pw('a', 2025, 2, nested)], T)).toBe(1)
    expect(listWhPlayerWeeks(db, 'a', 2024)).toEqual([pw('a', 2024, 1)])
    expect(listWhPlayerWeeks(db, 'a', 2025)).toEqual([pw('a', 2025, 2, nested)])
    expect(listWhPlayerWeeks(db, 'b', 2025)).toHaveLength(1)
  })

  it('keeps the last row when a source repeats a key', () => {
    replaceWhPlayerWeeks(
      db,
      'a',
      [2025],
      [pw('a', 2025, 1, { n: 1 }), pw('a', 2025, 1, { n: 2 })],
      T
    )
    expect(listWhPlayerWeeks(db, 'a', 2025)).toEqual([pw('a', 2025, 1, { n: 2 })])
  })

  it('replaces team weeks of one source in the given seasons only', () => {
    replaceWhTeamWeeks(db, 'a', [2024], [tw('a', 2024, 'KC')], T)
    replaceWhTeamWeeks(db, 'a', [2025], [tw('a', 2025, 'PHI'), tw('a', 2025, 'DAL')], T)
    replaceWhTeamWeeks(db, 'a', [2025], [tw('a', 2025, 'LA')], T)
    expect(listWhTeamWeeks(db, 'a', 2025)).toEqual([tw('a', 2025, 'LA')])
    expect(listWhTeamWeeks(db, 'a', 2024)).toHaveLength(1)
  })

  it('replaces games of the given seasons', () => {
    replaceWhGames(
      db,
      [2024, 2025],
      [
        { gameId: 'g24', season: 2024, week: 1, data: { roof: 'dome' } },
        { gameId: 'g25', season: 2025, week: 1, data: {} }
      ],
      T
    )
    replaceWhGames(
      db,
      [2025],
      [{ gameId: 'g25b', season: 2025, week: 2, data: { spread_line: 3.5 } }],
      T
    )
    expect(listWhGames(db, 2024).map((g) => g.gameId)).toEqual(['g24'])
    expect(listWhGames(db, 2025)).toEqual([
      { gameId: 'g25b', season: 2025, week: 2, data: { spread_line: 3.5 } }
    ])
  })

  it('replaces every profile of a source', () => {
    replaceWhPlayers(db, 'combine', [profile('combine', 'A', { forty: 4.4 })], T)
    replaceWhPlayers(db, 'combine', [profile('combine', 'B', { forty: 4.5 })], T)
    expect(listWhPlayers(db, 'combine')).toEqual([profile('combine', 'B', { forty: 4.5 })])
  })

  it('keeps the newest roster profile (by data.as_of)', () => {
    upsertWhPlayersLatest(
      db,
      'rosters',
      [profile('rosters', 'P', { as_of: 202602, weight: 233 })],
      T
    )
    upsertWhPlayersLatest(
      db,
      'rosters',
      [profile('rosters', 'P', { as_of: 202518, weight: 230 })],
      T
    )
    expect(listWhPlayers(db, 'rosters')[0].data.weight).toBe(233)
    upsertWhPlayersLatest(
      db,
      'rosters',
      [profile('rosters', 'P', { as_of: 202603, weight: 235 })],
      T
    )
    expect(listWhPlayers(db, 'rosters')[0].data.weight).toBe(235)
  })

  it('round-trips source state', () => {
    expect(getWhSourceState(db, 'a', 2024)).toBeNull()
    setWhSourceState(db, {
      source: 'a',
      season: 2024,
      version: 1,
      rows: 5,
      fetchedAt: T,
      sealed: false
    })
    setWhSourceState(db, {
      source: 'a',
      season: 2024,
      version: 2,
      rows: 6,
      fetchedAt: T,
      sealed: true
    })
    expect(getWhSourceState(db, 'a', 2024)).toEqual({
      source: 'a',
      season: 2024,
      version: 2,
      rows: 6,
      fetchedAt: T,
      sealed: true
    })
  })
})
