import { beforeEach, describe, expect, it } from 'vitest'
import { type Db } from '@main/db/connection'
import { leagueRosterPositions } from '@main/db/repos/leagues'
import {
  listMatchups,
  matchupsWeekUpdatedAt,
  replaceMatchupsWeek,
  type MatchupRecord
} from '@main/db/repos/matchups'
import { listStarterIndexes } from '@main/db/repos/teams'
import { seedLeague } from '../../fixtures/db'

const T1 = '2026-09-20T10:00:00.000Z'
const T2 = '2026-09-20T11:00:00.000Z'

const rec = (
  rosterId: number,
  points: number,
  starters: string[] = ['a', '0', 'b']
): MatchupRecord => ({
  rosterId,
  matchupId: 1,
  starters,
  players: [...starters.filter((s) => s !== '0'), 'c'],
  points
})

describe('matchups repo', () => {
  let db: Db
  beforeEach(() => {
    db = seedLeague()
  })

  it('replaces one week at a time and lists by week then roster', () => {
    expect(replaceMatchupsWeek(db, 'L1', 2026, 1, [rec(2, 90), rec(1, 100)], T1)).toBe(2)
    replaceMatchupsWeek(db, 'L1', 2026, 2, [rec(1, 0)], T1)
    const rows = listMatchups(db, 'L1', 2026)
    expect(rows.map((r) => [r.week, r.rosterId, r.points])).toEqual([
      [1, 1, 100],
      [1, 2, 90],
      [2, 1, 0]
    ])
    expect(rows[0]).toMatchObject({
      matchupId: 1,
      starters: ['a', '0', 'b'],
      players: ['a', 'b', 'c'],
      updatedAt: T1
    })
    replaceMatchupsWeek(db, 'L1', 2026, 1, [rec(1, 101)], T2)
    expect(listMatchups(db, 'L1', 2026).filter((r) => r.week === 1)).toHaveLength(1)
    replaceMatchupsWeek(db, 'L1', 2026, 2, [], T2)
    expect(listMatchups(db, 'L1', 2026).map((r) => r.week)).toEqual([1])
  })

  it('reports when a week was last written', () => {
    expect(matchupsWeekUpdatedAt(db, 'L1', 2026, 1)).toBeNull()
    replaceMatchupsWeek(db, 'L1', 2026, 1, [rec(1, 100)], T1)
    expect(matchupsWeekUpdatedAt(db, 'L1', 2026, 1)).toBe(T1)
    expect(matchupsWeekUpdatedAt(db, 'L1', 2025, 1)).toBeNull()
  })

  it('exposes the current starters by slot index and the raw roster_positions', () => {
    // Fixture roster 1: starters ['4866', '6794', '0', 'LAR'] → index 2 is empty.
    expect(listStarterIndexes(db, 'L1').get(1)).toEqual(['4866', '6794', null, 'LAR'])
    expect(listStarterIndexes(db, 'L1').get(2)).toEqual(['7564'])
    expect(leagueRosterPositions(db, 'L1')).toEqual([
      'QB',
      'RB',
      'RB',
      'WR',
      'WR',
      'TE',
      'FLEX',
      'K',
      'DEF',
      'BN',
      'BN',
      'BN',
      'BN',
      'BN',
      'BN',
      'IR'
    ])
    expect(leagueRosterPositions(db, 'nope')).toBeNull()
  })
})
