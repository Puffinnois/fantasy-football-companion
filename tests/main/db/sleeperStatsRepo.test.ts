import { beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type Db } from '@main/db/connection'
import { migrate } from '@main/db/migrate'
import {
  listSleeperStats,
  listSleeperStatsBySeason,
  listSleeperStatsByWeek,
  replaceSleeperStats,
  type SleeperStatsRecord
} from '@main/db/repos/sleeperStats'

const line = (playerId: string, season: number, week: number, rec: number): SleeperStatsRecord => ({
  playerId,
  season,
  week,
  team: 'PHI',
  opponent: 'DAL',
  stats: { gp: 1, rec }
})

describe('sleeper_week_stats repo', () => {
  let db: Db
  beforeEach(() => {
    db = openDatabase(':memory:')
    migrate(db)
  })

  it('replaces one week at a time and reads by week, season or all', () => {
    replaceSleeperStats(db, 2026, 1, [line('a', 2026, 1, 1), line('b', 2026, 1, 2)], 't')
    replaceSleeperStats(db, 2026, 2, [line('a', 2026, 2, 3)], 't')
    replaceSleeperStats(db, 2025, 1, [line('a', 2025, 1, 4)], 't')
    expect(replaceSleeperStats(db, 2026, 1, [line('b', 2026, 1, 5)], 't')).toBe(1)
    expect(listSleeperStatsByWeek(db, 2026, 1)).toEqual([line('b', 2026, 1, 5)])
    expect(listSleeperStatsBySeason(db, 2026).map((r) => [r.playerId, r.week])).toEqual([
      ['b', 1],
      ['a', 2]
    ])
    expect(listSleeperStats(db)).toHaveLength(3)
  })
})
