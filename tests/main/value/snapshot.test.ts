import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '@main/db/connection'
import { replaceExpertRanks, ROS_WEEK, type ExpertRankRecord } from '@main/db/repos/expertRanks'
import { replaceMarketValues } from '@main/db/repos/marketValues'
import { listRosSnapshot } from '@main/db/repos/rosSnapshots'
import { replaceTrendingAdds } from '@main/db/repos/trending'
import { buildRosSnapshot } from '@main/value/snapshot'
import { seedLeague, SEED_TS } from '../../fixtures/db'
import { seedSeason, SEASON } from '../../fixtures/season'

function rankRow(playerId: string, posRank: number): ExpertRankRecord {
  return {
    playerId,
    rankEcr: posRank * 10,
    posRank,
    rankAve: null,
    rankStd: 4.5,
    rankMin: posRank * 10 - 3,
    rankMax: posRank * 10 + 5,
    experts: 12,
    grade: null,
    projPts: null
  }
}

describe('ROS snapshot (realism follow-up: keep what a backtest needs)', () => {
  let db: Db
  beforeEach(() => {
    db = seedLeague()
    seedSeason(db)
  })

  it('records raw and corrected rest-of-season points with the consensus rank', () => {
    // The consensus puts Bijan (7 raw) above Barkley (8 raw): they swap.
    replaceExpertRanks(
      db,
      SEASON,
      ROS_WEEK,
      'PPR',
      [rankRow('9509', 1), rankRow('4866', 2)],
      SEED_TS
    )
    const snap = buildRosSnapshot(db, 'L1', SEASON)
    expect(snap?.week).toBe(3)
    const bijan = snap?.records.find((r) => r.playerId === '9509')
    expect(bijan).toMatchObject({
      position: 'RB',
      scoring: 'PPR',
      shelved: false,
      capped: false,
      posRank: 1,
      rankEcr: 10,
      rankStd: 4.5,
      rankMin: 7,
      rankMax: 15,
      experts: 12
    })
    expect(bijan?.rawRos).toBeCloseTo(7, 4)
    expect(bijan?.correctedRos).toBeCloseTo(8, 4)
    expect(bijan?.factor).toBeCloseTo(8 / 7, 4)
  })

  it('keeps unranked players with a projection, without rank fields', () => {
    const snap = buildRosSnapshot(db, 'L1', SEASON)
    const barkley = snap?.records.find((r) => r.playerId === '4866')
    expect(barkley).toMatchObject({ posRank: null, factor: null, rankStd: null })
    expect(barkley?.rawRos).toBeCloseTo(8, 4)
    expect(barkley?.correctedRos).toBeCloseTo(8, 4)
    // nothing projected ahead and no rank: not worth a row
    expect(snap?.records.some((r) => r.rawRos === 0 && r.posRank === null)).toBe(false)
  })

  it('records the stash signals: market value and trending adds (slice 6c spec §5.2)', () => {
    replaceMarketValues(
      db,
      SEASON,
      [{ playerId: '9509', value: 4321, overallRank: 1, posRank: 1, tier: null, trend30d: 0 }],
      SEED_TS
    )
    replaceTrendingAdds(db, [{ playerId: '9509', count: 250 }], SEED_TS)
    const snap = buildRosSnapshot(db, 'L1', SEASON)
    expect(snap?.records.find((r) => r.playerId === '9509')).toMatchObject({
      marketValue: 4321,
      trendingAdds: 250
    })
    expect(snap?.records.find((r) => r.playerId === '4866')).toMatchObject({
      marketValue: null,
      trendingAdds: null
    })
  })

  it('keeps a trending player even with nothing projected ahead and no rank', () => {
    // James Cook (8259, on IR in the season fixture) has no projection after week 3 and no rank.
    const without = buildRosSnapshot(db, 'L1', SEASON)
    expect(without?.records.some((r) => r.playerId === '8259')).toBe(false)
    replaceTrendingAdds(db, [{ playerId: '8259', count: 99 }], SEED_TS)
    const snap = buildRosSnapshot(db, 'L1', SEASON)
    expect(snap?.records.find((r) => r.playerId === '8259')).toMatchObject({
      rawRos: 0,
      trendingAdds: 99
    })
  })

  it('round-trips through the repo, one set per week', async () => {
    const { replaceRosSnapshot } = await import('@main/db/repos/rosSnapshots')
    const snap = buildRosSnapshot(db, 'L1', SEASON)
    if (!snap) throw new Error('no snapshot')
    replaceRosSnapshot(db, SEASON, snap.week, snap.records, SEED_TS)
    replaceRosSnapshot(db, SEASON, snap.week, snap.records.slice(0, 1), SEED_TS)
    const stored = listRosSnapshot(db, SEASON, snap.week)
    expect(stored).toHaveLength(1)
    expect(stored[0]).toEqual({ ...snap.records[0], takenAt: SEED_TS })
  })
})
