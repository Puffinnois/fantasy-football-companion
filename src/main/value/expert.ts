import type { ExpertRankRow } from '@main/db/repos/expertRanks'
import type { MarketValueRow } from '@main/db/repos/marketValues'
import type { ExpertRos, ExpertWeek, MarketValue } from '@shared/types'

/** What the build loads once per season, alongside the series (spec §4.2): ROS ranks + market values. */
export interface ExpertBundle {
  ranks: ExpertRankRow[]
  market: MarketValueRow[]
}

export const NO_EXPERTS: ExpertBundle = { ranks: [], market: [] }

export interface ExpertIndex {
  ranks: Map<string, ExpertRankRow>
  market: Map<string, MarketValueRow>
  /** `updated_at` of the stored rows (one replace writes one timestamp); null when nothing is stored. */
  ecrUpdatedAt: string | null
  marketUpdatedAt: string | null
}

export function indexExperts(bundle: ExpertBundle): ExpertIndex {
  return {
    ranks: new Map(bundle.ranks.map((r) => [r.playerId, r])),
    market: new Map(bundle.market.map((m) => [m.playerId, m])),
    ecrUpdatedAt: bundle.ranks[0]?.updatedAt ?? null,
    marketUpdatedAt: bundle.market[0]?.updatedAt ?? null
  }
}

/** Spec §4.2 sign convention: ecrPosRank − rosRank, positive = we rank the player higher than the experts. */
export function ecrDelta(ecrPosRank: number | null, rosRank: number | null): number | null {
  return ecrPosRank === null || rosRank === null ? null : ecrPosRank - rosRank
}

export function expertRos(
  rank: ExpertRankRow | undefined,
  rosRank: number | null
): ExpertRos | null {
  if (!rank) return null
  return {
    ecrRank: rank.rankEcr,
    ecrPosRank: rank.posRank,
    spread: rank.rankStd,
    experts: rank.experts,
    ecrDelta: ecrDelta(rank.posRank, rosRank)
  }
}

export function marketValue(row: MarketValueRow | undefined): MarketValue | null {
  if (!row) return null
  return { value: row.value, posRank: row.posRank, tier: row.tier, trend30d: row.trend30d }
}

export function expertWeek(rank: ExpertRankRow | undefined): ExpertWeek | null {
  if (!rank) return null
  return {
    ecrPosRank: rank.posRank,
    grade: rank.grade,
    projPts: rank.projPts,
    spread: rank.rankStd
  }
}
