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
  projPosRank: null,
  expertPosRank: null
}

/** Spec §3.2 / §5: the weeks the correction may touch — unplayed, and after the current week. */
function isFuture(w: SeriesWeek, currentWeek: number): boolean {
  return !w.played && w.week > currentWeek
}

function futureTotal(s: PlayerSeries, currentWeek: number): number {
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
 * players pass down to the players below them.
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

  // §3.2 rank matching, per lineup position, over ranked and unshelved players.
  const corrected = new Map<string, PlayerSeries>()
  for (const position of LINEUP_POSITIONS) {
    const pool = shelfed.filter(
      (s) =>
        s.base.position === position &&
        !adjustments.get(s.base.playerId)?.shelved &&
        ranks.has(s.base.playerId)
    )
    if (pool.length === 0) continue
    const base = new Map(pool.map((s) => [s.base.playerId, futureTotal(s, currentWeek)]))
    const value = (s: PlayerSeries): number => base.get(s.base.playerId) ?? 0
    const ladder = [...pool].sort((a, b) => value(b) - value(a))
    const order = [...pool].sort(
      (a, b) =>
        (ranks.get(a.base.playerId)?.posRank ?? 0) - (ranks.get(b.base.playerId)?.posRank ?? 0)
    )
    const projRank = new Map(ladder.map((s, i) => [s.base.playerId, i + 1]))

    order.forEach((s, i) => {
      const id = s.base.playerId
      const target = value(ladder[i])
      const from = value(s)
      const common = {
        shelved: false,
        projPosRank: projRank.get(id) ?? null,
        expertPosRank: ranks.get(id)?.posRank ?? null
      }
      if (from > 0) {
        const factor = target / from
        adjustments.set(id, { ...common, factor })
        corrected.set(
          id,
          rewrite(s, currentWeek, (w) => (w.projected === null ? null : w.projected * factor))
        )
        return
      }
      // §5: nothing to scale, so spread the corrected total over the weeks that have a game.
      adjustments.set(id, { ...common, factor: null })
      const playable = s.weeks.filter((w) => isFuture(w, currentWeek) && w.opponent !== null)
      if (playable.length === 0 || target === 0) return
      const each = target / playable.length
      const ids = new Set(playable.map((w) => w.week))
      corrected.set(
        id,
        rewrite(s, currentWeek, (w) => (ids.has(w.week) ? each : w.projected))
      )
    })
  }
  return {
    players: shelfed.map((s) => corrected.get(s.base.playerId) ?? s),
    adjustments,
    adjusted: true
  }
}
