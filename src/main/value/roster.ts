import type { Droppable, MyBaseline, RosterSlot } from '@shared/types'

/** Roster slots that cannot be started: players there are not "my players at pos" (spec §4 IR; taxi likewise). */
export const UNSTARTABLE_SLOTS: ReadonlySet<RosterSlot> = new Set<RosterSlot>(['ir', 'taxi'])

export interface RosterInput {
  playerId: string
  fullName: string
  position: string | null
  ownerRosterId: number | null
  ownerIsMe: boolean
  /** null for free agents. */
  rosterSlot: RosterSlot | null
  rosValue: number | null
}

export interface RosterRelative {
  vsMine: number | null
  droppable: Droppable | null
}

export interface RosterView {
  byPlayer: Map<string, RosterRelative>
  /** Position → my startable player with the lowest ROS value: the vsMine baseline. */
  baseline: Map<string, MyBaseline>
}

interface Valued extends RosterInput {
  rosValue: number
}

const NONE: RosterRelative = { vsMine: null, droppable: null }
const round2 = (value: number): number => Math.round(value * 100) / 100
const hasRos = (p: RosterInput): p is Valued => p.rosValue !== null
const isFreeAgent = (p: RosterInput): boolean => p.ownerRosterId === null
const isMineStartable = (p: RosterInput): boolean =>
  p.ownerIsMe && p.rosterSlot !== null && !UNSTARTABLE_SLOTS.has(p.rosterSlot)

/** The lowest (`min`) or highest (`max`) ROS value of a group; ties go to the name that sorts first. */
function extreme(players: Valued[], pick: 'min' | 'max'): Valued | null {
  return players.reduce<Valued | null>((best, p) => {
    if (best === null) return p
    const diff = p.rosValue - best.rosValue
    if (diff !== 0) return (pick === 'min' ? diff < 0 : diff > 0) ? p : best
    return p.fullName.localeCompare(best.fullName) < 0 ? p : best
  }, null)
}

/**
 * Spec §4, same position only: a free agent's vsMine is its ROS value over my weakest startable
 * player's; my startable player is droppable when the best free agent is strictly better.
 */
export function rosterRelative(players: RosterInput[], hasMyTeam: boolean): RosterView {
  const byPlayer = new Map<string, RosterRelative>(players.map((p) => [p.playerId, NONE]))
  const baseline = new Map<string, MyBaseline>()
  if (!hasMyTeam) return { byPlayer, baseline }

  const positions = new Set(players.flatMap((p) => (p.position === null ? [] : [p.position])))
  for (const pos of positions) {
    const atPos = players.filter((p): p is Valued => p.position === pos && hasRos(p))
    const myWorst = extreme(atPos.filter(isMineStartable), 'min')
    const bestFa = extreme(atPos.filter(isFreeAgent), 'max')
    if (myWorst) {
      baseline.set(pos, {
        playerId: myWorst.playerId,
        fullName: myWorst.fullName,
        rosValue: myWorst.rosValue
      })
    }
    for (const p of atPos) {
      if (isFreeAgent(p) && myWorst) {
        byPlayer.set(p.playerId, { vsMine: round2(p.rosValue - myWorst.rosValue), droppable: null })
      } else if (isMineStartable(p) && bestFa && bestFa.rosValue > p.rosValue) {
        byPlayer.set(p.playerId, {
          vsMine: null,
          droppable: {
            playerId: bestFa.playerId,
            fullName: bestFa.fullName,
            delta: round2(bestFa.rosValue - p.rosValue)
          }
        })
      }
    }
  }
  return { byPlayer, baseline }
}
