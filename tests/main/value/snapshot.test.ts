import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '@main/db/connection'
import { replaceExpertRanks, ROS_WEEK, type ExpertRankRecord } from '@main/db/repos/expertRanks'
import { listRosSnapshot } from '@main/db/repos/rosSnapshots'
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
