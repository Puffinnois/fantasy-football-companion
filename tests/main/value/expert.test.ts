import { describe, expect, it } from 'vitest'
import type { ExpertRankRow } from '@main/db/repos/expertRanks'
import type { MarketValueRow } from '@main/db/repos/marketValues'
import {
  ecrDelta,
  expertRos,
  expertWeek,
  indexExperts,
  marketValue,
  NO_EXPERTS
} from '@main/value/expert'

const TS = '2026-09-18T12:00:00.000Z'
const rank = (
  playerId: string,
  posRank: number,
  over: Partial<ExpertRankRow> = {}
): ExpertRankRow => ({
  playerId,
  scoring: 'PPR',
  rankEcr: posRank * 3,
  posRank,
  rankAve: posRank + 0.5,
  rankStd: 1.5,
  rankMin: posRank - 1,
  rankMax: posRank + 4,
  experts: 6,
  grade: null,
  projPts: null,
  updatedAt: TS,
  ...over
})
const market = (playerId: string, value: number): MarketValueRow => ({
  playerId,
  value,
  overallRank: 1,
  posRank: 1,
  tier: 2,
  trend30d: -120,
  updatedAt: TS
})

describe('value/expert', () => {
  it('ecrDelta is ecrPosRank − rosRank: positive when we rank the player higher; null when either is missing', () => {
    expect(ecrDelta(12, 3)).toBe(9)
    expect(ecrDelta(2, 10)).toBe(-8)
    expect(ecrDelta(5, 5)).toBe(0)
    expect(ecrDelta(null, 3)).toBeNull()
    expect(ecrDelta(3, null)).toBeNull()
  })

  it('indexExperts maps by player and reports the stored timestamps, null when empty', () => {
    const index = indexExperts({ ranks: [rank('a', 1), rank('b', 2)], market: [market('a', 9000)] })
    expect(index.ranks.get('b')?.posRank).toBe(2)
    expect(index.market.get('a')?.value).toBe(9000)
    expect(index).toMatchObject({ ecrUpdatedAt: TS, marketUpdatedAt: TS })
    expect(indexExperts(NO_EXPERTS)).toMatchObject({ ecrUpdatedAt: null, marketUpdatedAt: null })
    expect(indexExperts({ ranks: [], market: [market('a', 1)] }).ecrUpdatedAt).toBeNull()
  })

  it('expertRos / marketValue / expertWeek build the shared blocks, null without a row', () => {
    expect(expertRos(rank('a', 4), 1)).toEqual({
      ecrRank: 12,
      ecrPosRank: 4,
      spread: 1.5,
      experts: 6,
      ecrDelta: 3
    })
    expect(expertRos(rank('a', 4, { rankStd: null }), null)).toMatchObject({
      spread: null,
      ecrDelta: null
    })
    expect(expertRos(undefined, 1)).toBeNull()
    expect(marketValue(market('a', 9000))).toEqual({
      value: 9000,
      posRank: 1,
      tier: 2,
      trend30d: -120
    })
    expect(marketValue(undefined)).toBeNull()
    expect(expertWeek(rank('a', 7, { grade: 'B+', projPts: 14.2 }))).toEqual({
      ecrPosRank: 7,
      grade: 'B+',
      projPts: 14.2,
      spread: 1.5
    })
    expect(expertWeek(undefined)).toBeNull()
  })
})
