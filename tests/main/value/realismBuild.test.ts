import { beforeEach, describe, expect, it } from 'vitest'
import type { Db } from '@main/db/connection'
import { replaceExpertRanks, ROS_WEEK, type ExpertRankRecord } from '@main/db/repos/expertRanks'
import { upsertPlayers } from '@main/db/repos/players'
import { buildValueSeason } from '@main/value/build'
import { seedLeague, SEED_TS } from '../../fixtures/db'
import { seedSeason, SEASON } from '../../fixtures/season'
import * as fx from '../../fixtures/sleeper'
import { mapPlayers } from '@main/sync/mappers'

/** Barkley (4866) and Bijan (9509) are two of the fixture's RBs. */
function rankRow(playerId: string, posRank: number): ExpertRankRecord {
  return {
    playerId,
    rankEcr: posRank,
    posRank,
    rankAve: null,
    rankStd: null,
    rankMin: null,
    rankMax: null,
    experts: 12,
    grade: null,
    projPts: null
  }
}

describe('rest-of-season realism in the value build', () => {
  let db: Db
  beforeEach(() => {
    db = seedLeague()
    seedSeason(db)
  })

  it('reports no adjustment without expert ranks', () => {
    const build = buildValueSeason(db, 'L1', SEASON)
    expect(build.context.rosAdjusted).toBe(false)
    expect(build.rows.every((r) => r.rosAdjust?.factor == null)).toBe(true)
  })

  it('zeroes a shelved player and hands his rung to the player below', () => {
    const before = buildValueSeason(db, 'L1', SEASON)
    const barkleyBefore = before.rows.find((r) => r.playerId === '4866')?.rosPoints ?? 0
    const bijanBefore = before.rows.find((r) => r.playerId === '9509')?.rosPoints ?? 0
    expect(barkleyBefore).toBeGreaterThan(bijanBefore)

    // Shelve Barkley and rank the two RBs: Barkley first (ignored, he is shelved), Bijan second.
    upsertPlayers(
      db,
      mapPlayers({
        ...fx.players,
        '4866': { ...fx.players['4866'], injury_status: 'IR', status: 'Injured Reserve' }
      }),
      SEED_TS
    )
    replaceExpertRanks(
      db,
      SEASON,
      ROS_WEEK,
      'PPR',
      [rankRow('4866', 1), rankRow('9509', 2)],
      SEED_TS
    )

    const after = buildValueSeason(db, 'L1', SEASON)
    expect(after.context.rosAdjusted).toBe(true)
    const barkley = after.rows.find((r) => r.playerId === '4866')
    const bijan = after.rows.find((r) => r.playerId === '9509')
    expect(barkley?.rosAdjust).toMatchObject({ shelved: true, factor: null })
    expect(barkley?.rosPoints).toBe(0)
    // Bijan is the only unshelved ranked RB, so he keeps his own rung — but Barkley's is gone.
    expect(bijan?.rosPoints).toBeCloseTo(bijanBefore, 2)
    expect(bijan?.rosAdjust).toMatchObject({ shelved: false, expertPosRank: 2 })
  })

  it('swaps two players’ rest-of-season points when the consensus disagrees with the projections', () => {
    // Both RBs' remaining projections sit after the current week (Barkley 8, Bijan 7); Chase's
    // only projection is for the current week, which the correction never touches.
    const before = buildValueSeason(db, 'L1', SEASON)
    const barkleyBefore = before.rows.find((r) => r.playerId === '4866')?.rosPoints ?? 0
    const bijanBefore = before.rows.find((r) => r.playerId === '9509')?.rosPoints ?? 0
    expect(barkleyBefore).toBeGreaterThan(bijanBefore)

    // The consensus puts Bijan first.
    replaceExpertRanks(
      db,
      SEASON,
      ROS_WEEK,
      'PPR',
      [rankRow('9509', 1), rankRow('4866', 2)],
      SEED_TS
    )
    const after = buildValueSeason(db, 'L1', SEASON)
    expect(after.rows.find((r) => r.playerId === '9509')?.rosPoints).toBeCloseTo(barkleyBefore, 2)
    expect(after.rows.find((r) => r.playerId === '4866')?.rosPoints).toBeCloseTo(bijanBefore, 2)
    expect(after.rows.find((r) => r.playerId === '9509')?.rosAdjust).toMatchObject({
      projPosRank: 2,
      expertPosRank: 1
    })
  })
})
