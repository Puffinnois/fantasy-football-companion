import { round2 } from '@main/db/repos/points'
import { FLEX_ELIGIBILITY, LINEUP_POSITIONS, type RosterSlotCount } from '@shared/rules'
import type { LineupFlag } from '@shared/types'

/** Spec §2.5: a bench alternative within this many points of the chosen starter is a judgement call. */
export const CLOSE_CALL_PTS = 2
/** Spec §2.3: current-week injury statuses that mean the player will not play. */
export const UNAVAILABLE_STATUSES: ReadonlySet<string> = new Set([
  'Out',
  'Doubtful',
  'IR',
  'PUP',
  'Sus',
  'COV',
  'NA',
  'DNR'
])
export const QUESTIONABLE_STATUS = 'Questionable'
/** `roster_positions` entries that Sleeper's `starters` array skips. */
export const RESERVE_SLOTS: ReadonlySet<string> = new Set(['BN', 'IR', 'TAXI'])
const EMPTY_STARTER = '0'

export interface LineupSlot {
  slot: string
  eligible: readonly string[]
}

export interface Candidate {
  id: string
  name: string
  position: string | null
  value: number
}

export interface Placed {
  slot: string
  player: Candidate | null
}

export interface Optimal {
  /** One entry per slot, in slot order. */
  starters: Placed[]
  total: number
  /** Eligible players left out, best first. */
  bench: Candidate[]
}

export interface SwapPair {
  slot: string
  out: Candidate | null
  in: Candidate
  delta: number
}

export interface WeekLine {
  played: boolean
  points: number | null
  projected: number | null
  /** The player's team has a game that week (the series week has an opponent). */
  hasGame: boolean
}

function eligibleFor(slot: string): readonly string[] | undefined {
  return LINEUP_POSITIONS.includes(slot) ? [slot] : FLEX_ELIGIBILITY[slot]
}

/** Spec §2.1: one entry per starting slot in Sleeper's order; bench, reserve, IDP and unknown slots are dropped. */
export function lineupSlots(rosterSlots: RosterSlotCount[]): LineupSlot[] {
  const out: LineupSlot[] = []
  for (const s of rosterSlots) {
    const eligible = eligibleFor(s.slot)
    if (!eligible) continue
    for (let i = 0; i < s.count; i++) out.push({ slot: s.slot, eligible })
  }
  return out
}

/**
 * Spec §3.4: `starters[i]` sits in the i-th `roster_positions` entry that is not BN/IR/TAXI; `'0'` or a
 * missing entry is an empty slot; entries that are not lineup slots (IDP) are dropped with their player.
 */
export function currentAssignments(
  rosterPositions: string[],
  starters: (string | null)[]
): { slot: string; id: string | null }[] {
  const out: { slot: string; id: string | null }[] = []
  rosterPositions
    .filter((s) => !RESERVE_SLOTS.has(s))
    .forEach((slot, i) => {
      if (!eligibleFor(slot)) return
      const id = starters[i] ?? null
      out.push({ slot, id: id === EMPTY_STARTER ? null : id })
    })
  return out
}

/** Higher value first; ties by name, then id, so equal players always come out in the same order. */
export function byValueDesc(a: Candidate, b: Candidate): number {
  return b.value - a.value || a.name.localeCompare(b.name) || a.id.localeCompare(b.id)
}

/**
 * Re-seats an optimal set so equal-value ties never shuffle players between slots: dedicated slots
 * first, then flex slots from the most restrictive, each taking the best remaining eligible player.
 * Null when that order cannot seat everyone (crossing flex kinds) — the caller then keeps the
 * assignment's own placement, which has the same total.
 */
function placeDeterministically(slots: LineupSlot[], chosen: Candidate[]): Placed[] | null {
  const remaining = [...chosen].sort(byValueDesc)
  const placed: Placed[] = slots.map((s) => ({ slot: s.slot, player: null }))
  const order = slots
    .map((_, i) => i)
    .sort((a, b) => slots[a].eligible.length - slots[b].eligible.length || a - b)
  for (const i of order) {
    const k = remaining.findIndex(
      (c) => c.position !== null && slots[i].eligible.includes(c.position)
    )
    if (k === -1) continue
    placed[i].player = remaining[k]
    remaining.splice(k, 1)
  }
  return remaining.length === 0 ? placed : null
}

/**
 * Spec §2.4: the optimal lineup — every slot it can fill filled, then the highest total. The sets
 * of players that can be seated together form a (transversal) matroid, so a greedy pass is exact:
 * players best first (`byValueDesc`), each kept when the kept set can still be seated (an
 * augmenting path over the slots). Ties resolve by `byValueDesc`, whatever the input order.
 */
