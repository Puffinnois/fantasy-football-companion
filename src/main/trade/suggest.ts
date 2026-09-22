import type { TradeStance, TradeSuggestion } from '@shared/types'
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
/** Spec §3.4: a 2-for-1 / 1-for-2 that beats its 1-for-1 by no more than this was padding. */
export const DOMINANCE_PTS = 0.5
export const SUGGEST_MAX = 30

export function passesStance(stance: TradeStance, deltaPerWeek: number, ratio: number): boolean {
  const s = STANCES[stance]
  const deltaOk = s.strict ? deltaPerWeek > s.deltaPerWeek : deltaPerWeek >= s.deltaPerWeek
  return deltaOk && ratio >= s.ratio
}

/** Spec §3.3: why the other manager would take it; null when they would not. */
export function acceptanceOf(
  theirDelta: number,
  theirRatio: number
): TradeSuggestion['acceptance'] | null {
  const lineup = theirDelta > 0
  const market = theirRatio >= MARKET_FAIR
  if (lineup && market) return 'both'
  if (lineup) return 'lineup'
  return market ? 'market' : null
}
