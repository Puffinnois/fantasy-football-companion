import { ArrowLeftRight, BookOpen, ClipboardList, Settings, Trophy, Users } from 'lucide-react'
import { UpdatePill } from '@/components/UpdatePill'
import { cn } from '@/lib/utils'
import type { UpdateState } from '@shared/types'

export type Screen = 'setup' | 'league' | 'rules' | 'players' | 'lineup' | 'trade'

interface SidebarProps {
  current: Screen
  onNavigate: (screen: Screen) => void
  hasLeague: boolean
  update: UpdateState
  version: string | null
  onOpenUpdate: () => void
}

const items: {
  id: Screen
  label: string
  icon: typeof Trophy
  enabled: (hasLeague: boolean) => boolean
}[] = [
  { id: 'league', label: 'League', icon: Trophy, enabled: (hasLeague) => hasLeague },
  { id: 'rules', label: 'Rules', icon: BookOpen, enabled: (hasLeague) => hasLeague },
  { id: 'players', label: 'Players', icon: Users, enabled: (hasLeague) => hasLeague },
  { id: 'lineup', label: 'Lineup', icon: ClipboardList, enabled: (hasLeague) => hasLeague },
  { id: 'trade', label: 'Trade', icon: ArrowLeftRight, enabled: (hasLeague) => hasLeague },
  { id: 'setup', label: 'Setup', icon: Settings, enabled: () => true }
]

export function Sidebar({
  current,
  onNavigate,
  hasLeague,
  update,
  version,
  onOpenUpdate
}: SidebarProps): React.JSX.Element {
  return (
    <nav className="flex w-56 shrink-0 flex-col border-r border-sidebar-border bg-sidebar p-3">
      <div className="mb-6 px-2 pt-2 text-sm font-semibold tracking-wide text-sidebar-foreground/90">
        Fantasy Companion
      </div>
      {items.map(({ id, label, icon: Icon, enabled }) => {
        const isEnabled = enabled(hasLeague)
        return (
          <button
            key={id}
            type="button"
            disabled={!isEnabled}
            onClick={() => onNavigate(id)}
            className={cn(
              'mb-1 flex items-center gap-3 rounded-md px-3 py-2 text-sm transition-colors',
              current === id
                ? 'bg-sidebar-accent text-sidebar-accent-foreground'
                : 'text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground',
              !isEnabled && 'cursor-not-allowed opacity-40 hover:bg-transparent'
            )}
          >
            <Icon className="size-4" />
            {label}
          </button>
        )
      })}
      <div className="mt-auto flex flex-col gap-2 pt-4">
        <UpdatePill state={update} onOpen={onOpenUpdate} />
        {version !== null && (
          <div className="px-2 text-xs text-sidebar-foreground/50">v{version}</div>
        )}
      </div>
    </nav>
  )
}
