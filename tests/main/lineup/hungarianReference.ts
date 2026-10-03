import { round2 } from '@main/db/repos/points'
import {
  byValueDesc,
  type Candidate,
  type LineupSlot,
  type Optimal,
  type Placed
} from '@main/lineup/optimal'

/**
 * Test-only reference: the dense Hungarian lineup solver `optimalLineup` used before the exact
 * greedy (Plan R, Task 15). The tests compare totals and chosen sets, not seats, so the starters
 * keep the assignment's own placement (`placeDeterministically` is private to the source).
 */

/** Cost of an ineligible pairing; never chosen because every slot can stay empty and every player sit for less. */
const FORBIDDEN = 1e6
/** Cost of leaving a slot empty: worse than any real player (weekly points never fall below −1000). */
const EMPTY_SLOT = 1e3

/**
 * Minimum-cost perfect matching of a square matrix (Hungarian algorithm with potentials, O(n³)).
 * Returns the column matched to each row.
 */
export function assign(cost: number[][]): number[] {
  const n = cost.length
  const u = new Array<number>(n + 1).fill(0)
  const v = new Array<number>(n + 1).fill(0)
  const p = new Array<number>(n + 1).fill(0)
  const way = new Array<number>(n + 1).fill(0)
  for (let i = 1; i <= n; i++) {
    p[0] = i
    let j0 = 0
    const minv = new Array<number>(n + 1).fill(Number.POSITIVE_INFINITY)
    const used = new Array<boolean>(n + 1).fill(false)
    do {
      used[j0] = true
      const i0 = p[j0]
      let delta = Number.POSITIVE_INFINITY
      let j1 = 0
      for (let j = 1; j <= n; j++) {
        if (used[j]) continue
        const cur = cost[i0 - 1][j - 1] - u[i0] - v[j]
        if (cur < minv[j]) {
          minv[j] = cur
          way[j] = j0
        }
        if (minv[j] < delta) {
          delta = minv[j]
          j1 = j
        }
      }
      for (let j = 0; j <= n; j++) {
        if (used[j]) {
          u[p[j]] += delta
          v[j] -= delta
        } else {
          minv[j] -= delta
        }
      }
      j0 = j1
    } while (p[j0] !== 0)
    do {
      const j1 = way[j0]
      p[j0] = p[j1]
      j0 = j1
    } while (j0 !== 0)
  }
  const result = new Array<number>(n).fill(-1)
  for (let j = 1; j <= n; j++) if (p[j] !== 0) result[p[j] - 1] = j - 1
  return result
}

/**
 * Spec §2.4: exact maximum-weight assignment of candidates to slots. Rows are the slots plus one
 * "bench" row per player, columns the players plus one "empty" column per slot, so no slot ever
 * needs an ineligible player and no player ever needs a slot. Filling a slot always beats leaving
 * it empty; among full lineups the total is maximal.
 */
export function hungarianLineup(slots: LineupSlot[], candidates: Candidate[]): Optimal {
  const s = slots.length
  const p = candidates.length
  const n = s + p
  const cost: number[][] = []
  for (let i = 0; i < n; i++) {
    const row = new Array<number>(n).fill(0)
    if (i < s) {
      for (let j = 0; j < n; j++) {
        if (j >= p) {
          row[j] = EMPTY_SLOT
        } else {
          const c = candidates[j]
          row[j] =
            c.position !== null && slots[i].eligible.includes(c.position) ? -c.value : FORBIDDEN
        }
      }
    }
    cost.push(row)
  }
  const match = assign(cost)
  const chosen: Candidate[] = []
  const raw: Placed[] = slots.map((slot, i) => {
    const player = match[i] < p ? candidates[match[i]] : null
    if (player) chosen.push(player)
    return { slot: slot.slot, player }
  })
  const chosenIds = new Set(chosen.map((c) => c.id))
  return {
    starters: raw,
    total: round2(chosen.reduce((sum, c) => sum + c.value, 0)) ?? 0,
    bench: candidates.filter((c) => !chosenIds.has(c.id)).sort(byValueDesc)
  }
}
