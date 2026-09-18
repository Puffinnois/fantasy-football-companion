import { FLEX_ELIGIBILITY, LINEUP_POSITIONS, type RosterSlotCount } from '@shared/rules'
import type { ReplacementLevel } from '@shared/types'

function sortedDesc(metrics: Map<string, number[]>): Map<string, number[]> {
  return new Map([...metrics].map(([pos, values]) => [pos, [...values].sort((a, b) => b - a)]))
}

/**
 * Starters per lineup position (spec §2.2): dedicated slots × teams, then every flex slot goes to
 * whichever eligible position has the best next unallocated player. `metrics` holds each
 * position's players' metric in any order; a position with no player left never receives flex.
 */
export function starterCounts(
  slots: RosterSlotCount[],
  teamCount: number,
  metrics: Map<string, number[]>
): Map<string, number> {
  const sorted = sortedDesc(metrics)
  const starters = new Map<string, number>(LINEUP_POSITIONS.map((p) => [p, 0]))
  for (const s of slots) {
    if (starters.has(s.slot))
      starters.set(s.slot, (starters.get(s.slot) ?? 0) + s.count * teamCount)
  }
  for (const s of slots) {
    const eligible = FLEX_ELIGIBILITY[s.slot]
    if (!eligible) continue
    for (let i = 0; i < s.count * teamCount; i++) {
      let best: string | null = null
      let bestValue = -Infinity
      for (const pos of eligible) {
        const next = sorted.get(pos)?.[starters.get(pos) ?? 0]
        if (next !== undefined && next > bestValue) {
          best = pos
          bestValue = next
        }
      }
      if (best === null) break
      starters.set(best, (starters.get(best) ?? 0) + 1)
    }
  }
  return starters
}

/** Replacement level per lineup position: the (starters + 1)-th best metric, the worst one when fewer players exist, null with none. */
export function replacementLevels(
  slots: RosterSlotCount[],
  teamCount: number,
  metrics: Map<string, number[]>
): Map<string, ReplacementLevel | null> {
  const sorted = sortedDesc(metrics)
  const levels = new Map<string, ReplacementLevel | null>()
  for (const [pos, starters] of starterCounts(slots, teamCount, metrics)) {
    const values = sorted.get(pos) ?? []
    levels.set(
      pos,
      values.length === 0
        ? null
        : { level: values[Math.min(starters, values.length - 1)], starters }
    )
  }
  return levels
}
