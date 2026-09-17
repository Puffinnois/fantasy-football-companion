import { useCallback, useEffect, useState } from 'react'
import { AlertTriangle, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { errorMessage, relativeTime } from '@/lib/format'
import { cn } from '@/lib/utils'
import type { SyncStatus } from '@shared/types'

interface StatusBarProps {
  refreshKey: number
  onRefreshed: () => void
}

export function StatusBar({ refreshKey, onRefreshed }: StatusBarProps): React.JSX.Element {
  const [status, setStatus] = useState<SyncStatus | null>(null)
  const [busy, setBusy] = useState(false)
  const [showError, setShowError] = useState(false)
  const [fetchError, setFetchError] = useState<string | null>(null)
  const [refreshError, setRefreshError] = useState<string | null>(null)

  const load = useCallback((): void => {
    void api.sync
      .status()
      .then((s) => {
        setFetchError(null)
        setStatus(s)
      })
      .catch((err) => setFetchError(errorMessage(err)))
  }, [])

  useEffect(load, [load, refreshKey])
  useEffect(() => api.sync.onProgress(load), [load])

  async function refresh(): Promise<void> {
    setBusy(true)
    setRefreshError(null)
    try {
      await api.sync.refresh(true)
      setShowError(false)
      onRefreshed()
    } catch (err) {
      setRefreshError(errorMessage(err))
    } finally {
      setBusy(false)
      load()
    }
  }

  const error = status?.lastError ?? null
  const errorIsCurrent =
    error !== null && (!status?.lastSleeperSync || error.id > status.lastSleeperSync.id)

  return (
    <footer className="flex h-9 shrink-0 items-center gap-4 border-t bg-sidebar px-4 text-xs text-muted-foreground">
      <span>
        NFL{' '}
        {status?.nflState ? `${status.nflState.season} · week ${status.nflState.displayWeek}` : '—'}
      </span>
      <span>Sleeper: {relativeTime(status?.lastSleeperSync?.finishedAt)}</span>
      <span>Stats: {relativeTime(status?.lastNflverseSync?.finishedAt)}</span>
      {errorIsCurrent && (
        <button
          type="button"
          onClick={() => setShowError((s) => !s)}
          className="flex items-center gap-1 text-destructive"
        >
          <AlertTriangle className="size-3.5" /> sync error
        </button>
      )}
      {errorIsCurrent && showError && error && (
        <span className="truncate text-destructive">
          {error.source}: {error.message}
        </span>
      )}
      {fetchError && <span className="truncate text-destructive">{fetchError}</span>}
      {refreshError && <span className="truncate text-destructive">{refreshError}</span>}
      <Button
        variant="ghost"
        size="sm"
        className="ml-auto h-7 px-2"
        disabled={busy || !status?.activeLeagueId}
        onClick={() => void refresh()}
      >
        <RefreshCw className={cn('size-3.5', busy && 'animate-spin')} /> Refresh
      </Button>
    </footer>
  )
}
