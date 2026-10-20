import { StatsSelect } from '@/components/stats/controls'
import {
  lastWeek,
  SCORING_LABELS,
  seasonOptions,
  weeksOf,
  type StatsScope
} from '@/lib/stats/scope'
import type { Scoring } from '@shared/stats/scoring'
import type { StatsStatus } from '@shared/stats/types'

const TYPES: { value: StatsScope['seasonType']; label: string }[] = [
  { value: 'REG', label: 'Regular season' },
  { value: 'POST', label: 'Postseason' },
  { value: 'ALL', label: 'Both' }
]

/**
 * Spec §9.1 global controls: season, season type, the regular season's week range, and the
 * scoring of fantasy points (My league once a league is imported).
 */
export function ScopeBar({
  scope,
  status,
  hasLeague,
  onChange,
  scoring = true
}: {
  scope: StatsScope
  status: StatsStatus | null
  hasLeague: boolean
  onChange: (scope: StatsScope) => void
  /** Screens without fantasy points leave the scoring picker out. */
  scoring?: boolean
}): React.JSX.Element {
  const last = lastWeek(scope.season, status)
  const [from, to] = weeksOf(scope, status)
  const weeks = Array.from({ length: last }, (_, i) => ({ value: i + 1, label: `Week ${i + 1}` }))
  const full = (a: number, b: number): [number, number] | null =>
    a === 1 && b === last ? null : [a, b]
  const scorings = (['league', 'ppr', 'half', 'std'] as Scoring[])
    .filter((s) => s !== 'league' || hasLeague)
    .map((s) => ({ value: s, label: SCORING_LABELS[s] }))
  return (
    <div className="flex items-center gap-1.5 text-[12.5px] text-fg-3">
      <StatsSelect
        title="Season"
        value={scope.season}
        options={seasonOptions(status).map((s) => ({ value: s, label: String(s) }))}
        onChange={(season) => onChange({ ...scope, season, weeks: null })}
      />
      <StatsSelect
        title="Season type"
        value={scope.seasonType}
        options={TYPES}
        onChange={(seasonType) => onChange({ ...scope, seasonType })}
      />
      {scope.seasonType === 'REG' && (
        <>
          <StatsSelect
            title="From week"
            value={from}
            options={weeks}
            onChange={(a) => onChange({ ...scope, weeks: full(a, Math.max(a, to)) })}
          />
          <span>to</span>
          <StatsSelect
            title="To week"
            value={to}
            options={weeks}
            onChange={(b) => onChange({ ...scope, weeks: full(Math.min(from, b), b) })}
          />
        </>
      )}
      {scoring && (
        <StatsSelect
          title="Fantasy scoring"
          value={scope.scoring}
          options={scorings}
          onChange={(s) => onChange({ ...scope, scoring: s })}
        />
      )}
    </div>
  )
}
