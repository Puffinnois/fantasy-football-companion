import type { Candidate, LineupSlot, Placed } from '@main/lineup/optimal'

/**
 * Spec 6b §2.3: the slots a player of `position` could end up affecting — the slots he is
 * eligible for, then the slots their starters are eligible for, and so on. A WR entering FLEX can
 * push the FLEX WR into the WR slot and bench a weaker WR, so eligibility alone is not enough.
 */
export function reachableSlots(
  position: string | null,
  slots: LineupSlot[],
  starters: Placed[]
): number[] {
  if (position === null) return []
  const reached = new Set<number>()
  const visited = new Set<string>()
  const queue = [position]
  while (queue.length > 0) {
    const pos = queue.pop() as string
    if (visited.has(pos)) continue
    visited.add(pos)
    slots.forEach((slot, i) => {
      if (reached.has(i) || !slot.eligible.includes(pos)) return
      reached.add(i)
      const starter = starters[i]?.player
      if (starter?.position && !visited.has(starter.position)) queue.push(starter.position)
    })
  }
  return [...reached].sort((a, b) => a - b)
}

/**
 * Spec 6b §2.3: exact test of whether adding `candidate` to a roster whose optimal lineup is
 * `starters` can raise the total. Every improving augmentation is a chain that ends by filling
 * an empty reachable slot or benching a reachable starter worth less — so this is never false
 * when the total would rise (it may be true when it would not; callers then solve for real).
 */
export function canEnter(candidate: Candidate, slots: LineupSlot[], starters: Placed[]): boolean {
  for (const i of reachableSlots(candidate.position, slots, starters)) {
    const starter = starters[i]?.player ?? null
    if (starter === null || starter.value < candidate.value) return true
  }
  return false
}
