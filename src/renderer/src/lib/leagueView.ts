import type { Team, TeamStrength } from '@shared/types'

export type TeamSort = 'record' | 'strength'

export const TEAM_SORTS: { key: TeamSort; label: string }[] = [
  { key: 'record', label: 'By record' },
  { key: 'strength', label: 'Rest of season' }
]

/** Playoff spots when the league settings carry none. */
export const DEFAULT_PLAYOFF_TEAMS = 6

/** Basis of the ROS number (spec §5.2): under the toggle while ROS strength is selected, and every card line's tooltip. */
export const STRENGTH_NOTE =
  'Optimal lineup on Sleeper projections under your scoring, summed over the remaining weeks'

export function teamLabel(t: Team): string {
  return t.teamName ?? t.displayName
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

export type RosTier = 'good' | 'mid' | 'bad' | 'none'

/** Top third of the league by ROS rank is good, bottom third bad (README "League"). */
export function rosTier(rank: number | null, teamCount: number): RosTier {
  if (rank === null) return 'none'
  const third = Math.max(1, Math.round(teamCount / 3))
  return rank <= third ? 'good' : rank > teamCount - third ? 'bad' : 'mid'
}

export function rosTierLine(tier: RosTier, teamCount: number): string {
  const third = Math.max(1, Math.round(teamCount / 3))
  switch (tier) {
    case 'good':
      return `Top-${third} roster for the rest of the season`
    case 'bad':
      return `Bottom-${third} roster for the rest of the season`
    case 'mid':
      return 'Mid-pack roster for the rest of the season'
    default:
      return 'No rest-of-season outlook yet'
  }
}

/** 1 → "st", 2 → "nd", 11 → "th", 22 → "nd". */
export function ordinalSuffix(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const m = n % 100
  return s[(m - 20) % 10] ?? s[m] ?? s[0]
}

export function ordinal(n: number): string {
  return `${n}${ordinalSuffix(n)}`
}

export function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((w) => w[0])
      .join('')
      .toUpperCase() || '?'
  )
}

export function recordText(t: Team): string {
  return t.ties ? `${t.wins}-${t.losses}-${t.ties}` : `${t.wins}-${t.losses}`
}

/** "+12.4" / "−3.0" / "±0.0" with a real minus sign. */
export function signedOne(n: number): string {
  return `${n > 0 ? '+' : n < 0 ? '−' : '±'}${Math.abs(n).toFixed(1)}`
}

/**
 * Standing sentence of the selected team: leader, in a playoff spot, or games out of the last
 * spot (`standings` in record order, `place` 1-based).
 */
export function standLine(standings: Team[], place: number, playoffTeams: number): string {
  const n = standings.length
  if (place === 1) return `Leading the league at ${ordinal(place)} of ${n}`
  if (place <= playoffTeams) return `In a playoff spot, ${ordinal(place)} of ${n}`
  const cut = standings[playoffTeams - 1]
  const me = standings[place - 1]
  const gb = cut && me ? (cut.wins - me.wins + (me.losses - cut.losses)) / 2 : 0
  return gb <= 0
    ? `Tied with the last playoff spot, ${ordinal(place)} of ${n}`
    : `${gb} game${gb === 1 ? '' : 's'} out of the last playoff spot`
}

/** Last week against the season average: ≥ +3 up, ≤ −3 down, else flat; null without both numbers. */
export function lastWeekTrend(
  seasonPoints: number | null,
  lastWeekPoints: number | null,
  weeksPlayed: number
): 'up' | 'down' | 'flat' | null {
  if (seasonPoints === null || lastWeekPoints === null) return null
  const delta = lastWeekPoints - seasonPoints / Math.max(1, weeksPlayed)
  return delta >= 3 ? 'up' : delta <= -3 ? 'down' : 'flat'
}