export function optimalLineup(slots: LineupSlot[], candidates: Candidate[]): Optimal {
  const order = [...candidates].sort(byValueDesc)
  const eligible: number[][] = order.map((c) =>
    slots.flatMap((slot, i) =>
      c.position !== null && slot.eligible.includes(c.position) ? [i] : []
    )
  )
  /** The kept player seated in each slot (index into `order`), −1 when empty. */
  const seat = new Array<number>(slots.length).fill(-1)
  const chosen: Candidate[] = []
  for (let j = 0; j < order.length && chosen.length < slots.length; j++) {
    if (eligible[j].length === 0) continue
    const seen = new Array<boolean>(slots.length).fill(false)
    const place = (p: number): boolean => {
      for (const i of eligible[p]) {
        if (seen[i]) continue
        seen[i] = true
        if (seat[i] === -1 || place(seat[i])) {
          seat[i] = p
          return true
        }
      }
      return false
    }
    if (place(j)) chosen.push(order[j])
  }
  const raw: Placed[] = slots.map((slot, i) => ({
    slot: slot.slot,
    player: seat[i] >= 0 ? order[seat[i]] : null
  }))
  const chosenIds = new Set(chosen.map((c) => c.id))
  return {
    starters: placeDeterministically(slots, chosen) ?? raw,
    total: round2(chosen.reduce((sum, c) => sum + c.value, 0)) ?? 0,
    bench: candidates.filter((c) => !chosenIds.has(c.id)).sort(byValueDesc)
  }
}

/**
 * Spec §2.5: the starters the optimal lineup adds, each paired with one it removes — same position
 * first, then the weakest remaining; a player who only changes slot is not a swap. `out` is null
 * when the current lineup had an empty slot to fill.
 */
export function swapsBetween(optimal: Placed[], current: Placed[]): SwapPair[] {
  const ids = (placed: Placed[]): Set<string> =>
    new Set(placed.flatMap((e) => (e.player ? [e.player.id] : [])))
  const currentIds = ids(current)
  const optimalIds = ids(optimal)
  const ins = optimal
    .flatMap((e) =>
      e.player && !currentIds.has(e.player.id) ? [{ slot: e.slot, player: e.player }] : []
    )
    .sort((a, b) => byValueDesc(a.player, b.player))
  const outs = current
    .flatMap((e) => (e.player && !optimalIds.has(e.player.id) ? [e.player] : []))
    .sort((a, b) => a.value - b.value || a.name.localeCompare(b.name))
  return ins.map(({ slot, player }) => {
    let k = outs.findIndex((o) => o.position === player.position)
    if (k === -1 && outs.length > 0) k = 0
    const out = k === -1 ? null : outs.splice(k, 1)[0]
    return { slot, out, in: player, delta: round2(player.value - (out?.value ?? 0)) ?? 0 }
  })
}

/** Spec §2.5: the best bench player eligible for the slot when within CLOSE_CALL_PTS of the starter. */
export function closeCall(
  slot: LineupSlot,
  starter: Candidate | null,
  bench: Candidate[]
): Candidate | null {
  if (!starter) return null
  const alt = bench.find((c) => c.position !== null && slot.eligible.includes(c.position))
  return alt && starter.value - alt.value <= CLOSE_CALL_PTS ? alt : null
}

/** Spec §2.2: actual points when played, else the league-scored projection, else 0. */
export function weekValue(line: WeekLine | null): number {
  if (!line) return 0
  if (line.played) return line.points ?? 0
  return line.projected ?? 0
}

/** Spec §2.3: byes always; injury statuses count in the current week only; nothing once played. */
export function weekFlag(
  line: WeekLine | null,
  injuryStatus: string | null,
  isCurrentWeek: boolean
): LineupFlag {
  if (line?.played) return null
  if (!line || !line.hasGame) return 'bye'
  if (!isCurrentWeek || injuryStatus === null) return null
  if (injuryStatus === 'Doubtful') return 'doubtful'
  if (UNAVAILABLE_STATUSES.has(injuryStatus)) return 'out'
  if (injuryStatus === QUESTIONABLE_STATUS) return 'questionable'
  return null
}

/** A flag that takes the player out of the lineup (value 0, listed as unavailable). */
export function isUnavailable(flag: LineupFlag): boolean {
  return flag === 'out' || flag === 'doubtful'
}
