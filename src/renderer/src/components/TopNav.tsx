import { useCallback, useEffect, useState } from 'react'
import { Mark } from '@/components/edition'
import { UpdatePill } from '@/components/UpdatePill'
import { api } from '@/lib/api'
import { errorMessage, relativeTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { SyncStatus, UpdateState } from '@shared/types'

export type Screen = 'setup' | 'league' | 'rules' | 'players' | 'lineup' | 'trade' | 'waivers'

const ITEMS: { id: Screen; label: string }[] = [
  { id: 'league', label: 'League' },
  { id: 'players', label: 'Players' },
  { id: 'lineup', label: 'Lineup' },
  { id: 'trade', label: 'Trade' },
  { id: 'waivers', label: 'Waivers' },
  { id: 'rules', label: 'Rules' },
  { id: 'setup', label: 'Setup' }
]

interface TopNavProps {
  current: Screen
  onNavigate: (screen: Screen) => void
  hasLeague: boolean
  update: UpdateState
  version: string | null
  onOpenUpdate: () => void
  theme: 'light' | 'dark'
  onToggleTheme: () => void
  /** Bumped by App when data changed, so the sync line re-reads its status. */
  refreshKey: number
  onRefreshed: () => void
}

/**
 * "● Synced 3 min ago": the last Sleeper sync. Click to refresh now; a current sync error turns
 * the dot red and the tooltip carries the message.
 */
function SyncButton({
  refreshKey,
  onRefreshed
}: {
  refreshKey: number
  onRefreshed: () => void
}): React.JSX.Element {
  const [status, setStatus] = useState<SyncStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback((): void => {
    void api.sync
      .status()
      .then(setStatus)
      .catch((err) => setError(errorMessage(err)))
  }, [])
  useEffect(load, [load, refreshKey])
  useEffect(() => api.sync.onProgress(load), [load])

  async function refresh(): Promise<void> {
    setBusy(true)
    setError(null)
    try {
      await api.sync.refresh(true)
      onRefreshed()
    } catch (err) {
      setError(errorMessage(err))
    } finally {
      setBusy(false)
      load()
    }
  }

  const last = status?.lastError ?? null
  const syncError =
    last !== null && (!status?.lastSleeperSync || last.id > status.lastSleeperSync.id)
      ? `${last.source}: ${last.message}`
      : null
  const problem = error ?? syncError
  const nfl = status?.nflState
    ? `NFL ${status.nflState.season} · week ${status.nflState.displayWeek}`
    : null
  const title = [
    busy ? 'Refreshing…' : 'Refresh now',
    nfl,
    `Sleeper: ${relativeTime(status?.lastSleeperSync?.finishedAt)}`,
    `Stats: ${relativeTime(status?.lastNflverseSync?.finishedAt)}`,
    problem
  ]
    .filter(Boolean)
    .join('\n')

  return (
    <button
      type="button"
      title={title}
      disabled={busy || !status?.activeLeagueId}
      onClick={() => void refresh()}
      className="flex cursor-pointer items-center gap-[7px] hover:text-fg disabled:cursor-default disabled:hover:text-fg-2"
    >
      <span
        className={cn(
          'size-1.5 rounded-full',
          problem ? 'bg-bad' : 'bg-good',
          busy && 'animate-pulse'
        )}
      />
      {busy
        ? 'Syncing…'
        : problem
          ? 'Sync error'
          : `Synced ${relativeTime(status?.lastSleeperSync?.finishedAt)}`}
    </button>
  )
}

/** Fantasy nav (README "Fantasy nav"): mark, seven screens, sync line, update and theme. */
export function TopNav({
  current,
  onNavigate,
  hasLeague,
  update,
  version,
  onOpenUpdate,
  theme,
  onToggleTheme,
  refreshKey,
  onRefreshed
}: TopNavProps): React.JSX.Element {
  return (
    <nav className="flex h-[54px] shrink-0 items-center gap-7 border-b border-line px-8">
      <div
        className="flex items-center gap-[9px]"
        title={version !== null ? `Companion v${version}` : undefined}
      >
        <Mark />
        <span className="text-[15px] leading-none font-semibold tracking-[-0.01em]">Companion</span>
      </div>
      <div className="flex gap-[22px] self-stretch font-cond text-[15px] leading-none font-bold tracking-[0.08em] uppercase">
        {ITEMS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            disabled={!hasLeague && id !== 'setup'}
            aria-current={current === id ? 'page' : undefined}
            onClick={() => onNavigate(id)}
            className={cn(
              'flex cursor-pointer items-center uppercase disabled:cursor-not-allowed disabled:opacity-40',
              current === id
                ? 'text-fg shadow-[inset_0_-3px_0_var(--brand)]'
                : 'text-fg-2 hover:text-fg disabled:hover:text-fg-2'
            )}
          >
            {label}
          </button>
        ))}
      </div>
      <div className="ml-auto flex items-center gap-4 text-[12.5px] leading-none font-medium text-fg-2">
        <UpdatePill state={update} onOpen={onOpenUpdate} />
        {hasLeague && <SyncButton refreshKey={refreshKey} onRefreshed={onRefreshed} />}
        <button
          type="button"
          title={theme === 'dark' ? 'Switch to light' : 'Switch to dark'}
          aria-label="Switch theme"
          onClick={onToggleTheme}
          className="flex size-[30px] cursor-pointer items-center justify-center rounded-full border border-line text-fg-2 hover:border-fg-3 hover:text-fg"
        >
          <span className="size-[13px] rounded-full border-[1.5px] border-current bg-[linear-gradient(90deg,currentColor_50%,transparent_50%)]" />
        </button>
      </div>
    </nav>
  )
}
