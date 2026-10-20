import { Mark } from '@/components/edition'
import { UpdatePill } from '@/components/UpdatePill'
import { freshness } from '@/lib/stats/scope'
import { cn } from '@/lib/utils'
import type { StatsStatus } from '@shared/stats/types'
import type { UpdateState } from '@shared/types'

/** `team` is the team dashboard (spec §9.3), `teams` the team leaderboard. */
export type StatsScreen = 'home' | 'players' | 'team' | 'teams' | 'glossary'

const ITEMS: { id: StatsScreen | 'games'; label: string }[] = [
  { id: 'home', label: 'Leaderboards' },
  { id: 'players', label: 'Players' },
  { id: 'team', label: 'Teams' },
  { id: 'games', label: 'Games' },
  { id: 'glossary', label: 'Glossary' }
]

interface StatsNavProps {
  current: StatsScreen
  onNavigate: (screen: StatsScreen) => void
  status: StatsStatus | null
  hasLeague: boolean
  onOpenFantasy: () => void
  update: UpdateState
  version: string | null
  onOpenUpdate: () => void
  onToggleTheme: () => void
}

/**
 * Stats nav (handoff "Stats nav"): 52px, mark + "Companion Stats", five items, Fantasy ↗, theme.
 * Teams opens the team dashboard.
 */
export function StatsNav({
  current,
  onNavigate,
  status,
  hasLeague,
  onOpenFantasy,
  update,
  version,
  onOpenUpdate,
  onToggleTheme
}: StatsNavProps): React.JSX.Element {
  return (
    <nav className="flex h-[52px] shrink-0 items-center gap-[30px] border-b border-line px-6">
      <div
        className="flex items-center gap-[9px]"
        title={version !== null ? `Companion v${version}` : undefined}
      >
        <Mark product="stats" />
        <span className="text-[15px] leading-none font-semibold tracking-[-0.01em]">
          Companion <span className="font-medium text-fg-3">Stats</span>
        </span>
      </div>
      <div className="flex gap-[22px] self-stretch text-[13.5px] leading-none font-medium">
        {ITEMS.map(({ id, label }) => {
          const soon = id === 'games'
          // Teams opens the dashboard; the team leaderboard is under it.
          const on = current === id || (id === 'team' && current === 'teams')
          return (
            <button
              key={id}
              type="button"
              disabled={soon}
              title={soon ? 'Game previews come in a later update' : undefined}
              aria-current={on ? 'page' : undefined}
              onClick={() => !soon && onNavigate(id)}
              className={cn(
                'flex cursor-pointer items-center disabled:cursor-default disabled:opacity-40',
                on
                  ? 'text-fg shadow-[inset_0_-2px_0_var(--cobalt)]'
                  : 'text-fg-2 hover:text-fg disabled:hover:text-fg-2'
              )}
            >
              {label}
            </button>
          )
        })}
      </div>
      <div className="ml-auto flex items-center gap-3.5 text-[13px] leading-none font-medium text-fg-2">
        <span
          className={cn(
            'flex items-center gap-1.5 text-[12px] font-normal text-fg-3',
            status && !status.available && 'text-bad'
          )}
        >
          {status?.busy && <span className="size-1.5 animate-pulse rounded-full bg-cobalt" />}
          {freshness(status)}
        </span>
        <UpdatePill state={update} onOpen={onOpenUpdate} />
        <button
          type="button"
          onClick={onOpenFantasy}
          title={hasLeague ? 'Open Companion Fantasy' : 'Import a Sleeper league in Fantasy'}
          className="flex cursor-pointer items-center gap-1.5 hover:text-fg"
        >
          <Mark size={14} />
          Fantasy ↗
        </button>
        <button
          type="button"
          title="Switch theme"
          aria-label="Switch theme"
          onClick={onToggleTheme}
          className="flex size-[30px] cursor-pointer items-center justify-center rounded-[7px] border border-line text-fg-2 hover:bg-hover hover:text-fg"
        >
          <span className="size-[13px] rounded-full border-[1.5px] border-current bg-[linear-gradient(90deg,currentColor_50%,transparent_50%)]" />
        </button>
      </div>
    </nav>
  )
}
