import type { ExpertRankRow } from '@main/db/repos/expertRanks'
import { LINEUP_POSITIONS } from '@shared/rules'
import type { RosAdjustment } from '@shared/types'
import type { PlayerSeries, SeriesWeek } from './series'

/** Spec §3.1: `injury_status` values that mean the player is formally shelved. */
export const SHELF_INJURY: ReadonlySet<string> = new Set(['IR', 'PUP'])
/** Spec §3.1: `status` values that mean the same. */
export const SHELF_STATUS: ReadonlySet<string> = new Set([
  'Injured Reserve',
  'Physically Unable to Perform'
])

/**
 * The most a correction may scale a player's remaining weeks, either way (×2 up, ×½ down).
 * Deep in a position the ladder is steep and expert ranks disagree widely, so an uncapped
 * swap can hand a one-week fill-in a starter's season. On real data the legitimate moves (a
 * handcuff whose starter went on IR, a TE promoted to the top job) land near ×2.
 */
export const ROS_FACTOR_CAP = 2

export function shelved(base: { injuryStatus: string | null; status: string | null }): boolean {
  return SHELF_INJURY.has(base.injuryStatus ?? '') || SHELF_STATUS.has(base.status ?? '')
}

export interface RealismResult {
  players: PlayerSeries[]
  adjustments: Map<string, RosAdjustment>
  /** False when no expert ranks were available: the shelf horizon ran, the correction did not. */
  adjusted: boolean
}

const NONE: RosAdjustment = {
  shelved: false,
  factor: null,
  capped: false,
  projPosRank: null,
  expertPosRank: null
}

/** Spec §3.2 / §5: the weeks the correction may touch — unplayed, and after the current week. */
function isFuture(w: SeriesWeek, currentWeek: number): boolean {
  return !w.played && w.week > currentWeek
}

/** Σ projected over the weeks the correction may touch. */
export function futureTotal(s: PlayerSeries, currentWeek: number): number {
  return s.weeks.reduce((t, w) => (isFuture(w, currentWeek) ? t + (w.projected ?? 0) : t), 0)
}

/** A copy of the player whose future weeks are rewritten by `next`; other weeks are shared. */
function rewrite(
  s: PlayerSeries,
  currentWeek: number,
  next: (w: SeriesWeek) => number | null
): PlayerSeries {
  return {
    ...s,
    weeks: s.weeks.map((w) => (isFuture(w, currentWeek) ? { ...w, projected: next(w) } : w))
  }
}

/**
 * Rest-of-season realism spec §3: shelved players stop carrying future projections, and each
 * position's points ladder is reassigned to the consensus order, so the rungs freed by shelved
 * players pass down to the players below them. The scale is clamped to `ROS_FACTOR_CAP` either
 * way, which gives up exact conservation and exact consensus order for the players it clamps.
 */
export function applyRosRealism(
  players: PlayerSeries[],
  currentWeek: number,
  ranks: Map<string, ExpertRankRow>
): RealismResult {
  const adjustments = new Map<string, RosAdjustment>(players.map((s) => [s.base.playerId, NONE]))

  // §3.1 shelf horizon, first: it decides who is in the ladder below.
  const shelfed = players.map((s) => {
    if (!shelved(s.base)) return s
    adjustments.set(s.base.playerId, { ...NONE, shelved: true })
    return rewrite(s, currentWeek, () => 0)
  })
  if (ranks.size === 0) return { players: shelfed, adjustments, adjusted: false }

  // §3.2 rank matching, per lineup position, over ranked and unshelved players with something
  // projected after this week. A player with nothing ahead (a one-week fill-in) has nothing to
  // scale, and letting him hold a rung would push every player below him down one.
  const corrected = new Map<string, PlayerSeries>()
  for (const position of LINEUP_POSITIONS) {
    const inPosition = shelfed.filter(
      (s) =>
        s.base.position === position &&
        !adjustments.get(s.base.playerId)?.shelved &&
        ranks.has(s.base.playerId)
    )
    const base = new Map(inPosition.map((s) => [s.base.playerId, futureTotal(s, currentWeek)]))
    const value = (s: PlayerSeries): number => base.get(s.base.playerId) ?? 0
    for (const s of inPosition) {
      if (value(s) > 0) continue
      const id = s.base.playerId
      adjustments.set(id, { ...NONE, expertPosRank: ranks.get(id)?.posRank ?? null })
    }
    const pool = inPosition.filter((s) => value(s) > 0)
    if (pool.length === 0) continue
    const ladder = [...pool].sort((a, b) => value(b) - value(a))
    const order = [...pool].sort(
      (a, b) =>
        (ranks.get(a.base.playerId)?.posRank ?? 0) - (ranks.get(b.base.playerId)?.posRank ?? 0)
    )
    const projRank = new Map(ladder.map((s, i) => [s.base.playerId, i + 1]))

    order.forEach((s, i) => {
      const id = s.base.playerId
      const raw = value(ladder[i]) / value(s)
      const factor = Math.min(ROS_FACTOR_CAP, Math.max(1 / ROS_FACTOR_CAP, raw))
      adjustments.set(id, {
        shelved: false,
        factor,
        capped: factor !== raw,
        projPosRank: projRank.get(id) ?? null,
        expertPosRank: ranks.get(id)?.posRank ?? null
      })
      corrected.set(
        id,
        rewrite(s, currentWeek, (w) => (w.projected === null ? null : w.projected * factor))
      )
    })
  }
  return {
    players: shelfed.map((s) => corrected.get(s.base.playerId) ?? s),
    adjustments,
    adjusted: true
  }
}
