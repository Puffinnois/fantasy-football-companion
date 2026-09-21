import { teamWeek, type LineupBuild } from '@main/lineup/build'
import type { PlayerSeries } from '@main/value/series'
import type { TradePlayer } from '@shared/types'

/** Spec 6b §4.1: window weeks in which each player of a roster starts, before any trade. */
export function starterWeeks(
  build: LineupBuild,
  rosterId: number,
  weeks: number[]
): Map<string, number> {
  const counts = new Map<string, number>()
  for (const week of weeks) {
    for (const placed of teamWeek(build, rosterId, week).optimal) {
      if (placed.player) counts.set(placed.player.id, (counts.get(placed.player.id) ?? 0) + 1)
    }
  }
  return counts
}

/** A player as the trade tables show him: identity, reserve slot, ROS / expert / market numbers. */
export function tradePlayer(
  build: LineupBuild,
  s: PlayerSeries,
  starterWeeks: number
): TradePlayer {
  const row = build.rowById.get(s.base.playerId)
  return {
    playerId: s.base.playerId,
    fullName: s.base.fullName,
    position: s.base.position,
    team: s.base.team,
    statsAvailable: s.statsAvailable,
    injuryStatus: s.base.injuryStatus,
    reserve: s.rosterSlot === 'ir' || s.rosterSlot === 'taxi' ? s.rosterSlot : null,
    rosPoints: row?.rosPoints ?? null,
    rosValue: row?.rosValue ?? null,
    expert: row?.expert ?? null,
    market: row?.market ?? null,
    starterWeeks
  }
}
