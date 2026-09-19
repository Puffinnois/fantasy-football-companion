import { beforeEach, describe, expect, it } from 'vitest'
import { openDatabase, type Db } from '@main/db/connection'
import { migrate } from '@main/db/migrate'
import {
  listExpertRanks,
  replaceExpertRanks,
  ROS_WEEK,
  storedScoring,
  type ExpertRankRecord
} from '@main/db/repos/expertRanks'
import {
  listMarketValues,
  replaceMarketValues,
  type MarketValueRecord
} from '@main/db/repos/marketValues'

const TS = '2026-09-18T12:00:00.000Z'

const rank = (playerId: string, rankEcr: number, posRank: number): ExpertRankRecord => ({
  playerId,
  rankEcr,
  posRank,
  rankAve: rankEcr + 0.4,
  rankStd: null,
  rankMin: rankEcr,
  rankMax: rankEcr + 3,
  experts: 6,
  grade: null,
  projPts: null
})

describe('expert_ranks repo', () => {
  let db: Db
  beforeEach(() => {
    db = openDatabase(':memory:')
    migrate(db)
  })

  it('replaces one (season, week) at a time, lists by rank_ecr with scoring and updated_at', () => {
    const ros = [rank('8259', 12, 5), rank('4866', 1, 1)]
    expect(replaceExpertRanks(db, 2026, ROS_WEEK, 'PPR', ros, TS)).toBe(2)
    expect(
      replaceExpertRanks(
        db,
        2026,
        2,
        'PPR',
        [{ ...rank('4866', 1, 1), rankStd: 0.6, grade: 'A+', projPts: 22.4 }],
        TS
      )
    ).toBe(1)

    const rows = listExpertRanks(db, 2026, ROS_WEEK)
    expect(rows.map((r) => r.playerId)).toEqual(['4866', '8259'])
    expect(rows[0]).toEqual({ ...rank('4866', 1, 1), scoring: 'PPR', updatedAt: TS })
    expect(listExpertRanks(db, 2026, 2)[0]).toMatchObject({
      rankStd: 0.6,
      grade: 'A+',
      projPts: 22.4
    })
    expect(listExpertRanks(db, 2025, ROS_WEEK)).toEqual([])

    // a later replace of the same week drops what is no longer there and can change the scoring
    expect(
      replaceExpertRanks(
        db,
        2026,
        ROS_WEEK,
        'HALF',
        [rank('8259', 3, 2)],
        '2026-09-19T00:00:00.000Z'
      )
    ).toBe(1)
    expect(listExpertRanks(db, 2026, ROS_WEEK).map((r) => [r.playerId, r.scoring])).toEqual([
      ['8259', 'HALF']
    ])
    expect(listExpertRanks(db, 2026, 2)).toHaveLength(1) // other weeks untouched
  })

  it('storedScoring reads the stored format, null when nothing is stored', () => {
    expect(storedScoring(db, 2026, ROS_WEEK)).toBeNull()
    replaceExpertRanks(db, 2026, ROS_WEEK, 'STD', [rank('4866', 1, 1)], TS)
    expect(storedScoring(db, 2026, ROS_WEEK)).toBe('STD')
    expect(storedScoring(db, 2026, 1)).toBeNull()
  })
})

describe('market_values repo', () => {
  let db: Db
  beforeEach(() => {
    db = openDatabase(':memory:')
    migrate(db)
  })

  it('replaces a season and lists by overall_rank', () => {
    const records: MarketValueRecord[] = [
      { playerId: '4866', value: 9340, overallRank: 2, posRank: 1, tier: 1, trend30d: -310 },
      { playerId: '6794', value: 10512, overallRank: 1, posRank: 1, tier: null, trend30d: 120 }
    ]
    expect(replaceMarketValues(db, 2026, records, TS)).toBe(2)
    expect(listMarketValues(db, 2026)).toEqual([
      { ...records[1], updatedAt: TS },
      { ...records[0], updatedAt: TS }
    ])
    expect(replaceMarketValues(db, 2026, records.slice(0, 1), TS)).toBe(1)
    expect(listMarketValues(db, 2026).map((r) => r.playerId)).toEqual(['4866'])
    expect(listMarketValues(db, 2025)).toEqual([])
  })
})
