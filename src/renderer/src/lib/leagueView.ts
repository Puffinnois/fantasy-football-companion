import type { Team, TeamStrength } from '@shared/types'
import { fmtPoints } from './format'

export type TeamSort = 'record' | 'strength'

export const TEAM_SORTS: { key: TeamSort; label: string }[] = [
  { key: 'record', label: 'Record' },
  { key: 'strength', label: 'ROS strength' }
]

/** Basis of the ROS number (spec §5.2): under the toggle while ROS strength is selected, and every card line's tooltip. */
export const STRENGTH_NOTE =
  'Optimal lineup on Sleeper projections under your scoring, summed over the remaining weeks'

export function teamLabel(t: Team): string {
  return t.teamName ?? t.displayName
}

/** Third card line: "ROS 1234.50 · #3", or "ROS —" when strength is not computable (no projections, season over). */
export function rosLine(s: TeamStrength | undefined): string {
  return s && s.rosTotal !== null && s.rank !== null
    ? `ROS ${fmtPoints(s.rosTotal)} · #${s.rank}`
    : 'ROS —'
}

function byRecord(a: Team, b: Team): number {
  return (
    b.wins - a.wins ||
    b.ties - a.ties ||
    b.fpts - a.fpts ||
    teamLabel(a).localeCompare(teamLabel(b))
  )
}

/**
 * Record: standings order (wins, ties, points for). ROS strength: `rank` ascending, unranked
 * teams last; ties keep record order (Array.prototype.sort is stable). Never mutates `teams`.
 */
export function sortTeams(teams: Team[], strengths: TeamStrength[], sort: TeamSort): Team[] {
  const sorted = [...teams].sort(byRecord)
  if (sort === 'record') return sorted
  const rank = new Map(strengths.map((s) => [s.rosterId, s.rank]))
  return sorted.sort((a, b) => {
    const ra = rank.get(a.rosterId) ?? null
    const rb = rank.get(b.rosterId) ?? null
    if (ra === rb) return 0
    if (ra === null) return 1
    if (rb === null) return -1
    return ra - rb
  })
}
