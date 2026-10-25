import { ScopeBar } from '@/components/stats/ScopeBar'
import type { ChartState } from '@/lib/stats/chart'
import type { CompareState } from '@/lib/stats/compare'
import type { StatsScope } from '@/lib/stats/scope'
import type { TrendsState } from '@/lib/stats/trends'
import type { StatsData } from '@/lib/stats/useStats'
import { cn } from '@/lib/utils'
import { StatsChart } from '@/screens/stats/StatsChart'
import { StatsCompare } from '@/screens/stats/StatsCompare'
import { StatsTrends } from '@/screens/stats/StatsTrends'
import type { PositionGroup } from '@shared/stats/types'

/** Explore's sub-tabs (spec §9.5). */
export type ExploreTab = 'chart' | 'compare' | 'trends'

const TABS: { id: ExploreTab; label: string }[] = [
  { id: 'chart', label: 'Chart' },
  { id: 'compare', label: 'Compare' },
  { id: 'trends', label: 'Trends' }
]

/** Explore (handoff "Explore"): Chart · Compare · Trends over the shared scope. */
export function StatsExplore({
  data,
  scope,
  onScope,
  hasLeague,
  tab,
  onTab,
  chart,
  onChart,
  onCompareChart,
  compare,
  onCompare,
  trends,
  onTrends,
  trendsFallback,
  onOpenPlayer,
  onOpenTeam
}: {
  data: StatsData
  scope: StatsScope
  onScope: (scope: StatsScope) => void
  hasLeague: boolean
  tab: ExploreTab
  onTab: (tab: ExploreTab) => void
  chart: ChartState
  onChart: (update: (state: ChartState) => ChartState) => void
  /** The chart's picks, opened in Compare. */
  onCompareChart: (state: ChartState) => void
  compare: CompareState
  onCompare: (update: (state: CompareState) => CompareState) => void
  trends: TrendsState
  onTrends: (update: (state: TrendsState) => TrendsState) => void
  /** Trends' player or team when none is picked: the one a dashboard showed last. */
  trendsFallback: { id: string; position: PositionGroup | null } | null
  onOpenPlayer: (id: string, position: PositionGroup | null) => void
  onOpenTeam: (team: string) => void
}): React.JSX.Element {
  return (
    <div className="flex flex-col gap-5 px-8 pt-[18px] pb-8">
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-line pb-3.5">
        <div
          role="tablist"
          aria-label="Explore"
          className="flex gap-0.5 rounded-[7px] bg-panel-2 p-0.5"
        >
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={t.id === tab}
              onClick={() => onTab(t.id)}
              className={cn(
                'h-[26px] cursor-pointer rounded-[5px] px-3.5 text-[12.5px]',
                t.id === tab
                  ? 'bg-panel font-semibold text-fg shadow-[0_0_0_1px_var(--line)]'
                  : 'font-medium text-fg-2 hover:text-fg'
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <ScopeBar scope={scope} status={data.status} hasLeague={hasLeague} onChange={onScope} />
      </div>
      {tab === 'chart' && (
        <StatsChart
          data={data}
          scope={scope}
          onScope={onScope}
          state={chart}
          onState={onChart}
          onOpenPlayer={onOpenPlayer}
          onOpenTeam={onOpenTeam}
          onCompare={onCompareChart}
        />
      )}
      {tab === 'compare' && (
        <StatsCompare
          data={data}
          scope={scope}
          state={compare}
          onState={onCompare}
          onOpenPlayer={onOpenPlayer}
          onOpenTeam={onOpenTeam}
        />
      )}
      {tab === 'trends' && (
        <StatsTrends
          data={data}
          scope={scope}
          state={trends}
          onState={onTrends}
          fallback={trendsFallback}
        />
      )}
    </div>
  )
}
