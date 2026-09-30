import { rosterWeek, type LineupBuild } from '@main/lineup/build'
import type { PlayerSeries } from '@main/value/series'
import { activePlayers, OPEN_RELEASE } from '@main/waiver/release'
import { lineupRows, scoreFreeAgents, searchContext } from '@main/waiver/search'
import type { OpenSpot, TradeOpenSpots, TradeProposal, TradeSideResult } from '@shared/types'
import { evaluateTrade, requireWindow, rosterSize } from './evaluate'

/** A side's roster after the trade and 6b's auto-drops, exactly as `evaluateTrade` settled it. */
export function afterRoster(build: LineupBuild, side: TradeSideResult): PlayerSeries[] {
  const gone = new Set([...side.give, ...side.drops].map((p) => p.playerId))
  const incoming = side.get.flatMap((p) => {
    const s = build.inputs.value.series.get(p.playerId)
    return s ? [s] : []
  })
  return [...(build.rosters.get(side.rosterId) ?? []), ...incoming].filter(
    (s) => !gone.has(s.base.playerId)
  )
}

/**
 * Slice 6c spec §7: the best free agent for an open spot on `roster` over `weeks` — §2.3 with the
 * release fixed to `open`. Null when the roster is full or its size unknown.
 */
export function openSpotFor(
  build: LineupBuild,
  weeks: number[],
  rosterId: number,
  roster: PlayerSeries[]
): OpenSpot | null {
  const size = rosterSize(build)
  if (size === null || activePlayers(roster).length >= size) return null
  const base = weeks.map((w) => rosterWeek(build, roster, w))
  const ctx = searchContext(build, weeks, roster, base, [OPEN_RELEASE], new Map())
  const best = lineupRows(ctx, scoreFreeAgents(ctx), 1)[0] ?? null
  return {
    rosterId,
    add: best?.player ?? null,
    deltaPerWeek: best?.options[0].deltaPerWeek ?? 0
  }
}

/** Spec §2.4: each side's open-spot add, aligned with the evaluation's sides; the verdict itself is unchanged. */
export function tradeOpenSpots(build: LineupBuild, proposal: TradeProposal): TradeOpenSpots {
  const ev = evaluateTrade(build, proposal)
  const weeks = requireWindow(build)
  return {
    sides: ev.sides.map((side) =>
      openSpotFor(build, weeks, side.rosterId, afterRoster(build, side))
    )
  }
}
