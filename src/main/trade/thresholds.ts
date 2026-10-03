import type { TradeAcceptance, TradeStance } from '@shared/types'
import { MARKET_FAIR } from './evaluate'

/** Spec 6b §3.3: what my side must clear per stance; `strict` makes the Δ/week bound exclusive. */
export const STANCES: Record<
  TradeStance,
  { deltaPerWeek: number; strict: boolean; ratio: number }
> = {
  premium: { deltaPerWeek: 1, strict: false, ratio: 1 },
  fair: { deltaPerWeek: 0, strict: true, ratio: 0.85 },
  overpay: { deltaPerWeek: -1, strict: false, ratio: 0.7 }
}
/**
 * How much weekly lineup value the other manager will swallow for a fair-value trade. Without it,
 * every market-fair consolidation qualifies however much it guts their starting lineup — on a real
 * 16-team league that was the whole top 30. Mirrors the overpay stance's bound on my own side.
 */
export const ACCEPT_LOSS_PER_WEEK = 1
/** Spec §3.4: a 2-for-1 / 1-for-2 that beats its 1-for-1 by no more than this was padding. */
export const DOMINANCE_PTS = 0.5
export const SUGGEST_MAX = 30

/** The Δ/week half of a stance's test — the bound the bigger shapes are checked against. */
export function stanceDelta(stance: TradeStance, deltaPerWeek: number): boolean {
  const s = STANCES[stance]
  return s.strict ? deltaPerWeek > s.deltaPerWeek : deltaPerWeek >= s.deltaPerWeek
}

export function passesStance(stance: TradeStance, deltaPerWeek: number, ratio: number): boolean {
  return stanceDelta(stance, deltaPerWeek) && ratio >= STANCES[stance].ratio
}

/** Spec §3.3: why the other manager would take it; null when they would not. */
export function acceptanceOf(
  theirDelta: number,
  theirRatio: number,
  theirDeltaPerWeek: number
): TradeAcceptance | null {
  const lineup = theirDelta > 0
  const market = theirRatio >= MARKET_FAIR && theirDeltaPerWeek >= -ACCEPT_LOSS_PER_WEEK
  if (lineup && market) return 'both'
  if (lineup) return 'lineup'
  return market ? 'market' : null
}
